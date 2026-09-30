# Submitting Canvas Card Shapes to the community directory

Checklist for the first submission, written from the rules the directory actually
enforces (read from `obsidianmd/obsidian-developer-docs`, `Community directory/`).

## 1. Repository

- Public repo: `jiangbianyan-gif/obsidian-canvas-card-shapes`
- `manifest.json`, `main.js`, `styles.css` at the **root** (those three are what
  Obsidian downloads); everything else is the source of truth.
- Repo name relates to the plugin id (`canvas-card-shapes`).
- The id was checked against the published plugin list for an obvious clash before
  submitting. Ids must be unique across the whole directory; if the submission is
  rejected for a duplicate, the id lives in exactly four files
  (`manifest.json`, `package.json`, `package-lock.json`, the repo name) — a
  two-minute rename.

## 2. Metadata rules

| Rule | Here |
|---|---|
| `id`: lowercase letters/digits/hyphens, no `obsidian`, must not end with `plugin` | `canvas-card-shapes` |
| `name`: Basic Latin only, no emoji, no "Obsidian"/"Plugin" | `Canvas Card Shapes` |
| `description`: ≤ 250 chars, ASCII, ends with a period | checked by `tools/check-manifest.mjs` |
| `version` equals the release tag exactly | `1.0.0` |
| `versions.json` maps version → minimum app version | `{"1.0.0": "1.5.0"}` |
| command IDs must not repeat the plugin id | they are `shape-*` and `doctor` |
| `package.json` / lock versions match the manifest | local gate |
| no Node built-ins, no network, no telemetry, no obfuscation | `main.js` requires only `obsidian`; asserted in `test/shapes.test.js` |
| CSS lint flags the `has` pseudo-class | `styles.css` does not use it, and does not even spell it out in comments (the build script scans raw text) |

Run all of it locally:

```bash
npm run verify
```

`minAppVersion` is `1.5.0` — the plugin only uses `canvas:node-menu`,
`canvas:selection-menu`, `layout-change`, `active-leaf-change`,
`canvas.nodes`, `node.nodeEl`, `node.getData()` and menu APIs, all long standing.

## 3. Canvas internals used (not in the public API docs)

| Used | For | Verified how |
|---|---|---|
| `workspace.on('canvas:node-menu' / 'canvas:selection-menu')` | the right-click menu | same events the sibling *Canvas Node Align* uses |
| `node.nodeEl` | the element the shape class goes on | idem |
| `node.getData().id` | the key in the plugin's data file | idem |
| `canvas.nodes` / `canvas.selection` / `canvas.readonly` | enumerating and skipping read-only boards | idem |
| `workspace.on('layout-change' / 'active-leaf-change')` | re-applying classes after Obsidian rebuilds card DOM | idem |

These are wrapped in small helpers, and every access is guarded, so a future
Obsidian change degrades instead of throwing.

## 4. Release

`.github/workflows/release.yml` verifies, attests and publishes. Run it from
**Actions → Release → Run workflow** with the version field **blank** (blank means
"read `manifest.json`"), or push a tag equal to the version.

- Tag is exactly the version, **no leading `v`**.
- Assets are the committed `main.js`, `manifest.json`, `styles.css` — never
  rebuilt or renamed; `npm run build` asserts exactly that, and the directory
  re-checks it as *Build verification*.
- The release is created by `github-actions[bot]` with a build attestation.

## 5. Scanner expectations

Four groups — **manifest**, **release assets**, **source code**, **build
verification** — each item rated error / warning / recommendation / pass. Only
**errors** block installation.

- *Build verification* looks for the first of `build` / `build:plugin` / `compile`
  in `package.json`, installs dependencies with `npm ci`, then runs it.
  `"build": "node tools/build.mjs"` is idempotent: it validates the payload and
  never rewrites the committed bytes. There are no dependencies, so `npm ci` is
  instant.
- The `has` pseudo-class would be a CSS lint warning; the stylesheet avoids it.

## 6. Submission form

- Repository URL: `https://github.com/jiangbianyan-gif/obsidian-canvas-card-shapes`
- Name / description / author: copy from `manifest.json`.
- License: MIT (`LICENSE` present — a missing or unrecognised license is a warning).
- Desktop only: **no** (`isDesktopOnly: false`).

## 7. After the first release

Every new release is scanned automatically; to force it, use the entry page's
**...** menu → **Check for new releases** / **Request review**. Fixing anything
requires a new version + a new release; pushing code alone does not trigger a
re-scan.
