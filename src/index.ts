#!/usr/bin/env node

/**
 * deviber-cli — Entry Point
 *
 * A local-first CLI that scans AI-app-builder exports (Lovable, Bolt, Replit)
 * for vendor lock-in and security issues.
 *
 * TRUST MODEL:
 * - Operates exclusively on code the user has already exported
 * - Never makes network calls to Bolt, Lovable, Replit, or any AI platform
 * - The only network call is to the public npm registry for dependency checks
 * - That call is skippable with --offline
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fg from 'fast-glob';
import { readFile, writeFile, access, rm } from 'node:fs/promises';
import { resolve, basename, join } from 'node:path';
import { createRequire } from 'node:module';

import type {
  ScanOptions,
  Platform,
  RuleContext,
  PackageJsonData,
} from './types.js';
import { detectPlatform } from './detectors/platformDetector.js';
import { runRules } from './rules/engine.js';
import { lovableRules } from './rules/lovable/rules.js';
import { securityRules } from './rules/universal/security.rules.js';
import { dependencyRules } from './rules/universal/dependencies.js';
import { DockerVerifier } from './verifier/dockerVerifier.js';
import {
  generateReport,
  renderMarkdown,
  renderJson,
} from './report/generate.js';
import { applyCodemods } from './transformer/codemodEngine.js';
import { simpleGit } from 'simple-git';

// ─── Version ────────────────────────────────────────────────────────────────

// Read version from package.json at runtime
function getVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0-unknown';
  }
}

const CLI_VERSION = getVersion();

// ─── Disclaimer ─────────────────────────────────────────────────────────────

const DISCLAIMER = `
${chalk.yellow('⚠️  Disclaimer')}
${chalk.dim('─'.repeat(60))}
This tool is provided ${chalk.bold('"as-is"')} with no warranty. It uses
heuristics and pattern matching that may produce false positives
or miss real issues. Always verify findings manually before
making changes to your project.

This tool ${chalk.bold('never')} contacts Lovable, Bolt, Replit, or any AI
platform's servers. The only optional network call goes to the
public npm registry to check for hallucinated dependencies.
Use ${chalk.cyan('--offline')} to skip even that.
${chalk.dim('─'.repeat(60))}
`;

// ─── File Helpers ───────────────────────────────────────────────────────────

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (error: unknown) {
    // Binary files, permission errors, etc. — return null, don't crash
    return null;
  }
}

async function loadPackageJson(projectRoot: string): Promise<PackageJsonData | null> {
  const content = await safeReadFile(join(projectRoot, 'package.json'));
  if (!content) return null;
  try {
    return JSON.parse(content) as PackageJsonData;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      chalk.yellow(`⚠ Could not parse package.json: ${message}`)
    );
    console.warn(
      chalk.dim(
        '  This may indicate a malformed package.json. Some checks will be skipped.'
      )
    );
    return null;
  }
}

// ─── Analyse Command ────────────────────────────────────────────────────────

async function analyse(targetPath: string, options: {
  offline: boolean;
  platform?: string;
  output?: string;
  format: string;
}): Promise<void> {
  const projectRoot = resolve(targetPath);

  // Validate target path exists
  if (!(await pathExists(projectRoot))) {
    console.error(
      chalk.red(`\n✖ Cannot find project at: ${projectRoot}\n`)
    );
    console.error(
      chalk.dim(
        'Make sure the path points to a directory containing your exported project.\n' +
        'Example: deviber analyse ./my-project\n'
      )
    );
    process.exit(1);
  }

  // Validate it looks like a project (has at least some files)
  const pkgJsonPath = join(projectRoot, 'package.json');
  if (!(await pathExists(pkgJsonPath))) {
    console.warn(
      chalk.yellow(
        `\n⚠ No package.json found at: ${projectRoot}\n` +
        '  This tool works best on Node.js/TypeScript projects.\n' +
        '  Continuing with limited checks...\n'
      )
    );
  }

  // Print disclaimer
  console.log(DISCLAIMER);

  // Discover files
  console.log(chalk.cyan('📂 Scanning project files...'));
  let files: string[];
  try {
    files = await fg('**/*', {
      cwd: projectRoot,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**',
        '**/*.min.js',
        '**/*.min.css',
        '**/*.map',
        '**/*.lock',
        '**/package-lock.json',
      ],
      dot: true,
      onlyFiles: true,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      chalk.red(`\n✖ Failed to scan project files: ${message}\n`)
    );
    console.error(
      chalk.dim(
        'This might be a permissions issue. Make sure you have read access to the project directory.\n'
      )
    );
    process.exit(1);
  }

  console.log(chalk.dim(`  Found ${files.length} files`));

  // Load package.json
  const packageJson = await loadPackageJson(projectRoot);
  const projectName =
    (packageJson?.name as string) ?? basename(projectRoot);

  // Detect platform
  console.log(chalk.cyan('\n🔍 Detecting platform...'));
  const platformOverride = options.platform as Platform | undefined;
  const platformDetection = platformOverride
    ? {
        platform: platformOverride,
        confidence: 'high' as const,
        signals: [{ type: 'manual override', detail: `--platform ${platformOverride}`, weight: 10 }],
      }
    : await detectPlatform(projectRoot, files);

  if (platformDetection.platform === 'unknown') {
    console.log(
      chalk.yellow(
        '  Could not identify a specific AI app-builder platform.\n' +
        '  Running universal security checks only.\n' +
        '  If you know the platform, use --platform <lovable|bolt|replit>\n'
      )
    );
  } else {
    const confLabel =
      platformDetection.confidence === 'high'
        ? chalk.green('high confidence')
        : platformDetection.confidence === 'medium'
          ? chalk.yellow('medium confidence')
          : chalk.red('low confidence');

    console.log(
      `  Detected: ${chalk.bold(platformDetection.platform)} (${confLabel})`
    );

    if (platformDetection.confidence !== 'high') {
      console.log(
        chalk.dim(
          '  If this detection is wrong, re-run with --platform <name>\n'
        )
      );
    }

    // Print signals
    for (const signal of platformDetection.signals) {
      console.log(chalk.dim(`    ▸ ${signal.type}: ${signal.detail}`));
    }
  }

  // Build rule context
  const context: RuleContext = {
    projectRoot,
    files,
    readFile: (relativePath: string) => safeReadFile(join(projectRoot, relativePath)),
    packageJson,
    offline: options.offline,
    detectedPlatform: platformDetection,
  };

  // Assemble rules
  const allRules = [
    ...lovableRules,
    ...securityRules,
    ...dependencyRules,
  ];

  // Run rules
  console.log(chalk.cyan('\n🔎 Running analysis rules...'));
  if (options.offline) {
    console.log(chalk.dim('  (offline mode — skipping network-dependent checks)'));
  }

  const { findings, skippedRules, failedRules } = await runRules(
    allRules,
    context
  );

  // Report failed rules
  if (failedRules.length > 0) {
    console.warn(
      chalk.yellow(`\n⚠ ${failedRules.length} rule(s) failed during execution:`)
    );
    for (const failed of failedRules) {
      console.warn(chalk.dim(`  ▸ ${failed.ruleId}: ${failed.error}`));
    }
  }

  // Generate report
  console.log(chalk.cyan('\n📊 Generating report...'));
  const report = generateReport({
    projectName,
    platformDetection,
    findings,
    skippedRules,
    failedRules,
    filesScanned: files.length,
    cliVersion: CLI_VERSION,
  });

  // Render output
  const format = options.format as 'markdown' | 'json';
  const output =
    format === 'json' ? renderJson(report) : renderMarkdown(report);

  if (options.output) {
    try {
      await writeFile(options.output, output, 'utf-8');
      console.log(
        chalk.green(`\n✅ Report saved to: ${options.output}`)
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        chalk.red(`\n✖ Failed to save report: ${message}`)
      );
      console.error(chalk.dim('Printing report to stdout instead:\n'));
      console.log(output);
    }
  } else {
    console.log('\n');
    console.log(output);
  }

  // Print summary
  console.log(chalk.dim('─'.repeat(60)));
  console.log(
    `Portability: ${chalk.bold(String(report.portabilityScore.score) + '/100')} (${report.portabilityScore.grade})  |  ` +
    `Security: ${chalk.bold(String(report.securityScore.score) + '/100')} (${report.securityScore.grade})  |  ` +
    `Findings: ${chalk.bold(String(report.summary.totalFindings))}`
  );

  if (report.summary.criticalCount > 0) {
    console.log(
      chalk.red(
        `\n🔴 ${report.summary.criticalCount} CRITICAL issue(s) found — address these before going to production.`
      )
    );
  }
  console.log('');
}

