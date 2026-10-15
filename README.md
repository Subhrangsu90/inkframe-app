# Inkframe

Inkframe is a private WYSIWYG document editor that runs entirely in the browser. There is no account, no server and no tracking: documents and images stay in the browser's IndexedDB, and share links carry the whole document in the URL fragment, which browsers never send to a server.

This repository holds two products:

- **The Inkframe app** (`src/`): an Angular app with server-side rendering for the landing page, and an installable PWA that works offline.
- **The editor library**, [`@inkframe-ui/editor`](projects/inkframe-editor/README.md) (`projects/inkframe-editor/`): the ProseMirror-based editor the app uses, packaged for other Angular apps.

The product plan, with the roadmap and architecture, is in [docs/Inkframe_Product_Plan.md](docs/Inkframe_Product_Plan.md).

## Requirements

- Node.js 24 (the version CI uses)
- npm 11

## Getting started

```bash
npm ci
npm start
```

Then open <http://localhost:4200>. The app imports the library from source, so library changes reload in the app without a separate build.

## Repository layout

```text
src/                     The Inkframe app
  app/core/              App-wide services (PWA install and updates)
  app/layout/            App shell: sidebar, header, storage banner
  app/shared/ui/         Reusable UI components: buttons, dialogs, toasts, icons
  app/features/          Product areas, each loaded by the router
    documents/           The docs list, editor and reader (documents.routes.ts)
      data-access/       Saving and loading documents, storage health, the welcome document
      versions/          Version history
      transfer/          Backup and restore, import, export, share links
      pages/             Routed pages: docs list, editor, reader
    landing/             Landing page
    settings/            Settings page
    not-found/           404 page
  styles/                Global styles and design tokens
  server.ts              Express server for SSR
projects/inkframe-editor/
  src/                   @inkframe-ui/editor: the <ink-editor> component and the styles
  core/                  @inkframe-ui/editor/core
    editor/              EditorService and the extension system
    extensions/          Editor features, one folder each (lists, table, code-block…)
    schema/              Document schema and migrations
    io/                  Markdown and HTML import and export
    storage/             Image storage in IndexedDB
    ui-helpers/          Theme, on-screen keyboard, menu and color helpers
    legacy/              Deprecated APIs, removed in 2.0
  toolbar/               @inkframe-ui/editor/toolbar
  ui/                    @inkframe-ui/editor/ui: menus and panels
public/                  Static files: icons, web app manifest
scripts/                 Build and CI helper scripts
docs/                    Product plan
```

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Development server at <http://localhost:4200> |
| `npm test` | Unit tests (Vitest), library then app |
| `npm run test:lib` / `npm run test:app` | Unit tests for one project |
| `npm run lint` | ESLint |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run build:app:prod` | Production build of the app, into `dist/inkframe-app` |
| `npm run serve:ssr:inkframe-app` | Serves the production build (see below) |
| `npm run build:lib:prod` | Production build of the library, into `dist/inkframe-editor` |
| `npm run pack:lib` | Builds the library and packs it into a `.tgz` |
| `npm run publish:lib:dry` | Builds the library and runs `npm publish --dry-run` |
| `npm run icons:build` | Rebuilds the icon font subset (see below) |

To run one library spec file:

```bash
npx ng test inkframe-editor --watch=false --include="../core/extensions/lists/lists.spec.ts"
```

The path is relative to `projects/inkframe-editor/src`.

## Things to know

**Folders and imports.** Code in `src/app` imports only in these directions, and `npm run lint` fails otherwise:

- `shared/` imports nothing else from the app.
- `core/` imports only `shared/`.
- A feature's logic (`data-access/`, `transfer/`, `versions/`) may import `core/`, `shared/` and other features' logic, but not `layout/` or pages.
- `layout/` and pages may import all of the above and `layout/`.
- Pages and route files are loaded only by the router: `app.routes.ts` and the feature's own `*.routes.ts`. A feature's `*.paths.ts` (link builders such as `docPath(id)`) may be imported from anywhere except `shared/` and `core/`.

Relative imports go up at most one folder (`../`). Farther imports use the `@app/` alias, for example `import { PwaService } from '@app/core/pwa'`, so the lint rules can check them.

**Routes and links.** Link to a document with `docPath(id)` from `documents.paths.ts`, not a hand-written `['/doc', id]`. Fixed links such as `routerLink="/docs"` stay plain strings. A page shown without the app shell (sidebar and header) sets `data: STANDALONE_PAGE` on its route.

**Editor features.** Each feature has a folder in `projects/inkframe-editor/core/extensions/`, with the same files: `<feature>-schema.ts` (node and mark specs), `<feature>-commands.ts` (ProseMirror commands), `<feature>-extension.ts` (the `EditorExtension`), plugins and node views, a spec, and an `index.ts` that exports them. Its styles are mixins in `src/styles/blocks/_<feature>.scss`, which `_editor-content.scss` includes where the rules belong in its order. `EditorService` methods check what the editor allows (editable, the node exists, not inside inline code) and run the feature's command. A new feature is added to `starter-kit.ts`, its specs to `schema/schema.ts`, and its folder to `core/index.ts`.

**Icons.** The app and the library use a self-hosted subset of Material Symbols, with only the icons in use. After adding or renaming an icon, run `npm run icons:build`, which downloads the new subset from Google Fonts and writes it into the repository. CI fails if the subset is out of date. The script finds icon names written as `<mat-icon>name</mat-icon>` or `icon: 'name'`. Add icons chosen at runtime to `DYNAMIC_ICONS` in [scripts/build-icon-font.mjs](scripts/build-icon-font.mjs).

**No third-party resources.** The app promises that nothing leaves the device, so it must not load fonts, scripts or images from other origins. CI checks the production build with [scripts/check-no-third-party.mjs](scripts/check-no-third-party.mjs).

**Serving the production build locally.** Angular SSR rejects requests from hosts it doesn't know, so set `NG_ALLOWED_HOSTS`:

```bash
npm run build:app:prod
NG_ALLOWED_HOSTS=localhost PORT=4000 npm run serve:ssr:inkframe-app
```

**Service worker.** The offline service worker (`ngsw-config.json`) only runs in production builds.

## CI

Every push to `master` and every pull request runs [.github/workflows/ci.yml](.github/workflows/ci.yml): formatting, lint, the icon subset check, unit tests, the library and app production builds, and the third-party resource check.

## License

[MIT](LICENSE)
