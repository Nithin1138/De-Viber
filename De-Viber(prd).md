# PRD: Portability Layer for AI-Generated Codebases
### (Working name: "De-Viber" — rename before launch)

**Version:** 1.0 (Final)
**Owner:** Nithin
**Status:** Draft for build

---

## 1. Problem Statement

Non-technical founders and rapid prototypers build real, traction-getting applications on AI app-builder platforms (Bolt, Lovable, Replit, and similar). At some point — usually right after early traction — they hit a wall:

1. **Vendor lock-in.** Code can be exported, but the application is architecturally married to the platform's infrastructure (proprietary auth wrappers, platform-specific DB bindings, runtime assumptions like Bolt's WebContainers). Migrating requires reconfiguring the runtime, environment variables, deployment pipeline, and database layer — work most non-technical founders cannot do themselves.
2. **Code quality debt.** AI-generated code is frequently duplicated, undocumented, and structurally inconsistent. A hired engineer reviewing it often quotes a full rewrite rather than incremental work — commonly cited in the $30–50k range.
3. **No neutral way to assess risk.** Founders, agencies, and investors have no standard way to answer "how locked-in / how rebuildable is this codebase?" before committing time or capital to it.

This is now a structural, recurring event across a fast-growing user base, not an edge case — confirmed by the existence of at least one narrow open-source tool already solving a piece of it for a single platform.

---

## 2. Competitive Landscape (as of research)

| Platform | Lock-in severity | Existing dedicated tooling |
|---|---|---|
| Bolt.new | Highest — WebContainers architecture, browser-based | None found |
| Replit | High — hosting/DB tied to platform infra | None found |
| Lovable | Moderate — GitHub two-way sync exists, but auth/SQL wrappers baked in | `lovable-eject` (github.com/ABS-Projects-2026/lovable-eject) — solo, unmaintained-style, single-platform, no warranty |

**Implication:** Bolt and Replit are open ground. Lovable has a weak first mover worth studying, not fearing. No competitor addresses more than one platform, and none offers a scoring/assessment layer, drift monitoring, or a B2B due-diligence product.

---

## 3. Product Vision

Not "an eject button for platform X." The full vision is to become the **neutral portability and trust layer for the entire AI-app-builder ecosystem** — the thing people check *before* they get locked in, the tool they run *when* they need to leave, and the report investors and agencies request *before* they commit money or time to an AI-built codebase.

Three product surfaces, built in sequence:

1. **Eject Engine** (v1) — analyse → transform → deploy, per platform.
2. **Portability Score** (v1.5) — free, shareable scan and report; top-of-funnel and category-defining artifact.
3. **Universal IR + Drift Monitoring + B2B Due Diligence** (v2+) — the moat layer.

---

## 4. Core Architecture: Universal Intermediate Representation (IR)

Rather than building N one-way, point-to-point converters (Replit→portable, Bolt→portable, Lovable→portable), the system translates any source project into a **neutral structural representation** first, then out to any target.

```
[Platform Source] → [Parser/Adapter] → [Universal IR] → [Target Adapter] → [Portable Output]
     Bolt                                     |                              Vercel + Postgres
     Replit                                   |                              Railway + Postgres
     Lovable                                  |                              Self-hosted
```

**What the IR captures:**
- Dependency graph (tree-sitter-based symbol/call graph across files)
- Data layer bindings (DB calls, schema, auth flows) tagged by origin (platform-native vs. standard)
- Infra/config bindings (env vars, build scripts, deployment assumptions)
- Code quality metadata (duplication, dead code, structural inconsistency, missing docs)

**Why this matters:** once the IR exists, adding a new source platform or new deployment target is an adapter, not a rewrite of the whole pipeline. This is the difference between shipping N migration scripts and shipping infrastructure — and it's what a solo competitor replicating one platform's eject tool cannot easily match.

---

## 5. Feature Breakdown by Phase

### Phase 1 — Eject Engine (v1, ship first)

Target platform: **Replit or Bolt** (not Lovable — already weakly served).

- **Analyse** (read-only, safe to run anytime): scans repo, builds IR, flags platform-specific dependencies, outputs a report.
- **Transform**: rewrites flagged code to portable equivalents (standard Postgres, standard JWT auth, standard env config). Every change produces a backup; nothing is destructive by default.
- **Deploy**: guided walkthrough to Vercel/Railway + user's own DB instance.
- **Safety net**: if tests exist, run before/after to confirm behavior didn't change; if absent, generate minimal smoke tests first. This is the highest-risk, highest-trust step and should not ship without it.

**Success metric for v1:** run against 3–5 real Bolt/Replit projects; each must deploy and run correctly outside the original platform without manual fixes beyond what the tool's report explicitly flags as "needs manual attention."

### Phase 1.5 — Portability Score (cheap add-on, high leverage)

