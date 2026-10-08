/* Microbiology Atlas — page wiring. Formulas, validation and file rendering live in atlas-core.js. */
import * as C from './atlas-core.js';

{
  const $ = id => document.getElementById(id);

  // Form element id → core field key.
  const ITEM_IDS = { name: 'itemname', requiredUnits: 'requiredunits', usableStock: 'stock', packSize: 'packsize', packPrice: 'packprice' };
  const BUDGET_IDS = {
    studentsPerSection: 'students', sections: 'sections', consumablesPerStudent: 'consumables', equipment: 'equipment',
    sharedSupplies: 'shared', prepHoursPerSection: 'hours', staffRate: 'labor', otherPurchases: 'other', contingencyPercent: 'contingency',
  };
  const CONTEXT_IDS = { institution: 'institution', course: 'course', term: 'term', preparedBy: 'preparedby', notes: 'reportnotes' };

  const buyForm = $('buy-form');
  const costForm = $('cost-form');
  const reportForm = $('report-form');
  const checks = Array.from(document.querySelectorAll('#checks input[type=checkbox]'));

  let item = null;   // latest valid item calculation, or null
  let budget = null; // latest valid budget calculation, or null

  // ---------- helpers ----------

  function read(ids) {
    const raw = {};
    for (const [key, id] of Object.entries(ids)) raw[key] = $(id).value;
    return raw;
  }

  function errorNode(input) {
    const id = input.id + '-error';
    let node = $(id);
    if (!node) {
      node = document.createElement('span');
      node.id = id;
      node.className = 'field-error';
      node.hidden = true;
      input.insertAdjacentElement('afterend', node);
      const described = (input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
      if (!described.includes(id)) described.push(id);
      input.setAttribute('aria-describedby', described.join(' '));
    }
    return node;
  }

  /** Show field errors for errors only on fields the person has touched, unless force is true. */
  function showErrors(ids, errors, force) {
    for (const [key, id] of Object.entries(ids)) {
      const input = $(id);
      const msg = errors && errors[key];
      const visible = Boolean(msg) && (force || input.dataset.touched === '1');
      const node = errorNode(input);
      node.textContent = visible ? msg : '';
      node.hidden = !visible;
      if (msg) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  }

  function firstInvalid(ids, errors) {
    for (const [key, id] of Object.entries(ids)) if (errors[key]) return $(id);
    return null;
  }

  function focusFirst(ids, errors, fallbackId) {
    (firstInvalid(ids, errors) || $(fallbackId)).focus();
  }

  function save(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function setText(id, text) { $(id).textContent = text; }

  // Announce a short summary after typing pauses, instead of reading every result on every keystroke.
  let announceTimer;
  function announce(message) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { $('announcer').textContent = message; }, 900);
  }

  function markTouched(e) { if (e.target && e.target.id) e.target.dataset.touched = '1'; }

  // ---------- item planner ----------

  const ITEM_OUTPUTS = ['buytotal', 'shortfall', 'packs', 'ordered', 'leftovers', 'avoided'];

  function calcBuy(opts) {
    const r = C.calculateItem(read(ITEM_IDS));
    showErrors(ITEM_IDS, r.ok ? null : r.errors, opts && opts.force);
    if (!r.ok) {
      item = null;
      ITEM_OUTPUTS.forEach(id => setText(id, '—'));
      $('buy-export').disabled = true;
      setText('buy-explanation', r.errors._form || 'Results are unavailable until the highlighted fields are corrected. Enter a name, whole-number quantities and a non-negative pack price to the cent. Pack size must be at least one.');
      if (opts && opts.announce) announce('Item plan unavailable: correct the highlighted fields.');
      return r;
    }
    item = r;
    const res = r.results;
    setText('buytotal', C.formatUSD(res.costCents));
    setText('shortfall', C.formatCount(res.shortfall));
    setText('packs', C.formatCount(res.packs));
    setText('ordered', C.formatCount(res.orderedUnits));
    setText('leftovers', C.formatCount(res.remainingUnits));
    setText('avoided', C.formatUSD(res.avoidedCents));
    setText('buy-explanation', C.itemExplanation(r));
    $('buy-export').disabled = false;
    if (opts && opts.announce) announce('Item plan: ' + C.formatCount(res.packs) + ' packs, ' + C.formatUSD(res.costCents) + '.');
    return r;
  }

  buyForm.addEventListener('input', e => { markTouched(e); calcBuy({ announce: true }); });
  buyForm.addEventListener('focusout', e => { markTouched(e); calcBuy(); });
  buyForm.addEventListener('submit', e => e.preventDefault());
  $('buy-export').addEventListener('click', () => {
    const r = calcBuy({ force: true });
    if (!r.ok) { focusFirst(ITEM_IDS, r.errors, 'requiredunits'); return; }
    save(C.renderItemMarkdown(r), 'teaching-lab-item-plan.md', 'text/markdown');
    setText('buy-status', 'Item plan download requested. This plan is separate from the semester budget; transfer its cost once to the appropriate category.');
  });

  // ---------- semester budget ----------

  const BUDGET_OUTPUTS = ['total', 'perstudent', 'enrollment', 'purchases', 'staffing', 'allowance'];

  function calc(opts) {
    const r = C.calculateBudget(read(BUDGET_IDS));
    showErrors(BUDGET_IDS, r.ok ? null : r.errors, opts && opts.force);
    if (!r.ok) {
      budget = null;
      BUDGET_OUTPUTS.forEach(id => setText(id, '—'));
      $('download').disabled = true;
      $('brief-download').disabled = true;
      setText('calc-status', r.errors._form || 'Results are unavailable until the highlighted fields are corrected. Class sizes must be positive whole numbers; costs must be non-negative amounts to the cent.');
      if (opts && opts.announce) announce('Semester budget unavailable: correct the highlighted fields.');
      return r;
    }
    budget = r;
    const res = r.results;
    setText('total', C.formatUSD(res.totalCents));
    setText('perstudent', C.formatUSD(res.perStudentCents));
    setText('enrollment', C.formatCount(res.enrollment));
    setText('purchases', C.formatUSD(res.purchasesCents));
    setText('staffing', C.formatUSD(res.staffingCents));
    setText('allowance', C.formatUSD(res.allowanceCents));
    $('download').disabled = false;
    $('brief-download').disabled = false;
    setText('calc-status', 'Planning estimate; no supplier pricing is implied.');
    if (opts && opts.announce) announce('Semester total ' + C.formatUSD(res.totalCents) + ', ' + C.formatUSD(res.perStudentCents) + ' per student.');
    return r;
  }

  costForm.addEventListener('input', e => { markTouched(e); calc({ announce: true }); });
  costForm.addEventListener('focusout', e => { markTouched(e); calc(); });
  costForm.addEventListener('submit', e => e.preventDefault());
  costForm.addEventListener('reset', () => setTimeout(() => {
    Object.values(BUDGET_IDS).forEach(id => { delete $(id).dataset.touched; });
    calc({ announce: true });
  }, 0));

  $('download').addEventListener('click', () => {
    const r = calc({ force: true });
    if (!r.ok) { focusFirst(BUDGET_IDS, r.errors, 'students'); return; }
    save(C.renderBudgetCsv(r), 'teaching-lab-budget.csv', 'text/csv');
  });

  // ---------- checklist ----------

  function review() {
    const out = {};
    checks.forEach(c => { out[c.value] = c.checked; });
    return out;
  }
  function updateChecks() {
    setText('check-status', checks.filter(c => c.checked).length + ' of ' + checks.length + ' reviewed · not saved after reload');
  }
  checks.forEach(c => c.addEventListener('change', updateChecks));

  $('brief-download').addEventListener('click', () => {
    const r = calc({ force: true });
    if (!r.ok) { focusFirst(BUDGET_IDS, r.errors, 'students'); return; }
    save(C.renderBriefMarkdown(r, review()), 'teaching-lab-purchasing-brief.md', 'text/markdown');
  });

  // ---------- complete report ----------

  reportForm.addEventListener('input', markTouched);

  // ---------- optional sharing with the team ----------
  // The checkbox only appears when the server confirms sharing is configured.
  let sharing = { enabled: false };
  let pending = null;   // { payload } for the last share attempt (retry reuses the same report id)
  let busy = false;

  fetch('/api/config', { headers: { accept: 'application/json' }, cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(cfg => {
      if (!cfg || !cfg.sharing || cfg.sharing.enabled !== true) return;
      if (cfg.sharing.consentVersion !== C.CONSENT_VERSION || cfg.sharing.recipient !== C.TEAM_RECIPIENT) return; // page and server disagree: stay off
      sharing = cfg.sharing;
      setText('share-label', C.CONSENT_LABEL);
      setText('share-text', C.CONSENT_TEXT);
      setText('share-email-label', C.CONTACT_LABEL);
      setText('share-email-help', C.CONTACT_HELP);
      $('share-team').checked = false;
      $('share-email').disabled = true;
      $('share-block').hidden = false;
    })
    .catch(() => { /* static hosting or offline: sharing stays unavailable; downloads unaffected */ });

  // The email box only works while sharing is ticked; it is never sent otherwise.
  $('share-team').addEventListener('change', () => {
    $('share-email').disabled = !$('share-team').checked;
    if (!$('share-team').checked) clearEmailError();
  });

  function emailError(msg) {
    const input = $('share-email');
    const node = errorNode(input);
    node.textContent = msg;
    node.hidden = false;
    input.setAttribute('aria-invalid', 'true');
  }
  function clearEmailError() {
    const input = $('share-email');
    const node = errorNode(input);
    node.textContent = '';
    node.hidden = true;
    input.removeAttribute('aria-invalid');
  }
  $('share-email').addEventListener('input', clearEmailError);

  function shareStatus(text, tone) {
    const el = $('share-status');
    el.hidden = !text;
    el.textContent = text || '';
    el.dataset.tone = tone || '';
  }

  const MESSAGES = {
    sending: 'Download requested. Sending your selected copy to the team…',
    accepted: id => 'The email service accepted your report (' + id + ') for delivery to the team.',
    confirmation: {
      sent: to => ' A confirmation email is on its way to ' + to + '.',
      failed: to => ' We couldn’t send the confirmation email to ' + to + ', but the team has your report.',
      limited: to => ' We’ve already sent several confirmations to ' + to + ' today, so we didn’t send another.',
      unknown: () => ' We couldn’t confirm whether a confirmation email was sent.',
    },
    failed: 'Your report download is available. Email sharing failed; try again.',
    uncertain: 'Your download is available. We could not confirm email status; checking before another send.',
    stillUnknown: id => 'Your download is available. We still could not confirm whether report ' + id + ' reached the team, so we have not sent it again. Please don’t resend; contact us with the report ID if you need to check.',
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function postShare(payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch('/api/reports/share', {
        method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      let data = {};
      try { data = await res.json(); } catch (e) { /* non-JSON error page */ }
      if (res.ok || res.status === 202) return { state: data.state || 'uncertain', confirmation: data.confirmation };
      return { error: data.error || 'email_unavailable', message: data.message };
    } catch (e) {
      return { state: 'uncertain' }; // timeout or connection lost after sending: outcome unknown
    } finally {
      clearTimeout(timer);
    }
  }

  async function checkStatus(reportId) {
    for (const wait of [3000, 8000, 20000]) {
      await sleep(wait);
      try {
        const res = await fetch('/api/reports/status?reportId=' + encodeURIComponent(reportId), { cache: 'no-store' });
        if (res.ok) {
          const { state } = await res.json();
          if (state === 'accepted' || state === 'failed') return { state };
        }
      } catch (e) { /* keep waiting */ }
    }
    return { state: 'unknown' };
  }

  async function share(payload) {
    busy = true;
    $('report-download').disabled = true;
    $('share-retry').hidden = true;
    pending = { payload };
    shareStatus(MESSAGES.sending, 'progress');
    let outcome = await postShare(payload);
    if (outcome.state === 'pending' || outcome.state === 'uncertain') {
      shareStatus(MESSAGES.uncertain, 'progress');
      outcome = await checkStatus(payload.reportId);
    }
    if (outcome.state === 'accepted') {
      let text = MESSAGES.accepted(payload.reportId);
      if (payload.contactEmail) {
        const c = MESSAGES.confirmation[outcome.confirmation] || MESSAGES.confirmation.unknown;
        text += c(payload.contactEmail);
      }
      shareStatus(text, 'ok');
      pending = null;
    } else if (outcome.state === 'failed') {
      shareStatus(MESSAGES.failed, 'error');
      $('share-retry').hidden = false;
    } else if (outcome.state === 'unknown') {
      shareStatus(MESSAGES.stillUnknown(payload.reportId), 'error');
      pending = null;
    } else {
      // Rejected by the server: show its reason. Retrying only helps for transient errors.
      shareStatus(outcome.error === 'email_unavailable' ? MESSAGES.failed
        : 'Your report download is available. ' + (outcome.message || 'Email sharing failed.'), 'error');
      $('share-retry').hidden = !(outcome.error === 'email_unavailable' || outcome.error === 'rate_limited');
      if ($('share-retry').hidden) pending = null;
    }
    busy = false;
    $('report-download').disabled = false;
  }

  $('share-retry').addEventListener('click', () => {
    if (pending && !busy) share(pending.payload);
  });

  function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }

  reportForm.addEventListener('submit', e => {
    e.preventDefault();
    if (busy) return; // a share is in flight: no second report until it settles
    const status = $('report-status');
    const itemRaw = read(ITEM_IDS), budgetRaw = read(BUDGET_IDS), contextRaw = read(CONTEXT_IDS), checklist = review();
    const built = C.buildSnapshot({
      itemRaw, budgetRaw, contextRaw, checklist,
      reportId: C.newReportId(randomBytes),
      generatedAt: Date.now(),
    });
    if (!built.ok) {
      calcBuy({ force: true });
      calc({ force: true });
      showErrors(CONTEXT_IDS, built.errors.context, true);
      const target = firstInvalid(ITEM_IDS, built.errors.item) || firstInvalid(BUDGET_IDS, built.errors.budget) || firstInvalid(CONTEXT_IDS, built.errors.context);
      const where = Object.keys(built.errors.item).length ? 'item planner' : Object.keys(built.errors.budget).length ? 'semester budget' : 'report details';
      status.textContent = 'Not downloaded. Correct the highlighted fields in the ' + where + ', then try again.';
      (target || $(Object.keys(built.errors.item).length ? 'requiredunits' : 'students')).focus();
      return;
    }
    showErrors(CONTEXT_IDS, null, false);
    const snapshot = built.snapshot;

    const wantsShare = sharing.enabled && !$('share-block').hidden && $('share-team').checked;
    let contactEmail = '';
    if (wantsShare) {
      const checked = C.validateContactEmail($('share-email').value);
      if (!checked.ok) {
        emailError(checked.error);
        status.textContent = 'Not downloaded. Check the confirmation email address, or leave it blank.';
        $('share-email').focus();
        return;
      }
      clearEmailError();
      contactEmail = checked.value;
    }
    let timeZone;
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (err) { timeZone = undefined; }

    // 1. Always download first, whatever the sharing choice.
    save(C.renderReportHtml(snapshot, { timeZone }), C.reportFilename(snapshot), 'text/html');

    $('share-retry').hidden = true;
    if (!wantsShare) {
      status.textContent = 'Download requested (report ' + snapshot.reportId + '). No copy was sent to the team. Open the HTML file in a browser to read, print or save as PDF.';
      shareStatus('');
      pending = null;
      return;
    }
    status.textContent = 'Download requested (report ' + snapshot.reportId + '). Open the HTML file in a browser to read, print or save as PDF.';
    // 2. Send the same raw inputs; the server rebuilds the identical report.
    const payload = {
      schemaVersion: C.SCHEMA_VERSION,
      reportId: snapshot.reportId,
      generatedAt: snapshot.generatedAt,
      ...(timeZone ? { timeZone } : {}),
      item: itemRaw, budget: budgetRaw,
      context: Object.fromEntries(Object.keys(CONTEXT_IDS).map(k => [k, contextRaw[k]])),
      review: snapshot.review,
      consent: { selected: true, textVersion: C.CONSENT_VERSION },
      ...(contactEmail ? { contactEmail } : {}),
    };
    share(payload);
  });

  // Initial render.
  calcBuy();
  calc();
  updateChecks();
}
