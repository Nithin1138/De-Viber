import { describe, it, expect } from 'vitest';
import { renderDiligence } from '../report/diligence.js';
import type { PortabilityReport } from '../types.js';

describe('B2B Due Diligence Report Renderer', () => {
  it('correctly calculates migration effort and renders executive markdown structure', () => {
    const mockReport: PortabilityReport = {
      projectName: 'diligence-test-project',
      timestamp: new Date().toISOString(),
      cliVersion: '0.3.9',
      platformDetection: {
        platform: 'lovable',
        confidence: 'high',
        signals: []
      },
      findings: [
        {
          id: 'PORT_PROPRIETARY_001',
          ruleId: 'PORT_PROPRIETARY_001',
          ruleName: 'Proprietary Package',
          category: 'portability',
          severity: 'high',
          confidence: 'high',
          file: 'package.json',
          line: 12,
          column: 5,
          message: 'Found proprietary package',
          userActionableMessage: 'Replace package',
          autoFixable: false,
          evidence: '"@lovable.dev/ui": "^1.0.0"'
        },
        {
          id: 'SEC_POSSIBLE_IDOR_001',
          ruleId: 'SEC_POSSIBLE_IDOR_001',
          ruleName: 'Possible IDOR',
          category: 'security',
          severity: 'medium',
          confidence: 'medium',
          file: 'src/api.ts',
          line: 45,
          column: 2,
          message: 'Query filters by ID without user ownership check',
          userActionableMessage: 'Verify ownership check',
          autoFixable: false,
          evidence: 'supabase.from("users").select().eq("id", id)'
        }
      ],
      portabilityScore: {
        score: 75,
        grade: 'C',
        factors: [
          { name: 'Proprietary Package', count: 1, penalty: 25, severity: 'high' }
        ]
      },
      securityScore: {
        score: 92,
        grade: 'A',
        factors: [
          { name: 'Possible IDOR', count: 1, penalty: 8, severity: 'medium' }
        ]
      },
      summary: {
        totalFindings: 2,
        criticalCount: 0,
        highCount: 1,
        mediumCount: 1,
        lowCount: 0,
        infoCount: 0,
        filesScanned: 5
      },
      skippedRules: [],
      failedRules: []
    };

    const output = renderDiligence(mockReport);

    // Assert executive narrative presence
    expect(output).toContain('# 🏢 B2B Due Diligence & Portability Report');
    expect(output).toContain('diligence-test-project');
    expect(output).toContain('Portability grade of C (75/100)');
    expect(output).toContain('Security grade of A (92/100)');

    // Assert estimated migration effort calculation:
    // High portability finding = 4 hours
    // Medium security finding = 2 hours
    // Total = 6 hours
    expect(output).toContain('**Estimated Effort:** `6 Hours`');

    // Assert roadmap items and scorecard are present
    expect(output).toContain('## 🛡️ Risk & Posture Scorecard');
    expect(output).toContain('## 🗺️ Remediation Roadmap');
    expect(output).toContain('package.json');
    expect(output).toContain('api.ts');
  });
});
