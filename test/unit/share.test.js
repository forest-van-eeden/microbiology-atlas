// Tests for the report-sharing Function (QA matrix Q11–Q14) with a fake
// AgentMail and an in-memory KV namespace.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../../dist/atlas-core.js';
import { handleShare, handleStatus, handleConfig, reportLabel, confirmLabel, MAX_BODY_BYTES } from '../../functions/_lib/share.js';

const NOW = Date.UTC(2026, 9, 8, 15, 0);
const ORIGIN = 'https://atlas.example';
const SECRET = 'am_test_secret_value';

function fakeKV() {
  const m = new Map();
  return { m, get: async k => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } };
}

function env(over = {}) {
  return { SHARING_ENABLED: 'true', AGENTMAIL_API_KEY: SECRET, SHARE_LOG: fakeKV(), ...over };
}

/** Fake AgentMail: records sends; behaviour can be scripted per call. */
function fakeMail(script = []) {
  const sent = [];
  const calls = [];
  let n = 0;
  const impl = async (url, init) => {
    calls.push({ url, init });
    const step = script[n++] || 'ok';
    if (url.includes('/messages/send')) {
      if (step === 'timeout') { sent.push(JSON.parse(init.body)); throw new DOMException('aborted', 'AbortError'); }
      if (step === 'network') throw new TypeError('fetch failed');
      if (step === '500') return new Response('err', { status: 500 });
      if (step === '403') return new Response('{}', { status: 403 });
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ message_id: 'msg_' + sent.length, thread_id: 't' }), { status: 200 });
    }
    // list messages (reconciliation)
    const label = decodeURIComponent(new URL(url).searchParams.get('labels'));
    const found = sent.filter(s => s.labels.includes(label)).map((s, i) => ({ message_id: 'msg_found_' + i, labels: s.labels }));
    return new Response(JSON.stringify({ count: found.length, messages: found }), { status: 200 });
  };
  return { impl, sent, calls };
}

let idCounter = 0;
function payload(over = {}) {
  idCounter++;
  const id = 'MA-' + String(idCounter).padStart(8, '0') + '-ABCDEFGH';
  return {
    schemaVersion: '1', reportId: id, generatedAt: new Date(NOW - 1000).toISOString(), timeZone: 'America/New_York',
    item: { ...C.ITEM_DEFAULTS }, budget: { ...C.BUDGET_DEFAULTS, studentsPerSection: '20' },
    context: { institution: 'Example College <b>', course: 'BIO 205', term: 'Spring 2027', preparedBy: 'A. Coordinator', notes: 'Line 1\nLine 2' },
    review: Object.fromEntries(C.CHECKLIST.map((c, i) => [c.key, i % 2 === 0])),
    consent: { selected: true, textVersion: C.CONSENT_VERSION },
    ...over,
  };
}

function req(body, { origin = ORIGIN, headers = {}, raw } = {}) {
  const text = raw !== undefined ? raw : JSON.stringify(body);
  return new Request(ORIGIN + '/api/reports/share', {
    method: 'POST', body: text,
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}), 'cf-connecting-ip': '203.0.113.9', ...headers },
  });
}

const share = (e, mail, body, opts) => handleShare(req(body, opts), e, { fetch: mail.impl, now: () => NOW });
const statusOf = (e, mail, id, at = NOW) => handleStatus(new Request(ORIGIN + '/api/reports/status?reportId=' + id), e, { fetch: mail.impl, now: () => at });

test('config reports sharing off unless enabled flag, key and KV are all present', async () => {
  for (const e of [{}, env({ SHARING_ENABLED: 'false' }), env({ AGENTMAIL_API_KEY: '' }), env({ SHARE_LOG: undefined })]) {
    assert.deepEqual(await handleConfig(e).json(), { sharing: { enabled: false } });
  }
  const on = await handleConfig(env()).json();
  assert.equal(on.sharing.enabled, true);
  assert.equal(on.sharing.recipient, 'microbiology-atlas-team@agentmail.to');
  assert.ok(!JSON.stringify(on).includes(SECRET));
});

test('disabled service sends nothing', async () => {
  const mail = fakeMail();
  const r = await share(env({ SHARING_ENABLED: 'false' }), mail, payload());
  assert.equal(r.status, 503);
  assert.equal(mail.calls.length, 0);
});

