import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { DockerVerifier } from '../verifier/dockerVerifier.js';

const FIXTURES_ROOT = resolve(import.meta.dirname, '../../test-fixtures');
const CLI_PATH = resolve(import.meta.dirname, '../../dist/index.js');

function setupGitRepo(path: string): void {
  // Clear any existing env files or Git
  rmSync(join(path, '.git'), { recursive: true, force: true });
  rmSync(join(path, '.env.local'), { force: true });
  rmSync(join(path, '.env.example'), { force: true });

  // Restore original config.ts
  const isBroken = path.includes('transform-broken');
  const originalConfig = isBroken
    ? `const stripeApiKey = "sk_test_abc123def456ghi789jkl012mno345pqr678stu901vwx";
export const config = {
  apiKey: stripeApiKey
};
`
    : `// Test fixture containing a hardcoded secret to be extracted
const stripeApiKey = "sk_test_abc123def456ghi789jkl012mno345pqr678stu901vwx";
export const config = {
  apiKey: stripeApiKey
};
`;
  writeFileSync(join(path, 'src/config.ts'), originalConfig, 'utf-8');

  execSync('git init', { cwd: path });
  execSync('git config user.name "Test User"', { cwd: path });
  execSync('git config user.email "test@example.com"', { cwd: path });
  execSync('git add -A', { cwd: path });
  execSync('git commit -m "initial"', { cwd: path });
}

function cleanupGitRepo(path: string): void {
  rmSync(join(path, '.git'), { recursive: true, force: true });
  rmSync(join(path, '.env.local'), { force: true });
  rmSync(join(path, '.env.example'), { force: true });
}

describe('Transform Command Integration Tests', () => {
  let dockerAvailable = false;

  beforeAll(async () => {
    const verifier = new DockerVerifier();
    try {
      await verifier.checkDockerStatus();
      dockerAvailable = true;
    } catch {
      console.warn('⚠️ Docker daemon is not running. Skipping transform integration tests.');
    }
  });

  it('transforms secrets, extracts env, verifies success and creates backup', async () => {
    if (!dockerAvailable) return;

    const path = resolve(FIXTURES_ROOT, 'transform-secret');
    setupGitRepo(path);

    try {
      // Run transform command
      const output = execSync(`node ${CLI_PATH} transform .`, { cwd: path, encoding: 'utf-8' });
      
      expect(output).toContain('TRANSFORM SUCCESS');
      expect(output).toContain('Extracted hardcoded secret');

      // Verify source file change
      const configPath = join(path, 'src/config.ts');
      const configContent = readFileSync(configPath, 'utf-8');
      expect(configContent).toContain('import.meta.env.VITE_STRIPEAPIKEY');
      expect(configContent).not.toContain('sk_test_abc123');

      // Verify env files
      const envLocalPath = join(path, '.env.local');
      expect(existsSync(envLocalPath)).toBe(true);
      expect(readFileSync(envLocalPath, 'utf-8')).toContain('VITE_STRIPEAPIKEY=sk_test_abc123');

      const envExamplePath = join(path, '.env.example');
      expect(existsSync(envExamplePath)).toBe(true);
      expect(readFileSync(envExamplePath, 'utf-8')).toContain('VITE_STRIPEAPIKEY=');

      // Verify backup branch exists
      const branches = execSync('git branch', { cwd: path, encoding: 'utf-8' });
      expect(branches).toContain('deviber-backup-');

      // Commit the changes so the workspace is clean again for the second run
      execSync('git add -A && git commit -m "commit transformed changes"', { cwd: path });

      // Test idempotency: running it a second time should say nothing to transform
      const secondOutput = execSync(`node ${CLI_PATH} transform .`, { cwd: path, encoding: 'utf-8' });
      expect(secondOutput).toMatch(/No auto-fixable findings found|No changes were made/);

    } finally {
      cleanupGitRepo(path);
      // Restore config.ts to original state
      const originalConfig = `// Test fixture containing a hardcoded secret to be extracted
const stripeApiKey = "sk_test_abc123def456ghi789jkl012mno345pqr678stu901vwx";
export const config = {
  apiKey: stripeApiKey
};
`;
      writeFileSync(join(path, 'src/config.ts'), originalConfig, 'utf-8');
    }
  });

  it('rolls back completely and displays reason if verification fails', async () => {
    if (!dockerAvailable) return;

    const path = resolve(FIXTURES_ROOT, 'transform-broken');
    setupGitRepo(path);

    try {
      // Run transform command - it should fail because our custom build.js will reject the transform
      let errorThrown = false;
      let errorOutput = '';
      try {
        execSync(`node ${CLI_PATH} transform .`, { cwd: path, stdio: 'pipe' });
      } catch (err: any) {
        errorThrown = true;
        errorOutput = (err.stdout?.toString() || '') + '\n' + (err.stderr?.toString() || '');
      }

      expect(errorThrown).toBe(true);
      expect(errorOutput).toContain('Post-transform version failed verification');
      expect(errorOutput).toContain('Rolling back changes');

      // Verify source file was rolled back
      const configPath = join(path, 'src/config.ts');
      const configContent = readFileSync(configPath, 'utf-8');
      expect(configContent).toContain('sk_test_abc123def456ghi789jkl012mno345pqr678stu901vwx');
      expect(configContent).not.toContain('import.meta.env');

      // Verify backup branch exists
      const branches = execSync('git branch', { cwd: path, encoding: 'utf-8' });
      expect(branches).toContain('deviber-backup-');

    } finally {
      cleanupGitRepo(path);
      // Restore config.ts to original state
      const originalConfig = `const stripeApiKey = "sk_test_abc123def456ghi789jkl012mno345pqr678stu901vwx";
export const config = {
  apiKey: stripeApiKey
};
`;
      writeFileSync(join(path, 'src/config.ts'), originalConfig, 'utf-8');
    }
  });
});
