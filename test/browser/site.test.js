// Browser regression tests: drive dist/ in headless Chromium.
// Run: npm run test:browser   (needs the `playwright` package and a Chromium build)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
// Resolve playwright from the project or NODE_PATH (CommonJS resolution honours NODE_PATH).
const { chromium } = createRequire(import.meta.url)('playwright');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { createDevServer } from '../../scripts/dev-server.mjs';

const DIST = process.env.ATLAS_DIST || path.join(__dirname, '..', '..', 'dist');
let serverOff, serverOn, base, baseOn, browser;

// Fake AgentMail for the sharing-enabled server. `mail.script` scripts the next send outcomes.
const mail = { sent: [], script: [] };
const kv = new Map();
const envOn = {
  SHARING_ENABLED: 'true', AGENTMAIL_API_KEY: 'test-key',
  SHARE_LOG: { get: async k => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } },
};
async function fakeAgentMail(url, init) {
  if (url.includes('/messages/send')) {
    const step = mail.script.shift() || 'ok';
    if (step === 'slow') await new Promise(r => setTimeout(r, 600));
    if (step === '403') return new Response('{}', { status: 403 });
    if (step === '500') { mail.sent.push(JSON.parse(init.body)); return new Response('{}', { status: 500 }); }
    mail.sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ message_id: 'msg_' + mail.sent.length }), { status: 200 });
  }
  const label = new URL(url).searchParams.get('labels');
  const found = mail.sent.filter(m => m.labels.includes(label)).map(m => ({ message_id: 'found', labels: m.labels }));
  return new Response(JSON.stringify({ messages: found }), { status: 200 });
}

// The local server sees every test as the same IP address; clear rate-limit counters between sharing tests.
function resetRateLimits() { for (const k of [...kv.keys()]) if (k.startsWith('rl:')) kv.delete(k); }

test.before(async () => {
  serverOff = createDevServer({ dist: DIST, env: {} });
  serverOn = createDevServer({ dist: DIST, env: envOn, fetchImpl: fakeAgentMail });
  await new Promise(r => serverOff.listen(0, '127.0.0.1', r));
  await new Promise(r => serverOn.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + serverOff.address().port + '/';
  baseOn = 'http://127.0.0.1:' + serverOn.address().port + '/';
  browser = await chromium.launch();
});
test.after(async () => { await browser.close(); serverOff.close(); serverOn.close(); });

async function open(viewport = { width: 1280, height: 900 }, url = base) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, timezoneId: 'America/New_York' });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/status of 40[34]/.test(m.text())) problems.push('console: ' + m.text()); });
  page.on('dialog', d => { problems.push('dialog: ' + d.message()); d.dismiss(); });
  await page.goto(url);
  return { page, context, problems };
}

async function download(page, trigger) {
  const [dl] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const file = await dl.path();
  return { name: dl.suggestedFilename(), text: fs.readFileSync(file, 'utf8') };
}

const text = (page, sel) => page.locator(sel).textContent();

test('initial render shows example results without errors', async () => {
  const { page, context, problems } = await open();
  assert.equal(await text(page, '#buytotal'), '$180.00');
  assert.equal(await text(page, '#packs'), '3');
  assert.equal(await text(page, '#leftovers'), '2');
  assert.equal(await text(page, '#avoided'), '$60.00');
  assert.equal(await text(page, '#total'), '$12,463.00');
  assert.equal(await text(page, '#perstudent'), '$173.10');
  assert.equal(await page.locator('[aria-invalid]').count(), 0);
  assert.deepEqual(problems, []);
  await context.close();
});

test('Q03 pack size zero: totals hidden, export disabled, field error described', async () => {
  const { page, context } = await open();
  await page.fill('#packsize', '0');
  assert.equal(await text(page, '#buytotal'), '—');
  assert.equal(await page.isDisabled('#buy-export'), true);
  assert.equal(await page.getAttribute('#packsize', 'aria-invalid'), 'true');
  const describedBy = await page.getAttribute('#packsize', 'aria-describedby');
  assert.match(await text(page, '#' + describedBy), /whole number from 1/);
  await page.fill('#packsize', '6');
  assert.equal(await text(page, '#buytotal'), '$180.00');
  assert.equal(await page.getAttribute('#packsize', 'aria-invalid'), null);
  assert.equal(await page.isVisible('#packsize-error'), false);
  await context.close();
});

