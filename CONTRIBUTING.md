# Contributing to De-Viber

Thank you for your interest in contributing to De-Viber! We welcome contributions to improve our heuristic rules, platform detection logic, and pipeline functionality.

## 🤝 Core Values & Trust Model
* **Offline First**: We do not collect or phone home telemetry or code. Any network calls must be opt-in (such as checking package names against the public registry) and bypassable via `--offline`.
* **Honest Findings**: Findings should be clearly labeled and should not overclaim capability. Critical findings are flagged as warnings/errors, while heuristic scans are labeled as review hints.

## 🛠️ Adding a New Rule
All portability and security rules are organized by platform under `src/rules/`:
* `src/rules/lovable/rules.ts` — Lovable-specific lock-in rules.
* `src/rules/bolt/rules.ts` — Bolt-specific lock-in rules.
* `src/rules/universal/security.rules.ts` — Generic security rules (e.g. secret detection, RLS, IDOR checks).
* `src/rules/universal/dependencies.js` — Package dependency checks.

### Rule Template
```typescript
import type { Rule, RuleContext, Finding } from '../../types.js';

export const MY_RULE_001: Rule = {
  id: 'MY_RULE_001',
  name: 'My New Portability Check',
  category: 'portability',
  severity: 'medium',
  confidence: 'high',
  platform: 'lovable', // or 'bolt', 'universal'
  autoFixable: false,
  requiresNetwork: false,
  detect(context: RuleContext): Finding[] {
    const findings: Finding[] = [];
    // detection logic using context.files or context.packageJson
    return findings;
  }
};
```

## 🧪 Testing Rules
Every rule must be backed by unit tests:
1. Create a minimal mock project under `test-fixtures/` (e.g., `test-fixtures/my-test-case`).
2. Add test assertions in `src/__tests__/rules.test.ts` to confirm both:
   * **True Positives**: The rule fires when the locked/vulnerable pattern is present.
   * **True Negatives**: The rule does NOT fire when the project is clean.

Run the test suite locally:
```bash
npm run build
npm test
```
