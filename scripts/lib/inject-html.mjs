import fs from 'node:fs';
import path from 'node:path';

const ASSET_VERSION = '20260524-004';

const HEAD_MARKERS = {
  alternate: '<!-- gp-docs:alternate -->',
  meta: '<!-- gp-docs:meta -->',
  config: '<!-- gp-docs:config -->',
};

const SCRIPT_MARKER = '<!-- gp-docs:scripts -->';

// Centralized header + sidebar markers. When present, the build script
// regenerates the block between start/end from the site config (single
// source of truth for nav). Pages without markers fall back to a
// best-effort match on the legacy `<header class="site-header">` /
// `<aside class="sidebar">` blocks so first-run upgrades are safe.
const HEADER_START_MARKER = '<!-- gp-docs:header-start -->';
const HEADER_END_MARKER = '<!-- gp-docs:header-end -->';
const SIDEBAR_START_MARKER = '<!-- gp-docs:sidebar-start -->';
const SIDEBAR_END_MARKER = '<!-- gp-docs:sidebar-end -->';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// Normalize a path for active-link comparison: ensure leading slash + trailing slash.
function normalizePath(p) {
  if (!p) return '/';
  let out = p;
  if (!out.startsWith('/')) out = '/' + out;
  if (!out.endsWith('/')) out += '/';
  return out;
}

function buildHeaderHtml({ site, assetPrefix, rootPrefix }) {
  const h = site.header;
  if (!h) return null;
  // Logo icon may be either a raster image (logoIcon under assetPath, or
  // logoIconRoot at the repo root for sites like SPP whose logo sits in
  // `images/` rather than `assets/`), or inline SVG markup (logoSvg) for
  // sites like VI that use a path-based logo without a file. Exactly one
  // should be set per site.
  let iconHtml = '';
  if (h.logoSvg) {
    iconHtml = h.logoSvg;
  } else if (h.logoIconRoot) {
    const iconSrc = `${rootPrefix}${h.logoIconRoot}`;
    iconHtml = `<img src="${escapeAttr(iconSrc)}" alt="${escapeAttr(h.logoAlt || h.logoText || '')}">`;
  } else if (h.logoIcon) {
    const iconSrc = `${assetPrefix}${h.logoIcon}`;
    iconHtml = `<img src="${escapeAttr(iconSrc)}" alt="${escapeAttr(h.logoAlt || h.logoText || '')}">`;
  }
  const links = (h.links || []).map((link) => {
    const classes = [];
    if (link.className) classes.push(link.className);
    if (link.hideMobile) classes.push('hide-mobile');
    const classAttr = classes.length ? ` class="${escapeAttr(classes.join(' '))}"` : '';
    const targetAttr = link.newTab ? ' target="_blank" rel="noopener"' : '';
    return `        <a href="${escapeAttr(link.href)}"${classAttr}${targetAttr}>${escapeHtml(link.label)}</a>`;
  }).join('\n');
  return [
    '<header class="site-header">',
    '  <div class="header-inner">',
    '    <div style="display:flex;align-items:center;gap:1rem">',
    '      <button class="menu-toggle" aria-label="Open menu"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>',
    `      <a href="${escapeAttr(rootPrefix)}" class="header-logo">`,
    `        <div class="header-logo-icon">${iconHtml}</div>`,
    `        <div class="header-logo-text">${escapeHtml(h.logoText || site.title)}</div>`,
    '      </a>',
    '    </div>',
    '    <div class="header-links">',
    links,
    '    </div>',
    '  </div>',
    '</header>',
  ].join('\n');
}

