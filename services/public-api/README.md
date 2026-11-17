# ccep-public-api — Public API for connectionsep.com

**Status: SCAFFOLD, prep only (v0.1.0). Not deployed. Not connected to any
live database.**

This implements the Monday-critical path of the Public API spec v01
(`SBFoC_TECH__Public-API-Spec_20261108_v01.md`, shared Drive, Pillar 07):
the Resilience Check In submission, the Resilience Heat Map read,
discount-code validation (`POST /api/discount-codes/validate`,
added Nov 14), the store + menu reads (`GET /api/products`,
`GET /api/products/:id`, `GET /api/menu`, `GET /api/menu/:id`,
added Nov 14), and accounts + login (`POST /api/accounts`,
`POST /api/auth/login`, `GET /api/accounts/me`, added Nov 14), and
contact messages (`POST /api/contact-messages`, added Nov 14),
and orders (`POST /api/orders`, `GET /api/orders`, added Nov 14).
Nothing else. It reads from and writes to the **public database
(`strong-bonds-public`) only** and never touches the Vault database.

## Run locally

```bash
npm install
cp .env.example .env
# Edit .env: set PUBLIC_DB_URI to a TEST/DEV cluster connection string.
# Do not point local runs at production data unless Tony says so.
npm start          # listens on PORT (default 3000)
npm run dev        # same, with auto-reload (node --watch)
```

