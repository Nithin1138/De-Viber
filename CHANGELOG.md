# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