test('fractional stock and over-precise prices are rejected', async () => {
  const { page, context } = await open();
  await page.fill('#stock', '2.5');
  assert.equal(await text(page, '#buytotal'), '—');
  await page.fill('#stock', '8');
  await page.fill('#packprice', '19.999');
  assert.match(await text(page, '#packprice-error'), /two decimal places/);
  await page.fill('#packprice', '19.99');
  assert.equal(await text(page, '#buytotal'), '$59.97');
  await context.close();
});

test('Q06 zero enrollment blocks budget, brief and report downloads; Q07 reset restores', async () => {
  const { page, context } = await open();
  await page.fill('#students', '0');
  assert.equal(await text(page, '#total'), '—');
  assert.equal(await text(page, '#perstudent'), '—');
  assert.equal(await page.isDisabled('#download'), true);
  assert.equal(await page.isDisabled('#brief-download'), true);
  await page.click('#report-download');
  assert.match(await text(page, '#report-status'), /^Not downloaded\. .*semester budget/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'students', 'focus moves to the invalid field');
  await page.fill('#students', '12');
  assert.equal(await text(page, '#total'), '$9,889.00');
  await page.click('button[type=reset]');
  await page.waitForFunction(() => document.querySelector('#total').textContent === '$12,463.00');
  assert.equal(await page.inputValue('#students'), '24');
  await context.close();
});

test('item, CSV and brief downloads reflect current values', async () => {
  const { page, context } = await open();
  await page.fill('#itemname', 'Gram stain kits');
  await page.fill('#stock', '30');
  const md = await download(page, () => page.click('#buy-export'));
  assert.equal(md.name, 'teaching-lab-item-plan.md');
  assert.match(md.text, /existing usable stock covers the planned requirement/);
  assert.match(md.text, /\| Quoted purchase cost \(USD\) \| 0\.00 \|/);
  const csv = await download(page, () => page.click('#download'));
  assert.equal(csv.name, 'teaching-lab-budget.csv');
  assert.match(csv.text, /"Semester total \(USD\)","12463\.00"/);
  await page.check('#checks input[value=alternatives]');
  assert.equal(await text(page, '#check-status'), '1 of 8 reviewed · not saved after reload');
  const brief = await download(page, () => page.click('#brief-download'));
  assert.match(brief.text, /- \[x\] Compare alternatives/);
  await context.close();
});

test('Q08/Q09/Q10 report: fidelity, escaping, offline, and no network on download', async () => {
  const { page, context, problems } = await open();
  const hostile = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  await page.fill('#itemname', 'Agar <b>plates</b> & "loops"');
  await page.fill('#students', '20');
  await page.fill('#institution', hostile);
  await page.fill('#course', 'Microbiology 201');
  await page.fill('#reportnotes', 'Quote ref 77\nDeliver before week 3 ' + 'x'.repeat(300));
  await page.check('#checks input[value=learningObjectives]');
  await page.check('#checks input[value=approvalRoute]');

  const requests = [];
  page.on('request', r => requests.push(r.url()));
  const report = await download(page, () => page.click('#report-download'));
  assert.deepEqual(requests.filter(u => !u.startsWith('blob:')), [], 'no report data leaves the browser');
  assert.match(report.name, /^teaching-lab-purchasing-report-\d{4}-\d{2}-\d{2}-[0-9a-hjkmnp-tv-z]{8}\.html$/);
  assert.match(await text(page, '#report-status'), /^Download requested \(report MA-[0-9A-Z-]+\)\. No copy was sent to the team\./);

  const h = report.text;
  assert.ok(!h.includes('<script>') && !h.includes('<img'));
  assert.ok(h.includes('Agar &lt;b&gt;plates&lt;/b&gt; &amp; &quot;loops&quot;'));
  assert.ok(h.includes('Microbiology 201'));
  assert.ok(h.includes('$11,605.00'), 'budget total with 20 students: ' + h.match(/Semester budget total: [^<]+/));
  assert.ok(h.includes('Reviewed: Start with learning objectives') && h.includes('Reviewed: Confirm approval and order route'));
  assert.ok(h.includes('2 of 8 items reviewed'));
  assert.ok(h.includes('the item plan still uses') === false);
  assert.match(h, /EDT \(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z UTC\)/);

  // Open the report fully offline, as a phone, and check nothing executes or overflows.
  const offline = await browser.newContext({ viewport: { width: 320, height: 640 }, offline: true });
  const rp = await offline.newPage();
  const fired = [];
  rp.on('dialog', d => { fired.push(d.message()); d.dismiss(); });
  rp.on('request', r => { if (!r.url().startsWith('data:') && !r.url().startsWith('about:')) fired.push('request ' + r.url()); });
  await rp.setContent(h, { waitUntil: 'load' });
  await rp.waitForTimeout(200);
  assert.deepEqual(fired, []);
  assert.ok(await rp.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'report has no horizontal scroll at 320px');
  assert.equal(await rp.locator('.notes').evaluate(n => n.textContent.split('\n').length), 2, 'note line breaks preserved');
  const pdf = await rp.pdf({ format: 'Letter' });
  assert.ok(pdf.length > 10000, 'report prints');
  await offline.close();
  assert.deepEqual(problems, []);
  await context.close();
});

