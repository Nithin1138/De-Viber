# deviber-cli

A local-first CLI that scans AI-app-builder exports (Lovable and Bolt today, Replit planned) for **vendor lock-in** and **security issues** — then transforms, verifies, and deploys your project to any independent host.

> [!WARNING]
> **Disclaimer & Important Notice**
> This tool is provided **"as-is" with no warranty**. It uses heuristics and pattern matching that may produce false positives or miss real issues. **This is not a substitute for a professional security audit.** Always verify findings manually before making changes or deploying to production.

---

## 🔒 Trust & Safety: What This Tool Does NOT Do

* **NO Remote API Calls**: This tool operates *exclusively* offline on code you have already exported. It **never** contacts Lovable, Bolt, Replit, or any AI platform's servers.
* **NO Automated Data Migration**: We scan and refactor code, not databases. Moving away from Lovable Cloud or managed environments will delete your live records — you must export your tables, storage, and user auth accounts separately.
* **NO Guarantees**: Detections are based on patterns and heuristics. They help pinpoint portability hurdles and security gaps but cannot prove a codebase is 100% bug-free.

---

## Quick Start & Installation

You can run `deviber-cli` directly via `npx` or install it globally:

```bash
# Run a scan directly without installing
npx deviber-cli analyse ./path-to-your-project

# Install globally on your system
npm install -g deviber-cli

# Run scans anywhere
deviber analyse ./path-to-your-project
```

### Run/Build locally from Source

```bash
# 1. Clone the repository
git clone https://github.com/Nithin1138/De-Viber.git
cd De-Viber

# 2. Install dependencies & build
npm install
npm run build

# 3. Scan your project folder using the local build
node dist/index.js analyse ./path-to-your-project
```

---

## 🚀 The 4-Stage Pipeline

De-Viber is organized around a complete four-stage audit and migration pipeline:

1. **`analyse`** — Scans your exported codebase locally to identify portability blocks (lock-in dependencies, platform config directories) and production-readiness security issues (hardcoded keys, missing RLS, IDOR checks). Automatically saves a snapshot so the **next scan shows a diff** of what changed.
2. **`transform`** — Auto-fixes identified findings (e.g. extracts hardcoded keys to `.env.local`, removes platform config dirs, adds `.npmrc` for deployment compatibility). Backs up the original code to a git branch and **auto-commits the cleaned code**.
3. **`verify`** — Spins up an isolated Docker container to compile the project, run tests, and ping routes — comparing results against a baseline to guarantee no regressions were introduced.
4. **`deploy`** — Guides you through deploying the verified application to Vercel, Railway, or Netlify. Enforces that a successful `verify` has run previously and executes a final live URL smoke check.

---

## CLI Commands & Options

```bash
# Scan a project for vendor lock-in and security issues
deviber analyse <path>
deviber analyse <path> --offline         # Skip npm registry checks
deviber analyse <path> --platform lovable # Force platform ruleset
deviber analyse <path> --format json      # Output as structured JSON
deviber analyse <path> --output report.md # Save results to a file

# Automatically refactor auto-fixable findings and verify safety
deviber transform <path>
deviber transform <path> --timeout 120    # Custom verification timeout in seconds

# Verify a project builds, runs tests, or pings routes in Docker
deviber verify <path>
deviber verify <path> --baseline <ref>    # Compare against a baseline Git commit
deviber verify <path> --timeout 120       # Custom verification timeout in seconds
deviber verify <path> --cleanup           # Clean up leftover test containers

# Guided walkthrough to deploy the verified project independently
deviber deploy <path>
deviber deploy <path> --platform vercel   # Pre-select target hosting platform
```

---

## What It Checks

### Portability (Lock-In Risk)
* **Platform-Scoped Dependencies**: Scans for packages like `@lovable.dev/*` which only resolve inside the builder's hosting layer.
* **Platform-Specific Configurations**: Checks for config files (e.g. `.lovable/` folder) that standard hosts (Vercel, Railway) do not understand — and auto-removes them during `transform`.
* **AI Generator Comment Markers**: Finds comments left by AI generators that indicate where custom manual overrides might be needed.
* **Lovable Cloud Data Risk**: Flags connection URLs pointing to managed Lovable database endpoints (`supabase.lovable.app`) to warn about data loss on platform deletion.

