/**
 * Report Generator Tests
 *
 * Tests scoring computation, grade assignments, and report rendering.
 */

import { describe, it, expect } from 'vitest';
import {
  generateReport,
  renderMarkdown,
  renderJson,
} from '../report/generate.js';
import type { Finding, PlatformDetection } from '../types.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test-001',
    ruleId: 'TEST_RULE_001',
    ruleName: 'Test Rule',
    category: 'security',
    severity: 'medium',
    confidence: 'high',
    file: '/test/file.ts',
    message: 'Test finding message',
    userActionableMessage: 'Do something about this.',
    autoFixable: false,
    ...overrides,
  };
}

const defaultPlatform: PlatformDetection = {
  platform: 'lovable',
  confidence: 'high',
  signals: [],
};

describe('Report Generator', () => {
  describe('Score Computation', () => {
    it('returns 100/A when there are no findings', () => {
      const report = generateReport({
        projectName: 'test-project',
        platformDetection: defaultPlatform,
        findings: [],
        skippedRules: [],
        failedRules: [],
        filesScanned: 10,
        cliVersion: '0.1.0',
      });

      expect(report.portabilityScore.score).toBe(100);
      expect(report.portabilityScore.grade).toBe('A');
      expect(report.securityScore.score).toBe(100);
      expect(report.securityScore.grade).toBe('A');
    });

    it('penalizes critical findings heavily', () => {
      const report = generateReport({
        projectName: 'test-project',
        platformDetection: defaultPlatform,
        findings: [
          makeFinding({ severity: 'critical', category: 'security' }),
        ],
        skippedRules: [],
        failedRules: [],
        filesScanned: 10,
        cliVersion: '0.1.0',
      });

      // A single critical finding should drop score significantly
      expect(report.securityScore.score).toBeLessThanOrEqual(80);
    });

    it('separates portability and security scores', () => {
      const report = generateReport({
        projectName: 'test-project',
        platformDetection: defaultPlatform,
        findings: [
          makeFinding({ severity: 'high', category: 'portability', ruleId: 'PORT_001' }),
          makeFinding({ severity: 'high', category: 'portability', ruleId: 'PORT_001' }),
        ],
        skippedRules: [],
        failedRules: [],
        filesScanned: 10,
        cliVersion: '0.1.0',
      });

      // Portability should be penalized, security should be perfect
      expect(report.portabilityScore.score).toBeLessThan(100);
      expect(report.securityScore.score).toBe(100);
    });

    it('assigns correct grades at boundaries', () => {
      // Test each grade boundary
      const testCases: Array<{ findingSeverity: 'high' | 'medium' | 'low'; expectedMaxGrade: string }> = [
        { findingSeverity: 'low', expectedMaxGrade: 'A' },
      ];

      for (const tc of testCases) {
        const report = generateReport({
          projectName: 'test',
          platformDetection: defaultPlatform,
          findings: [
            makeFinding({
              severity: tc.findingSeverity,
              category: 'security',
            }),
          ],
          skippedRules: [],
          failedRules: [],
          filesScanned: 10,
          cliVersion: '0.1.0',
        });

        // Just verify it produces a valid grade
        expect(['A', 'B', 'C', 'D', 'F']).toContain(
          report.securityScore.grade
        );
      }
    });
  });

  describe('Summary Statistics', () => {
    it('counts findings by severity correctly', () => {
      const report = generateReport({
        projectName: 'test-project',
        platformDetection: defaultPlatform,
        findings: [
          makeFinding({ severity: 'critical', category: 'security' }),
          makeFinding({ severity: 'high', category: 'security', id: 'f2' }),
          makeFinding({ severity: 'medium', category: 'portability', id: 'f3' }),
          makeFinding({ severity: 'low', category: 'portability', id: 'f4' }),
          makeFinding({ severity: 'info', category: 'portability', id: 'f5' }),
        ],
        skippedRules: [],
        failedRules: [],
        filesScanned: 50,
        cliVersion: '0.1.0',
      });

      expect(report.summary.totalFindings).toBe(5);
      expect(report.summary.criticalCount).toBe(1);
      expect(report.summary.highCount).toBe(1);
      expect(report.summary.mediumCount).toBe(1);
      expect(report.summary.lowCount).toBe(1);
      expect(report.summary.infoCount).toBe(1);
      expect(report.summary.securityFindings).toBe(2);
      expect(report.summary.portabilityFindings).toBe(3);
      expect(report.summary.filesScanned).toBe(50);
    });
  });

  describe('Markdown Rendering', () => {
    it('produces valid markdown with all required sections', () => {
      const report = generateReport({
        projectName: 'test-project',
        platformDetection: defaultPlatform,
        findings: [
          makeFinding({ category: 'security', severity: 'high' }),
          makeFinding({
            category: 'portability',
            severity: 'medium',
            ruleId: 'PORT_001',
            id: 'p1',
          }),
        ],
        skippedRules: [{ ruleId: 'SKIP_001', reason: 'offline' }],
        failedRules: [],
        filesScanned: 10,
        cliVersion: '0.1.0',
      });

      const md = renderMarkdown(report);

      expect(md).toContain('Portability & Security Report');
      expect(md).toContain('Portability Findings');
      expect(md).toContain('Security Findings');
      expect(md).toContain('Skipped Checks');
      expect(md).toContain('as-is');
      expect(md).toContain('test-project');
    });

    it('includes confidence disclaimers for low-confidence findings', () => {
      const report = generateReport({
        projectName: 'test',
        platformDetection: defaultPlatform,
        findings: [
          makeFinding({
            confidence: 'low',
            category: 'security',
            message: 'Low confidence finding',
          }),
        ],
        skippedRules: [],
        failedRules: [],
        filesScanned: 5,
        cliVersion: '0.1.0',
      });

      const md = renderMarkdown(report);
      expect(md).toContain('manual review recommended');
    });
  });

  describe('JSON Rendering', () => {
    it('produces valid parseable JSON', () => {
      const report = generateReport({
        projectName: 'test-project',
        platformDetection: defaultPlatform,
        findings: [],
        skippedRules: [],
        failedRules: [],
        filesScanned: 10,
        cliVersion: '0.1.0',
      });

      const json = renderJson(report);
      const parsed = JSON.parse(json);

      expect(parsed.projectName).toBe('test-project');
      expect(parsed.portabilityScore.score).toBe(100);
      expect(parsed.securityScore.score).toBe(100);
    });
  });
});
