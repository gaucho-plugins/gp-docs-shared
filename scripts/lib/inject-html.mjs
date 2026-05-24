import fs from 'node:fs';
import path from 'node:path';

const ASSET_VERSION = '20260524-002';

const HEAD_MARKERS = {
  alternate: '<!-- gp-docs:alternate -->',
  meta: '<!-- gp-docs:meta -->',
  config: '<!-- gp-docs:config -->',
};

const SCRIPT_MARKER = '<!-- gp-docs:scripts -->';

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
