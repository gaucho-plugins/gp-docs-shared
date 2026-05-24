(function () {
  'use strict';

  var cfg = window.__GP_DOCS__ || {};
  var markdownCache = null;

  var ICONS = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    markdown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
    chatgpt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.82a5.8 5.8 0 0 0-.52-4.74 5.86 5.86 0 0 0-6.31-2.82A5.86 5.86 0 0 0 11.08.82a5.87 5.87 0 0 0-5.58 4.05A5.86 5.86 0 0 0 .82 9.82a5.8 5.8 0 0 0 .72 6.84 5.86 5.86 0 0 0 6.31 2.82 5.86 5.86 0 0 0 4.37 1.84 5.87 5.87 0 0 0 5.58-4.05 5.86 5.86 0 0 0 4.68-3.23 5.8 5.8 0 0 0-.38-3.22zm-9.9 10.5a4.4 4.4 0 0 1-2.82-1.02l.14-.08 4.74-2.73a.77.77 0 0 0 .38-.66v-6.66l2 1.16a.07.07 0 0 1 .04.06v5.52a4.42 4.42 0 0 1-4.48 4.41zm-9.48-4.05a4.38 4.38 0 0 1-.52-2.95 4.4 4.4 0 0 1 2.28-3.24l.14.08 4.74 2.73a.77.77 0 0 0 .76 0l5.78-3.34v2.32a.07.07 0 0 1-.03.05l-4.78 2.76a4.42 4.42 0 0 1-4.37 0L2.9 13.38a4.36 4.36 0 0 1-.1-.11zm-1.14-9.9a4.4 4.4 0 0 1 2.32-1.94 4.42 4.42 0 0 1 3.38-.02l-.14.08-4.74 2.73a.77.77 0 0 0-.38.66v5.52l-2-1.16a.07.07 0 0 1-.04-.06V6.37zm16.58 3.86l-5.78-3.34 2-1.16a.07.07 0 0 1 .07 0l4.78 2.76a4.4 4.4 0 0 1 1.68 1.5 4.38 4.38 0 0 1 .52 2.95l-.14-.08a.77.77 0 0 0-.76 0zm1.9-2.88L16.94 7.5V1.98a.07.07 0 0 1 .04-.06 4.42 4.42 0 0 1 3.38.02 4.4 4.4 0 0 1 2.32 3.94 4.36 4.36 0 0 1-.9 2.5zM7.06 16.5l5.78 3.34-2 1.16a.07.07 0 0 1-.07 0l-4.78-2.76a4.4 4.4 0 0 1-1.68-1.5 4.38 4.38 0 0 1-.52-2.95l.14.08a.77.77 0 0 0 .76 0z"/></svg>',
    claude: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.158-.097-2.636-1.54V9.72l2.55 1.463 2.636 1.463.158.097h2.636l-4.72 2.647-.08.23.08.128h.79l3.47-1.947 3.47 1.947h1.58l-4.72-2.647-.08-.23.08-.128 4.72-2.647h-1.58l-3.31 1.86-3.31-1.86H4.709zm15.28-3.82l-4.72 2.647-.08.23.08.128h.79l3.47-1.947 3.47 1.947h1.58l-4.72-2.647-.08-.23.08-.128 4.72-2.647h-1.58l-3.31 1.86-3.31-1.86h-1.58l4.72 2.647.08.23-.08.128h-.79l-3.47-1.947-3.47 1.947H4.709l4.72-2.647.08-.23-.08-.128H9.2l3.31 1.86 3.31-1.86h1.58z"/></svg>',
    mcp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    vscode: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 2.5 9 10 3.5 5.5 2 7l5.5 5.5L2 18l1.5 1.5L9 15l8.5 7.5 3.5-1.5-7-6 7-6z"/></svg>',
    codex: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 14.5h-2v-2h2v2zm0-4h-2V7h2v5.5z"/></svg>',
    external: '<svg class="gp-contextual-external" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    skill: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
  };

  function showToast(msg) {
    var el = document.querySelector('.gp-contextual-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'gp-contextual-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function markdownUrl() {
    var link = document.querySelector('link[rel="alternate"][type="text/markdown"]');
    return link ? link.getAttribute('href') : './index.md';
  }

  function pageUrl() {
    var canonical = document.querySelector('link[rel="canonical"]');
    return canonical ? canonical.href : cfg.origin + (cfg.pagePath || '/');
  }

  function fetchMarkdown() {
    if (markdownCache) return Promise.resolve(markdownCache);
    return fetch(markdownUrl()).then(function (r) {
      if (!r.ok) throw new Error('Could not load markdown');
      return r.text();
    }).then(function (text) {
      markdownCache = text;
      return text;
    });
  }

  function aiPrompt(md) {
    return 'Read this documentation page and answer my questions about it.\n\nSource: ' + pageUrl() + '\n---\n' + md;
  }

  function truncate(text, max) {
    if (text.length <= max) return text;
    return text.slice(0, max) + '\n\n[Content truncated for URL length limits.]';
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { showToast('Copied to clipboard'); });
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Copied to clipboard');
    return Promise.resolve();
  }

  function openAi(urlBase, maxLen) {
    fetchMarkdown().then(function (md) {
      var q = encodeURIComponent(truncate(aiPrompt(md), maxLen));
      window.open(urlBase + q, '_blank', 'noopener,noreferrer');
    }).catch(function () { showToast('Could not load page markdown'); });
  }

  function mcpJsonSnippet() {
    return JSON.stringify({
      mcpServers: (function () {
        var o = {};
        o[cfg.mcpName || 'gp-docs'] = { url: cfg.mcpUrl };
        return o;
      })(),
    }, null, 2);
  }

  function vscodeSnippet() {
    return JSON.stringify({
      servers: (function () {
        var o = {};
        o[cfg.mcpName || 'gp-docs'] = { type: 'http', url: cfg.mcpUrl };
        return o;
      })(),
    }, null, 2);
  }

  function menuItem(opts) {
    var tag = opts.href ? 'a' : 'button';
    var el = document.createElement(tag);
    el.className = 'gp-contextual-item';
    el.type = opts.href ? undefined : 'button';
    if (opts.href) {
      el.href = opts.href;
      el.target = opts.external ? '_blank' : undefined;
      el.rel = opts.external ? 'noopener noreferrer' : undefined;
    }
    el.innerHTML =
      '<span class="gp-contextual-icon">' + (ICONS[opts.icon] || '') + '</span>' +
      '<span class="gp-contextual-text">' +
        '<span class="gp-contextual-title">' + opts.title + (opts.external ? ICONS.external : '') + '</span>' +
        '<span class="gp-contextual-desc">' + opts.desc + '</span>' +
      '</span>';
    if (opts.onClick) el.addEventListener('click', opts.onClick);
    return el;
  }

  function buildMenu() {
    var sections = [];

    var doc = document.createElement('div');
    doc.className = 'gp-contextual-section';
    doc.appendChild(menuItem({
      icon: 'copy', title: 'Copy page', desc: 'Copy page as Markdown for LLMs',
      onClick: function () {
        fetchMarkdown().then(copyText).catch(function () { showToast('Could not load markdown'); });
      },
    }));
    doc.appendChild(menuItem({
      icon: 'markdown', title: 'View as Markdown', desc: 'View this page as plain text', external: true,
      href: markdownUrl(), onClick: undefined,
    }));
    sections.push(doc);

    var ai = document.createElement('div');
    ai.className = 'gp-contextual-section';
    ai.appendChild(menuItem({
      icon: 'chatgpt', title: 'Open in ChatGPT', desc: 'Ask ChatGPT about this page', external: true,
      onClick: function (e) { e.preventDefault(); openAi('https://chatgpt.com/?q=', 6000); },
    }));
    ai.appendChild(menuItem({
      icon: 'claude', title: 'Open in Claude', desc: 'Ask Claude about this page', external: true,
      onClick: function (e) { e.preventDefault(); openAi('https://claude.ai/new?q=', 12000); },
    }));
    sections.push(ai);

    var mcp = document.createElement('div');
    mcp.className = 'gp-contextual-section';
    mcp.appendChild(menuItem({
      icon: 'mcp', title: 'Connect with MCP', desc: 'Add this MCP to any compatible client',
      onClick: function () { copyText(cfg.mcpUrl || ''); },
    }));
    mcp.appendChild(menuItem({
      icon: 'vscode', title: 'Connect to VS Code', desc: 'Use this MCP in VS Code',
      onClick: function () { copyText(vscodeSnippet()); },
    }));
    mcp.appendChild(menuItem({
      icon: 'claude', title: 'Connect to Claude Code', desc: 'Use this MCP in Claude Code',
      onClick: function () {
        copyText('claude mcp add --transport http ' + (cfg.mcpName || 'gp-docs') + ' ' + (cfg.mcpUrl || ''));
      },
    }));
    mcp.appendChild(menuItem({
      icon: 'codex', title: 'Connect to Codex', desc: 'Use this MCP in Codex',
      onClick: function () {
        copyText('codex mcp add ' + (cfg.mcpName || 'gp-docs') + ' --url ' + (cfg.mcpUrl || ''));
      },
    }));
    sections.push(mcp);

    if (cfg.setupSkillUrl) {
      var skill = document.createElement('div');
      skill.className = 'gp-contextual-section';
      skill.appendChild(menuItem({
        icon: 'skill', title: 'Install setup skill', desc: 'Download the setup playbook for your AI assistant',
        href: cfg.setupSkillUrl, external: false,
      }));
      sections.push(skill);
    }

    return sections;
  }

  function structurePageHeader(header) {
    var main = header.querySelector('.page-header-main');
    if (!main) {
      main = document.createElement('div');
      main.className = 'page-header-main';
      var nodes = Array.prototype.slice.call(header.childNodes);
      nodes.forEach(function (n) { main.appendChild(n); });
      header.appendChild(main);
    }

    var h1 = main.querySelector('h1');
    if (!h1) return null;

    var row = main.querySelector('.page-title-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'page-title-row';
      main.insertBefore(row, h1);
      row.appendChild(h1);
    } else if (h1.parentNode !== row) {
      row.appendChild(h1);
    }

    var existingWrap = header.querySelector('.gp-contextual-wrap');
    if (existingWrap && existingWrap.parentNode !== row) {
      row.appendChild(existingWrap);
    }

    return { header: header, titleRow: row, main: main };
  }

  function ensurePageHeader() {
    var header = document.querySelector('.page-header');
    if (header) return structurePageHeader(header);

    var content = document.querySelector('.main-content .content') || document.querySelector('.content');
    if (!content) return null;

    header = document.createElement('div');
    header.className = 'page-header';
    var main = document.createElement('div');
    main.className = 'page-header-main';

    var desc = content.querySelector('.page-description');
    var h1 = content.querySelector('h1');
    if (desc) main.appendChild(desc);

    var row = document.createElement('div');
    row.className = 'page-title-row';
    main.appendChild(row);

    if (h1) {
      row.appendChild(h1);
    } else {
      var title = document.title.replace(/\s*[|—–-]\s*[^|—–-]+$/, '').trim();
      var fallback = document.createElement('h1');
      fallback.textContent = title;
      row.appendChild(fallback);
    }

    header.appendChild(main);
    content.parentNode.insertBefore(header, content);
    return { header: header, titleRow: row, main: main };
  }

  function mount() {
    var result = ensurePageHeader();
    if (!result || !result.titleRow) return;

    var titleRow = result.titleRow;
    if (titleRow.querySelector('.gp-contextual-wrap')) return;

    var wrap = document.createElement('div');
    wrap.className = 'gp-contextual-wrap';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'gp-contextual-trigger';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.innerHTML = ICONS.copy + ' <span>Copy</span> <span class="gp-chevron"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></span>';

    var menu = document.createElement('div');
    menu.className = 'gp-contextual-menu';
    menu.setAttribute('role', 'menu');
    buildMenu().forEach(function (s) { menu.appendChild(s); });

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.classList.toggle('open');
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', function () {
      menu.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    });

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    titleRow.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
