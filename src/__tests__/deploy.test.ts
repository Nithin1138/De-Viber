import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDeploy } from '../deploy/guide.js';
import { join } from 'node:path';
import { rm, mkdir, writeFile } from 'node:fs/promises';

const fixtureDir = join(__dirname, '../../test-fixtures/deploy-test-fixture');

// Hoist vi.mock at the top level
vi.mock('simple-git', () => {
  return {
    simpleGit: () => ({
      checkIsRepo: () => Promise.resolve(true),
      revparse: () => Promise.resolve('new-hash'),
      status: () => Promise.resolve({ isClean: () => true }),
    }),
  };
});

describe('Deploy Flow', () => {
  beforeEach(async () => {
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(join(fixtureDir, 'package.json'), JSON.stringify({ name: 'deploy-test' }), 'utf-8');
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('refuses to deploy without a prior verify', async () => {
    await expect(runDeploy(fixtureDir, { interactive: false })).rejects.toThrow('STALE_OR_MISSING_VERIFICATION');
  });

  it('refuses to deploy if verify is stale (wrong commit)', async () => {
    const deviberDir = join(fixtureDir, '.deviber');
    await mkdir(deviberDir, { recursive: true });
    await writeFile(join(deviberDir, 'verify.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      commitHash: 'outdated-hash',
      isClean: true,
    }, null, 2), 'utf-8');

    await expect(runDeploy(fixtureDir, { interactive: false })).rejects.toThrow('STALE_OR_MISSING_VERIFICATION');
  });

  it('blocks deployment if LOVABLE_CLOUD_DATA_RISK_001 is found and export is not confirmed', async () => {
    // Write verification status
    const deviberDir = join(fixtureDir, '.deviber');
    await mkdir(deviberDir, { recursive: true });
    await writeFile(join(deviberDir, 'verify.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      commitHash: 'new-hash',
      isClean: true,
    }, null, 2), 'utf-8');

    // Write file with Lovable Supabase URL
    await writeFile(join(fixtureDir, 'supabase-config.ts'), 'const URL = "https://abc.supabase.lovable.app";', 'utf-8');

    // Run deploy in non-interactive mode without confirming data export
    await expect(runDeploy(fixtureDir, {
      interactive: false,
      confirmDataExport: false,
    })).rejects.toThrow('DATA_EXPORT_BLOCKED');
  });

  it('allows deployment if LOVABLE_CLOUD_DATA_RISK_001 is found and export IS confirmed', async () => {
    // Write verification status
    const deviberDir = join(fixtureDir, '.deviber');
    await mkdir(deviberDir, { recursive: true });
    await writeFile(join(deviberDir, 'verify.json'), JSON.stringify({
      timestamp: new Date().toISOString(),
      commitHash: 'new-hash',
      isClean: true,
    }, null, 2), 'utf-8');

    // Write file with Lovable Supabase URL
    await writeFile(join(fixtureDir, 'supabase-config.ts'), 'const URL = "https://abc.supabase.lovable.app";', 'utf-8');

    // Should run through without throwing since confirmDataExport is true
    await expect(runDeploy(fixtureDir, {
      interactive: false,
      confirmDataExport: true,
      targetPlatform: 'manual',
    })).resolves.not.toThrow();
  });
});
