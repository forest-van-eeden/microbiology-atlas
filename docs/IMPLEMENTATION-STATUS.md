# Microbiology Atlas — implementation status

Updated 8 October 2026 after increment 2 (public site + report sharing).

Owner decisions on 8 October 2026: host on **Cloudflare Pages**; **public** site; owner named as **Forest van Eeden**; shared reports kept **until the pilot ends, no longer than 12 months**.

## Capability matrix

| Capability | Status |
| --- | --- |
| Item planner, semester budget, checklist, exports | Built; integer-cent formulas (formula v2); regression-tested |
| Combined HTML report | Built; versioned envelope, dated/ID filename, CSP-locked, offline + print tested |
| Validation and accessibility basics | Built; field errors, focus management, skip link, contrast scan on every page |
| About, Privacy, Disclosures, Contact, 404 pages | Built; content drafted from owner decisions; **owner should review** |
| Security headers | Built (`dist/_headers`): CSP, no framing, nosniff |
| Consent checkbox (unticked, exact spec wording, versioned) | Built; only shown when server reports sharing configured |
| `POST /api/reports/share` | Built: same-origin, ≤64 KB, strict schema, server recompute, fixed recipient, rate limits (hashed IP), idempotent per report ID |
| Uncertain-outcome handling | Built: status endpoint reconciles with AgentMail by message label; no automatic resend |
| Independent download/email status, retry | Built; retry reuses the same report |
| Tests | 65 unit + 25 browser, all passing locally (fake AgentMail) |
| Deployment to Cloudflare | **Not done** — needs GitHub repo + Cloudflare account setup (README → Deploying) |
| Live end-to-end email to team inbox | **Not done** — needs deployment and AgentMail API key |
| Screen-reader audit; Safari/Firefox/device matrix | Not done |
| Affiliate applications | Not started; site now has the pages programs usually review |

## Changes made for the public launch

- Removed public downloads of the internal market research and pilot plan (kept in `docs/`).
- Removed affiliate commission notes from supplier cards; supplier links described as ordinary unpaid links.
- “Private prototype” wording replaced with “independent pilot run by Forest van Eeden”.

## Spec vs baseline discrepancies (fixed in increment 1.1)

D1 money precision → integer cents · D2 report/schema/formula IDs · D3 dated filenames · D4 UTC + local time · D5 skip link and field-level errors · D6 keystroke announcements · D7 reload notice · D8 phone overflow · D9 CSP in reports · D10 export escaping · D11 contrast · D12 status wording · D13 totals beyond exact range · D14 ribbon over-claim.

## Open items for the owner

- Review the About, Privacy and Disclosures text (it is not legal advice).
- “Microbiology Atlas” has not been trademark-cleared.
- Confirm you can read `microbiology-atlas-team@agentmail.to` in the AgentMail console.
- Custom domain (optional): affiliate programs often prefer one over `*.pages.dev`.
