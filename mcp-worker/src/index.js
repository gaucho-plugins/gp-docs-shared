const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'gp-docs-mcp', version: '1.0.0' };

const TOOLS = [
  {
    name: 'search_docs',
    description: 'Search documentation pages by keyword. Returns matching page titles, paths, snippets, and URLs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 8)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_page',
    description: 'Retrieve the full Markdown content of a documentation page by path (e.g. /status/running-your-first-status-check/).',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Page path starting with /' },
      },
      required: ['path'],
    },
  },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function normalizePath(p) {
  if (!p || p === '/') return '/';
  let out = p.startsWith('/') ? p : `/${p}`;
  if (!out.endsWith('/')) out += '/';
  return out;
}

function scorePage(page, terms) {
  const hay = `${page.title} ${page.description || ''} ${page.markdown}`.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (!t) continue;
    if (page.title.toLowerCase().includes(t)) score += 8;
    if ((page.path || '').toLowerCase().includes(t)) score += 4;
    const count = hay.split(t).length - 1;
    score += Math.min(count, 10);
  }
  return score;
}

function snippet(text, terms, max = 220) {
  const lower = text.toLowerCase();
  let idx = 0;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0) { idx = Math.max(0, i - 40); break; }
  }
  const slice = text.slice(idx, idx + max).replace(/\s+/g, ' ').trim();
  return slice + (text.length > idx + max ? '…' : '');
}

async function loadIndex(env, hostname) {
  const cached = await env.DOCS_INDEX.get(hostname);
  if (cached) return JSON.parse(cached);

  const origin = `https://${hostname}`;
  const res = await fetch(`${origin}/mcp-index.json`, {
    headers: { 'Accept': 'application/json' },
    cf: { cacheTtl: 300 },
  });
  if (!res.ok) throw new Error(`Index not found for ${hostname}`);
  const index = await res.json();
  await env.DOCS_INDEX.put(hostname, JSON.stringify(index), { expirationTtl: 3600 });
  return index;
}

function discovery(hostname) {
  const url = `https://${hostname}/mcp`;
  return {
    version: '1.0.0',
    transport: 'http',
    url,
    servers: [{ name: 'public', url, transport: 'http', authentication: 'none' }],
  };
}

function handleToolCall(name, args, index) {
  if (name === 'search_docs') {
    const query = String(args.query || '').trim();
    const limit = Math.min(Number(args.limit) || 8, 20);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const ranked = index.pages
      .map((page) => ({ page, score: scorePage(page, terms) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ page }) => ({
        path: page.path,
        title: page.title,
        url: page.url,
        snippet: snippet(page.markdown, terms),
      }));
    return { content: [{ type: 'text', text: JSON.stringify({ query, results: ranked }, null, 2) }] };
  }

  if (name === 'get_page') {
    const path = normalizePath(args.path);
    const page = index.pages.find((p) => normalizePath(p.path) === path);
    if (!page) {
      return { content: [{ type: 'text', text: `Page not found: ${path}` }], isError: true };
    }
    return { content: [{ type: 'text', text: page.markdown }] };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}

function listResources(index) {
  const resources = index.skills?.map((skill) => ({
    uri: skill.uri,
    name: skill.name,
    title: skill.title,
    mimeType: skill.mimeType || 'text/markdown',
    description: `${index.title} skill resource`,
  })) || [];
  return { resources };
}

function readResource(uri, index) {
  const skill = index.skills?.find((s) => s.uri === uri);
  if (!skill) throw new Error(`Resource not found: ${uri}`);
  return {
    contents: [{
      uri: skill.uri,
      mimeType: skill.mimeType || 'text/markdown',
      text: skill.body,
    }],
  };
}

async function handleMcpRequest(request, env, hostname) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id',
      },
    });
  }

  const index = await loadIndex(env, hostname);

  if (request.method === 'GET') {
    return json({
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
      title: index.title,
      tools: TOOLS.map((t) => t.name),
    });
  }

  const body = await request.json();
  const { id, method, params } = body;

  try {
    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {}, resources: {} },
          serverInfo: SERVER_INFO,
        };
        break;
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call':
        result = handleToolCall(params.name, params.arguments || {}, index);
        break;
      case 'resources/list':
        result = listResources(index);
        break;
      case 'resources/read':
        result = readResource(params.uri, index);
        break;
      case 'ping':
        result = {};
        break;
      default:
        return json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
    return json({ jsonrpc: '2.0', id, result });
  } catch (err) {
    return json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname;

    if (url.pathname === '/.well-known/mcp') {
      return json(discovery(hostname));
    }

    if (url.pathname === '/mcp' || url.pathname === '/mcp/') {
      return handleMcpRequest(request, env, hostname);
    }

    return new Response('Not found', { status: 404 });
  },
};
