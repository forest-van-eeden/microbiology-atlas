/*
 * Microbiology Atlas — shared planning core.
 *
 * Pure functions only: no DOM, no network. An ES module imported by the page
 * (app.js), by the Cloudflare Pages Function that handles report sharing, and
 * by the tests, so every surface uses one set of formulas.
 *
 * Money policy (formula version 2):
 *   - USD inputs are validated to at most two decimal places and converted to
 *     integer cents before any arithmetic.
 *   - Staffing and the contingency allowance are rounded half-up to the cent
 *     once, where they are created. Totals are exact sums of cents.
 *   - Cost per student is total cents ÷ enrollment, rounded only for display.
 */

const SCHEMA_VERSION = '1';
const FORMULA_VERSION = '2';
const CURRENCY = 'USD';
const TEAM_RECIPIENT = 'microbiology-atlas-team@agentmail.to';

// Consent copy is versioned: if the wording or recipient changes, bump the
// version so shared copies record exactly what the visitor agreed to.
const CONSENT_VERSION = '2026-10-08.2'; // .2: optional confirmation email added
const CONSENT_LABEL = 'Share a copy with the Microbiology Atlas team';
const CONSENT_TEXT = 'If selected, clicking Download sends this report, including your institution, course, budget and notes, to '
  + TEAM_RECIPIENT + '. This is the website’s own team, not your colleagues. You can download without sharing.';

// Optional address for a receipt. Separate from consent above: sharing never requires it.
const CONTACT_LABEL = 'Your email for a confirmation (optional)';
const CONTACT_HELP = 'We’ll send one email confirming the team received this report, and the team may reply about it. '
  + 'We won’t add you to any list. Leave blank to share without it.';
const CONTACT_MAX = 254;

/**
 * Validate one plain email address. Deliberately strict: a single address,
 * no display names, spaces, commas, angle brackets or line breaks.
 * Returns { ok, value } with a lower-cased domain, or { ok:false, error }.
 */