function buildSidebarHtml({ site, rootPrefix, pagePath }) {
  if (!site.nav) return null;
  const normalizedPage = normalizePath(pagePath);
  // VI uses absolute hrefs (e.g. /page/), others use relative (./ or ../../).
  // navStyle="absolute" overrides the rootPrefix-based path-building.
  const useAbsolute = site.navStyle === 'absolute';

  const renderItem = (item) => {
    const itemPath = normalizePath('/' + item.href);
    const isActive = itemPath === normalizedPage;
    const cls = isActive ? 'nav-link active' : 'nav-link';
    const href = useAbsolute
      ? (item.href ? `/${item.href}` : '/')
      : (item.href ? `${rootPrefix}${item.href}` : rootPrefix);
    let html = `    <a href="${escapeAttr(href)}" class="${cls}">${escapeHtml(item.label)}</a>`;
    if (Array.isArray(item.children) && item.children.length) {
      const children = item.children.map((child) => {
        const childPath = normalizePath('/' + child.href);
        const childActive = childPath === normalizedPage;
        const ccls = childActive ? 'nav-link active' : 'nav-link';
        const chref = useAbsolute
          ? (child.href ? `/${child.href}` : '/')
          : (child.href ? `${rootPrefix}${child.href}` : rootPrefix);
        return `      <a href="${escapeAttr(chref)}" class="${ccls}">${escapeHtml(child.label)}</a>`;
      }).join('\n');
      html += `\n    <div class="nav-child">\n${children}\n    </div>`;
    }
    return html;
  };

  const groups = site.nav.map((group) => {
    const items = (group.items || []).map(renderItem).join('\n');
    return [
      '  <nav class="nav-group">',
      `    <div class="nav-group-title">${escapeHtml(group.title)}</div>`,
      items,
      '  </nav>',
    ].join('\n');
  }).join('\n');

  const cta = site.sidebarCta;
  let ctaHtml = '';
  if (cta) {
    const renderCtaLink = (link, cls) => {
      if (!link) return '';
      const target = link.newTab ? ' target="_blank" rel="noopener"' : '';
      const label = cls === 'cta-tertiary' ? `${escapeHtml(link.label)} &rsaquo;` : escapeHtml(link.label);
      return `    <a href="${escapeAttr(link.href)}" class="${cls}"${target}>${label}</a>`;
    };
    ctaHtml = [
      '  <div class="sidebar-cta">',
      `    <div class="sidebar-cta-label">${escapeHtml(cta.label)}</div>`,
      renderCtaLink(cta.primary, 'cta-primary'),
      renderCtaLink(cta.secondary, 'cta-secondary'),
      renderCtaLink(cta.tertiary, 'cta-tertiary'),
      '  </div>',
    ].filter(Boolean).join('\n');
  }

  return [
    '<aside class="sidebar">',
    groups,
    ctaHtml,
    '</aside>',
  ].filter(Boolean).join('\n');
}

// Replace the contents of a markered region, or the first match of a fallback
// regex if no markers are present. Returns { html, replaced }.
function replaceMarkeredRegion(html, startMarker, endMarker, fallbackRegex, generated) {
  const startIdx = html.indexOf(startMarker);
  if (startIdx !== -1) {
    const endIdx = html.indexOf(endMarker, startIdx);
    if (endIdx !== -1) {
      const before = html.slice(0, startIdx + startMarker.length);
      const after = html.slice(endIdx);
      return { html: `${before}\n${generated}\n${after}`, replaced: true };
    }
  }
  const m = fallbackRegex.exec(html);
  if (!m) return { html, replaced: false };
  const before = html.slice(0, m.index);
  const after = html.slice(m.index + m[0].length);
  return {
    html: `${before}${startMarker}\n${generated}\n${endMarker}${after}`,
    replaced: true,
  };
}

