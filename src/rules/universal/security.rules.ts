/**
 * Universal Security Rules
 *
 * These rules detect common security issues in AI-generated codebases,
 * regardless of which platform they were exported from. They run on
 * every scan.
 *
 * Rules in this file:
 * 1. SEC_HARDCODED_SECRET_001 — Hardcoded API keys and secrets
 * 2. SEC_CLIENT_ROLE_001 — Client-side-only role enforcement
 * 3. SEC_MISSING_RLS_001 — Missing Row Level Security on Supabase tables
 * 4. SEC_POSSIBLE_IDOR_001 — Ownership-blind database queries (heuristic)
 *
 * IMPORTANT: All heuristic-based rules clearly state their confidence
 * level in every finding. We never let the tool's presentation suggest
 * more confidence than the detection method warrants.
 */

import type { Rule, RuleContext, Finding } from '../../types.js';
import { join } from 'node:path';

let findingCounter = 0;
function nextFindingId(ruleId: string): string {
  return `${ruleId}-${++findingCounter}`;
}

// ─── Helper: Classify file as UI-layer or server-layer ──────────────────────

/**
 * Determines if a file is in the UI/frontend layer.
 * Used to distinguish client-side-only role checks from server-side ones.
 */
function isUILayerFile(filePath: string): boolean {
  const uiPatterns = [
    /^(?:src\/)?components\//,
    /^(?:src\/)?pages\//,
    /^(?:src\/)?routes\//,
    /^(?:src\/)?views\//,
    /^(?:src\/)?app\//,
    /^(?:src\/)?layouts\//,
    /^(?:src\/)?screens\//,
  ];
  return uiPatterns.some((p) => p.test(filePath));
}

function isServerLayerFile(filePath: string): boolean {
  const serverPatterns = [
    /^(?:src\/)?api\//,
    /^(?:src\/)?server\//,
    /^(?:src\/)?functions\//,
    /^(?:src\/)?middleware\//,
    /^(?:src\/)?edge-?functions?\//,
    /^supabase\/functions\//,
    /^(?:supabase\/)?functions\//,
    /supabase\/.*\.sql$/,
    /\.server\.[tj]sx?$/,
  ];
  return serverPatterns.some((p) => p.test(filePath));
}

// ═══════════════════════════════════════════════════════════════════════════
// SEC_HARDCODED_SECRET_001 — Hardcoded API Keys and Secrets
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Known secret patterns with named groups for clear reporting.
 * Each pattern matches a specific vendor's key format.
 */
const SECRET_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: 'AWS Access Key',
    pattern: /(?:AKIA[0-9A-Z]{16})/,
  },
  {
    name: 'Stripe Secret Key',
    pattern: /(?:sk_(?:live|test)_[a-zA-Z0-9]{20,})/,
  },
  {
    name: 'GitHub Personal Access Token',
    pattern: /(?:ghp_[a-zA-Z0-9]{36,})/,
  },
  {
    name: 'Stripe Publishable Key (test)',
    pattern: /(?:pk_test_[a-zA-Z0-9]{20,})/,
  },
];

/**
 * Generic pattern: variable names that look like secrets assigned to
 * string literals (not env references).
 *
 * Matches:
 *   const API_KEY = "sk_live_abc123..."
 *   let secret = 'some-long-secret-value'
 *
 * Does NOT match:
 *   const API_KEY = process.env.API_KEY
 *   const API_KEY = import.meta.env.VITE_API_KEY
 */
