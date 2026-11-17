# Seeding the Resilience Market products (strong-bonds-public `products`)

## What this is

`products-20261116.json` is the first seed for the Resilience Market on
connectionsep.com: 21 product documents, one per buyable variation, priced
exactly as in the store (Square) on Nov 16, 2026. The market frontend
(`market.js`) renders `imageUrl` directly, and the orders endpoint prices
from the single `price` field on each document with no variant field — so
every priced variation is its own document. That is deliberate, not a
mistake: it is the only way v01 charges the exact Square price for every
size without a backend change.

## DO NOT IMPORT YET

The `imageUrl` paths in this file point at images that are NOT in GitHub
yet (`assets/products/<slug>/<slug>-1.jpg`). Importing before the images
are pushed would render the market with broken pictures. Order of work:

1. Download the 46 Square product images and push them to GitHub under
   `assets/products/<slug>/` (see "Images" below).
2. Then import this file (script or Compass, below).
3. Then verify live: GET /api/products returns the products, and the
   market page renders them with images.

## Still missing from this seed (do not guess)

- **All the Bells and Coffee Stickers (4 sizes, $2.50–$8.50):** the
  per-size prices were not captured — only the range. Four documents
  are still to add once the per-size prices are read from the store.
  Do not seed the stickers until then.
- **Descriptions:** no `description` field on any document yet. The
  Square descriptions were not captured in the Nov 16 check; add them
  from the store before or after import (an update by `sku` fills
  them in without touching anything else).
- **Square item/variation IDs:** not captured, so not included. The
  `sku` field below is the stable key instead.

## Images

46 images across the 12 merch items live in the store. All 46 are
downloaded and pushed to `assets/products/<slug>/`, named
`<slug>-1.jpg`, `<slug>-2.jpg`, … in the store's image order, with `-1`
the primary. The seed uses the primary only — v01 renders one photo
per product (`market.js` takes a single `imageUrl`). The other images
are stored for a future gallery / second-photo slot.

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
4. Re-run the same import later is safe ONLY if the `sku` unique
   index exists — otherwise it will duplicate. Prefer the script for
   re-runs.

## Verify

```bash
curl -s https://ccep-public-api.onrender.com/api/products
```

Allow ~60 seconds for the Render free-tier service to wake. Expect
the 21 seeded products (25 once the Bells stickers land). Then open
the live market page and confirm the products render with images.
