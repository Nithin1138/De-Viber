/**
 * Dependency Existence Checker
 *
 * Checks whether npm packages listed in package.json actually exist
 * on the public npm registry. Non-existent packages are flagged as
 * "hallucinated dependencies" — a known AI code generation failure mode
 * where the AI references packages that don't exist, creating a
 * "slopsquatting" risk (attackers register the hallucinated name).
 *
 * NETWORK BEHAVIOR:
 * - Queries registry.npmjs.org only (public npm registry)
 * - Never calls any AI platform's servers
 * - Respects --offline flag (skips with clear message)
 * - Rate-limits requests to avoid hammering the registry
 * - Distinguishes "package doesn't exist" from "we couldn't check"
 *
 * EXPLICITLY DEFERRED:
 * - Outdated version detection (comparing installed vs latest major).
 *   Rationale: existence-checking is the higher-value, more novel catch
 *   with lower false-positive risk. Version-outdated logic adds significant
 *   complexity (semver parsing, understanding pre-release versions, major
 *   vs minor significance) for a less differentiated feature. Will revisit
 *   in v1.1 once the core tool is validated. — per build brief §6
 */

import type { Rule, RuleContext, Finding } from '../../types.js';
import { join } from 'node:path';

let findingCounter = 0;
function nextFindingId(ruleId: string): string {
  return `${ruleId}-${++findingCounter}`;
}

/**
 * Well-known packages that we skip checking because they're guaranteed
 * to exist and checking them wastes rate-limit budget.
 */
const SKIP_PACKAGES = new Set([
  'react',
  'react-dom',
  'next',
  'typescript',
  'vite',
  'vitest',
  'eslint',
  'prettier',
  '@types/node',
  '@types/react',
  '@types/react-dom',
]);

/**
 * Delay between npm registry requests (ms).
 * The npm registry doesn't have a published rate limit, but
 * hammering it with 100+ concurrent requests is antisocial.
 */
const REQUEST_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface NpmCheckResult {
  packageName: string;
  exists: boolean | null; // null = couldn't determine (network error)
  error?: string;
  statusCode?: number;
}

/**
 * Check a single package's existence on npm.
 *
 * Returns a clear result distinguishing:
 * - exists: true (200 response)
 * - exists: false (404 response — package doesn't exist)
 * - exists: null (network error, timeout, rate limit — couldn't check)
 */
async function checkPackageExists(packageName: string): Promise<NpmCheckResult> {
  // Scoped packages need URL encoding (e.g., @lovable.dev/ui → @lovable.dev%2Fui)
  const encodedName = packageName.startsWith('@')
    ? `@${encodeURIComponent(packageName.slice(1))}`
    : encodeURIComponent(packageName);

  const url = `https://registry.npmjs.org/${encodedName}`;

  try {
    const response = await fetch(url, {
      method: 'HEAD', // We only need to know if it exists, not the full metadata
      signal: AbortSignal.timeout(10000), // 10s timeout per package
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 200) {
      return { packageName, exists: true, statusCode: 200 };
    }

    if (response.status === 404) {
      return { packageName, exists: false, statusCode: 404 };
    }

    // Unexpected status (429 rate limit, 500 server error, etc.)
    return {
      packageName,
      exists: null,
      statusCode: response.status,
      error: `npm registry returned HTTP ${response.status}`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      packageName,
      exists: null,
      error: `Network error checking ${packageName}: ${message}`,
    };
  }
}

const hallucinatedDependencies: Rule = {
  id: 'SEC_HALLUCINATED_DEP_001',
  name: 'Hallucinated (Non-Existent) Dependencies',
  category: 'security',
  severity: 'high',
  confidence: 'high',
  platform: 'universal',
  autoFixable: false,
  requiresNetwork: true,
  detect: async function (context: RuleContext): Promise<Finding[]> {
    if (context.offline) {
      // This shouldn't happen — the engine skips network rules in offline mode.
      // But if it does, return empty rather than crash.
      return [];
    }

    const pkg = context.packageJson;
    if (!pkg) return [];

    const allDeps: Record<string, string> = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };

    const packageNames = Object.keys(allDeps).filter(
      (name) => !SKIP_PACKAGES.has(name)
    );

    if (packageNames.length === 0) return [];

    const findings: Finding[] = [];
    const warnings: Finding[] = [];

    // Check packages sequentially with rate limiting
    for (let i = 0; i < packageNames.length; i++) {
      const packageName = packageNames[i];
      const result = await checkPackageExists(packageName);

      if (result.exists === false) {
        // Package confirmed not to exist — hallucinated dependency
        findings.push({
          id: nextFindingId('SEC_HALLUCINATED_DEP_001'),
          ruleId: 'SEC_HALLUCINATED_DEP_001',
          ruleName: 'Hallucinated (Non-Existent) Dependencies',
          category: 'security',
          severity: 'high',
          confidence: 'high',
          file: join(context.projectRoot, 'package.json'),
          message: `Package "${packageName}" does not exist on npm`,
          userActionableMessage:
            `The package "${packageName}" listed in your package.json does not exist ` +
            `on the npm registry. This is a known problem with AI code generators — ` +
            `they sometimes reference packages that don't exist ("hallucinated" packages). ` +
            `This is a security risk: an attacker could register a package with this exact ` +
            `name and put malicious code in it (called "slopsquatting"). Remove this ` +
            `dependency and find a real alternative that provides the functionality you need.`,
          autoFixable: false,
          evidence: `"${packageName}": "${allDeps[packageName]}" (404 from npm registry)`,
        });
      } else if (result.exists === null) {
        // Couldn't check — report as a warning, not a finding
        warnings.push({
          id: nextFindingId('SEC_HALLUCINATED_DEP_001'),
          ruleId: 'SEC_HALLUCINATED_DEP_001',
          ruleName: 'Hallucinated (Non-Existent) Dependencies',
          category: 'security',
          severity: 'info',
          confidence: 'low',
          file: join(context.projectRoot, 'package.json'),
          message: `Could not verify package "${packageName}": ${result.error}`,
          userActionableMessage:
            `We were unable to check whether "${packageName}" exists on npm ` +
            `(${result.error}). This might be due to network issues, npm registry ` +
            `downtime, or rate limiting. Try running the scan again later, or use ` +
            `"npm view ${packageName}" to check manually.`,
          autoFixable: false,
          evidence: result.error ?? 'Unknown error',
        });
      }
      // exists === true: package exists, no finding needed

      // Rate limit between requests (skip delay on last package)
      if (i < packageNames.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    // Return confirmed findings first, then warnings
    return [...findings, ...warnings];
  },
};

/** Dependency-related rules. */
export const dependencyRules: Rule[] = [hallucinatedDependencies];
