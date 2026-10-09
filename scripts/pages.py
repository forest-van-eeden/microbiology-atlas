"""Generate the static information pages in dist/ from one shared shell.

Run: python3 scripts/pages.py   (re-run after editing page content below)
Output is committed; Cloudflare Pages serves dist/ with no build step.
"""
from pathlib import Path

DIST = Path(__file__).resolve().parent.parent / "dist"
UPDATED = "8 October 2026"
INBOX = "microbiology-atlas-team@agentmail.to"  # receives shared reports (named in the consent wording)
CONTACT = "hello@microbiologyatlas.com"       # general contact; forwards to the owner


def shell(slug, title, description, body):
    def current(s):
        return s == slug or (s == "guides" and slug.startswith("guides/"))
    nav = "".join(
        f'<a href="/{s}"{" aria-current=\"page\"" if current(s) else ""}>{label}</a>'
        for s, label in [("", "Planner"), ("guides", "Guides"), ("about", "About"), ("privacy", "Privacy"), ("disclosures", "Disclosures"), ("contact", "Contact")]
    )
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="{description}"><title>{title} — Microbiology Atlas</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"></head><body>
<a class="skip" href="#main">Skip to main content</a>
<header><a class="brand" href="/"><span class="mark" aria-hidden="true">◉</span> MICROBIOLOGY <b>ATLAS</b></a><nav aria-label="Main navigation">{nav}</nav></header>
<main id="main" tabindex="-1"><article class="page">
{body}
</article></main>
<footer><a class="brand" href="/">◉ MICROBIOLOGY <b>ATLAS</b></a><nav aria-label="Site information"><a href="/guides">Guides</a><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/disclosures">Disclosures</a><a href="/contact">Contact</a></nav><span>© 2026 Forest van Eeden · Independent; not affiliated with ASM or any supplier.</span></footer>
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
<p class="lead">This page explains what happens to information on Microbiology Atlas. It is operated by Forest van Eeden (contact: <a href="mailto:{CONTACT}">{CONTACT}</a>).</p>

<h2>The planner and your downloads</h2>
<p>Everything you type into the item planner, semester budget, checklist and report details is processed by JavaScript in your own browser. It is not sent to us and not stored: reloading the page clears it. Downloads (the item plan, budget CSV, purchasing brief and complete report) are created on your device and are under your control.</p>
<p>We do not use cookies, advertising trackers or analytics scripts, and we do not create accounts.</p>

<h2 id="sharing">If you choose to share a report with the team</h2>
<p>Under the report form there is an optional, unticked box labelled “Share a copy with the Microbiology Atlas team”. Only if you tick it, clicking Download also sends a copy of that report to us. You can always download without sharing.</p>
<table>
<tr><th scope="row">What is sent</th><td>The complete report: your item plan and budget inputs and results, checklist selections, and any institution, course, term, “prepared by” name and notes you entered. Also a random report ID, the time the report was created, your browser's time zone (to format the date), and the version of the sharing wording you agreed to.</td></tr>
<tr><th scope="row">Who receives it</th><td>The Microbiology Atlas team inbox, {INBOX}, read by Forest van Eeden. It is not sent to your colleagues or anyone else.</td></tr>
<tr><th scope="row">Why</th><td>To learn whether the planner is useful and what to improve during the pilot. We do not use shared reports for marketing, add you to any list, or sell or share them.</td></tr>
<tr><th scope="row">Your email address</th><td>Optional. If you enter one in the box under the sharing option, we send one email to that address confirming the team received your report. It contains only the report ID and a short fixed message. Your address is included with the copy sent to the team so we can reply about that report. We never add it to a mailing list or use it for anything else. If you leave the box blank, we can't reply unless you put contact details in your notes.</td></tr>
<tr><th scope="row">How long we keep it</th><td>Until the pilot ends, and in any case no longer than 12 months after we receive it. Then we delete it from the team mailbox.</td></tr>
</table>

<h2>Service providers</h2>
<ul>
<li><b>Cloudflare</b> hosts the website and runs the small server function that forwards shared reports. Like any web host, it processes technical request information such as IP addresses to deliver and protect the site.</li>
<li><b>AgentMail</b> provides the team mailbox and delivers shared reports to it.</li>
</ul>