A free, shareable score (0–100, or letter-grade style) computed from the same Analyse pass:

- **Inputs:** number/severity of platform-specific dependencies, estimated migration effort (hours), code quality score (duplication, doc coverage, structural consistency), test coverage presence.
- **Output:** a shareable report/badge — "This project scored 42/100 portability — high lock-in risk" — plus a plain-language breakdown of what's driving the score.
- **Purpose:** low-friction top-of-funnel (free, runs before anyone needs the paid eject), and a chance to become the reference standard people cite unprompted ("check your Portability Score before you build further").

This reuses the Analyse engine already built for Phase 1 — no new core technology required, mostly report/UI work.

### Phase 2 — Drift Monitoring (recurring revenue driver)

Instead of a single one-time run, offer background monitoring for founders actively still building on a platform:

- Tracks portability drift over time as new features are added.
- Alerts before lock-in gets meaningfully worse (e.g., "this week's changes added 3 new platform-specific DB calls").
- Converts the product from a one-time event purchase into a genuine subscription — and is a materially harder technical problem (continuous diffing vs. one-shot scan) than what a hobbyist competitor is likely to replicate casually.

### Phase 3 — B2B Due Diligence Product

Package the Portability Score + full Analyse report as a due-diligence artifact sold directly to:

- **Investors/acquirers** evaluating a vibe-coded startup before funding or buying it — "how rebuildable is this codebase, really" currently has no standard answer.
- **Agencies** who inherit AI-built projects from clients and currently eat the cost of manually untangling them before quoting work.

This is a higher-ACV, lower-volume channel that can be pursued in parallel once the core scan engine is proven, without additional core R&D.

### Phase 4 (optional, longer-term) — Platform Partnership Angle

Bolt/Lovable/Replit each face lock-in fear as a real sales objection. A neutral, trusted portability layer they can point prospective users to ("you can always leave cleanly") may be something they'd rather partner with, license, or acquire than compete against. Not a v1 priority, but worth keeping the product neutral and well-documented enough that this door stays open.

---

## 6. Revenue Model

| Stream | Price | Phase | Notes |
|---|---|---|---|
| One-time Eject | $49–199/project | Phase 1 | Primary initial offer; matches the acute moment of need; easy comparison vs. $30–50k rewrite quote |
| Portability Score | Free | Phase 1.5 | Funnel/trust-building, not a revenue line |
| Drift Monitoring | $29–99/mo | Phase 2 | Upsell after eject or for active builders; do not lead with this — the need is mostly one-time early on |
| Agency/Reseller | Flat monthly or per-project bulk rate | Phase 1–2 | Higher LTV, smaller customer count, direct outreach channel |
| B2B Due Diligence Report | Custom / per-report ($200–1000+) | Phase 3 | Investor/agency buyer, higher ACV, low volume |

**Sequencing recommendation:** validate with #1 (one-time eject) first — fastest to test, matches actual buyer psychology (acute pain, not subscription mindset). Layer in the free Portability Score as soon as the Analyse engine is stable, since it's nearly free to add and drives distribution. Treat monitoring and B2B as second-stage expansions once the core mechanism is proven reliable across real projects.

---

## 7. Technical Stack (matches existing preferences)

- **Parsing:** tree-sitter for symbol/dependency graph extraction
- **Backend:** Node.js/Express, PostgreSQL
- **CLI-first** for v1 (matches `lovable-eject` proof-of-concept pattern); web dashboard layer added once Portability Score ships
- **Zero-external-API-cost architecture** where possible for the core scan; LLM calls (if used for doc generation / plain-language report summaries) kept minimal and optional

---

## 8. Risks & Open Questions

- **Correctness risk is the whole business.** A transform that silently breaks behavior is worse than no tool at all — the safety-net testing step (Phase 1) is not optional and should be over-invested in relative to feature breadth.
- **Platform ToS drift.** Export mechanisms are currently sanctioned features on all three platforms researched, but platforms could restrict this later if portability tooling is perceived as competitive — monitor ToS changes periodically, especially if pursuing Phase 4 partnerships.
- **Coverage breadth vs. depth tradeoff.** Resist the urge to support all platforms at once; one platform done reliably beats three done shakily, especially pre-revenue.
- **IR investment timing.** Building the full universal IR before validating a single-platform eject works is a sequencing risk — build the IR abstraction only after Phase 1 proves the core transform logic on one real platform.

---

## 9. Success Criteria for "Go" Decision

Before committing beyond v1 CLI:
1. 3–5 real projects successfully ejected and redeployed with no undisclosed breakage.
2. At least one unprompted "would you pay for this" signal from a real founder or agency outside your own network.
3. Portability Score report generates organic sharing (posted unprompted in a community thread) without paid promotion.

If these three hold, proceed to Phase 1.5–2. If not, treat this as a validated learning exercise and reassess against capstone/NearbyAI priorities before further investment.
