# Microbiology Atlas sitemap

Hosting: Cloudflare Pages (static `dist/` + Functions in `functions/`). Audience: public (owner decision, 8 October 2026).

## Pages
- `/` — planner (one page with section anchors)
  - `/#buy-plan` — item stock and pack planner
  - `/#tool` — semester budget
  - `/#checklist` — purchasing review checklist
  - `/#takeaway` — personalized report + optional team sharing
  - teaching principles (no anchor)
  - `/#suppliers` — supplier starting points (ordinary unpaid links)
  - `/#pilot` — pilot purpose and validation plan
  - `/#research` — transparency
- `/about` — owner (Forest van Eeden), purpose, pilot status, editorial approach
- `/privacy` — local processing, optional sharing, providers, retention (until pilot ends, max 12 months)
- `/disclosures` — compensation (none), future affiliate labelling, calculation method
- `/contact` — team inbox
- `/404` — not found

## Endpoints (not pages; excluded by robots.txt)
- `GET /api/config` — whether sharing is configured
- `POST /api/reports/share` — consent-gated report email to microbiology-atlas-team@agentmail.to
- `GET /api/reports/status?reportId=` — delivery state after an uncertain outcome

## Generated locally in the browser (not routes)
- `teaching-lab-item-plan.md`, `teaching-lab-budget.csv`, `teaching-lab-purchasing-brief.md`
- `teaching-lab-purchasing-report-YYYY-MM-DD-<report id>.html`

## Removed from the public site
- `/research-brief.md`, `/pilot-plan.md` — internal strategy; kept in `docs/`.

No public report archive or share links. Generated files and report IDs never appear in a search sitemap.
