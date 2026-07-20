import { Project, SyntaxKind, StringLiteral, NoSubstitutionTemplateLiteral } from 'ts-morph';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding } from '../types.js';

export interface CodemodSummary {
  file: string;
  variableName: string;
  envVarName: string;
  action: 'extracted' | 'deleted' | 'created';
}

function appendToEnvFile(filePath: string, varName: string, value: string): void {
  let content = '';
  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8');
  }

  // Check if variable already exists
  const linePattern = new RegExp(`^${varName}\\s*=`, 'm');
  if (linePattern.test(content)) {
    // Already defined, don't overwrite/duplicate
    return;
  }

  // Add trailing newline if missing
  if (content && !content.endsWith('\n')) {
    content += '\n';
  }

  content += `${varName}=${value}\n`;
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Apply ts-morph codemods for auto-fixable findings.
 */
export async function applyCodemods(
  findings: Finding[],
  projectRoot: string,
  packageJson: any
): Promise<CodemodSummary[]> {
  const summaries: CodemodSummary[] = [];

  // Ensure .npmrc exists and has legacy-peer-deps=true to avoid remote registry build failures
  const npmrcPath = join(projectRoot, '.npmrc');
  let npmrcContent = '';
  if (existsSync(npmrcPath)) {
    npmrcContent = readFileSync(npmrcPath, 'utf-8');
  }
  if (!npmrcContent.includes('legacy-peer-deps')) {
    if (npmrcContent && !npmrcContent.endsWith('\n')) {
      npmrcContent += '\n';
    }
    npmrcContent += 'legacy-peer-deps=true\n';
    writeFileSync(npmrcPath, npmrcContent, 'utf-8');
    summaries.push({
      file: npmrcPath,
      variableName: '',
      envVarName: '',
      action: 'created',
    });
  }

  // Filter for platform config deletion
  const configFindings = findings.filter(
    (f) => (f.ruleId === 'LOVABLE_CONFIG_001' || f.ruleId === 'BOLT_CONFIG_001') && f.file
  );

  for (const finding of configFindings) {
    const filePath = finding.file;
    if (filePath && existsSync(filePath)) {
      rmSync(filePath, { recursive: true, force: true });
      summaries.push({
        file: filePath,
        variableName: '',
        envVarName: '',
        action: 'deleted',
      });
    }
  }

  // Filter for hardcoded secrets
  const secretFindings = findings.filter(
    (f) => f.ruleId === 'SEC_HARDCODED_SECRET_001' && f.file
  );

  if (secretFindings.length === 0 && configFindings.length === 0 && summaries.length === 0) {
    return [];
  }

  // Detect Vite project
  const allDeps = {
    ...(packageJson?.dependencies ?? {}),
    ...(packageJson?.devDependencies ?? {}),
  };
  const isVite = !!allDeps.vite;

  // Initialize ts-morph project
  const tsConfigPath = join(projectRoot, 'tsconfig.json');
  const project = new Project({
    tsConfigFilePath: existsSync(tsConfigPath) ? tsConfigPath : undefined,
  });

  // If no tsconfig.json, add files manually
  if (!existsSync(tsConfigPath)) {
    const uniqueFiles = Array.from(new Set(secretFindings.map((f) => f.file)));
    for (const f of uniqueFiles) {
      if (existsSync(f)) {
        project.addSourceFileAtPath(f);
      }
    }
  }

  // Ensure gitignore exists and contains .env.local
  const gitignorePath = join(projectRoot, '.gitignore');
  let gitignoreContent = '';
  if (existsSync(gitignorePath)) {
    gitignoreContent = readFileSync(gitignorePath, 'utf-8');
  }
  if (!gitignoreContent.includes('.env.local')) {
    gitignoreContent += '\n.env.local\n';
    writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
  }

  const envLocalPath = join(projectRoot, '.env.local');
  const envExamplePath = join(projectRoot, '.env.example');

  for (const finding of secretFindings) {
    const filePath = finding.file;
    if (!filePath || !existsSync(filePath)) continue;

    const sourceFile = project.getSourceFile(filePath) || project.addSourceFileAtPath(filePath);
    if (!sourceFile) continue;

    // Find all string/template literals on the finding line
    const stringLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral);
    const templateLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral);
    const literals: Array<StringLiteral | NoSubstitutionTemplateLiteral> = [
      ...stringLiterals,
      ...templateLiterals,
    ];

    const matchingNode = literals.find(
      (node) => node.getStartLineNumber() === finding.line
    );

    if (!matchingNode) continue;

    const secretValue = matchingNode.getLiteralValue();

    // Determine variable name
    let varName = 'API_KEY';
    const varDec = matchingNode.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    const propAssign = matchingNode.getFirstAncestorByKind(SyntaxKind.PropertyAssignment);

    if (varDec) {
      varName = varDec.getName();
    } else if (propAssign) {
      varName = propAssign.getName();
    }

    // Clean env variable name
    let cleanVarName = varName.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
    if (isVite && !cleanVarName.startsWith('VITE_')) {
      cleanVarName = `VITE_${cleanVarName}`;
    }

    // Write to env files
    appendToEnvFile(envLocalPath, cleanVarName, secretValue);
    appendToEnvFile(envExamplePath, cleanVarName, '');

    // Replace in source code
    const envReplacement = isVite
      ? `import.meta.env.${cleanVarName}`
      : `process.env.${cleanVarName}`;

    matchingNode.replaceWithText(envReplacement);

    summaries.push({
      file: filePath,
      variableName: varName,
      envVarName: cleanVarName,
      action: 'extracted',
    });
  }

  // Save changes to disk
  await project.save();

  return summaries;
}