<h2>Records we keep about sharing</h2>
<p>To prevent duplicate emails and abuse, the server keeps, for up to 30 days, the report ID, delivery status and timestamps for each shared report (never its contents). To limit how many reports one connection can send, it keeps a one-way hash of your IP address for about an hour. If you give an email address, it keeps a one-way hash of that address for about a day, so that no address can be sent more than three confirmations a day. Neither hash can be turned back into the original.</p>

<h2>Your choices</h2>
<p>To ask us to delete a report you shared, or to ask what we hold, email <a href="mailto:{CONTACT}">{CONTACT}</a> with the report ID shown on the report. Deleting it from our mailbox may not immediately remove copies in our providers' backups.</p>

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
<p class="lead">Email <a href="mailto:{CONTACT}">{CONTACT}</a>. It is read by Forest van Eeden.</p>
<p>Planning reports that visitors choose to share go to a separate team inbox, {INBOX}. Use the address above for everything else.</p>
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

PAGES["guides"] = ("Guides", "Practical purchasing guides for college microbiology teaching labs.", """
<p class="eyebrow">GUIDES</p>
<h1>Purchasing guides for teaching labs.</h1>
<p class="lead">Short, practical worksheets for the decisions that come up when equipping a microbiology teaching lab. Each one tells you what to settle before you ask for a quote, and what to compare when quotes arrive.</p>
<ul class="guide-list">
<li><a href="/guides/microscope-purchasing"><b>Buying microscopes for a microbiology teaching lab</b></a><span>What students need to see, how many instruments you need, the specification that matters, classroom durability, and a printable worksheet for comparing quotes.</span></li>
<li><a href="/guides/comparing-quotes"><b>Comparing supplier quotes for a teaching lab</b></a><span>How to compare quotes on total cost, timing and terms instead of pack price, with a printable comparison worksheet.</span></li>
<li><a href="/guides/equipment-review"><b>Reviewing the equipment you already own</b></a><span>How to check what the lab already has, sort it into usable, repair or retire, catch expired consumables, and find the real shortfall, with a printable inventory worksheet.</span></li>
</ul>
<p class="fine">Suggestions for further guides are welcome at the <a href="/contact">contact page</a>.</p>
""")

