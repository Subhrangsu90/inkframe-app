# Inkframe Data Safety Plan

| | |
| --- | --- |
| **What** | How Inkframe keeps user data safe end to end: from the browser, through the network, the server, the database and image storage, to backups, operations and the law. Safe means two things: **nobody else can read it**, and **it is never lost**. |
| **Covers** | Both repositories, every environment, and the provider accounts behind them |
| **Companions** | [Release Plan](Release_Plan.md): which stage needs each control. [Product Plan](Inkframe_Product_Plan.md): features and decisions (D9, D11, D13, D21). [Server Plan](../../inkframe-server/docs/Server_Plan.md): routes and tables. |
| **Last updated** | 2026-10-23 |
| **Status** | The device side is strong and tested. The server's access rules (row-level security) are built and tested. Production infrastructure, sync safety, backups, monitoring and the legal side are not built yet. [Section 12](#12-gaps-found-in-the-code-2026-10-23) lists what the code review found. |

**Status marks:** ✅ done (built and tested) · 🟡 partial · ⬜ not started. **Needed by** names the release stage whose gate requires it ([Release Plan, 2](Release_Plan.md#2-the-release-ladder)). Control ids (`DS-x.y`) are stable: the Release Plan and pull requests refer to them.

This plan replaces the Product Plan's former section 9.3, "Security model". Every row of that table is kept below.

---

## Contents

1. [What we promise](#1-what-we-promise)
2. [What data we hold](#2-what-data-we-hold)
3. [Threats](#3-threats)
4. [Layer 1: device and browser](#4-layer-1-device-and-browser)
5. [Layer 2: network](#5-layer-2-network)
6. [Layer 3: accounts and sessions](#6-layer-3-accounts-and-sessions)
7. [Layer 4: API server](#7-layer-4-api-server)
8. [Layer 5: database](#8-layer-5-database)
9. [Layer 6: image storage](#9-layer-6-image-storage)
10. [Layer 7: sync that never loses data](#10-layer-7-sync-that-never-loses-data)
11. [Layers 8–11: backups, secrets, operations, privacy](#11-layers-811-backups-secrets-operations-privacy)
12. [Gaps found in the code (2026-10-23)](#12-gaps-found-in-the-code-2026-10-23)
13. [Work by stage](#13-work-by-stage)

---

## 1. What we promise

These are the promises the privacy policy will make. Every control below exists to keep one of them true.

| # | Promise | Kept by |
| --- | --- | --- |
| P1 | **Without an account, nothing you write leaves your device.** | Local-first storage, no third-party requests, share links in the URL fragment (Layer 1) |
| P2 | **With an account, only you can open your synced documents in Inkframe.** Other users can't, and staff don't look at them. | Sessions, row-level security, private image storage, production access rules (Layers 3–6, 10) |
| P3 | **Synced documents are encrypted in transit and at rest.** Not end-to-end: the service could technically read them, and we never claim otherwise (D21). | TLS, provider encryption at rest (Layers 2, 5, 6) |
| P4 | **We don't lose your writing.** The copy on your device stays primary; sync never silently overwrites; deleted documents can be restored for 30 days; we keep backups. | Layers 1, 7, 8 |
| P5 | **You can take everything with you, and delete everything.** | Backup files, data export, account deletion (Layers 1, 11) |
| P6 | **No tracking.** No analytics, no advertising, no selling data. | D9; aggregate server counts only (Layer 10) |

---

## 2. What data we hold

### 2.1 Inventory

| Data | Where it lives | Personal? | Who can read it | Kept until |
| --- | --- | --- | --- | --- |
| Local documents, versions, images | The browser's IndexedDB | Content | The person using that browser profile | They delete it, or "Clear all data" |
| Preferences, the remembered sign-in (id, name, email) | `localStorage` | Yes (email) | Same | Sign-out removes the sign-in |
| Share links `/s#…` | The URL fragment, wherever people paste it | Content | Anyone with the link | Forever: they can't be revoked. The share dialog says so. |
| Backup files `.inkframe.json` | The user's own disk | Content | Anyone with the file | The user decides |
| Synced documents and versions | Postgres (`documents`, `document_versions`) | Content | The owner (row-level security) | Deleted by the owner, then 30 days in the Trash |
| Cloud images | S3, private bucket; `images` table | Content | The owner, through short-lived links | As above; old object versions 30 days |
| Public links `/p/<id>` | `public_links` table | No | Anyone with the link, until revoked or expired | Revoked or expired |
| Account: name, email, photo URL | Postgres (`user`) | Yes | The owner; the server | Account deletion |
| Password hash | Postgres (`account`) | Yes (secret) | Nobody: one-way hash | Account deletion |
| Google tokens (access, refresh, id) | Postgres (`account`) | Yes (secret) | The server | Not needed by Inkframe: see DS-3.11 |
| Sessions: token, IP address, browser | Postgres (`session`) | Yes | The owner (devices list); the server | Expiry, then removed by a daily job |
| Email verification and reset tokens | Postgres (`verification`) | Yes (secret) | The server | Expiry, then removed by a daily job |
| Security events (planned) | Postgres (`security_events`) | Yes | The owner; the server | 90 days |
| Plan and billing state (planned) | Postgres (`subscriptions`); card data only at the payment provider | Yes | The owner; the server | Account deletion; the provider keeps invoices as tax law requires |
| AI usage counts (planned) | Postgres (`ai_usage`) | Counts only, never prompts | The owner; the server | 13 months |
| Request logs | Render's log store | IP address, path, status, time | The team | Render's log retention (check the plan) |
| Database backups | Neon (point-in-time restore); daily dumps in a separate AWS account | Everything above | The team, only to restore | 7+ days (Neon), 30 days (dumps) |

### 2.2 Rules

1. **Collect less.** A new field or table needs a reason written in its schema comment. If a feature can work without personal data, it does.
2. **Content never goes into logs, errors, analytics, URLs or email.** Ids only.
3. **Every new table that holds user data gets row-level security and a cross-user test in the same pull request** (DS-5.2, DS-5.3).
4. **Every new kind of personal data gets a row in the table above,** with its retention, in the same pull request.

---

## 3. Threats

| Threat | Example | Main defenses |
| --- | --- | --- |
| **Another user** | Guesses or changes an id to read someone else's document or image | Row-level security plus owner filters (DS-4.4, DS-5.2); private bucket and short-lived links (DS-6.x) |
| **A malicious document or link** | A shared document with a script, a tracking pixel or CSS that leaks data | Sanitizing and fixed-list values (DS-1.3–1.7); CSP (DS-1.13) |
| **A malicious website** | A page that sends requests with the user's cookie (CSRF), or frames the app (clickjacking) | `SameSite` cookies, CORS, same-origin writes (DS-2.4, DS-2.5); frame protection (DS-2.2) |
| **Account takeover** | Password reuse, phishing, a stolen session cookie | Hashing, breached-password check, rate limits, two-step sign-in, devices list (DS-3.x) |
| **A shared or stolen device** | Signing in at a library computer; a lost laptop | Sign-out choice to remove synced documents (DS-1.11); session revoke (DS-3.6) |
| **Bugs that lose data** | A sync bug overwrites the newer copy; a migration drops a column; the browser clears storage | Device copy primary, conflict copies, safety valves (DS-7.x); expand-then-contract migrations (DS-5.7); backups (DS-8.x); storage persistence and reminders (DS-1.9) |
| **Our own mistakes and access** | A leaked key, a debug query on production, a production copy on a laptop | Separate secrets per environment, 2FA, production access rules, no production copies (DS-9.x, DS-5.5, DS-5.6) |
| **Supply chain** | A compromised npm package or GitHub Action | Lockfiles, Dependabot, audit, pinned Actions, provenance (DS-9.8–9.12) |
| **A provider problem** | Neon or AWS account lost, a region outage | Logical backups in a separate account (DS-8.2); the device copy (DS-8.7) |
| **Abuse and cost** | Bot sign-ups, storage filled with junk, AI quota drained | Rate limits, quotas, verification (DS-3.9, DS-4.5) |
| **Legal requests** | A demand for a user's data | Legal-request policy (DS-11.10) |

---

## 4. Layer 1: device and browser

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-1.1 | **Local-first storage.** Documents and images live in IndexedDB; nothing is uploaded unless a signed-in user syncs that document. | ✅ | — | Product Plan D3, D11 |
| DS-1.2 | **Share links in the URL fragment** (`/s#…`), which browsers never send to a server | ✅ | — | D4 |
| DS-1.3 | **Pasted and imported HTML** goes through DOMPurify, then ProseMirror's schema, which keeps only known nodes and marks | ✅ | — | |
| DS-1.4 | **Shared documents** are rendered through the schema serializer, then DOMPurify; no raw HTML from a payload is trusted | ✅ | — | |
| DS-1.5 | **Style values** never come straight from a document: colors and lengths pass `sanitizeCssColor` / `sanitizeCssLength`; page setup (layout, paper, orientation, font) is checked against fixed lists and margins are clamped; page color is a palette name; indent is 1–8, line spacing one of four values, font size 6–120 px, fonts by name from `FONT_FAMILIES`; from HTML only Inkframe's own data attributes are read | ✅ | — | Stops CSS injection and tracking pixels through attributes |
| DS-1.6 | **Links:** `sanitizeHref` allow-list (no `javascript:`); `rel="noopener noreferrer nofollow"` | ✅ | — | |
| DS-1.7 | **External images** in documents: the editor, toolbar preview, lightbox and avatar load them with `referrerpolicy="no-referrer"` ✅. The reader and HTML export render through the schema's `toDOM`, which doesn't set it 🟡: fixed for the whole app by a `Referrer-Policy: no-referrer` header and `<meta name="referrer">` (DS-2.2). Later: in **shared** documents, external images load only after "Show images", as in email apps, so a link can't reveal its reader's IP address to an image host ⬜. | 🟡 | Stage 0 (policy); Open Beta (Show images) | |
| DS-1.8 | **No third-party requests:** fonts and icons are self-hosted; CI fails on third-party URLs in the build | ✅ | — | `scripts/check-no-third-party.mjs` |
| DS-1.9 | **Against browser data loss:** `navigator.storage.persist()`; storage-full and blocked banners with "Export backup"; edits refused by storage are kept for the backup; a backup reminder 14 days after the last backup; backup and restore (merge never overwrites) | ✅ | — | `StorageHealth`, `BackupService` |
| DS-1.10 | **Password-protected backups** (optional): AES-GCM with a key from PBKDF2-SHA-256 (600,000 iterations or more), all in Web Crypto; the header says it is encrypted; a lost password can't be recovered, and the dialog says so | ⬜ | 1.1 | Backups hold everything, often in Downloads folders and cloud drives |
| DS-1.11 | **Signing out on a shared computer:** "Remove synced documents from this device" removes synced documents, their versions and cached images; "On this device only" documents are never removed silently | ⬜ | Alpha | M6.1 |
| DS-1.12 | **The remembered sign-in** in `localStorage` holds id, name and email only, never a password or token; people who never signed in on a device send nothing to the server | ✅ | — | `features/account` |
| DS-1.13 | **Content Security Policy:** scripts only from the app's origin, with hashes for Angular's inline scripts (`security.autoCsp` in `angular.json`, check it works with SSR and the service worker); `connect-src` the API only; `img-src 'self' data: blob: https:` (documents may show external images); `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'` as a header | ⬜ | Stage 0 | Limits the damage of any XSS bug |
| DS-1.14 | **"Clear all data"** deletes the IndexedDB database, version history included | ✅ | — | |
| DS-1.15 | **Versioned document format:** `{ schemaVersion, doc }`, loaded through `migrate()`; every change has a migration and a fixture test; older apps refuse newer documents instead of dropping content | ✅ | — | Product Plan 6.2 rule 5 |

---

## 5. Layer 2: network

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-2.1 | **HTTPS everywhere** (Render's certificates). HSTS: the API has helmet's default ✅; the app server sends none ⬜. Target: `max-age=31536000; includeSubDomains` on both, `preload` after GA once every subdomain is HTTPS | 🟡 | Stage 0 | |
| DS-2.2 | **App server security headers** (`inkframe-app/src/server.ts` sends none today): CSP (DS-1.13), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `frame-ancestors 'none'` (and `X-Frame-Options: DENY`), `Permissions-Policy` turning off camera, microphone and location, `Cross-Origin-Opener-Policy: same-origin` | ⬜ | Stage 0 | helmet, as the API does |
| DS-2.3 | **Allowed hosts** for the SSR server (`security.allowedHosts` is `[]`, blocker B6) | ⬜ | Stage 0 | |
| DS-2.4 | **CORS allow-list** with credentials; `/v1` writes from any other `Origin` refused (403); Better Auth checks origins on its own routes, forced on in every environment | ✅ | — | `same-origin.middleware.ts` |
| DS-2.5 | **Session cookie:** HTTP-only, `Secure`, `SameSite=Lax`; `__Secure-` prefix in production. Check the real cookie on staging. | 🟡 | Stage 0 | The app and API are the same site (`inkframe.app`, `api.inkframe.app`) |
| DS-2.6 | **Database connections use TLS with certificate checks** (`sslmode=verify-full` in `DATABASE_URL` and `MIGRATION_DATABASE_URL`) | ⬜ | Stage 0 | Neon requires TLS; verifying the certificate stops a man in the middle |
| DS-2.7 | Edge protection (a CDN or firewall in front of Render) | ⬜ | After GA, if needed | It would see all traffic: it becomes a subprocessor (DS-11.2) |

---

## 6. Layer 3: accounts and sessions

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-3.1 | **Passwords hashed** by Better Auth (scrypt); never logged | ✅ | — | |
| DS-3.2 | **Password rules:** 10 to 128 characters; refuse passwords seen in breaches through Have I Been Pwned's range API (only the first 5 characters of the password's SHA-1 hash leave the server; Better Auth plugin), at sign-up and password change (D31) | ⬜ | Alpha | Server-side only, so the app still makes no third-party requests |
| DS-3.3 | **Email verification** before sync turns on (an email provider, D32) | ⬜ | Alpha | |
| DS-3.4 | **Password reset** that never reveals whether an email has an account; reset links expire within an hour; a reset signs out every device | ⬜ | Alpha | |
| DS-3.5 | **Changing the password signs out other devices** | ⬜ | Alpha | |
| DS-3.6 | **Signed-in devices** in Settings → Security: browser, approximate place, last active; sign out one or all | ⬜ | Closed Beta | Better Auth `list-sessions`, `revoke-*` (built, no screen) |
| DS-3.7 | **Asking again before sensitive actions:** deleting the account, changing the email, turning off two-step sign-in. Password again, or a sign-in in the last 10 minutes for Google-only accounts. | ⬜ | Alpha | Better Auth `verify-password`, fresh sessions |
| DS-3.8 | **Sign-in limits:** Better Auth's own limits ✅; a growing delay per account after failed attempts ⬜ | 🟡 | Closed Beta | Delay, never a lockout that someone else could trigger |
| DS-3.9 | **Bot sign-ups** without a third-party CAPTCHA (D30): sign-ups per IP and per email domain limited; disposable-email domains refused; verification before sync; invite codes until Open Beta | ⬜ | Closed Beta | A CAPTCHA would load third-party code and break P1 |
| DS-3.10 | **Two-step sign-in**, optional: an authenticator app (TOTP) with backup codes; passkeys later | ⬜ | Closed Beta | Better Auth `twoFactor` plugin |
| DS-3.11 | **Google sign-in:** state and PKCE, account picker, linking a Google account to a password account only when the email is verified ✅. Inkframe never calls Google's APIs, yet Better Auth stores Google's access, refresh and id tokens in `account`: encrypt them (Better Auth's token encryption option; check it exists in the installed version) or clear them after sign-in ⬜. Separate OAuth clients for development, staging and production ⬜. | 🟡 | Alpha | |
| DS-3.12 | **Sessions:** checked in the database on every request (no cookie cache), so sign-out works at once ✅. Set the lifetime explicitly (proposal: 30 days, renewed daily while used) ⬜ | 🟡 | Alpha | |
| DS-3.13 | **Security emails:** password changed, email changed, two-step sign-in changed, new device signed in | ⬜ | Open Beta | Never include document titles |

---

## 7. Layer 4: API server

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-4.1 | **Every input checked** by a Zod DTO before the controller runs; anything else gets 400 | ✅ | — | `validate(dto)` |
| DS-4.2 | **Size limits:** 2 MB request bodies ✅. Documents: a size limit, a known schema version and a JSON depth limit ⬜ | 🟡 | Alpha | M6.2 |
| DS-4.3 | **Every `/v1` route checks the session** | ✅ | — | `authenticate(auth)` |
| DS-4.4 | **Two layers of access control:** queries filter by owner, and every query on user data runs in `asUser()`, so row-level security applies even if a filter is forgotten | ✅ | — | Tables so far; every new module follows it |
| DS-4.5 | **Limits:** 600 requests per IP per 15 minutes ✅; per-user rate limits ⬜ (Alpha); storage and count quotas by plan ⬜ (Closed Beta); Render, AWS and Neon budget alerts ⬜ (Closed Beta) | 🟡 | Alpha, Closed Beta | |
| DS-4.6 | **Errors reveal nothing:** unexpected errors reach the client as a plain 500; the log keeps their name and message, never request bodies | ✅ | — | `error.middleware.ts` |
| DS-4.7 | **Logs hold no content:** method, path, status, time. Never cookies, emails, titles or text. | ✅ | — | Paths hold random ids only; keep it that way |
| DS-4.8 | **The server never renders document HTML** | ✅ | — | Rule; stored documents are JSON |
| DS-4.9 | **Feature flags enforced by the server:** a route of a feature that is off answers 404, whatever the app shows | ⬜ | Stage 0 | Release Plan, 9 |
| DS-4.10 | **Payment webhooks:** raw body, signature checked, each event once (`billing_events`), safe out of order; no card data ever reaches Inkframe | ⬜ | Closed Beta (test mode), Gamma (live) | Server Plan, 4 |
| DS-4.11 | **Public links:** ids with 128 bits of randomness or more; a strict rate limit; `X-Robots-Tag: noindex`; revoking works at once; never lists other documents | ⬜ | Closed Beta | M6.3 |
| DS-4.12 | **Refuse unsafe configuration in production:** the server already refuses an `http://` `BETTER_AUTH_URL`; it must also refuse the example `BETTER_AUTH_SECRET` from `.env.example` and `localhost` origins | ⬜ | Stage 0 | `src/common/config/env.ts` |

---

## 8. Layer 5: database

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-5.1 | **Two roles:** `inkframe_owner` owns tables and runs migrations; `inkframe_app` (what the server uses) owns nothing and has `NOBYPASSRLS` | ✅ | — | `docker/initdb/01-roles.sh` |
| DS-5.2 | **Row-level security on every table with user data** ✅ (`documents`, `document_versions`). A CI check that fails when a table in `public` has no RLS or no policy, except Better Auth's tables on an explicit list ⬜ | 🟡 | Alpha | A query on `pg_class.relrowsecurity` in the test suite |
| DS-5.3 | **Cross-user tests** for every table and route: two users, neither can read, change, delete or create the other's rows | ✅ | Each release | `test/rls.test.ts`; extend with each module |
| DS-5.4 | **Encryption at rest** by Neon; TLS in transit (DS-2.6) | ⬜ | Closed Beta | On by default once provisioned; confirm in the console |
| DS-5.5 | **No production data outside production.** Staging is a separate Neon project with made-up data (D29), never a branch of production, because a branch copies every row. Restore drills use a temporary branch inside the production project, deleted after. No production dumps on laptops. | ⬜ | Stage 0 | Changes the earlier plan "make a staging branch" |
| DS-5.6 | **Production access:** only through the Neon console with two-step sign-in; no standing personal database passwords; the team reads a user's content only when that user asks for help in writing, and logs it (DS-10.3) | ⬜ | Stage 0 | Write it into the runbook and the privacy policy |
| DS-5.7 | **Migrations that keep data:** SQL read before merge; expand, then contract in a later release; never drop or rename alongside the code change; note a restore point before any destructive migration | 🟡 | Alpha | Release Plan, 8.2 |
| DS-5.8 | **Jobs run as the owner role** (they must see every user's rows): small, reviewed, logging counts only | ⬜ | Closed Beta | Server Plan, 5 |

---

## 9. Layer 6: image storage

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-6.1 | **Private bucket** with S3 Block Public Access on the account and the bucket; one bucket per environment | ⬜ | Alpha | |
| DS-6.2 | **Encryption at rest** (SSE-S3; SSE-KMS if per-key audit is wanted later) | ⬜ | Alpha | |
| DS-6.3 | **Bucket policy refuses non-TLS requests** (`aws:SecureTransport`) | ⬜ | Alpha | |
| DS-6.4 | **The server's key reaches only its bucket** (get, put and delete on that bucket); no root keys anywhere | ⬜ | Alpha | |
| DS-6.5 | **Presigned uploads** that expire in minutes, limited to the declared type and size (presigned POST with conditions); plan quota checked first | ⬜ | Alpha | |
| DS-6.6 | **Checked on completion:** the object's real size and its first bytes must match an allowed type (PNG, JPEG, GIF, WebP). **No SVG:** it can carry scripts. | ⬜ | Alpha | |
| DS-6.7 | **Downloads** through presigned links of a few minutes, issued only to the owner (members from M6.5), served with the stored image type and `nosniff` | ⬜ | Alpha | |
| DS-6.8 | **Object keys hold no personal data:** `<owner id>/<random image id>` | ⬜ | Alpha | |
| DS-6.9 | **Versioning** on, with a lifecycle rule that deletes old versions after 30 days, so a deletion becomes final at a known time | ⬜ | Closed Beta | |
| DS-6.10 | **Orphan cleanup:** a daily job deletes objects with no `images` row and uploads never completed | ⬜ | Closed Beta | Server Plan, 5 |

---

## 10. Layer 7: sync that never loses data

Attackers are one risk; sync bugs are the more likely one. These controls make the worst sync bug cost a conflict copy, not a document.

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-7.1 | **The device copy is primary:** edits go to IndexedDB first, then to the sync queue | ⬜ | Alpha | `DocumentStore` seam ✅ |
| DS-7.2 | **Never overwrite silently:** each save carries the version it was based on; the server refuses a stale save (409); the losing edit becomes a conflict copy (D13) | ⬜ | Alpha | |
| DS-7.3 | **Offline queue** in IndexedDB, replayed in order after reconnecting; each change carries an id made on the device, so replaying it twice changes nothing | ⬜ | Alpha | |
| DS-7.4 | **Deletes are tombstones; Trash for 30 days** on the server, restorable from any device | ⬜ | Alpha | |
| DS-7.5 | **A deletion arriving by sync goes to the device's own Trash** (30 days), never straight to a permanent delete | ⬜ | Alpha | A bad deploy or a stolen account can't wipe every device at once |
| DS-7.6 | **A brake on mass changes:** when one sync would delete or replace more than 10 documents or a quarter of the library, it pauses and asks | ⬜ | Alpha | As some file-sync apps do |
| DS-7.7 | **Sync test suite** in CI: two and three devices; offline; a flaky network; clock skew; deletes against edits; randomized sequences checked against a simple model (no edit ever lost) | ⬜ | Alpha | |
| DS-7.8 | **Recovery after a server restore:** each restore raises a `sync_epoch`; a device that sees a new epoch uploads its newer copies instead of accepting the older server state | ⬜ | Alpha | Without it, a database restore would roll devices back too |
| DS-7.9 | **Version history syncs,** kept on the server by plan (Free: 10 per document; Pro: 1 year) | ⬜ | Closed Beta | |
| DS-7.10 | **Schema version gates** on both sides: the app refuses newer documents ✅; the server refuses unknown schema versions ⬜ | 🟡 | Alpha | |

---

## 11. Layers 8–11: backups, secrets, operations, privacy

### 11.1 Layer 8: backups and disaster recovery

**Targets:** lose at most **5 minutes** of synced changes (RPO) and restore the cloud within **4 hours** (RTO). Because the device copy is primary, an outage stops sync, not writing, and devices fill in what the server lost.

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-8.1 | **Neon point-in-time restore**, 7 days or more (a paid plan; 14 is better) | ⬜ | Closed Beta | |
| DS-8.2 | **Daily logical backup:** `pg_dump` encrypted, to a bucket in a **separate AWS account**, kept 30 days | ⬜ | Closed Beta | Covers a lost Neon account or a deleted project |
| DS-8.3 | **Image versions** kept 30 days (DS-6.9) | ⬜ | Closed Beta | |
| DS-8.4 | **Restore drills:** staging before Closed Beta; production (temporary branch) before Open Beta and GA; then every quarter. Each drill is timed against the RTO and written up. | ⬜ | Alpha onward | |
| DS-8.5 | **Restoring one user's document** on request, from point-in-time restore, without touching anyone else's data | ⬜ | Gamma | Runbook |
| DS-8.6 | **Runbooks:** restore the database, restore one user's data, roll back a release, sync kill switch | ⬜ | Gamma | |
| DS-8.7 | **Last line of defense:** the copies on devices, and the user's own backups (DS-1.9) | ✅ | — | |

### 11.2 Layer 9: secrets, access and supply chain

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-9.1 | **Secrets only in Render's environment and a password manager;** `.env` is git-ignored and untracked in `inkframe-server` | ✅ | — | Checked 2026-10-23 |
| DS-9.2 | **No secret or server SDK in the browser bundle:** a CI check on the built app | ⬜ | Alpha | |
| DS-9.3 | **Separate credentials for each environment:** database passwords, `BETTER_AUTH_SECRET`, S3 keys, OAuth clients, email and payment keys | ⬜ | Stage 0 | |
| DS-9.4 | **No loose secret files:** the Google OAuth client file in `G:\inkframe\other\` goes into the password manager and off the disk | ⬜ | Now | [Gap G4](#12-gaps-found-in-the-code-2026-10-23) |
| DS-9.5 | **Two-step sign-in on every provider account:** GitHub, npm, Render, Neon, AWS (root account locked away, no root keys), Google Cloud, the domain registrar and DNS, the email and payment providers. Recovery codes kept offline. | ⬜ | Stage 0 | Most breaches of small SaaS start here |
| DS-9.6 | **Rotation:** at once after any leak; a runbook for each secret. Rotating `BETTER_AUTH_SECRET` signs everyone out, so it happens only when needed. | ⬜ | Gamma | |
| DS-9.7 | **Branch protection:** CI required, no direct pushes, no force pushes, on one default branch per repository | ⬜ | Stage 0 | `inkframe-app` has both `main` and `master` |
| DS-9.8 | **Dependencies:** lockfiles and `npm ci` ✅; Dependabot for npm and GitHub Actions ⬜; `npm audit --audit-level=high` in CI ⬜ | 🟡 | Stage 0 | |
| DS-9.9 | **Secret scanning** in CI (gitleaks), plus GitHub push protection where available | ⬜ | Stage 0 | |
| DS-9.10 | **Code scanning:** CodeQL if the repository is public (free), otherwise Semgrep in CI | ⬜ | Stage 0 | |
| DS-9.11 | **GitHub Actions pinned to commit SHAs;** workflow permissions `contents: read` ✅ | 🟡 | Stage 0 | |
| DS-9.12 | **The library is published from CI** with npm provenance, from a protected tag, with 2FA on the npm account | ⬜ | Closed Beta | |

### 11.3 Layer 10: monitoring, audit and incidents

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-10.1 | **Health and alerts:** `/health` ✅; `/ready` (checks the database), uptime checks, alerts on 5xx rates and failed jobs that reach a phone ⬜ | 🟡 | Stage 0 (staging), Closed Beta (production) | |
| DS-10.2 | **Security events:** sign-ins, failed-sign-in bursts, password and email changes, two-step changes, session revokes, exports, account deletion. A `security_events` table (user, event, time, IP, browser; never content), 90 days. Users see their own in Settings → Security. | ⬜ | Closed Beta | |
| DS-10.3 | **Production access log:** every time someone on the team opens production data, what and why | ⬜ | Closed Beta | A short shared document is enough at first |
| DS-10.4 | **Error reports without content:** server errors in logs (DS-4.6); in the app, only a report the user chooses to send, shown in full first | ⬜ | Alpha | Release Plan, 10 |
| DS-10.5 | **Incident response:** severity levels (data loss or exposure is always Sev-1); contain, assess, notify, fix, review. **Breach notice:** under India's DPDP rules, tell the Data Protection Board and affected users without delay, with a full report to the Board within 72 hours; under GDPR (users in the EU), the supervisory authority within 72 hours. Confirm both with counsel. | ⬜ | Gamma | Drills in Gamma |
| DS-10.6 | **Status page** | ⬜ | Open Beta | |
| DS-10.7 | **`/.well-known/security.txt`** and a security contact; a short policy for people who report vulnerabilities | ⬜ | Open Beta | |
| DS-10.8 | **Security review:** a self-review before Alpha (headers, CI, secrets) and Closed Beta (sync, storage, RLS); an external review in Open Beta; again before the AI endpoint (M6.4) and collaboration (M6.5) go to Labs | ⬜ | Open Beta | Release Plan, 4.4 |

### 11.4 Layer 11: privacy, retention and law

Inkframe is built in India, hosts in Singapore (D22) and will have users elsewhere. **India's DPDP Act** applies to accounts, and **GDPR** to users in the EU. Everything here needs a lawyer's review before Closed Beta.

| Id | Control | Status | Needed by | Notes |
| --- | --- | --- | --- | --- |
| DS-11.1 | **Privacy policy and terms,** linked from sign-up; written for people, matching section 1's promises | ⬜ | Closed Beta | Testers get short tester terms in Alpha |
| DS-11.2 | **Subprocessors listed, with signed data processing terms:** Render, Neon, AWS, the email provider, the payment provider; the AI provider later | ⬜ | Closed Beta | |
| DS-11.3 | **Export my data:** every document, version and image list the server holds, plus profile and security events, in one file | ⬜ | Alpha | `GET /v1/me/export` |
| DS-11.4 | **Delete my account:** after asking again (DS-3.7): cancel the subscription, delete images in S3, then every row (`ON DELETE CASCADE` from `user`); gone from point-in-time backups within their window and from dumps within 30 days. The policy says so. | ⬜ | Alpha | Tested: no row or object left |
| DS-11.5 | **Retention by schedule:** each row of the inventory (2.1) enforced by a job or a lifecycle rule | ⬜ | Closed Beta | Server Plan, 5 |
| DS-11.6 | **Children:** DPDP treats anyone under 18 as a child, and processing a child's data needs verifiable consent from a parent. Proposal: accounts are for people 18 or older (or with a parent's consent); the editor without an account stays open to everyone, since it processes no personal data on a server. | ⬜ | Closed Beta | Students are a target segment: get legal advice |
| DS-11.7 | **A contact for privacy requests and complaints,** with a stated response time | ⬜ | Closed Beta | DPDP requires one |
| DS-11.8 | **Cookies:** only the session cookie, which is strictly necessary; no consent banner needed for it (confirm with counsel) | ✅ | — | By design; no analytics (D9) |
| DS-11.9 | **Claims match reality:** never "end-to-end encrypted" or "we can't read your documents" (D21); "no server, no account" only where it is true (Product Plan, 2.5 and 2.6) | ✅ | Each release | Audited in Gamma |
| DS-11.10 | **Legal requests:** data only for a valid legal demand; tell the user unless the law forbids it; publish the count yearly | ⬜ | GA | |
| DS-11.11 | **Where data lives:** one region (D22) for Render, Neon and S3, stated in the privacy policy; EU transfers covered by the providers' standard contractual clauses | ⬜ | Stage 0 (decide), Closed Beta (publish) | The Neon region can't be moved later |

---

## 12. Gaps found in the code (2026-10-23)

A read-through of both repositories while writing this plan. Each gap maps to a control above.

| # | Gap | Where | Fix | Control | Stage |
| --- | --- | --- | --- | --- | --- |
| G1 | The app's SSR server sends no security headers: no CSP, HSTS, `Referrer-Policy` or frame protection | `inkframe-app/src/server.ts` | helmet with the policy in DS-1.13 and DS-2.2 | DS-1.13, DS-2.1, DS-2.2 | Stage 0 |
| G2 | `security.allowedHosts` is empty, so the production server would refuse every host (blocker B6) | `inkframe-app/angular.json` | Set the production and staging hosts | DS-2.3 | Stage 0 |
| G3 | `.env.example` holds a real-looking `BETTER_AUTH_SECRET`, and production would accept it if copied | `inkframe-server/.env.example`, `src/common/config/env.ts` | Replace the value with a placeholder; refuse it when `NODE_ENV=production` | DS-4.12 | Stage 0 |
| G4 | The Google OAuth client secret sits as a plain JSON file in a folder outside both repositories, next to a real backup of documents. The development `.env` uses the same Google client. | `G:\inkframe\other\` | Move the secret into a password manager and delete the file; create separate OAuth clients for development, staging and production. If the folder was ever synced or shared, rotate the secret. | DS-9.3, DS-9.4 | Now |
| G5 | Neither repository runs dependency audits, secret scanning or code scanning; Actions are pinned by tag | `.github/workflows/ci.yml` in both | Dependabot, `npm audit`, gitleaks, CodeQL or Semgrep, SHA pins | DS-9.8–9.11 | Stage 0 |
| G6 | `inkframe-app` has two default-looking branches (`main` and `master`); its CI runs on `master`, the server's on `main`. Making CI required is still a manual step from M0. | Both repositories | One default branch in each; branch protection with CI required | DS-9.7 | Stage 0 |
| G7 | Better Auth keeps Google's access, refresh and id tokens in the `account` table; Inkframe never uses them | `inkframe-server/src/modules/auth/auth.schema.ts` | Encrypt them or clear them after sign-in | DS-3.11 | Alpha |
| G8 | No email provider: emails aren't verified and passwords can't be reset | `better-auth.ts` | Email provider (D32); verification before sync; reset | DS-3.3, DS-3.4 | Alpha |
| G9 | The reader and HTML export render images without `referrerpolicy` | `projects/inkframe-editor/core/extensions/image/image-schema.ts` (`toDOM`) | A site-wide `Referrer-Policy: no-referrer`; "Show images" for shared documents later | DS-1.7 | Stage 0 |
| G10 | The plan said to make staging a branch of the production Neon project, which would copy every user's data into staging | Product Plan M6, Server Plan 6, server README | A separate staging project with made-up data (D29); updated in all three on 2026-10-23 | DS-5.5 | Stage 0 |
| G11 | Nothing stops a new table from shipping without row-level security | `inkframe-server/test` | A CI test over `pg_class.relrowsecurity` | DS-5.2 | Alpha |
| G12 | Backup files are plain JSON with every document and image | `features/documents/transfer/backup.ts` | Optional password protection | DS-1.10 | 1.1 |

---

## 13. Work by stage

What each gate in the [Release Plan](Release_Plan.md#4-stage-details-and-gates) requires from this plan. A stage can't start until the controls of the stages before it are ✅.

| Stage | Controls |
| --- | --- |
| **Now** | DS-9.4 (G4) |
| **Stage 0** | DS-1.7 (header), DS-1.13, DS-2.1, DS-2.2, DS-2.3, DS-2.5, DS-2.6, DS-4.9, DS-4.12, DS-5.5, DS-5.6, DS-9.3, DS-9.5, DS-9.7–9.11, DS-10.1 (staging), DS-11.11 (decide) |
| **Alpha** | DS-1.11, DS-3.2, DS-3.3, DS-3.4, DS-3.5, DS-3.7, DS-3.11, DS-3.12, DS-4.2, DS-4.5 (per user), DS-5.2 (CI check), DS-5.7, DS-6.1–6.8, DS-7.1–7.8, DS-7.10, DS-8.4 (staging drill), DS-9.2, DS-10.4, DS-11.3, DS-11.4 |
| **Closed Beta** | DS-3.6, DS-3.8, DS-3.9, DS-3.10, DS-4.5 (quotas, budgets), DS-4.10 (test mode), DS-4.11, DS-5.4, DS-5.8, DS-6.9, DS-6.10, DS-7.9, DS-8.1, DS-8.2, DS-8.3, DS-9.12, DS-10.1 (production), DS-10.2, DS-10.3, DS-11.1, DS-11.2, DS-11.5, DS-11.6, DS-11.7, DS-11.11 (publish) |
| **Open Beta** | DS-1.7 (Show images), DS-3.13, DS-8.4 (production drill), DS-10.6, DS-10.7, DS-10.8 (external review) |
| **Gamma** | DS-4.10 (live), DS-8.5, DS-8.6, DS-9.6, DS-10.5, DS-11.9 (audit); every critical and high review finding fixed |
| **GA** | DS-11.10 |
| **1.1** | DS-1.10 |
