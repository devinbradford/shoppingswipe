-- Phase 4: product feed imports.
--
-- feed_sources: one row per brand feed to import (an affiliate network program).
-- import_runs:  one row per import attempt, with the report (imported / skipped and why).
--
-- Both are server-only: RLS on and no policies, so the app can't read or write them.
-- The import-feeds Edge Function uses the service role, which bypasses RLS.

create table public.feed_sources (
  id            text primary key,                       -- our retailer id, e.g. 'awin-88509'
  network       text not null check (network in ('awin')),
  advertiser_id text not null,                          -- Awin "merchant id" (mid)
  feed_id       text not null,                          -- Awin feed id ("fid" in Create-a-Feed)
  name          text not null,                          -- shown in the app as the store name
  domain        text not null,                          -- e.g. 'superarearugs.com'
  enabled       boolean not null default true,
  max_products  integer not null default 2000 check (max_products between 1 and 20000),
  created_at    timestamptz not null default now()
);

create table public.import_runs (
  id           uuid primary key default gen_random_uuid(),
  source_id    text not null references public.feed_sources (id) on delete cascade,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'ok', 'failed')),
  imported     integer,
  deactivated  integer,
  report       jsonb,
  error        text
);

create index import_runs_source_started_idx on public.import_runs (source_id, started_at desc);

alter table public.feed_sources enable row level security;
alter table public.import_runs  enable row level security;

-- Latest run per brand, in plain columns: open this in the Supabase Table Editor.
-- security_invoker keeps the tables' RLS in force, so only the service role and the
-- dashboard (which run as admin) can read it.
create view public.import_report with (security_invoker = true) as
  select distinct on (r.source_id)
    s.name                                   as store,
    r.status,
    r.imported,
    r.deactivated,
    (r.report ->> 'rows')::int               as feed_rows,
    r.report -> 'skipped'                    as skipped,
    r.report -> 'byType'                     as by_type,
    r.error,
    r.finished_at
  from public.import_runs r
  join public.feed_sources s on s.id = r.source_id
  order by r.source_id, r.started_at desc;

revoke all on public.feed_sources, public.import_runs, public.import_report from anon, authenticated;