test('Q11 accepted: fixed recipient, report rebuilt server-side and identical to the download', async () => {
  const e = env(), mail = fakeMail(), body = payload();
  const r = await share(e, mail, body);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { state: 'accepted', reportId: body.reportId, confirmation: 'none' });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(mail.sent.length, 1);
  const msg = mail.sent[0];
  assert.deepEqual(msg.to, ['microbiology-atlas-team@agentmail.to']);
  assert.equal(msg.subject, 'Shared planning report ' + body.reportId);
  assert.ok(msg.labels.includes(reportLabel(body.reportId)));
  assert.ok(!msg.subject.includes('Example College'), 'no user text in headers');
  assert.ok(!msg.text.includes('Example College') && !msg.text.includes('Line 1'), 'user text only in attachment');
  assert.match(msg.text, /Semester total: \$11,605\.00 for 60 students/);
  assert.equal(mail.calls[0].init.headers.authorization, 'Bearer ' + SECRET);
  assert.match(mail.calls[0].url, /^https:\/\/api\.agentmail\.to\/v0\/inboxes\/microbiology-atlas-team%40agentmail\.to\/messages\/send$/);

  const att = msg.attachments[0];
  assert.equal(att.content_type, 'text/html');
  const html = new TextDecoder().decode(Uint8Array.from(atob(att.content), c => c.charCodeAt(0)));
  // What the visitor downloaded: same inputs rendered in the browser.
  const local = C.buildSnapshot({ itemRaw: body.item, budgetRaw: body.budget, contextRaw: body.context, checklist: body.review, reportId: body.reportId, generatedAt: body.generatedAt });
  assert.equal(html, C.renderReportHtml(local.snapshot, { timeZone: body.timeZone }));
  assert.equal(att.filename, C.reportFilename(local.snapshot));
  assert.ok(html.includes('Example College &lt;b&gt;'));

  // KV keeps only state, never report contents.
  const stored = [...e.SHARE_LOG.m.values()].join(' ');
  assert.ok(!stored.includes('Example College') && !stored.includes('BIO 205') && !stored.includes(SECRET));
});

test('Q12 duplicate click: second request with the same report id does not resend', async () => {
  const e = env(), mail = fakeMail(), body = payload();
  await share(e, mail, body);
  const again = await share(e, mail, body);
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { state: 'accepted', reportId: body.reportId, duplicate: true, confirmation: 'none' });
  assert.equal(mail.sent.length, 1);
});

test('Q12 in-flight duplicate gets pending, not a second send', async () => {
  const e = env(), mail = fakeMail(), body = payload();
  await e.SHARE_LOG.put('report:' + body.reportId, JSON.stringify({ state: 'sending', updatedAt: new Date(NOW - 5000).toISOString() }));
  const r = await share(e, mail, body);
  assert.equal(r.status, 202);
  assert.equal((await r.json()).state, 'pending');
  assert.equal(mail.calls.length, 0);
});

test('Q12 timeout → uncertain; status reconciles with the provider instead of resending', async () => {
  const e = env(), mail = fakeMail(['timeout']), body = payload();
  const r = await share(e, mail, body);
  assert.equal(r.status, 202);
  assert.equal((await r.json()).state, 'uncertain');
  // The provider actually got it (fake records it). Status lookup finds it by label.
  const s = await statusOf(e, mail, body.reportId);
  assert.deepEqual(await s.json(), { state: 'accepted', reportId: body.reportId });
  const retry = await share(e, mail, body);
  assert.equal((await retry.json()).duplicate, true);
  assert.equal(mail.sent.length, 1, 'never sent twice');
});

test('uncertain send that never arrived becomes failed and may be retried once', async () => {
  const e = env(), mail = fakeMail(['network']), body = payload();
  assert.equal((await (await share(e, mail, body)).json()).state, 'uncertain');
  assert.deepEqual(await (await statusOf(e, mail, body.reportId)).json(), { state: 'failed', reportId: body.reportId });
  const retry = await share(e, mail, body);
  assert.equal((await retry.json()).state, 'accepted');
  assert.equal(mail.sent.length, 1);
});

