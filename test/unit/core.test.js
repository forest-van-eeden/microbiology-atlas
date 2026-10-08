// Regression tests for the shared planning core. IDs (Q01…) refer to the QA
// matrix in the project design specification.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as C from '../../dist/atlas-core.js';

const item = (o = {}) => C.calculateItem({ ...C.ITEM_DEFAULTS, ...o });
const budget = (o = {}) => C.calculateBudget({ ...C.BUDGET_DEFAULTS, ...o });
const fixedId = 'MA-0123456Q-RSTVWXYZ';
const snap = (o = {}) => C.buildSnapshot({
  itemRaw: C.ITEM_DEFAULTS, budgetRaw: C.BUDGET_DEFAULTS, contextRaw: {}, checklist: {},
  reportId: fixedId, generatedAt: Date.UTC(2026, 9, 8, 14, 13), ...o,
});

test.describe('item planner formulas', () => {
  test('Q01 example: 24 required, 8 stock, packs of 6 at $60', () => {
    const r = item();
    assert.equal(r.ok, true);
    assert.deepEqual(r.results, { shortfall: 16, packs: 3, orderedUnits: 18, remainingUnits: 2, costCents: 18000, allNewCents: 24000, avoidedCents: 6000 });
  });
  test('Q02 stock exceeds requirement: no purchase, surplus retained', () => {
    const r = item({ usableStock: '30' }).results;
    assert.equal(r.packs, 0); assert.equal(r.costCents, 0); assert.equal(r.remainingUnits, 6);
  });
  test('Q04 stock reduces shortage but not pack count: avoided spend is zero', () => {
    const r = item({ usableStock: '1' }).results;
    assert.equal(r.packs, 4); assert.equal(r.costCents, 24000); assert.equal(r.avoidedCents, 0);
  });
  test('zero requirement keeps all stock', () => {
    const r = item({ requiredUnits: '0' }).results;
    assert.equal(r.packs, 0); assert.equal(r.remainingUnits, 8); assert.equal(r.costCents, 0);
  });
  test('cent prices are exact', () => {
    assert.equal(item({ packPrice: '19.99' }).results.costCents, 5997);
    assert.equal(item({ packPrice: '0.1' }).results.costCents, 30);
  });
  test('large values compute exactly', () => {
    const r = item({ requiredUnits: '1000000', usableStock: '0', packSize: '1', packPrice: '1000000' });
    assert.equal(r.ok, true);
    assert.equal(r.results.costCents, 1e14);
  });
  test('totals that cannot be exact in cents are refused, not rounded', () => {
    const r = item({ requiredUnits: '1000000', usableStock: '0', packSize: '1', packPrice: '100000000' });
    assert.equal(r.ok, false);
    assert.match(r.errors._form, /too large/);
    const b = budget({ studentsPerSection: '1000000', sections: '10000', consumablesPerStudent: '100000000' });
    assert.equal(b.ok, false);
    assert.match(b.errors._form, /too large/);
  });
});

test.describe('item planner validation', () => {
  const invalid = {
    'Q03 pack size zero': { packSize: '0' },
    'fractional stock': { usableStock: '2.5' },
    'negative requirement': { requiredUnits: '-1' },
    'blank requirement': { requiredUnits: '' },
    'exponent notation': { requiredUnits: '1e3' },
    'units above bound': { usableStock: '1000001' },
    'price above bound': { packPrice: '100000000.01' },
    'price with three decimals': { packPrice: '1.005' },
    'negative price': { packPrice: '-5' },
    'whitespace-only name': { name: '   ' },
    'name over 100 characters': { name: 'x'.repeat(101) },
    'non-finite': { packPrice: 'Infinity' },
  };
  for (const [label, o] of Object.entries(invalid)) {
    test(label + ' is rejected with a field error', () => {
      const r = item(o);
      assert.equal(r.ok, false);
      assert.equal(r.results, undefined, 'no results returned for invalid input');
      const key = Object.keys(o)[0];
      assert.match(r.errors[key], /\w/);
    });
  }
  test('name is trimmed; 100 characters is allowed', () => {
    assert.equal(item({ name: '  Slides  ' }).inputs.name, 'Slides');
    assert.equal(item({ name: 'x'.repeat(100) }).ok, true);
  });
  test('three-decimal money gets a precision-specific message', () => {
    assert.match(item({ packPrice: '1.005' }).errors.packPrice, /two decimal places/);
  });
});

