#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assetPrefixForHtml,
  buildPageMarkdown,
  extractPageMeta,
  findHtmlPages,
  loadSiteConfig,
  markdownPathForHtml,
} from './lib/docs-utils.mjs';
import {
  enforceExternalLinkPolicy,
  injectAnalytics,
  injectHeader,
  injectPage,
  injectSidebar,
  patchStylesheet,
  stripComponentsJsReference,
  stripFreemiusCheckout,
  syncSharedAssets,
  writeHtaccess,
} from './lib/inject-html.mjs';

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

function readSiteId(repoRoot) {
  const configPath = path.join(repoRoot, 'gp-docs.config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing gp-docs.config.json in ${repoRoot}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8')).site;
}

function pageUrlPath(repoRoot, htmlPath, site) {
  const rel = path.relative(repoRoot, path.dirname(htmlPath));
  if (!rel || rel === '.') return '/';
  return `/${rel.replace(/\\/g, '/')}/`;
}

function buildLlmsTxt(pages, site) {
  const lines = [
    `# ${site.title}`,
    '',
    `> ${site.productName} documentation for AI agents and MCP clients.`,
    '',
    `Site: ${site.origin}`,
    `MCP: ${site.origin}/mcp`,
    '',
    '## Pages',
    '',
    'Every page is available as Markdown at `{path}index.md` or via `Accept: text/markdown`.',
    '',
    '| Page | HTML | Markdown |',
    '| --- | --- | --- |',
  ];
  for (const p of pages) {
    const urlPath = pageUrlPath(p.repoRoot, p.htmlPath, site);
    const mdUrl = urlPath === '/' ? `${site.origin}/index.md` : `${site.origin}${urlPath}index.md`;
    const htmlUrl = urlPath === '/' ? `${site.origin}/` : `${site.origin}${urlPath}`;
    lines.push(`| ${p.title} | ${htmlUrl} | ${mdUrl} |`);
  }
  if (site.setupSkillUrl) {
    lines.push('', '## Setup skill', '', `- Install the ${site.productName} setup skill: ${site.origin}${site.setupSkillUrl}`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildMcpIndex(pages, site, repoRoot) {
  const skills = (site.skills || []).map((skill) => {
    const fullPath = path.join(repoRoot, skill.path);
    return {
      uri: skill.uri,
      name: skill.name,
      title: skill.title,
      mimeType: 'text/markdown',
      body: fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '',
    };
  });
  return {
    siteId: site.id,
    hostname: site.hostname,
    origin: site.origin,
    title: site.title,
    // Falling back to now() made every rebuild rewrite mcp-index.json even when
    // nothing changed, so six repos showed a timestamp-only diff on each build.
    // The newest page's mtime is stable across rebuilds of unchanged content.
    updatedAt: site.contentUpdatedAt || newestPageMtime(builtPages),
    pages: pages.map((p) => ({
      path: p.urlPath,
      title: p.title,
      description: p.description,
      url: p.urlPath === '/' ? `${site.origin}/` : `${site.origin}${p.urlPath}`,
      markdown: p.markdown,
    })),
    skills,
  };
}

/** Newest source-page mtime, so an unchanged rebuild is byte-identical. */
function newestPageMtime(pages) {
  let newest = 0;
  for (const p of pages) {
    try {
      const m = fs.statSync(p.htmlPath).mtimeMs;
      if (m > newest) newest = m;
    } catch {}
  }
  return new Date(newest || 0).toISOString();
}

function buildSitemapMarkdown(pages, site) {
  const urls = pages.map((p) => {
    const loc = p.urlPath === '/' ? `${site.origin}/index.md` : `${site.origin}${p.urlPath}index.md`;
    return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

async function main() {
  const opts = parseArgs(process.argv);
  const repoRoot = opts.repo;
  const siteId = opts.site || readSiteId(repoRoot);
  const site = loadSiteConfig(sharedRoot, siteId);

  console.log(`Building GP docs assets for ${site.title} (${repoRoot})`);

  syncSharedAssets(sharedRoot, repoRoot, site);
  patchStylesheet(repoRoot, site);
  writeHtaccess(repoRoot);

  const htmlPaths = findHtmlPages(repoRoot);
  const builtPages = [];

  for (const htmlPath of htmlPaths) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const markdown = buildPageMarkdown({ repoRoot, htmlPath, html, site });
    const mdPath = markdownPathForHtml(htmlPath);
    fs.writeFileSync(mdPath, markdown);

    const meta = extractPageMeta(html);
    const urlPath = pageUrlPath(repoRoot, htmlPath, site);
    const assetPrefix = assetPrefixForHtml(path.relative(repoRoot, htmlPath), site.assetPath);
    // Root prefix navigates from the page back to repo root for nav/logo hrefs.
    // assetPrefix already includes the assets subdir; rootPrefix strips it.
    const rootPrefix = site.assetPath
      ? assetPrefix.replace(new RegExp(`${site.assetPath}/$`), '')
      : assetPrefix;
    let patched = injectPage(html, { site, assetPrefix, pagePath: urlPath });
    patched = injectHeader(patched, { site, assetPrefix, rootPrefix });
    patched = injectSidebar(patched, { site, rootPrefix, pagePath: urlPath });
    patched = enforceExternalLinkPolicy(patched, { site });
    patched = stripFreemiusCheckout(patched);
    patched = stripComponentsJsReference(patched);
    patched = injectAnalytics(patched, { site });
    fs.writeFileSync(htmlPath, patched);

    builtPages.push({
      repoRoot,
      htmlPath,
      urlPath,
      title: meta.title,
      description: meta.description,
      markdown,
    });
    console.log(`  ${urlPath} → index.md`);
  }

  // 404.html is not a docs page (no markdown, not in llms.txt) but still gets the
  // GA4 tag so broken inbound links show up in reports.
  const notFoundPath = path.join(repoRoot, '404.html');
  if (fs.existsSync(notFoundPath)) {
    fs.writeFileSync(notFoundPath, injectAnalytics(fs.readFileSync(notFoundPath, 'utf8'), { site }));
  }

  fs.writeFileSync(path.join(repoRoot, 'llms.txt'), buildLlmsTxt(builtPages, site));
  fs.writeFileSync(path.join(repoRoot, 'mcp-index.json'), JSON.stringify(buildMcpIndex(builtPages, site, repoRoot), null, 2));
  fs.writeFileSync(path.join(repoRoot, 'sitemap-markdown.xml'), buildSitemapMarkdown(builtPages, site));

  console.log(`Done: ${builtPages.length} pages, llms.txt, mcp-index.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
