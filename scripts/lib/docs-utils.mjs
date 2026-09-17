import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });
  td.use(gfm);
  td.remove(['script', 'style', 'svg']);
  td.addRule('headingAnchor', {
    filter(node) {
      return node.nodeName === 'A' && node.classList?.contains('heading-anchor');
    },
    replacement() {
      return '';
    },
  });
  td.addRule('headingWithCustomId', {
    filter(node) {
      return /^H[1-6]$/.test(node.nodeName) && Boolean(node.getAttribute('id'));
    },
    replacement(content, node) {
      const level = Number(node.nodeName.slice(1));
      const text = content.trim();
      const naturalId = text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_~]/g, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s_-]/gu, '')
        .trim()
        .replace(/\s+/g, '-');
      const id = node.getAttribute('id');
      const anchor = id === naturalId ? '' : `<a id="${id}"></a>\n\n`;
      return `\n\n${anchor}${'#'.repeat(level)} ${text}\n\n`;
    },
  });
  return td;
}

export function cleanGitbookMarkdown(raw, pageUrl) {
  let md = raw;
  md = md.replace(/^---[\s\S]*?---\n/m, '');
  md = md.replace(/\{%\s*hint\s+style="[^"]*"\s*%\}([\s\S]*?)\{%\s*endhint\s*%\}/gi, (_, body) => {
    return `\n> ${body.trim().replace(/\n/g, '\n> ')}\n`;
  });
  md = md.replace(/\{%\s*content-ref\s+url="([^"]+)"\s*%\}[\s\S]*?\{%\s*endcontent-ref\s*%\}/gi, (_, url) => {
    return `[${path.basename(url, '.md')}](${url})`;
  });
  md = md.replace(/<figure>[\s\S]*?<\/figure>/gi, '');
  md = md.replace(/&#x20;/g, ' ');
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

export function htmlContentToMarkdown(html) {
  // Drop decorative, aria-hidden glyphs (e.g. the hint bullet) so a callout does
  // not become a lone "●" line in the markdown AI clients read.
  html = html.replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/gi, '');
  // Rendered-HTML sites wrap page content in <div class="content">; sites built
  // from markdown by render-markdown-docs.mjs use <article class="content">.
  // Matching only the <div> form silently produced an EMPTY index.md (and an
  // empty mcp-index entry) for every markdown-rendered page.
  const match = html.match(/<(div|article) class="content">([\s\S]*?)<\/\1>\s*(?:<div class="page-nav"|<nav class="page-nav"|<footer class="page-footer"|$)/i);
  if (!match) return '';
  const td = createTurndown();
  return td.turndown(match[2]).trim();
}

// Decode HTML entities so the machine-readable surfaces (index.md frontmatter,
// mcp-index.json, llms-full.txt) carry real text. Previously only `&amp;` was
// handled, which shipped raw `&#x20;` / `&mdash;` to AI clients.
export function decodeHtmlEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&mdash;/gi, '-')
    .replace(/&ndash;/gi, '-')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

export function extractPageMeta(html) {
  const title = decodeHtmlEntities(
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s*[|—–-]\s*[^|—–-]+$/, '') || '',
  ).trim();
  // Tolerate attribute order/quoting rather than one exact literal form.
  const descTag = html.match(/<meta[^>]*name=["']?description["']?[^>]*>/i)?.[0] || '';
  const description = decodeHtmlEntities(descTag.match(/content=["']([^"']*)["']/i)?.[1] || '');
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] || '';
  const h1 = html.match(/<div class="page-header"[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || html.match(/<div class="content"[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || '';
  const plainH1 = h1.replace(/<[^>]+>/g, '').replace(/&amp;/gi, '&').trim();
  return { title: plainH1 || title, description, canonical };
}

export function markdownPathForHtml(htmlPath) {
  return path.join(path.dirname(htmlPath), 'index.md');
}

export function sourceMarkdownForHtml(repoRoot, htmlPath) {
  const rel = path.relative(repoRoot, htmlPath);
  if (rel === 'index.html') return null;
  const dir = path.dirname(rel);
  const base = path.basename(dir);
  const parent = path.dirname(dir);
  const candidates = [
    path.join(repoRoot, parent, `${base}.md`),
    path.join(repoRoot, dir, `${base}.md`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function buildPageMarkdown({ repoRoot, htmlPath, html, site }) {
  const meta = extractPageMeta(html);
  const srcMd = sourceMarkdownForHtml(repoRoot, htmlPath);
  let body = '';
  if (srcMd) {
    body = cleanGitbookMarkdown(fs.readFileSync(srcMd, 'utf8'), meta.canonical);
  } else {
    body = htmlContentToMarkdown(html);
  }
  // path.relative() is "" at the repo root, which used to yield `origin//`.
  const relativeDir = path.relative(repoRoot, path.dirname(htmlPath)).replace(/\\/g, '/');
  const url = meta.canonical || `${site.origin}/${relativeDir ? `${relativeDir}/` : ''}`;
  const frontmatter = [
    '---',
    `title: ${JSON.stringify(meta.title)}`,
    meta.description ? `description: ${JSON.stringify(meta.description)}` : null,
    `url: ${JSON.stringify(url)}`,
    '---',
    '',
  ].filter(Boolean).join('\n');
  return `${frontmatter}\n${body}\n`;
}

export function loadSiteConfig(sharedRoot, siteId) {
  const configPath = path.join(sharedRoot, 'config/sites', `${siteId}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Unknown site id: ${siteId}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

export function findHtmlPages(repoRoot) {
  const pages = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'assets') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'skill') continue;
        walk(full);
      } else if (entry.name === 'index.html') {
        pages.push(full);
      }
    }
  }
  walk(repoRoot);
  return pages.sort();
}

export function assetPrefixForHtml(htmlPath, assetPath) {
  const dir = path.dirname(htmlPath);
  const depth = dir === '.' ? 0 : dir.split(path.sep).filter(Boolean).length;
  const prefix = depth === 0 ? './' : '../'.repeat(depth);
  return assetPath ? `${prefix}${assetPath}/` : prefix;
}
