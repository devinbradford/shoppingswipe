-- Swipeshop initial schema.
-- Mirrors src/domain/types.ts. Change both together.
--
-- Catalog tables (categories, retailers, products) are readable by everyone
-- and written only by server-side jobs using the service role (Phase 4 feed
-- imports), which bypasses RLS. User tables (swipes, saved_items) are private
-- to their owner through row-level security.

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

create table public.categories (
  id          text primary key
              check (id in ('furniture', 'clothing', 'bedding', 'collectibles', 'decor', 'footwear')),
  label       text not null,
  sort_order  integer not null default 0
);

create table public.retailers (
  id      text primary key,
  name    text not null,
  domain  text not null unique
);

create table public.products (
  id           text primary key,
  category_id  text not null references public.categories (id),
  retailer_id  text not null references public.retailers (id),
  title        text not null,
  brand        text not null,
  description  text not null default '',
  price_cents  integer not null check (price_cents >= 0),
  currency     char(3) not null default 'USD',
  image_urls   text[] not null default '{}',
  product_url  text not null,
  style_tags   text[] not null default '{}',
  material     text not null default '',
  color        text not null default '',
  created_at   timestamptz not null default now(),
  -- Feed bookkeeping (Phase 4): lets imports upsert and dedupe across retailers.
  external_id  text,
  is_active    boolean not null default true,
  updated_at   timestamptz not null default now(),
  unique (retailer_id, external_id)
);

create index products_category_active_idx on public.products (category_id) where is_active;
create index products_retailer_idx on public.products (retailer_id);
create index products_style_tags_idx on public.products using gin (style_tags);

-- ---------------------------------------------------------------------------
-- User data
-- ---------------------------------------------------------------------------

-- The swipe log: source of truth for taste. Append-only from the client
-- (plus deleting your own rows, which is how undo works).
create table public.swipes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id   text not null references public.products (id) on delete cascade,
  category_id  text not null references public.categories (id),
  direction    text not null check (direction in ('keep', 'skip')),
  swiped_at    timestamptz not null default now(),
  -- Client-generated id so the offline queue can replay safely (Phase 3).
  client_id    text,
  unique (user_id, client_id)
);

create index swipes_user_time_idx on public.swipes (user_id, swiped_at desc);

-- Products the user has kept.
create table public.saved_items (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id  text not null references public.products (id) on delete cascade,
  saved_at    timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.categories  enable row level security;
alter table public.retailers   enable row level security;
alter table public.products    enable row level security;
alter table public.swipes      enable row level security;
alter table public.saved_items enable row level security;

create policy "Catalog: anyone can read categories"
  on public.categories for select to anon, authenticated using (true);

create policy "Catalog: anyone can read retailers"
  on public.retailers for select to anon, authenticated using (true);

create policy "Catalog: anyone can read active products"
  on public.products for select to anon, authenticated using (is_active);

create policy "Swipes: read own"
  on public.swipes for select to authenticated using ((select auth.uid()) = user_id);
create policy "Swipes: insert own"
  on public.swipes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Swipes: delete own"
  on public.swipes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Saved items: read own"
  on public.saved_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "Saved items: insert own"
  on public.saved_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Saved items: delete own"
  on public.saved_items for delete to authenticated using ((select auth.uid()) = user_id);
