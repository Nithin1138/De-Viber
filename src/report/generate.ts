/**
 * Report Generator — Scoring + Rendering
 *
 * Produces human-readable Markdown reports and machine-readable JSON
 * from scan findings. Separates Portability Score and Security Score
 * as independent axes — collapsing "can I leave this platform" and
 * "is this app secure" into a single number would hide which problem
 * is worse.
 *
 * SCORING CALIBRATION:
 * Severity weights are initial estimates. They need calibration against
 * real project reports to confirm the resulting scores rank projects
 * the way a human reviewer would. Adjust based on evidence, not vibes.
 * See the SEVERITY_WEIGHT constant below.
 */

import type {
  Finding,
  PortabilityReport,
  ScoreBreakdown,
  ScoreFactor,
  Grade,
  Severity,
  ReportSummary,
  SkippedRule,
  FailedRule,
  PlatformDetection,
  FindingCategory,
} from '../types.js';

// ─── Scoring Configuration ──────────────────────────────────────────────────

/**
 * Penalty points per finding, by severity.
 *
 * CALIBRATION STATUS: Initial estimates — not yet validated against
 * real project diversity. These weights should be revisited after
 * running against 5+ real projects to confirm they produce scores
 * that match human intuition about relative project quality.
 *
 * Rationale for current values:
 * - critical (25): A single critical finding (e.g., exposed service-role key)
 *   should drop the score dramatically — these are showstoppers.
 * - high (15): Significant issues (missing RLS, hallucinated deps) that
 *   need fixing before production.
 * - medium (8): Important but not blocking (client-side role checks with
 *   server-side backup, IDOR hints).
 * - low (3): Minor issues worth noting.
 * - info (1): FYI items that barely affect the score.
 */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

// ─── Score Computation ──────────────────────────────────────────────────────

function computeScore(findings: Finding[]): ScoreBreakdown {
  if (findings.length === 0) {
    return {
      score: 100,
      grade: 'A',
      factors: [],
    };
  }

  // Group findings by rule for factor breakdown
  const ruleGroups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const group = ruleGroups.get(finding.ruleId) ?? [];
    group.push(finding);
    ruleGroups.set(finding.ruleId, group);
  }

  const factors: ScoreFactor[] = [];
  let totalPenalty = 0;

  for (const [ruleId, ruleFindings] of ruleGroups) {
    const severity = ruleFindings[0].severity;
    const weight = SEVERITY_WEIGHT[severity];
    // Diminishing returns: first finding of a rule type has full weight,
    // subsequent findings have reduced weight (sqrt scaling)
    const penalty = Math.round(weight * Math.sqrt(ruleFindings.length));

    factors.push({
      name: ruleFindings[0].ruleName,
      count: ruleFindings.length,
      penalty,
      severity,
    });

    totalPenalty += penalty;
  }

  // Sort factors by penalty descending (worst first)
  factors.sort((a, b) => b.penalty - a.penalty);

  const rawScore = Math.max(0, Math.min(100, 100 - totalPenalty));

  return {
    score: rawScore,
    grade: scoreToGrade(rawScore),
    factors,
  };
}

function scoreToGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ─── Summary Computation ────────────────────────────────────────────────────

function computeSummary(findings: Finding[], filesScanned: number): ReportSummary {
  return {
    totalFindings: findings.length,
    portabilityFindings: findings.filter((f) => f.category === 'portability').length,
    securityFindings: findings.filter((f) => f.category === 'security').length,
    criticalCount: findings.filter((f) => f.severity === 'critical').length,
    highCount: findings.filter((f) => f.severity === 'high').length,
    mediumCount: findings.filter((f) => f.severity === 'medium').length,
    lowCount: findings.filter((f) => f.severity === 'low').length,
    infoCount: findings.filter((f) => f.severity === 'info').length,
    autoFixableCount: findings.filter((f) => f.autoFixable).length,
    filesScanned,
  };
}

// ─── Report Generation ──────────────────────────────────────────────────────

export interface GenerateReportInput {
  projectName: string;
  platformDetection: PlatformDetection;
  findings: Finding[];
  skippedRules: SkippedRule[];
  failedRules: FailedRule[];
  filesScanned: number;
  cliVersion: string;
}

/**
 * Generate a complete analysis report.
 */
export function generateReport(input: GenerateReportInput): PortabilityReport {
  const portabilityFindings = input.findings.filter((f) => f.category === 'portability');
  const securityFindings = input.findings.filter((f) => f.category === 'security');

  return {
    projectName: input.projectName,
    timestamp: new Date().toISOString(),
    cliVersion: input.cliVersion,
    platformDetection: input.platformDetection,
    findings: input.findings,
    portabilityScore: computeScore(portabilityFindings),
    securityScore: computeScore(securityFindings),
    summary: computeSummary(input.findings, input.filesScanned),
    skippedRules: input.skippedRules,
    failedRules: input.failedRules,
  };
}

// ─── Markdown Rendering ─────────────────────────────────────────────────────

function severityEmoji(severity: Severity): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🔵';
    case 'info': return 'ℹ️';
  }
}

function gradeEmoji(grade: Grade): string {
  switch (grade) {
    case 'A': return '✅';
    case 'B': return '🟢';
    case 'C': return '🟡';
    case 'D': return '🟠';
    case 'F': return '🔴';
  }
}