PAGES["guides/microscope-purchasing"] = ("Buying microscopes for a microbiology teaching lab", "A worksheet for specifying, counting and comparing compound microscopes for a college microbiology teaching lab.", """
<p class="eyebrow">GUIDE · MICROSCOPES</p>
<h1>Buying microscopes for a microbiology teaching lab.</h1>
<p class="lead">Microscopes are usually the largest single purchase in a teaching lab, and they last for years. This guide helps you settle what you need before you request quotes, so you can compare offers on the things that matter.</p>
<div class="callout"><p>This is a planning aid, not a product recommendation. It does not rank brands or models, and nobody pays us for anything on this page. Confirm specifications with your faculty and your institution's procurement and safety staff. <a href="/disclosures">How we work</a>.</p></div>

<nav class="toc" aria-label="On this page"><ol>
<li><a href="#see">What students need to see</a></li>
<li><a href="#count">How many you need</a></li>
<li><a href="#spec">The specification that matters</a></li>
<li><a href="#durable">Classroom durability</a></li>
<li><a href="#support">Service, parts and running costs</a></li>
<li><a href="#extras">Optional extras</a></li>
<li><a href="#worksheet">Printable worksheet</a></li>
</ol></nav>

<h2 id="see">1. Start with what students need to see</h2>
<p>The course decides the optics. Stained bacteria are the deciding case in most microbiology courses: resolving them needs a 100× oil-immersion objective. If any lab exercise involves Gram stains or other stained bacterial smears, every student microscope (or every one used for those exercises) needs one.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">If students will…</th><th scope="col">They need</th></tr></thead>
<tbody>
<tr><td>Examine stained bacteria (Gram stain, endospore, acid-fast)</td><td>100× oil-immersion objective, about 1,000× total magnification, plus a condenser able to match it (see below)</td></tr>
<tr><td>Look at fungi, protozoa or algae in wet mounts</td><td>40× objective is usually enough; unstained specimens may need phase contrast or careful use of the condenser diaphragm</td></tr>
<tr><td>Observe live, unstained bacteria or motility</td><td>Phase contrast or darkfield, which are add-ons with their own cost</td></tr>
<tr><td>Study colonies, plates or larger specimens</td><td>A stereo (dissecting) microscope, which is a different instrument</td></tr>
</tbody></table></div>
<p>Check your lab manual and syllabus against this table before deciding anything else. <a href="https://asm.org/guideline/asm-curriculum-guidelines-for-undergraduate-microb">ASM's curriculum guidelines</a> include microscopy among the laboratory skills students should develop.</p>

<h2 id="count">2. Work out how many you need</h2>
<p>For microscopes, the count is about how many students are at the bench at the same time, not total enrollment.</p>
<ul>
<li><b>Seats per section:</b> one microscope per student, or one per pair? Pairs halve the cost but halve each student's time at the eyepieces.</li>
<li><b>Overlapping sections:</b> if two sections ever run at once, you need enough for both.</li>
<li><b>Spares:</b> plan for one or two instruments out for repair at any time, so a broken one doesn't leave a student without a microscope.</li>
<li><b>What you already own:</b> count only instruments that meet the specification below and work reliably.</li>
</ul>
<p>The <a href="/#buy-plan">item planner</a> does this arithmetic for you: enter the microscopes you need as "units required", the working ones you own as "usable stock", and a pack size of 1.</p>

<h2 id="spec">3. The specification that matters</h2>
<p>Most of what separates a frustrating teaching microscope from a good one comes down to a few lines on the quote. Ask every supplier to state each of these.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Feature</th><th scope="col">What to ask for</th><th scope="col">Why it matters</th></tr></thead>
<tbody>
<tr><td>Objectives</td><td>4×, 10×, 40× and 100× oil immersion. Ask for the numerical aperture (NA) of each, for example 0.65 for the 40× and about 1.25 for the 100× oil.</td><td>Resolution depends on NA, not on magnification. A high magnification with a low NA just enlarges blur.</td></tr>
<tr><td>Objective grade</td><td>"Achromat" is the usual teaching grade. "Plan achromat" gives a field that is sharp to the edges, at higher cost.</td><td>Plan objectives make it easier for students to see the whole field in focus. Decide whether that is worth the difference.</td></tr>
<tr><td>Condenser</td><td>An Abbe condenser with NA 1.25, an iris (aperture) diaphragm and adjustable height.</td><td>The condenser has to match the 100× objective's NA. A lower-NA condenser limits what that objective can resolve.</td></tr>
<tr><td>Parfocal and parcentered objectives</td><td>Confirm both.</td><td>Students stay in focus and on target when switching objectives, which saves time and slides.</td></tr>
<tr><td>Objective thread standard</td><td>Ask which standard the objectives use and whether replacements are sold separately.</td><td>A standard thread means a damaged objective can be replaced on its own instead of the whole microscope.</td></tr>
<tr><td>Eyepieces and head</td><td>10× wide-field eyepieces; binocular head with interpupillary and diopter adjustment.</td><td>Binocular heads with adjustment are easier on students who spend a whole lab period at the eyepieces, including those who wear glasses.</td></tr>
<tr><td>Illumination</td><td>LED with adjustable intensity.</td><td>Runs cool and long-lived. Ask about the expected bulb or LED life and replacement cost.</td></tr>
<tr><td>Stage</td><td>Mechanical stage with slide holder and coaxial X–Y controls.</td><td>Lets students scan a smear systematically instead of pushing slides by hand.</td></tr>
</tbody></table></div>
<p class="fine">Background on numerical aperture and condensers: <a href="https://evidentscientific.com/en/microscope-resource/knowledge-hub/anatomy/numaperture">Evident Scientific, "Numerical Aperture"</a>. Oil immersion is needed because air limits a dry objective to an NA below 1.0.</p>

<h2 id="durable">4. Classroom durability</h2>
<p>Teaching microscopes are handled by many inexperienced users. These features reduce damage and loss.</p>
<ul>
<li><b>Spring-loaded (retractable) 40× and 100× objectives,</b> so a lens driven into a slide retracts instead of cracking the slide or the lens.</li>
<li><b>A focus stop or tension control,</b> so the stage can't be raised into the objective or drift down during use.</li>
<li><b>Locking eyepieces and objectives,</b> if equipment goes missing in your setting.</li>
<li><b>A carrying handle, cord storage and dust covers,</b> because microscopes move between storage and benches every session.</li>
<li><b>Focus mechanism construction:</b> ask what the gears are made of and what the warranty says about them, since focus mechanisms take the most wear.</li>
</ul>

<h2 id="support">5. Service, parts and running costs</h2>
<ul>
<li>Warranty length, and what it excludes (optics, electronics, damage from use).</li>
<li>Whether repairs are done locally or the instrument must be shipped away, and for how long.</li>
<li>Availability and price of replacement objectives, eyepieces, LEDs and stage parts.</li>
<li>Whether the supplier offers cleaning or servicing visits, and their cost.</li>
<li>Running costs to include in your <a href="/#tool">semester budget</a>: immersion oil, lens paper and cleaning solution, slides and coverslips, and staff time for cleaning and maintenance.</li>
</ul>

<h2 id="extras">6. Optional extras</h2>
<ul>
<li><b>A camera or trinocular head</b> on the instructor's microscope, so a specimen can be shown to the whole class.</li>
<li><b>Phase contrast or darkfield,</b> if live, unstained organisms are part of the course.</li>
<li><b>Storage cabinets</b> that keep instruments covered and secured between sessions.</li>
</ul>

<h2 id="worksheet">7. Printable worksheet</h2>
<p>Print this page (Ctrl+P or ⌘P) and fill in the table below for each quote you receive. For comparing costs, delivery and terms in more detail, see <a href="/guides/comparing-quotes">comparing supplier quotes</a>. Choose "Save as PDF" in the print dialog to keep a digital copy.</p>
<div class="table-wrap"><table class="worksheet">
<thead><tr><th scope="col">Requirement</th><th scope="col">Our need</th><th scope="col">Quote A</th><th scope="col">Quote B</th><th scope="col">Quote C</th></tr></thead>
<tbody>
<tr><td>Supplier and model</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Quantity (including spares)</td><td></td><td></td><td></td><td></td></tr>
<tr><td>100× oil objective NA</td><td>≥ 1.25</td><td></td><td></td><td></td></tr>
<tr><td>Condenser NA, iris diaphragm</td><td>1.25, yes</td><td></td><td></td><td></td></tr>
<tr><td>Objective grade (achromat / plan)</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Parfocal and parcentered</td><td>Yes</td><td></td><td></td><td></td></tr>
<tr><td>Binocular, interpupillary and diopter adjustment</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Illumination type and life</td><td>LED</td><td></td><td></td><td></td></tr>
<tr><td>Spring-loaded 40× and 100×</td><td>Yes</td><td></td><td></td><td></td></tr>
<tr><td>Mechanical stage, coaxial controls</td><td>Yes</td><td></td><td></td><td></td></tr>
<tr><td>Warranty (years, exclusions)</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Repair arrangements</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Replacement objective price</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Unit price</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Freight, tax, other charges</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Total quoted cost</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Delivery date</td><td></td><td></td><td></td><td></td></tr>
<tr><td>Quote valid until</td><td></td><td></td><td></td><td></td></tr>
</tbody></table></div>

<h2>Where to request quotes</h2>
<p>Your institution may already have approved suppliers or contract pricing, so check with your purchasing office first. The <a href="/#suppliers">supplier research section</a> on the planner lists educational suppliers to start with. Those are ordinary, unpaid links.</p>
<p class="updated">Last updated 9 October 2026.</p>
""")

