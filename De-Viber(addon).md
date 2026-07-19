# Security Module Addition — Spec

## Purpose

Extend the tool beyond portability/lock-in detection into the four highest-frequency, most reliably-detectable AI-generated-code vulnerabilities. These are **universal rules** — they apply regardless of detected platform (Lovable, Bolt, Replit, or none), since security issues aren't platform-specific.

This turns the tool from "portability scanner" into "portability + security scanner" — closer to the earlier Multi-Agent Auditor concept, but folded into the same engine instead of a separate product.

---

## 1. Hardcoded Exposed Secrets

**What it catches:** API keys, service-role tokens, and credentials committed directly into source instead of pulled from environment variables.

**Detection method:** Regex-based, per-file scan.
- Known key formats: AWS (`AKIA[0-9A-Z]{16}`), Stripe (`sk_live_`, `sk_test_`), GitHub PATs (`ghp_`), Supabase service-role JWTs (`eyJ...` assigned to a variable literal, not via `process.env`/`import.meta.env`).
- Generic pattern: variable names matching `/api_?key|secret|token|password|access_?key|service_role/i` assigned directly to a quoted string literal ≥16 chars, rather than an env reference.

**Severity:** High. **Auto-fixable:** No — flag only; replacing a real secret requires the developer to also rotate the key, which the tool cannot safely do unattended.

**Known limitation:** Regex-based secret detection has real false-positive/false-negative rates — long test tokens, placeholder strings, or non-standard key formats can slip through or trigger incorrectly. Treat findings as "needs human confirmation," not certainty.

---

## 2. Broken Access Control / IDORs

**What it catches:** Database queries that filter by a resource ID (e.g., `.eq('id', params.id)`) without also verifying the requesting user owns that resource — the core pattern behind Insecure Direct Object Reference bugs.

**Detection method:** Two-part heuristic, since this can't be fully caught without real data-flow analysis:
1. **Missing RLS on Supabase tables:** scan `.sql` migration files for `CREATE TABLE` statements with no matching `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for the same table name elsewhere in the migration set. This is the more reliable, higher-confidence check.
2. **Ownership-blind queries (heuristic only):** flag `.from(<table>)...eq('id', ...)` chains that don't also include a `user_id`/`owner_id`/`auth.uid()` filter within the same statement window. Explicitly labeled low-confidence — needs manual review, not treated as a hard finding.

**Severity:** High for missing RLS; Medium for the query heuristic (explicitly flagged as approximate).

**Auto-fixable:** No — this requires understanding intended data ownership, which is a design decision, not a mechanical fix.

---

## 3. Client-Side-Only Role Enforcement

**What it catches:** Authorization checks (`user.role === 'admin'`, `if (isAdmin)`, etc.) that exist only in frontend component code, with no equivalent enforcement server-side (RLS policy, edge function, or API middleware). Client-side checks are trivially bypassable by anyone who opens dev tools.

**Detection method:** Regex scan restricted to files under UI-layer directories (`components/`, `pages/`, `routes/` — excluding anything under `api/`, `server/`, `functions/`, `middleware/`) for role-comparison patterns. Cross-reference: if no matching role/permission check exists anywhere in server-side files or SQL policies, severity escalates from "informational" to "high."

**Severity:** Medium by default; High if no corresponding server-side check is found anywhere in the repo.

**Auto-fixable:** No — flags for review; the fix (adding a real server-side check) is a design task.

---

## 4. Outdated / Hallucinated Dependencies

**What it catches:** Two related but distinct problems:
- **Hallucinated packages:** AI coding tools sometimes reference npm packages that don't exist (a known failure mode — "slopsquatting" risk, where attackers register the hallucinated name after the fact).
- **Outdated packages:** dependencies pinned to old major versions with known issues.

**Detection method:**
- Read `package.json` dependencies + devDependencies.
- For each, query the public npm registry (`registry.npmjs.org/<package>`) — a 404 means the package doesn't exist at all → flag as **hallucinated dependency, high severity**, since installing it later could pull in a malicious package registered under that exact name.
- Version-outdated checking (comparing installed vs. latest major) is a v1.1 addition — deprioritized initially since existence-checking is the higher-value, more novel catch and lower false-positive risk.

**Severity:** High for non-existent packages; Medium (future) for outdated-but-real packages.

**Auto-fixable:** No — removing/replacing a dependency is a decision the developer must make.

**Note:** This check requires network access at scan time (to query npm's registry) — this is the one rule category that isn't fully offline, and should be clearly called out to the user, with an opt-out flag for fully air-gapped scans.

---

## Architecture Change Required

Current rule engine assumes all rules are synchronous, per-file, and platform-specific. This addition needs:

1. **A new `security` category** added to the `Finding`/`Rule` category union.
2. **A `universal/` rules folder**, separate from per-platform adapter packs — these rules run on every scan regardless of detected platform.
3. **Async rule support** for the dependency-existence check specifically, since it requires a network call per package rather than a synchronous string match. The other three security rules stay synchronous and file-based, consistent with the existing engine.
4. **A `--offline` flag** on the CLI to skip the dependency-existence check when network access isn't available or desired.

## Report Changes

- New top-level section: `## Security Findings`, separate from `## Portability Findings`, since these are conceptually different axes (can leave a platform vs. is safe to run in production) and a user may care about one without the other.
- Overall score logic: keep the Portability Score as-is; add a separate **Security Score** rather than blending both into one number — collapsing "can I leave this platform" and "is this app secure" into a single score would hide which problem is worse.

## Rollout Order

1. Hardcoded secrets (highest confidence, lowest false-positive risk, ship first)
2. Missing RLS on Supabase tables (high confidence, reuses the SQL-parsing path already built for the Lovable adapter pack)
3. Hallucinated dependencies (needs the async/network change, ship after 1–2 are stable)
4. Client-side role enforcement + ownership-blind query heuristic (lowest confidence of the four, ship last, clearly labeled as "needs manual review" findings rather than certainties)