function renderFindingsSection(
  title: string,
  findings: Finding[],
  score: ScoreBreakdown
): string {
  const lines: string[] = [];

  lines.push(`## ${title}`);
  lines.push('');
  lines.push(`**Score: ${score.score}/100** ${gradeEmoji(score.grade)} Grade: ${score.grade}`);
  lines.push('');

  if (findings.length === 0) {
    lines.push('No issues found. ✅');
    lines.push('');
    return lines.join('\n');
  }

  // Score factors table
  if (score.factors.length > 0) {
    lines.push('### Score Breakdown');
    lines.push('');
    lines.push('| Issue | Count | Severity | Score Impact |');
    lines.push('|---|---|---|---|');
    for (const factor of score.factors) {
      lines.push(
        `| ${factor.name} | ${factor.count} | ${severityEmoji(factor.severity)} ${factor.severity} | -${factor.penalty} pts |`
      );
    }
    lines.push('');
  }

  // Individual findings
  lines.push('### Details');
  lines.push('');

  // Group by severity for readability
  const bySeverity = new Map<Severity, Finding[]>();
  for (const f of findings) {
    const group = bySeverity.get(f.severity) ?? [];
    group.push(f);
    bySeverity.set(f.severity, group);
  }

  const severityOrder: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
  for (const sev of severityOrder) {
    const group = bySeverity.get(sev);
    if (!group || group.length === 0) continue;

    for (const finding of group) {
      const location = finding.line
        ? `${finding.file}:${finding.line}`
        : finding.file;
      const confidenceNote =
        finding.confidence === 'low'
          ? ' *(low confidence — manual review recommended)*'
          : finding.confidence === 'medium'
            ? ' *(medium confidence)*'
            : '';

      lines.push(`#### ${severityEmoji(finding.severity)} ${finding.message}${confidenceNote}`);
      lines.push('');
      lines.push(`**File:** \`${location}\``);
      lines.push('');
      lines.push(`**What to do:** ${finding.userActionableMessage}`);
      lines.push('');
      if (finding.evidence) {
        lines.push(`<details><summary>Evidence</summary>`);
        lines.push('');
        lines.push('```');
        lines.push(finding.evidence);
        lines.push('```');
        lines.push('</details>');
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Render a report as Markdown.
 * Written for a non-technical founder — every section should be
 * understandable without a development background.
 */
export function renderMarkdown(report: PortabilityReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`# 📋 Portability & Security Report`);
  lines.push('');
  lines.push(`**Project:** ${report.projectName}`);
  lines.push(`**Scanned:** ${new Date(report.timestamp).toLocaleString()}`);
  lines.push(`**CLI Version:** ${report.cliVersion}`);
  lines.push('');

  // Platform detection
  const pd = report.platformDetection;
  if (pd.platform !== 'unknown') {
    const confNote =
      pd.confidence === 'high'
        ? ''
        : pd.confidence === 'medium'
          ? ' *(medium confidence — if this is wrong, re-run with `--platform <name>`)*'
          : ' *(low confidence — consider re-running with `--platform <name>`)*';
    lines.push(`**Detected Platform:** ${pd.platform}${confNote}`);
  } else {
    lines.push('**Detected Platform:** Unknown (no platform-specific markers found)');
  }
  lines.push(`**Files Scanned:** ${report.summary.filesScanned}`);
  lines.push('');

  // Quick Summary
  lines.push('## Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Portability Score | ${report.portabilityScore.score}/100 (${report.portabilityScore.grade}) |`);
  lines.push(`| Security Score | ${report.securityScore.score}/100 (${report.securityScore.grade}) |`);
  lines.push(`| Total Findings | ${report.summary.totalFindings} |`);
  if (report.summary.criticalCount > 0) {
    lines.push(`| 🔴 Critical | ${report.summary.criticalCount} |`);
  }
  if (report.summary.highCount > 0) {
    lines.push(`| 🟠 High | ${report.summary.highCount} |`);
  }
  if (report.summary.mediumCount > 0) {
    lines.push(`| 🟡 Medium | ${report.summary.mediumCount} |`);
  }
  if (report.summary.lowCount > 0) {
    lines.push(`| 🔵 Low | ${report.summary.lowCount} |`);
  }
  if (report.summary.infoCount > 0) {
    lines.push(`| ℹ️ Info | ${report.summary.infoCount} |`);
  }
  lines.push('');

  // Portability Findings
  const portFindings = report.findings.filter((f) => f.category === 'portability');
  lines.push(renderFindingsSection(
    'Portability Findings (Lock-In Risk)',
    portFindings,
    report.portabilityScore
  ));

  // Security Findings
  const secFindings = report.findings.filter((f) => f.category === 'security');
  lines.push(renderFindingsSection(
    'Security Findings (Production Readiness)',
    secFindings,
    report.securityScore
  ));

  // Skipped rules
  if (report.skippedRules.length > 0) {
    lines.push('## ⏭️ Skipped Checks');
    lines.push('');
    lines.push('The following checks were skipped during this scan:');
    lines.push('');
    for (const skipped of report.skippedRules) {
      lines.push(`- **${skipped.ruleId}**: ${skipped.reason}`);
    }
    lines.push('');
  }

  // Failed rules
  if (report.failedRules.length > 0) {
    lines.push('## ⚠️ Failed Checks');
    lines.push('');
    lines.push('The following checks encountered errors (results may be incomplete):');
    lines.push('');
    for (const failed of report.failedRules) {
      lines.push(`- **${failed.ruleId}**: ${failed.error}`);
    }
    lines.push('');
  }

  // Disclaimer
  lines.push('---');
  lines.push('');
  lines.push('*This report was generated by deviber-cli. Findings marked as "low confidence" ');
  lines.push('or "review hint" are heuristic-based and may produce false positives. Always ');
  lines.push('verify critical findings manually before making changes. This tool is provided ');
  lines.push('"as-is" with no warranty — see the LICENSE for details.*');
  lines.push('');

  return lines.join('\n');
}

/**
 * Render a report as JSON.
 */
export function renderJson(report: PortabilityReport): string {
  return JSON.stringify(report, null, 2);
}
