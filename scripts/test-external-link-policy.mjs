#!/usr/bin/env node
import assert from 'node:assert/strict';
import { enforceExternalLinkPolicy } from './lib/inject-html.mjs';

const optedIn = {
  origin: 'https://docs.paymentpageplugin.com',
  externalLinksNewTab: true,
};
const original = [
  '<a href="/relative/">Relative</a>',
  '<a href="#section">Fragment</a>',
  '<a href="https://docs.paymentpageplugin.com/current/">Same origin</a>',
  '<a href="http://docs.paymentpageplugin.com/different-scheme/">Different origin</a>',
  '<a href="https://docs.paymentpageplugin.com:8443/different-port/">Different port</a>',
  '<a href="https://wordpress.org/plugins/payment-page/">External</a>',
  '<a href="https://example.com/" target="_self" rel="ugc noopener">Existing attributes</a>',
].join('');

const patched = enforceExternalLinkPolicy(original, { site: optedIn });
assert.match(patched, /<a href="\/relative\/">Relative<\/a>/);
assert.match(patched, /<a href="#section">Fragment<\/a>/);
assert.match(patched, /<a href="https:\/\/docs\.paymentpageplugin\.com\/current\/">Same origin<\/a>/);
assert.match(patched, /href="http:\/\/docs\.paymentpageplugin\.com\/different-scheme\/" target="_blank" rel="noopener noreferrer"/);
assert.match(patched, /href="https:\/\/docs\.paymentpageplugin\.com:8443\/different-port\/" target="_blank" rel="noopener noreferrer"/);
assert.match(patched, /href="https:\/\/wordpress\.org\/plugins\/payment-page\/" target="_blank" rel="noopener noreferrer"/);
assert.match(patched, /href="https:\/\/example\.com\/" target="_blank" rel="ugc noopener noreferrer"/);
assert.equal(enforceExternalLinkPolicy(patched, { site: optedIn }), patched, 'external-link policy must be idempotent');
assert.equal(enforceExternalLinkPolicy(original, { site: { ...optedIn, externalLinksNewTab: false } }), original, 'sites that do not opt in must remain byte-stable');

console.log('PASS: external-link policy handles exact origins, secure attributes, idempotency, and non-opted-in sites.');
