# Product feeds: real products in CureAvo

Every night, GitHub runs a small job that downloads your brands' product feed from Awin,
sorts the products into our rooms and types, checks every photo (and a sample of store pages),
and updates the catalog in your Supabase database. Broken products are hidden, discontinued
ones disappear, and a report shows what happened.

**Why GitHub and not Supabase:** Supabase's free functions get about 2 seconds of processing and
256 MB of memory per run. Awin's file unzips to ~36 MB, which is more than that allows. GitHub's
free nightly runs have no such limit. The code is in `scripts/run-imports.ts` and
`.github/workflows/import-feeds.yml`; the import engine is `src/feeds/`.

**Before you start:** your Supabase project must be set up (see `docs/SETUP-ACCOUNTS.md`).

---

## One-time setup (about 10 minutes, all in the browser)

### 1. Database tables
Already included in `supabase/setup.sql`. (Older projects: paste
`supabase/migrations/20261107000000_product_feeds.sql` into Supabase → **SQL Editor** → **Run**.)

Photo measurements (Nov 2026): Supabase → **SQL Editor** → **New query** → paste the contents of
`supabase/migrations/20261110000000_product_image_meta.sql` → **Run**. It only adds one empty column.
Until it's run, the import simply skips photo measuring and the app shows photos whole.

### 2. Your brands
Supabase → **SQL Editor** → **New query** → run (the brands approved so far):

```sql
insert into feed_sources (id, network, advertiser_id, feed_id, name, domain) values
  ('awin-110532', 'awin', '110532', 'F1067', 'Sicotas',    'sicotas.com'),
  ('awin-92307',  'awin', '92307',  'F230',  'Tribesigns', 'tribesigns.com'),
  ('awin-108888', 'awin', '108888', 'F1055', 'Welax',      'welaxhome.com')
on conflict (id) do nothing
returning id, name;
```

`id` is always `awin-` plus the brand's Awin id; `feed_id` is the "Datafeed ID" in Awin's
Select Advertisers list; `name` is what shoppers see as the store.

### 3. Copy three values
- **Supabase project URL:** `https://YOUR-PROJECT-REF.supabase.co` (Project Settings → General shows the ref).
- **Supabase secret key:** Project Settings → **API Keys** → **Secret keys** → copy (create one if
  there is none). It starts with `sb_secret_`. It can change anything in your database, so it only ever
  goes into GitHub's secrets (next step), never into the app, chat or email.
- **Awin feed link:** Awin → Toolbox → **Create-a-Feed** → Configure an advertiser-based feed →
  Select Advertisers → tick every brand → **Next** → CSV, comma, **gzip** → right-click
  **manual download URL** → **Copy link address**. It contains your Awin key: same rules as above.

### 4. Put them in GitHub
GitHub → the `shoppingswipe` repository → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, three times:

| Name | Value |
|---|---|
| `SUPABASE_URL` | the project URL |
| `SUPABASE_SECRET_KEY` | the secret key |
| `AWIN_GOOGLE_FEED_URL` | the Awin feed link |

(`AWIN_API_KEY` is only needed for older-format feeds with plain-number feed ids.)

### 5. Run it once and read the report
GitHub → **Actions** tab → **Nightly product import** → **Run workflow** → **Run workflow**.
It takes about 3 minutes. A green tick means every store worked; click the run to see each
store's numbers. In Supabase, **Table Editor → import_report** shows one row per store:
- **imported**: products now in the app
- **skipped**: what was left out and why (out of scope, broken photo, link moved, out of stock…)
- **deactivated**: products hidden because they left the feed or broke
- **error**: if the feed itself couldn't be downloaded

From then on it runs by itself every night at 08:17 UTC (3:17 am US Eastern). If a night fails,
GitHub marks the run red and emails you.

---

## Adding more brands later
When a brand approves you on Awin: make a new Create-a-Feed link that includes it (step 3), update
`AWIN_GOOGLE_FEED_URL` in GitHub (click the secret → **Update**), and add one line like step 2.
To pause a brand: `update feed_sources set enabled = false where id = 'awin-…';`
To import one brand now: Run workflow and type its id (e.g. `awin-92307`) in the box.

If you regenerate your Awin key, the feed link changes: copy the new one into `AWIN_GOOGLE_FEED_URL`.

## Trying a feed before adding it (on a computer with the code)
Download the feed from Create-a-Feed (CSV, comma, gzip) and run:

```
npm run import-feed -- path/to/feed.csv.gz --check
```

A file with several brands is checked brand by brand. It prints the same report without changing
anything. Keep real feed files out of git (`.feeds/` is ignored).

## What the import does
- Reads Awin's classic and newer "Google" feed formats (Shopify-style "Product - Size / Colour" names).
- Sorts products into our 11 types with keyword rules; leaves out outdoor, kids, mattresses, rug pads,
  office chairs and anything we don't sell.
- Groups sizes into one card (rugs show the 5'×8' size; others the lowest price). Colours stay separate cards.
- Reads colour, material and style from the name and description, so taste learning works on real products.
- Checks every product's main photo, and a spread-out sample of 40 store pages per brand, visited
  politely one at a time (stores block fast visitors). If most sampled pages are gone, the feed is
  treated as out of date and that brand's products are hidden.
- Measures each product photo once (GitHub job only, with the `sharp` image tool installed just for
  that run): cut-out furniture on a plain light background gets its edges recorded so the swipe card
  can draw it larger with breathing room; room photos are marked to be shown whole. Photos and links
  are never changed. Anything it can't measure safely is shown whole.
- Buy now always uses the Awin tracking link, so purchases earn commission.
- Hides products that disappear from a feed or break. An empty or failed download changes nothing.

## The Supabase function (not used)
`supabase/functions/import-feeds/` can also run the import as a Supabase Edge Function, but large
feeds exceed Supabase's free limits. If you deployed it earlier, it's harmless (it refuses requests
without its secret); you can delete it under Edge Functions.
