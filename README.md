# deviber-cli

A local-first CLI that scans AI-app-builder exports (Lovable and Bolt today, Replit planned) for **vendor lock-in** and **security issues**.

> [!WARNING]
> **Disclaimer & Important Notice**
> This tool is provided **"as-is" with no warranty**. It uses heuristics and pattern matching that may produce false positives or miss real issues. **This is not a substitute for a professional security audit.** Always verify findings manually before making changes or deploying to production.

---

## 🔒 Trust & Safety: What This Tool Does NOT Do

* **NO Remote API Calls**: This tool operates *exclusively* offline on code you have already exported. It **never** contacts Lovable, Bolt, Replit, or any AI platform's servers.
* **NO Automated Data Migration**: We scan and refactor code, not databases. Moving away from Lovable Cloud or managed environments will delete your live records—you must export your tables, storage, and user auth accounts separately.
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

To run the CLI from source:

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

De-Viber structure is organized around a complete four-stage audit and migration pipeline:

1. **`analyse`**: Scans your exported codebase locally to identify portability blocks (lock-in dependencies, platform config directories) and production-readiness security issues (hardcoded keys, missing RLS, IDOR checks).
2. **`transform`**: Automatically migrates identified findings (e.g. refactoring committed keys and Supabase connection strings into environment variables). Backs up the original code to a git branch.
3. **`verify`**: Spins up an isolated Docker verification container to compile the project, run tests, and ping routes, comparing results against a baseline to guarantee no regressions were introduced.
4. **`deploy`**: Guides you through deploying the verified application to independent hosts (Vercel, Railway, Netlify). Enforces that a successful `verify` has run previously, prompts for required environment variables, and executes a final live URL smoke check.

---

## CLI Commands & Options

```bash
# Scan a project for vendor lock-in and security issues
deviber analyse <path>
deviber analyse <path> --offline         # Skip npm registry checks
deviber analyse <path> --platform lovable # Force platform ruleset
deviber analyse <path> --format json      # Output as structured JSON
deviber analyse <path> --output report.md # Save results to a file

# Verify a project builds, runs tests, or pings routes in Docker
deviber verify <path>
deviber verify <path> --baseline <ref>    # Compare against a baseline Git commit
deviber verify <path> --timeout 120       # Custom verification timeout in seconds
deviber verify <path> --cleanup           # Clean up leftover test containers

# Automatically refactor auto-fixable findings and verify safety
deviber transform <path>
deviber transform <path> --timeout 120    # Custom verification timeout in seconds

# Guided walkthrough to deploy the verified project independently
deviber deploy <path>
deviber deploy <path> --platform vercel   # Pre-select target hosting platform
```

---

## What It Checks

### Portability (Lock-In Risk)
* **Platform-Scoped Dependencies**: Scans for packages like `@lovable.dev/*` which only resolve inside the builder's hosting layer.
* **Platform-Specific Configurations**: Checks for config files (e.g. `.lovable/` folder configuration) that standard hosts (Vercel, Railway) do not understand.
* **AI Generator Comment Markers**: Finds comments left by AI generators that indicate where custom manual overrides might be needed.
* **Lovable Cloud Data Risk**: Flags connection URLs pointing to managed Lovable database endpoints (`supabase.lovable.app`) to warn about data records loss on platform deletion.

### Security (Production Readiness)
* **Hardcoded Secrets**: AWS access keys, Stripe secret/publishable keys, and Supabase service-role keys committed in source.
* **Missing Row Level Security (RLS)**: Scans migration scripts for tables missing RLS enforcements.
* **Client-Side Admin Bypass**: Flags admin checks implemented solely in frontend components without server-side validation.
* **Hallucinated Dependencies**: Compares package list against the public npm registry to detect packages generated by AI hallucinations.
* **Ownership-Blind Queries**: Highlights queries fetching or updating records without verifying requesting user ownership.

---

## Example Report Output

Here is a redacted example of what a printed Markdown report looks like:

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

---

## Development

```bash
# Clone the repository
git clone https://github.com/your-org/deviber-cli.git
cd deviber-cli
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

