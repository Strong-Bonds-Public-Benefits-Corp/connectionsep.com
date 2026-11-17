# Seeding the Resilience Market products (strong-bonds-public `products`)

## What this is

`products-20261116.json` is the first seed for the Resilience Market on
connectionsep.com: 25 product documents, one per buyable variation, priced
exactly as in the store (Square) on Nov 16, 2026. Every document carries
the store's description. The market frontend (`market.js`) renders
`imageUrl` directly, and the orders endpoint prices from the single
`price` field on each document with no variant field — so every priced
variation is its own document. That is deliberate, not a mistake: it is
the only way v01 charges the exact Square price for every size without
a backend change.

Every document also carries an `images` array: all of that item's
photos, in store order, with the card photo first (`images[0]` is
always identical to `imageUrl`). The gallery pop-out steps through
`images`. Two card photos were swapped after a visual audit on
Nov 16, 2026 (see "Images" below): Break the Stigma Bottle
(`-1` plain bottle → `-2`, the "BREAK MENTAL HEALTH STIGMA" shot)
and Fanny Pack (`-1` lifestyle shot → `-3`, the flat product shot
showing "RESILIENCE").

## RE-IMPORT — delete the 25 old documents FIRST (Compass)

The live `products` collection already holds the 25 documents from
the first import, and **the `sku` unique index was never created**
(the first import was done in Compass, not with the script, and the
script is what creates the index). A plain re-import would therefore
**duplicate all 25 documents** — it is not an option. Do this instead:

1. Open MongoDB Compass and connect to the strong-bonds-public
   cluster with a login that has readWrite on strong-bonds-public.
2. Open the `products` collection. Confirm it holds 25 documents.
3. **Delete all 25 documents first:** click the checkbox in the
   header row to select all documents on the page, then Delete.
   (If the collection spans pages, repeat until it is empty — or
   drop the whole `products` collection and let the import recreate
   it. Either way, the collection must be EMPTY before step 4.)
4. Add Data → Import JSON → select the updated
   `products-20261116.json` (a JSON array; Compass imports each
   element as a document). Confirm the count is 25 after the import.
5. Verify: `GET /api/products` returns 25 documents and at least
   one carries an `images` array — e.g. `bottle-stigma` must show
   `imageUrl` ending in `break-the-stigma-bottle-2.jpg`.

Until this re-import is done, the live API still serves the OLD
seed (no `images` field, old primaries). The gallery code handles
that gracefully — it falls back to the single `imageUrl` — but the
full gallery only appears after the re-import.

## READY TO IMPORT (first import, Nov 16, 2026 — done)

1. ~~Download the 46 Square product images and push them to GitHub~~ — done Nov 16, 2026.
2. Import this file (script or Compass, below).
3. Then verify live: GET /api/products returns the products, and the
   market page renders them with images.

## Images

46 images across the 12 merch items live in the store. All 46 are
downloaded and pushed to `assets/products/<slug>/`, named
`<slug>-1.jpg`, `<slug>-2.jpg`, … in the store's image order. The
seed carries every photo per item in the `images` array, with the
card photo first — the gallery pop-out (`market.js`) steps through
that array. The card photo is the store's `-1` primary for 10 items.
Two were swapped after looking at every photo on Nov 16, 2026:

- **Break the Stigma Bottle: `-1` → `-2`.** `-1` is the plain white
  bottle — no text at all. `-2` is the front shot with "BREAK MENTAL
  HEALTH STIGMA" and the Coffee & Connections logo.
- **Fanny Pack: `-1` → `-3`.** `-1` is a lifestyle shot of a model
  wearing the pack — "RESILIENCE" is readable but small and angled.
  `-3` is the flat product shot: "RESILIENCE" / "STRONG BONDS"
  fills the frame. (The lifestyle shots stay in the gallery as
  `-1` and `-2`, so shoppers still see it worn.)

Kept as `-1` (checked, shows the text/logo): Bells stickers (full
"jingle bells coffee smells" design), die-cut stickers (full logo),
Hat (front "COFFEE CONNECTIONS" embroidery), Eco Tote ("I SURVIVE."),
Buttons (row of 5 designs, text readable), Candle (full "Christmas
Warmth / HOLIDAY CHEERS" label), Hoodie (back "I survived" print),
Mission Mug ("BREAK MENTAL HEALTH STIGMA").

Two items could NOT be fixed by a swap — no photo in the set shows
the full text: **Resilience Mug** (all 4 shots show the mug rotated
so the "You're stronger than anything you can brew" print is on the
far side or cut off at the edge) and **That's A Latte Cup** (its only
photo shows two stacked mugs with the design on the far side). The
gallery lets shoppers see all the angles, but a straight-on product
shot would be needed to fix these two properly — a future step, not
a seed change.

Per-item image counts (store, Nov 16): Bells stickers 4, Bottle 4,
die-cut stickers 3, Hat 8, Eco Tote 1, Fanny Pack 3, Buttons 6, Candle 3,
Hoodie 2, Resilience Mug 4, Latte Cup 1, Mission Mug 7 = 46.

## Excluded on purpose

- The 6 Sanctuary Club tier items (Grounding/Connection/Sanctuary Solo
  + Ally, $50–$170) — club memberships, sold through the club join
  flow, not merch. They must never appear as market products.
- C&C Open Our Doors Fund ($10) — a donation, not merch.
- The 2 unattached duplicate hoodie photos in the store's image
  library — duplicates, not attached to any item.
- The deleted $40 duplicate hoodie listing — do not re-add it.
  Hoodies are $49.50 (S–XL) / $52 (2XL).

## The `sku` key

Every document has a `sku` (e.g. `hoodie-resilience-2xl`). The seed
script upserts on it, so re-running the script is safe: it updates in
place instead of duplicating. The script also creates a unique index
on `products.sku`. The `sku` is returned by GET /api/products as
stored (the catalog route returns documents as-is); it is harmless
public data.

## Import — script (preferred)

```bash
cd ~/workspace/api-build/ccep-public-api
PUBLIC_DB_URI='mongodb+srv://<user>:<password>@<cluster-host>/strong-bonds-public?retryWrites=true&w=majority' \
  node seed/seed-products.js
```

The URI is read from the environment only — never from a file in this
repo, never printed or logged. `--dry-run` validates the file and
prints the plan without connecting:

```bash
node seed/seed-products.js --dry-run
```

## Import — Compass (no script)

1. Open MongoDB Compass and connect to the strong-bonds-public
   cluster with a login that has readWrite on strong-bonds-public.
2. Open the `products` collection.
3. Add Data → Import JSON → select `products-20261116.json`.
   (It is a JSON array; Compass imports each element as a document.)
4. **Re-imports:** a plain re-import DUPLICATES — the `sku` unique
   index was never created (the first import was Compass, not the
   script). For any re-import, delete all documents first; see
   "RE-IMPORT — delete the 25 old documents FIRST" above. Prefer
   the script for re-runs (it upserts on `sku` and creates the
   index).

## Verify

```bash
curl -s https://ccep-public-api.onrender.com/api/products
```

Allow ~60 seconds for the Render free-tier service to wake. Expect
the 25 seeded products. Then open the live market page and confirm
the products render with images.
