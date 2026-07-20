# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4] - 2026-07-20

### Fixed
- **Automatic .npmrc Configuration**: Automatically generate or configure a `.npmrc` file with `legacy-peer-deps=true` during the `transform` command to prevent peer-dependency conflict errors (ERESOLVE) during deployment to remote platforms (Vercel, Railway, etc.).

## [0.3.3] - 2026-07-20

### Added
- **Auto-fixable Platform Config Deletion**: Marked Lovable `.lovable/` (`LOVABLE_CONFIG_001`) and Bolt `.bolt/` (`BOLT_CONFIG_001`) directory configuration findings as auto-fixable.
- **Transform folder deletion support**: Updated the codemod engine to support safe, automatic deletion of platform-specific directories and files during the `transform` phase.

## [0.3.2] - 2026-07-20

### Fixed
- **CLI Deploy Process Execution**: Actually spawn the local Vercel/Railway CLI interactive processes in the user's terminal using `execSync` instead of only printing status statements.

## [0.3.1] - 2026-07-20

### Fixed
- **CLI Replit Overclaim**: Corrected CLI help text and description strings that incorrectly implied active Replit support. Qualified Replit support as planned/future, keeping current active coverage on Lovable and Bolt.

## [0.3.0] - 2026-07-20

### Added
- **Guided Deploy Phase (Priority 5)**:
  - Added `deploy` command to close the end-to-end pipeline (Analyse → Transform → Verify → Deploy).
  - Walkthrough logic prompts users for target hosting platforms (Vercel, Railway, Netlify, Manual), prompts for template keys from `.env.example`, triggers platforms CLIs, and performs live route smoke pings.
  - Implemented verification state checks requiring a prior successful `verify` run to enforce pipeline safety.
  - Created a false-positive bug reporting template `.github/ISSUE_TEMPLATE/false_positive_report.md` and added a reporting link at the bottom of the CLI scan report.

### Fixed
- **Staleness check false positives**: Updated git status checking to filter out `.deviber/` status folder modifications. Added `.deviber` to `.gitignore` to prevent untracked status records from dirtying the working directory.

## [0.2.0] - 2026-07-20

### Added
- **Docker Verification Sandbox (Priority 2)**:
  - Added `verify` command to run isolated project builds and test runs inside Node.js Docker containers.
  - Automatically detects package managers via lockfile fingerprints (`pnpm-lock.yaml`, `yarn.lock`, etc.).
  - Extracts and pings exposed routes (`3000`/`5173`) at runtime to verify web server safety.
  - Automatically prunes leftover containers and images, with a `--cleanup` command to prune orphaned resources.
- **AST Refactoring Engine (Priority 3)**:
  - Added `transform` command utilizing `ts-morph` AST parser to extract hardcoded secrets into `.env.local` and add placeholders to `.env.example`.
  - Automatically detects and configures Vite-scoped environment variables (`import.meta.env.VITE_*`) or Webpack/Node variables (`process.env.*`).
  - Added automated git-based backup and rollback engine to revert changes via `git reset --hard` if post-transformation Docker verification fails.
- **Lovable Cloud Database Risk Rule**:
  - `LOVABLE_CLOUD_DATA_RISK_001` — Detects Supabase urls pointing to Lovable-managed cloud instances and warns that database records, auth accounts, and files must be manually migrated before deleting the Lovable project.
- **Repeatable Packaging Validation (Priority 4)**:
  - Added packaging test script (`scripts/test-packaging.sh`) and integrated `npm run test:packaging` to dynamically test NPM packaging correctness in an isolated shell.
- **Security Responsible Disclosure Policy**:
  - Added `SECURITY.md` detailing responsible disclosure protocols and limitations of scan heuristics.
- **Bolt Adapter Pack (Priority 5)**:
  - Added Bolt-specific detection rules: `BOLT_CONFIG_001` (validated config/directory checks).
  - Retired `BOLT_SCOPED_DEP_001` (proprietary build dependencies) and `BOLT_RUNTIME_ASSUMPTION_001` (WebContainer runtime assumptions) after manual inspection of real Bolt exports confirmed they do not apply to exported projects.
  - Extended platform detector to recognize Bolt/StackBlitz-specific packages (`@stackblitz/`, `@bolt/`, and `bolt-tagger`).


### Fixed
- **Peer Dependency resolution in Docker**: Added `--legacy-peer-deps` to npm install phase in Docker verifier to prevent ERESOLVE compilation crashes on React 19 apps with React 18 peer requirements. Tested and confirmed on a real Lovable project using React 19.
- **Unit Test isolation**: Fixed config restoration and env cleanup during Vitest runs to prevent dirty directory issues.
- **Transitive Security Vulnerabilities**: Upgraded development dependency Vitest/Vite to `v4.1.10` via force audit fix, resolving all 5 vulnerabilities (moderate/high/critical) in esbuild/vite dev chain.

### Tracked Issues / Pending Items
- **Real-world validation gap (Priority 4)**: Completed Real-World Validation Round 2 against a second real Lovable project with AI edge function integrations. Verified platform fingerprinting accuracy, adjusted `LOVABLE_SCOPED_DEP_001` and platform detector to recognize `lovable-tagger`, and added `LOVABLE_API_GATEWAY_001` to flag lock-in dependencies like Lovable AI Gateway (`ai.gateway.lovable.dev`). Checked scores and verified true negatives on a clean Bolt project template.

## [0.1.0] - 2024-01-XX

### Added
- **CLI framework** with `analyse` command, `--offline`, `--platform`, `--format`, `--output` flags
- **Platform detection** with multi-signal fingerprinting and confidence levels for Lovable, Bolt, and Replit
- **Lovable portability rules:**
  - `LOVABLE_SCOPED_DEP_001` — Detects `@lovable.dev/*` scoped package dependencies
  - `LOVABLE_CONFIG_001` — Detects Lovable-specific configuration files and directories
  - `LOVABLE_COMMENT_001` — Detects Lovable/GPT-Pilot code markers
- **Universal security rules:**
  - `SEC_HARDCODED_SECRET_001` — Hardcoded API keys, tokens, and secrets (AWS, Stripe, GitHub, Supabase service-role)
  - `SEC_CLIENT_ROLE_001` — Client-side-only role enforcement with server-side cross-reference
  - `SEC_MISSING_RLS_001` — Missing Row Level Security on Supabase tables
  - `SEC_POSSIBLE_IDOR_001` — Ownership-blind database queries (low-confidence heuristic, clearly labeled)
  - `SEC_HALLUCINATED_DEP_001` — Non-existent npm packages (with proper error handling for network failures)
- **Report generator** with separate Portability and Security scores, Markdown and JSON output
- **48 automated tests** covering true positives, true negatives, and edge cases for every rule
- **5 synthetic test fixtures** covering various real-world patterns

### Retired
- `LOVABLE_BADGE_001` — DOM badge only exists at hosting layer, never in exported source. Not implemented.

### Security
- Zero network calls to any AI platform's servers (verified by grep audit)
- Only network call is to public npm registry for dependency existence checks (skippable with `--offline`)