async function verify(targetPath: string, options: {
  baseline?: string;
  timeout: string;
  cleanup: boolean;
}): Promise<void> {
  const verifier = new DockerVerifier();

  if (options.cleanup) {
    console.log(chalk.cyan('🧹 Cleaning up orphaned deviber-verify containers and images...'));
    try {
      await verifier.checkDockerStatus();
      await verifier.cleanOrphanedResources();
      console.log(chalk.green('✅ Cleanup completed.'));
    } catch (error: any) {
      console.error(chalk.red(`✖ Cleanup failed: ${error.message}`));
      process.exit(1);
    }
    return;
  }

  const projectRoot = resolve(targetPath);
  if (!(await pathExists(projectRoot))) {
    console.error(chalk.red(`\n✖ Cannot find project at: ${projectRoot}\n`));
    process.exit(1);
  }

  console.log(chalk.cyan('🐳 Initializing Docker Verifier...'));
  try {
    await verifier.checkDockerStatus();
  } catch (error: any) {
    console.error(chalk.red(`\n✖ Docker check failed:\n${error.message}\n`));
    process.exit(1);
  }

  const timeoutSeconds = parseInt(options.timeout, 10) || 180;
  const packageJson = await loadPackageJson(projectRoot);
  const projectName = (packageJson?.name as string) ?? basename(projectRoot);

  let baselineResult: any = undefined;
  let tempDest: string | undefined = undefined;

  try {
    if (options.baseline) {
      console.log(chalk.cyan(`\ngit [baseline] Extracting baseline ref "${options.baseline}"...`));
      tempDest = join(projectRoot, `.deviber-verify-temp-${Date.now()}`);
      await verifier.extractGitRef(projectRoot, options.baseline, tempDest);

      console.log(chalk.cyan('\n🐳 Verifying baseline version...'));
      baselineResult = await verifier.verifyPath(tempDest, projectName, 'baseline', timeoutSeconds);
      if (!baselineResult.built) {
        console.warn(chalk.yellow(`⚠ Baseline build failed: ${baselineResult.buildError}`));
      }
    }

    console.log(chalk.cyan('\n🐳 Verifying current version...'));
    const currentResult = await verifier.verifyPath(projectRoot, projectName, 'current', timeoutSeconds);

    console.log(chalk.cyan('\n📊 Comparing results...'));
    const diff = verifier.compare(baselineResult, currentResult);

    console.log(chalk.dim('─'.repeat(60)));
    if (diff.pass) {
      console.log(chalk.green('✅ VERIFY PASS: No regressions detected!'));
    } else {
      console.log(chalk.red('❌ VERIFY FAIL: Regressions detected!'));
      console.log('\nDetails of regressions:');
      for (const reg of diff.regressions) {
        console.log(chalk.red(`  - ${reg}`));
      }
    }
    console.log(chalk.dim('─'.repeat(60)));

    if (currentResult.built) {
      console.log(`Current Version:`);
      console.log(`  Build: Success`);
      if (currentResult.testPassed !== undefined) {
        console.log(`  Tests: ${currentResult.testPassed ? chalk.green('Passed') : chalk.red('Failed')} (${currentResult.testPassedCount} passed, ${currentResult.testFailedCount} failed)`);
      }
      if (currentResult.routesChecked.length > 0) {
        console.log(`  Routes pinged:`);
        for (const r of currentResult.routesChecked) {
          const status = r.success ? chalk.green(`HTTP ${r.statusCode}`) : chalk.red(`Failed: ${r.error}`);
          console.log(`    - ${r.route} : ${status}`);
        }
      }
    } else {
      console.log(chalk.red(`Current Version failed to build: ${currentResult.buildError}`));
    }

    if (!diff.pass) {
      process.exit(1);
    }
  } finally {
    if (tempDest) {
      await rm(tempDest, { recursive: true, force: true }).catch(() => {});
    }
  }
}