test.describe('semester budget formulas', () => {
  test('Q05 example inputs', () => {
    const r = budget().results;
    assert.equal(r.enrollment, 72);
    assert.equal(r.purchasesCents, 863000);
    assert.equal(r.staffingCents, 270000);
    assert.equal(r.allowanceCents, 113300);
    assert.equal(r.totalCents, 1246300);
    assert.equal(C.formatUSD(r.totalCents), '$12,463.00');
    assert.equal(C.formatUSD(r.perStudentCents), '$173.10');
  });
  test('Q07 twelve students per section', () => {
    const r = budget({ studentsPerSection: '12' }).results;
    assert.equal(r.enrollment, 36);
    assert.equal(r.totalCents, 988900);
  });
  test('zero costs are accepted', () => {
    const r = budget({ consumablesPerStudent: '0', equipment: '0', sharedSupplies: '0', staffRate: '0', otherPurchases: '0', prepHoursPerSection: '0', contingencyPercent: '0' });
    assert.equal(r.ok, true); assert.equal(r.results.totalCents, 0); assert.equal(r.results.perStudentCents, 0);
  });
  test('rounding policy: staffing and contingency rounded half-up to the cent, once', () => {
    // 1 section × 1.5 h × $10.01 = $15.015 → $15.02
    const r = budget({ sections: '1', prepHoursPerSection: '1.5', staffRate: '10.01', studentsPerSection: '1', consumablesPerStudent: '0', equipment: '0', sharedSupplies: '0', otherPurchases: '0', contingencyPercent: '0' });
    assert.equal(r.results.staffingCents, 1502);
    // $100.05 × 10% = $10.005 → $10.01
    const c = budget({ sections: '1', prepHoursPerSection: '0', studentsPerSection: '1', consumablesPerStudent: '100.05', equipment: '0', sharedSupplies: '0', otherPurchases: '0', contingencyPercent: '10' });
    assert.equal(c.results.allowanceCents, 1001);
    assert.equal(c.results.totalCents, 10005 + 1001);
  });
  test('total is the exact sum of its parts', () => {
    const r = budget({ consumablesPerStudent: '65.37', contingencyPercent: '12.5', prepHoursPerSection: '27.25' }).results;
    assert.equal(r.totalCents, r.purchasesCents + r.staffingCents + r.allowanceCents);
    for (const k of ['purchasesCents', 'staffingCents', 'allowanceCents', 'totalCents']) assert.ok(Number.isInteger(r[k]), k);
  });
});

test.describe('semester budget validation', () => {
  const invalid = {
    'Q06 zero enrollment': { studentsPerSection: '0' },
    'zero sections': { sections: '0' },
    'fractional sections': { sections: '1.5' },
    'blank consumables': { consumablesPerStudent: '' },
    'negative equipment': { equipment: '-1' },
    'contingency over 100': { contingencyPercent: '100.1' },
    'money with three decimals': { staffRate: '30.001' },
  };
  for (const [label, o] of Object.entries(invalid)) {
    test(label + ' is rejected; no totals returned', () => {
      const r = budget(o);
      assert.equal(r.ok, false);
      assert.equal(r.results, undefined);
      assert.ok(r.errors[Object.keys(o)[0]]);
    });
  }
  test('other fields stay valid when one is wrong', () => {
    const r = budget({ sections: '0' });
    assert.deepEqual(Object.keys(r.errors), ['sections']);
  });
});