Startup fails fast with a clear message if `PUBLIC_DB_URI` is missing
or the database is unreachable — it never starts half-working.

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"ccep-public-api","version":"0.1.0","db":"up","time":"..."}
```

## What is implemented

### POST /api/check-ins — submit a Resilience Check In (no login)

Request (JSON). Only `score` and `zip` are required; everything else
is optional and may be omitted (omitted = "Prefer not to say").

```json
{
  "score": 6,
  "zip": "79936",
  "birthYear": 1972,
  "raceEthnicity": "Hispanic or Latino",
  "militaryConnection": "Veteran",
  "branch": "Army",
  "college": "Not a student",
  "alias": "Desert Rose"
}
```

Validation (400 `validation_error` with a `details` list otherwise):

- `score`: required, whole number 1–10.
- `zip`: required, exactly 5 digits.
- `birthYear`: whole year 1900–current year.
- `raceEthnicity`, `militaryConnection`, `branch`, `college`: must be
  one of the check-in form's option lists.
- `alias`: text, 100 characters max.

What the endpoint does, in order:

1. **Strips PII.** Any field that is not one of the 8 spec fields is
   dropped — including store-order fields the check-in page also
   collects (`firstName`, `lastName`, `street`, `city`, `state`,
   `phone`, `email`). Dropped values are never stored and never
   logged (only the count is logged). A `branch` with no military
   connection is dropped too.
2. **Writes one document to `check_ins`** (spec shape exactly):
   ```json
   { "score": 6, "zip": "79936", "birthYear": 1972,
     "raceEthnicity": "Hispanic or Latino", "militaryConnection": "Veteran",
     "branch": "Army", "college": "Not a student", "alias": "Desert Rose",
     "createdAt": "2026-11-14T15:00:00.000Z" }
   ```
   No email, no real name, no link to a discount code, no link to
   an account. The identity link is destroyed, not hidden.
3. **Mints one unique discount code** in `discount_codes` (spec shape
   exactly — standalone, no link back to the check-in):
   ```json
   { "code": "RESILIENCE-K7Q2M9XD", "expiresAt": "2026-11-21T15:00:00.000Z",
     "used": false, "usedAt": null, "createdAt": "2026-11-14T15:00:00.000Z" }
   ```
   Code format: `RESILIENCE-` + 8 random characters (alphabet drops
   I, O, 0, 1). Good for one order, 7 days from minting. Uniqueness
   is enforced by retry-on-collision plus a unique database index.
4. **Recomputes the `heat_map` aggregate for that zip** (see
   Assumptions #1).

Response — `201`:

```json
{ "discountCode": "RESILIENCE-K7Q2M9XD", "expiresAt": "2026-11-21T15:00:00.000Z" }
```

Nothing else is returned. No check-in ID — the response itself
carries no link back to the stored check-in.

### GET /api/heat-map — read the Resilience Heat Map (no login)

Query params:

| Param | Values | Default |
|---|---|---|
| `dimension` | `all`, `military`, `branch`, `age`, `college`, `race` | `all` |
| `value` | the group inside the dimension (required unless `dimension=all`) | — |
| `range` | `7d`, `30d`, `all` | `30d` (matches the frontend's default button) |

Examples:

```bash
curl "http://localhost:3000/api/heat-map"
curl "http://localhost:3000/api/heat-map?dimension=military&value=Veteran&range=30d"
curl "http://localhost:3000/api/heat-map?dimension=age&value=18-25&range=7d"
```

Response:

```json
{
  "dimension": "all",
  "value": null,
  "range": "30d",
  "threshold": 10,
  "generatedAt": "2026-11-14T15:00:00.000Z",
  "zips": [
    { "zip": "79936", "averageScore": 6.4, "checkInCount": 42, "suppressed": false },
    { "zip": "79901", "suppressed": true, "status": "too few voices" }
  ],
  "totals": { "areasShown": 1, "areasSuppressed": 1, "totalCheckIns": 42 }
}
```

**Suppression (spec v01):** 10 check-ins per zip for the public
(all) view, 5 for a filtered view. Below that, the zip is returned
as `{ zip, suppressed: true, status: "too few voices" }` — no
average, no count. It never reads as zero, and no single person's
score can ever be inferred. `totals.totalCheckIns` counts shown
areas only. **No individual check-in is ever returned by any
endpoint.**

Data source: `dimension=all, range=all` reads the precomputed
`heat_map` collection (spec shape: `zip`, `averageScore`,
`checkInCount`, `updatedAt`). Any filter or time range is computed
live from `check_ins` (the spec's `heat_map` shape stores all-time
overall aggregates only — see Assumptions #3). Age bands are
computed from `birthYear` inside the pipeline; the raw year never
appears in output. Check-ins with no value for the filtered
dimension ("Prefer not to say") count in the overall view and in no
filtered view.

### Also in this scaffold

- `GET /` — service status and endpoint list.
- `GET /health` — `{"status":"ok"|"degraded","db":"up"|"down",...}`
  (pings the database).
- Indexes created at startup: unique `discount_codes.code`, unique
  `heat_map.zip` (spec-required), plus a helper index on
  `check_ins (zip, createdAt)`.

## Assumptions made where the spec was silent

1. **Aggregation trigger is undefined in the spec.** Implemented as
   **recompute-on-write**: after every check-in insert, the
   aggregate for that zip only is recomputed from all of its
   check-ins and upserted into `heat_map`. A scheduled job is the
   alternative; recompute-on-write was chosen because the volume
   is low and the map must reflect a check-in immediately.
2. **Below-threshold zips still appear — as "too few voices".**
   The spec says a zip "only appears here once it meets the
   suppression threshold", but the filtered threshold (5) is lower
   than the public one (10), and the frontend renders
   below-threshold zips grey ("not enough data yet"). So `heat_map`
   stores an aggregate for every zip with ≥ 1 check-in, and
   **suppression is enforced at read time** in `GET /api/heat-map`.
   The alternative — omitting below-threshold zips from responses
   entirely — would make grey "too few voices" areas impossible.
   No average or count is ever exposed for a suppressed zip.
3. **Filtered views and time ranges are computed live from
   `check_ins`.** The spec's `heat_map` shape has no per-dimension
   or per-period breakdowns, so those views cannot come from the
   collection. The live pipeline returns aggregates only.
4. **Mint conflict — spec v01 wins.** The Oct 27 discount-code
   handoff (`site-build/discount-code-handoff.md`) defines a
   separate `POST /discount-codes/mint` with an empty body, and a
   code shape with `status: active | redeemed | expired`. Spec v01
   (Nov 8, newer) folds minting into `POST /api/check-ins` and
   defines the shape as `used` / `usedAt`. This scaffold follows
   **spec v01**. The separate mint endpoint is NOT built, and the
   frontend uses the code returned by `POST /api/check-ins`
   (the `js/main.js` mint reference was removed in the Nov 14
   frontend wiring; the check-in response is the only mint path).
5. **The 10% discount value lives in `src/lib/codes.js`.** The spec's
   `discount_codes` shape has no discount-amount field; the 10%
   figure comes from the check-in page copy ("10% off"). It is the
   named constant `DISCOUNT_PERCENT = 10`, returned by
   `POST /api/discount-codes/validate` on a valid code and to be
   applied by the orders endpoint. If the discount ever changes,
   that constant is the one place it changes. The check-in response
   does not include it.
6. **Age bands** are `Under 18, 18-25, 26-35, 36-45, 46-55, 56+`
   (the frontend's `VALUES.age` list), computed from `birthYear`
   at aggregation time.
7. **Spec examples vs form labels.** The spec's `militaryConnection`
   examples are lowercase paraphrases; the code accepts the form's
   title-case labels (`Active Duty`, `Veteran`, …).
8. **Rate limiting — implemented Nov 17 (pre-launch requirement).**
   In-memory fixed-window limiters (`src/middleware/rateLimit.js`,
   no new dependency — the service runs as one Render instance).
   Per client IP (app.js trusts exactly one proxy hop so `req.ip`
   is the real client behind Render's router); over-limit answers
   429 `{ error: 'rate_limited', message }` with a `Retry-After`
   header. Limits are generous on purpose — a real user doing a
   handful of check-ins, code validates and orders is never
   blocked; the limits stop spam and brute force.
   | Limiter | Applies to | Limit |
   |---|---|---|
   | `api` | every `/api` call | 300 / 15 min / IP |
   | `write` | check-ins, code validation, orders, signups, contact messages, club joins | 60 / 15 min / IP |
   | `auth-login` | `POST /api/auth/login` only | 10 / 15 min / IP |
   `/` and `/health` stay unlimited. Tests:
   `npm test` (`test/rate-limit.test.js`, 15 checks, no database).
   If the service ever scales past one instance, the store must
   move to a shared store (Redis or the database).
9. **Auth is built (Nov 14).** `JWT_SECRET` is now REQUIRED at
   startup — it signs login tokens. Passwords are bcrypt-hashed
   (12 rounds); tokens are HS256 JWTs, 7-day expiry; minimum
   password is 8 characters (v01 choices the spec does not define).
   Login failures are identical for unknown email and wrong
   password, so the API cannot be used to probe which accounts
   exist. `GET /api/accounts/me` loads the account from the token
   on every call, so a deleted account's token stops working.
   Login is rate-limited (10 attempts / 15 min / IP, see
   Assumption #8); signup sits on the write limiter (60).
10. **Mint failure after insert.** If code minting fails after the
    check-in is stored (database error), the check-in still counts
    on the map and the caller gets a 500. The check-in is never
    written twice.
11. **Code length.** The spec's example is `RESILIENCE-XXXX`; this
    scaffold uses 8 random characters (`RESILIENCE-XXXXXXXX`).
12. **Validate needs no login (built Nov 14).** Spec v01 says the
    validate endpoint "requires login (or at checkout)" — ambiguous.
    Decision: no login. The holder is the anonymous shopper who
    just checked in; requiring an account would break the
    check-in → code → checkout flow. Validate does NOT consume the
    code — consumption happens once, in the orders endpoint. The
    static `RESILIENCE10` code is NOT accepted (Tony's rule, Nov
    14: it does not satisfy the unique-code launch requirement).
    Smoke-tested Nov 14 (8 cases, no database): valid, lowercase
    normalization, not_found, expired, already_used, RESILIENCE10
    rejected, missing code, non-string code — all pass.
13. **Guest checkout — DECIDED Nov 14 (Tony).** Spec v01 puts
    `POST /api/orders` under "Logged-in endpoints" and the `orders`
    document requires an `accountId`. Tony decided: guest checkout
    is allowed — "we do not want to restrict their access to allow
    them to support if they do not want to create an account."
    So `POST /api/orders` accepts an OPTIONAL login token: a valid
    token attaches the `accountId`, no token means a guest order
    with `accountId: null`. `GET /api/orders` stays login-only
    (a guest has no account to list orders under; the confirmation
    comes from the POST response).
14. **`sourceId` is not in the spec's order body.** Spec v01 says
    POST /api/orders "creates the Square payment" without naming
    the field. The endpoint requires `sourceId` — the payment
    source token the frontend gets from the Square Web Payments
    SDK. Without it there is nothing to charge.
15. **Code consumption order.** The code is consumed atomically
    (used:false guard) BEFORE the Square charge, and released
    (used:false again) if the charge fails, so a declined card
    does not burn the customer's code. A crash between consume and
    charge would leave a used code with no order; a
    reconciliation job (post-launch) can release codes with no
    matching order. The expiry sweep for unredeemed codes past 7
    days belongs here too, not in validate.
16. **Square is plain REST, not the SDK.** `src/lib/square.js`
    calls POST /v2/payments directly (fetch). The SDK's import
    shape changes across major versions; the REST endpoint is
    stable. Square vars are OPTIONAL at startup — the app boots
    without them and POST /api/orders answers 503
    `payments_not_configured` until SQUARE_ACCESS_TOKEN and
    SQUARE_LOCATION_ID are set (Render Environment). A declined
    card is 402 `payment_declined`; any other Square failure is
    502 `payment_failed`.
17. **Order write after a successful charge.** If the order
    document cannot be written after Square took the money, the
    route answers 500 `order_write_failed` WITH the Square
    payment id, so support can reconcile — the money is real and
    the order must not vanish silently. The discount code is NOT
    released in that case (the payment stands).
18. **Student tier charged once in v01 (built Nov 14).** The club's
    student plan is $25/mo x 3, but installments need Square
    Subscriptions — a v02 decision. In v01, tier "Student" is the
    $75 Connection price charged once at join. **Tony, Nov 14:**
    keep $75 for now, but address installments ASAP — students
    should be able to join without the full amount up front. The
    enrollment window is not open yet, so there is time; no site
    wording changes.
19. **Gift-a-tier not in v01.** The 10%-off gifted membership needs
    a recipient model the spec does not define. Not built.
20. **No discount codes on a club join.** The spec's POST body has
    no discountCode field; the check-in code is for the Market.
21. **Already a member → 409.** An account with an active
    membership gets 409 `already_member`; an expired membership
    does not block a re-join (that is how renewal works in v01).
    `GET /api/club-members/me` reports the EFFECTIVE status: an
    "active" membership past its expiresAt reads as "expired"
    without rewriting the document — a sweep job can reconcile
    stored statuses later. `club_members` has an index on
    `accountId` (lookups on every join and /me).
22. **Club orders record.** The spec requires an orders record for
    the club payment. A membership has no product and nothing
    ships: the item carries the tier name only (no productId) and
    shippingAddress is null. `GET /api/orders` tolerates items
    without productId (club orders list alongside product orders).
    Smoke-tested Nov 14 (21 checks, stubbed DB + stubbed Square):
    join Grounding $50 / Ally Connection $127.50 / Student $75,
    bad tier, missing sourceId, no token, Square unconfigured
    (503, nothing written), already a member (409, no charge),
    expired membership re-joins, decline (402, no writes), GET
    /me active / none / expired, GET /orders lists the club order
    — all pass.

## What remains for the full build (spec v01's other 1 endpoint)

Not built here — listed so the next step is obvious:

- `POST /api/bookings` — needs the book-page decision (tables,
  peer-group sessions, or both).

Also remaining: automated tests beyond the rate-limit suite, and
the club page (`club.html`) frontend wiring to these endpoints. The
check-in / Heat Map frontend wiring landed Nov 14 (see "Frontend
wiring" below); the API itself is deployed on Render, but a push
does NOT auto-deploy — each API push needs a Manual Deploy in
Render (verified Nov 14).

## Hard limits observed in this scaffold

- No deployment, no GitHub push, no live database connection, no
  Vault access, no site-build changes, no money spent, no accounts
  created. Local verification only (see below).

## Verification performed

```bash
npm install            # express, mongodb, dotenv installed locally
node --check src/*.js src/lib/*.js src/routes/*.js src/middleware/*.js
node src/index.js      # with no .env: exits 1 with "PUBLIC_DB_URI is not set"
```

Plus a no-database smoke test (app loaded, ephemeral port, no DB
attached — validation runs before any DB access, so 400s prove the
routes and validation work, and 500s prove the handlers were reached
and failed only on the missing database):

- `GET /` → 200, endpoint list. `GET /health` → 200 `degraded`, `db: down`.
- `POST /api/check-ins` `{}` → 400 (score + zip errors). Score 11 →
  400. Valid body + `email`/`firstName` → PII stripped (count only
  logged, values never logged), then 500 on the missing DB.
- `GET /api/heat-map?dimension=nope` → 400. Valid heat-map queries
  → 500 on the missing DB. Unknown route → 404.
- Orders smoke test (stubbed DB + stubbed Square, Nov 14 — 18
  cases, all pass): guest order 201 with total from DB prices
  ($99 for 2 hoodies, frontend-sent price ignored), logged-in
  order with code 201 ($44.55, 10% off, code consumed, accountId
  attached), unknown/used/expired code → 400 with the matching
  reason, unknown/unavailable product → 400, missing sourceId and
  bad ZIP → 400, declined card → 402 with the code released and
  no order, Square unconfigured → 503 with the code untouched, bad
  token → 401 (never silently a guest), GET /api/orders returns
  only the caller's own orders and requires login.

No live database was connected during verification. A full
end-to-end test (real check-in → code → Heat Map read) needs a
test-cluster `PUBLIC_DB_URI` and was not run here.

## Frontend wiring (Nov 14, 2026)

- The site (`~/workspace/site-build/connectionsep.com`) is wired to this API: `checkin.html` POSTs to `/api/check-ins` (`js/main.js`, `API_URL` constant), `heat-map.html` reads `/api/heat-map`, demo data removed, `privacy.html` carries the live-collection wording.
- CORS (`src/app.js`): allows `https://strong-bonds-public-benefits-corp.github.io`, `https://connectionsep.com`, `https://www.connectionsep.com`, and `http://localhost:*` / `http://127.0.0.1:*` for local development. Methods GET, POST, OPTIONS; headers Content-Type, Authorization. Preflight answers 204.
- Site push (only changed files, repo root): `gh_push.py --check --source-dir ~/workspace/site-build/connectionsep.com --prefix "" --files checkin.html heat-map.html privacy.html js/main.js README.md`
- API push (selected files): `gh_push.py --check --files src/app.js README.md`
- A push triggers a GitHub Pages rebuild. Render does NOT auto-deploy on push (no GitHub App on the org repo — verified Nov 14: the CORS push sat undeployed until a Manual Deploy) — a Manual Deploy in Render is needed after each API push.
- Still open before public launch: the scoped database user is
  done (Render runs as `public-backend` since Nov 17 12:19); the
  bookings endpoint still needs its decision. Rate limiting
  landed Nov 17 (see Assumption #8).
