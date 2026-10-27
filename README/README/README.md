# connectionsep.com — Site Build README

## Structure
```
connectionsep.com/
├── html/       → Page files. index.html is the homepage.
├── css/        → ALL stylesheets. No <style> blocks in HTML, ever.
├── js/         → ALL scripts. No inline <script> in HTML, ever.
├── assets/     → Images, icons, fonts. (Empty until design assets are ready.)
└── README/     → This file. Build docs live here.
```

## Rules (Tony's)
1. **CSS stays separate.** Every page links `../css/main.css`. Brand palette lives once in `:root` — change it there, it changes everywhere.
2. **JS stays separate.** Every page loads `../js/main.js` at the end of `<body>`. The script bails quietly on pages without a slider.
3. **Think before building.** Debate pro/con in the side chat before execution. If it's dumb, say so — "Rank does not fix stupid" applies here too.
4. **Accessibility is non-negotiable.** 4.5:1+ contrast, heading hierarchy, aria labels, keyboard-accessible, `aria-live` on dynamic content. This is what Lighthouse scores.
5. **Locked copy — do not edit without approval:**
   - Hero: "Fort Bliss nearly ended my life. Then Marylou gave me an idea — and building it saved me." — Tony Sorensen, Founder
   - Marylou's story: her exact words, she typed them herself (2026-10-14). Do not touch.
   - Scale: 1 = struggling, 10 = thriving.
   - Naming: "Resilience Check In" / "Resilience Heat Map" everywhere. Never "pulse check" / "mood bar" / "mental health heat map."
   - Service line: "20-year U.S. Army SSG" (not 19).
   - Entity: "Strong Bonds Public Benefit Corporation."

## Current state (2026-10-16)
- Homepage (v3 "why first") approved by Tony + Marylou.
- Slider is UX demo only — captures NO data. Production build wires it behind the account wall (demographics + zip) per the locked flow: Hero → Learn More → account → slider → tiered response.
- Tiered response: 1–3 → 988/911/local; 4–6 → breathing + grounding, then 988; 7–10 → thumbs up.
- State dropdown: national + Texas/El Paso at launch, structured for 50 states.
- Backends (ccep-public-api, strong-bonds-vault) are dead — Vic revives them ONLY when Tony says. Do not task Vic until frontend bones are in place.
- NAMI HelpLine 1-800-950-6264 in footer is pending NAMI's blessing.

## GitHub
Upload `html/index.html` as the repo's `index.html`, `css/main.css`, `js/main.js`. GitHub Pages serves from the repo root — keep the relative paths (`../css/`, `../js/`) or flatten to root as needed.

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
