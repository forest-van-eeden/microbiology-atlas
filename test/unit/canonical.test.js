import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRedirect } from '../../functions/_lib/canonical.js';

const req = (url, method = 'GET') => new Request(url, { method });

test('www and pages.dev page loads redirect permanently to the canonical domain, keeping path and query', () => {
  for (const from of ['https://www.microbiologyatlas.com/privacy?x=1#s', 'https://microbiology-atlas.pages.dev/privacy?x=1']) {
    const r = canonicalRedirect(req(from));
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), 'https://microbiologyatlas.com/privacy?x=1');
  }
});

test('canonical host, preview deployments, API calls and POSTs are not redirected', () => {
  assert.equal(canonicalRedirect(req('https://microbiologyatlas.com/about')), null);
  assert.equal(canonicalRedirect(req('https://abc123.microbiology-atlas.pages.dev/')), null);
  assert.equal(canonicalRedirect(req('https://microbiology-atlas.pages.dev/api/config')), null);
  assert.equal(canonicalRedirect(req('https://www.microbiologyatlas.com/', 'POST')), null);
  assert.equal(canonicalRedirect(req('http://127.0.0.1:8765/')), null);
});