export function injectHeader(html, { site, assetPrefix, rootPrefix }) {
  const generated = buildHeaderHtml({ site, assetPrefix, rootPrefix });
  if (!generated) return html;
  const fallback = /<header\s+class="site-header"[\s\S]*?<\/header>/i;
  const res = replaceMarkeredRegion(
    html,
    HEADER_START_MARKER,
    HEADER_END_MARKER,
    fallback,
    generated,
  );
  if (res.replaced) return res.html;
  // No marker and no existing header — first-time install on a site that
  // had no header markup at all (e.g. SPP). Insert after `<body>` and add
  // the `sidebar-overlay` sibling that the drawer JS expects. Markers go at
  // column 0 so the second-run `replaceMarkeredRegion` call (which preserves
  // text starting at the end marker) reproduces identical bytes.
  const bodyMatch = /<body[^>]*>/i.exec(html);
  if (!bodyMatch) return html;
  const insertion = `\n${HEADER_START_MARKER}\n${generated}\n${HEADER_END_MARKER}\n<div class="sidebar-overlay"></div>`;
  return (
    html.slice(0, bodyMatch.index + bodyMatch[0].length)
    + insertion
    + html.slice(bodyMatch.index + bodyMatch[0].length)
  );
}

// SPP historically used `assets/components.js` to inject header+sidebar at
// runtime. Now that the build pipeline emits static HTML for both blocks,
// the runtime injector would produce duplicates. This drops the script tag.
// Idempotent on pages that don't reference it. The `script.js` file remains
// — it still owns the menu-toggle drawer behavior.
export function stripComponentsJsReference(html) {
  return html.replace(
    /\s*<script\b[^>]*src="[^"]*assets\/components\.js[^"]*"[^>]*><\/script>/gi,
    '',
  );
}

// Policy: docs sites must not host Freemius checkout JS — they link to the
// pricing page only. This strips any inline Freemius checkout block that
// loaded https://checkout.freemius.com/js/v1/ and the IIFE binding the
// `.fs-download-btn` click handler. Idempotent on already-clean pages.
//
// Both patterns use a tempered greedy token `(?:(?!<\/script>)[\s\S])*?` so
// the match cannot span across an intermediate `</script>` boundary — that
// would swallow the entire page if multiple `<script>` blocks live between
// the opener and our marker.
export function stripFreemiusCheckout(html) {
  let out = html;
  // Remove the script tag loading Freemius checkout JS.
  out = out.replace(
    /\s*<script[^>]*src="[^"]*checkout\.freemius\.com[^"]*"[^>]*><\/script>/gi,
    '',
  );
  // Remove the IIFE block that wires the Freemius handler. Anchored on the
  // unique `openFreemiusCheckout` symbol so we don't eat unrelated scripts.
  out = out.replace(
    /\s*<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?openFreemiusCheckout(?:(?!<\/script>)[\s\S])*?<\/script>/gi,
    '',
  );
  // Drop the `id="fs-download-nav"` lingering on download buttons that no
  // longer have a handler.
  out = out.replace(/\s+id="fs-download-nav"/g, '');
  return out;
}

export function injectSidebar(html, { site, rootPrefix, pagePath }) {
  const generated = buildSidebarHtml({ site, rootPrefix, pagePath });
  if (!generated) return html;
  const fallback = /<aside\s+class="sidebar"[\s\S]*?<\/aside>/i;
  const res = replaceMarkeredRegion(
    html,
    SIDEBAR_START_MARKER,
    SIDEBAR_END_MARKER,
    fallback,
    generated,
  );
  if (res.replaced) return res.html;
  // No marker and no existing sidebar — insert inside `<div class="site-layout">`
  // immediately before `<main>`. Markers at column 0 for re-run idempotency.
  const layoutMatch = /<div\s+class="site-layout"[^>]*>\s*/i.exec(html);
  if (!layoutMatch) return html;
  const after = layoutMatch.index + layoutMatch[0].length;
  const insertion = `${SIDEBAR_START_MARKER}\n${generated}\n${SIDEBAR_END_MARKER}\n`;
  return html.slice(0, after) + insertion + html.slice(after);
}

export function syncSharedAssets(sharedRoot, repoRoot, site) {
  const assetDir = site.assetPath ? path.join(repoRoot, site.assetPath) : repoRoot;
  fs.mkdirSync(assetDir, { recursive: true });
  for (const file of ['contextual-menu.js', 'contextual-menu.css']) {
    fs.copyFileSync(
      path.join(sharedRoot, 'assets', file),
      path.join(assetDir, file),
    );
  }
}

