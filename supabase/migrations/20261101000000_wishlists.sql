-- Named wishlists. Mirrors `Wishlist` / `WishlistItem` in src/domain/types.ts.

create table public.wishlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  created_at  timestamptz not null default now()
);

-- One list per name per user, ignoring case (matches the app's rule).
create unique index wishlists_user_name_idx on public.wishlists (user_id, lower(name));

create table public.wishlist_items (
  wishlist_id  uuid not null references public.wishlists (id) on delete cascade,
  product_id   text not null references public.products (id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (wishlist_id, product_id)
);

alter table public.wishlists      enable row level security;
alter table public.wishlist_items enable row level security;

create policy "Wishlists: read own"
  on public.wishlists for select to authenticated using ((select auth.uid()) = user_id);
create policy "Wishlists: insert own"
  on public.wishlists for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Wishlists: update own"
  on public.wishlists for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Wishlists: delete own"
  on public.wishlists for delete to authenticated using ((select auth.uid()) = user_id);

-- Items are visible/editable only through a list you own.
create policy "Wishlist items: read own"
  on public.wishlist_items for select to authenticated
  using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));
create policy "Wishlist items: insert own"
  on public.wishlist_items for insert to authenticated
  with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));
create policy "Wishlist items: delete own"
  on public.wishlist_items for delete to authenticated
  using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));
