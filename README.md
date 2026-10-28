# connectionsep.com — Site Build README

## Structure
```
connectionsep.com/  (repo root — GitHub Pages serves from here)
├── index.html, our-story.html, checkin.html, heat-map.html, market.html, contact.html
├── css/main.css  → ALL stylesheets. No <style> blocks in HTML, ever.
├── js/main.js    → ALL scripts. No inline <script> in HTML, ever.
├── README.md     → This file.
└── README/       → Founder Story Call Template (reference).
```

## Rules (Tony's)
1. **CSS stays separate.** Every page links `css/main.css`. Brand palette lives once in `:root` — change it there, it changes everywhere.
2. **JS stays separate.** Every page loads `js/main.js` at the end of `<body>`. The script bails quietly on pages without the elements it needs (slider, check-in form, map).
3. **Think before building.** Debate pro/con in the side chat before execution. If it's dumb, say so — "Rank does not fix stupid" applies here too.
4. **Accessibility is non-negotiable.** 4.5:1+ contrast, heading hierarchy, aria labels, keyboard-accessible, `aria-live` on dynamic content. This is what Lighthouse scores.
5. **Locked copy — do not edit without approval:**
   - Hero: "Fort Bliss nearly ended my life. Then Marylou gave me an idea — and building it saved me." — Tony Sorensen, Founder
   - Marylou's story: her exact words, she typed them herself (2026-10-14). Do not touch.
   - Scale: 1 = struggling, 10 = thriving.
   - Naming: "Resilience Check In" / "Resilience Heat Map" everywhere. Never "pulse check" / "mood bar" / "mental health heat map."
   - Service line: "20-year U.S. Army SSG" (not 19).
   - Entity: "Strong Bonds Public Benefit Corporation."

## Current state (2026-10-27)
- Site LIVE on GitHub Pages (github.io) since Oct 27, 2026. Custom domain connectionsep.com pending (CNAME file + Porkbun DNS).
- Homepage (v3 "why first") approved by Tony + Marylou. Why section: shared quote + Tony's voice + Marylou's voice (Marylou signed off Oct 26).
- Our Story: Tony + Marylou sections locked. Dawn + Vic placeholders removed Oct 26 — they return when their stories are ready.
- Check In restructured Oct 27: Heat Map fields first (Zip required; Birth Year; Race / Ethnicity; Military Connection; Branch of service, shown only with a military connection; College; Alias), then an optional store section (First/Last name, street/city/state, phone, email) behind a hard privacy divider — store data is never used for the Heat Map and never shared, sold, or given away. Zip is the only required field.
- Resilience Heat Map page (Leaflet + OpenStreetMap, no API key): El Paso default view, zoom out to national. Demo data only. Suppression published on the page: 10+ check-ins per zip area, 5+ per filtered view. Lenses: All, Military connection, Branch of service, Age group, College, Race / ethnicity. County view comes with the real pipeline (zip-to-county lookup, backend phase).
- Resilience Market carries an Under Construction banner until Square checkout links, real designs/photos, and the RESILIENCE10 code are live. Products shown are placeholders for reference until then.
- Slider is UX demo only — captures NO data. Production build wires it behind the account wall (demographics + zip) per the locked flow: Hero → Learn More → account → slider → tiered response.
- Tiered response: 1–3 → 988/911/local; 4–6 → breathing + grounding, then 988; 7–10 → thumbs up.
- State dropdown: national + Texas/El Paso at launch, structured for 50 states.
- Backends (ccep-public-api, strong-bonds-vault) are dead — Vic revives them ONLY when Tony says. Do not task Vic until frontend bones are in place.
- NAMI HelpLine 1-800-950-6264 in footer is pending NAMI's blessing.

## GitHub
Pages serves from the repo root (main branch, / root). The repo is flat: pages sit at root and reference `css/main.css` and `js/main.js` (no `../` — the old Drive html/ nesting is gone). Upload root files at root; upload `main.css` inside `css/` and `main.js` inside `js/`. Never drag a folder into the web upload — it doubles the folder name (css/css). Upload files, then read the listing back and compare it with the Structure above.

## HELD SPEC — Contact page form (Tony's call, 2026-10-25; DO NOT BUILD YET)
Bones-first rule stands: no backend/endpoint work until frontend bones are ready. This spec is held for when the build gets there, not a task for Vic now.
- Form-first, not a bare mailto link. A form works for everyone regardless of email setup, gives structured data, validates input; mailto-only fails for webmail users with no desktop client configured.
- Fields, minimal: Name (required), Email (required, validated), Phone (optional), Message (required). Do not solicit sensitive personal details.
- NO Topic dropdown (revised 2026-10-26, Tony's call): each group address on the page is a link that opens the form with that inbox pre-set as recipient — hello@, partnership@, press@, support@. Rationale: a dropdown defaults to hello@ and most people never change it, defeating the routing. Direct arrivals to the form (no link clicked) default to hello@.
- Show group addresses as plain text on the page for copy/paste fallback (mailto only as secondary convenience, never the only path).
- One-line privacy note under the form (message goes to the team inbox, only used to reply). Confirmation message on submit (no hard response-time promise).
- Spam: honeypot + server-side validation; CAPTCHA only if spam becomes a problem.
- Accessibility: label every field, associate errors with fields (WCAG AA, house standard).
- Backend: first-party endpoint preferred over a third-party form service (visitor data stays in-house — matters for this audience). Endpoint work waits until bones are ready.
- Current live page stays as clean cards until this spec is built.

### Addendum — hosting (Tony's call, 2026-10-25)
- The form does NOT move the site off GitHub. GitHub Pages is static hosting only: it hosts the form page, which POSTs to a separate first-party backend endpoint (Render backends, or a small serverless function) that sends the mail to the group address.
- Sending mail needs a secret/API key, and everything in a GitHub Pages frontend is public — credentials must NEVER live in the frontend code.
- Code still lives in GitHub, Pages still publishes it; the form lights up when the backend endpoint is ready.
- Bones-first still stands — no backend work until frontend bones are ready.
- Full decision + spec + this hosting answer also filed in the Resource Center under WEB/APP DEV.
