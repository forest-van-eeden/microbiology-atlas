"""Generate the static information pages in dist/ from one shared shell.

Run: python3 scripts/pages.py   (re-run after editing page content below)
Output is committed; Cloudflare Pages serves dist/ with no build step.
"""
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist"
UPDATED = "8 October 2026"
INBOX = "microbiology-atlas-team@agentmail.to"


def shell(slug, title, description, body):
    nav = "".join(
        f'<a href="/{s}"{" aria-current=\"page\"" if s == slug else ""}>{label}</a>'
        for s, label in [("", "Planner"), ("about", "About"), ("privacy", "Privacy"), ("disclosures", "Disclosures"), ("contact", "Contact")]
    )
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="{description}"><title>{title} — Microbiology Atlas</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"></head><body>
<a class="skip" href="#main">Skip to main content</a>
<header><a class="brand" href="/"><span class="mark" aria-hidden="true">◉</span> MICROBIOLOGY <b>ATLAS</b></a><nav aria-label="Main navigation">{nav}</nav></header>
<main id="main" tabindex="-1"><article class="page">
{body}
</article></main>
<footer><a class="brand" href="/">◉ MICROBIOLOGY <b>ATLAS</b></a><nav aria-label="Site information"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/disclosures">Disclosures</a><a href="/contact">Contact</a></nav><span>© 2026 Forest van Eeden · Independent; not affiliated with ASM or any supplier.</span></footer>
</body></html>
"""


PAGES = {}

PAGES["about"] = ("About", "Who runs Microbiology Atlas, what it is for, and how it is built.", f"""
<p class="eyebrow">ABOUT</p>
<h1>A small planning tool for teaching labs.</h1>
<p class="lead">Microbiology Atlas helps college and university microbiology teaching-lab coordinators, technicians and faculty plan purchases: what to buy given the stock they already have, what a semester will cost, and what to check before ordering.</p>

<h2>Who runs it</h2>
<p>Microbiology Atlas is an independent project run by <b>Forest van Eeden</b>. It is not affiliated with, sponsored by or endorsed by the American Society for Microbiology (ASM), any supplier, or any college or university. Links to ASM guidance are there because it is the most relevant public reference, not because ASM has reviewed this site.</p>

<h2>Where the project is</h2>
<p>This is a <b>pilot</b>. The planner, semester budget, checklist and downloadable report work today. We have not yet run interviews with coordinators, so we do not claim the tool fills a proven gap. The next step is to watch a handful of coordinators use it on real purchases and improve the part that helps most.</p>
<ul>
<li>Built: one-item stock and pack planner, semester budget, eight-point review checklist, downloadable report.</li>
<li>Not built: multi-item plans, live supplier prices, saved sessions, accounts or checkout.</li>
</ul>

<h2>How we decide what to say</h2>
<ul>
<li>The calculators show their formulas, and the report records the exact formula version used.</li>
<li>The planner will tell you to buy nothing when your stock already covers the need, even though that earns nothing for anyone.</li>
<li>We have not done hands-on product reviews. Supplier links are a starting point for your own research, not recommendations.</li>
<li>How we would handle any future paid relationships is set out on the <a href="/disclosures">disclosures page</a>.</li>
</ul>

<h2>Get in touch</h2>
<p>Feedback from people who plan teaching-lab purchases is the most useful thing you can send. See <a href="/contact">contact</a>.</p>
<p class="updated">Last updated {UPDATED}.</p>
""")

PAGES["privacy"] = ("Privacy", "What Microbiology Atlas does with the information you enter, including optional report sharing.", f"""
<p class="eyebrow">PRIVACY</p>
<h1>Your entries stay in your browser unless you choose to share.</h1>
<p class="lead">This page explains what happens to information on Microbiology Atlas. It is operated by Forest van Eeden (contact: <a href="mailto:{INBOX}">{INBOX}</a>).</p>

<h2>The planner and your downloads</h2>
<p>Everything you type into the item planner, semester budget, checklist and report details is processed by JavaScript in your own browser. It is not sent to us and not stored: reloading the page clears it. Downloads (the item plan, budget CSV, purchasing brief and complete report) are created on your device and are under your control.</p>
<p>We do not use cookies, advertising trackers or analytics scripts, and we do not create accounts.</p>

<h2 id="sharing">If you choose to share a report with the team</h2>
<p>Under the report form there is an optional, unticked box labelled “Share a copy with the Microbiology Atlas team”. Only if you tick it, clicking Download also sends a copy of that report to us. You can always download without sharing.</p>
<table>
<tr><th scope="row">What is sent</th><td>The complete report: your item plan and budget inputs and results, checklist selections, and any institution, course, term, “prepared by” name and notes you entered. Also a random report ID, the time the report was created, your browser's time zone (to format the date), and the version of the sharing wording you agreed to.</td></tr>
<tr><th scope="row">Who receives it</th><td>The Microbiology Atlas team inbox, {INBOX}, read by Forest van Eeden. It is not sent to your colleagues or anyone else.</td></tr>
<tr><th scope="row">Why</th><td>To learn whether the planner is useful and what to improve during the pilot. We do not use shared reports for marketing, add you to any list, or sell or share them.</td></tr>
<tr><th scope="row">Your email address</th><td>We do not ask for it, so we cannot reply unless you include contact details in your notes.</td></tr>
<tr><th scope="row">How long we keep it</th><td>Until the pilot ends, and in any case no longer than 12 months after we receive it. Then we delete it from the team mailbox.</td></tr>
</table>