test('stale "sending" record is reconciled on retry', async () => {
  const e = env(), mail = fakeMail(), body = payload();
  await e.SHARE_LOG.put('report:' + body.reportId, JSON.stringify({ state: 'sending', updatedAt: new Date(NOW - 10 * 60000).toISOString() }));
  const r = await share(e, mail, body);
  assert.equal((await r.json()).state, 'accepted');
  assert.equal(mail.sent.length, 1, 'not found at provider → treated as failed → sent once');
});

test('Q13 provider unavailable: 5xx is uncertain, 4xx is a visible failure', async () => {
  const e = env();
  const a = await share(e, fakeMail(['500']), payload());
  assert.equal((await a.json()).state, 'uncertain');
  const b = await share(e, fakeMail(['403']), payload());
  assert.equal(b.status, 502);
  assert.equal((await b.json()).error, 'email_unavailable');
});

test('Q14 tampering and malformed requests are rejected without sending', async () => {
  const cases = [
    ['extra recipient field', p => ({ ...p, recipient: 'attacker@example.com' }), 400, 'invalid_input'],
    ['client totals', p => ({ ...p, totals: { totalCents: 1 } }), 400, 'invalid_input'],
    ['extra item field', p => ({ ...p, item: { ...p.item, costCents: '1' } }), 400, 'invalid_input'],
    ['number instead of string', p => ({ ...p, item: { ...p.item, packPrice: 60 } }), 400, 'invalid_input'],
    ['uploaded html', p => ({ ...p, html: '<p>x</p>' }), 400, 'invalid_input'],
    ['invalid values', p => ({ ...p, budget: { ...p.budget, sections: '0' } }), 400, 'invalid_input'],
    ['consent unticked', p => ({ ...p, consent: { selected: false, textVersion: C.CONSENT_VERSION } }), 400, 'missing_consent'],
    ['consent missing', p => { const { consent, ...rest } = p; return rest; }, 400, 'invalid_input'],
    ['old consent text', p => ({ ...p, consent: { selected: true, textVersion: '2020-01-01' } }), 409, 'consent_outdated'],
    ['wrong schema', p => ({ ...p, schemaVersion: '0' }), 400, 'unsupported_version'],
    ['bad report id', p => ({ ...p, reportId: 'MA-<script>' }), 400, 'invalid_input'],
    ['bad time zone', p => ({ ...p, timeZone: 'Mars/Olympus' }), 400, 'invalid_input'],
    ['old timestamp', p => ({ ...p, generatedAt: new Date(NOW - 3 * 86400000).toISOString() }), 400, 'invalid_input'],
    ['notes too long', p => ({ ...p, context: { ...p.context, notes: 'n'.repeat(4001) } }), 400, 'invalid_input'],
  ];
  for (const [label, mutate, status, error] of cases) {
    const mail = fakeMail();
    const r = await share(env(), mail, mutate(payload()));
    assert.equal(r.status, status, label);
    assert.equal((await r.json()).error, error, label);
    assert.equal(mail.calls.length, 0, label + ': nothing sent');
  }
});

