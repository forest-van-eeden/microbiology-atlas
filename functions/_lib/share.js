/*
 * Report sharing service (Cloudflare Pages Functions).
 *
 * POST /api/reports/share   → validate, rebuild the report from raw inputs, email it to the fixed team inbox
 * GET  /api/reports/status  → look up a report's sharing state (used after an uncertain outcome)
 * GET  /api/config          → tells the page whether sharing is available
 *
 * Environment (set in the Cloudflare dashboard):
 *   SHARING_ENABLED        "true" to switch sharing on (anything else = off)
 *   AGENTMAIL_API_KEY      secret; never sent to the browser
 *   AGENTMAIL_SENDER_INBOX inbox id to send from (default: the team inbox)
 *   AGENTMAIL_API_BASE     default https://api.agentmail.to/v0
 *   SHARE_LOG              KV namespace binding: duplicate protection, delivery state, rate limits
 *
 * Report contents are never written to KV or logs: only ids, timestamps and states.
 *
 * Optional confirmation: if the visitor gives an email address, one fixed-text
 * receipt (report ID only, no visitor-written content) is sent to it after the
 * team copy is accepted. Limits: one per report, CONFIRM_PER_ADDRESS_PER_DAY per
 * address (keyed by a one-way hash), and it shares the global daily cap.
 */
import * as C from '../../dist/atlas-core.js';

export const MAX_BODY_BYTES = 64 * 1024;
const SEND_TIMEOUT_MS = 12000;
const PENDING_STALE_MS = 2 * 60 * 1000;
const RECORD_TTL_S = 60 * 60 * 24 * 30;      // delivery-state records: 30 days
const PER_IP_PER_HOUR = 5;
const GLOBAL_PER_DAY = 200;
const CONFIRM_PER_ADDRESS_PER_DAY = 3;

const ITEM_KEYS = Object.keys(C.ITEM_FIELDS);
const BUDGET_KEYS = Object.keys(C.BUDGET_FIELDS);
const CONTEXT_KEYS = Object.keys(C.CONTEXT_FIELDS);
const REVIEW_KEYS = C.CHECKLIST.map(c => c.key);
const TOP_KEYS = ['schemaVersion', 'reportId', 'generatedAt', 'timeZone', 'item', 'budget', 'context', 'review', 'consent', 'contactEmail'];
const OPTIONAL_KEYS = ['timeZone', 'contactEmail'];
const ID_RE = /^MA-[0-9A-HJKMNP-TV-Z]{8}-[0-9A-HJKMNP-TV-Z]{8}$/;

export function sharingConfigured(env) {
  return env.SHARING_ENABLED === 'true' && Boolean(env.AGENTMAIL_API_KEY) && Boolean(env.SHARE_LOG);
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  });
}

const fail = (status, error, message, extra) => json(status, { state: 'rejected', error, message }, extra);

export function handleConfig(env) {
  const enabled = sharingConfigured(env);
  return json(200, enabled
    ? { sharing: { enabled: true, recipient: C.TEAM_RECIPIENT, consentVersion: C.CONSENT_VERSION } }
    : { sharing: { enabled: false } });
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch (e) { return false; }
}

function exactKeys(obj, allowed, required = allowed) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  return keys.every(k => allowed.includes(k)) && required.every(k => k in obj);
}

const allStrings = (obj, keys) => keys.every(k => typeof obj[k] === 'string');

/** Strictly validate the request body shape. Returns an error message or null. */
export function checkShape(body) {
  if (!exactKeys(body, TOP_KEYS, TOP_KEYS.filter(k => !OPTIONAL_KEYS.includes(k)))) return 'Unexpected or missing fields.';
  if (body.schemaVersion !== C.SCHEMA_VERSION) return 'unsupported_version';
  if (typeof body.reportId !== 'string' || !ID_RE.test(body.reportId)) return 'Invalid report identifier.';
  if (typeof body.generatedAt !== 'string' || Number.isNaN(Date.parse(body.generatedAt))) return 'Invalid timestamp.';
  if (body.timeZone !== undefined) {
    if (typeof body.timeZone !== 'string' || body.timeZone.length > 64) return 'Invalid time zone.';
    try { new Intl.DateTimeFormat('en-US', { timeZone: body.timeZone }); } catch (e) { return 'Invalid time zone.'; }
  }
  if (!exactKeys(body.item, ITEM_KEYS) || !allStrings(body.item, ITEM_KEYS)) return 'Invalid item fields.';
  if (!exactKeys(body.budget, BUDGET_KEYS) || !allStrings(body.budget, BUDGET_KEYS)) return 'Invalid budget fields.';
  if (!exactKeys(body.context, CONTEXT_KEYS) || !allStrings(body.context, CONTEXT_KEYS)) return 'Invalid report details.';
  if (!exactKeys(body.review, REVIEW_KEYS) || !REVIEW_KEYS.every(k => typeof body.review[k] === 'boolean')) return 'Invalid checklist.';
  if (!exactKeys(body.consent, ['selected', 'textVersion'])) return 'missing_consent';
  if (body.contactEmail !== undefined) {
    if (typeof body.contactEmail !== 'string' || !C.validateContactEmail(body.contactEmail).ok) return 'invalid_contact';
  }
  return null;
}