export function injectPage(html, { site, assetPrefix, pagePath }) {
  const mcpUrl = `${site.origin}/mcp`;
  const markdownHref = './index.md';
  const cssHref = `${assetPrefix}contextual-menu.css?v=${ASSET_VERSION}`;
  const jsHref = `${assetPrefix}contextual-menu.js?v=${ASSET_VERSION}`;

  let out = html;

  if (!out.includes(HEAD_MARKERS.meta)) {
    const headInject = [
      HEAD_MARKERS.alternate,
      `<link rel="alternate" type="text/markdown" href="${markdownHref}" title="Markdown for AI agents">`,
      HEAD_MARKERS.meta,
      `<meta name="gp-docs-mcp" content="${mcpUrl}">`,
      HEAD_MARKERS.config,
      `<script>window.__GP_DOCS__=${JSON.stringify({
        origin: site.origin,
        title: site.title,
        productName: site.productName,
        mcpUrl,
        mcpName: site.mcpName,
        setupSkillUrl: site.setupSkillUrl || null,
        pagePath,
      })};</script>`,
      `<link rel="stylesheet" href="${cssHref}">`,
    ].join('\n  ');
    out = out.replace('</head>', `  ${headInject}\n</head>`);
  } else {
    out = out.replace(
      /<link rel="alternate" type="text\/markdown" href="[^"]*"/,
      `<link rel="alternate" type="text/markdown" href="${markdownHref}"`,
    );
    out = out.replace(
      /<meta name="gp-docs-mcp" content="[^"]*">/,
      `<meta name="gp-docs-mcp" content="${mcpUrl}">`,
    );
    out = out.replace(
      /<script>window\.__GP_DOCS__=[^<]*<\/script>/,
      `<script>window.__GP_DOCS__=${JSON.stringify({
        origin: site.origin,
        title: site.title,
        productName: site.productName,
        mcpUrl,
        mcpName: site.mcpName,
        setupSkillUrl: site.setupSkillUrl || null,
        pagePath,
      })};</script>`,
    );
    out = out.replace(
      /<link rel="stylesheet" href="[^"]*contextual-menu\.css[^"]*">/,
      `<link rel="stylesheet" href="${cssHref}">`,
    );
  }

  if (!out.includes(SCRIPT_MARKER)) {
    const scriptBlock = [
      SCRIPT_MARKER,
      `<script src="${jsHref}"></script>`,
    ].join('\n    ');
    out = out.replace(/<\/body>/i, `    ${scriptBlock}\n</body>`);
  } else {
    out = out.replace(
      /<script src="[^"]*contextual-menu\.js[^"]*"><\/script>/,
      `<script src="${jsHref}"></script>`,
    );
  }

  return out;
}

export function patchStylesheet(repoRoot, site) {
  const cssPath = site.assetPath
    ? path.join(repoRoot, site.assetPath, 'style.css')
    : path.join(repoRoot, 'style.css');
  if (!fs.existsSync(cssPath)) return;
  let css = fs.readFileSync(cssPath, 'utf8');
  const marker = '/* gp-docs: page-header contextual menu */';
  if (css.includes(marker)) return;
  css += `

${marker}
.page-header-main {
    min-width: 0;
}
.page-header .page-title-row + .page-description {
    margin-top: 0;
}
`;
  fs.writeFileSync(cssPath, css);
}

export function writeHtaccess(repoRoot) {
  const htaccessPath = path.join(repoRoot, '.htaccess');
  const marker = '# gp-docs markdown';
  if (fs.existsSync(htaccessPath) && fs.readFileSync(htaccessPath, 'utf8').includes(marker)) {
    return;
  }
  const rules = `
${marker}
<IfModule mod_mime.c>
  AddType text/markdown .md
</IfModule>
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTP:Accept} text/markdown [NC]
  RewriteCond %{REQUEST_FILENAME}index.md -f
  RewriteRule ^(.*)$ $1index.md [L]
</IfModule>
`;
  fs.appendFileSync(htaccessPath, rules);
}

export { ASSET_VERSION };
