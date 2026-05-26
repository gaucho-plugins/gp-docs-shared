# gp-docs-shared

Shared contextual menu, Markdown build pipeline, and MCP worker for Gaucho Plugins documentation sites.

## Quick start

```bash
npm install
./scripts/docs-build.sh   # from any docs repo, with ../gp-docs-shared present
# or:
node scripts/build-docs.mjs --repo ../blocked-in-china-docs --site bic
```

Each docs repo needs a `gp-docs.config.json`:

```json
{ "site": "bic" }
```

Site ids: `bic`, `sic`, `cc`, `gb`, `vi`, `spp`, `lscp`.

## Site config schema (`config/sites/{id}.json`)

The build script reads the per-site config and injects header + sidebar HTML
into every `index.html` so the nav lives in **one place per site**.

```jsonc
{
  "id": "bic",
  "hostname": "docs.blockedinchinaplugin.com",
  "origin": "https://docs.blockedinchinaplugin.com",
  "title": "Blocked in China Docs",
  "productName": "Blocked in China",
  "mcpName": "blocked-in-china-docs",
  "template": "assets",
  "assetPath": "assets",           // "" for VI which keeps assets at root
  "navStyle": "absolute",          // OPTIONAL. "absolute" → /path/ hrefs (VI). default: relative
  "skills": [],

  "header": {
    "logoIcon": "favicon.png",     // asset-relative image; OR set null and use logoSvg
    "logoSvg": "<svg .../>",       // OPTIONAL inline SVG (VI uses this)
    "logoAlt": "Blocked in China",
    "logoText": "Blocked in China Docs",
    "links": [
      { "href": "https://...", "label": "Main Site", "hideMobile": true },
      { "href": "https://.../pricing/", "label": "Pricing", "className": "header-buy" },
      { "href": "https://wordpress.org/...", "label": "Download Free", "className": "header-download-btn" },
      { "href": "https://gauchoplugins.com/support/", "label": "Support", "newTab": true }
    ]
  },

  "nav": [
    { "title": "Getting Started", "items": [
      { "label": "Welcome", "href": "" },
      { "label": "Installation", "href": "getting-started/installation/" }
    ]},
    { "title": "PRO Features", "items": [
      { "label": "System Resources", "href": "pro-features-system-resources/", "children": [
        { "label": "CPU Monitoring", "href": "pro-features-system-resources-cpu-monitoring/" }
      ]}
    ]}
  ],

  "sidebarCta": {
    "label": "Get Blocked in China",
    "primary":   { "label": "Download Free", "href": "https://wordpress.org/..." },
    "secondary": { "label": "Support",       "href": "https://gauchoplugins.com/support/", "newTab": true },
    "tertiary":  { "label": "Main Site",     "href": "https://..." }
  }
}
```

The build script:

1. Walks every `index.html` in the repo.
2. For each page, computes the relative path prefix (`./` for homepage, `../../` for deep pages) and the URL path (`/`, `/features/foo/`, …).
3. Generates the header HTML from `site.header` with the right asset prefix.
4. Generates the sidebar HTML from `site.nav`, applying `class="nav-link active"` to the link whose `href` matches the current URL path.
5. Replaces the existing `<header class="site-header">…</header>` and `<aside class="sidebar">…</aside>` blocks with the generated HTML, wrapped in `<!-- gp-docs:header-start -->`…`<!-- gp-docs:header-end -->` markers so subsequent builds re-target the same region precisely.
6. Strips any inline Freemius checkout `<script>` blocks — docs sites must link to the pricing page, not embed checkout.

Output is **byte-equivalent** to the previous hand-edited HTML (modulo intentional drift fixes), so SEO and crawl behavior are unchanged. Build is **idempotent** — running it twice in a row produces no further diff.

## Before committing docs changes

Run the build so `index.md`, `llms.txt`, `mcp-index.json`, HTML injections, and menu assets stay in sync:

```bash
cd ../blocked-in-china-docs && ./scripts/docs-build.sh
```

## MCP worker deploy

1. Create a KV namespace:
   ```bash
   cd mcp-worker && npx wrangler kv namespace create DOCS_INDEX
   ```
2. Put the namespace id in `mcp-worker/wrangler.jsonc`.
3. Deploy:
   ```bash
   npm run worker:deploy
   ```
4. Add GitHub secrets to each docs repo (optional, for KV upload on deploy):
   - `GP_DOCS_KV_NAMESPACE_ID`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`

Upload a search index manually:

```bash
GP_DOCS_KV_NAMESPACE_ID=... CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
  node scripts/upload-kv-index.mjs --repo ../blocked-in-china-docs
```

The worker also falls back to fetching `/mcp-index.json` from each docs origin if KV is empty.

## Per-site MCP URLs

| Plugin | MCP URL |
|--------|---------|
| BIC | https://docs.blockedinchinaplugin.com/mcp |
| SIC | https://docs.speedinchinaplugin.com/mcp |
| CC | https://docs.cognitivecartplugin.com/mcp |
| GB | https://docs.gytabuyback.com/mcp |
| VI | https://docs.versioninfoplugin.com/mcp |
| SPP | https://docs.splitpayplugin.com/mcp |

Discovery: `https://{docs-domain}/.well-known/mcp`
