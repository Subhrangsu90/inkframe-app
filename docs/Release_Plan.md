# Inkframe Release Plan

| | |
| --- | --- |
| **What** | How Inkframe ships as a SaaS product: the release stages (Stage 0, Alpha, Beta, Gamma, GA), what each one contains, the gates between them, environments, versioning, deploys and rollbacks |
| **Covers** | Both repositories: `inkframe-app` (the app and `@inkframe-ui/editor`) and `inkframe-server` |
| **Companions** | [Product Plan](Inkframe_Product_Plan.md): what we build (features, milestones M0–M7, decisions). [Data Safety Plan](Data_Safety_Plan.md): how user data is protected (controls `DS-x.y`, referenced below). [Server Plan](../../inkframe-server/docs/Server_Plan.md): every route, table and job. |
| **Last updated** | 2026-10-23 |
| **Status** | Stage 0 (pre-alpha) starts 2026-10-26. The local editor is built; accounts work in development; sync, images, billing and production infrastructure are not built yet. |

**Status marks:** ✅ done · 🟡 partial · ⬜ not started

---

## Contents

1. [Summary](#1-summary)
2. [The release ladder](#2-the-release-ladder)
3. [What ships in each stage](#3-what-ships-in-each-stage)
4. [Stage details and gates](#4-stage-details-and-gates)
5. [After GA: release trains and Labs](#5-after-ga-release-trains-and-labs)
6. [Environments](#6-environments)
7. [Versioning](#7-versioning)
8. [How a release ships](#8-how-a-release-ships)
9. [Feature flags, cohorts and kill switches](#9-feature-flags-cohorts-and-kill-switches)
10. [Feedback and quality signals without analytics](#10-feedback-and-quality-signals-without-analytics)
11. [Communication](#11-communication)
12. [Release checklist](#12-release-checklist)
13. [Decisions and risks](#13-decisions-and-risks)

---

## 1. Summary

Inkframe has two halves with very different risk:

- **The editor** (local documents, export, share links) keeps everything on the device. It is built, and a bug in it can't expose anyone's data on a server, because there is none.
- **The cloud** (accounts, sync, images, public links, billing) holds people's documents on our servers. It is mostly unbuilt, and a bug in it can lose or expose data.

So the plan releases them on different tracks. **The editor goes public at Closed Beta. The cloud climbs every rung of the ladder,** and moves up only when its gate's checks pass. Gates move releases; dates don't.

```text
Stage 0 ──► Alpha ──► Closed Beta ──► Open Beta ──► Gamma (RC) ──► GA 1.0 ──► 1.1, 1.2, …
 2 weeks    5 weeks    6 weeks         4 weeks       3 weeks        16 Mar 2027
 setup      staging,   production,     anyone can    feature        Beta labels
            invited    invite codes;   sign up       freeze,        come off
            testers    editor public                 proof
```

Three rules hold at every stage:

1. **A stage starts only when the previous gate is fully ticked.** If a gate slips, the next stage slips with it. Nothing is waived because a date is near.
2. **Data loss or data exposure is always Sev-1.** It stops the stage until it is understood and fixed (see [10](#10-feedback-and-quality-signals-without-analytics)).
3. **The data promise only gets stronger.** Each stage tells users exactly what happens to their data ([2](#2-the-release-ladder)). A later stage may promise more, never less.

**Fallback (from the Product Plan, section 5):** if sync is not safe by Gamma, GA ships the editor alone, with the cloud kept behind its flag at its current stage. The editor works fully on its own, so this costs only the sync claims.

---

## 2. The release ladder

| Stage | Dates (target) | Who uses it | Where | What we promise about their data | Version |
| --- | --- | --- | --- | --- | --- |
| **Stage 0: Pre-alpha** | 26 Oct – 6 Nov 2026 | The team | Local, then staging | (No outside users) | `0.7.x` |
| **Alpha** | 9 Nov – 11 Dec 2026 | The team and 5–15 invited testers, each on at least two devices | Staging | Local documents are as safe as ever. Cloud copies may be reset with 7 days' notice. A reset loses nothing still on a device: sync uploads it again. | `0.8.0-alpha.N` |
| **Closed Beta** | 14 Dec 2026 – 22 Jan 2027 | Up to ~200 people with invite codes. **Anyone** can use the editor without an account. | Production | **No more resets.** Production data is kept, backed up and migrated forward from here on. | `0.9.0-beta.N` |
| **Open Beta** | 25 Jan – 19 Feb 2027 | Anyone can sign up; cloud features say "Beta" | Production | Same as Closed Beta. | `0.9.0-beta.N` |
| **Gamma (release candidate)** | 22 Feb – 12 Mar 2027 | Same as Open Beta | Staging first, then production | Same, and every control in the Data Safety Plan marked "GA" is in place. | `1.0.0-rc.N` |
| **GA 1.0** | Tue 16 Mar 2027 | Everyone | Production | The full promise in the privacy policy. | `1.0.0` |

The dates assume one or two people working on it. They are targets: the gates in [section 4](#4-stage-details-and-gates) decide. December has a holiday slowdown, which is why Closed Beta is six weeks.

**Why "Gamma":** it is the stage after Beta in which nothing new is added. It exists to prove the product: fixing the security review's findings, rehearsing a restore and an incident, and running a release candidate in production for a week before GA. Gamma is often called "RC" (release candidate); both names mean the same stage here.

---

## 3. What ships in each stage

Milestones (M…) are defined in the [Product Plan, section 5](Inkframe_Product_Plan.md#5-roadmap-to-production). Data safety controls (`DS-…`) are defined in the [Data Safety Plan](Data_Safety_Plan.md).

| Area | Stage 0 | Alpha | Closed Beta | Open Beta | Gamma | GA |
| --- | --- | --- | --- | --- | --- | --- |
| Editor (M0–M3.5) | ✅ built | Testers use it | **Public** at `inkframe.app`, labeled Beta | | Final claims audit | |
| Remaining editor checks: real iOS and Android (M3), Firefox and Safari (M3.5), real paste captures (M1) | | | ⬜ | | | |
| Accessibility audit (M4) | | | ⬜ | Fixes | | |
| Accounts: email and password, Google (M6.1) | ✅ dev | Staging, with email verification and password reset | Production | | | |
| Account section: export my data, delete account, sign-out choice (M6.1) | | ⬜ | | | | |
| Signed-in devices, security activity, two-step sign-in | | | ⬜ | | | |
| Magic links, GitHub sign-in (M6.1) | | | ⬜ optional | | | |
| Sync across devices (M6.2) | | ⬜ | | | | |
| Cloud images (M6.3) | | ⬜ | | | | |
| Public links `/p/<id>` (M6.3) | | | ⬜ | | | |
| Per-user quotas (Free limits) | | | ⬜ | | | |
| Subscriptions (M6.6) | | | Built, provider test mode | End to end in test mode | **Payments live** | |
| Library `@inkframe-ui/editor` | | | `1.0.0-beta.N` (`beta` tag) | Docs and playground | `1.0.0-rc.N` | `1.0.0` (`latest`) |
| Production infrastructure | Staging | | Production, backups, alerts | Status page, load test | Restore and incident drills | Hypercare |
| Legal: privacy policy, terms, subprocessors | | Tester terms | ⬜ Published | | Reviewed | |
| Security review | Self-review of headers and CI | Sync and storage self-review | | **External review** | Findings fixed | |
| Block mode (M7), AI (M6.4), collaboration (M6.5) | | | | | | After GA ([5](#5-after-ga-release-trains-and-labs)) |

---

## 4. Stage details and gates

Each stage has a goal, its work, and an exit gate. A gate item is ticked only with evidence linked: a CI run, a test, a screenshot, a drill's notes.

### 4.1 Stage 0: Pre-alpha. "Ready to hold testers' data"

**26 Oct – 6 Nov 2026.** Only the team. Nothing outside users touch exists yet, so this is the cheapest time to get the foundations right.

| Work | Size | Repository | Data Safety Plan |
| --- | --- | --- | --- |
| Decide the region (D22) before creating any Neon project: the region can't be moved later | S | — | DS-11.11 |
| Provision staging: Render services for the app and the API, `staging.inkframe.app` and `api.staging.inkframe.app` (the same site as `inkframe.app`, so cookies work), a **separate** Neon project for staging (D29) | S | both | DS-5.5 |
| Choose the email provider (D32) and set up its domain (SPF, DKIM, DMARC) | S | server | DS-3.3 |
| App server security headers: CSP, HSTS, `Referrer-Policy`, frame protection, `nosniff`; `security.allowedHosts` (blocker B6); compression | S | app | DS-2.1–2.3, DS-1.7, DS-1.13 |
| Server: refuse the example `BETTER_AUTH_SECRET` in production; database TLS with certificate checks; `/ready` | S | server | DS-4.12, DS-2.6, DS-10.1 |
| CI in both repositories: Dependabot, `npm audit`, secret scanning (gitleaks), Actions pinned to commit SHAs; branch protection with CI required; one default branch in `inkframe-app` (today both `main` and `master` exist, and CI runs on `master`) | S | both | DS-9.7–9.11 |
| Two-step sign-in on every provider account (GitHub, Render, Neon, AWS, Google Cloud, domain, email provider); secrets in a password manager; delete the loose OAuth client file in `G:\inkframe\other\` | S | — | DS-9.4, DS-9.5 |
| Server-driven feature flags and invite codes: `GET /v1/config`, `user.cohort`, sign-up modes `closed`, `invite`, `open` ([9](#9-feature-flags-cohorts-and-kill-switches)) | M | both | — |
| Versions: set `version` in both `package.json` files, `CHANGELOG.md` in both repositories, the app version in Settings → About | S | both | — |

**Exit gate (to Alpha):**

- [ ] Staging is up for both services and deploys on every merge to the default branch.
- [ ] Staging's response headers pass a header scan (CSP without `'unsafe-inline'` for scripts, HSTS, frame protection).
- [ ] CI in both repositories runs the security scans and must pass before merging.
- [ ] Every provider account has two-step sign-in, and no secret lives outside Render and the password manager.
- [ ] Sign-up on staging accepts only invite codes.

### 4.2 Alpha. "Sync works and never loses a word"

**9 Nov – 11 Dec 2026, on staging.** The team and 5–15 testers who agree to short tester terms (what alpha means, the data promise, how to report a problem). Each tester uses at least two devices, because sync bugs only show up with two.

| Work | Size | Data Safety Plan |
| --- | --- | --- |
| **Week 1:** email verification and password reset that never reveal whether an email has an account; changing or resetting a password signs out other devices | M | DS-3.3–3.5 |
| Account section in Settings: profile, sign out, **export my data**, **delete account** (asks for the password again) | M | DS-3.7, DS-11.3, DS-11.4 |
| Sign-out choice "Remove synced documents from this device" | S | DS-1.11 |
| **Sync (all of M6.2):** `CloudDocumentStore`, `SyncEngine`, conflict copies, offline queue, Trash, sync status, tombstones | L | DS-7.1–7.4 |
| Sync safety valves: deletions from sync go to the device's own Trash; a brake when one sync would delete or replace many documents; recovery after a server restore | M | DS-7.5, DS-7.6, DS-7.8 |
| Sync test suite: two devices, offline, flaky network, clock skew, server restored to an earlier point, randomized tests against a model | L | DS-7.7 |
| Server document checks: size, schema version, JSON depth | S | DS-4.2, DS-7.10 |
| **Cloud images (M6.3, without public links):** private S3 staging bucket, presigned uploads limited to size and type, checks on completion, no SVG | M | DS-6.1–6.8 |
| Per-user rate limits; a CI check that every new table has row-level security; cross-user tests for every new route | S | DS-4.5, DS-5.2, DS-5.3 |
| Keep or encrypt only what's needed from Google sign-in (Inkframe never uses Google's tokens); breached-password check (D31) | S | DS-3.2, DS-3.11 |
| "Report a problem" with an optional diagnostic summary that never includes document text ([10](#10-feedback-and-quality-signals-without-analytics)) | S | DS-10.4 |

**Exit gate (to Closed Beta):**

- [ ] The sync test suite passes in CI, including "server restored to an earlier point": devices upload their newer copies and nothing is lost.
- [ ] No lost edit reported by testers in the last two weeks of Alpha, and every earlier report traced to its root cause and fixed.
- [ ] Cross-user tests cover every route and table (documents, versions, images); none can reach another user's data.
- [ ] Deleting an account removes every row and every S3 object (test); the export contains everything the server holds for that user (test).
- [ ] Restore drill on staging: point-in-time restore, sync recovers, notes written.
- [ ] No open Sev-1 or Sev-2 bug.
- [ ] Privacy policy, terms and the subprocessor list drafted for publication at Closed Beta.

**Moving testers to production:** IndexedDB belongs to one origin, so documents on `staging.inkframe.app` don't appear on `inkframe.app`. At Closed Beta, testers export a backup on staging and restore it in production (Settings → Backup). Then staging is wiped and goes back to made-up data only.

### 4.3 Closed Beta. "Real infrastructure, invited people"

**14 Dec 2026 – 22 Jan 2027, in production.** The app at `inkframe.app` is public, so anyone can write without an account. Cloud sign-up needs an invite code (from a waitlist, the testers, or us). Up to about 200 accounts.

| Work | Size | Data Safety Plan |
| --- | --- | --- |
| Provision production: Neon production project (point-in-time restore of 7 days or more), production S3 bucket (versioning, lifecycle rules), Render production services, budget alerts in Render, AWS and Neon | M | DS-5.4, DS-6.9, DS-8.1 |
| Publish the privacy policy, terms, the subprocessor list and the age rule; sign the providers' data processing terms; a grievance contact | S | DS-11.1, DS-11.2, DS-11.6, DS-11.7 |
| Landing page and Settings copy for sync: "on your device by default", never "no server" for signed-in users (Product Plan 2.5) | S | DS-11.9 |
| Public links `/p/<id>` (M6.3) | M | DS-4.11 |
| Settings → Security: signed-in devices with Sign out, recent security activity, two-step sign-in (TOTP with backup codes) | M | DS-3.6, DS-3.10, DS-10.2 |
| Free plan limits enforced (documents, image storage, versions, links) even before payments exist | S | DS-4.5 |
| Subscriptions (M6.6) built against the provider's test mode; D24 and D25 decided by the start of this stage | L | DS-4.10 |
| Jobs: empty the Trash, orphaned images, expired sessions; daily logical backup to a separate AWS account | M | DS-8.2, DS-11.5 |
| Uptime checks and alerts on 5xx errors and failed jobs (production) | S | DS-10.1 |
| Editor launch work: accessibility audit, real iOS and Android checks, Firefox and Safari checks, real paste captures, product README (B8) | L | — |
| Library `1.0.0-beta.N` on npm under the `beta` tag, published from CI with provenance | S | DS-9.12 |

**Exit gate (to Open Beta):**

- [ ] Two weeks without a Sev-1 or Sev-2 incident.
- [ ] Restore drill in production: restore to a temporary branch in the production project, check it, delete it.
- [ ] The privacy policy, terms and subprocessor list are published and linked from sign-up.
- [ ] Sign-up abuse controls work (D30): limits per IP and per email domain, verification required before sync.
- [ ] Quotas are enforced on the server, and the budget alerts have fired once in a test.
- [ ] The accessibility audit has no critical or serious issues left.

### 4.4 Open Beta. "Anyone can sign up"

**25 Jan – 19 Feb 2027.** Sign-up is open; cloud features keep a "Beta" label. No new cloud features: this stage is for scale and outside eyes. Proposal for D25: Pro is free during the beta, with a founding-member price at GA.

| Work | Size | Data Safety Plan |
| --- | --- | --- |
| **External security review** of the API, sign-in, row-level security, the bucket policy, the webhook and the app's headers. If there is no budget for one, a structured self-review against OWASP ASVS level 2 plus an OWASP ZAP scan of staging. | M | DS-10.8 |
| Load test on staging at 10× the expected beta peak: sync, images, sign-in | S | — |
| Subscriptions end to end in test mode: checkout, renewal, a failed payment, `past_due`, grace period, expiry with nothing deleted | M | DS-4.10 |
| Status page; `/.well-known/security.txt` and a security contact | S | DS-10.6, DS-10.7 |
| "Show external images" in the reader for shared documents (external images in a shared document load only after a click) | S | DS-1.7 |
| Library docs: README with 5-minute setup, extension guide, playground page | M | — |

**Exit gate (to Gamma):**

- [ ] The security review's report is in; every critical and high finding has a fix in progress.
- [ ] The load test passes: saves under 300 ms at the 95th percentile, no errors.
- [ ] Billing passes every case above in test mode.
- [ ] No open Sev-1 or Sev-2 bug.

### 4.5 Gamma (release candidate). "Nothing new, everything proven"

**22 Feb – 12 Mar 2027.** Feature freeze in both repositories: only fixes merge. Each release candidate (`1.0.0-rc.N`) runs 3 days on staging, then goes to production.

| Work | Size | Data Safety Plan |
| --- | --- | --- |
| Fix every critical and high finding of the security review, and have them checked again | M | DS-10.8 |
| **Payments live:** a real purchase and a refund by the team; pricing, refund and cancellation policy published | S | DS-4.10 |
| Runbooks: deploy, roll back, restore the database, rotate each secret, delete a user's data on request, respond to a breach | M | DS-8.6, DS-9.6, DS-10.5 |
| Incident drills (on paper): "database password leaked" and "a user says a document disappeared" | S | DS-10.5 |
| Rollback rehearsal: roll the production app and API back one release and forward again | S | — |
| Claims audit: the landing page, FAQ, Settings and store listings against the Product Plan's status tables and D21 (never "end-to-end encrypted") | S | DS-11.9 |
| Every item in the [release checklist](#12-release-checklist) ticked, with evidence | — | — |

**Go / no-go for GA:**

- [ ] No open Sev-1 or Sev-2 bug, and no open critical or high security finding.
- [ ] The last release candidate ran 7 days in production without a Sev-1 or Sev-2.
- [ ] The release checklist is complete.
- [ ] Every Data Safety Plan control marked "GA" is ✅.

### 4.6 GA 1.0

**Tuesday 16 March 2027.** Launch on a weekday morning, never before a weekend or holiday.

- Tag `v1.0.0` in both repositories; publish `@inkframe-ui/editor@1.0.0` under `latest`.
- Remove the Beta labels; publish the changelog and the launch posts.
- **Hypercare, two weeks:** check errors, the conflict-copy rate, failed jobs and the support inbox every day. Only fixes ship (`1.0.x`).

---

## 5. After GA: release trains and Labs

### 5.1 Release rhythm

| Kind | Example | When | Rules |
| --- | --- | --- | --- |
| Patch | `1.0.1` | As needed | Fixes only. Any weekday, not Friday afternoon. |
| Minor | `1.1.0` | Every 4–6 weeks | New features, behind flags until ready. Additive database and API changes only. |
| Major | `2.0.0` | Rarely | Only for breaking library API changes. The app's `/v1` routes never break; a breaking route change is `/v2`. |

### 5.2 Labs: every big feature climbs its own ladder

After GA, each large feature goes through the same stages as the product did, behind a server flag ([9](#9-feature-flags-cohorts-and-kill-switches)):

| Feature stage | Who sees it | Data promise |
| --- | --- | --- |
| **Labs** (alpha) | People who turn it on in Settings → Labs | The feature may change or go away; anything it saved stays readable and exportable |
| **Beta** | Everyone, labeled "Beta" | The feature stays; its data is kept and migrated |
| **GA** | Everyone | Full promise |

A feature that stores new kinds of data on the server (AI usage, collaboration roles) needs a Data Safety Plan review before Labs and again before GA.

### 5.3 Roadmap after GA

| Release | Target | Contents | Data safety notes |
| --- | --- | --- | --- |
| **1.1** | Apr – May 2027 | Block mode M7.1–M7.3. Growth P1 items (M5): outline, focus mode, share size warning. Encrypted backups (DS-1.10). | Block mode needs no server, so its risk is to the document format: round-trip and migration tests. |
| **1.2** | Jun 2027 | AI assistant (M6.4): Labs, then Beta | A provider whose terms say it neither keeps nor trains on content, with signed data processing terms. Prompts are never stored. Keys only on the server (CI check). Per-user quotas. A review of the AI endpoint before Labs. |
| **1.3** | Q3 2027 | Real-time collaboration (M6.5): Labs in 1.3, GA in 1.4 | Members can read others' documents: new row-level security for members, cross-user tests for each role, and a new security review. |
| **1.4+** | Q4 2027 | Comments and suggestions; Team plan; Block mode columns (M7.4) | |

---

## 6. Environments

| | Local | CI | Staging | Production |
| --- | --- | --- | --- | --- |
| App | `localhost:4200` | builds only | `staging.inkframe.app` | `inkframe.app` |
| API | `localhost:3001` | test server | `api.staging.inkframe.app` | `api.inkframe.app` |
| Database | Postgres in Docker | Postgres service | Neon project `inkframe-staging` | Neon project `inkframe-prod` |
| Images | MinIO in Docker | MinIO | S3 `inkframe-staging-images` | S3 `inkframe-prod-images` |
| Data | Made up | Made up | Made up (testers' real data during Alpha only) | Real users |
| Secrets | `.env` (dev values) | CI secrets (test values) | Render environment (staging values) | Render environment (production values) |
| Deploys | — | every push | automatically, on every merge to the default branch | from a version tag, after a manual approval |

**Rules:**

1. **Production data never leaves production.** It is never copied to staging, a laptop or a test. Restore drills run on a temporary branch inside the production project and are deleted after (DS-5.5).
2. **Each environment has its own credentials:** its own database passwords, auth secret, S3 keys and Google OAuth client. A leaked staging key can't open production.
3. **During Alpha, staging holds testers' real documents**, so it gets production's access rules until it is wiped at Closed Beta.
4. Every region matches D22: Render, Neon and S3 in the same region.

---

## 7. Versioning

| What | Scheme | Where it shows | Changes when |
| --- | --- | --- | --- |
| App (`inkframe-app`) | SemVer with pre-release tags: `0.8.0-alpha.3`, `0.9.0-beta.2`, `1.0.0-rc.1`, `1.0.0` | Settings → About | Every release; tag `vX.Y.Z` |
| Server (`inkframe-server`) | SemVer, its own numbers | `/health` (version only) | Every release; tag `vX.Y.Z` |
| API | `/v1` | URL | Routes only grow; a breaking change is `/v2` |
| Library (`@inkframe-ui/editor`) | SemVer; npm tags `next` (Labs), `beta`, `rc`, `latest` | npm | Product Plan, section 8 |
| Document format | `SCHEMA_VERSION` (7 today), with a migration and a fixture test for every change | Inside each document | Product Plan, 6.2 rule 5 |
| Backup file | `version` in `.inkframe.json` (1 today) | Inside each backup | Any format change; old backups must still restore |

**Old app versions.** The app is a PWA, so people can run a cached version for weeks. The server supports every app version released in the last 90 days. `GET /v1/config` returns `minAppVersion`; an app older than that shows the existing "Reload to update" message instead of syncing (it keeps saving locally). The app compares the versions itself, so it never needs to send its version to the server.

---

## 8. How a release ships

### 8.1 Pipeline

```text
Pull request ─► CI (format, lint, types, tests, builds, security scans) ─► review ─► merge
   ─► staging deploy (migrations first) ─► scripted smoke test on staging
   ─► tag vX.Y.Z ─► manual approval ─► production: migrations ─► API ─► app
   ─► smoke test in production with a test account ─► watch errors for 30 minutes
```

The smoke test signs in, creates and syncs a document, uploads an image, opens it on a second session, and deletes it.

### 8.2 Database changes: expand, then contract

1. **Expand:** add new columns or tables (nullable or with defaults). The running code ignores them.
2. **Migrate:** ship code that writes both the old and the new shapes; backfill.
3. **Contract:** in a **later** release, remove what's no longer used.

Never rename or drop something in the same release as the code that stops using it. Every migration's SQL is read before it merges. Before a migration that deletes anything, note the time in the release notes, so a point-in-time restore has a target.

### 8.3 Rollback

| What broke | How to roll back |
| --- | --- |
| App | Render: redeploy the previous release. The service worker sees a new version and installed apps get the "Reload" message. |
| API | Render: redeploy the previous release. Expand-then-contract means the previous API still works with the newer schema. |
| Database data | Never rolled back by script. A data disaster means a point-in-time restore (runbook, DS-8.6) and sync's recovery after a restore (DS-7.8). |
| Sync misbehaving | Turn on the sync kill switch ([9](#9-feature-flags-cohorts-and-kill-switches)). Devices keep working offline and queue their changes. |

### 8.4 When not to deploy

Not on Friday afternoon, not before a holiday, and not when nobody can watch production for the next two hours.

---

## 9. Feature flags, cohorts and kill switches

| Layer | What | Decides |
| --- | --- | --- |
| Build flag | `cloud.enabled` in `src/environments/` (exists) | Whether a build contains any cloud UI. Off in production builds until Closed Beta. |
| Server config | `GET /v1/config` → `{ signUp: 'closed' \| 'invite' \| 'open', features: { sync, images, publicLinks, billing, ai, collab }, minAppVersion }` | What each environment offers, without a new app release |
| Cohort | `user.cohort`: `internal`, `alpha`, `beta`, `everyone` | Who sees Labs and beta features |
| Kill switch | A feature set to `paused` | Sync paused: the API answers 503 `sync_paused` with `Retry-After`; the app shows "Sync paused" and keeps saving on the device |

The server enforces every flag: a route of a feature that is off answers 404, whatever the app shows. Flags live in one server config file, like the plan limits in `plans.ts`.

---

## 10. Feedback and quality signals without analytics

Inkframe collects no analytics (D9), so quality comes from what people choose to send and from server counts that hold no content.

| Signal | Source |
| --- | --- |
| Bugs and ideas | Testers' private channel (Alpha, Closed Beta); a feedback form; GitHub issues for the library |
| "Report a problem" | In the app: opens a prefilled email or issue with the app version and browser. An **optional** diagnostic summary (sync queue length, recent error codes, schema version) is shown in full before sending. Never document text or titles. |
| Server health | 5xx rate, 95th-percentile latency, failed jobs |
| Sync health | Conflict copies created, 409 rate, queue replays, `sync_paused` time. Totals per day, not per user. |
| Growth | Sign-ups and synced documents (totals), npm downloads |
| Check-ins | A five-question form every two weeks during Alpha and Closed Beta |

### Severity

| Severity | Meaning | Response |
| --- | --- | --- |
| **Sev-1** | Any data loss or data exposure; or the cloud is down for everyone | Drop everything. Pause the stage. Kill switch if it helps. Postmortem within 3 days. |
| **Sev-2** | A main feature broken for many people, no easy workaround | Fix within 2 days |
| **Sev-3** | Broken with a workaround | Next release |
| **Sev-4** | Cosmetic | When convenient |

---

## 11. Communication

| What | From | Where |
| --- | --- | --- |
| Tester terms (one page: what Alpha means, the data promise, how to report) | Alpha | Sent with each invite |
| Beta terms (the same for Beta) and the "Beta" label | Closed Beta | Sign-up page, Settings |
| `CHANGELOG.md` | Stage 0 | Both repositories |
| "What's new" | Closed Beta | Settings → About |
| Notice of planned downtime or anything that changes stored data | Alpha | Email: 7 days ahead during the betas, 14 days after GA |
| Status page | Open Beta | `status.inkframe.app` |
| Security contact and `security.txt` | Open Beta | `/.well-known/security.txt` |

---

## 12. Release checklist

Moved here from the Product Plan (formerly section 9.5) and extended. Tick every item before GA. Items marked *(each release)* are checked again for every minor release.

### 12.1 Editor and app

- [ ] All launch blockers in the [Product Plan, 4.2](Inkframe_Product_Plan.md#42-launch-blockers-must-fix-before-public-launch) closed.
- [ ] `security.allowedHosts` (or `NG_ALLOWED_HOSTS`) set for the production domains.
- [ ] CSP, security headers and caching headers configured; service worker versioning verified.
- [ ] Backup, restore and migration tested with documents from the previous release. *(each release)*
- [ ] Library tarball installed into a clean Angular app and smoke-tested. *(each release)*
- [ ] Accessibility: no critical or serious axe issues; keyboard-only pass.

### 12.2 Cloud

- [ ] Neon point-in-time restore window at least 7 days; a restore rehearsed on a temporary branch of the production project, then deleted.
- [ ] Daily logical backup to a separate AWS account, and one restored from it.
- [ ] S3: all public access blocked, versioning on, lifecycle rules for old versions.
- [ ] Cross-user access tests pass against staging. *(each release)*
- [ ] Two-device sync tested end to end: offline edits, conflicts, deletes, Trash restore, server restore. *(each release)*
- [ ] Account deletion and data export tested end to end.
- [ ] Billing: checkout, renewal, failed payment, cancel, refund, webhooks replayed and out of order.

### 12.3 Security and operations

- [ ] Security review done and its critical and high findings fixed.
- [ ] Secrets only in Render's environment variables and the password manager; a separate set for each environment.
- [ ] Two-step sign-in on every provider account.
- [ ] Budget alerts set in Render, AWS and Neon.
- [ ] Uptime checks and error alerts reach a phone.
- [ ] Runbooks written and the incident drill done.

### 12.4 Privacy and claims

- [ ] Privacy policy, terms and subprocessor list published; every "no server" or "no account" claim updated (Product Plan, 2.5).
- [ ] Claims audit: no claim without a ✅ row in the Product Plan, section 3. *(each release)*

---

## 13. Decisions and risks

### 13.1 Decisions this plan needs

Recorded in the [Product Plan's decision log](Inkframe_Product_Plan.md#111-decision-log).

| # | Decision | Needed by |
| --- | --- | --- |
| D22 | Region of Render, Neon and S3 (confirm where users are first) | Stage 0, before any Neon project |
| D24 | Payment provider | Closed Beta start |
| D25 | Plans, prices, and when payments go live (proposal: Pro free during the betas, live at Gamma) | Closed Beta start |
| D28 | This release ladder: Stage 0, Alpha, Closed Beta, Open Beta, Gamma, GA | Now |
| D29 | Staging is a separate Neon project with made-up data, never a branch of production | Stage 0 |
| D30 | Sign-up abuse controls without a third-party CAPTCHA | Closed Beta |
| D31 | Breached-password check at sign-up and password change | Alpha |
| D32 | Email provider | Stage 0 |

### 13.2 Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Sync takes longer than five weeks | High | Alpha extends; the following dates move. Last resort: GA ships the editor alone, with the cloud still behind its flag. |
| A sync bug deletes or overwrites documents | High | Device copy stays primary; deletions from sync go to the device's Trash; a brake on mass changes; sync kill switch; randomized tests (DS-7.x). |
| Testers lose documents moving from staging to production | Medium | Moving by backup and restore is explained in the invite email and in the app on staging. |
| One maintainer: incidents when nobody is around | High | Local-first means an outage stops sync, not writing; kill switch; alerts on a phone; a status page; deploy rules in 8.4. |
| Old cached app versions talk to a newer server | Medium | `/v1` only grows; `minAppVersion`; 90 days of support. |
| No budget for an external security review | Medium | ASVS level 2 self-review plus a ZAP scan; buy a focused review of sign-in and row-level security first, since they matter most. |
| Holidays during Closed Beta | Low | Six weeks planned instead of four. |
| Region chosen wrongly | Medium | D22 decided in Stage 0 from where testers and the waitlist are. |
