import type { PortabilityReport, Finding } from '../types.js';

export function renderDiligence(report: PortabilityReport): string {
  // 1. Calculate estimated migration effort
  let totalHours = 0;
  const roadmapItems: { finding: Finding; hours: number; action: string }[] = [];

  for (const f of report.findings) {
    let hours = 0.5;
    let action = '';

    if (f.category === 'portability') {
      if (f.severity === 'critical') {
        hours = 8;
        action = `Export database/storage schema and data from Lovable cloud resource.`;
      } else if (f.severity === 'high') {
        hours = 4;
        action = `Replace proprietary dependency with open-source/standard alternative.`;
      } else if (f.severity === 'medium') {
        hours = 2;
        action = `Modify custom code block or configuration settings.`;
      } else {
        hours = 0.5;
        action = `Clean up AI generation comments or temporary indicators.`;
      }
    } else { // security
      if (f.severity === 'critical') {
        hours = 8;
        action = `Remediate critical security vulnerability (e.g. expose of service role keys).`;
      } else if (f.severity === 'high') {
        hours = 4;
        action = `Implement auth validation/access guards on endpoints.`;
      } else if (f.severity === 'medium') {
        hours = 2;
        action = `Verify and enable Row Level Security (RLS) on DB tables or add ownership validation checks.`;
      } else {
        hours = 0.5;
        action = `Verify client-side validation logic or low-risk warning flags.`;
      }
    }

    totalHours += hours;
    roadmapItems.push({ finding: f, hours, action });
  }

  // Determine scale
  let effortScale = 'Low Effort';
  if (totalHours > 20) effortScale = 'High Effort';
  else if (totalHours > 8) effortScale = 'Moderate Effort';

  // Sort roadmap items by severity first (critical -> high -> medium -> low -> info)
  const severityRank: Record<string, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  };
  roadmapItems.sort((a, b) => severityRank[b.finding.severity] - severityRank[a.finding.severity]);

  // 2. Executive Narrative Paragraph
  const pGrade = report.portabilityScore.grade;
  const sGrade = report.securityScore.grade;
  const pScore = report.portabilityScore.score;
  const sScore = report.securityScore.score;

  let narrative = '';
  if (pScore >= 80 && sScore >= 80) {
    narrative = `The codebase for "${report.projectName}" displays a strong posture for independent hosting and production readiness, achieving a Portability grade of ${pGrade} (${pScore}/100) and a Security grade of ${sGrade} (${sScore}/100). Vendor lock-in is minimal. Migration to standard cloud environments (e.g., Vercel, Railway, Supabase self-hosted) is highly feasible and requires very little manual intervention.`;
  } else if (pScore >= 60 && sScore >= 60) {
    narrative = `The codebase for "${report.projectName}" is moderately portable, with a Portability grade of ${pGrade} (${pScore}/100) and a Security grade of ${sGrade} (${sScore}/100). While the application structure is clean, some proprietary dependencies or configuration blocks require manual replacement before the project can be safely hosted elsewhere. Additionally, key security practices (such as database RLS configuration or auth parameter checks) must be reviewed before public launch.`;
  } else {
    narrative = `The codebase for "${report.projectName}" has significant migration barriers and security concerns, marked by a Portability grade of ${pGrade} (${pScore}/100) and a Security grade of ${sGrade} (${sScore}/100). The estimated manual migration effort is ${effortScale} (${totalHours} hours). Key remediation steps must address proprietary lock-in packages, database credentials, or critical validation gaps before independent deployment can succeed.`;
  }

  // 3. Format Markdown output
  const lines: string[] = [];
  lines.push(`# 🏢 B2B Due Diligence & Portability Report`);
  lines.push(``);
  lines.push(`**Project Name:** \`${report.projectName}\`  `);
  lines.push(`**Date Generated:** ${new Date(report.timestamp).toLocaleDateString()}  `);
  lines.push(`**CLI Version:** v${report.cliVersion}  `);
  lines.push(`**Source Platform:** \`${report.platformDetection.platform}\` (Confidence: ${report.platformDetection.confidence.toUpperCase()})  `);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 📊 Executive Summary`);
  lines.push(``);
  lines.push(narrative);
  lines.push(``);
  lines.push(`### ⏱️ Migration Estimations`);
  lines.push(`- **Estimated Effort:** \`${totalHours} Hours\` (${effortScale})`);
  lines.push(`- **Total Findings:** \`${report.summary.totalFindings}\` (\`${report.summary.criticalCount}\` Critical, \`${report.summary.highCount}\` High, \`${report.summary.mediumCount}\` Medium, \`${report.summary.lowCount}\` Low)`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`## 🛡️ Risk & Posture Scorecard`);
  lines.push(``);
  lines.push(`| Dimension | Score | Grade | Status |`);
  lines.push(`|---|---|---|---|`);
  lines.push(`| **Portability (Vendor Lock-in)** | \`${pScore}/100\` | **${pGrade}** | ${pScore >= 80 ? '✅ Ready' : pScore >= 60 ? '⚠️ Caution' : '❌ Red'} |`);
  lines.push(`| **Security (Production Readiness)** | \`${sScore}/100\` | **${sGrade}** | ${sScore >= 80 ? '✅ Ready' : sScore >= 60 ? '⚠️ Caution' : '❌ Red'} |`);
  lines.push(``);
  lines.push(``);
  lines.push(`## 🗺️ Remediation Roadmap`);
  lines.push(``);
  lines.push(`The following table outlines the step-by-step technical tasks required to migrate the codebase and secure it for standalone production hosting.`);
  lines.push(``);
  lines.push(`| Step | Dimension | Severity | Estimated Effort | Description | Action Item |`);
  lines.push(`|---|---|---|---|---|---|`);

  roadmapItems.forEach((item, index) => {
    const relativeFile = item.finding.file.replace(/^.*[\\\/]/, '');
    const cleanEvidence = item.finding.evidence
      ? item.finding.evidence.replace(/\r?\n/g, ' ').slice(0, 50)
      : 'N/A';
    lines.push(
      `| ${index + 1} | ` +
      `\`${item.finding.category}\` | ` +
      `**${item.finding.severity.toUpperCase()}** | ` +
      `\`${item.hours}h\` | ` +
      `Found in \`${relativeFile}\`: ${item.finding.message} (Evidence: \`${cleanEvidence}\`) | ` +
      `${item.action} |`
    );
  });

  lines.push(``);
  lines.push(`---`);
  lines.push(`*This report is generated locally and offline by De-Viber. Estimates are heuristic approximations for planning purposes only.*`);
  lines.push(``);

  return lines.join('\n');
}
