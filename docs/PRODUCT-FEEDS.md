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

### 3. Add two secrets
Supabase → **Edge Functions → Secrets** → add:

| Name | Value |
|---|---|
| `AWIN_API_KEY` | the fresh key from step 1 |
| `IMPORT_FEEDS_SECRET` | a long random password (see below) |

To make a random password on Windows, open **PowerShell** and run:

```powershell
-join ((48..57)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```

Copy the result into `IMPORT_FEEDS_SECRET`, and keep it for step 6.

### 4. Deploy the import job
Supabase → **Edge Functions → Deploy a new function → Via Editor**.
- Name it exactly: `import-feeds`
- Delete the sample code and paste the whole file `supabase/dashboard/import-feeds.ts`
- **Turn OFF "Verify JWT"** (it checks your `IMPORT_FEEDS_SECRET` instead)
- Deploy.

### 5. Add your first brand
You need the brand's **Awin merchant id** and **feed id**:
- Merchant id: on the brand's program page in Awin (also the `merchant_id` column in a downloaded feed).
- Feed id: the number after `/fid/` in Create-a-Feed's download link (also the `data_feed_id` column).
  For Super Area Rugs these are 88509 and 107031.

SQL Editor → New query:

```sql
insert into feed_sources (id, network, advertiser_id, feed_id, name, domain)
values ('awin-88509', 'awin', '88509', '107031', 'Super Area Rugs', 'superarearugs.com');
```

(`id` is always `awin-` plus the merchant id. `name` is what shoppers see as the store.)

### 6. Run it once and read the report
Supabase → **Edge Functions → import-feeds → Test**: method **POST**, add a header
`x-import-secret` with your secret from step 3, body `{}` → **Send**.

Then open **Table Editor → import_report**. One row per store:
- **imported**: products now in the app
- **skipped**: what was left out and why (out of scope, broken photo, link moved, out of stock…)
- **deactivated**: products hidden because they left the feed or broke
- **error**: if the feed itself couldn't be downloaded

### 7. Run it every night
Supabase → **Database → Extensions**: turn on **pg_cron** and **pg_net**.
Then SQL Editor (replace `YOUR-PROJECT-REF` and `YOUR-SECRET`):

```sql
-- Keep the secret in Supabase Vault, not in the schedule itself.
select vault.create_secret('YOUR-SECRET', 'import_feeds_secret');

select cron.schedule(
  'import-feeds-nightly',
  '15 8 * * *',   -- every day at 08:15 UTC (3:15 am US Eastern)
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/import-feeds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-import-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'import_feeds_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
  $$
);
```

Your project ref is in Supabase → **Project Settings → General**.

---

## Adding more brands later
When a brand approves you on Awin, repeat **step 5** with its ids. It's picked up the next night
(or press **Test** to import now). To pause a brand: `update feed_sources set enabled = false where id = 'awin-…';`

With more than about 3 brands, schedule one job per brand so each stays within Supabase's time limit:
copy the step 7 schedule with a different name and the body `'{"source": "awin-…"}'::jsonb`.

## Trying a feed before adding it (on a computer with the code)
Download the feed from Create-a-Feed (CSV, comma, zip or gzip) and run:

```powershell
npm run import-feed -- path\to\feed.csv.gz --check
```

It prints the same report without changing anything. Keep real feed files out of git (`.feeds/` is ignored).

## What the import does
- Sorts products into our 11 types with keyword rules; leaves out outdoor, kids, mattresses, rug pads and anything we don't sell.
- Groups sizes into one card (rugs show the 5'×8' size; others the lowest price). Colours stay separate cards.
- Reads colour, material and style from the name and description, so taste learning works on real products.
- Checks every product's main photo loads and its store page still exists (not "not found", not redirected to a general page).
- Buy now always uses the Awin tracking link, so purchases earn commission.
- Hides products that disappear from a feed or break. An empty or failed download changes nothing.
- Code: `src/feeds/` (the engine, tested) and `supabase/functions/import-feeds/` (the nightly job).
