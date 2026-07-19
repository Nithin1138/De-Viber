/**
 * Core type definitions for deviber-cli.
 *
 * These types define the data model for findings, rules, reports,
 * platform detection, and scan configuration.
 */

// ─── Finding ────────────────────────────────────────────────────────────────

/** Confidence level for a finding — affects how the report presents it. */
export type Confidence = 'high' | 'medium' | 'low';

/** Finding category — portability and security are separate axes. */
export type FindingCategory = 'portability' | 'security';

/** Severity levels for findings. */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * A single issue found during analysis.
 *
 * Every finding must include a `userActionableMessage` written in plain
 * language that a non-technical founder can act on.
 */
export interface Finding {
  /** Unique identifier for this specific finding instance. */
  id: string;

  /** Rule that produced this finding (e.g., SEC_HARDCODED_SECRET_001). */
  ruleId: string;

  /** Human-readable rule name. */
  ruleName: string;

  /** Whether this is a portability or security issue. */
  category: FindingCategory;

  /** How severe this issue is. */
  severity: Severity;

  /** How confident we are that this is a real issue, not a false positive. */
  confidence: Confidence;

  /** Absolute path to the file where the issue was found. */
  file: string;

  /** Line number in the file (1-indexed), if applicable. */
  line?: number;

  /** Column number (1-indexed), if applicable. */
  column?: number;

  /** Technical description of what was found. */
  message: string;

  /**
   * Plain-language explanation a non-technical founder can understand and
   * act on. Must explain: what this means, why it matters, and what to do.
   */
  userActionableMessage: string;

  /** Whether this finding can be auto-fixed by the Transform phase. */
  autoFixable: boolean;

  /** The matched text/pattern that triggered this finding, for context. */
  evidence?: string;
}

// ─── Rule ───────────────────────────────────────────────────────────────────

/** Supported platforms for platform-specific rules. */
export type Platform = 'lovable' | 'bolt' | 'replit' | 'unknown';

/**
 * A detection rule that can identify issues in a project.
 *
 * Rules can be synchronous (file-based pattern matching) or asynchronous
 * (network calls for dependency checking). The rule engine handles both.
 */
export interface Rule {
  /** Unique rule identifier (e.g., LOVABLE_SCOPED_DEP_001). */
  id: string;

  /** Human-readable name for reports. */
  name: string;

  /** Category this rule belongs to. */
  category: FindingCategory;

  /** Default severity when this rule triggers. */
  severity: Severity;

  /** Confidence level of detections from this rule. */
  confidence: Confidence;

  /**
   * Which platform this rule applies to.
   * 'universal' means it runs on every scan regardless of platform.
   */
  platform: Platform | 'universal';

  /** Whether findings from this rule can be auto-fixed. */
  autoFixable: boolean;

  /** Whether this rule requires network access. */
  requiresNetwork: boolean;

  /**
   * Run detection against the project.
   * @param context - Everything the rule needs to do its work.
   * @returns Array of findings (empty if nothing found).
   */
  detect: (context: RuleContext) => Finding[] | Promise<Finding[]>;
}

/**
 * Context provided to each rule during detection.
 * Contains project files, parsed data, and configuration.
 */
export interface RuleContext {
  /** Absolute path to the project root. */
  projectRoot: string;

  /** All file paths in the project (relative to projectRoot). */
  files: string[];

  /**
   * Read a file's contents. Returns null if the file can't be read
   * (missing, permission error, binary). The rule should handle null
   * gracefully — never crash on a missing file.
   */
  readFile: (relativePath: string) => Promise<string | null>;

  /** Parsed package.json, or null if not found/unparseable. */
  packageJson: PackageJsonData | null;

  /** Whether we're running in offline mode (skip network checks). */
  offline: boolean;

  /** Detected platform (rules can use this for cross-referencing). */
  detectedPlatform: PlatformDetection;
}

