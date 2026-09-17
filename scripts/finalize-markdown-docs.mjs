#!/usr/bin/env node
// Finalize a rendered markdown docs build: accessibility patches on the
// injected nav, sitemaps, robots.txt, the AI/LLM surface (llms.txt +
// llms-full.txt), MCP index filtering, Pages headers/redirects/routing, and a
// 404 page that matches the built shell.
//
// Run AFTER render-markdown-docs.mjs and build-docs.mjs:
//   node finalize-markdown-docs.mjs --repo ../china-payments-plugin-docs
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadSiteConfig } from './lib/docs-utils.mjs';

const sharedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = { repo: process.cwd() };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--repo' && argv[i + 1]) opts.repo = path.resolve(argv[++i]);
  }
  return opts;
}

const { repo: repoRoot } = parseArgs(process.argv);
const distRoot = path.join(repoRoot, 'dist');
const buildManifestPath = path.join(distRoot, 'route-build-manifest.json');
if (!fs.existsSync(buildManifestPath)) {
  console.error('Missing dist/route-build-manifest.json. Run render-markdown-docs.mjs first.');
  process.exit(1);
}
const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'));
const site = loadSiteConfig(sharedRoot, buildManifest.site);
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs-manifest.json'), 'utf8'));
const origin = buildManifest.origin.replace(/\/$/, '');
const isPreview = buildManifest.environment === 'preview';
const siteTitle = site.title;
const productName = site.productName || site.title;
const slug = String(buildManifest.site).replace(/[^a-z0-9]+/gi, '-');

function htmlPathForRoute(route) {
  return route === '/' ? path.join(distRoot, 'index.html') : path.join(distRoot, route.slice(1), 'index.html');
}

// The shared build injects the header/sidebar markup; add the ARIA wiring it
// does not, so every site ships the same accessible nav.
for (const page of buildManifest.routes) {
  const htmlPath = htmlPathForRoute(page.route);
  if (!fs.existsSync(htmlPath)) continue;
  let html = fs.readFileSync(htmlPath, 'utf8');
  html = html
    .replace('<button class="menu-toggle" aria-label="Open menu">', `<button class="menu-toggle" type="button" aria-label="Open menu" aria-controls="${slug}-sidebar" aria-expanded="false">`)
    .replace('<div class="sidebar-overlay"></div>', '<div class="sidebar-overlay" aria-hidden="true"></div>')
    .replace('<aside class="sidebar">', `<aside class="sidebar" id="${slug}-sidebar">`)
    .replace(/<a([^>]*class="nav-link active"[^>]*)>/g, '<a$1 aria-current="page">');
  let navGroupIndex = 0;
  html = html.replace(/<nav class="nav-group">\s*<div class="nav-group-title">/g, () => {
    navGroupIndex += 1;
    const labelId = `${slug}-nav-group-${navGroupIndex}`;
    return `<nav class="nav-group" aria-labelledby="${labelId}">\n    <div class="nav-group-title" id="${labelId}">`;
  });
  fs.writeFileSync(htmlPath, html);
}

const publicPages = buildManifest.routes.filter((page) => !/^noindex\b/i.test(page.sourceRobots || page.robots));
const indexable = isPreview ? [] : publicPages;

const urlset = (suffix = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map((page) => {
  const loc = page.route === '/' ? `${origin}/${suffix}` : `${origin}${page.route}${suffix}`;
  return `  <url><loc>${loc}</loc></url>`;
}).join('\n')}\n</urlset>\n`;

fs.writeFileSync(path.join(distRoot, 'sitemap.xml'), urlset());
fs.writeFileSync(path.join(distRoot, 'sitemap-markdown.xml'), urlset('index.md'));
fs.writeFileSync(
  path.join(distRoot, 'robots.txt'),
  isPreview
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
);

// llms-full.txt: the whole corpus in one fetch, for agents that cannot crawl.
const fullText = [`# ${siteTitle} — full documentation corpus`, ''];
if (buildManifest.productVersion) {
  fullText.push(`> Applies to ${productName} ${buildManifest.productVersion}.`, '');
}
for (const page of publicPages) {
  const markdownPath = path.join(path.dirname(htmlPathForRoute(page.route)), 'index.md');
  if (!fs.existsSync(markdownPath)) continue;
  fullText.push(`\n---\n\nSource: ${origin}${page.route}\n\n${fs.readFileSync(markdownPath, 'utf8').trim()}\n`);
}
fs.writeFileSync(path.join(distRoot, 'llms-full.txt'), `${fullText.join('\n').trim()}\n`);

