# Changelog

What changed in each release of Inkframe (the app). The editor library, `@inkframe-ui/editor`, has its own version in `projects/inkframe-editor/package.json`.

Versions follow the [Release Plan, section 7](docs/Release_Plan.md#7-versioning): `0.7.x` in Stage 0, `0.8.0-alpha.N` in Alpha, `0.9.0-beta.N` in Beta, `1.0.0-rc.N` in Gamma, `1.0.0` at launch. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.7.0] - 2026-10-24

Stage 0 (pre-alpha), and the first numbered version: it sums up everything built so far.

### Editor (no account needed)

- A full WYSIWYG editor: bold to strikethrough, colors and highlight, fonts and sizes, line spacing, alignment and indent; headings, lists and task lists, tables, code blocks with highlighting, callouts and images; find and replace; paste cleanup for Word and Google Docs.
- Documents and images stay on the device. Version history, backup and restore, import and export (Markdown, web page, print or PDF), and share links that carry the whole document.
- Page setup: Pages or Pageless, paper sizes and orientation, margins on a ruler, page colors and breaks, zoom, real pages on screen, headers, footers and page numbers.
- Installs as an app and works offline.
- Settings → About shows the version.

### Accounts (staging only)

- Sign up and sign in with email and password, or Google, on staging (`inkframe-app.vercel.app`). Production builds keep accounts off until sync ships.
- While accounts are invite-only, the sign-up page asks for the invite code before both ways of signing up; when sign-up is closed, it says so.
- The app reaches its server through its own address (`vercel.json`), so the session cookie belongs to one site.

### Security

- A Content Security Policy on every page, allowing each page's own inline scripts by hash (`scripts/add-csp.mjs`), and security headers (`vercel.json`).
- Fixes: DOMPurify 3.4.17 and markdown-it 14.3.3. Vite 8.3.5 through an npm override, until Angular's build moves past 8.3.0; remove the override then.
- CI: a dependency audit, secret scanning over the whole history (gitleaks), CodeQL, Dependabot; Actions pinned to commits.
