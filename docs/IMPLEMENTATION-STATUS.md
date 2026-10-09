# Microbiology Atlas — implementation status

Updated 8 October 2026: increment 2 live (public site + report sharing, verified end to end).

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
| Optional confirmation email | Built: optional address (enabled only when sharing is ticked) → one fixed-text receipt with the report ID; team copy gets Reply-To; ≤3 receipts per address per day (hashed); never resent on duplicates; failure doesn't affect the report. Consent version `2026-10-08.2`; privacy page updated. **Live test 8 Oct 2026 13:36 EDT**: report MA-N5GZZT23-M3TTNE06 with confirmation → team copy and receipt both received. Delivery to outside providers (e.g. Gmail), and the Reply-To header itself, not yet verified |
| Tests | 76 unit + 28 browser, all passing locally (fake AgentMail) |
| Custom domain | microbiologyatlas.com (registered at Namecheap 9 Oct 2026; nameservers → Cloudflare: davina/dom.ns.cloudflare.com). Apex and www attached to Pages; `functions/_middleware.js` 301-redirects www and microbiology-atlas.pages.dev to https://microbiologyatlas.com (API and previews exempt). Email: Cloudflare Email Routing; hello@microbiologyatlas.com forwards to the owner's Gmail (old Namecheap forwarding records removed). Site contact address is hello@; shared reports still go to the AgentMail team inbox |
| Deployment to Cloudflare | **Live** at https://microbiology-atlas.pages.dev (8 Oct 2026); auto-deploys from `main` of github.com/forest-van-eeden/microbiology-atlas; KV `SHARE_LOG` bound; `AGENTMAIL_API_KEY` secret (inbox-scoped key); `SHARING_ENABLED=true` |
| Live end-to-end email to team inbox | **Verified 8 Oct 2026 13:27 EDT**: test report MA-QDJ529B4-E3DKZDZ2 sent from the live site; received in microbiology-atlas-team@agentmail.to with both labels and the 7.7 KB attachment (filename and size match the download); `/api/reports/status` returns `accepted`. Team inbox sends to itself successfully. |
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
