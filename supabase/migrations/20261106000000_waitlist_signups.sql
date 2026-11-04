-- Website waitlist v2: signups are written ONLY by the `waitlist-signup` Edge
-- Function (supabase/functions/waitlist-signup), which validates the email,
-- applies rate limits and records consent. The browser never talks to these
-- tables directly, and the public API roles (anon, authenticated) have no access.
--
-- This migration only ADDS objects. It does not change or drop anything that
-- already exists (the older `public.waitlist` table is left as it is).

-- 1. Signups -----------------------------------------------------------------
create table public.waitlist_signups (
  id                    uuid primary key default gen_random_uuid(),
  -- Stored already normalized (trimmed, lower case), see the check below.
  email                 text not null,
  -- Which form the person used: the hero form or the bottom-of-page form.
  source                text not null,
  -- Consent: exactly which disclosure the person saw next to the form, and when.
  consent_version       text not null,
  consent_text          text not null,
  consented_at          timestamptz not null default now(),
  -- Launch updates only. Nothing ever sets this to true today; it exists so a
  -- future, separate marketing opt-in can be recorded explicitly.
  marketing_opt_in      boolean not null default false,
  created_at            timestamptz not null default now(),
  -- Reserved for later email work (confirmation / welcome / unsubscribe).
  confirmed_at          timestamptz,
  welcome_email_sent_at timestamptz,
  unsubscribed_at       timestamptz,

  constraint waitlist_signups_email_normalized check (email = lower(btrim(email))),
  constraint waitlist_signups_email_format check (
    char_length(email) between 3 and 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint waitlist_signups_source_check check (source in ('hero', 'footer')),
  constraint waitlist_signups_consent_version_check check (char_length(consent_version) between 1 and 40),
  constraint waitlist_signups_consent_text_check check (char_length(consent_text) between 1 and 500)
);

-- One row per email, ignoring upper/lower case.
create unique index waitlist_signups_email_key on public.waitlist_signups (lower(email));
create index waitlist_signups_created_at_idx on public.waitlist_signups (created_at desc);

comment on table public.waitlist_signups is
  'Website waitlist. Written only by the waitlist-signup Edge Function via public.waitlist_signup(). Launch updates only.';

-- 2. Rate limiting -----------------------------------------------------------
-- One row per signup attempt, keyed by a salted SHA-256 hash of the visitor's
-- IP address (the raw IP is never stored). Rows older than one day are deleted
-- automatically by public.waitlist_signup().
create table public.waitlist_rate_limits (
  id          bigint generated always as identity primary key,
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  created_at  timestamptz not null default now()
);

create index waitlist_rate_limits_client_idx on public.waitlist_rate_limits (client_hash, created_at desc);
create index waitlist_rate_limits_created_at_idx on public.waitlist_rate_limits (created_at);

comment on table public.waitlist_rate_limits is
  'Short-lived signup attempt log (salted IP hashes) used to rate-limit the waitlist. Auto-pruned after 1 day.';

-- 3. Lock both tables down ---------------------------------------------------
-- Row Level Security on, with NO policies: the public API roles can never see
-- or change a row, even if a grant were added by mistake later.
alter table public.waitlist_signups enable row level security;
alter table public.waitlist_rate_limits enable row level security;

-- Supabase grants new public tables to the API roles by default; take that back.
-- (You still see and manage the list in the Supabase dashboard.)
revoke all on table public.waitlist_signups from public, anon, authenticated, service_role;
revoke all on table public.waitlist_rate_limits from public, anon, authenticated, service_role;

-- 4. The only way in ---------------------------------------------------------
-- Validates, rate-limits and inserts in one transaction. Returns one of:
--   'created'        new signup stored
--   'exists'         email already on the list (nothing changed)
--   'rate_limited'   too many attempts from this visitor
--   'invalid_email'  email failed validation
--   'invalid_request' unknown form source or consent details
create function public.waitlist_signup(
  p_email           text,
  p_source          text,
  p_consent_version text,
  p_consent_text    text,
  p_client_hash     text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email  text := lower(btrim(coalesce(p_email, '')));
  v_recent integer;
  v_daily  integer;
  v_id     uuid;
begin
  if p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid_request';
  end if;

  if char_length(v_email) not between 3 and 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return 'invalid_email';
  end if;

  if p_source is null or p_source not in ('hero', 'footer')
     or p_consent_version is null or char_length(p_consent_version) not between 1 and 40
     or p_consent_text is null or char_length(p_consent_text) not between 1 and 500 then
    return 'invalid_request';
  end if;

  -- Count this visitor's attempts one request at a time, so parallel requests
  -- can't slip past the limit.
  perform pg_advisory_xact_lock(hashtextextended('waitlist:' || p_client_hash, 0));

  select count(*) filter (where created_at > now() - interval '10 minutes'),
         count(*)
    into v_recent, v_daily
    from public.waitlist_rate_limits
   where client_hash = p_client_hash
     and created_at > now() - interval '1 day';

  if v_recent >= 5 or v_daily >= 20 then
    return 'rate_limited';
  end if;

  insert into public.waitlist_rate_limits (client_hash) values (p_client_hash);
  delete from public.waitlist_rate_limits where created_at < now() - interval '1 day';

  insert into public.waitlist_signups (email, source, consent_version, consent_text)
  values (v_email, p_source, p_consent_version, p_consent_text)
  on conflict ((lower(email))) do nothing
  returning id into v_id;

  if v_id is null then
    return 'exists';
  end if;
  return 'created';
end;
$$;

comment on function public.waitlist_signup(text, text, text, text, text) is
  'Waitlist entry point for the waitlist-signup Edge Function (service role only).';

-- Only the server-side role used by the Edge Function may call it.
revoke all on function public.waitlist_signup(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.waitlist_signup(text, text, text, text, text) to service_role;