test('report blocked by invalid item focuses the item field', async () => {
  const { page, context } = await open();
  await page.fill('#itemname', '   ');
  await page.click('#report-download');
  assert.match(await text(page, '#report-status'), /item planner/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'itemname');
  await context.close();
});

test('totals too large to be exact are refused with a message', async () => {
  const { page, context } = await open();
  await page.fill('#requiredunits', '1000000');
  await page.fill('#stock', '0');
  await page.fill('#packsize', '1');
  await page.fill('#packprice', '100000000');
  assert.equal(await text(page, '#buytotal'), '—');
  assert.match(await text(page, '#buy-explanation'), /too large to calculate exactly/);
  await context.close();
});

test('Q16 phone width: no horizontal scroll, even with long values', async () => {
  const { page, context } = await open({ width: 320, height: 700 });
  await page.fill('#itemname', 'Extraordinarily-long-resource-name-without-spaces-'.repeat(2).slice(0, 100));
  await page.fill('#requiredunits', '1000000');
  await page.fill('#stock', '0');
  await page.fill('#packsize', '1');
  await page.fill('#packprice', '9000000');
  await page.fill('#equipment', '99999999.99');
  const overflow = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > vw + 1 || r.left < -1) && !el.closest('.skip, .visually-hidden');
    }).map(el => el.tagName + (el.id ? '#' + el.id : '') + '.' + el.className).slice(0, 8);
    return { scroll: document.documentElement.scrollWidth, vw, wide };
  });
  assert.ok(overflow.scroll <= overflow.vw, JSON.stringify(overflow));
  await context.close();
});

test('Q15 keyboard: skip link is first and moves to main content', async () => {
  const { page, context } = await open();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Skip to main content');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  await context.close();
});

test('checklist values match the shared checklist definition', async () => {
  const { page, context } = await open();
  const keys = await page.$$eval('#checks input', els => els.map(e => e.value));
  const core = (await import('../../dist/atlas-core.js')).CHECKLIST.map(c => c.key);
  assert.deepEqual(keys, core);
  await context.close();
});

const CONTRAST = () => {
    const parse = c => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] === undefined ? 1 : m[3] }; };
    const lum = ({ r, g, b }) => [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    function background(el) {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.backgroundImage !== 'none' && n !== el) return null; // gradients: skip
        const c = parse(cs.backgroundColor);
        if (c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (const l of layers.reverse()) bg = blend(l, bg);
      return bg;
    }
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (!walker.currentNode.textContent.trim() || seen.has(el)) continue;
      seen.add(el);
      if (el.closest('[aria-hidden=true], .visually-hidden, [hidden], .skip, button:disabled')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const bg = background(el);
      if (!bg) continue;
      let opacity = 1;
      for (let n = el; n; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      const fg0 = parse(cs.color);
      const fg = blend({ ...fg0, a: fg0.a * opacity }, bg);
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const need = large ? 3 : 4.5;
      if (ratio < need) out.push(`${ratio.toFixed(2)} < ${need}: ${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 40)}"`);
    }
    return out;
  };

test('text contrast meets WCAG AA (computed in page)', async () => {
  const { page, context } = await open();
  await page.fill('#packsize', '0'); // render an error state too
  await page.locator('#packsize').blur();
  const failures = await page.evaluate(CONTRAST);
  assert.deepEqual(failures, []);
  await context.close();
});

// ---------- sharing (fake AgentMail behind the real Function code) ----------

async function fillReport(page) {
  await page.fill('#institution', 'Example College');
  await page.fill('#course', 'BIO 205');
  await page.fill('#reportnotes', 'Line one\nLine two');
  await page.check('#checks input[value=alternatives]');
}
const decode = b64 => Buffer.from(b64, 'base64').toString('utf8');

test('sharing not configured: no checkbox, download works, no report sent', async () => {
  const { page, context, problems } = await open();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.isVisible('#share-block'), false);
  const posts = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  const rep = await download(page, () => page.click('#report-download'));
  assert.match(rep.name, /^teaching-lab-purchasing-report-/);
  assert.match(await text(page, '#report-status'), /No copy was sent to the team/);
  assert.deepEqual(posts, []);
  assert.deepEqual(problems, []);
  await context.close();
});