function base64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function reportLabel(reportId) {
  return 'report-' + reportId.toLowerCase();
}

/** Plain-text email body: a short summary. Raw user text stays in the attachment only. */
export function emailText(snapshot, receivedAt, contactEmail) {
  const s = snapshot, br = s.budget.results, ir = s.item.results;
  const reviewed = C.CHECKLIST.filter(c => s.review[c.key]).length;
  return [
    'A visitor chose to share a Microbiology Atlas planning report with the team.',
    '',
    'Report ID: ' + s.reportId,
    'Generated (visitor clock): ' + s.generatedAt,
    'Received (server): ' + receivedAt,
    'Schema ' + s.schemaVersion + ' · Formula ' + s.formulaVersion + ' · ' + s.currency,
    'Consent: version ' + s.sharing.consentTextVersion + ', captured ' + s.sharing.capturedAt,
    '',
    'Semester total: ' + C.formatUSD(br.totalCents) + ' for ' + C.formatCount(br.enrollment) + ' students (' + C.formatUSD(br.perStudentCents) + ' per student)',
    'Item plan: ' + C.formatCount(ir.packs) + ' packs, ' + C.formatUSD(ir.costCents),
    'Checklist: ' + reviewed + ' of ' + C.CHECKLIST.length + ' reviewed',
    'Uses illustrative example values: item ' + (s.illustrativeDefaults.item ? 'yes' : 'no') + ', budget ' + (s.illustrativeDefaults.budget ? 'yes' : 'no'),
    '',
    contactEmail
      ? 'Confirmation requested: the visitor gave ' + contactEmail + ' (set as Reply-To). Replying to this email reaches them.'
      : 'No contact address given; the visitor cannot be replied to.',
    '',
    'The complete report, including the visitor’s institution, course and notes, is attached as HTML.',
    'Retention: keep until the pilot ends, and for no more than 12 months (see /privacy).',
  ].join('\n');
}

async function hashIp(ip, hour) {
  // One-way hash, rotated hourly, so raw IP addresses are never stored.
  const data = new TextEncoder().encode('atlas-rl:' + hour + ':' + (ip || 'unknown'));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest.subarray(0, 12), b => b.toString(16).padStart(2, '0')).join('');
}

/** Fixed receipt text. Only the report ID varies; nothing the visitor typed is included. */
export function confirmationText(reportId) {
  return [
    'Thank you for sharing your planning report with the Microbiology Atlas team.',
    '',
    'We have received report ' + reportId + '.',
    '',
    'We use shared reports to understand whether the planner is useful and what to improve during the pilot. '
      + 'We keep them until the pilot ends, and for no more than 12 months. We will not add you to any mailing list.',
    '',
    'To ask a question, or to have this report deleted, reply to this email and include the report ID.',
    '',
    'If you did not share a report on Microbiology Atlas, you can ignore this message. No further emails will follow.',
    '',
    'Microbiology Atlas · https://microbiologyatlas.com/privacy',
  ].join('\n');
}

export function confirmLabel(reportId) {
  return 'confirm-' + reportId.toLowerCase();
}

async function sha(text) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest.subarray(0, 12), b => b.toString(16).padStart(2, '0')).join('');
}

async function confirmationAllowed(kv, email, now) {
  const day = Math.floor(now / 86400000);
  const key = 'rl:addr:' + (await sha('atlas-addr:' + email.toLowerCase())) + ':' + day;
  const count = Number((await kv.get(key)) || 0);
  if (count >= CONFIRM_PER_ADDRESS_PER_DAY) return false;
  await kv.put(key, String(count + 1), { expirationTtl: 90000 });
  return true;
}

/** Send the receipt. Never throws; returns 'sent' | 'failed' | 'limited'. */
async function sendConfirmation(env, fetchImpl, kv, email, reportId, now) {
  if (!(await confirmationAllowed(kv, email, now))) return 'limited';
  try {
    const res = await agentmail(env, fetchImpl, '/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        to: [email],
        subject: 'Microbiology Atlas received your report ' + reportId,
        text: confirmationText(reportId),
        labels: ['atlas-confirmation', confirmLabel(reportId)],
      }),
    });
    return res.ok ? 'sent' : 'failed';
  } catch (e) {
    return 'failed';
  }
}