<h2>Service providers</h2>
<ul>
<li><b>Cloudflare</b> hosts the website and runs the small server function that forwards shared reports. Like any web host, it processes technical request information such as IP addresses to deliver and protect the site.</li>
<li><b>AgentMail</b> provides the team mailbox and delivers shared reports to it.</li>
</ul>

<h2>Records we keep about sharing</h2>
<p>To prevent duplicate emails and abuse, the server keeps, for up to 30 days, the report ID, delivery status and timestamps for each shared report (never its contents). To limit how many reports one connection can send, it keeps a one-way hash of your IP address for about an hour.</p>

<h2>Your choices</h2>
<p>To ask us to delete a report you shared, or to ask what we hold, email <a href="mailto:{INBOX}">{INBOX}</a> with the report ID shown on the report. Deleting it from our mailbox may not immediately remove copies in our providers' backups.</p>

<h2>Changes</h2>
<p>If we change what is shared or who receives it, we will update the wording beside the sharing box and this page before the change takes effect.</p>
<p class="updated">Last updated {UPDATED}.</p>
""")

PAGES["disclosures"] = ("Disclosures and method", "How Microbiology Atlas is funded, how it handles supplier links, and what its calculations do and do not assess.", f"""
<p class="eyebrow">DISCLOSURES &amp; METHOD</p>
<h1>No paid relationships. Calculations you can check.</h1>

<h2>Compensation</h2>
<div class="callout"><p><b>Microbiology Atlas currently has no affiliate, sponsorship or advertising relationships.</b> Supplier links on this site are ordinary links. Nobody pays us when you follow them or buy something.</p></div>
<p>We may apply to supplier affiliate programs in the future. If any link starts earning a commission, we will:</p>
<ul>
<li>label it as paid next to the link itself, not just on this page;</li>
<li>update this page to name the program;</li>
<li>keep the calculators unchanged: quantities, pack counts and budgets will never depend on whether a supplier pays us;</li>
<li>keep recommending “buy nothing” when your existing stock already covers the need.</li>
</ul>

<h2>What the tools calculate</h2>
<ul>
<li><b>Item planner:</b> shortfall = max(0, required − usable stock); whole packs = shortfall ÷ pack size, rounded up; cost = packs × your quoted pack price. The “avoided spend” figure compares against buying the full requirement at the same price. It is not a verified saving.</li>
<li><b>Semester budget:</b> purchases = students × consumables per student + equipment + shared supplies + other costs; staffing = sections × prep hours × hourly rate; contingency applies to both. Amounts are handled in whole cents.</li>
</ul>

<h2>What they do not assess</h2>
<p>The tools do not judge whether a product is suitable, safe or compliant for your course or facility, and they do not model freight, tax, discounts or minimum orders unless you enter them. Biosafety, accessibility, procurement and educational decisions remain with your institution's responsible staff. ASM publishes <a href="https://asm.org/guideline/asm-guidelines-for-biosafety-in-teaching-laborator">teaching-lab biosafety guidance</a> and <a href="https://asm.org/guideline/asm-curriculum-guidelines-for-undergraduate-microb">curriculum guidelines</a>.</p>

<h2>Evidence and reviews</h2>
<p>We have not carried out hands-on product testing, and we have no customer testimonials. Any future comparison will state its method and sources, and distinguish supplier claims from our own testing and from user feedback.</p>
<p class="updated">Last updated {UPDATED}.</p>
""")

PAGES["contact"] = ("Contact", "How to reach the Microbiology Atlas team.", f"""
<p class="eyebrow">CONTACT</p>
<h1>Talk to us.</h1>
<p class="lead">Email <a href="mailto:{INBOX}">{INBOX}</a>. It is read by Forest van Eeden.</p>
<h2>Especially welcome</h2>
<ul>
<li>You plan or approve purchases for a microbiology teaching lab and would try the planner on a real purchase.</li>
<li>Something in a calculation looks wrong. Please include the report ID if you have one.</li>
<li>A correction to supplier or program information.</li>
<li>A request to delete a report you shared (include its report ID; see <a href="/privacy#sharing">privacy</a>).</li>
</ul>
<p>Please don't send purchase orders, payment details or student information.</p>
<p class="updated">Last updated {UPDATED}.</p>
""")

PAGES["404"] = ("Page not found", "Page not found.", """
<p class="eyebrow">404</p>
<h1>That page isn't here.</h1>
<p class="lead">Try the <a href="/">planner</a>, or the <a href="/about">about</a> page.</p>
""")

if __name__ == "__main__":
    for slug, (title, desc, body) in PAGES.items():
        (DIST / f"{slug}.html").write_text(shell(slug, title, desc, body.strip()), encoding="utf-8")
        print("wrote", slug + ".html")
