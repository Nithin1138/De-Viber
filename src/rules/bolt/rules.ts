/**
 * Bolt-Specific Lock-In Rules
 *
 * These rules detect vendor lock-in patterns specific to projects exported
 * from Bolt (bolt.new / StackBlitz). They run only when the platform is detected
 * as Bolt (or when the user overrides with --platform bolt).
 *
 * VALIDATION STATUS:
 * - BOLT_CONFIG_001: Validated against a real Bolt export (contains .bolt/ directory).
 * - BOLT_SCOPED_DEP_001: UNVALIDATED — based on documentation, not yet confirmed against a real Bolt export.
 * - BOLT_RUNTIME_ASSUMPTION_001: UNVALIDATED — based on documentation, not yet confirmed against a real Bolt export.
 */

import type { Rule, RuleContext, Finding } from '../../types.js';
import { join } from 'node:path';

let findingCounter = 0;
function nextFindingId(ruleId: string): string {
  return `${ruleId}-${++findingCounter}`;
}

/**
 * BOLT_SCOPED_DEP_001
 *
 * Detects Bolt or StackBlitz-specific package dependencies in package.json.
 *
 * UNVALIDATED — based on documentation, not yet confirmed against a real Bolt export.
 */
const boltScopedDeps: Rule = {
  id: 'BOLT_SCOPED_DEP_001',
  name: 'Bolt-Scoped Package Dependencies',
  category: 'portability',
  severity: 'high',
  confidence: 'medium',
  platform: 'bolt',
  autoFixable: false,
  requiresNetwork: false,
  detect(context: RuleContext): Finding[] {
    const pkg = context.packageJson;
    if (!pkg) return [];

    const findings: Finding[] = [];
    const allDeps: Record<string, string> = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };

    for (const [depName, version] of Object.entries(allDeps)) {
      if (
        depName.startsWith('@stackblitz/') ||
        depName.startsWith('@bolt/') ||
        depName === 'bolt-tagger'
      ) {
        const depType = pkg.dependencies?.[depName]
          ? 'dependency'
          : 'devDependency';

        findings.push({
          id: nextFindingId('BOLT_SCOPED_DEP_001'),
          ruleId: 'BOLT_SCOPED_DEP_001',
          ruleName: 'Bolt-Scoped Package Dependencies',
          category: 'portability',
          severity: 'high',
          confidence: 'medium',
          file: join(context.projectRoot, 'package.json'),
          message: `Found Bolt/StackBlitz-specific package: ${depName}@${version} (${depType})`,
          userActionableMessage:
            `Your project depends on "${depName}" which is specific to Bolt or StackBlitz. ` +
            `This dependency may not be useful or function properly when hosted elsewhere. ` +
            `Consider finding an open-source equivalent or removing it.`,
          autoFixable: false,
          evidence: `"${depName}": "${version}"`,
        });
      }
    }

    return findings;
  },
};

/**
 * BOLT_CONFIG_001
 *
 * Detects Bolt-specific configuration files or directories (like .bolt/).
 *
 * Validated: Yes (for .bolt/ directory).
 */
const boltConfig: Rule = {
  id: 'BOLT_CONFIG_001',
  name: 'Bolt-Specific Configuration Files',
  category: 'portability',
  severity: 'medium',
  confidence: 'high',
  platform: 'bolt',
  autoFixable: false,
  requiresNetwork: false,
  detect(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const configPatterns = [
      'bolt.config.ts',
      'bolt.config.js',
      'bolt.config.json',
    ];

    // Check for config files
    for (const file of context.files) {
      if (configPatterns.includes(file)) {
        findings.push({
          id: nextFindingId('BOLT_CONFIG_001'),
          ruleId: 'BOLT_CONFIG_001',
          ruleName: 'Bolt-Specific Configuration Files',
          category: 'portability',
          severity: 'medium',
          confidence: 'high',
          file: join(context.projectRoot, file),
          message: `Found Bolt-specific config file: ${file}`,
          userActionableMessage:
            `The file "${file}" is a Bolt-specific configuration file. ` +
            `Standard hosting environments won't recognize it. You can safely remove it ` +
            `after migrating any custom build/preview configurations to your target platform.`,
          autoFixable: false,
          evidence: file,
        });
      }
    }

    // Check for .bolt directory
    const hasBoltDir = context.files.some(
      (f) => f.startsWith('.bolt/') || f.startsWith('.bolt\\')
    );
    if (hasBoltDir) {
      findings.push({
        id: nextFindingId('BOLT_CONFIG_001'),
        ruleId: 'BOLT_CONFIG_001',
        ruleName: 'Bolt-Specific Configuration Files',
        category: 'portability',
        severity: 'medium',
        confidence: 'high',
        file: join(context.projectRoot, '.bolt'),
        message: 'Found .bolt/ directory with Bolt-specific files',
        userActionableMessage:
          'Your project contains a ".bolt/" directory with Bolt-specific files. ' +
          'This directory is used by Bolt\'s internal environment and is not needed ' +
          'when deployed elsewhere. You can safely remove it.',
        autoFixable: false,
        evidence: '.bolt/',
      });
    }

    return findings;
  },
};

/**
 * BOLT_RUNTIME_ASSUMPTION_001
 *
 * Detects StackBlitz WebContainer-specific code assumptions or Netlify coupling.
 *
 * UNVALIDATED — based on documentation, not yet confirmed against a real Bolt export.
 */
const boltRuntimeAssumption: Rule = {
  id: 'BOLT_RUNTIME_ASSUMPTION_001',
  name: 'WebContainer Runtime Assumptions',
  category: 'portability',
  severity: 'medium',
  confidence: 'medium',
  platform: 'bolt',
  autoFixable: false,
  requiresNetwork: false,
  detect: async function (context: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const targetFiles = context.files.filter(
      (f) =>
        f.endsWith('.ts') ||
        f.endsWith('.tsx') ||
        f.endsWith('.js') ||
        f.endsWith('.jsx')
    );

    const containerPattern = /stackblitz|webcontainer/gi;

    for (const file of targetFiles) {
      const content = await context.readFile(file);
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        containerPattern.lastIndex = 0;
        const match = containerPattern.exec(lines[i]);
        if (match) {
          findings.push({
            id: nextFindingId('BOLT_RUNTIME_ASSUMPTION_001'),
            ruleId: 'BOLT_RUNTIME_ASSUMPTION_001',
            ruleName: 'WebContainer Runtime Assumptions',
            category: 'portability',
            severity: 'medium',
            confidence: 'medium',
            file: join(context.projectRoot, file),
            line: i + 1,
            message: `Found WebContainer runtime reference: ${match[0]}`,
            userActionableMessage:
              `Your project references "${match[0]}" in source code. ` +
              `This may indicate code built with assumptions about running inside a StackBlitz ` +
              `WebContainer environment. Please review this code to ensure it functions correctly ` +
              `in a standard browser and server environment.`,
            autoFixable: false,
            evidence: lines[i].trim(),
          });
        }
      }
    }

    return findings;
  },
};

/** All Bolt platform-specific rules. */
export const boltRules: Rule[] = [
  boltScopedDeps,
  boltConfig,
  boltRuntimeAssumption,
];