async function transform(targetPath: string, options: {
  timeout: string;
}): Promise<void> {
  const projectRoot = resolve(targetPath);
  if (!(await pathExists(projectRoot))) {
    console.error(chalk.red(`\n✖ Cannot find project at: ${projectRoot}\n`));
    process.exit(1);
  }

  // 1. Verify Git workspace is clean
  const git = simpleGit(projectRoot);
  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      console.error(
        chalk.red('\n✖ Project must be a Git repository to run transform.\n')
      );
      process.exit(1);
    }
  } catch (err: any) {
    console.error(chalk.red(`\n✖ Git verification failed: ${err.message}\n`));
    process.exit(1);
  }

  const status = await git.status();
  const hasTrackedChanges =
    status.staged.length > 0 ||
    status.modified.length > 0 ||
    status.deleted.length > 0 ||
    status.renamed.length > 0;

  if (hasTrackedChanges) {
    console.error(
      chalk.red(
        '\n✖ Git working directory has uncommitted changes.\n' +
        '  Please commit or stash your changes before running transform.\n'
      )
    );
    process.exit(1);
  }

  const currentBranchResult = await git.branch();
  const currentBranch = currentBranchResult.current;
  if (!currentBranch) {
    console.error(chalk.red('\n✖ Could not identify the current Git branch.\n'));
    process.exit(1);
  }

  const timestamp = Date.now();
  const backupBranch = `deviber-backup-${timestamp}`;

  console.log(chalk.cyan(`\n📦 Creating backup branch: ${backupBranch}...`));
  try {
    await git.checkoutLocalBranch(backupBranch);
    // Switch back to the active branch to perform transforms
    await git.checkout(currentBranch);
  } catch (err: any) {
    console.error(chalk.red(`\n✖ Failed to create backup branch: ${err.message}\n`));
    process.exit(1);
  }

  // 2. Discover files
  let files: string[];
  try {
    files = await fg('**/*', {
      cwd: projectRoot,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**',
        '**/*.min.js',
        '**/*.min.css',
        '**/*.map',
        '**/*.lock',
        '**/package-lock.json',
      ],
      dot: true,
      onlyFiles: true,
    });
  } catch (err: any) {
    console.error(chalk.red(`\n✖ Failed to scan project files: ${err.message}\n`));
    process.exit(1);
  }

  const packageJson = await loadPackageJson(projectRoot);

  // 3. Detect platform and run scan rules
  const platformDetection = await detectPlatform(projectRoot, files);
  const context: RuleContext = {
    projectRoot,
    files,
    readFile: (relativePath: string) => safeReadFile(join(projectRoot, relativePath)),
    packageJson,
    offline: true, // run transform completely offline
    detectedPlatform: platformDetection,
  };

  const allRules = [
    ...lovableRules,
    ...securityRules,
    ...dependencyRules,
  ];

  console.log(chalk.cyan('🔍 Scanning for auto-fixable findings...'));
  const { findings } = await runRules(allRules, context);

  const fixableFindings = findings.filter(f => f.autoFixable);
  if (fixableFindings.length === 0) {
    console.log(chalk.green('\n✅ No auto-fixable findings found. Nothing to transform!'));
    return;
  }

  console.log(chalk.cyan(`\n⚡ Applying codemods for ${fixableFindings.length} auto-fixable findings...`));
  let summaries;
  try {
    summaries = await applyCodemods(fixableFindings, projectRoot, packageJson);
  } catch (err: any) {
    console.error(chalk.red(`\n✖ Failed to apply codemods: ${err.message}\n`));
    // Rollback changes
    console.log(chalk.yellow('🔄 Rolling back to backup branch...'));
    await git.reset(['--hard', backupBranch]);
    process.exit(1);
  }

  if (summaries.length === 0) {
    console.log(chalk.green('\n✅ No changes were made by codemods.'));
    return;
  }

  // 4. Verify post-transform version
  console.log(chalk.cyan('\n🐳 Running Docker verification to confirm safety...'));
  const verifier = new DockerVerifier();
  try {
    await verifier.checkDockerStatus();
  } catch (error: any) {
    console.error(chalk.red(`\n✖ Docker check failed:\n${error.message}\n`));
    console.log(chalk.yellow('🔄 Rolling back to backup branch...'));
    await git.reset(['--hard', backupBranch]);
    process.exit(1);
  }

  const timeoutSeconds = parseInt(options.timeout, 10) || 180;
  const projectName = (packageJson?.name as string) ?? basename(projectRoot);

  let currentResult;
  try {
    currentResult = await verifier.verifyPath(projectRoot, projectName, 'current', timeoutSeconds);
  } catch (err: any) {
    console.error(chalk.red(`\n✖ Verification failed with unexpected error: ${err.message}`));
    console.log(chalk.yellow('🔄 Rolling back to backup branch...'));
    await git.reset(['--hard', backupBranch]);
    process.exit(1);
  }

  if (!currentResult.built || (currentResult.testPassed === false)) {
    console.error(chalk.red('\n✖ Post-transform version failed verification!'));
    if (!currentResult.built) {
      console.error(chalk.red(`  Reason: Build failed: ${currentResult.buildError}`));
    } else {
      console.error(chalk.red(`  Reason: Tests failed (${currentResult.testFailedCount} failures)`));
    }
    console.log(chalk.yellow('\n🔄 Rolling back changes to original state...'));
    await git.reset(['--hard', backupBranch]);
    process.exit(1);
  }

  // Check route failures as well (if any failed)
  const failedRoute = currentResult.routesChecked.find(r => !r.success);
  if (failedRoute) {
    console.error(chalk.red(`\n✖ Post-transform version failed verification!`));
    console.error(chalk.red(`  Reason: Route ping failed for "${failedRoute.route}": ${failedRoute.error}`));
    console.log(chalk.yellow('\n🔄 Rolling back changes to original state...'));
    await git.reset(['--hard', backupBranch]);
    process.exit(1);
  }

  // 5. Produce a plain language diff summary
  console.log(chalk.dim('═'.repeat(60)));
  console.log(chalk.green('✨ TRANSFORM SUCCESS: All changes successfully verified!'));
  console.log(chalk.dim('─'.repeat(60)));
  console.log('Plain-Language Summary of Changes:');
  const groupedByFile = new Map<string, typeof summaries>();
  for (const s of summaries) {
    if (!groupedByFile.has(s.file)) {
      groupedByFile.set(s.file, []);
    }
    groupedByFile.get(s.file)!.push(s);
  }

  for (const [file, items] of groupedByFile.entries()) {
    const relativeFile = file.startsWith(projectRoot)
      ? file.slice(projectRoot.length + 1)
      : file;
    console.log(`\n📄 ${chalk.bold(relativeFile)}:`);
    for (const item of items) {
      if (item.action === 'extracted') {
        console.log(
          `  • Extracted hardcoded secret variable "${chalk.yellow(item.variableName)}" into ` +
          `environment variable "${chalk.green(item.envVarName)}".`
        );
      }
    }
  }

  console.log(`\n🔒 Secrets have been safely appended to:`);
  console.log(`  • ${chalk.bold('.env.local')} (local secrets, git-ignored)`);
  console.log(`  • ${chalk.bold('.env.example')} (placeholder template)`);
  console.log(chalk.dim('─'.repeat(60)));
  console.log(chalk.cyan(`\nOriginal code is saved on backup branch: ${backupBranch}\n`));
}

