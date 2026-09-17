#!/usr/bin/env node
// Render a GitBook-flavored markdown docs repo into the shared GP docs HTML
// shell, ready for build-docs.mjs (which injects the header, sidebar, GA4 tag,
// per-page index.md, llms.txt and mcp-index.json).
//
// This is the generalized form of payment-page-docs/scripts/render-docs.mjs:
// everything product-specific comes from config/sites/<id>.json plus the
// repo's own docs-manifest.json, so a new book needs data, not code.
//
// Usage:
//   node render-markdown-docs.mjs --repo ../china-payments-plugin-docs [--site cpp]
//
// Reads:  <repo>/gp-docs.config.json   -> { "site": "<id>" }
//         <repo>/docs-manifest.json    -> route contract (see README)
//         config/sites/<id>.json       -> site identity, nav, breadcrumb labels
// Writes: <repo>/dist/**/index.html, dist/404.html, dist/assets/**,
//         dist/gp-docs.config.json, dist/route-build-manifest.json
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { marked, Renderer } from 'marked';
import { loadSiteConfig } from './lib/docs-utils.mjs';

const sharedRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = { repo: process.cwd(), site: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--repo' && argv[i + 1]) opts.repo = path.resolve(argv[++i]);
    else if (argv[i] === '--site' && argv[i + 1]) opts.site = argv[++i];
  }
  return opts;
}

const opts = parseArgs(process.argv);
const repoRoot = opts.repo;
const distRoot = path.join(repoRoot, 'dist');
const siteId = opts.site
  || JSON.parse(fs.readFileSync(path.join(repoRoot, 'gp-docs.config.json'), 'utf8')).site;
