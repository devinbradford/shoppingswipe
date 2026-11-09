# Product feeds: real products in CureAvo

Every night, a small job on your Supabase backend downloads each brand's product feed from Awin,
sorts the products into our rooms and types, checks every photo and store link, and updates the
catalog. Broken products are hidden, discontinued ones disappear, and a report shows what happened.

**Before you start:** your Supabase project must be set up (see `docs/SETUP-ACCOUNTS.md`), and the app
must be using it (the `.env` file). Until then the app shows the built-in sample furniture.

---

## One-time setup (about 15 minutes)

### 1. Get a fresh Awin feed key
Your old key appeared in a screenshot, so make a new one.
In Awin: **Toolbox → Create-a-Feed**, look for the option to **regenerate your API key**
(it may be under your account's **API credentials**). Keep it private: don't paste it into chat or email.

### 2. Add the new database tables
Supabase dashboard → **SQL Editor** → **New query** → paste the whole file
`supabase/migrations/20261107000000_product_feeds.sql` → **Run**.
(If you're setting up Supabase from scratch with `supabase/setup.sql`, it's already included.)

### 3. Copy your feed's download link
Most brands now use Awin's newer "Google" feed format (feed ids like `F1067`).
In Awin: **Toolbox → Create-a-Feed → Configure an advertiser-based feed → Select Advertisers**,
tick every brand you want, then **Next** → CSV, comma, **gzip**. Copy the download link it gives you.
The link contains your key: paste it only into Supabase (next step), never into chat or email.
When you add or remove a brand later, make a new link the same way and replace the secret.

### 4. Add the secrets
Supabase → **Edge Functions → Secrets** → add:

| Name | Value |
|---|---|
| `AWIN_GOOGLE_FEED_URL` | the download link from step 3 |
| `IMPORT_FEEDS_SECRET` | a long random password (see below) |
| `AWIN_API_KEY` | only needed for older-format feeds (plain-number feed ids) |

To make the random password, open Supabase → **SQL Editor → New query**, run
`select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');` and copy the result. Keep it for steps 7 and 8.

### 5. Deploy the import job
Supabase → **Edge Functions → Deploy a new function → Via Editor**.
- Name it exactly: `import-feeds`
- On GitHub open `supabase/dashboard/import-feeds.ts`, click **Copy raw file**, and paste it over the sample code
- **Turn OFF "Verify JWT"** (it checks your `IMPORT_FEEDS_SECRET` instead)
- Deploy. (When the code changes, paste the new file the same way and deploy again.)

### 6. Add your brands
SQL Editor → New query → run (these are the brands approved so far):

```sql
insert into feed_sources (id, network, advertiser_id, feed_id, name, domain) values
  ('awin-110532', 'awin', '110532', 'F1067', 'Sicotas',    'sicotas.com'),
  ('awin-92307',  'awin', '92307',  'F230',  'Tribesigns', 'tribesigns.com'),
  ('awin-108888', 'awin', '108888', 'F1055', 'Welax',      'welaxhome.com')
on conflict (id) do nothing;
```

`id` is always `awin-` plus the brand's Awin id; `feed_id` is the "Datafeed ID" column in Select Advertisers;
`name` is what shoppers see as the store.

### 7. Run it once and read the report
Run one brand at a time (each can take a couple of minutes while it checks every photo and page).
Supabase → **Edge Functions → import-feeds → Test**: method **POST**, add a header
`x-import-secret` with your secret from step 4, body `{"source": "awin-108888"}` → **Send**.
Then repeat with `awin-110532` and `awin-92307`.

Then open **Table Editor → import_report**. One row per store:
- **imported**: products now in the app
- **skipped**: what was left out and why (out of scope, broken photo, link moved, out of stock…)
- **deactivated**: products hidden because they left the feed or broke
- **error**: if the feed itself couldn't be downloaded

### 8. Run it every night
Supabase → **Database → Extensions**: turn on **pg_cron** and **pg_net**.
Then SQL Editor (replace `YOUR-PROJECT-REF` and `YOUR-SECRET`). One job per brand, 20 minutes apart,
so each stays within Supabase's time limit and Awin's download limit:

```sql
-- Keep the secret in Supabase Vault, not in the schedule itself.
select vault.create_secret('YOUR-SECRET', 'import_feeds_secret');

-- Starts one brand's import (used by the schedules below).
create or replace function public.start_feed_import(source_id text) returns void
language sql security definer set search_path = '' as $fn$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/import-feeds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-import-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'import_feeds_secret')
    ),
    body := jsonb_build_object('source', source_id),
    timeout_milliseconds := 300000
  );
$fn$;
revoke all on function public.start_feed_import(text) from public, anon, authenticated;

-- Every day from 08:15 UTC (3:15 am US Eastern).
select cron.schedule('import-welax',      '15 8 * * *', $$select public.start_feed_import('awin-108888')$$);
select cron.schedule('import-sicotas',    '35 8 * * *', $$select public.start_feed_import('awin-110532')$$);
select cron.schedule('import-tribesigns', '55 8 * * *', $$select public.start_feed_import('awin-92307')$$);
```

Your project ref is in Supabase → **Project Settings → General**.

---

## Adding more brands later
When a brand approves you on Awin: make a new download link that includes it (step 3), replace
`AWIN_GOOGLE_FEED_URL`, and add one line like step 6. It's picked up the next night
(or press **Test** to import now). To pause a brand: `update feed_sources set enabled = false where id = 'awin-…';`

Then give it its own nightly job, 20 minutes after the last one (Awin allows only a few downloads of the same
file per hour): `select cron.schedule('import-NAME', '15 9 * * *', $$select public.start_feed_import('awin-…')$$);`

## Trying a feed before adding it (on a computer with the code)
Download the feed from Create-a-Feed (CSV, comma, zip or gzip) and run:

```
npm run import-feed -- path/to/feed.csv.gz --check
```

A file with several brands is checked brand by brand. It prints the same report without changing anything. Keep real feed files out of git (`.feeds/` is ignored).

## What the import does
- Sorts products into our 11 types with keyword rules; leaves out outdoor, kids, mattresses, rug pads and anything we don't sell.
- Groups sizes into one card (rugs show the 5'×8' size; others the lowest price). Colours stay separate cards.
- Reads colour, material and style from the name and description, so taste learning works on real products.
- Checks every product's main photo loads and its store page still exists (not "not found", not redirected to a general page).
- Buy now always uses the Awin tracking link, so purchases earn commission.
- Hides products that disappear from a feed or break. An empty or failed download changes nothing.
- Code: `src/feeds/` (the engine, tested) and `supabase/functions/import-feeds/` (the nightly job).