const llmsLines = [
  `# ${siteTitle}`,
  '',
  `> ${productName} documentation for AI agents and MCP clients.`,
  '',
  `Site: ${origin}`,
  `MCP: ${origin}/mcp`,
  '',
  '## Pages',
  '',
  'Every listed page is available as HTML and as Markdown at `{path}index.md`.',
  '',
  '| Page | HTML | Markdown |',
  '| --- | --- | --- |',
];
for (const page of publicPages) {
  const htmlUrl = `${origin}${page.route}`;
  const markdownUrl = page.route === '/' ? `${origin}/index.md` : `${origin}${page.route}index.md`;
  llmsLines.push(`| ${page.title.replace(/\|/g, '\\|')} | ${htmlUrl} | ${markdownUrl} |`);
}
fs.writeFileSync(path.join(distRoot, 'llms.txt'), `${llmsLines.join('\n')}\n`);

const mcpIndexPath = path.join(distRoot, 'mcp-index.json');
if (fs.existsSync(mcpIndexPath)) {
  const mcpIndex = JSON.parse(fs.readFileSync(mcpIndexPath, 'utf8'));
  const publicRouteSet = new Set(publicPages.map((page) => page.route));
  mcpIndex.pages = (mcpIndex.pages || []).filter((page) => publicRouteSet.has(page.path));
  fs.writeFileSync(mcpIndexPath, `${JSON.stringify(mcpIndex, null, 2)}\n`);
}

const previewRobotsHeader = isPreview ? '  X-Robots-Tag: noindex, nofollow\n' : '';
fs.writeFileSync(path.join(distRoot, '_headers'), `/*
${previewRobotsHeader}  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy-Report-Only: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline' https://fomo-notices.gauchoplugins.workers.dev https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://fomo-notices.gauchoplugins.workers.dev https://www.google-analytics.com https://region1.google-analytics.com

/*.md
  Content-Type: text/markdown; charset=utf-8

/404.html
  X-Robots-Tag: noindex, nofollow
`);

// Redirects preserve every URL the old host answered plus known bad inbound links.
const redirectLines = (manifest.redirects || []).map(({ from, to, status }) => `${from} ${to} ${status || 301}`);
fs.writeFileSync(path.join(distRoot, '_redirects'), redirectLines.length ? `${redirectLines.join('\n')}\n` : '');

fs.writeFileSync(path.join(distRoot, '_routes.json'), `${JSON.stringify({
  version: 1,
  include: ['/*'],
  exclude: [
    '/assets/*',
    '/images/*',
    '/_gp-docs-shared/*',
    '/*.md',
    '/llms.txt',
    '/llms-full.txt',
    '/mcp-index.json',
    '/robots.txt',
    '/sitemap.xml',
    '/sitemap-markdown.xml',
    '/favicon.ico',
  ],
}, null, 2)}\n`);

// Build the 404 from the finished homepage so it carries the injected header,
// sidebar and analytics tag rather than a bare shell.
const rootHtml = fs.readFileSync(path.join(distRoot, 'index.html'), 'utf8');
const notFoundTitle = 'Documentation page not found';
const notFoundDescription = `The requested ${productName} documentation URL does not exist.`;
const notFoundSchema = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: notFoundTitle,
  url: `${origin}/404.html`,
  isPartOf: { '@type': 'WebSite', name: siteTitle, url: `${origin}/` },
}).replace(/</g, '\\u003c');
const notFoundHtml = rootHtml
  .replace(/<title>[\s\S]*?<\/title>/i, `<title>${notFoundTitle} | ${siteTitle}</title>`)
  .replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${notFoundDescription}">`)
  .replace(/<meta name="robots" content="[^"]*">/i, '<meta name="robots" content="noindex, nofollow">')
  .replace(/<link rel="canonical" href="[^"]*">/i, `<link rel="canonical" href="${origin}/404.html">`)
  .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/i, `<script type="application/ld+json">${notFoundSchema}</script>`)
  .replace(/<header class="page-header">[\s\S]*?<\/header>/i, `<header class="page-header"><div class="page-header-main"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Documentation</a></nav><h1>${notFoundTitle}</h1><p class="page-description">${notFoundDescription}</p></div></header>`)
  .replace(/<article class="content">[\s\S]*?<\/article>/i, `<article class="content"><p>Check the address or return to the <a href="/">${siteTitle} home</a>.</p></article>`)
  .replace(/<nav class="page-nav"[\s\S]*?<\/nav>/i, '');
fs.writeFileSync(path.join(distRoot, '404.html'), notFoundHtml);

console.log(`Finalized ${buildManifest.routes.length} routes (${indexable.length} indexable, ${buildManifest.environment}), sitemaps, llms.txt + llms-full.txt, ${redirectLines.length} redirects, headers, routing, 404.`);