test('Q10 sharing available but unticked: checkbox shown unticked with consent text; nothing sent', async () => {
  mail.sent.length = 0;
  const { page, context, problems } = await open(undefined, baseOn);
  await page.waitForSelector('#share-block:not([hidden])');
  assert.equal(await page.isChecked('#share-team'), false);
  assert.equal(await text(page, '#share-label'), 'Share a copy with the Microbiology Atlas team');
  assert.match(await text(page, '#share-text'), /sends this report, including your institution, course, budget and notes, to microbiology-atlas-team@agentmail\.to\. This is the website’s own team, not your colleagues\. You can download without sharing\./);
  const posts = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await download(page, () => page.click('#report-download'));
  await page.waitForTimeout(300);
  assert.deepEqual(posts, []);
  assert.equal(mail.sent.length, 0);
  assert.match(await text(page, '#report-status'), /No copy was sent to the team/);
  assert.deepEqual(problems, []);
  await context.close();
});

test('Q11 ticked: report downloaded and the identical report emailed to the fixed inbox', async () => {
  mail.sent.length = 0;
  const { page, context, problems } = await open(undefined, baseOn);
  await page.waitForSelector('#share-block:not([hidden])');
  await fillReport(page);
  await page.check('#share-team');
  const rep = await download(page, () => page.click('#report-download'));
  await page.waitForFunction(() => /accepted your report/.test(document.querySelector('#share-status').textContent));
  assert.equal(mail.sent.length, 1);
  const m = mail.sent[0];
  assert.deepEqual(m.to, ['microbiology-atlas-team@agentmail.to']);
  assert.equal(m.attachments[0].filename, rep.name);
  assert.equal(decode(m.attachments[0].content), rep.text, 'emailed attachment is byte-identical to the download');
  assert.ok(!m.text.includes('Example College'));
  assert.match(await text(page, '#report-status'), /^Download requested \(report MA-/);
  assert.deepEqual(problems, []);
  await context.close();
});

test('Q12 double click while sending: one download, one email', async () => {
  mail.sent.length = 0;
  mail.script = ['slow'];
  const { page, context } = await open(undefined, baseOn);
  await page.waitForSelector('#share-block:not([hidden])');
  await page.check('#share-team');
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.click('#report-download');
  await page.click('#report-download', { force: true }).catch(() => {});
  await page.waitForFunction(() => /accepted your report/.test(document.querySelector('#share-status').textContent));
  assert.equal(mail.sent.length, 1);
  assert.equal(downloads, 1);
  await context.close();
});

test('Q13 provider rejects: download kept, failure visible, retry reuses the same report', async () => {
  mail.sent.length = 0;
  mail.script = ['403'];
  const { page, context } = await open(undefined, baseOn);
  await page.waitForSelector('#share-block:not([hidden])');
  await page.check('#share-team');
  const rep = await download(page, () => page.click('#report-download'));
  await page.waitForSelector('#share-retry:not([hidden])');
  assert.match(await text(page, '#share-status'), /Your report download is available\. Email sharing failed; try again\./);
  assert.equal(mail.sent.length, 0);
  await page.click('#share-retry');
  await page.waitForFunction(() => /accepted your report/.test(document.querySelector('#share-status').textContent));
  assert.equal(mail.sent.length, 1);
  assert.equal(decode(mail.sent[0].attachments[0].content), rep.text, 'retry sends the same report');
  await context.close();
});

test('Q12 provider error after accepting: status reconciled, no resend', async () => {
  mail.sent.length = 0;
  mail.script = ['500'];
  const { page, context } = await open(undefined, baseOn);
  await page.waitForSelector('#share-block:not([hidden])');
  await page.check('#share-team');
  await download(page, () => page.click('#report-download'));
  await page.waitForFunction(() => /checking before another send/.test(document.querySelector('#share-status').textContent));
  await page.waitForFunction(() => /accepted your report/.test(document.querySelector('#share-status').textContent), null, { timeout: 15000 });
  assert.equal(mail.sent.length, 1);
  await context.close();
});

// ---------- site pages ----------

for (const slug of ['about', 'privacy', 'disclosures', 'contact']) {
  test('/' + slug + ' renders under the CSP, is reachable from the footer and fits a phone', async () => {
    const { page, context, problems } = await open({ width: 320, height: 700 }, base + slug);
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.locator('header nav a[aria-current=page]').getAttribute('href'), '/' + slug);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    assert.deepEqual(problems, []);
    await context.close();
  });
}

