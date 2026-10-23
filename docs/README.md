# Inkframe docs

Four plans describe Inkframe. Each fact lives in exactly one of them; the others link to it.

| Document | Answers | Read it when |
| --- | --- | --- |
| [Product Plan](Inkframe_Product_Plan.md) | **What** we build and **why**: positioning, features and their status, milestones M0–M7, architecture, design system, the library, decisions (D1–D32), risks | You build or change a feature |
| [Release Plan](Release_Plan.md) | **When** and **how** it ships: Stage 0, Alpha, Beta, Gamma, GA; each stage's gate; environments; versioning; deploys and rollbacks; the release checklist | You plan the next weeks, deploy, or tag a release |
| [Data Safety Plan](Data_Safety_Plan.md) | **How user data stays safe**, from the browser to backups: what we promise, what data we hold, threats, every control by layer (`DS-x.y`) with its status, gaps found, incident response, privacy law | You touch accounts, sync, storage, the server, secrets or anything holding user data |
| [Server Plan](../../inkframe-server/docs/Server_Plan.md) (in `inkframe-server`) | Every **route, table and job** with its status; subscriptions | You work on the server |

The READMEs of [inkframe-app](../README.md) and [inkframe-server](../../inkframe-server/README.md) explain how to run each repository.

## Where a new fact goes

| The fact | Goes in |
| --- | --- |
| A feature's status, scope or priority | Product Plan, section 3, and its milestone in section 5 |
| Which release stage ships it, or a new gate item | Release Plan, sections 3 and 4 |
| A threat, a control, a new kind of personal data, a retention period | Data Safety Plan |
| A route, table or background job | Server Plan |
| A decision | Product Plan, section 11.1 (one log for both repositories) |

## Shared conventions

- **Status marks:** ✅ done (built and tested) · 🟡 partial · ⬜ not started.
- **Sizes:** S ≤ 2 days, M ≤ 1 week, L > 1 week.
- **Ids are stable:** milestones (M6.2), decisions (D21), blockers (B6), controls (DS-7.5) and gaps (G4) are never renumbered, so pull requests and commits can cite them.
- **"Last updated"** in a plan's header changes with every edit to that plan.
- Claims on the landing page, in the FAQ and in Settings may only describe ✅ rows (Product Plan, 2.6).

## Reading order for someone new

1. Product Plan, sections 1–2 (what Inkframe is and promises)
2. Release Plan, sections 1–2 (where we are and what's next)
3. Data Safety Plan, sections 1–3 (what we promise about data, and against what)
4. Then the section for the work in hand.