/** Parsed package.json fields we care about. */
export interface PackageJsonData {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

// ─── Platform Detection ─────────────────────────────────────────────────────

/** A signal that contributed to platform detection. */
export interface DetectionSignal {
  /** What was checked (e.g., "package.json dependency"). */
  type: string;

  /** What was found (e.g., "@lovable.dev/ui"). */
  detail: string;

  /** How strong this signal is individually. */
  weight: number;
}

/**
 * Result of platform detection.
 * Always returns a confidence level so the CLI can warn the user
 * when detection is uncertain.
 */
export interface PlatformDetection {
  /** Detected platform (or 'unknown'). */
  platform: Platform;

  /** How confident we are in the detection. */
  confidence: Confidence;

  /** Signals that contributed to the detection. */
  signals: DetectionSignal[];
}

// ─── Report ─────────────────────────────────────────────────────────────────

/** Letter grade for scores. */
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** Score breakdown for one dimension (portability or security). */
export interface ScoreBreakdown {
  /** Numeric score 0-100. */
  score: number;

  /** Letter grade. */
  grade: Grade;

  /** Factors that influenced the score. */
  factors: ScoreFactor[];
}

/** A factor contributing to a score. */
export interface ScoreFactor {
  /** What was measured. */
  name: string;

  /** How many instances were found. */
  count: number;

  /** Penalty applied to the score. */
  penalty: number;

  /** Severity of this factor's findings. */
  severity: Severity;
}

/**
 * Complete analysis report for a project.
 * Separates portability and security — they are different axes
 * and a user may care about one without the other.
 */
export interface PortabilityReport {
  /** Project name (from package.json or directory name). */
  projectName: string;

  /** When the scan was run. */
  timestamp: string;

  /** CLI version that produced this report. */
  cliVersion: string;

  /** How the platform was detected. */
  platformDetection: PlatformDetection;

  /** All findings from the scan. */
  findings: Finding[];

  /** Portability score (lock-in risk). */
  portabilityScore: ScoreBreakdown;

  /** Security score (production-readiness risk). */
  securityScore: ScoreBreakdown;

  /** Summary statistics. */
  summary: ReportSummary;

  /** Rules that were skipped and why (e.g., offline mode). */
  skippedRules: SkippedRule[];

  /** Rules that failed during execution and the error. */
  failedRules: FailedRule[];
}

/** High-level summary statistics for the report. */
export interface ReportSummary {
  totalFindings: number;
  portabilityFindings: number;
  securityFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  autoFixableCount: number;
  filesScanned: number;
}

/** A rule that was skipped, with the reason. */
export interface SkippedRule {
  ruleId: string;
  reason: string;
}

/** A rule that failed during execution. */
export interface FailedRule {
  ruleId: string;
  error: string;
}

// ─── Scan Configuration ─────────────────────────────────────────────────────

/** Options passed to the scan engine. */
export interface ScanOptions {
  /** Path to the project to scan. */
  targetPath: string;

  /** Skip network-dependent checks. */
  offline: boolean;

  /** Override auto-detected platform. */
  platformOverride?: Platform;

  /** Output format for the report. */
  format: 'markdown' | 'json';

  /** Output file path (stdout if not specified). */
  outputPath?: string;
}

// ─── Verification ───────────────────────────────────────────────────────────

export interface RoutePingResult {
  route: string;
  statusCode: number;
  success: boolean;
  error?: string;
}

export interface VerificationResult {
  built: boolean;
  buildError?: string;
  testPassed?: boolean;
  testPassedCount?: number;
  testFailedCount?: number;
  testOutput?: string;
  routesChecked: RoutePingResult[];
}

export interface VerificationDiff {
  pass: boolean;
  baseline?: VerificationResult;
  current: VerificationResult;
  regressions: string[];
}

export interface VerifyOptions {
  targetPath: string;
  baseline: string;
  timeout: number;
  cleanup: boolean;
}