PAGES["guides/comparing-quotes"] = ("Comparing supplier quotes for a teaching lab", "How to compare supplier quotes for a college microbiology teaching lab on total cost, timing and terms, with a printable worksheet.", """
<p class="eyebrow">GUIDE · QUOTES</p>
<h1>Comparing supplier quotes for a teaching lab.</h1>
<p class="lead">Two quotes for the same order rarely line up. One has a lower unit price but larger packs, another adds freight or cold-shipping charges, a third arrives after the lab starts. This guide helps you compare them on what you will actually pay and when you will actually have the items.</p>
<div class="callout"><p>This is a planning aid, not a recommendation of any supplier. Your institution's purchasing rules come first. <a href="/disclosures">How we work</a>.</p></div>

<nav class="toc" aria-label="On this page"><ol>
<li><a href="#same">Ask for the same thing</a></li>
<li><a href="#units">Compare per usable unit</a></li>
<li><a href="#total">Add up the total cost</a></li>
<li><a href="#timing">Check timing</a></li>
<li><a href="#terms">Read the terms</a></li>
<li><a href="#route">Follow your institution's route</a></li>
<li><a href="#qworksheet">Printable worksheet</a></li>
</ol></nav>

<h2 id="same">1. Ask every supplier for the same thing</h2>
<p>Quotes can only be compared if they answer the same request. Send each supplier the same written list: item descriptions, the specification that matters (for microscopes, see the <a href="/guides/microscope-purchasing">microscope guide</a>), quantities, your delivery address and the date you need everything by.</p>
<ul>
<li>Ask suppliers to say clearly if they are offering a substitute, and what is different about it.</li>
<li>Ask for prices to be broken down by line, not as a single bundle price.</li>
<li>Ask for freight, handling and any special shipping charges to be shown separately.</li>
</ul>

<h2 id="units">2. Compare per usable unit, not per pack</h2>
<p>Suppliers sell the same item in different pack sizes, so pack prices are not comparable. Convert each quote to what you will actually buy:</p>
<ul>
<li><b>Whole packs needed:</b> your shortfall divided by the pack size, rounded up. The <a href="/#buy-plan">item planner</a> does this for you and shows what will be left over.</li>
<li><b>Cost for the packs you need:</b> packs × pack price. A cheaper pack price can still cost more overall if the pack size forces you to buy more than you need.</li>
<li><b>Cost per unit you will use:</b> the total divided by the units you actually need, not the units you receive.</li>
</ul>

<h2 id="total">3. Add up the total cost</h2>
<p>The figure to compare is what lands on your budget, not the line prices. Check each quote for:</p>
<ul>
<li><b>Freight and handling,</b> including minimum-order or small-order fees.</li>
<li><b>Special shipping</b> for live cultures, perishable media or regulated chemicals. Ask whether cold packs, expedited shipping or hazardous-materials fees apply.</li>
<li><b>Tax.</b> Many institutions have tax exemptions. Ask your purchasing office whether the supplier needs an exemption certificate on file.</li>
<li><b>Discounts:</b> educational, volume or contract pricing, and whether they depend on ordering by a certain date.</li>
<li><b>Ongoing costs</b> that come with the purchase, such as consumables, service or replacement parts.</li>
</ul>
<p>Enter the chosen supplier's total once, in the right category of your <a href="/#tool">semester budget</a>.</p>

<h2 id="timing">4. Check timing against your lab schedule</h2>
<ul>
<li><b>Delivery date versus first use:</b> leave time to receive, check and set up items before the lab that needs them.</li>
<li><b>Perishables:</b> for cultures, media and reagents, ask about shelf life and whether delivery can be scheduled close to the date of use.</li>
<li><b>Backorders:</b> ask whether every line is in stock, and what happens if one is not.</li>
<li><b>Quote validity:</b> note the expiry date, especially if your approval process takes weeks.</li>
</ul>

<h2 id="terms">5. Read the terms</h2>
<ul>
<li>Returns and damaged-shipment policy, particularly for live or perishable items.</li>
<li>Warranty and repair arrangements for equipment.</li>
<li>Whether the supplier may substitute an "equivalent" item without asking you.</li>
<li>Payment terms your institution can accept, such as purchase orders or invoicing.</li>
</ul>

<h2 id="route">6. Follow your institution's purchasing route</h2>
<p>Before choosing, check with your purchasing office. Many institutions have approved suppliers, negotiated contract prices or cooperative purchasing agreements that can change which quote is best, and some require more than one quote above a spending threshold. Keep the quotes and your comparison with your purchase request, so approvers can see why you chose the supplier you did.</p>

<h2 id="qworksheet">7. Printable worksheet</h2>
<p>Print this page (Ctrl+P or ⌘P) and fill in one column per quote. Choose "Save as PDF" in the print dialog to keep a digital copy.</p>
<div class="table-wrap"><table class="worksheet">
<thead><tr><th scope="col">Line</th><th scope="col">Quote A</th><th scope="col">Quote B</th><th scope="col">Quote C</th></tr></thead>
<tbody>
<tr><td>Supplier and quote number</td><td></td><td></td><td></td></tr>
<tr><td>Item offered (substitute?)</td><td></td><td></td><td></td></tr>
<tr><td>Units per pack</td><td></td><td></td><td></td></tr>
<tr><td>Packs needed</td><td></td><td></td><td></td></tr>
<tr><td>Price per pack</td><td></td><td></td><td></td></tr>
<tr><td>Subtotal (packs × price)</td><td></td><td></td><td></td></tr>
<tr><td>Discounts</td><td></td><td></td><td></td></tr>
<tr><td>Freight and handling</td><td></td><td></td><td></td></tr>
<tr><td>Special shipping (cold, hazardous)</td><td></td><td></td><td></td></tr>
<tr><td>Tax</td><td></td><td></td><td></td></tr>
<tr><td>Total cost</td><td></td><td></td><td></td></tr>
<tr><td>Cost per unit you need</td><td></td><td></td><td></td></tr>
<tr><td>Delivery date</td><td></td><td></td><td></td></tr>
<tr><td>Quote valid until</td><td></td><td></td><td></td></tr>
<tr><td>Returns / warranty</td><td></td><td></td><td></td></tr>
<tr><td>Approved supplier or contract?</td><td></td><td></td><td></td></tr>
<tr><td>Notes</td><td></td><td></td><td></td></tr>
</tbody></table></div>
<p class="updated">Last updated 9 October 2026.</p>
""")

