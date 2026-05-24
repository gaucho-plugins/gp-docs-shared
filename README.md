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

Site ids: `bic`, `sic`, `cc`, `gb`, `vi`, `spp`.

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
