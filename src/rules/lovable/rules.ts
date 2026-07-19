/**
 * Lovable-Specific Lock-In Rules
 *
 * These rules detect vendor lock-in patterns specific to projects exported
 * from Lovable (lovable.dev). They run only when the platform is detected
 * as Lovable (or when the user overrides with --platform lovable).
 *
 * RETIRED RULES:
 * - LOVABLE_BADGE_001: Detected a DOM badge that only exists at Lovable's
 *   hosting/preview layer, never in exported source. It would never fire
 *   on any GitHub export. Retired per build brief §3/§6.
 *
 * VALIDATION STATUS:
 * - LOVABLE_SCOPED_DEP_001: Validated against real Lovable export pattern
 *   (@lovable.dev/* scoped packages appear in package.json devDependencies).
 * - LOVABLE_CONFIG_001: Validated against synthetic fixture. Needs real-project
 *   confirmation.
 * - LOVABLE_COMMENT_001: Validated against synthetic fixture. Needs real-project
 *   confirmation.
 */

import type { Rule, RuleContext, Finding } from '../../types.js';
import { join } from 'node:path';

let findingCounter = 0;
function nextFindingId(ruleId: string): string {
  return `${ruleId}-${++findingCounter}`;
}

/**
 * LOVABLE_SCOPED_DEP_001
 *
 * Detects @lovable.dev/* scoped packages in package.json.
 * These are build/dev dependencies that won't resolve outside
 * Lovable's ecosystem. The project will fail to install on a
 * standard machine unless these are replaced.
 *
 * Validated: Yes — real Lovable exports include packages like
 * @lovable.dev/ui in devDependencies.
 */
const lovableScopedDeps: Rule = {
  id: 'LOVABLE_SCOPED_DEP_001',
  name: 'Lovable-Scoped Package Dependencies',
  category: 'portability',
  severity: 'high',
  confidence: 'high',
  platform: 'lovable',
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
      if (depName.startsWith('@lovable.dev/')) {
        const depType = pkg.dependencies?.[depName]
          ? 'dependency'
          : 'devDependency';

        findings.push({
          id: nextFindingId('LOVABLE_SCOPED_DEP_001'),
          ruleId: 'LOVABLE_SCOPED_DEP_001',
          ruleName: 'Lovable-Scoped Package Dependencies',
          category: 'portability',
          severity: 'high',
          confidence: 'high',
          file: join(context.projectRoot, 'package.json'),
          message: `Found Lovable-scoped package: ${depName}@${version} (${depType})`,
          userActionableMessage:
            `Your project depends on "${depName}" which is a package owned by Lovable. ` +
            `This package won't be available if you move your project off Lovable's platform. ` +
            `You'll need to find a standard replacement or remove it before deploying elsewhere. ` +
            `Check if this package provides UI components, utilities, or build tools, and ` +
            `find an equivalent open-source alternative.`,
          autoFixable: false,
          evidence: `"${depName}": "${version}"`,
        });
      }
    }

    return findings;
  },
};

/**
 * LOVABLE_CONFIG_001
 *
 * Detects Lovable-specific configuration files that won't be recognized
 * by standard build tools or hosting platforms.
 *
 * Validated: Synthetic fixture only — needs real-project confirmation.
 */
const lovableConfig: Rule = {
  id: 'LOVABLE_CONFIG_001',
  name: 'Lovable-Specific Configuration Files',
  category: 'portability',
  severity: 'medium',
  confidence: 'high',
  platform: 'lovable',
  autoFixable: false,
  requiresNetwork: false,
  detect(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    const lovableConfigPatterns = [
      'lovable.config.ts',
      'lovable.config.js',
      'lovable.config.json',
    ];

    // Check for config files
    for (const file of context.files) {
      if (lovableConfigPatterns.includes(file)) {
        findings.push({
          id: nextFindingId('LOVABLE_CONFIG_001'),
          ruleId: 'LOVABLE_CONFIG_001',
          ruleName: 'Lovable-Specific Configuration Files',
          category: 'portability',
          severity: 'medium',
          confidence: 'high',
          file: join(context.projectRoot, file),
          message: `Found Lovable-specific config file: ${file}`,
          userActionableMessage:
            `The file "${file}" is a Lovable-specific configuration file. ` +
            `Standard hosting platforms (Vercel, Railway, Netlify) won't recognize it. ` +
            `You may need to migrate any relevant settings to the equivalent config ` +
            `for your target platform (e.g., vercel.json, railway.json).`,
          autoFixable: false,
          evidence: file,
        });
      }
    }

    // Check for .lovable directory
    const hasLovableDir = context.files.some(
      (f) => f.startsWith('.lovable/') || f.startsWith('.lovable\\')
    );
    if (hasLovableDir) {
      findings.push({
        id: nextFindingId('LOVABLE_CONFIG_001'),
        ruleId: 'LOVABLE_CONFIG_001',
        ruleName: 'Lovable-Specific Configuration Files',
        category: 'portability',
        severity: 'medium',
        confidence: 'high',
        file: join(context.projectRoot, '.lovable'),
        message: 'Found .lovable/ directory with platform-specific files',
        userActionableMessage:
          'Your project contains a ".lovable/" directory with platform-specific files. ' +
          'This directory is used by Lovable\'s build system and won\'t be needed ' +
          'when you deploy elsewhere. You can safely remove it after confirming ' +
          'no critical configuration has been placed there.',
        autoFixable: false,
        evidence: '.lovable/',
      });
    }

    return findings;
  },
};

/**
 * LOVABLE_COMMENT_001
 *
 * Detects Lovable/GPT-Pilot comment markers in source code.
 * These are informational — they don't break anything but indicate
 * AI-generated code that may need human review.
 *
 * Validated: Synthetic fixture only.
 */
const lovableComments: Rule = {
  id: 'LOVABLE_COMMENT_001',
  name: 'Lovable/GPT-Pilot Code Markers',
  category: 'portability',
  severity: 'info',
  confidence: 'medium',
  platform: 'lovable',
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

    // Pattern matches Lovable-specific comments/markers
    const markerPattern = /\/[/*]\s*(?:@lovable|lovable-generated|gpt-?pilot)/gi;

    for (const file of targetFiles) {
      const content = await context.readFile(file);
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const match = markerPattern.exec(lines[i]);
        if (match) {
          findings.push({
            id: nextFindingId('LOVABLE_COMMENT_001'),
            ruleId: 'LOVABLE_COMMENT_001',
            ruleName: 'Lovable/GPT-Pilot Code Markers',
            category: 'portability',
            severity: 'info',
            confidence: 'medium',
            file: join(context.projectRoot, file),
            line: i + 1,
            message: `Found Lovable code marker: ${match[0]}`,
            userActionableMessage:
              'This file contains a comment marker left by Lovable\'s AI code generator. ' +
              'It doesn\'t break anything, but it indicates code that was auto-generated ' +
              'and may benefit from a human review to ensure quality.',
            autoFixable: false,
            evidence: lines[i].trim(),
          });
        }
        // Reset regex lastIndex for global flag
        markerPattern.lastIndex = 0;
      }
    }

    return findings;
  },
};

/** All Lovable platform-specific rules. */
export const lovableRules: Rule[] = [
  lovableScopedDeps,
  lovableConfig,
  lovableComments,
];
