-- Phase 3: accounts and sync.

-- One row per signed-in user: things that aren't swipes but shape taste.
create table public.profiles (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  style_picks  text[] not null default '{}',
  onboarded    boolean not null default false,
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Profiles: read own"
  on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "Profiles: insert own"
  on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Profiles: update own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Every swipe now carries the id the phone gave it, so a swipe sent twice
-- (e.g. replayed from the offline queue) is stored once, and undo can delete it.
update public.swipes set client_id = id::text where client_id is null;
alter table public.swipes alter column client_id set not null;

-- Lists can be renamed on another device; let the owner update items too
-- (needed for upserts from the offline queue).
create policy "Wishlist items: update own"
  on public.wishlist_items for update to authenticated
  using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));

create policy "Saved items: update own"
  on public.saved_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- "Delete my account": required by the App Store. Removes the sign-in and,
-- through the cascades above, every swipe, kept item, list and profile.
create function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
