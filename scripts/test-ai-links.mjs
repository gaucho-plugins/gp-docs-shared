#!/usr/bin/env node
/**
 * Validates Open in ChatGPT / Claude URL lengths for docs pages.
 * Run: node scripts/test-ai-links.mjs --repo /path/to/docs-repo
 */
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const opts = { repo: process.cwd() };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--repo' && argv[i + 1]) opts.repo = path.resolve(argv[++i]);
  }
  return opts;
}

function shortAiPrompt({ origin, pagePath, mcpUrl, pageUrl, markdownUrl }) {
  const lines = [
    'Read this documentation page and answer my questions about it.',
    '',
    'Page: ' + pageUrl,
    'Markdown: ' + markdownUrl,
  ];
  if (mcpUrl) lines.push('Docs MCP (search all pages): ' + mcpUrl);
  lines.push('');
  lines.push('Fetch the Markdown URL above for full page content, or use the docs MCP server to search related pages.');
  return lines.join('\n');
}

function findHtmlPages(dir, root = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      findHtmlPages(full, root, out);
    } else if (entry.isFile() && entry.name === 'index.html') {
      out.push(full);
    }
  }
  return out;
}

function extractMeta(html, repoRoot, htmlPath) {
  const origin = html.match(/window\.__GP_DOCS__=\{[^}]*"origin":"([^"]+)"/)?.[1]
    || html.match(/rel="canonical" href="([^"]+)"/)?.[1]?.replace(/\/$/, '').replace(/\/[^/]+$/, '')
    || '';
  const mcpUrl = html.match(/"mcpUrl":"([^"]+)"/)?.[1] || (origin ? origin + '/mcp' : '');
  const rel = path.relative(repoRoot, path.dirname(htmlPath));
  const pagePath = !rel || rel === '.' ? '/' : '/' + rel.replace(/\\/g, '/') + '/';
  const pageUrl = origin + (pagePath === '/' ? '/' : pagePath);
  const markdownUrl = pageUrl === origin + '/' ? origin + '/index.md' : pageUrl + 'index.md';
  return { origin, pagePath, mcpUrl, pageUrl, markdownUrl };
}

const opts = parseArgs(process.argv);
const pages = findHtmlPages(opts.repo);
const failures = [];
const rows = [];

for (const htmlPath of pages) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  if (!html.includes('__GP_DOCS__') && !html.includes('rel="canonical"')) continue;
  const meta = extractMeta(html, opts.repo, htmlPath);
  const short = shortAiPrompt(meta);
  const chatgpt = 'https://chatgpt.com/?q=' + encodeURIComponent(short);
  const claude = 'https://claude.ai/new?q=' + encodeURIComponent(short);
  rows.push({ page: meta.pagePath, chatgpt: chatgpt.length, claude: claude.length });
  if (chatgpt.length > 7500 || claude.length > 7500) {
    failures.push({ page: meta.pagePath, chatgpt: chatgpt.length, claude: claude.length });
  }
}

rows.sort((a, b) => Math.max(b.chatgpt, b.claude) - Math.max(a.chatgpt, a.claude));
console.log(`Checked ${rows.length} pages in ${opts.repo}`);
console.log('Longest URLs:');
for (const row of rows.slice(0, 5)) {
  console.log(`  ${row.page} chatgpt=${row.chatgpt} claude=${row.claude}`);
}
if (failures.length) {
  console.error(`FAIL: ${failures.length} pages exceed URL length limit`);
  process.exit(1);
}
console.log('OK: all AI link URLs within safe length limits');
