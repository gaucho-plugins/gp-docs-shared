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
  const match = html.match(/<div class="content">([\s\S]*?)<\/div>\s*(?:<div class="page-nav"|<nav class="page-nav"|$)/i);
  if (!match) return '';
  const td = createTurndown();
  return td.turndown(match[1]).trim();
}

export function extractPageMeta(html) {
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.replace(/\s*[|—–-]\s*[^|—–-]+$/, '').trim() || '';
  const description = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] || '';
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1] || '';
  const h1 = html.match(/<div class="page-header"[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || html.match(/<div class="content"[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    || '';
  const plainH1 = h1.replace(/<[^>]+>/g, '').trim();
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
  const url = meta.canonical || `${site.origin}/${path.relative(repoRoot, path.dirname(htmlPath)).replace(/\\/g, '/')}/`;
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