const GENERIC_SECRET_PATTERN =
  /(?:const|let|var|export)\s+(\w*(?:api_?key|secret|token|password|access_?key|service_role|private_?key)\w*)\s*=\s*['"`]([^'"`]{16,})['"`]/gi;

/**
 * Supabase service-role key pattern — these should NEVER be in client code.
 * Matches a JWT-shaped string assigned to a variable with 'service' or 'secret' in the name.
 */
const SUPABASE_SERVICE_ROLE_PATTERN =
  /(?:service_?role|supabase_?(?:secret|service))\w*\s*[:=]\s*['"`](eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)['"`]/gi;

const hardcodedSecrets: Rule = {
  id: 'SEC_HARDCODED_SECRET_001',
  name: 'Hardcoded API Keys and Secrets',
  category: 'security',
  severity: 'high',
  confidence: 'medium',
  platform: 'universal',
  autoFixable: false,
  requiresNetwork: false,
  detect: async function (context: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const targetFiles = context.files.filter(
      (f) =>
        (f.endsWith('.ts') ||
          f.endsWith('.tsx') ||
          f.endsWith('.js') ||
          f.endsWith('.jsx') ||
          f.endsWith('.env') ||
          f.endsWith('.env.local') ||
          f.endsWith('.env.production')) &&
        !f.includes('node_modules') &&
        !f.includes('.test.') &&
        !f.includes('.spec.')
    );

    for (const file of targetFiles) {
      const content = await context.readFile(file);
      if (!content) continue;

      const lines = content.split('\n');

      // Check known vendor key patterns
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comments
        if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

        for (const { name, pattern } of SECRET_PATTERNS) {
          if (pattern.test(line)) {
            findings.push({
              id: nextFindingId('SEC_HARDCODED_SECRET_001'),
              ruleId: 'SEC_HARDCODED_SECRET_001',
              ruleName: 'Hardcoded API Keys and Secrets',
              category: 'security',
              severity: 'critical',
              confidence: 'high',
              file: join(context.projectRoot, file),
              line: i + 1,
              message: `Possible ${name} found hardcoded in source`,
              userActionableMessage:
                `This line appears to contain a hardcoded ${name}. ` +
                `Hardcoded secrets in source code are a serious security risk — anyone ` +
                `who can see your code (including in a public GitHub repo) can use this key. ` +
                `Move this value to an environment variable (e.g., process.env.YOUR_KEY_NAME) ` +
                `and add the .env file to your .gitignore. Then rotate (regenerate) the key ` +
                `since the old one may already be compromised.`,
              autoFixable: false,
              evidence: line.trim().slice(0, 80) + (line.trim().length > 80 ? '...' : ''),
            });
          }
        }

        // Check Supabase service-role pattern
        SUPABASE_SERVICE_ROLE_PATTERN.lastIndex = 0;
        const supabaseMatch = SUPABASE_SERVICE_ROLE_PATTERN.exec(line);
        if (supabaseMatch) {
          findings.push({
            id: nextFindingId('SEC_HARDCODED_SECRET_001'),
            ruleId: 'SEC_HARDCODED_SECRET_001',
            ruleName: 'Hardcoded API Keys and Secrets',
            category: 'security',
            severity: 'critical',
            confidence: 'high',
            file: join(context.projectRoot, file),
            line: i + 1,
            message: 'Supabase service-role key found hardcoded in source',
            userActionableMessage:
              'This line contains a Supabase service-role key hardcoded directly in your code. ' +
              'The service-role key bypasses all Row Level Security (RLS) rules, meaning anyone ' +
              'with this key can read, write, and delete ALL data in your database. ' +
              'This key should NEVER appear in client-side code. Move it to an environment ' +
              'variable and use it only in server-side code (API routes, edge functions). ' +
              'Then regenerate the key in your Supabase dashboard immediately.',
            autoFixable: false,
            evidence: line.trim().slice(0, 40) + '... [REDACTED]',
          });
        }

        // Check generic secret variable pattern
        GENERIC_SECRET_PATTERN.lastIndex = 0;
        let genericMatch: RegExpExecArray | null;
        while ((genericMatch = GENERIC_SECRET_PATTERN.exec(line)) !== null) {
          const varName = genericMatch[1];
          const value = genericMatch[2];

          // Skip if the value looks like a placeholder or template
          if (
            /^(?:your[_-]|xxx|placeholder|example|test|demo|changeme|TODO)/i.test(value) ||
            /^\$\{/.test(value)
          ) {
            continue;
          }

          // Skip if it's an env reference
          if (/process\.env|import\.meta\.env/i.test(line)) {
            continue;
          }

          findings.push({
            id: nextFindingId('SEC_HARDCODED_SECRET_001'),
            ruleId: 'SEC_HARDCODED_SECRET_001',
            ruleName: 'Hardcoded API Keys and Secrets',
            category: 'security',
            severity: 'high',
            confidence: 'medium',
            file: join(context.projectRoot, file),
            line: i + 1,
            message: `Variable "${varName}" appears to contain a hardcoded secret`,
            userActionableMessage:
              `The variable "${varName}" looks like it contains a secret value ` +
              `hardcoded directly in code. If this is a real API key, token, or password, ` +
              `move it to an environment variable and add .env to your .gitignore. ` +
              `Note: this detection is based on the variable name — if this is a ` +
              `false positive (e.g., a test fixture or placeholder), you can ignore it.`,
            autoFixable: false,
            evidence: `${varName} = "${value.slice(0, 20)}..."`,
          });
        }
      }
    }

    return findings;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SEC_CLIENT_ROLE_001 — Client-Side-Only Role Enforcement
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Patterns that indicate role-based access control in code.
 */
const ROLE_CHECK_PATTERNS = [
  /user\.role\s*[!=]==?\s*['"`]admin['"`]/i,
  /role\s*[!=]==?\s*['"`]admin['"`]/i,
  /isAdmin/,
  /is_admin/,
  /user\.is_?admin/i,
  /\.role\s*[!=]==?\s*['"`](?:admin|moderator|superuser|owner)['"`]/i,
  /hasRole\s*\(/i,
  /checkPermission/i,
];

const clientSideRoleCheck: Rule = {
  id: 'SEC_CLIENT_ROLE_001',
  name: 'Client-Side-Only Role Enforcement',
  category: 'security',
  severity: 'medium',
  confidence: 'medium',
  platform: 'universal',
  autoFixable: false,
  requiresNetwork: false,
  detect: async function (context: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = [];

    // First, check if there are ANY server-side role checks
    const serverFiles = context.files.filter(
      (f) =>
        isServerLayerFile(f) &&
        (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx'))
    );

    let hasServerSideRoleCheck = false;
    for (const file of serverFiles) {
      const content = await context.readFile(file);
      if (!content) continue;
      if (ROLE_CHECK_PATTERNS.some((p) => p.test(content))) {
        hasServerSideRoleCheck = true;
        break;
      }
    }

    // Also check SQL files for RLS policies that reference roles
    const sqlFiles = context.files.filter((f) => f.endsWith('.sql'));
    for (const file of sqlFiles) {
      const content = await context.readFile(file);
      if (!content) continue;
      if (/auth\.jwt|auth\.role|auth\.uid/i.test(content)) {
        hasServerSideRoleCheck = true;
        break;
      }
    }

    // Now scan UI-layer files for role checks
    const uiFiles = context.files.filter(
      (f) =>
        isUILayerFile(f) &&
        (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx'))
    );

    for (const file of uiFiles) {
      const content = await context.readFile(file);
      if (!content) continue;

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Skip comments
        if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

        for (const pattern of ROLE_CHECK_PATTERNS) {
          if (pattern.test(line)) {
            const severity = hasServerSideRoleCheck ? 'medium' : 'high';
            findings.push({
              id: nextFindingId('SEC_CLIENT_ROLE_001'),
              ruleId: 'SEC_CLIENT_ROLE_001',
              ruleName: 'Client-Side-Only Role Enforcement',
              category: 'security',
              severity,
              confidence: 'medium',
              file: join(context.projectRoot, file),
              line: i + 1,
              message: `Client-side role check found${
                hasServerSideRoleCheck
                  ? ' (server-side checks also detected)'
                  : ' with NO matching server-side enforcement detected'
              }`,
              userActionableMessage: hasServerSideRoleCheck
                ? 'This file contains a role check (like checking if a user is an admin). ' +
                  'We also found role checks in your server-side code, which is good. ' +
                  'Make sure this client-side check is just for UI display (e.g., hiding ' +
                  'an admin button) and that the actual security enforcement happens server-side.'
                : 'This file contains a role check (like checking if a user is an admin), ' +
                  'but we could not find any matching role enforcement on the server side. ' +
                  'Client-side role checks are NOT real security — anyone can bypass them ' +
                  'using browser developer tools. You MUST add server-side role verification ' +
                  '(in an API route, edge function, or database RLS policy) to actually ' +
                  'protect admin-only functionality.',
              autoFixable: false,
              evidence: line.trim(),
            });
            break; // One finding per line, even if multiple patterns match
          }
        }
      }
    }

    return findings;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SEC_MISSING_RLS_001 — Missing Row Level Security on Supabase Tables
// ═══════════════════════════════════════════════════════════════════════════

const missingRLS: Rule = {
  id: 'SEC_MISSING_RLS_001',
  name: 'Missing Row Level Security (RLS)',
  category: 'security',
  severity: 'high',
  confidence: 'high',
  platform: 'universal',
  autoFixable: false,
  requiresNetwork: false,
  detect: async function (context: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const sqlFiles = context.files.filter((f) => f.endsWith('.sql'));

    // Collect all table names from CREATE TABLE statements
    const createTablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?["']?(\w+)["']?/gi;
    // Collect tables with RLS enabled
    const enableRLSPattern = /ALTER\s+TABLE\s+(?:public\.)?["']?(\w+)["']?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;

    const tablesCreated = new Map<string, { file: string; line: number }>();
    const tablesWithRLS = new Set<string>();

    for (const file of sqlFiles) {
      const content = await context.readFile(file);
      if (!content) continue;

      const lines = content.split('\n');

      // Find CREATE TABLE statements
      for (let i = 0; i < lines.length; i++) {
        createTablePattern.lastIndex = 0;
        const joinedLines = lines.slice(i, Math.min(i + 3, lines.length)).join(' ');
        const match = createTablePattern.exec(joinedLines);
        if (match) {
          const tableName = match[1].toLowerCase();
          // Skip internal/system tables
          if (!tableName.startsWith('_') && tableName !== 'schema_migrations') {
            tablesCreated.set(tableName, {
              file: join(context.projectRoot, file),
              line: i + 1,
            });
          }
        }
      }

      // Find ENABLE ROW LEVEL SECURITY statements
      enableRLSPattern.lastIndex = 0;
      let rlsMatch: RegExpExecArray | null;
      while ((rlsMatch = enableRLSPattern.exec(content)) !== null) {
        tablesWithRLS.add(rlsMatch[1].toLowerCase());
      }
    }

    // Flag tables that were created but don't have RLS enabled
    for (const [tableName, location] of tablesCreated) {
      if (!tablesWithRLS.has(tableName)) {
        findings.push({
          id: nextFindingId('SEC_MISSING_RLS_001'),
          ruleId: 'SEC_MISSING_RLS_001',
          ruleName: 'Missing Row Level Security (RLS)',
          category: 'security',
          severity: 'high',
          confidence: 'high',
          file: location.file,
          line: location.line,
          message: `Table "${tableName}" is created without Row Level Security (RLS) enabled`,
          userActionableMessage:
            `The database table "${tableName}" does not have Row Level Security (RLS) enabled. ` +
            `Without RLS, anyone with your Supabase anon key (which is public and visible in ` +
            `your frontend code) can read, write, and delete ALL rows in this table. ` +
            `You need to add: ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY; ` +
            `and then create appropriate policies (e.g., users can only read their own rows). ` +
            `This is one of the most common and dangerous security issues in Supabase apps.`,
          autoFixable: false,
          evidence: `CREATE TABLE ${tableName} (no matching ENABLE ROW LEVEL SECURITY found)`,
        });
      }
    }

    return findings;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SEC_POSSIBLE_IDOR_001 — Ownership-Blind Database Queries (Heuristic)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * This rule detects Supabase queries that filter by a resource ID
 * but don't also filter by the requesting user's ID.
 *
 * IMPORTANT: This is a LOW-CONFIDENCE heuristic. It uses regex-based
 * pattern matching on Supabase query chains. A proper implementation
 * would use ts-morph AST analysis to trace the full call chain, but
 * the current approach catches the most common patterns while being
 * transparent about its limitations.
 *
 * The build brief (§3) noted that the original 150-char text window
 * approach was too crude. This version:
 * - Scans the full statement/chain (from .from() to the next statement boundary)
 * - Checks for user_id/auth.uid() anywhere in the same chain
 * - Explicitly labels every finding as "review hint" with false-positive warning
 *
 * Future improvement: use ts-morph to parse the actual call chain AST.
 * Tracked as tech debt — see UNVALIDATED comment below.
 */
const possibleIDOR: Rule = {
  id: 'SEC_POSSIBLE_IDOR_001',
  name: 'Possible Insecure Direct Object Reference (IDOR)',
  category: 'security',
  severity: 'medium',
  confidence: 'low',
  platform: 'universal',
  autoFixable: false,
  requiresNetwork: false,
  detect: async function (context: RuleContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const targetFiles = context.files.filter(
      (f) =>
        (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) &&
        !f.includes('node_modules')
    );

    // Pattern: supabase.from('table')...eq('id', something)
    // We look for .from() calls followed by .eq('id', ...) in the same statement chain
    const fromPattern = /\.from\s*\(\s*['"`](\w+)['"`]\s*\)/g;

    for (const file of targetFiles) {
      const content = await context.readFile(file);
      if (!content) continue;

      // Split into logical statement blocks (rough: split on lines that
      // start a new statement/expression)
      const lines = content.split('\n');

      // Accumulate multi-line chains
      let chainBuffer = '';
      let chainStartLine = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

        // Detect chain start (a line containing .from())
        if (/\.from\s*\(/.test(line)) {
          chainBuffer = line;
          chainStartLine = i;
        } else if (chainBuffer) {
          // Continue accumulating if this looks like a chained call
          if (trimmed.startsWith('.') || trimmed.startsWith('await') || chainBuffer.endsWith('.')) {
            chainBuffer += ' ' + line;
          } else {
            // Chain ended — analyze it
            analyzeChain(chainBuffer, chainStartLine, file, findings, context);
            chainBuffer = '';
          }
        }
      }
      // Don't forget the last chain
      if (chainBuffer) {
        analyzeChain(chainBuffer, chainStartLine, file, findings, context);
      }
    }

    return findings;
  },
};

function analyzeChain(
  chain: string,
  startLine: number,
  file: string,
  findings: Finding[],
  context: RuleContext
): void {
  // Must have .from() and .eq() with an 'id'-like parameter
  const hasFrom = /\.from\s*\(\s*['"`]\w+['"`]\s*\)/.test(chain);
  const hasIdEq = /\.eq\s*\(\s*['"`](?:id)['"`]/.test(chain);

  if (!hasFrom || !hasIdEq) return;

  // Check if there's also a user-ownership filter
  const hasUserFilter =
    /\.eq\s*\(\s*['"`](?:user_id|owner_id|created_by|author_id)['"`]/.test(chain) ||
    /auth\.uid\s*\(\s*\)/.test(chain) ||
    /user\.id/.test(chain) ||
    /userId/.test(chain);

  if (hasUserFilter) return; // Has ownership check — probably fine

  // Extract table name for the message
  const tableMatch = /\.from\s*\(\s*['"`](\w+)['"`]\s*\)/.exec(chain);
  const tableName = tableMatch?.[1] ?? 'unknown';

  findings.push({
    id: nextFindingId('SEC_POSSIBLE_IDOR_001'),
    ruleId: 'SEC_POSSIBLE_IDOR_001',
    ruleName: 'Possible Insecure Direct Object Reference (IDOR)',
    category: 'security',
    severity: 'medium',
    confidence: 'low',
    file: join(context.projectRoot, file),
    line: startLine + 1,
    message: `Query on table "${tableName}" filters by ID but may not verify resource ownership`,
    userActionableMessage:
      `⚠️ REVIEW HINT (this is an automated heuristic that may produce false positives): ` +
      `This code queries the "${tableName}" table and filters by an ID, but we didn't ` +
      `find a check that verifies the requesting user actually owns this resource. ` +
      `Without ownership verification, a user could potentially access other users' ` +
      `data by guessing or enumerating IDs (an "IDOR" vulnerability). ` +
      `Please review this code path and confirm that either: (a) a user_id/owner check ` +
      `exists elsewhere in this flow, (b) RLS policies enforce ownership at the database ` +
      `level, or (c) this table's data is intentionally public.`,
    autoFixable: false,
    evidence: chain.trim().slice(0, 120) + (chain.trim().length > 120 ? '...' : ''),
  });
}

/** All universal security rules. */
export const securityRules: Rule[] = [
  hardcodedSecrets,
  clientSideRoleCheck,
  missingRLS,
  possibleIDOR,
];
