/**
 * Rule Tests — All rules tested against synthetic fixtures
 *
 * For each rule:
 * - At least one fixture that SHOULD trigger it (true positive)
 * - At least one fixture that SHOULD NOT trigger it (true negative)
 * - Edge cases (empty files, missing data)
 */

import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import fg from 'fast-glob';
import type { RuleContext, PackageJsonData, PlatformDetection } from '../types.js';
import { runRules } from '../rules/engine.js';
import { lovableRules } from '../rules/lovable/rules.js';
import { boltRules } from '../rules/bolt/rules.js';
import { securityRules } from '../rules/universal/security.rules.js';

const FIXTURES_ROOT = resolve(import.meta.dirname, '../../test-fixtures');

/** Build a RuleContext for a test fixture. */
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
    // No package.json or invalid JSON
  }

  const detectedPlatform: PlatformDetection = {
    platform: 'lovable',
    confidence: 'high',
    signals: [],
  };

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
    offline: true,
    detectedPlatform,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOVABLE RULES
// ═══════════════════════════════════════════════════════════════════════════

describe('Lovable Rules', () => {
  describe('LOVABLE_SCOPED_DEP_001 — Lovable-Scoped Package Dependencies', () => {
    it('fires on lovable-basic-lockup (has @lovable.dev/ui and @lovable.dev/cli)', async () => {
      const context = await buildContext('lovable-basic-lockup');
      const { findings } = await runRules(lovableRules, context);

      const depFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_SCOPED_DEP_001'
      );
      expect(depFindings.length).toBe(2); // @lovable.dev/ui + @lovable.dev/cli
      expect(depFindings[0].severity).toBe('high');
      expect(depFindings[0].confidence).toBe('high');
      expect(depFindings[0].category).toBe('portability');
    });

    it('fires on lovable-secure (still has @lovable.dev/ui)', async () => {
      const context = await buildContext('lovable-secure');
      const { findings } = await runRules(lovableRules, context);

      const depFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_SCOPED_DEP_001'
      );
      expect(depFindings.length).toBe(1);
    });

    it('fires on lovable-api-gateway (has lovable-tagger)', async () => {
      const context = await buildContext('lovable-api-gateway');
      const { findings } = await runRules(lovableRules, context);

      const depFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_SCOPED_DEP_001'
      );
      expect(depFindings.length).toBe(1);
      expect(depFindings[0].message).toContain('lovable-tagger');
    });

    it('does NOT fire on frontend-only (no lovable deps)', async () => {
      const context = await buildContext('frontend-only');
      const { findings } = await runRules(lovableRules, context);

      const depFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_SCOPED_DEP_001'
      );
      expect(depFindings).toHaveLength(0);
    });

    it('handles missing package.json gracefully', async () => {
      const context = await buildContext('frontend-only', {
        packageJson: null,
      });
      const { findings } = await runRules(lovableRules, context);

      const depFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_SCOPED_DEP_001'
      );
      expect(depFindings).toHaveLength(0);
    });
  });

  describe('LOVABLE_CONFIG_001 — Lovable-Specific Configuration Files', () => {
    it('fires on lovable-basic-lockup (has .lovable/ directory)', async () => {
      const context = await buildContext('lovable-basic-lockup');
      const { findings } = await runRules(lovableRules, context);

      const configFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_CONFIG_001'
      );
      expect(configFindings.length).toBeGreaterThanOrEqual(1);
      expect(configFindings[0].severity).toBe('medium');
    });

    it('does NOT fire on frontend-only (no lovable config)', async () => {
      const context = await buildContext('frontend-only');
      const { findings } = await runRules(lovableRules, context);

      const configFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_CONFIG_001'
      );
      expect(configFindings).toHaveLength(0);
    });
  });

  describe('LOVABLE_COMMENT_001 — Lovable/GPT-Pilot Code Markers', () => {
    it('fires on lovable-basic-lockup (has @lovable-generated comment)', async () => {
      const context = await buildContext('lovable-basic-lockup');
      const { findings } = await runRules(lovableRules, context);

      const commentFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_COMMENT_001'
      );
      expect(commentFindings.length).toBeGreaterThanOrEqual(1);
      expect(commentFindings[0].severity).toBe('info');
    });

    it('does NOT fire on frontend-only (no lovable markers)', async () => {
      const context = await buildContext('frontend-only');
      const { findings } = await runRules(lovableRules, context);

      const commentFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_COMMENT_001'
      );
      expect(commentFindings).toHaveLength(0);
    });
  });

  describe('LOVABLE_CLOUD_DATA_RISK_001 — Lovable Cloud Data Risk', () => {
    it('fires on lovable-cloud-detected (has supabase.lovable.app url)', async () => {
      const context = await buildContext('lovable-cloud-detected');
      const { findings } = await runRules(lovableRules, context);

      const cloudFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_CLOUD_DATA_RISK_001'
      );
      expect(cloudFindings.length).toBe(1);
      expect(cloudFindings[0].severity).toBe('high');
      expect(cloudFindings[0].message).toContain('connecting to Lovable Cloud');
    });

    it('does NOT fire on lovable-cloud-self-supabase (has standard supabase.co url)', async () => {
      const context = await buildContext('lovable-cloud-self-supabase');
      const { findings } = await runRules(lovableRules, context);

      const cloudFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_CLOUD_DATA_RISK_001'
      );
      expect(cloudFindings).toHaveLength(0);
    });
  });

  describe('LOVABLE_API_GATEWAY_001 — Lovable AI Gateway Dependency', () => {
    it('fires on lovable-api-gateway (has gateway URL and LOVABLE_API_KEY)', async () => {
      const context = await buildContext('lovable-api-gateway');
      const { findings } = await runRules(lovableRules, context);

      const gatewayFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_API_GATEWAY_001'
      );
      expect(gatewayFindings.length).toBe(2); // one for URL, one for env var
      expect(gatewayFindings[0].severity).toBe('high');
      expect(gatewayFindings[0].category).toBe('portability');
    });

    it('does NOT fire on frontend-only (clean code)', async () => {
      const context = await buildContext('frontend-only');
      const { findings } = await runRules(lovableRules, context);

      const gatewayFindings = findings.filter(
        (f) => f.ruleId === 'LOVABLE_API_GATEWAY_001'
      );
      expect(gatewayFindings).toHaveLength(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BOLT RULES
// ═══════════════════════════════════════════════════════════════════════════

describe('Bolt Rules', () => {
  const boltContextOverride = {
    detectedPlatform: { platform: 'bolt' as const, confidence: 'high' as const, signals: [] }
  };

  describe('BOLT_SCOPED_DEP_001 — Bolt-Scoped Package Dependencies', () => {
    it('fires on bolt-basic-lockup (has @stackblitz/sdk and bolt-tagger)', async () => {
      const context = await buildContext('bolt-basic-lockup', boltContextOverride);
      const { findings } = await runRules(boltRules, context);

      const depFindings = findings.filter(
        (f) => f.ruleId === 'BOLT_SCOPED_DEP_001'
      );
      expect(depFindings.length).toBe(2);
      expect(depFindings[0].severity).toBe('high');
    });

    it('does NOT fire on frontend-only', async () => {
      const context = await buildContext('frontend-only', boltContextOverride);
      const { findings } = await runRules(boltRules, context);

      const depFindings = findings.filter(
        (f) => f.ruleId === 'BOLT_SCOPED_DEP_001'
      );
      expect(depFindings).toHaveLength(0);
    });
  });

  describe('BOLT_CONFIG_001 — Bolt-Specific Configuration Files', () => {
    it('fires on bolt-basic-lockup (has .bolt/ directory)', async () => {
      const context = await buildContext('bolt-basic-lockup', boltContextOverride);
      const { findings } = await runRules(boltRules, context);

      const configFindings = findings.filter(
        (f) => f.ruleId === 'BOLT_CONFIG_001'
      );
      expect(configFindings.length).toBe(1);
      expect(configFindings[0].severity).toBe('medium');
    });

    it('does NOT fire on frontend-only', async () => {
      const context = await buildContext('frontend-only', boltContextOverride);
      const { findings } = await runRules(boltRules, context);

      const configFindings = findings.filter(
        (f) => f.ruleId === 'BOLT_CONFIG_001'
      );
      expect(configFindings).toHaveLength(0);
    });
  });

  describe('BOLT_RUNTIME_ASSUMPTION_001 — WebContainer Runtime Assumptions', () => {
    it('fires on bolt-basic-lockup (has webcontainer and stackblitz in index.tsx)', async () => {
      const context = await buildContext('bolt-basic-lockup', boltContextOverride);
      const { findings } = await runRules(boltRules, context);

      const assumptionFindings = findings.filter(
        (f) => f.ruleId === 'BOLT_RUNTIME_ASSUMPTION_001'
      );
      expect(assumptionFindings.length).toBe(3);
      expect(assumptionFindings[0].severity).toBe('medium');
    });

    it('does NOT fire on frontend-only', async () => {
      const context = await buildContext('frontend-only', boltContextOverride);
      const { findings } = await runRules(boltRules, context);

      const assumptionFindings = findings.filter(
        (f) => f.ruleId === 'BOLT_RUNTIME_ASSUMPTION_001'
      );
      expect(assumptionFindings).toHaveLength(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY RULES
// ═══════════════════════════════════════════════════════════════════════════

describe('Security Rules', () => {
  describe('SEC_HARDCODED_SECRET_001 — Hardcoded API Keys', () => {
    it('fires on lovable-basic-lockup (has hardcoded Stripe key + service role)', async () => {
      const context = await buildContext('lovable-basic-lockup');
      const { findings } = await runRules(securityRules, context);

      const secretFindings = findings.filter(
        (f) => f.ruleId === 'SEC_HARDCODED_SECRET_001'
      );
      expect(secretFindings.length).toBeGreaterThanOrEqual(1);
      expect(
        secretFindings.some((f) => f.severity === 'critical' || f.severity === 'high')
      ).toBe(true);
    });

    it('does NOT fire on lovable-secure (secrets in env vars)', async () => {
      const context = await buildContext('lovable-secure');
      const { findings } = await runRules(securityRules, context);

      const secretFindings = findings.filter(
        (f) => f.ruleId === 'SEC_HARDCODED_SECRET_001'
      );
      expect(secretFindings).toHaveLength(0);
    });

    it('does NOT fire on frontend-only (no secrets at all)', async () => {
      const context = await buildContext('frontend-only');
      const { findings } = await runRules(securityRules, context);

      const secretFindings = findings.filter(
        (f) => f.ruleId === 'SEC_HARDCODED_SECRET_001'
      );
      expect(secretFindings).toHaveLength(0);
    });
  });

  describe('SEC_CLIENT_ROLE_001 — Client-Side-Only Role Enforcement', () => {
    it('fires on lovable-basic-lockup (client admin check, no server enforcement)', async () => {
      const context = await buildContext('lovable-basic-lockup');
      const { findings } = await runRules(securityRules, context);

      const roleFindings = findings.filter(
        (f) => f.ruleId === 'SEC_CLIENT_ROLE_001'
      );
      expect(roleFindings.length).toBeGreaterThanOrEqual(1);
      // Should be HIGH severity because no server-side check was found
      expect(roleFindings[0].severity).toBe('high');
    });

    it('fires with MEDIUM severity on edge-functions-pattern (has server-side check)', async () => {
      const context = await buildContext('edge-functions-pattern');
      const { findings } = await runRules(securityRules, context);

      const roleFindings = findings.filter(
        (f) => f.ruleId === 'SEC_CLIENT_ROLE_001'
      );
      expect(roleFindings.length).toBeGreaterThanOrEqual(1);
      // Should be MEDIUM because server-side role check exists in edge function
      expect(roleFindings[0].severity).toBe('medium');
    });

    it('does NOT fire on frontend-only (no role checks at all)', async () => {
      const context = await buildContext('frontend-only');
      const { findings } = await runRules(securityRules, context);

      const roleFindings = findings.filter(
        (f) => f.ruleId === 'SEC_CLIENT_ROLE_001'
      );
      expect(roleFindings).toHaveLength(0);
    });

    it('does NOT fire on lovable-secure (no role checks in UI layer)', async () => {
      const context = await buildContext('lovable-secure');
      const { findings } = await runRules(securityRules, context);

      const roleFindings = findings.filter(
        (f) => f.ruleId === 'SEC_CLIENT_ROLE_001'
      );
      expect(roleFindings).toHaveLength(0);
    });
  });

  describe('SEC_MISSING_RLS_001 — Missing Row Level Security', () => {
    it('fires on lovable-basic-lockup (2 tables without RLS)', async () => {
      const context = await buildContext('lovable-basic-lockup');
      const { findings } = await runRules(securityRules, context);

      const rlsFindings = findings.filter(
        (f) => f.ruleId === 'SEC_MISSING_RLS_001'
      );
      expect(rlsFindings.length).toBe(2); // users + posts tables
      expect(rlsFindings[0].severity).toBe('high');
      expect(rlsFindings[0].confidence).toBe('high');
    });

    it('does NOT fire on lovable-secure (all tables have RLS)', async () => {
      const context = await buildContext('lovable-secure');
      const { findings } = await runRules(securityRules, context);

      const rlsFindings = findings.filter(
        (f) => f.ruleId === 'SEC_MISSING_RLS_001'
      );
      expect(rlsFindings).toHaveLength(0);
    });

    it('does NOT fire on frontend-only (no SQL files at all)', async () => {
      const context = await buildContext('frontend-only');
      const { findings } = await runRules(securityRules, context);

      const rlsFindings = findings.filter(
        (f) => f.ruleId === 'SEC_MISSING_RLS_001'
      );
      expect(rlsFindings).toHaveLength(0);
    });
  });

  describe('SEC_POSSIBLE_IDOR_001 — Ownership-Blind Queries', () => {
    it('fires on lovable-idor-pattern (queries without ownership check)', async () => {
      const context = await buildContext('lovable-idor-pattern');
      const { findings } = await runRules(securityRules, context);

      const idorFindings = findings.filter(
        (f) => f.ruleId === 'SEC_POSSIBLE_IDOR_001'
      );
      // Should fire on getPostById and deletePost, but NOT on getUserPost
      expect(idorFindings.length).toBeGreaterThanOrEqual(1);
      // All IDOR findings must be low confidence
      expect(idorFindings.every((f) => f.confidence === 'low')).toBe(true);
      // Every finding message must include the "review hint" warning
      expect(
        idorFindings.every((f) =>
          f.userActionableMessage.includes('REVIEW HINT') ||
          f.userActionableMessage.includes('heuristic') ||
          f.userActionableMessage.includes('false positive')
        )
      ).toBe(true);
    });

    it('does NOT fire on frontend-only (no Supabase queries)', async () => {
      const context = await buildContext('frontend-only');
      const { findings } = await runRules(securityRules, context);

      const idorFindings = findings.filter(
        (f) => f.ruleId === 'SEC_POSSIBLE_IDOR_001'
      );
      expect(idorFindings).toHaveLength(0);
    });

    it('does NOT fire on lovable-secure (no ID-only queries)', async () => {
      const context = await buildContext('lovable-secure');
      const { findings } = await runRules(securityRules, context);

      const idorFindings = findings.filter(
        (f) => f.ruleId === 'SEC_POSSIBLE_IDOR_001'
      );
      expect(idorFindings).toHaveLength(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RULE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

describe('Rule Engine', () => {
  it('skips network-dependent rules in offline mode', async () => {
    const context = await buildContext('frontend-only', { offline: true });

    // Import dependency rules
    const { dependencyRules } = await import(
      '../rules/universal/dependencies.js'
    );

    const { skippedRules } = await runRules(dependencyRules, context);

    expect(skippedRules.length).toBe(1);
    expect(skippedRules[0].ruleId).toBe('SEC_HALLUCINATED_DEP_001');
    expect(skippedRules[0].reason).toContain('offline');
  });

  it('skips platform-specific rules for non-matching platforms', async () => {
    const context = await buildContext('frontend-only', {
      detectedPlatform: {
        platform: 'bolt',
        confidence: 'high',
        signals: [],
      },
    });

    const { findings } = await runRules(lovableRules, context);
    // Lovable rules should not run against a bolt-detected project
    expect(findings).toHaveLength(0);
  });

  it('isolates rule failures — one broken rule doesnt crash the whole scan', async () => {
    const context = await buildContext('frontend-only');

    const brokenRule = {
      id: 'BROKEN_001',
      name: 'Broken Rule',
      category: 'security' as const,
      severity: 'high' as const,
      confidence: 'high' as const,
      platform: 'universal' as const,
      autoFixable: false,
      requiresNetwork: false,
      detect: () => {
        throw new Error('Rule implementation crashed');
      },
    };

    const { failedRules, findings } = await runRules(
      [brokenRule, ...securityRules],
      context
    );

    expect(failedRules.length).toBe(1);
    expect(failedRules[0].ruleId).toBe('BROKEN_001');
    expect(failedRules[0].error).toContain('crashed');
    // Other rules should still have run
    // (frontend-only has no findings, but the rules ran without error)
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FULL FIXTURE INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Full Fixture Integration', () => {
  it('lovable-basic-lockup produces the expected finding types', async () => {
    const context = await buildContext('lovable-basic-lockup');
    const allRules = [...lovableRules, ...securityRules];
    const { findings } = await runRules(allRules, context);

    const ruleIds = new Set(findings.map((f) => f.ruleId));

    // Should fire these rules:
    expect(ruleIds.has('LOVABLE_SCOPED_DEP_001')).toBe(true);
    expect(ruleIds.has('SEC_HARDCODED_SECRET_001')).toBe(true);
    expect(ruleIds.has('SEC_MISSING_RLS_001')).toBe(true);
    expect(ruleIds.has('SEC_CLIENT_ROLE_001')).toBe(true);
    expect(ruleIds.has('LOVABLE_CONFIG_001')).toBe(true);
  });

  it('frontend-only produces ZERO findings (true negative)', async () => {
    const context = await buildContext('frontend-only');
    const allRules = [...lovableRules, ...securityRules];
    const { findings } = await runRules(allRules, context);

    expect(findings).toHaveLength(0);
  });

  it('lovable-secure produces ONLY portability findings, no security findings', async () => {
    const context = await buildContext('lovable-secure');
    const allRules = [...lovableRules, ...securityRules];
    const { findings } = await runRules(allRules, context);

    const securityFindings = findings.filter((f) => f.category === 'security');
    const portFindings = findings.filter((f) => f.category === 'portability');

    expect(securityFindings).toHaveLength(0);
    expect(portFindings.length).toBeGreaterThanOrEqual(1);
  });

  it('bolt-basic-lockup produces the expected Bolt findings', async () => {
    const context = await buildContext('bolt-basic-lockup', {
      detectedPlatform: { platform: 'bolt' as const, confidence: 'high' as const, signals: [] }
    });
    const allRules = [...boltRules, ...securityRules];
    const { findings } = await runRules(allRules, context);

    const ruleIds = new Set(findings.map((f) => f.ruleId));
    expect(ruleIds.has('BOLT_SCOPED_DEP_001')).toBe(true);
    expect(ruleIds.has('BOLT_CONFIG_001')).toBe(true);
    expect(ruleIds.has('BOLT_RUNTIME_ASSUMPTION_001')).toBe(true);
  });
});
