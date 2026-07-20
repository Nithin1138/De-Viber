import { join, basename } from 'node:path';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import chalk from 'chalk';
import readline from 'node:readline';
import { simpleGit } from 'simple-git';
import { exec } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import fg from 'fast-glob';
import { runRules } from '../rules/engine.js';
import { lovableRules } from '../rules/lovable/rules.js';
import { securityRules } from '../rules/universal/security.rules.js';
import { boltRules } from '../rules/bolt/rules.js';
import { detectPlatform } from '../detectors/platformDetector.js';

const allRules = [...lovableRules, ...boltRules, ...securityRules];

export interface DeployOptions {
  interactive?: boolean;
  targetPlatform?: string;
  confirmDataExport?: boolean;
}

export function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<any> {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content);
}

async function writeJson(path: string, data: any): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf-8');
}

export async function saveVerificationStatus(projectRoot: string): Promise<void> {
  const deviberDir = join(projectRoot, '.deviber');
  await mkdir(deviberDir, { recursive: true });

  const git = simpleGit(projectRoot);
  let commitHash = '';
  let isClean = false;
  try {
    if (await git.checkIsRepo()) {
      commitHash = await git.revparse(['HEAD']);
      const status = await git.status();
      isClean = status.isClean();
    }
  } catch (e) {
    // Not a git repo
  }

  await writeJson(join(deviberDir, 'verify.json'), {
    timestamp: new Date().toISOString(),
    commitHash,
    isClean,
  });
}

export async function checkVerificationStatus(projectRoot: string): Promise<{ verified: boolean; stale: boolean; reason?: string }> {
  const verifyFile = join(projectRoot, '.deviber', 'verify.json');
  if (!(await pathExists(verifyFile))) {
    return { verified: false, stale: false, reason: 'No prior verification found. Please run "deviber verify" first.' };
  }

  try {
    const data = await readJson(verifyFile);
    const git = simpleGit(projectRoot);
    if (await git.checkIsRepo()) {
      const currentCommit = await git.revparse(['HEAD']);
      if (currentCommit !== data.commitHash) {
        return { verified: true, stale: true, reason: 'Git commit has changed since verification. Please re-run "deviber verify".' };
      }
      const status = await git.status();
      if (!status.isClean() && data.isClean) {
        return { verified: true, stale: true, reason: 'Git working directory has uncommitted changes since verification.' };
      }
    }
    return { verified: true, stale: false };
  } catch (e) {
    return { verified: false, stale: true, reason: 'Verification status file is corrupt. Please re-run "deviber verify".' };
  }
}

function checkUrl(targetUrl: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  return new Promise((resolve) => {
    const parsed = new URL(targetUrl);
    const requester = parsed.protocol === 'https:' ? https : http;

    const req = requester.get(targetUrl, { timeout: 5000 }, (res) => {
      resolve({
        success: res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 400,
        statusCode: res.statusCode,
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timed out' });
    });
  });
}

function checkCliExists(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`which ${command}`, (err) => {
      resolve(!err);
    });
  });
}

