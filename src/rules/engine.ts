/**
 * Rule Engine — Runs detection rules against a project.
 *
 * Handles both sync and async rules, isolates rule failures so one
 * broken rule doesn't crash the entire scan, and respects offline mode
 * by skipping network-dependent rules.
 *
 * Design decisions:
 * - Rules run sequentially (not parallel) to avoid overwhelming the system
 *   when rules do file I/O. Network rules could be parallelized later.
 * - Every rule failure is captured and reported, never silently swallowed.
 * - Skipped rules are tracked so the user knows what wasn't checked.
 */

import type {
  Rule,
  RuleContext,
  Finding,
  SkippedRule,
  FailedRule,
} from '../types.js';

export interface RuleEngineResult {
  findings: Finding[];
  skippedRules: SkippedRule[];
  failedRules: FailedRule[];
}

/**
 * Run all provided rules against the project context.
 *
 * @param rules - Rules to execute.
 * @param context - Project context (files, package.json, etc.).
 * @returns Collected findings, skipped rules, and failed rules.
 */
export async function runRules(
  rules: Rule[],
  context: RuleContext
): Promise<RuleEngineResult> {
  const findings: Finding[] = [];
  const skippedRules: SkippedRule[] = [];
  const failedRules: FailedRule[] = [];

  for (const rule of rules) {
    // Skip network-dependent rules in offline mode
    if (rule.requiresNetwork && context.offline) {
      skippedRules.push({
        ruleId: rule.id,
        reason: 'Skipped because --offline flag is set. This rule requires network access to check npm registry.',
      });
      continue;
    }

    // Skip platform-specific rules that don't match the detected platform
    if (
      rule.platform !== 'universal' &&
      rule.platform !== context.detectedPlatform.platform
    ) {
      // Don't report this as "skipped" — it's expected behavior.
      // Only log if user manually overrode the platform.
      continue;
    }

    try {
      const result = rule.detect(context);
      // Handle both sync and async rules
      const ruleFindings = result instanceof Promise ? await result : result;
      findings.push(...ruleFindings);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      failedRules.push({
        ruleId: rule.id,
        error: `Rule "${rule.name}" failed during execution: ${errorMessage}`,
      });
    }
  }

  return { findings, skippedRules, failedRules };
}
