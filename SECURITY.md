# Security Policy

## Responsible Disclosure

We take the security of `deviber-cli` and the projects it scans very seriously. If you find a security vulnerability in the tool itself or have suggestions for improving its safety patterns, please report it responsibly:

1. **Do not open a public issue** on GitHub for security vulnerabilities.
2. Email your findings to the maintainers (e.g. `security@deviber.org` or open a private report on GitHub if available).
3. Provide details on the vulnerability, steps to reproduce, and any proof-of-concept code.
4. Give us reasonable time to investigate and address the issue before making it public.

---

## Important Notice on Analysis Heuristics

`deviber-cli` is an automated scan tool designed to help developers and non-technical founders identify common platform lock-in patterns and basic security issues in code exports. 

> [!WARNING]
> **This tool is NOT a substitute for a professional security audit.** 
> - It uses pattern matching and heuristic rules to flag common vulnerabilities (e.g., hardcoded secrets, basic role-checks, missing RLS configuration).
> - It **cannot** guarantee that a project is completely secure or free from vulnerabilities not covered by its rules.
> - Many rules (such as `SEC_POSSIBLE_IDOR_001`) use heuristic pattern matching that may result in false positives or false negatives.
> - Always perform manual security reviews and consult with qualified security professionals before deploying your project to production.

---

## Supported Versions

Only the latest release of `deviber-cli` is actively supported with security updates. Please ensure you are running the latest version:

```bash
# Check version
npx deviber-cli --version
```
