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
 * Detects @lovable.dev/* scoped packages or lovable-tagger in package.json.
 * These are build/dev dependencies that won't resolve outside
 * Lovable's ecosystem or tag code for editing. The project will fail to install
 * or carry unwanted editor overhead on a standard machine unless these are replaced.
 *
 * Validated: Yes — real Lovable exports include packages like
 * @lovable.dev/ui in devDependencies, or lovable-tagger.
 */
const lovableScopedDeps: Rule = {
  id: 'LOVABLE_SCOPED_DEP_001',
  name: 'Lovable-Scoped/Specific Package Dependencies',
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
      if (depName.startsWith('@lovable.dev/') || depName === 'lovable-tagger') {
        const depType = pkg.dependencies?.[depName]
          ? 'dependency'
          : 'devDependency';

        findings.push({
          id: nextFindingId('LOVABLE_SCOPED_DEP_001'),
          ruleId: 'LOVABLE_SCOPED_DEP_001',
          ruleName: 'Lovable-Scoped/Specific Package Dependencies',
          category: 'portability',
          severity: 'high',
          confidence: 'high',
          file: join(context.projectRoot, 'package.json'),
          message: `Found Lovable-specific package: ${depName}@${version} (${depType})`,
          userActionableMessage:
            `Your project depends on "${depName}" which is a package owned or used by Lovable. ` +
            `This package won't be useful or available if you move your project off Lovable's platform. ` +
            `You'll need to find a standard replacement or remove it before deploying elsewhere. ` +
            `Check if this package provides UI components, taggers, utilities, or build tools, and ` +
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
  autoFixable: true,
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
          autoFixable: true,
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
        autoFixable: true,
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

/**
 * LOVABLE_CLOUD_DATA_RISK_001
 *
 * Detects whether the project connects to Lovable Cloud Supabase hosting.
 */
const lovableCloudDataRisk: Rule = {
  id: 'LOVABLE_CLOUD_DATA_RISK_001',
  name: 'Lovable Cloud Managed Database Risk',
  category: 'portability',
  severity: 'high',
  confidence: 'high',
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
        f.endsWith('.jsx') ||
        f.endsWith('.json') ||
        f.endsWith('.env') ||
        f.endsWith('.env.local')
    );

    const cloudDomainPattern = /supabase\.lovable\.(?:app|co|dev)/gi;

    for (const file of targetFiles) {
      const content = await context.readFile(file);
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        cloudDomainPattern.lastIndex = 0;
        const match = cloudDomainPattern.exec(lines[i]);
        if (match) {
          findings.push({
            id: nextFindingId('LOVABLE_CLOUD_DATA_RISK_001'),
            ruleId: 'LOVABLE_CLOUD_DATA_RISK_001',
            ruleName: 'Lovable Cloud Managed Database Risk',
            category: 'portability',
            severity: 'high',
            confidence: 'high',
            file: join(context.projectRoot, file),
            line: i + 1,
            message: 'Project is connecting to Lovable Cloud Supabase hosting',
            userActionableMessage:
              'Your project connects to a Lovable Cloud managed Supabase database. ' +
              'Note that exporting your code does NOT automatically copy or export your actual database records, user auth accounts, or storage files. ' +
              'If you delete or disconnect the Lovable project, your database records will be permanently deleted and cannot be undone. ' +
              'You MUST manually export your data tables (as CSV/SQL), storage assets, and auth records from Lovable/Supabase before shutting it down.',
            autoFixable: false,
            evidence: lines[i].trim(),
          });
        }
      }
    }

    return findings;
  },
};

/**
 * LOVABLE_API_GATEWAY_001
 *
 * Detects usage of Lovable AI Gateway (ai.gateway.lovable.dev) or LOVABLE_API_KEY env variables.
 */
const lovableApiGateway: Rule = {
  id: 'LOVABLE_API_GATEWAY_001',
  name: 'Lovable AI Gateway Dependency',
  category: 'portability',
  severity: 'high',
  confidence: 'high',
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
        f.endsWith('.jsx') ||
        f.endsWith('.json') ||
        f.endsWith('.env') ||
        f.endsWith('.env.local') ||
        f.endsWith('.toml')
    );

    const gatewayPattern = /ai\.gateway\.lovable\.dev|LOVABLE_API_KEY/gi;

    for (const file of targetFiles) {
      const content = await context.readFile(file);
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        gatewayPattern.lastIndex = 0;
        const match = gatewayPattern.exec(lines[i]);
        if (match) {
          findings.push({
            id: nextFindingId('LOVABLE_API_GATEWAY_001'),
            ruleId: 'LOVABLE_API_GATEWAY_001',
            ruleName: 'Lovable AI Gateway Dependency',
            category: 'portability',
            severity: 'high',
            confidence: 'high',
            file: join(context.projectRoot, file),
            line: i + 1,
            message: `Found Lovable AI Gateway dependency or configuration: ${match[0]}`,
            userActionableMessage:
              'Your project makes calls to or configures the Lovable AI Gateway (ai.gateway.lovable.dev or LOVABLE_API_KEY). ' +
              'If you host this project independently outside of Lovable, these API calls will fail once ' +
              'your Lovable credentials or gateway permissions expire. You should modify the code to connect directly ' +
              'to your own LLM providers (e.g. OpenAI, Anthropic, Gemini) and configure standard environment variables.',
            autoFixable: false,
            evidence: lines[i].trim(),
          });
        }
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
  lovableCloudDataRisk,
  lovableApiGateway,
];
