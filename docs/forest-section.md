# Forest Section — Technical Description

## Overview

The Forest section embeds a [Forester](https://www.jonmsterling.com/jms-005P.xml) knowledge-forest site inside the workbench via an iframe. It is entirely read-only — no API routes, no database, no backend logic. The forester output is pre-built static XML/XSL content served through a symlink.

## Architecture

```
User clicks "Forest" in nav
  → Next.js serves src/app/forest/page.tsx at /forest
  → Page renders an <iframe src="/forest/index/index.xml">
  → Next.js serves the XML from public/forest/ (symlink)
  → Browser applies XSL stylesheet to render the page
  → User navigates within iframe; breadcrumb updates via load event
```

## Key Files

| File | Purpose |
|------|---------|
| `workbench/src/app/forest/page.tsx` | Forest page — iframe wrapper with breadcrumb |
| `workbench/next.config.mjs` | Fallback rewrites for tree page URLs |
| `workbench/public/forest/` | Symlink → `forester-repo/output/forest/` |

No API routes. No lib utilities. No components beyond the page itself.

## Symlink Setup

```
workbench/public/forest/ → /Users/ccnas/DEVELOPMENT/forester-repo/output/forest/
```

The forester repo is at `/Users/ccnas/DEVELOPMENT/forester-repo/`. The `output/forest/` subdirectory contains ~785 tree directories, each with `index.html` (redirect stub) and `index.xml` (actual content). Shared assets (XSL, CSS, JS, fonts) live in the parent `output/` directory but are referenced via `/forest/` base URL by the XML files.

**Important:** The symlink targets `output/forest/`, NOT `output/`. This was a past mistake (see REFLECTION.md). Forester 5.0 outputs tree pages into `output/forest/` and the XML `base-url="/forest/"` expects this structure.

## Page Component (`forest/page.tsx`)

Client component. Structure:

1. **Breadcrumb bar** — thin top bar showing `Forest / {currentPath}`, updated on each iframe navigation
2. **Iframe** — fills remaining height (`flex-1`), loads `/forest/index/index.xml`

The `useEffect` listens to the iframe's `load` event and reads `iframe.contentWindow.location.pathname` to update the breadcrumb. This works because the iframe content is same-origin (served by the same Next.js dev server).

The page does NOT use the shared `PageContainer` component — it has its own full-height layout with white background to match the forester theme.

## Next.js Rewrites (`next.config.mjs`)

Two `fallback` rewrites handle directory-style URLs:

```js
{ source: '/forest/:tree/', destination: '/forest/:tree/index.xml' }
{ source: '/forest/:tree',  destination: '/forest/:tree/index.xml' }
```

These are needed because Next.js doesn't auto-serve `index.xml` as a directory index (it only does this for `index.html`). Both trailing-slash and no-trailing-slash variants are covered.

These are `fallback` rewrites, so the `/forest` app route (the iframe page) takes priority at the exact `/forest` path.

## Forester Content Structure

Each tree directory (e.g., `001-index/`, `004-Grothendieck-Topos/`) contains:
- `index.html` — redirect: `<meta http-equiv="refresh" content="0;url=/forest/{tree-id}/index.xml">`
- `index.xml` — actual content with `<?xml-stylesheet type="text/xsl" href="/forest/default.xsl"?>`

The XSL stylesheet (`default.xsl`) transforms XML into rendered HTML in the browser. Supporting assets: `style.css`, `forester.js`, `katex.min.css` (for math rendering).

## Forester Toolchain (for rebuilding)

The forester CLI requires opam:
```bash
eval $(opam env)
forester build    # rebuilds output/ from trees/
```

`watchexec` can auto-rebuild on tree file changes. The theme is a git submodule (HTTPS URL, overridden from SSH).

## Common Pitfalls

- **Symlink target**: Must be `output/forest/`, not `output/`. The XML base URL expects `/forest/` prefix.
- **External links**: Forester's XSL was patched to add `target="_blank"` to external links so they open in a new browser window instead of inside the iframe.
- **Font loading**: The forester theme needs Inria Sans, Source Han Sans/Serif, and KaTeX fonts. These are loaded via the theme's CSS.
