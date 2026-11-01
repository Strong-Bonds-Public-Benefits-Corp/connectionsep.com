# connectionsep.com

The Coffee & Connections El Paso website. Static HTML/CSS/JS, hosted on GitHub Pages.

## Structure

- `index.html` — Homepage (v3 "why first")
- `our-story.html` — Founder stories
- `checkin.html` — Resilience Check In (form + slider + tiered response)
- `market.html` — Resilience Market (product stories; Buy buttons deep-link to Square checkout)
- `contact.html` — Contact cards (group inboxes + socials)
- `css/main.css` — Site-wide stylesheet (all styling lives here — no inline CSS in HTML)
- `js/main.js` — Site-wide JavaScript (slider logic, check-in flow; bails quietly on pages without those elements)

## Rules (Tony's, non-negotiable)

- **No CSS or JS inside HTML files.** All styling in `css/main.css`, all behavior in `js/main.js`.
- **Locked copy** — hero, Marylou's story, scale (1 = struggling, 10 = thriving), "Resilience Check In" / "Resilience Heat Map" naming, "20-year U.S. Army SSG" — do not edit without founder approval.
- **Accessibility** — WCAG AA: 4.5:1+ contrast, heading hierarchy, aria labels, keyboard-accessible.
- **Demo only** — the check-in captures NO data yet. Production wiring (account wall, Heat Map pipeline) is Vic's lane, bones-first.

## Publishing

GitHub Pages serves this repo from the root. Custom domain: connectionsep.com (see `CNAME` when added).

## robots.txt — Meta AI training crawler (added Nov 1, 2026)

- **What:** `robots.txt` at the repo root blocks only `meta-externalagent`, the crawler Meta says collects content for training foundation AI models.
- **Why:** Meta's updated Commercial Terms for business accounts (originally effective Oct 30, 2026, delayed to Nov 20, 2026 after backlash) would let Meta crawl websites associated with a business account and use that content for its products, with no opt-out except stopping use of Meta's products for business. Tony's call, Nov 1, 2026: better safe early, before the Survivor Journal opens and real survivor stories go live on this site.
- **Scope, read carefully:** This blocks the *website* crawl only. It does NOT stop Meta training on public Instagram/Facebook posts themselves, and it is a request to compliant crawlers, not a contract.
- **What was deliberately NOT blocked:** `meta-externalfetcher` (link previews), so social sharing previews keep working. No other crawler (Google, etc.) is blocked by this file.
- **Do not link gated systems from business accounts:** the Sanctuary Vault / partner portal must never be linked from Instagram, Facebook, or this site's business-facing pages, or they could fall under the "associated with" crawl scope.
