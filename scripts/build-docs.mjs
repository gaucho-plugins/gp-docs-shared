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
  injectPage,
  patchStylesheet,
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
    updatedAt: new Date().toISOString(),
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
    const patched = injectPage(html, { site, assetPrefix, pagePath: urlPath });
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

  fs.writeFileSync(path.join(repoRoot, 'llms.txt'), buildLlmsTxt(builtPages, site));
  fs.writeFileSync(path.join(repoRoot, 'mcp-index.json'), JSON.stringify(buildMcpIndex(builtPages, site, repoRoot), null, 2));
  fs.writeFileSync(path.join(repoRoot, 'sitemap-markdown.xml'), buildSitemapMarkdown(builtPages, site));

  console.log(`Done: ${builtPages.length} pages, llms.txt, mcp-index.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
