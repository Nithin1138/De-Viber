# deviber-cli

A local-first CLI that scans AI-app-builder exports (Lovable, Bolt, Replit) for **vendor lock-in** and **security issues**.

Built for non-technical founders and small dev agencies who exported a project from an AI app-builder and need to know:
- **How locked-in is it?** — Which parts of your code only work inside the platform?
- **Is it secure enough for real users?** — Are there exposed secrets, missing database security, or other vulnerabilities?

---

## 🔒 Trust & Safety

**This tool never contacts Lovable, Bolt, Replit, or any AI platform's servers.**

It operates entirely on code you've already exported through the platform's own download/export feature. The only optional network call goes to the public npm registry to check for hallucinated (non-existent) packages — and you can skip even that with `--offline`.

Every finding includes a plain-language explanation of what it means and what to do about it. Heuristic-based detections are clearly labeled as such.

---

## Quick Start

```bash
# Scan your exported project (no installation needed)
npx deviber-cli analyse ./path-to-your-project

# Or install globally
npm install -g deviber-cli
deviber analyse ./path-to-your-project
```

## What It Checks

### Portability (Lock-In Risk)
- **Platform-scoped dependencies** — Packages like `@lovable.dev/*` that won't work outside the platform
- **Platform-specific config files** — Configuration that standard hosting platforms won't recognize
- **AI code markers** — Comments left by the platform's code generator

### Security (Production Readiness)
- **Hardcoded secrets** — API keys, tokens, and passwords committed directly in code instead of environment variables
- **Missing Row Level Security (RLS)** — Supabase database tables without access controls (anyone with your public key can read all data)
- **Client-side-only role checks** — Admin/role checks that exist only in the browser and can be trivially bypassed
- **Hallucinated dependencies** — npm packages referenced in your project that don't actually exist (a known AI code generation failure mode)
- **Ownership-blind queries** — Database queries that don't verify the requesting user owns the data they're accessing

## CLI Options

```bash
# Scan a project for vendor lock-in and security issues
deviber analyse <path>
deviber analyse <path> --offline    # Skip npm registry checks
deviber analyse <path> --platform lovable  # Override platform detection
deviber analyse <path> --format json       # JSON report format
deviber analyse <path> --output report.md  # Save report to file

# Verify a project compiles, runs tests, or pings routes in Docker
deviber verify <path>
deviber verify <path> --baseline <ref>     # Compare against a Git commit/branch
deviber verify <path> --timeout 120        # Custom timeout per stage in seconds
deviber verify <path> --cleanup            # Clean up leftover test containers/images
```

## How to Read the Report

The report produces two independent scores:

| Score | What it measures | What "low" means |
|---|---|---|
| **Portability Score** (0-100) | How locked-in your project is to the original platform | Many platform-specific dependencies that need replacing before you can deploy elsewhere |
| **Security Score** (0-100) | How safe your project is to put in front of real users | Critical vulnerabilities that must be fixed before production |

Each finding includes:
- **Severity** — 🔴 Critical, 🟠 High, 🟡 Medium, 🔵 Low, ℹ️ Info
- **Confidence** — Whether the detection is reliable or heuristic-based
- **What to do** — Plain-language instructions a non-developer can understand

### Understanding Confidence Levels

Not all findings are created equal:

- **High confidence** — The tool is very confident this is a real issue (e.g., a known API key pattern, or a table with no RLS enabled).
- **Medium confidence** — Likely a real issue, but has some false-positive risk. Worth checking.
- **Low confidence** — This is a *review hint*, not a certainty. The tool flagged it because the pattern looks suspicious, but manual review is needed to confirm.

## Currently Supported Platforms

| Platform | Status |
|---|---|
| **Lovable** | ✅ Supported (portability + security rules) |
| **Bolt** | 🔜 Detection only (rules coming soon) |
| **Replit** | 🔜 Detection only (rules coming soon) |
| **Other/Unknown** | ✅ Universal security rules run on any project |

## Known Limitations

This tool is honest about what it can and can't do:

- **Heuristic-based detections** (like the IDOR check) may produce false positives. Every such finding clearly says so.
- **Secret detection is regex-based** — it can miss non-standard key formats or flag test values. Always verify before rotating keys.
- **Security rules are not a substitute for a professional security audit.** They catch the most common AI-generated-code issues, not all possible vulnerabilities.
- **Portability rules currently focus on Lovable.** Bolt and Replit-specific lock-in rules are coming in future versions.

## Development

```bash
git clone https://github.com/your-org/deviber-cli.git
cd deviber-cli
npm install
npm run build    # Compile TypeScript
npm test         # Run test suite (48 tests)
npm run dev      # Watch mode
```

## Disclaimer

This tool is provided **"as-is" with no warranty.** It uses automated pattern matching and heuristics that may produce false positives or miss real issues. Always verify findings manually before making changes to your project.

This tool operates exclusively on code you have already exported. It never contacts any AI platform's servers, and never transmits your code or secrets anywhere.

## License

MIT — see [LICENSE](./LICENSE)
# De-Viber