### Security (Production Readiness)
* **Hardcoded Secrets**: AWS access keys, Stripe secret/publishable keys, and Supabase service-role keys committed in source — auto-extracted to `.env.local` by `transform`.
* **Missing Row Level Security (RLS)**: Scans migration scripts for tables missing RLS enforcements.
* **Client-Side Admin Bypass**: Flags admin checks implemented solely in frontend components without server-side validation.
* **Hallucinated Dependencies**: Compares package list against the public npm registry to detect packages generated by AI hallucinations.
* **Ownership-Blind Queries (IDOR)**: Highlights queries fetching or updating records without verifying requesting user ownership.

---

## 📈 Scan Diff — Track Progress Across Runs

Every `deviber analyse` run automatically saves a lightweight snapshot to `.deviber/last-report.json`. On the next scan, a **"Changes since last scan"** section is printed automatically:

```
────────────────────────────────────────────────────────────
📈 Changes since last scan (7/20/2026, 3:49 PM)
────────────────────────────────────────────────────────────
  Portability: 76 → 84 (+8 pts)  Security: 92 → 92 (+0 pts)  Findings: 4 → 3 (-1)

✅ Fixed (1):
  🟡 Lovable-Specific Configuration Files — .lovable

⚠️  Still open (3):
  🟠 Lovable-Scoped/Specific Package Dependencies — package.json
  ℹ️  Lovable/GPT-Pilot Code Markers — vite.config.ts
  🟡 Possible Insecure Direct Object Reference — src/routes/library.tsx
────────────────────────────────────────────────────────────
```

No extra flags needed — just run `deviber analyse` before and after `deviber transform` to see exactly what was fixed and what still needs attention.

---

## Example Report Output

```markdown
# 📋 Portability & Security Report

**Project:** simple-app
**Files Scanned:** 12
**Detected Platform:** lovable (high confidence)

## Summary
| Metric | Value |
|---|---|
| Portability Score | 85/100 (B) |
| Security Score | 21/100 (F) |
| Total Findings | 4 |

## Portability Findings
* **Lovable-Scoped Package Dependencies** (Severity: High)
  * File: `package.json`
  * Action: Replace `@lovable.dev/ui` with open-source equivalent.

## Security Findings
* **Hardcoded API Keys and Secrets** (Severity: Critical)
  * File: `src/lib/supabaseClient.ts:7`
  * Action: Move the Stripe API Key to an environment variable.
```

## Example Walkthrough: End-to-End Audit & Migration

Here is a worked example of running the entire pipeline against a real exported project:

### 1. Analyse
```bash
deviber analyse ./my-app
```
```
Portability Score: 76/100 (B)  |  Security Score: 92/100 (A)  |  Findings: 4
```

### 2. Transform
```bash
deviber transform ./my-app
```
```
  ✔ .npmrc configured with legacy-peer-deps=true
✨ TRANSFORM SUCCESS: All changes successfully verified!
  • Extracted hardcoded secret "SUPABASE_SERVICE_ROLE_KEY" → VITE_SUPABASE_SERVICE_ROLE_KEY
  • Safely removed platform-specific configuration directory/file (.lovable/)
  • Created/configured .npmrc to bypass peer dependency build errors

✅ Changes committed to git on branch: main
Run "git push" to push the transformed code to your remote.
Original code is saved on backup branch: deviber-backup-1784537399215
```

### 3. Verify
```bash
deviber verify ./my-app
```
```
🐳 Verifying current version...
  URL http://127.0.0.1:3000/ responded with 200
✅ VERIFY PASS: No regressions detected!
```

### 4. Deploy
```bash
deviber deploy ./my-app
```
```
📦 Project Shape Detected: Frontend + Supabase Backend
🚀 Preparing VERCEL Deployment...
✅ Vercel command completed.
Pinging https://my-app.vercel.app...
✅ SMOKE CHECK PASS: URL is active (HTTP 200)
```

### 5. Re-analyse (check what changed)
```bash
deviber analyse ./my-app
```
```
Portability: 76 → 84 (+8 pts)  Findings: 4 → 3 (-1)
✅ Fixed (1): Lovable-Specific Configuration Files
⚠️  Still open (3): package dependency, code marker, IDOR
```

---

## Development

```bash
# Clone the repository
git clone https://github.com/Nithin1138/De-Viber.git
cd De-Viber
npm install

# Compile TypeScript
npm run build

# Run fast unit test suite
npm test

# Run Docker-based integration tests
npm run test:integration
```

---

## License

MIT — see [LICENSE](./LICENSE)

---

## 🐞 Support & Feedback

Found a bug or a false positive? Open an issue on our [GitHub Issue Tracker](https://github.com/Nithin1138/De-Viber/issues). We welcome community feedback to help improve the heuristic rules!
