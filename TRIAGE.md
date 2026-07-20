# Heuristic Rules Triage Guide

This document defines how to triage false positive and false negative reports from users.

## 📥 Receiving Reports
Users submit false positive/negative findings via the GitHub Issue Tracker. Each report should include:
* The rule ID that triggered incorrectly.
* The flagged code line and file context.
* Explanations of why it is false (e.g. database-enforced security, middleware checks, etc.).

## 🔄 Triage Process

1. **Verify & Reproduce**:
   Create a new test fixture reproducing the exact code snippet described in the issue under `test-fixtures/` (sanitized of any private URLs, keys, or personal details).

2. **Determine Status**:
   * **True Positive**: Heuristic functioned correctly. Document why the finding was correct (e.g. explain that client-side validation is bypassable without DB rules).
   * **False Positive / Negative**: The heuristic ruleset matched clean or modified code.

3. **Heuristic Tuning**:
   Modify the corresponding rule match logic (usually under `src/rules/` rule definitions) to refine the match regex or context filters.
   * *Example*: Ignore Supabase queries if they already contain a `.eq('user_id', ...)` filter.

4. **Verify and Lock Regressions**:
   Ensure the newly added test case passes without regression:
   ```bash
   npm run build && npm test
   ```