PAGES["guides/equipment-review"] = ("Reviewing the equipment you already own", "How to review existing microbiology teaching-lab equipment and supplies before buying, with a printable inventory worksheet.", """
<p class="eyebrow">GUIDE · EXISTING EQUIPMENT</p>
<h1>Reviewing the equipment you already own.</h1>
<p class="lead">The cheapest purchase is the one you don't need to make. Before ordering for a new term, check what the lab already has, what condition it's in, and what has quietly expired. The result is a count of usable stock you can trust when you plan what to buy.</p>
<div class="callout"><p>This is a planning aid. Questions of safety, servicing and certification belong to your institution's environmental health and safety (EHS) or biosafety staff, and to the equipment manufacturer. Don't use equipment you suspect is faulty. <a href="/disclosures">How we work</a>.</p></div>

<nav class="toc" aria-label="On this page"><ol>
<li><a href="#list">Make the list</a></li>
<li><a href="#condition">Check condition</a></li>
<li><a href="#sort">Sort into usable, repair, retire</a></li>
<li><a href="#consumables">Check consumables and dates</a></li>
<li><a href="#capacity">Compare against what the course needs</a></li>
<li><a href="#eworksheet">Printable worksheet</a></li>
</ol></nav>

<h2 id="list">1. Make the list</h2>
<p>Walk the lab, prep room and storage with the worksheet below. For each item, note where it is, how many there are, the make and model, and roughly when it was bought. Include equipment that is rarely used: it is often the thing nobody remembers until a lab needs it.</p>
<p>If your department already keeps an asset register, start from that and check it against what is actually on the shelves.</p>

<h2 id="condition">2. Check condition</h2>
<p>A quick look catches most problems. These are common checks for teaching-lab equipment; follow the manufacturer's instructions and your institution's procedures for anything more.</p>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Equipment</th><th scope="col">What to look for</th></tr></thead>
<tbody>
<tr><td>Microscopes</td><td>Clean optics without haze or residue; smooth focus that holds position; working light; stage controls that move freely; all objectives present. The <a href="/guides/microscope-purchasing">microscope guide</a> lists the specification a teaching microscope needs.</td></tr>
<tr><td>Incubators</td><td>Holds the set temperature: check against a separate thermometer over a day. Door seals intact.</td></tr>
<tr><td>Autoclaves</td><td>Service and inspection records up to date, and the cycle verification your institution requires. Ask EHS what applies; autoclaves are pressure vessels.</td></tr>
<tr><td>Biological safety cabinets</td><td>Date of last certification, and whether it is still current under your institution's schedule. Don't rely on a cabinet whose certification has lapsed.</td></tr>
<tr><td>Pipettes</td><td>Date of last calibration or check; no leaks or damaged tip cones.</td></tr>
<tr><td>Balances</td><td>Calibration date; level; reads correctly with a check weight.</td></tr>
<tr><td>Water baths, hot plates, heat blocks</td><td>Reach and hold temperature; cords and plugs undamaged.</td></tr>
<tr><td>Centrifuges</td><td>Lid lock works; rotor and buckets undamaged; service date.</td></tr>
<tr><td>Glassware</td><td>No chips, cracks or star fractures, especially on items that will be autoclaved or heated.</td></tr>
</tbody></table></div>

<h2 id="sort">3. Sort everything into usable, repair or retire</h2>
<ul>
<li><b>Usable:</b> works, meets the course's needs, and is within any required service or certification date. Only these count as usable stock in the <a href="/#buy-plan">item planner</a>.</li>
<li><b>Repair:</b> worth fixing. Get a repair quote and compare it with the cost of replacing, using the <a href="/guides/comparing-quotes">quote comparison guide</a>. Note how long the repair will take.</li>
<li><b>Retire:</b> unsafe, beyond economic repair, or no longer suitable. Follow your institution's disposal or surplus process, which may require decontamination first.</li>
</ul>

<h2 id="consumables">4. Check consumables and dates</h2>
<ul>
<li><b>Expiry dates</b> on media, stains, reagents, antibiotic discs and test kits. Note anything expiring before or during the term.</li>
<li><b>Storage conditions:</b> items that should be refrigerated or kept dark, and whether they have been.</li>
<li><b>Opened containers</b> that may have a shorter life once opened.</li>
<li><b>Stock rotation:</b> put newer stock behind older stock so the older is used first.</li>
<li><b>Expired chemicals and reagents</b> go through your institution's chemical disposal process, not the bin or the drain.</li>
</ul>

<h2 id="capacity">5. Compare against what the course needs</h2>
<p>For each item, compare the usable count with how many the course needs at the same time (for equipment) or in total across the term (for consumables). The difference is your shortfall. Enter it in the <a href="/#buy-plan">item planner</a> to see how many packs to order, and put the cost in the <a href="/#tool">semester budget</a>.</p>

<h2 id="eworksheet">6. Printable worksheet</h2>
<p>Print this page (Ctrl+P or ⌘P) and take it round the lab. Choose "Save as PDF" in the print dialog to keep a digital copy.</p>
<div class="table-wrap"><table class="worksheet">
<thead><tr><th scope="col">Item and model</th><th scope="col">Location</th><th scope="col">Qty</th><th scope="col">Usable / repair / retire</th><th scope="col">Last service, calibration or expiry</th><th scope="col">Action</th></tr></thead>
<tbody>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>
</tbody></table></div>
<p class="updated">Last updated 9 October 2026.</p>
""")

PAGES["404"] = ("Page not found", "Page not found.", """
<p class="eyebrow">404</p>
<h1>That page isn't here.</h1>
<p class="lead">Try the <a href="/">planner</a>, or the <a href="/about">about</a> page.</p>
""")

if __name__ == "__main__":
    for slug, (title, desc, body) in PAGES.items():
        (DIST / f"{slug}.html").parent.mkdir(parents=True, exist_ok=True)
        (DIST / f"{slug}.html").write_text(shell(slug, title, desc, body.strip()), encoding="utf-8")
        print("wrote", slug + ".html")
