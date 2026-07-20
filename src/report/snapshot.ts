/**
 * Report Snapshot — saves/loads/diffs analysis reports.
 *
 * On every `analyse` run, we persist a lightweight snapshot to
 * `<projectRoot>/.deviber/last-report.json`. The next run automatically
 * diffs against this snapshot so users can see exactly what transform fixed
 * and what still needs attention.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FindingSnapshot {
  /** Stable key for deduplication across runs: ruleId + ':' + relative file path */
  key: string;
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'portability' | 'security';
  file: string;
  message: string;
}

export interface ReportSnapshot {
  timestamp: string;
  cliVersion: string;
  portabilityScore: number;
  securityScore: number;
  totalFindings: number;
  findings: FindingSnapshot[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function snapshotPath(projectRoot: string): string {
  return join(projectRoot, '.deviber', 'last-report.json');
}

/**
 * Produce a stable dedup key for a finding so we can match it across runs.
 * We use ruleId + file (relative) because the same rule firing on the same
 * file is effectively the same finding.
 */
function findingKey(projectRoot: string, ruleId: string, file: string): string {
  const rel = file.startsWith(projectRoot) ? file.slice(projectRoot.length + 1) : file;
  return `${ruleId}::${rel}`;
}

// ─── Save ────────────────────────────────────────────────────────────────────

export function saveSnapshot(projectRoot: string, report: {
  cliVersion: string;
  portabilityScore: { score: number };
  securityScore: { score: number };
  summary: { totalFindings: number };
  findings: Array<{
    ruleId: string;
    ruleName: string;
    severity: string;
    category: string;
    file?: string;
    message: string;
  }>;
}): void {
  const dir = join(projectRoot, '.deviber');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const snapshot: ReportSnapshot = {
    timestamp: new Date().toISOString(),
    cliVersion: report.cliVersion,
    portabilityScore: report.portabilityScore.score,
    securityScore: report.securityScore.score,
    totalFindings: report.summary.totalFindings,
    findings: report.findings.map(f => ({
      key: findingKey(projectRoot, f.ruleId, f.file ?? ''),
      ruleId: f.ruleId,
      ruleName: f.ruleName,
      severity: f.severity as FindingSnapshot['severity'],
      category: f.category as FindingSnapshot['category'],
      file: f.file ?? '',
      message: f.message,
    })),
  };

  writeFileSync(snapshotPath(projectRoot), JSON.stringify(snapshot, null, 2), 'utf-8');
}

// ─── Load ────────────────────────────────────────────────────────────────────

export function loadSnapshot(projectRoot: string): ReportSnapshot | null {
  const path = snapshotPath(projectRoot);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ReportSnapshot;
  } catch {
    return null;
  }
}

// ─── Diff & Print ────────────────────────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: 'ℹ️ ',
};

export function printDiff(
  projectRoot: string,
  previous: ReportSnapshot,
  currentFindings: Array<{
    ruleId: string;
    ruleName: string;
    severity: string;
    category: string;
    file?: string;
    message: string;
  }>,
  currentPortability: number,
  currentSecurity: number,
): void {
  const prevKeys = new Set(previous.findings.map(f => f.key));
  const currMap = new Map(
    currentFindings.map(f => [
      findingKey(projectRoot, f.ruleId, f.file ?? ''),
      f,
    ])
  );

  const fixed = previous.findings.filter(f => !currMap.has(f.key));
  const newFindings = [...currMap.entries()]
    .filter(([k]) => !prevKeys.has(k))
    .map(([, f]) => f);

  const portDelta = currentPortability - previous.portabilityScore;
  const secDelta = currentSecurity - previous.securityScore;
  const totalDelta = (currMap.size) - previous.totalFindings;

  const scannedAt = new Date(previous.timestamp).toLocaleString();

  console.log('\n' + chalk.dim('─'.repeat(60)));
  console.log(chalk.bold('📈 Changes since last scan') + chalk.dim(` (${scannedAt})`));
  console.log(chalk.dim('─'.repeat(60)));

  // Score delta
  const portStr = portDelta >= 0
    ? chalk.green(`+${portDelta}`)
    : chalk.red(`${portDelta}`);
  const secStr = secDelta >= 0
    ? chalk.green(`+${secDelta}`)
    : chalk.red(`${secDelta}`);
  const totalStr = totalDelta <= 0
    ? chalk.green(`${totalDelta}`)
    : chalk.red(`+${totalDelta}`);

  console.log(
    `  Portability: ${previous.portabilityScore} → ${chalk.bold(currentPortability)} (${portStr} pts)  ` +
    `Security: ${previous.securityScore} → ${chalk.bold(currentSecurity)} (${secStr} pts)  ` +
    `Findings: ${previous.totalFindings} → ${chalk.bold(currMap.size)} (${totalStr})`
  );

  // Fixed findings
  if (fixed.length > 0) {
    console.log(chalk.green(`\n✅ Fixed (${fixed.length}):`));
    for (const f of fixed) {
      const rel = f.file.startsWith(projectRoot) ? f.file.slice(projectRoot.length + 1) : f.file;
      console.log(
        `  ${SEVERITY_EMOJI[f.severity] ?? '•'} ${chalk.bold(f.ruleName)}` +
        (rel ? chalk.dim(` — ${rel}`) : '')
      );
    }
  }

  // New findings
  if (newFindings.length > 0) {
    console.log(chalk.red(`\n🆕 New findings (${newFindings.length}):`));
    for (const f of newFindings) {
      const rel = (f.file ?? '').startsWith(projectRoot) ? (f.file ?? '').slice(projectRoot.length + 1) : (f.file ?? '');
      console.log(
        `  ${SEVERITY_EMOJI[f.severity] ?? '•'} ${chalk.bold(f.ruleName)}` +
        (rel ? chalk.dim(` — ${rel}`) : '')
      );
    }
  }

  // Still open
  const stillOpen = previous.findings.filter(f => currMap.has(f.key));
  if (stillOpen.length > 0) {
    console.log(chalk.yellow(`\n⚠️  Still open (${stillOpen.length}):`));
    for (const f of stillOpen) {
      const rel = f.file.startsWith(projectRoot) ? f.file.slice(projectRoot.length + 1) : f.file;
      console.log(
        `  ${SEVERITY_EMOJI[f.severity] ?? '•'} ${chalk.bold(f.ruleName)}` +
        (rel ? chalk.dim(` — ${rel}`) : '')
      );
    }
  }

  if (fixed.length === 0 && newFindings.length === 0) {
    console.log(chalk.dim('\n  No changes since last scan.'));
  }

  console.log(chalk.dim('─'.repeat(60)));
}
