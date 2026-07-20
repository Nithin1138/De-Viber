/**
 * Dependency Checker Tests
 *
 * Uses mocked fetch to test all paths without hitting the real npm registry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import type { RuleContext, PackageJsonData, PlatformDetection } from '../types.js';
import { runRules } from '../rules/engine.js';
import { dependencyRules } from '../rules/universal/dependencies.js';

const FIXTURES_ROOT = resolve(import.meta.dirname, '../../test-fixtures');

async function buildContext(
  fixtureName: string,
  overrides?: Partial<RuleContext>
): Promise<RuleContext> {
  const projectRoot = resolve(FIXTURES_ROOT, fixtureName);
  const files = await fg('**/*', {
    cwd: projectRoot,
    dot: true,
    onlyFiles: true,
    ignore: ['**/node_modules/**', '**/.git/**'],
  });

  let packageJson: PackageJsonData | null = null;
  try {
    const content = await readFile(join(projectRoot, 'package.json'), 'utf-8');
    packageJson = JSON.parse(content) as PackageJsonData;
  } catch {
    // No package.json
  }

  return {
    projectRoot,
    files,
    readFile: async (relativePath: string) => {
      try {
        return await readFile(join(projectRoot, relativePath), 'utf-8');
      } catch {
        return null;
      }
    },
    packageJson,
    offline: false,
    detectedPlatform: {
      platform: 'unknown',
      confidence: 'low',
      signals: [],
    },
    ...overrides,
  };
}

describe('Dependency Checker', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('is skipped in offline mode', async () => {
    const context = await buildContext('frontend-only', { offline: true });
    const { skippedRules, findings } = await runRules(dependencyRules, context);

    expect(findings).toHaveLength(0);
    expect(skippedRules.length).toBe(1);
    expect(skippedRules[0].ruleId).toBe('SEC_HALLUCINATED_DEP_001');
  });

  it('detects a non-existent (hallucinated) package', async () => {
    // Mock a package.json with a fake package
    const context = await buildContext('frontend-only', {
      offline: false,
      packageJson: {
        dependencies: {
          'this-package-definitely-does-not-exist-xyz123': '^1.0.0',
        },
      },
    });

    // Mock fetch to return 404 for the fake package
    global.fetch = vi.fn().mockResolvedValue({
      status: 404,
    } as Response);

    const { findings } = await runRules(dependencyRules, context);

    const hallFindings = findings.filter(
      (f) => f.ruleId === 'SEC_HALLUCINATED_DEP_001' && f.severity === 'high'
    );
    expect(hallFindings.length).toBe(1);
    expect(hallFindings[0].message).toContain('does not exist');
  });

  it('does NOT flag packages that exist', async () => {
    const context = await buildContext('frontend-only', {
      offline: false,
      packageJson: {
        dependencies: {
          'some-real-package': '^1.0.0',
        },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
    } as Response);

    const { findings } = await runRules(dependencyRules, context);

    const hallFindings = findings.filter(
      (f) => f.ruleId === 'SEC_HALLUCINATED_DEP_001' && f.severity === 'high'
    );
    expect(hallFindings).toHaveLength(0);
  });

  it('reports network errors as warnings, not hard findings', async () => {
    const context = await buildContext('frontend-only', {
      offline: false,
      packageJson: {
        dependencies: {
          'some-package': '^1.0.0',
        },
      },
    });

    global.fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

    const { findings } = await runRules(dependencyRules, context);

    // Should produce an info-level warning, not a high-severity finding
    const warnings = findings.filter(
      (f) => f.ruleId === 'SEC_HALLUCINATED_DEP_001' && f.severity === 'info'
    );
    expect(warnings.length).toBe(1);
    expect(warnings[0].message).toContain('Could not verify');

    // Should NOT produce a high-severity "hallucinated" finding
    const hallFindings = findings.filter(
      (f) => f.ruleId === 'SEC_HALLUCINATED_DEP_001' && f.severity === 'high'
    );
    expect(hallFindings).toHaveLength(0);
  });

  it('handles rate limiting (429) as a warning', async () => {
    const context = await buildContext('frontend-only', {
      offline: false,
      packageJson: {
        dependencies: {
          'some-package': '^1.0.0',
        },
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      status: 429,
    } as Response);

    const { findings } = await runRules(dependencyRules, context);

    const warnings = findings.filter(
      (f) => f.ruleId === 'SEC_HALLUCINATED_DEP_001' && f.severity === 'info'
    );
    expect(warnings.length).toBe(1);
    expect(warnings[0].message).toContain('Could not verify');
  });

  it('skips well-known packages to save rate limit', async () => {
    const context = await buildContext('frontend-only', {
      offline: false,
      packageJson: {
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          typescript: '^5.3.0',
        },
      },
    });

    const fetchSpy = vi.fn().mockResolvedValue({ status: 200 } as Response);
    global.fetch = fetchSpy;

    await runRules(dependencyRules, context);

    // All these are in the skip list, so fetch should not be called
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('handles empty dependencies gracefully', async () => {
    const context = await buildContext('frontend-only', {
      offline: false,
      packageJson: {
        dependencies: {},
        devDependencies: {},
      },
    });

    const { findings } = await runRules(dependencyRules, context);
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag peer conflict for empty-deps fixture (true negative)', async () => {
    const context = await buildContext('empty-deps', {
      offline: true,
    });
    const { findings } = await runRules(dependencyRules, context);
    const peerFindings = findings.filter(f => f.ruleId === 'DEP_PEER_CONFLICT_001');
    expect(peerFindings).toHaveLength(0);
  });

  it('flags peer conflict for peer-conflict fixture (true positive)', async () => {
    const context = await buildContext('peer-conflict', {
      offline: true,
    });
    const { findings } = await runRules(dependencyRules, context);
    const peerFindings = findings.filter(f => f.ruleId === 'DEP_PEER_CONFLICT_001');
    expect(peerFindings).toHaveLength(1);
    expect(peerFindings[0].message).toContain('peer dependency conflicts');
  });
});
