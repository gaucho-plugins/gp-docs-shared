#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'mcp-worker', 'wrangler.jsonc'), 'utf8'));
const paymentPageConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'sites', 'pp.json'), 'utf8'));
const patterns = workerConfig.routes.map((route) => route.pattern);

assert.equal(new Set(patterns).size, patterns.length, 'MCP Worker route patterns must be unique');
assert.equal(paymentPageConfig.hostname, 'docs.paymentpageplugin.com');
assert.equal(paymentPageConfig.origin, 'https://docs.paymentpageplugin.com');

for (const suffix of ['/mcp', '/.well-known/mcp']) {
  const pattern = `${paymentPageConfig.hostname}${suffix}`;
  const route = workerConfig.routes.find((candidate) => candidate.pattern === pattern);
  assert.ok(route, `Missing Payment Page MCP Worker route: ${pattern}`);
  assert.equal(route.zone_name, 'paymentpageplugin.com');
}

for (const route of workerConfig.routes) {
  assert.ok(route.pattern.endsWith('/mcp') || route.pattern.endsWith('/.well-known/mcp'), `Unexpected MCP route shape: ${route.pattern}`);
}

console.log('PASS: Payment Page MCP and discovery routes are present and uniquely scoped to paymentpageplugin.com.');