test('cross-origin, non-JSON, malformed and oversized requests are rejected', async () => {
  const mail = fakeMail();
  assert.equal((await share(env(), mail, payload(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await share(env(), mail, payload(), { origin: null })).status, 403);
  assert.equal((await share(env(), mail, payload(), { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await share(env(), mail, null, { raw: '{not json' })).status, 400);
  const big = payload(); big.context.notes = 'x'.repeat(MAX_BODY_BYTES);
  assert.equal((await share(env(), mail, big)).status, 413);
  assert.equal(mail.calls.length, 0);
});

test('rate limit: six reports from one address in an hour → 429 on the sixth', async () => {
  const e = env(), mail = fakeMail();
  for (let i = 0; i < 5; i++) assert.equal((await share(e, mail, payload())).status, 200);
  const r = await share(e, mail, payload());
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '3600');
  assert.equal(mail.sent.length, 5);
  assert.ok(![...e.SHARE_LOG.m.keys()].some(k => k.includes('203.0.113.9')), 'raw IP never stored');
});

test('status endpoint validates ids and never leaks contents', async () => {
  const e = env(), mail = fakeMail(), body = payload();
  assert.equal((await statusOf(e, mail, 'nope')).status, 400);
  assert.equal((await statusOf(e, mail, body.reportId)).status, 404);
  await share(e, mail, body);
  const s = await (await statusOf(e, mail, body.reportId)).text();
  assert.equal(s, JSON.stringify({ state: 'accepted', reportId: body.reportId }));
});

// ---------- optional confirmation email ----------

test('confirmation: one fixed-text receipt to the visitor; team email gets Reply-To', async () => {
  const e = env(), mail = fakeMail(), body = payload({ contactEmail: ' Coordinator@Example.EDU ' });
  const r = await share(e, mail, body);
  assert.deepEqual(await r.json(), { state: 'accepted', reportId: body.reportId, confirmation: 'sent' });
  assert.equal(mail.sent.length, 2);
  const [team, receipt] = mail.sent;
  assert.deepEqual(team.reply_to, ['Coordinator@example.edu']);
  assert.match(team.text, /Confirmation requested: the visitor gave Coordinator@example\.edu/);
  assert.deepEqual(receipt.to, ['Coordinator@example.edu']);
  assert.equal(receipt.subject, 'Microbiology Atlas received your report ' + body.reportId);
  assert.ok(receipt.labels.includes(confirmLabel(body.reportId)));
  assert.ok(!receipt.labels.includes(reportLabel(body.reportId)), 'receipt never mistaken for the team copy during reconciliation');
  assert.equal(receipt.attachments, undefined, 'no attachment');
  assert.equal(receipt.html, undefined, 'plain text only');
  for (const userText of ['Example College', 'BIO 205', 'Line 1', 'A. Coordinator']) assert.ok(!receipt.text.includes(userText), 'no visitor-written content: ' + userText);
  assert.ok(receipt.text.includes(body.reportId));
  const stored = [...e.SHARE_LOG.m.entries()];
  assert.ok(!stored.some(([k, v]) => /coordinator/i.test(k + v)), 'address never stored in KV');
});

test('confirmation: never resent on a duplicate request', async () => {
  const e = env(), mail = fakeMail(), body = payload({ contactEmail: 'a@b.edu' });
  await share(e, mail, body);
  const again = await (await share(e, mail, body)).json();
  assert.equal(again.duplicate, true);
  assert.equal(again.confirmation, 'sent');
  assert.equal(mail.sent.length, 2);
});

test('confirmation failure does not affect the report outcome or cause a resend', async () => {
  const e = env(), mail = fakeMail(['ok', '403']), body = payload({ contactEmail: 'a@b.edu' });
  const r = await (await share(e, mail, body)).json();
  assert.deepEqual(r, { state: 'accepted', reportId: body.reportId, confirmation: 'failed' });
  const again = await (await share(e, mail, body)).json();
  assert.equal(again.duplicate, true);
  assert.equal(mail.sent.length, 1, 'only the team copy; no retry storm');
});

test('confirmation limit: at most 3 receipts per address per day', async () => {
  const e = env(), mail = fakeMail();
  const results = [];
  for (let i = 0; i < 4; i++) {
    const req = handleShare(new Request(ORIGIN + '/api/reports/share', {
      method: 'POST', body: JSON.stringify(payload({ contactEmail: 'victim@example.com' })),
      headers: { 'content-type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '198.51.100.' + i },
    }), e, { fetch: mail.impl, now: () => NOW });
    results.push((await (await req).json()).confirmation);
  }
  assert.deepEqual(results, ['sent', 'sent', 'sent', 'limited']);
  assert.equal(mail.sent.filter(m => m.to[0] === 'victim@example.com').length, 3);
  assert.equal(mail.sent.filter(m => m.to[0] === 'microbiology-atlas-team@agentmail.to').length, 4, 'reports still delivered');
});

test('invalid or injected contact addresses are rejected before anything is sent', async () => {
  for (const bad of ['not-an-email', 'a@b.com, c@d.com', 'a@b.com\nBcc: x@y.com', '<a@b.com>', 'x'.repeat(250) + '@b.com', 42]) {
    const mail = fakeMail();
    const r = await share(env(), mail, payload({ contactEmail: bad }));
    assert.equal(r.status, 400, String(bad));
    assert.equal((await r.json()).error, 'invalid_contact');
    assert.equal(mail.calls.length, 0);
  }
});

test('blank contact address is the same as none', async () => {
  const mail = fakeMail();
  const r = await (await share(env(), mail, payload({ contactEmail: '' }))).json();
  assert.equal(r.confirmation, 'none');
  assert.equal(mail.sent.length, 1);
  assert.equal(mail.sent[0].reply_to, undefined);
});