test.describe('report snapshot', () => {
  test('envelope has versions, UTC timestamp, currency and a non-identifying id', () => {
    const s = snap({ contextRaw: { institution: 'Example College', preparedBy: 'Dr Who' } }).snapshot;
    assert.equal(s.schemaVersion, '1');
    assert.equal(s.formulaVersion, '2');
    assert.equal(s.currency, 'USD');
    assert.equal(s.generatedAt, '2026-10-08T14:13:00.000Z');
    assert.equal(s.sharing.selected, false);
    assert.ok(!/example|who/i.test(s.reportId));
  });
  test('snapshot is immutable', () => {
    const s = snap().snapshot;
    assert.throws(() => { 'use strict'; s.budget.results.totalCents = 1; }, TypeError);
  });
  test('all checklist keys are present and boolean', () => {
    const s = snap({ checklist: { alternatives: true, notAKey: true } }).snapshot;
    assert.deepEqual(Object.keys(s.review), C.CHECKLIST.map(c => c.key));
    assert.equal(s.review.alternatives, true);
    assert.equal(s.review.learningObjectives, false);
    assert.equal(s.review.notAKey, undefined);
  });
  test('invalid planners block snapshot creation', () => {
    const r = snap({ budgetRaw: { ...C.BUDGET_DEFAULTS, studentsPerSection: '0' } });
    assert.equal(r.ok, false);
    assert.ok(r.errors.budget.studentsPerSection);
  });
  test('context length limits enforced', () => {
    const r = snap({ contextRaw: { notes: 'n'.repeat(4001) } });
    assert.equal(r.ok, false);
    assert.ok(r.errors.context.notes);
    assert.equal(snap({ contextRaw: { notes: 'n'.repeat(4000) } }).ok, true);
  });
  test('report ids are well-formed and distinct', () => {
    const ids = new Set();
    for (let i = 0; i < 500; i++) ids.add(C.newReportId(n => crypto.randomBytes(n)));
    assert.equal(ids.size, 500);
    for (const id of ids) assert.match(id, /^MA-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}$/);
  });
  test('malformed report id is refused', () => {
    assert.throws(() => snap({ reportId: 'MA-<script>' }));
  });
  test('filename has date and id fragment, never user text', () => {
    const s = snap({ contextRaw: { institution: 'Secret University' } }).snapshot;
    assert.equal(C.reportFilename(s), 'teaching-lab-purchasing-report-2026-10-08-0123456q.html');
  });
  test('illustrative-default detection', () => {
    assert.deepEqual(snap().snapshot.illustrativeDefaults, { item: true, budget: true });
    const s = snap({ budgetRaw: { ...C.BUDGET_DEFAULTS, sections: '4' } }).snapshot;
    assert.deepEqual(s.illustrativeDefaults, { item: true, budget: false });
  });
});