function validateContactEmail(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return { ok: true, value: '' };
  if (text.length > CONTACT_MAX) return { ok: false, error: 'Use an email address of ' + CONTACT_MAX + ' characters or fewer.' };
  const m = /^([A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64})@([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+)$/.exec(text);
  if (!m || m[1].startsWith('.') || m[1].endsWith('.') || m[1].includes('..') || !/\.[A-Za-z]{2,}$/.test(m[2])) {
    return { ok: false, error: 'Enter one email address, like name@college.edu, or leave this blank.' };
  }
  return { ok: true, value: m[1] + '@' + m[2].toLowerCase() };
}

// Technical guard limits that keep arithmetic exact. They are not
// recommended laboratory quantities or budgets.
const LIMITS = {
  units: 1000000,
  money: 100000000,
  students: 1000000,
  sections: 10000,
  hours: 100000,
  itemName: 100,
  institution: 150,
  course: 150,
  term: 100,
  preparedBy: 100,
  notes: 4000,
};

const ITEM_FIELDS = {
  name: { label: 'Item or resource name', kind: 'text', max: LIMITS.itemName },
  requiredUnits: { label: 'Units required', kind: 'whole', min: 0, max: LIMITS.units },
  usableStock: { label: 'Usable units already owned', kind: 'whole', min: 0, max: LIMITS.units },
  packSize: { label: 'Units per supplier pack', kind: 'whole', min: 1, max: LIMITS.units },
  packPrice: { label: 'Quoted price per pack', kind: 'money', min: 0, max: LIMITS.money },
};

const BUDGET_FIELDS = {
  studentsPerSection: { label: 'Students per section', kind: 'whole', min: 1, max: LIMITS.students },
  sections: { label: 'Number of sections', kind: 'whole', min: 1, max: LIMITS.sections },
  consumablesPerStudent: { label: 'Consumables per student per semester', kind: 'money', min: 0, max: LIMITS.money },
  equipment: { label: 'New reusable equipment', kind: 'money', min: 0, max: LIMITS.money },
  sharedSupplies: { label: 'Shared supplies per semester', kind: 'money', min: 0, max: LIMITS.money },
  prepHoursPerSection: { label: 'Prep hours per section per semester', kind: 'decimal', min: 0, max: LIMITS.hours },
  staffRate: { label: 'Loaded staff cost per hour', kind: 'money', min: 0, max: LIMITS.money },
  otherPurchases: { label: 'Service, shipping and other costs', kind: 'money', min: 0, max: LIMITS.money },
  contingencyPercent: { label: 'Contingency percent', kind: 'decimal', min: 0, max: 100 },
};

const CONTEXT_FIELDS = {
  institution: { label: 'Institution', max: LIMITS.institution },
  course: { label: 'Course / laboratory', max: LIMITS.course },
  term: { label: 'Term', max: LIMITS.term },
  preparedBy: { label: 'Prepared by', max: LIMITS.preparedBy },
  notes: { label: 'Notes', max: LIMITS.notes },
};

const CHECKLIST = [
  { key: 'learningObjectives', title: 'Start with learning objectives', detail: 'Map each resource to your course. Use ASM guidance as a reference, not a vendor endorsement.' },
  { key: 'existingEquipment', title: 'Check what the department owns', detail: 'Record available quantities, condition, compatibility and sharing constraints.' },
  { key: 'classCapacity', title: 'Confirm student and section capacity', detail: 'Separate per-student items from shared equipment and allow for simultaneous classes.' },
  { key: 'quoteCompleteness', title: 'Request a complete quote', detail: 'Ask about recurring supplies, replacement parts, freight, tax, maintenance and delivery dates.' },
  { key: 'institutionalReview', title: 'Complete institutional review', detail: 'Confirm relevant biosafety, accessibility, storage, disposal and procurement requirements with responsible staff.' },
  { key: 'serviceReplacement', title: 'Understand service and replacement', detail: 'Compare warranties, repairs, parts availability and support during the teaching term.' },
  { key: 'alternatives', title: 'Compare alternatives', detail: 'Consider existing campus licenses, shared facilities, free resources and at least one other supplier.' },
  { key: 'approvalRoute', title: 'Confirm approval and order route', detail: 'Check department authorization, approved suppliers, quote validity and purchase-order requirements.' },
];

const ITEM_DEFAULTS = { name: 'Prepared slide sets', requiredUnits: '24', usableStock: '8', packSize: '6', packPrice: '60' };
const BUDGET_DEFAULTS = {
  studentsPerSection: '24', sections: '3', consumablesPerStudent: '65', equipment: '3000',
  sharedSupplies: '450', prepHoursPerSection: '30', staffRate: '30', otherPurchases: '500', contingencyPercent: '10',
};

const SOURCES = [
  { title: 'ASM undergraduate curriculum guidance', url: 'https://asm.org/guideline/asm-curriculum-guidelines-for-undergraduate-microb' },
  { title: 'ASM teaching-lab biosafety guidance', url: 'https://asm.org/guideline/asm-guidelines-for-biosafety-in-teaching-laborator' },
];

// ---------- parsing and validation ----------

const WHOLE_RE = /^\d+$/;
const DECIMAL_RE = /^(\d+(\.\d*)?|\.\d+)$/;
const MONEY_RE = /^(\d+(\.\d{0,2})?|\.\d{1,2})$/;

function describeRange(spec) {
  const fmt = n => n.toLocaleString('en-US');
  if (spec.kind === 'money') return 'Enter an amount from $' + fmt(spec.min) + ' to $' + fmt(spec.max) + ', to the cent.';
  if (spec.kind === 'whole') return 'Enter a whole number from ' + fmt(spec.min) + ' to ' + fmt(spec.max) + '.';
  return 'Enter a number from ' + fmt(spec.min) + ' to ' + fmt(spec.max) + '.';
}

/** Parse one numeric field. Accepts strings (form values) or numbers. */
function parseNumber(raw, spec) {
  const text = typeof raw === 'number' ? (Number.isFinite(raw) ? String(raw) : '') : String(raw == null ? '' : raw).trim();
  if (text === '') return { error: 'Required. ' + describeRange(spec) };
  const re = spec.kind === 'whole' ? WHOLE_RE : spec.kind === 'money' ? MONEY_RE : DECIMAL_RE;
  if (!re.test(text)) {
    if (spec.kind === 'money' && DECIMAL_RE.test(text)) return { error: 'Use at most two decimal places. ' + describeRange(spec) };
    return { error: describeRange(spec) };
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < spec.min || value > spec.max) return { error: describeRange(spec) };
  if (spec.kind === 'money') return { value, cents: toCents(text) };
  return { value };
}

/** Exact decimal-string → integer cents (no float multiplication). */
function toCents(text) {
  const [whole, frac = ''] = String(text).split('.');
  return Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
}

function validateFields(raw, fields) {
  const errors = {};
  const values = {};
  const cents = {};
  for (const [key, spec] of Object.entries(fields)) {
    if (spec.kind === 'text') {
      const text = String(raw[key] == null ? '' : raw[key]).trim();
      if (!text) errors[key] = 'Required. Enter a name of up to ' + spec.max + ' characters.';
      else if ([...text].length > spec.max) errors[key] = 'Use ' + spec.max + ' characters or fewer.';
      else values[key] = text;
      continue;
    }
    const parsed = parseNumber(raw[key], spec);
    if (parsed.error) errors[key] = parsed.error;
    else {
      values[key] = parsed.value;
      if (parsed.cents !== undefined) cents[key] = parsed.cents;
    }
  }
  const ok = Object.keys(errors).length === 0;
  return ok ? { ok, errors, values, cents } : { ok, errors };
}

function validateContext(raw) {
  const errors = {};
  const values = {};
  for (const [key, spec] of Object.entries(CONTEXT_FIELDS)) {
    const v = raw && raw[key] != null ? String(raw[key]) : '';
    const text = key === 'notes' ? v.replace(/\r\n?/g, '\n').trim() : v.trim();
    if ([...text].length > spec.max) errors[key] = 'Use ' + spec.max + ' characters or fewer.';
    else values[key] = text;
  }
  const ok = Object.keys(errors).length === 0;
  return ok ? { ok, errors, values } : { ok, errors };
}

// ---------- calculations ----------

function calculateItem(raw) {
  const v = validateFields(raw, ITEM_FIELDS);
  if (!v.ok) return v;
  const R = v.values.requiredUnits, S = v.values.usableStock, P = v.values.packSize, C = v.cents.packPrice;
  const shortfall = Math.max(0, R - S);
  const packs = Math.ceil(shortfall / P);
  const orderedUnits = packs * P;
  const remainingUnits = S + orderedUnits - R;
  const costCents = packs * C;
  const allNewCents = Math.ceil(R / P) * C;
  if (!Number.isSafeInteger(allNewCents)) return tooLarge();
  return {
    ok: true,
    inputs: { name: v.values.name, requiredUnits: R, usableStock: S, packSize: P, packPriceCents: C },
    results: { shortfall, packs, orderedUnits, remainingUnits, costCents, allNewCents, avoidedCents: allNewCents - costCents },
  };
}

// Totals beyond about $90 trillion cannot be held exactly in cents.
function tooLarge() {
  return { ok: false, errors: { _form: 'These values produce a total too large to calculate exactly. Check the quantities and prices.' } };
}

function roundHalfUp(n) {
  // Values here are non-negative; add a tiny epsilon to absorb binary noise
  // such as 1.005 * 100 = 100.49999999999999.
  return Math.floor(n + 0.5 + 1e-9);
}

function calculateBudget(raw) {
  const v = validateFields(raw, BUDGET_FIELDS);
  if (!v.ok) return v;
  const A = v.values.studentsPerSection, B = v.values.sections;
  const enrollment = A * B;
  const purchasesCents = enrollment * v.cents.consumablesPerStudent + v.cents.equipment + v.cents.sharedSupplies + v.cents.otherPurchases;
  const staffingCents = roundHalfUp(B * v.values.prepHoursPerSection * v.cents.staffRate);
  const baseCents = purchasesCents + staffingCents;
  const allowanceCents = roundHalfUp(baseCents * v.values.contingencyPercent / 100);
  const totalCents = baseCents + allowanceCents;
  if (!Number.isSafeInteger(totalCents)) return tooLarge();
  return {
    ok: true,
    inputs: {
      studentsPerSection: A, sections: B,
      consumablesPerStudentCents: v.cents.consumablesPerStudent, equipmentCents: v.cents.equipment,
      sharedSuppliesCents: v.cents.sharedSupplies, prepHoursPerSection: v.values.prepHoursPerSection,
      staffRateCents: v.cents.staffRate, otherPurchasesCents: v.cents.otherPurchases,
      contingencyPercent: v.values.contingencyPercent,
    },
    results: {
      enrollment, purchasesCents, staffingCents, baseCents, allowanceCents, totalCents,
      perStudentCents: totalCents / enrollment,
    },
  };
}

function isDefaultInput(raw, defaults) {
  return Object.keys(defaults).every(k => String(raw[k] == null ? '' : raw[k]).trim() === defaults[k]);
}

// ---------- formatting ----------

function formatUSD(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(roundHalfUp(cents) / 100);
}
const formatCount = n => n.toLocaleString('en-US');
const formatPlain = n => String(Math.round(n * 1e6) / 1e6);
const centsPlain = c => (roundHalfUp(c) / 100).toFixed(2);

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Neutralise Markdown syntax in user text so a name cannot become a link,
// heading or HTML block in a Markdown viewer.
function escapeMarkdown(v) {
  return String(v).replace(/[\\`*_{}\[\]()#+\-.!|<>~]/g, '\\$&').replace(/\r?\n/g, ' ');
}

// CSV cell: quote always; neutralise spreadsheet formula prefixes.
function csvCell(v) {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function itemExplanation(item) {
  const i = item.inputs, r = item.results;
  if (r.shortfall === 0) {
    return 'For ' + i.name + ', existing usable stock covers the planned requirement. No additional packs are needed; '
      + formatCount(r.remainingUnits) + ' units remain after allocation.';
  }
  return 'For ' + i.name + ', ' + formatCount(i.usableStock) + ' usable units cover part of the ' + formatCount(i.requiredUnits)
    + '-unit requirement. The ' + formatCount(r.shortfall) + '-unit shortfall needs ' + formatCount(r.packs) + ' whole '
    + (r.packs === 1 ? 'pack' : 'packs') + ' (' + formatCount(r.orderedUnits) + ' units), costing ' + formatUSD(r.costCents)
    + ' at the entered quote. ' + formatCount(r.remainingUnits) + ' units remain after planned allocation.';
}

// ---------- report identity and snapshot ----------

function newReportId(randomBytes) {
  // 10 random bytes → 16 Crockford base32 characters. Never derived from user text.
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const bytes = randomBytes(10);
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return 'MA-' + out.slice(0, 8) + '-' + out.slice(8, 16);
}

/**
 * Build one immutable, versioned report snapshot from raw form values.
 * Returns { ok:false, errors:{item?, budget?, context?} } when anything is invalid.
 */
function buildSnapshot({ itemRaw, budgetRaw, contextRaw, checklist, reportId, generatedAt, sharing }) {
  const item = calculateItem(itemRaw || {});
  const budget = calculateBudget(budgetRaw || {});
  const context = validateContext(contextRaw || {});
  if (!item.ok || !budget.ok || !context.ok) {
    return { ok: false, errors: { item: item.ok ? {} : item.errors, budget: budget.ok ? {} : budget.errors, context: context.ok ? {} : context.errors } };
  }
  if (!/^MA-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}$/.test(reportId || '')) throw new Error('Invalid report identifier');
  const review = {};
  for (const c of CHECKLIST) review[c.key] = Boolean(checklist && checklist[c.key]);
  const snapshot = {
    reportId,
    schemaVersion: SCHEMA_VERSION,
    formulaVersion: FORMULA_VERSION,
    generatedAt: new Date(generatedAt).toISOString(),
    currency: CURRENCY,
    context: context.values,
    item: { inputs: item.inputs, results: item.results },
    budget: { inputs: budget.inputs, results: budget.results },
    review,
    illustrativeDefaults: { item: isDefaultInput(itemRaw, ITEM_DEFAULTS), budget: isDefaultInput(budgetRaw, BUDGET_DEFAULTS) },
    sharing: sharing && sharing.selected
    ? { selected: true, consentTextVersion: sharing.consentTextVersion, recipient: TEAM_RECIPIENT, capturedAt: new Date(sharing.capturedAt).toISOString() }
    : { selected: false },
  };
  return { ok: true, snapshot: deepFreeze(snapshot) };
}

function deepFreeze(o) {
  Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); });
  return Object.freeze(o);
}

function reportFilename(snapshot) {
  const date = snapshot.generatedAt.slice(0, 10);
  return 'teaching-lab-purchasing-report-' + date + '-' + snapshot.reportId.slice(3, 11).toLowerCase() + '.html';
}

// ---------- renderers ----------

function formatGenerated(iso, timeZone) {
  // Built from formatToParts so browsers and the server produce identical text
  // (ICU versions differ in separators such as ' at ' and narrow spaces).
  const d = new Date(iso);
  const utc = iso.replace(/\.\d{3}Z$/, 'Z') + ' UTC';
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short', timeZone,
    }).formatToParts(d);
  } catch (e) {
    return utc;
  }
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  return p.month + ' ' + p.day + ', ' + p.year + ', ' + p.hour + ':' + p.minute + ' ' + String(p.dayPeriod).toUpperCase() + ' ' + p.timeZoneName + ' (' + utc + ')';
}

/**
 * Render the complete, self-contained HTML report. Recomputes nothing from
 * client totals: all figures come from the validated snapshot. No scripts,
 * no external resources; a CSP meta tag blocks script execution regardless.
 */
function renderReportHtml(snapshot, { timeZone } = {}) {
  const s = snapshot, ii = s.item.inputs, ir = s.item.results, bi = s.budget.inputs, br = s.budget.results;
  const row = (a, b) => '<tr><th scope="row">' + escapeHtml(a) + '</th><td>' + escapeHtml(b) + '</td></tr>';
  const ctx = [['Institution', s.context.institution], ['Course / laboratory', s.context.course], ['Term', s.context.term], ['Prepared by', s.context.preparedBy]]
    .map(([a, b]) => b ? row(a, b) : '<tr><th scope="row">' + escapeHtml(a) + '</th><td class="missing">Not supplied</td></tr>').join('');
  const itemRows = [
    ['Item', ii.name], ['Units required', formatCount(ii.requiredUnits)], ['Usable units owned', formatCount(ii.usableStock)],
    ['Units per pack', formatCount(ii.packSize)], ['Quoted price per pack', formatUSD(ii.packPriceCents)],
    ['Shortfall', formatCount(ir.shortfall)], ['Packs to order', formatCount(ir.packs)], ['Units purchased', formatCount(ir.orderedUnits)],
    ['Units left after allocation', formatCount(ir.remainingUnits)], ['Quoted purchase cost', formatUSD(ir.costCents)],
    ['All-new comparison', formatUSD(ir.allNewCents)], ['Avoided spend comparison', formatUSD(ir.avoidedCents)],
  ].map(([a, b]) => row(a, b)).join('');
  const budgetRows = [
    ['Students per section', formatCount(bi.studentsPerSection)], ['Sections', formatCount(bi.sections)],
    ['Consumables per student per semester', formatUSD(bi.consumablesPerStudentCents)], ['New reusable equipment', formatUSD(bi.equipmentCents)],
    ['Shared supplies per semester', formatUSD(bi.sharedSuppliesCents)], ['Prep hours per section per semester', formatPlain(bi.prepHoursPerSection)],
    ['Loaded staff cost per hour', formatUSD(bi.staffRateCents)], ['Service, shipping and other costs', formatUSD(bi.otherPurchasesCents)],
    ['Contingency', formatPlain(bi.contingencyPercent) + '%'],
    ['Total students', formatCount(br.enrollment)], ['Purchases before contingency', formatUSD(br.purchasesCents)],
    ['Staffing before contingency', formatUSD(br.staffingCents)], ['Contingency allowance', formatUSD(br.allowanceCents)],
    ['Semester total', formatUSD(br.totalCents)], ['Cost per student', formatUSD(br.perStudentCents)],
  ].map(([a, b]) => row(a, b)).join('');
  const reviewedCount = CHECKLIST.filter(c => s.review[c.key]).length;
  const checklist = CHECKLIST.map(c => '<li><b>' + (s.review[c.key] ? 'Reviewed' : 'Not yet reviewed') + ': ' + escapeHtml(c.title)
    + '</b><p>' + escapeHtml(c.detail) + '</p></li>').join('');
  const defaultsWarn = [];
  if (s.illustrativeDefaults.item) defaultsWarn.push('item plan');
  if (s.illustrativeDefaults.budget) defaultsWarn.push('semester budget');
  const warn = defaultsWarn.length
    ? '<p class="warn"><b>Check before use:</b> the ' + defaultsWarn.join(' and ') + ' still ' + (defaultsWarn.length > 1 ? 'use' : 'uses')
      + ' the website’s illustrative example values, not your own figures.</p>'
    : '';
  const notes = s.context.notes ? escapeHtml(s.context.notes) : 'No additional notes supplied.';
  const css = 'body{font:15px/1.6 Arial,sans-serif;color:#173b36;background:#fff;max-width:900px;margin:40px auto;padding:0 25px}'
    + 'h1{font:42px/1.1 Georgia,serif;margin:8px 0}h2{margin-top:38px;border-bottom:1px solid #b6c4b4;padding-bottom:8px;font-size:22px}'
    + 'table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{text-align:left;padding:9px 12px;border-bottom:1px solid #ddd;vertical-align:top;overflow-wrap:anywhere}'
    + 'th{width:60%;font-weight:normal}td{font-weight:bold}td.missing{font-weight:normal;font-style:italic;color:#4f6359}'
    + '.note{background:#edf1e5;padding:18px}.warn{border-left:4px solid #8a5a00;background:#fbf4e4;padding:12px 16px}'
    + '.small{font-size:12px;color:#4f6359}.meta{font-size:12px;color:#4f6359;letter-spacing:.3px}li{margin:15px 0}li p{margin:4px 0}'
    + '.notes{white-space:pre-wrap;overflow-wrap:anywhere}@media(max-width:600px){body{margin:20px auto;padding:0 16px}h1{font-size:32px}th{width:55%}}'
    + '@media print{body{margin:0;max-width:none;font-size:11pt}h2{break-after:avoid}tr,li{break-inside:avoid}.print-help{display:none}a{color:inherit}}';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="atlas-report" content="' + escapeHtml(s.reportId) + '; schema ' + s.schemaVersion + '; formula ' + s.formulaVersion + '">'
    + '<title>Teaching-lab purchasing report ' + escapeHtml(s.reportId) + '</title><style>' + css + '</style></head><body>'
    + '<p class="meta">MICROBIOLOGY ATLAS / TEACHING-LAB PLANNING</p><h1>Purchasing report</h1>'
    + '<p class="meta">Report ' + escapeHtml(s.reportId) + ' · Schema ' + s.schemaVersion + ' · Formula ' + s.formulaVersion + ' · ' + s.currency + '<br>'
    + 'Generated ' + escapeHtml(formatGenerated(s.generatedAt, timeZone)) + '</p>'
    + '<p class="print-help small">Open this file offline in your browser. To make a PDF, choose Print → Save as PDF.</p>'
    + '<table>' + ctx + '</table>' + warn
    + '<p class="note"><b>Semester budget total: ' + escapeHtml(formatUSD(br.totalCents)) + '</b> · ' + escapeHtml(formatCount(br.enrollment)) + ' students · '
    + escapeHtml(formatUSD(br.perStudentCents)) + ' per student.<br>Item plan: ' + escapeHtml(formatCount(ir.packs)) + ' ' + (ir.packs === 1 ? 'pack' : 'packs')
    + ' of ' + escapeHtml(ii.name) + ' at ' + escapeHtml(formatUSD(ir.costCents)) + '.<br>Purchasing review: ' + reviewedCount + ' of ' + CHECKLIST.length + ' items reviewed.</p>'
    + '<p><b>Do not add these totals together.</b> The item plan and semester budget are separate. Confirm whether the item cost is already included in the appropriate budget category.</p>'
    + '<h2>1. Item purchasing plan</h2><p>' + escapeHtml(itemExplanation(s.item)) + '</p><table>' + itemRows + '</table>'
    + '<p class="small">Shortfall = max(0, required − usable stock). Packs = shortfall ÷ pack size, rounded up. Units left = stock + purchased − required. '
    + 'The all-new comparison rounds the full requirement to whole packs at the same entered price and is not a verified saving. Existing stock is user-reported, not inspected. '
    + 'Freight, taxes, discounts and minimum orders are not modeled.</p>'
    + '<h2>2. Semester budget</h2><table>' + budgetRows + '</table>'
    + '<p class="small">Purchases = students × consumables per student + equipment + shared supplies + other costs. Staffing = sections × prep hours × hourly staff cost. '
    + 'Contingency applies to purchases plus staffing. Staffing and contingency are rounded to the cent; cost per student is rounded for display only. '
    + 'Existing equipment is not depreciated. Staffing may sit outside the purchasing budget. All amounts in USD.</p>'
    + '<h2>3. Purchasing review</h2><ul>' + checklist + '</ul><p class="small">Reviewed means the person preparing this report ticked the item; it does not certify compliance or product suitability.</p>'
    + '<h2>4. Notes and outstanding questions</h2><p class="notes">' + notes + '</p>'
    + '<h2>5. Planning basis</h2><p>This file captures the values entered in the browser when it was generated. It is not a supplier quote, purchase order or validated laboratory plan. '
    + 'Confirm specifications and institutional requirements before ordering. No affiliate relationship or institutional endorsement is implied.</p>'
    + '<p>' + SOURCES.map(x => '<a href="' + escapeHtml(x.url) + '">' + escapeHtml(x.title) + '</a>').join(' · ') + '</p>'
    + '<p class="small">Generated locally in your browser by Microbiology Atlas. This file contains the details you entered; share it only with the intended recipients.</p>'
    + '</body></html>';
}

function renderItemMarkdown(item) {
  const i = item.inputs, r = item.results;
  const lines = [
    '# Teaching-lab item purchasing plan', '',
    escapeMarkdown(itemExplanation(item)), '',
    '| Field | Value |', '| --- | --- |',
    '| Item | ' + escapeMarkdown(i.name) + ' |',
    '| Units required | ' + i.requiredUnits + ' |', '| Usable units owned | ' + i.usableStock + ' |',
    '| Units per pack | ' + i.packSize + ' |', '| Quoted price per pack (USD) | ' + centsPlain(i.packPriceCents) + ' |',
    '| Shortfall | ' + r.shortfall + ' |', '| Packs to order | ' + r.packs + ' |', '| Units purchased | ' + r.orderedUnits + ' |',
    '| Units left after allocation | ' + r.remainingUnits + ' |', '| Quoted purchase cost (USD) | ' + centsPlain(r.costCents) + ' |',
    '| All-new comparison (USD) | ' + centsPlain(r.allNewCents) + ' |', '| Avoided spend comparison (USD) | ' + centsPlain(r.avoidedCents) + ' |',
    '', 'Formula version ' + FORMULA_VERSION + '. Illustrative or user-entered quote; verify stock suitability and supplier terms. '
      + 'Excludes freight, tax, discounts and minimum orders. Transfer the cost once to the semester budget.', '',
  ];
  return lines.join('\n');
}

function budgetRowsPlain(budget) {
  const i = budget.inputs, r = budget.results;
  return [
    ['Students per section', i.studentsPerSection], ['Sections', i.sections],
    ['Consumables per student per semester (USD)', centsPlain(i.consumablesPerStudentCents)], ['New reusable equipment (USD)', centsPlain(i.equipmentCents)],
    ['Shared supplies per semester (USD)', centsPlain(i.sharedSuppliesCents)], ['Prep hours per section per semester', formatPlain(i.prepHoursPerSection)],
    ['Loaded staff cost per hour (USD)', centsPlain(i.staffRateCents)], ['Service, shipping and other costs (USD)', centsPlain(i.otherPurchasesCents)],
    ['Contingency (percent)', formatPlain(i.contingencyPercent)], ['Total students', r.enrollment],
    ['Purchases before contingency (USD)', centsPlain(r.purchasesCents)], ['Staffing before contingency (USD)', centsPlain(r.staffingCents)],
    ['Contingency allowance (USD)', centsPlain(r.allowanceCents)], ['Semester total (USD)', centsPlain(r.totalCents)],
    ['Cost per student (USD)', centsPlain(r.perStudentCents)],
  ];
}

function renderBudgetCsv(budget) {
  const rows = [['Microbiology Atlas semester estimate', 'Value']].concat(budgetRowsPlain(budget));
  rows.push(['Formula version', FORMULA_VERSION]);
  rows.push(['Note', 'Illustrative defaults are not supplier quotes']);
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function renderBriefMarkdown(budget, review) {
  return [
    '# Microbiology Atlas — teaching-lab purchasing brief', '',
    'Planning estimate; replace illustrative defaults with verified quotes.', '',
    '## Semester budget', '',
    ...budgetRowsPlain(budget).map(([k, v]) => '- ' + k + ': ' + v), '',
    '## Review checklist', '',
    ...CHECKLIST.map(c => '- [' + (review[c.key] ? 'x' : ' ') + '] ' + c.title), '',
    'A check records review, not certification. Confirm institutional requirements, alternatives and supplier quotes before purchasing.',
    'Formula version ' + FORMULA_VERSION + '.', '',
  ].join('\n');
}

export {
  SCHEMA_VERSION, FORMULA_VERSION, CURRENCY, TEAM_RECIPIENT, CONSENT_VERSION, CONSENT_LABEL, CONSENT_TEXT,
  CONTACT_LABEL, CONTACT_HELP, CONTACT_MAX, validateContactEmail, LIMITS,
  ITEM_FIELDS, BUDGET_FIELDS, CONTEXT_FIELDS, CHECKLIST, ITEM_DEFAULTS, BUDGET_DEFAULTS, SOURCES,
  parseNumber, toCents, validateContext, calculateItem, calculateBudget, isDefaultInput,
  formatUSD, formatCount, escapeHtml, escapeMarkdown, csvCell, itemExplanation,
  newReportId, buildSnapshot, reportFilename, renderReportHtml, renderItemMarkdown, renderBudgetCsv, renderBriefMarkdown,
};