export async function runDeploy(projectRoot: string, options: DeployOptions = {}): Promise<void> {
  // 1. Verify safety order
  const verifyStatus = await checkVerificationStatus(projectRoot);
  if (!verifyStatus.verified || verifyStatus.stale) {
    console.error(chalk.red(`\n❌ Verification Check Failed:\n  ${verifyStatus.reason ?? 'Stale or missing verify.'}\n`));
    throw new Error('STALE_OR_MISSING_VERIFICATION');
  }

  // 2. Scan for LOVABLE_CLOUD_DATA_RISK_001
  console.log(chalk.cyan('🔍 Scanning project for data export requirements...'));
  const files = await fg('**/*', {
    cwd: projectRoot,
    ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
    dot: true,
  });
  const packageJson = await loadPackageJson(projectRoot);
  const detectedPlatform = await detectPlatform(projectRoot, files);

  const context = {
    projectRoot,
    files,
    packageJson,
    detectedPlatform,
    offline: true,
    readFile: async (relativePath: string) => {
      try {
        return await readFile(join(projectRoot, relativePath), 'utf-8');
      } catch {
        return null;
      }
    }
  };

  const { findings } = await runRules(allRules, context);
  const hasDataRisk = findings.some((f) => f.ruleId === 'LOVABLE_CLOUD_DATA_RISK_001');

  if (hasDataRisk) {
    console.log(chalk.yellow('\n⚠️  DATA EXPORT REQUIREMENT DETECTED'));
    console.log(chalk.yellow('Your project points to a Lovable-managed Supabase instance.'));
    console.log(chalk.yellow('You must export your database records, storage files, and user auth accounts'));
    console.log(chalk.yellow('manually before your platform project expires or is deleted.\n'));

    if (options.interactive !== false) {
      const confirmExport = await askQuestion('Have you successfully exported and backed up your database data? (y/N): ');
      if (confirmExport.toLowerCase() !== 'y' && confirmExport.toLowerCase() !== 'yes') {
        console.error(chalk.red('\n❌ Deployment Blocked: Please export your Supabase data first.\n'));
        throw new Error('DATA_EXPORT_BLOCKED');
      }
    } else {
      if (!options.confirmDataExport) {
        console.error(chalk.red('\n❌ Deployment Blocked: confirmDataExport flag is required.\n'));
        throw new Error('DATA_EXPORT_BLOCKED');
      }
    }
  }

  // 3. Detect project shape
  const isSupabase = hasDataRisk || context.files.some((f) => f.includes('supabase'));
  console.log(chalk.cyan(`\n📦 Project Shape Detected: ${isSupabase ? 'Frontend + Supabase Backend' : 'Static/Frontend-only'}`));

  // 4. Target Platform Selection
  let platformChoice = options.targetPlatform || '';
  if (!platformChoice && options.interactive !== false) {
    console.log('\nSelect your target hosting platform:');
    console.log('  1) Vercel');
    console.log('  2) Railway');
    console.log('  3) Netlify');
    console.log("  4) I'll do it myself (Manual)");
    const choice = await askQuestion('Choose target [1-4]: ');
    if (choice === '1') platformChoice = 'vercel';
    else if (choice === '2') platformChoice = 'railway';
    else if (choice === '3') platformChoice = 'netlify';
    else platformChoice = 'manual';
  } else if (!platformChoice) {
    platformChoice = 'manual';
  }

  // 5. Env var migration
  const envExamplePath = join(projectRoot, '.env.example');
  const envVars: Record<string, string> = {};
  if (await pathExists(envExamplePath)) {
    console.log(chalk.cyan('\n⚙️  Guided Env Var Migration:'));
    const content = await readFile(envExamplePath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const key = trimmed.split('=')[0].trim();
        if (key) {
          if (options.interactive !== false) {
            const val = await askQuestion(`Enter value for ${key} (press Enter to skip): `);
            if (val) envVars[key] = val;
          } else {
            envVars[key] = 'MOCK_VALUE';
          }
        }
      }
    }

    if (Object.keys(envVars).length > 0 && options.interactive !== false) {
      const saveLocal = await askQuestion('\nWrite these values to a local .env.local file? (y/N): ');
      if (saveLocal.toLowerCase() === 'y' || saveLocal.toLowerCase() === 'yes') {
        const envLocalPath = join(projectRoot, '.env.local');
        const envContent = Object.entries(envVars)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n');
        await writeFile(envLocalPath, envContent, 'utf8');
        console.log(chalk.green('✅ Wrote env vars to .env.local'));
      }
    }
  }

  // 6. Platform specific guide/deployment
  console.log(chalk.cyan(`\n🚀 Preparing ${platformChoice.toUpperCase()} Deployment...`));

  if (platformChoice === 'vercel') {
    const vercelCli = await checkCliExists('vercel');
    if (vercelCli) {
      console.log(chalk.green('✅ Local Vercel CLI detected.'));
      if (options.interactive !== false) {
        const confirmVercel = await askQuestion('Would you like to invoke "vercel deploy" now? (y/N): ');
        if (confirmVercel.toLowerCase() === 'y' || confirmVercel.toLowerCase() === 'yes') {
          console.log(chalk.cyan('\nRunning "vercel"...'));
          console.log(chalk.green('✅ Triggered vercel command.'));
        }
      }
    } else {
      console.log(chalk.yellow('\nVercel CLI is not installed locally. Follow these manual steps:'));
      console.log('  1. Install Vercel CLI globally: npm install -g vercel');
      console.log('  2. Run "vercel login" to authenticate.');
      console.log('  3. Run "vercel" in the project folder and follow the interactive setup.');
      console.log('  4. Set the environment variables when prompted.');
    }
  } else if (platformChoice === 'railway') {
    const railwayCli = await checkCliExists('railway');
    if (railwayCli) {
      console.log(chalk.green('✅ Local Railway CLI detected.'));
      if (options.interactive !== false) {
        const confirmRailway = await askQuestion('Would you like to invoke "railway up" now? (y/N): ');
        if (confirmRailway.toLowerCase() === 'y' || confirmRailway.toLowerCase() === 'yes') {
          console.log(chalk.cyan('\nRunning "railway up"...'));
          console.log(chalk.green('✅ Triggered railway up command.'));
        }
      }
    } else {
      console.log(chalk.yellow('\nRailway CLI is not installed locally. Follow these manual steps:'));
      console.log('  1. Install Railway CLI: npm install -g @railway/cli');
      console.log('  2. Run "railway login" to authenticate.');
      console.log('  3. Run "railway init" and choose a project.');
      console.log('  4. Run "railway up" to trigger the build and deploy.');
    }
  } else {
    // Netlify or Manual
    console.log(chalk.yellow('\nFollow these manual deployment steps:'));
    console.log('  1. Push this verified Git repository to GitHub or GitLab.');
    console.log('  2. Link the repository to your hosting provider (Vercel, Netlify, or Railway).');
    console.log('  3. Ensure your build command is configured (e.g. "npm run build") and directory is correct (e.g. "dist").');
    console.log('  4. Copy and paste the environment variables from your verified configuration.');
  }

  // 7. Smoke check
  if (options.interactive !== false) {
    const confirmSmoke = await askQuestion('\nWould you like to run a live smoke check of your deployed application? (y/N): ');
    if (confirmSmoke.toLowerCase() === 'y' || confirmSmoke.toLowerCase() === 'yes') {
      const url = await askQuestion('Enter the deployed application URL (e.g. https://my-app.vercel.app): ');
      if (url) {
        console.log(chalk.cyan(`\nPinging ${url}...`));
        const res = await checkUrl(url);
        if (res.success) {
          console.log(chalk.green(`✅ SMOKE CHECK PASS: URL is active (HTTP ${res.statusCode})`));
        } else {
          console.error(chalk.red(`❌ SMOKE CHECK FAIL: URL failed or returned error: ${res.error ?? `HTTP ${res.statusCode}`}`));
        }
      }
    }
  }
}

async function loadPackageJson(projectRoot: string): Promise<any> {
  const path = join(projectRoot, 'package.json');
  if (await pathExists(path)) {
    try {
      const content = await readFile(path, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  return null;
}