test.describe('report HTML', () => {
  const hostile = '<script>alert(1)</script><img src=x onerror=alert(2)>"\'&';
  const html = () => C.renderReportHtml(snap({
    itemRaw: { ...C.ITEM_DEFAULTS, name: '<b>Agar</b> & "plates"' },
    contextRaw: { institution: hostile, course: 'Micro 101', term: '', preparedBy: '', notes: 'Line one\nLine two <i>x</i>' },
    checklist: { alternatives: true },
  }).snapshot, { timeZone: 'America/New_York' });

  test('Q09 hostile text is escaped and inert', () => {
    const h = html();
    assert.ok(!h.includes('<script>'));
    assert.ok(!h.includes('<img'));
    assert.ok(!/\son\w+=/i.test(h.replace(/&lt;img src=x onerror=alert\(2\)&gt;/g, '')));
    assert.ok(h.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(h.includes('&lt;b&gt;Agar&lt;/b&gt; &amp; &quot;plates&quot;'));
  });
  test('static document: CSP forbids scripts; no external resources', () => {
    const h = html();
    assert.match(h, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"/);
    assert.ok(!/<script|<link|<img|<iframe|@import|url\(/i.test(h));
    assert.ok(!/https?:\/\/(?!asm\.org)/.test(h), 'only ASM source links');
  });
  test('Q08 contains context, values, checklist state and notes with line breaks', () => {
    const h = html();
    assert.ok(h.includes('Micro 101'));
    assert.ok(h.includes('<td class="missing">Not supplied</td>'), 'missing optional values distinct from zero');
    assert.ok(h.includes('$12,463.00') && h.includes('$173.10') && h.includes('$180.00'));
    assert.ok(h.includes('Reviewed: Compare alternatives'));
    assert.equal((h.match(/Not yet reviewed:/g) || []).length, 7);
    assert.ok(h.includes('1 of 8 items reviewed'));
    assert.ok(h.includes('Line one\nLine two &lt;i&gt;x&lt;/i&gt;') && h.includes('white-space:pre-wrap'));
    assert.ok(h.includes('Do not add these totals together'));
  });
  test('envelope rendered with local time zone and UTC', () => {
    const h = html();
    assert.ok(h.includes('Report MA-0123456Q-RSTVWXYZ · Schema 1 · Formula 2 · USD'));
    assert.ok(h.includes('October 8, 2026, 10:13 AM EDT (2026-10-08T14:13:00Z UTC)'));
  });
  test('illustrative-values warning appears only when defaults unchanged', () => {
    assert.ok(html().includes('the semester budget still uses the website’s illustrative example values'));
    const h2 = C.renderReportHtml(snap({ itemRaw: { ...C.ITEM_DEFAULTS, packSize: '5' }, budgetRaw: { ...C.BUDGET_DEFAULTS, sections: '2' } }).snapshot);
    assert.ok(!h2.includes('illustrative example values'));
  });
});

test.describe('other exports', () => {
  test('budget CSV: quoted cells, explicit USD, formula version', () => {
    const csv = C.renderBudgetCsv(budget());
    assert.ok(csv.includes('"Semester total (USD)","12463.00"'));
    assert.ok(csv.includes('"Cost per student (USD)","173.10"'));
    assert.ok(csv.includes('"Formula version","2"'));
  });
  test('CSV cells neutralise formula injection', () => {
    assert.equal(C.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(C.csvCell('-12.50'), '"-12.50"');
  });
  test('item Markdown escapes the name and includes all results', () => {
    const md = C.renderItemMarkdown(item({ name: '[click](http://evil) # <b>' }));
    assert.ok(md.includes('\\[click\\]\\(http://evil\\) \\# \\<b\\>'));
    assert.ok(md.includes('| Quoted purchase cost (USD) | 180.00 |'));
    assert.ok(md.includes('| Avoided spend comparison (USD) | 60.00 |'));
  });
  test('brief Markdown lists checklist state', () => {
    const md = C.renderBriefMarkdown(budget(), { alternatives: true });
    assert.ok(md.includes('- [x] Compare alternatives'));
    assert.ok(md.includes('- [ ] Start with learning objectives'));
    assert.ok(md.includes('- Semester total (USD): 12463.00'));
  });
});

test.describe('contact email validation', () => {
  test('accepts plain addresses and normalises the domain', () => {
    assert.deepEqual(C.validateContactEmail(' Name.Last+lab@College.EDU '), { ok: true, value: 'Name.Last+lab@college.edu' });
    assert.deepEqual(C.validateContactEmail(''), { ok: true, value: '' });
  });
  test('rejects anything that could add recipients or headers', () => {
    for (const bad of ['bad', 'a@b', 'a@@b.com', 'a b@c.com', 'a@b.com,c@d.com', 'a@b.com;c@d.com', 'a@b.com\nBcc: x@y.com', '<a@b.com>', 'Name <a@b.com>', '.a@b.com', 'a..b@c.com', 'x'.repeat(250) + '@b.com']) {
      assert.equal(C.validateContactEmail(bad).ok, false, bad);
    }
  });
  test('consent version changed with the new optional field', () => {
    assert.equal(C.CONSENT_VERSION, '2026-10-08.2');
  });
});
