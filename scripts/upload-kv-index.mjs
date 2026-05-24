#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig } from './lib/docs-utils.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const opts = { repo: process.cwd(), site: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--repo' && argv[i + 1]) opts.repo = path.resolve(argv[++i]);
    else if (argv[i] === '--site' && argv[i + 1]) opts.site = argv[++i];
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  const configPath = path.join(opts.repo, 'gp-docs.config.json');
  const siteId = opts.site || JSON.parse(fs.readFileSync(configPath, 'utf8')).site;
  const site = loadSiteConfig(sharedRoot, siteId);
  const indexPath = path.join(opts.repo, 'mcp-index.json');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing ${indexPath} — run build-docs first`);
  }

  const namespaceId = process.env.GP_DOCS_KV_NAMESPACE_ID;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!namespaceId || !accountId || !apiToken) {
    console.log('Skipping KV upload (set GP_DOCS_KV_NAMESPACE_ID, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN)');
    return;
  }

  const body = fs.readFileSync(indexPath, 'utf8');
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(site.hostname)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body,
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(`KV upload failed: ${JSON.stringify(json.errors || json)}`);
  }
  console.log(`Uploaded mcp-index.json to KV key ${site.hostname}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
