/**
 * Bolt-Specific Lock-In Rules
 *
 * These rules detect vendor lock-in patterns specific to projects exported
 * from Bolt (bolt.new / StackBlitz). They run only when the platform is detected
 * as Bolt (or when the user overrides with --platform bolt).
 *
 * VALIDATION STATUS:
 * - BOLT_CONFIG_001: Validated against a real Bolt export (contains .bolt/ directory).
 *
 * RETIRED RULES:
 * - BOLT_SCOPED_DEP_001: Proprietary/Scoped Dependencies. Retired after manual inspection
 *   of real Bolt exports confirmed Bolt does not inject scoped build dependencies
 *   (unlike Lovable's @lovable.dev/* packages).
 * - BOLT_RUNTIME_ASSUMPTION_001: WebContainer Runtime Assumptions. Retired after manual
 *   inspection confirmed WebContainers represent a StackBlitz browser execution environment
 *   concern that leaves no proprietary runtime footprint in the exported codebase.
 */

import type { Rule, RuleContext, Finding } from '../../types.js';
import { join } from 'node:path';

let findingCounter = 0;
function nextFindingId(ruleId: string): string {
  return `${ruleId}-${++findingCounter}`;
}

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

/** All Bolt platform-specific rules. */
export const boltRules: Rule[] = [
  boltConfig,
];