// ─── CLI Setup ──────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('deviber')
  .description(
    'Scan AI-app-builder exports for vendor lock-in and security issues.\n\n' +
    'Supports projects exported from Lovable, Bolt, and Replit.\n' +
    'Operates entirely locally — never contacts platform servers.'
  )
  .version(CLI_VERSION);

program
  .command('analyse')
  .alias('analyze') // Because American spelling is common
  .description('Scan a project for portability and security issues (read-only, safe)')
  .argument('<path>', 'Path to the exported project directory')
  .option('--offline', 'Skip network-dependent checks (npm registry)', false)
  .option(
    '--platform <name>',
    'Override auto-detected platform (lovable, bolt, replit)'
  )
  .option(
    '--output <path>',
    'Save report to a file instead of printing to stdout'
  )
  .option(
    '--format <type>',
    'Output format: markdown or json',
    'markdown'
  )
  .action(async (targetPath: string, opts: Record<string, unknown>) => {
    try {
      await analyse(targetPath, {
        offline: opts.offline as boolean,
        platform: opts.platform as string | undefined,
        output: opts.output as string | undefined,
        format: (opts.format as string) || 'markdown',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        chalk.red(`\n✖ Unexpected error during analysis: ${message}\n`)
      );
      console.error(
        chalk.dim(
          'If this keeps happening, please report it at:\n' +
          'https://github.com/your-org/deviber-cli/issues\n'
        )
      );
      process.exit(1);
    }
  });

program
  .command('verify')
  .description('Verify a project builds and tests in Docker, comparing against git baseline')
  .argument('[path]', 'Path to the project directory', '.')
  .option('--baseline <ref>', 'Git ref to compare against (e.g. HEAD, main)')
  .option('--timeout <seconds>', 'Timeout in seconds per verify stage', '180')
  .option('--cleanup', 'Stop and clean up orphaned deviber-verify containers/images')
  .action(async (targetPath: string, opts: Record<string, unknown>) => {
    try {
      await verify(targetPath || '.', {
        baseline: opts.baseline as string | undefined,
        timeout: opts.timeout as string,
        cleanup: opts.cleanup as boolean,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        chalk.red(`\n✖ Unexpected error during verification: ${message}\n`)
      );
      process.exit(1);
    }
  });

program
  .command('transform')
  .description('Extract auto-fixable findings into clean configurations and verify safety')
  .argument('[path]', 'Path to the project directory', '.')
  .option('--timeout <seconds>', 'Timeout in seconds for Docker verification stage', '180')
  .action(async (targetPath: string, opts: Record<string, unknown>) => {
    try {
      await transform(targetPath || '.', {
        timeout: opts.timeout as string,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        chalk.red(`\n✖ Unexpected error during transformation: ${message}\n`)
      );
      process.exit(1);
    }
  });

program.parse();