const site = loadSiteConfig(sharedRoot, siteId);
const manifestPath = path.join(repoRoot, 'docs-manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`Missing ${manifestPath}. The route contract is required so live URLs cannot drift.`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const origin = (manifest.origin || site.origin).replace(/\/$/, '');
const lang = site.lang || 'en-US';
const siteTitle = site.title;
const productName = site.productName || site.title;
const productVersion = manifest.productVersion || site.productVersion || null;
const styleVersion = site.styleVersion || '20260917-001';
const breadcrumbLabels = new Map(Object.entries(site.breadcrumbLabels || {}));
const faviconFile = site.favicon || 'favicon.svg';
const faviconType = faviconFile.endsWith('.png') ? 'image/png'
  : faviconFile.endsWith('.ico') ? 'image/x-icon' : 'image/svg+xml';
const humanizeOverrides = new Map(Object.entries(site.humanizeOverrides || {}));
const isPreview = process.env.DOCS_PREVIEW === '1'
  || (Boolean(process.env.CF_PAGES_BRANCH) && process.env.CF_PAGES_BRANCH !== 'main');

function normalizeRoute(route) {
  if (!route || route === '/') return '/';
  return `/${String(route).replace(/^\/+|\/+$/g, '')}/`;
}

const routeBySource = new Map(
  manifest.sourcePages.map((page) => [path.resolve(repoRoot, page.source), normalizeRoute(page.route)]),
);
const knownRoutes = new Set([
  ...manifest.sourcePages.map((page) => normalizeRoute(page.route)),
  ...(manifest.liveOnlyRoutes || []).map(normalizeRoute),
]);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

function stripHtml(value) {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#x20);/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return stripHtml(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function humanizeSlug(route) {
  const slug = (String(route).split('/').filter(Boolean).at(-1) || 'welcome').replace(/\.md$/i, '');
  if (humanizeOverrides.has(slug)) return humanizeOverrides.get(slug);
  return slug
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
    .replace(/\+\s*\+/g, ' + ');
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return { attributes: {}, body: raw };
  const end = raw.indexOf('\n---\n', 4);
  if (end === -1) return { attributes: {}, body: raw };
  const block = raw.slice(4, end).split('\n');
  const attributes = {};
  for (let index = 0; index < block.length; index += 1) {
    const line = block[index];
    const match = /^([a-zA-Z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (['>-', '|-', '>', '|'].includes(rawValue)) {
      const parts = [];
      while (index + 1 < block.length && /^\s+/.test(block[index + 1])) parts.push(block[++index].trim());
      attributes[key] = parts.join(' ').trim();
    } else {
      attributes[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2').trim();
    }
  }
  return { attributes, body: raw.slice(end + 5) };
}

function firstHeading(markdown, fallback) {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? stripHtml(match[1].replace(/[*_`]/g, '')) : fallback;
}

function removeFirstHeading(markdown) {
  return markdown.replace(/^#\s+.+\n?/m, '');
}

function inferDescription(markdown, fallback) {
  const withoutBlocks = markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\{%[\s\S]*?%\}/g, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#|]/g, ' ')
    .split(/\n\s*\n/)
    .map((part) => stripHtml(part))
    .find((part) => part.length >= 35);
  return (withoutBlocks || fallback).slice(0, 260);
}

// GitBook block syntax -> tokens rendered after markdown parsing.
function preprocessGitBook(markdown) {
  const replacements = [];
  let body = markdown.replace(/&#x20;/g, ' ');

  body = body.replace(
    /<figure>\s*<img\s+src=(['"])(.*?)\1\s+alt=(['"])(.*?)\3\s*>\s*<figcaption>\s*<p>(.*?)<\/p>\s*<\/figcaption>\s*<\/figure>/gis,
    (_, _q1, src, _q2, alt, caption) => `![${stripHtml(alt) || stripHtml(caption)}](${src})\n\n*${stripHtml(caption)}*`,
  );
  // Bare GitBook figures (no caption) still carry the only alt text available.
  body = body.replace(
    /<figure>\s*<img\s+src=(['"])(.*?)\1(?:\s+alt=(['"])(.*?)\3)?\s*>\s*(?:<figcaption>\s*<\/figcaption>\s*)?<\/figure>/gis,
    (_, _q1, src, _q2, alt) => `![${stripHtml(alt || '')}](${src})`,
  );

  body = body.replace(/\{%\s*hint\s+style="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endhint\s*%\}/gi, (_, style, content) => {
    const key = `GPBLOCK${replacements.length}TOKEN`;
    replacements.push({ type: 'hint', style, content: content.trim() });
    return `\n\n${key}\n\n`;
  });

  body = body.replace(/\{%\s*content-ref\s+url="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endcontent-ref\s*%\}/gi, (_, url, content) => {
    const sourceLabel = /\[([^\]]+)\]\([^)]*\)/.exec(content)?.[1]?.trim() || '';
    const linkTarget = /\[[^\]]+\]\(([^)]*)\)/.exec(content)?.[1]?.trim() || '';
    const label = !sourceLabel || /(?:^|\/)readme\.md$|\.md$/i.test(sourceLabel)
      ? humanizeSlug(linkTarget || url)
      : sourceLabel;
    // GitBook keeps a /broken/pages/<id> placeholder for deleted targets and
    // renders nothing for it; dropping it here matches the published page.
    const resolved = /^\/pages\//.test(url) && linkTarget ? linkTarget : url;
    if (/^\/broken\//.test(resolved) || /^\/broken\//.test(linkTarget)) return '\n\n';
    const key = `GPBLOCK${replacements.length}TOKEN`;
    replacements.push({ type: 'reference', url: resolved, label });
    return `\n\n${key}\n\n`;
  });

  body = body.replace(/\{%\s*embed\s+url="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endembed\s*%\}/gi, (_, url, content) => {
    const key = `GPBLOCK${replacements.length}TOKEN`;
    replacements.push({ type: 'embed', url, label: stripHtml(content) || 'Open video' });
    return `\n\n${key}\n\n`;
  });
  body = body.replace(/\{%\s*embed\s+url="([^"]+)"\s*%\}/gi, (_, url) => {
    const key = `GPBLOCK${replacements.length}TOKEN`;
    replacements.push({ type: 'embed', url, label: 'Open video' });
    return `\n\n${key}\n\n`;
  });

  // {% code %} only carries display options; the fenced block inside stands alone.
  body = body.replace(/\{%\s*code[^%]*%\}/gi, '');
  body = body.replace(/\{%\s*endcode\s*%\}/gi, '');

  // Unsupported leftovers (tabs, steps, columns) degrade to their inner content.
  body = body.replace(/\{%\s*(?:tabs|endtabs|steps|endsteps|columns|endcolumns)\s*%\}/gi, '');
  body = body.replace(/\{%\s*tab\s+title="([^"]*)"\s*%\}/gi, (_, title) => `\n\n**${stripHtml(title)}**\n\n`);
  body = body.replace(/\{%\s*(?:endtab|step|endstep|column|endcolumn)\s*%\}/gi, '');

  return { body, replacements };
}

const assetDirName = 'assets';
const legacyAssetRoute = '/images/legacy/';

function sourceTargetForUrl(rawUrl, sourceFile) {
  const trimmed = String(rawUrl).trim();
  if (!trimmed || /^(?:#|mailto:|tel:|data:|javascript:)/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.origin === origin) {
        const normalized = knownRoutes.has(normalizeRoute(url.pathname))
          ? normalizeRoute(url.pathname)
          : url.pathname;
        return `${normalized}${url.search}${url.hash}`;
      }
    } catch {
      return trimmed;
    }
    return trimmed;
  }
  // Root-relative GitBook exports ("/our-plugins.md") still point at source files.
  if (trimmed.startsWith('/')) {
    const [rootPath, rootSuffix = ''] = trimmed.split(/(?=[?#])/u, 2);
    if (/\.md$/i.test(rootPath)) {
      const absolute = path.resolve(repoRoot, rootPath.replace(/^\/+/, ''));
      if (routeBySource.has(absolute)) return `${routeBySource.get(absolute)}${rootSuffix}`;
    }
    return trimmed;
  }

  const [pathPart, suffix = ''] = trimmed.split(/(?=[?#])/u, 2);
  const decodedPath = decodeURIComponent(pathPart.replace(/^<|>$/g, ''));
  const absolute = path.resolve(path.dirname(sourceFile), decodedPath);
  if (decodedPath.endsWith('.md') && routeBySource.has(absolute)) {
    return `${routeBySource.get(absolute)}${suffix}`;
  }
  if (absolute.startsWith(path.join(repoRoot, '.gitbook', 'assets') + path.sep)) {
    return `${legacyAssetRoute}${encodeURIComponent(path.basename(absolute)).replace(/%2F/gi, '/')}${suffix}`;
  }
  if (absolute.startsWith(path.join(repoRoot, assetDirName) + path.sep)) {
    const relative = path.relative(path.join(repoRoot, assetDirName), absolute)
      .split(path.sep).map(encodeURIComponent).join('/');
    return `/${assetDirName}/${relative}${suffix}`;
  }
  return trimmed;
}

function imageDimensions(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += Math.max(length + 2, 2);
    }
  }
  if (filePath.endsWith('.svg')) {
    const text = buffer.toString('utf8');
    const viewBox = /viewBox=["'](?:[-.\d]+\s+){2}([-.\d]+)\s+([-.\d]+)["']/.exec(text);
    if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  }
  return null;
}

function localImageFile(url) {
  const clean = decodeURIComponent(String(url).split(/[?#]/)[0]);
  if (clean.startsWith(legacyAssetRoute)) return path.join(repoRoot, '.gitbook', 'assets', path.basename(clean));
  if (clean.startsWith(`/${assetDirName}/`)) return path.join(repoRoot, clean.slice(1));
  return null;
}

function createRenderer(sourceFile) {
  const renderer = new Renderer();
  const seenSlugs = new Map();

  renderer.heading = function heading({ tokens, depth }) {
    const html = this.parser.parseInline(tokens);
    const base = slugify(html);
    const count = seenSlugs.get(base) || 0;
    seenSlugs.set(base, count + 1);
    const id = count ? `${base}-${count + 1}` : base;
    const anchor = depth >= 2
      ? `<a href="#${id}" class="heading-anchor" aria-label="Link to ${escapeAttr(stripHtml(html))}">#</a>`
      : '';
    return `<h${depth} id="${id}">${html}${anchor}</h${depth}>\n`;
  };

  renderer.link = function link({ href, title, tokens }) {
    const target = sourceTargetForUrl(href, sourceFile);
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
    return `<a href="${escapeAttr(target)}"${titleAttr}>${this.parser.parseInline(tokens)}</a>`;
  };

  renderer.image = function image({ href, title, text }) {
    const target = sourceTargetForUrl(href, sourceFile);
    const localFile = localImageFile(target);
    const dimensions = imageDimensions(localFile);
    const inferredAlt = stripHtml(text)
      || humanizeSlug(path.basename(decodeURIComponent(String(target).split(/[?#]/)[0]), path.extname(target)));
    const sizeAttrs = dimensions ? ` width="${dimensions.width}" height="${dimensions.height}"` : '';
    const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
    return `<img src="${escapeAttr(target)}" alt="${escapeAttr(inferredAlt)}"${titleAttr}${sizeAttrs} loading="lazy" decoding="async">`;
  };

  renderer.table = function table(token) {
    let headerCells = '';
    for (const cell of token.header) headerCells += this.tablecell(cell);
    const header = this.tablerow({ text: headerCells });
    let rows = '';
    for (const row of token.rows) {
      let cells = '';
      for (const cell of row) cells += this.tablecell(cell);
      rows += this.tablerow({ text: cells });
    }
    return `<div class="table-wrap"><table><thead>${header}</thead>${rows ? `<tbody>${rows}</tbody>` : ''}</table></div>\n`;
  };

  return renderer;
}

function renderFragment(markdown, sourceFile) {
  const prepared = preprocessGitBook(markdown);
  let html = marked.parse(prepared.body, {
    async: false,
    gfm: true,
    breaks: false,
    renderer: createRenderer(sourceFile),
  });

  for (let index = 0; index < prepared.replacements.length; index += 1) {
    const replacement = prepared.replacements[index];
    const marker = new RegExp(`<p>GPBLOCK${index}TOKEN<\\/p>\\s*`, 'g');
    if (replacement.type === 'hint') {
      const style = ['info', 'success', 'warning', 'danger'].includes(replacement.style) ? replacement.style : 'info';
      const inner = renderFragment(replacement.content, sourceFile);
      html = html.replace(marker, `<aside class="hint ${style}" role="note"><span class="hint-icon" aria-hidden="true">●</span><div class="hint-content">${inner}</div></aside>`);
    } else if (replacement.type === 'reference') {
      const href = sourceTargetForUrl(replacement.url, sourceFile);
      html = html.replace(marker, `<a href="${escapeAttr(href)}" class="content-ref"><span class="content-ref-title">${escapeHtml(replacement.label)}</span><span class="content-ref-arrow" aria-hidden="true">→</span></a>`);
    } else if (replacement.type === 'embed') {
      html = html.replace(marker, `<a href="${escapeAttr(replacement.url)}" class="content-ref"><span class="content-ref-title">${escapeHtml(replacement.label)}</span><span class="content-ref-arrow" aria-hidden="true">↗</span></a>`);
    }
  }
  return html;
}

function breadcrumbForRoute(route) {
  const parts = route.split('/').filter(Boolean);
  if (!parts.length) return [];
  const crumbs = [{ label: 'Documentation', href: '/' }];
  let walked = '';
  for (const part of parts.slice(0, -1)) {
    walked += `/${part}`;
    crumbs.push({ label: breadcrumbLabels.get(part) || humanizeSlug(part), href: `${walked}/` });
  }
  // Only link crumbs that are real pages; the rest stay as the first crumb only.
  return crumbs.filter((crumb, index) => index === 0 || knownRoutes.has(normalizeRoute(crumb.href)));
}

function renderBreadcrumbs(route, title) {
  if (route === '/') return { visible: '', schemaItems: [] };
  const crumbs = breadcrumbForRoute(route).filter((crumb) => normalizeRoute(crumb.href) !== normalizeRoute(route));
  const visible = crumbs
    .map((crumb) => `<a href="${escapeAttr(crumb.href)}">${escapeHtml(crumb.label)}</a>`)
    .join('<span class="breadcrumb-sep" aria-hidden="true">/</span>');
  const schemaItems = [
    ...crumbs.map((crumb, index) => ({
      '@type': 'ListItem', position: index + 1, name: crumb.label, item: `${origin}${crumb.href}`,
    })),
    { '@type': 'ListItem', position: crumbs.length + 1, name: title, item: `${origin}${route}` },
  ];
  return { visible, schemaItems };
}

function pageNavigation(index, pages) {
  const previous = index > 0 ? pages[index - 1] : null;
  const next = index + 1 < pages.length ? pages[index + 1] : null;
  if (!previous && !next) return '';
  const renderLink = (page, direction) => (page
    ? `<a class="page-nav-link ${direction}" href="${page.route}"><span class="arrow" aria-hidden="true">${direction === 'next' ? '→' : '←'}</span><span><span class="label">${direction === 'next' ? 'Next' : 'Previous'}</span><span class="title">${escapeHtml(page.title)}</span></span></a>`
    : '<span></span>');
  return `<nav class="page-nav" aria-label="Documentation pages">${renderLink(previous, 'previous')}${renderLink(next, 'next')}</nav>`;
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function htmlDocument(page, index, pages) {
  const canonical = `${origin}${page.route}`;
  const titleTag = page.route === '/' ? siteTitle : `${page.title} | ${siteTitle}`;
  const breadcrumbs = renderBreadcrumbs(page.route, page.title);
  const about = {
    '@type': 'SoftwareApplication',
    name: productName,
    applicationCategory: 'WordPress plugin',
    ...(productVersion ? { softwareVersion: productVersion } : {}),
  };
  const schemaGraph = [
    {
      '@type': 'TechArticle',
      headline: page.title,
      description: page.description,
      url: canonical,
      inLanguage: page.lang || lang,
      isPartOf: { '@type': 'WebSite', name: siteTitle, url: `${origin}/` },
      publisher: {
        '@type': 'Organization',
        name: site.publisherName || 'Gaucho Plugins',
        url: site.publisherUrl || 'https://gauchoplugins.com/',
      },
      ...(site.omitAbout ? {} : { about }),
    },
  ];
  if (breadcrumbs.schemaItems.length) {
    schemaGraph.push({ '@type': 'BreadcrumbList', itemListElement: breadcrumbs.schemaItems });
  }
  const schema = { '@context': 'https://schema.org', '@graph': schemaGraph };
  const alternates = (page.alternates || [])
    .map((alt) => `\n  <link rel="alternate" hreflang="${escapeAttr(alt.hreflang)}" href="${escapeAttr(alt.href)}">`)
    .join('');
  const versionLine = page.route === '/' && productVersion && site.versionContext !== false
    ? `\n          <p class="version-context">Applies to ${escapeHtml(productName)} ${escapeHtml(productVersion)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="${escapeAttr(page.lang || lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(titleTag)}</title>
  <meta name="description" content="${escapeAttr(page.description)}">
  <meta name="robots" content="${escapeAttr(page.robots)}">
  <link rel="canonical" href="${escapeAttr(canonical)}">${alternates}
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${escapeAttr(siteTitle)}">
  <meta property="og:title" content="${escapeAttr(titleTag)}">
  <meta property="og:description" content="${escapeAttr(page.description)}">
  <meta property="og:url" content="${escapeAttr(canonical)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeAttr(titleTag)}">
  <meta name="twitter:description" content="${escapeAttr(page.description)}">
  <link rel="icon" href="/${assetDirName}/${escapeAttr(faviconFile)}" type="${escapeAttr(faviconType)}">
  <link rel="stylesheet" href="/${assetDirName}/style.css?v=${escapeAttr(styleVersion)}">
  <script type="application/ld+json">${safeJson(schema)}</script>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to documentation</a>
  <div class="site-layout">
    <main class="main-content" id="main-content" tabindex="-1">
      <header class="page-header">
        <div class="page-header-main">
          ${breadcrumbs.visible ? `<nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbs.visible}</nav>` : ''}
          <h1>${escapeHtml(page.title)}</h1>
          <p class="page-description">${escapeHtml(page.description)}</p>${versionLine}
        </div>
      </header>
      <article class="content">${page.content}</article>
      ${pageNavigation(index, pages)}
      <footer class="page-footer">${escapeHtml(site.footerText || `${siteTitle} · Gaucho Plugins`)}</footer>
    </main>
  </div>
  <script src="/${assetDirName}/script.js" defer></script>
</body>
</html>
`;
}

function copyTree(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === '.DS_Store' || entry.name === 'screenshots-pending') continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

function writeRoute(route, html) {
  const directory = route === '/' ? distRoot : path.join(distRoot, route.slice(1));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), html);
}

const pages = [];
for (const entry of manifest.sourcePages) {
  const sourceFile = path.resolve(repoRoot, entry.source);
  const raw = fs.readFileSync(sourceFile, 'utf8');
  const { attributes, body } = parseFrontmatter(raw);
  const route = normalizeRoute(entry.route);
  const title = entry.title || firstHeading(body, humanizeSlug(route) || siteTitle);
  const contentMarkdown = removeFirstHeading(body);
  const sourceRobots = entry.robots || attributes.robots || 'index, follow';
  pages.push({
    route,
    title,
    lang: entry.lang || attributes.lang || lang,
    alternates: entry.alternates || [],
    description: entry.description || attributes.description
      || inferDescription(contentMarkdown, `${title} documentation for ${productName}.`),
    sourceRobots,
    robots: isPreview ? 'noindex, nofollow' : sourceRobots,
    content: renderFragment(contentMarkdown, sourceFile),
    source: entry.source,
  });
}

fs.rmSync(distRoot, { recursive: true, force: true });
fs.mkdirSync(distRoot, { recursive: true });
copyTree(path.join(repoRoot, assetDirName), path.join(distRoot, assetDirName));

// Only ship the legacy GitBook images the rendered pages actually reference.
const legacyTarget = path.join(distRoot, 'images', 'legacy');
const referencedLegacyNames = new Set();
for (const page of pages) {
  for (const match of page.content.matchAll(/\bsrc="\/images\/legacy\/([^"?#]+)(?:[?#][^"]*)?"/g)) {
    referencedLegacyNames.add(decodeURIComponent(match[1]));
  }
}
if (referencedLegacyNames.size) fs.mkdirSync(legacyTarget, { recursive: true });
const missingAssets = [];
for (const name of referencedLegacyNames) {
  const from = path.join(repoRoot, '.gitbook', 'assets', name);
  if (!fs.existsSync(from)) { missingAssets.push(name); continue; }
  fs.copyFileSync(from, path.join(legacyTarget, name));
}
if (missingAssets.length) {
  console.error(`Missing referenced GitBook assets:\n  ${missingAssets.join('\n  ')}`);
  process.exit(1);
}

const navigationPages = pages.filter((page) => !/^noindex\b/i.test(page.sourceRobots));
for (const page of pages) {
  const navigationIndex = navigationPages.indexOf(page);
  writeRoute(
    page.route,
    htmlDocument(page, navigationIndex === -1 ? 0 : navigationIndex, navigationIndex === -1 ? [page] : navigationPages),
  );
}

const notFound = {
  route: '/404/',
  title: 'Documentation page not found',
  description: `The requested ${productName} documentation URL does not exist.`,
  robots: 'noindex, nofollow',
  content: `<p>Check the address or return to the <a href="/">${escapeHtml(siteTitle)} home</a>.</p>`,
};
fs.writeFileSync(path.join(distRoot, '404.html'), htmlDocument(notFound, 0, [notFound]));

fs.writeFileSync(path.join(distRoot, 'gp-docs.config.json'), `${JSON.stringify({ site: siteId }, null, 2)}\n`);
fs.writeFileSync(path.join(distRoot, 'route-build-manifest.json'), `${JSON.stringify({
  schemaVersion: 1,
  site: siteId,
  origin,
  productVersion,
  environment: isPreview ? 'preview' : 'production',
  routes: pages.map(({ route, title, robots, sourceRobots, source, lang: pageLang }) => ({
    route, title, robots, sourceRobots, source, lang: pageLang,
  })),
}, null, 2)}\n`);

console.log(`Rendered ${pages.length} routes for ${siteId} to ${distRoot}${isPreview ? ' (preview)' : ''}`);