async function rateLimited(kv, ip, now) {
  const hour = Math.floor(now / 3600000), day = Math.floor(now / 86400000);
  const ipKey = 'rl:ip:' + (await hashIp(ip, hour)) + ':' + hour;
  const dayKey = 'rl:day:' + day;
  const [ipCount, dayCount] = await Promise.all([kv.get(ipKey), kv.get(dayKey)]);
  if (Number(ipCount || 0) >= PER_IP_PER_HOUR || Number(dayCount || 0) >= GLOBAL_PER_DAY) return true;
  await Promise.all([
    kv.put(ipKey, String(Number(ipCount || 0) + 1), { expirationTtl: 3700 }),
    kv.put(dayKey, String(Number(dayCount || 0) + 1), { expirationTtl: 90000 }),
  ]);
  return false;
}

async function agentmail(env, fetchImpl, path, init) {
  const base = (env.AGENTMAIL_API_BASE || 'https://api.agentmail.to/v0').replace(/\/$/, '');
  const inbox = encodeURIComponent(env.AGENTMAIL_SENDER_INBOX || C.TEAM_RECIPIENT);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    return await fetchImpl(base + '/inboxes/' + inbox + path, {
      ...init,
      signal: controller.signal,
      headers: { authorization: 'Bearer ' + env.AGENTMAIL_API_KEY, 'content-type': 'application/json', ...(init && init.headers) },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Ask AgentMail whether a message for this report already exists (reconciliation after an uncertain send). */
export async function findSentMessage(env, fetchImpl, reportId) {
  const res = await agentmail(env, fetchImpl, '/messages?limit=5&labels=' + encodeURIComponent(reportLabel(reportId)), { method: 'GET' });
  if (!res.ok) throw new Error('lookup ' + res.status);
  const data = await res.json();
  const msg = (data.messages || []).find(m => (m.labels || []).includes(reportLabel(reportId)));
  return msg ? msg.message_id : null;
}

async function readRecord(kv, reportId) {
  const raw = await kv.get('report:' + reportId);
  return raw ? JSON.parse(raw) : null;
}
function writeRecord(kv, reportId, record) {
  return kv.put('report:' + reportId, JSON.stringify(record), { expirationTtl: RECORD_TTL_S });
}

/**
 * Resolve a stale or uncertain record by asking the provider. Returns the
 * updated record, or the unchanged record if the provider can't be reached.
 */
async function reconcile(env, fetchImpl, reportId, record, nowIso) {
  try {
    const messageId = await findSentMessage(env, fetchImpl, reportId);
    const next = messageId
      ? { state: 'accepted', messageId, updatedAt: nowIso, reconciled: true }
      : { state: 'failed', updatedAt: nowIso, reason: 'not_found_after_uncertain_send' };
    await writeRecord(env.SHARE_LOG, reportId, next);
    return next;
  } catch (e) {
    return record;
  }
}

export async function handleShare(request, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const now = deps.now ? deps.now() : Date.now();
  const nowIso = new Date(now).toISOString();

  if (!sharingConfigured(env)) return fail(503, 'email_unavailable', 'Sharing is not available right now. Your download is unaffected.');
  if (!sameOrigin(request)) return fail(403, 'forbidden', 'Requests must come from this website.');
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return fail(415, 'invalid_input', 'Send JSON.');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) return fail(413, 'too_large', 'The report is too large to share.');

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return fail(413, 'too_large', 'The report is too large to share.');
  let body;
  try { body = JSON.parse(raw); } catch (e) { return fail(400, 'invalid_input', 'Malformed JSON.'); }

  const shapeError = checkShape(body);
  if (shapeError === 'unsupported_version') return fail(400, 'unsupported_version', 'This page is out of date. Reload and try again.');
  if (shapeError === 'missing_consent') return fail(400, 'missing_consent', 'Sharing needs your explicit consent.');
  if (shapeError === 'invalid_contact') return fail(400, 'invalid_contact', 'Check the confirmation email address, or leave it blank.');
  if (shapeError) return fail(400, 'invalid_input', shapeError);
  if (body.consent.selected !== true) return fail(400, 'missing_consent', 'Sharing needs your explicit consent.');
  if (body.consent.textVersion !== C.CONSENT_VERSION) return fail(409, 'consent_outdated', 'The sharing terms have changed. Reload the page to review them.');
  if (Math.abs(Date.parse(body.generatedAt) - now) > 24 * 3600 * 1000) return fail(400, 'invalid_input', 'Report timestamp is out of range.');

  // Rebuild everything from raw inputs: client totals and HTML are never trusted.
  const built = C.buildSnapshot({
    itemRaw: body.item, budgetRaw: body.budget, contextRaw: body.context, checklist: body.review,
    reportId: body.reportId, generatedAt: body.generatedAt,
    sharing: { selected: true, consentTextVersion: body.consent.textVersion, capturedAt: now },
  });
  if (!built.ok) return fail(400, 'invalid_input', 'Some report values are invalid.', {});
  const snapshot = built.snapshot;
  const contactEmail = body.contactEmail ? C.validateContactEmail(body.contactEmail).value : '';

  const kv = env.SHARE_LOG;
  const existing = await readRecord(kv, snapshot.reportId);
  if (existing) {
    let rec = existing;
    if (rec.state === 'sending' && now - Date.parse(rec.updatedAt) > PENDING_STALE_MS) rec = await reconcile(env, fetchImpl, snapshot.reportId, rec, nowIso);
    if (rec.state === 'accepted') return json(200, { state: 'accepted', reportId: snapshot.reportId, duplicate: true, confirmation: rec.confirmation || 'none' });
    if (rec.state === 'sending' || rec.state === 'uncertain') {
      if (rec.state === 'uncertain') rec = await reconcile(env, fetchImpl, snapshot.reportId, rec, nowIso);
      if (rec.state === 'accepted') return json(200, { state: 'accepted', reportId: snapshot.reportId, duplicate: true, confirmation: rec.confirmation || 'none' });
      if (rec.state !== 'failed') return json(202, { state: 'pending', reportId: snapshot.reportId });
    }
    // state failed → allow a retry below
  }

  const ip = request.headers.get('cf-connecting-ip') || '';
  if (await rateLimited(kv, ip, now)) return fail(429, 'rate_limited', 'Too many reports have been shared recently. Try again later.', { 'retry-after': '3600' });

  await writeRecord(kv, snapshot.reportId, { state: 'sending', updatedAt: nowIso });

  const html = C.renderReportHtml(snapshot, { timeZone: body.timeZone });
  const message = {
    to: [C.TEAM_RECIPIENT],
    subject: 'Shared planning report ' + snapshot.reportId,
    text: emailText(snapshot, nowIso, contactEmail),
    ...(contactEmail ? { reply_to: [contactEmail] } : {}),
    labels: ['atlas-shared-report', reportLabel(snapshot.reportId)],
    attachments: [{ filename: C.reportFilename(snapshot), content_type: 'text/html', content: base64Utf8(html) }],
  };

  let res;
  try {
    res = await agentmail(env, fetchImpl, '/messages/send', { method: 'POST', body: JSON.stringify(message) });
  } catch (e) {
    // Timeout or network error: the provider may or may not have accepted it.
    await writeRecord(kv, snapshot.reportId, { state: 'uncertain', updatedAt: nowIso });
    return json(202, { state: 'uncertain', reportId: snapshot.reportId });
  }
  if (res.ok) {
    let messageId = null;
    try { messageId = (await res.json()).message_id || null; } catch (e) { /* accepted without a parsable body */ }
    // Record acceptance first, so a confirmation problem can never cause the report to be resent.
    await writeRecord(kv, snapshot.reportId, { state: 'accepted', messageId, updatedAt: nowIso, confirmation: contactEmail ? 'pending' : 'none' });
    let confirmation = 'none';
    if (contactEmail) {
      confirmation = await sendConfirmation(env, fetchImpl, kv, contactEmail, snapshot.reportId, now);
      await writeRecord(kv, snapshot.reportId, { state: 'accepted', messageId, updatedAt: nowIso, confirmation });
    }
    return json(200, { state: 'accepted', reportId: snapshot.reportId, confirmation });
  }
  if (res.status >= 500) {
    await writeRecord(kv, snapshot.reportId, { state: 'uncertain', updatedAt: nowIso, providerStatus: res.status });
    return json(202, { state: 'uncertain', reportId: snapshot.reportId });
  }
  await writeRecord(kv, snapshot.reportId, { state: 'failed', updatedAt: nowIso, providerStatus: res.status });
  return fail(502, 'email_unavailable', 'The email service did not accept the report. Your download is unaffected; you can try again.');
}

export async function handleStatus(request, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const now = deps.now ? deps.now() : Date.now();
  if (!sharingConfigured(env)) return fail(503, 'email_unavailable', 'Sharing is not available.');
  const reportId = new URL(request.url).searchParams.get('reportId') || '';
  if (!ID_RE.test(reportId)) return fail(400, 'invalid_input', 'Invalid report identifier.');
  let rec = await readRecord(env.SHARE_LOG, reportId);
  if (!rec) return json(404, { state: 'unknown', reportId });
  if (rec.state === 'uncertain' || (rec.state === 'sending' && now - Date.parse(rec.updatedAt) > PENDING_STALE_MS)) {
    rec = await reconcile(env, fetchImpl, reportId, rec, new Date(now).toISOString());
  }
  const state = rec.state === 'sending' ? 'pending' : rec.state;
  return json(200, { state, reportId });
}