test('unknown path returns the 404 page; API is not a page', async () => {
  const res = await fetch(base + 'no-such-page');
  assert.equal(res.status, 404);
  assert.match(await res.text(), /That page isn’t here|That page isn't here/);
  const api = await fetch(base + 'api/reports/share');
  assert.equal(api.status, 405);
});

test('security headers present on pages', async () => {
  const res = await fetch(base);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('every page passes the contrast scan', async () => {
  for (const slug of ['', 'about', 'privacy', 'disclosures', 'contact']) {
    const { page, context } = await open(undefined, base + slug);
    assert.deepEqual(await page.evaluate(CONTRAST), [], '/' + slug);
    await context.close();
  }
});

// ---------- optional confirmation email ----------

test('confirmation email box: disabled until sharing is ticked', async () => {
  const { page, context, problems } = await open(undefined, baseOn);
  await page.waitForSelector('#share-block:not([hidden])');
  assert.equal(await page.isDisabled('#share-email'), true);
  assert.match(await text(page, '#share-email-label'), /Your email for a confirmation \(optional\)/);
  await page.check('#share-team');
  assert.equal(await page.isDisabled('#share-email'), false);
  await page.uncheck('#share-team');
  assert.equal(await page.isDisabled('#share-email'), true);
  assert.deepEqual(problems, []);
  await context.close();
});

test('invalid confirmation email: nothing downloaded or sent, field error shown', async () => {
  mail.sent.length = 0;
  const { page, context } = await open(undefined, baseOn);
  await page.waitForSelector('#share-block:not([hidden])');
  await page.check('#share-team');
  await page.fill('#share-email', 'a@b.com, other@c.com');
  let downloads = 0;
  page.on('download', () => downloads++);
  const posts = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.click('#report-download');
  await page.waitForTimeout(400);
  assert.equal(downloads, 0);
  assert.deepEqual(posts, []);
  assert.equal(await page.getAttribute('#share-email', 'aria-invalid'), 'true');
  assert.match(await text(page, '#share-email-error'), /Enter one email address/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'share-email');
  assert.match(await text(page, '#report-status'), /^Not downloaded\. Check the confirmation email address/);
  await context.close();
});

test('valid confirmation email: team copy with Reply-To, plus one receipt; status says so', async () => {
  mail.sent.length = 0;
  resetRateLimits();
  const { page, context, problems } = await open(undefined, baseOn);
  await page.waitForSelector('#share-block:not([hidden])');
  await page.fill('#institution', 'Example College');
  await page.check('#share-team');
  await page.fill('#share-email', 'Coordinator@Example.edu');
  await download(page, () => page.click('#report-download'));
  await page.waitForFunction(() => /on its way to/.test(document.querySelector('#share-status').textContent));
  assert.match(await text(page, '#share-status'), /A confirmation email is on its way to Coordinator@example\.edu\./);
  assert.equal(mail.sent.length, 2);
  assert.deepEqual(mail.sent[0].reply_to, ['Coordinator@example.edu']);
  assert.deepEqual(mail.sent[1].to, ['Coordinator@example.edu']);
  assert.ok(!mail.sent[1].text.includes('Example College'));
  assert.deepEqual(problems, []);
  await context.close();
});
