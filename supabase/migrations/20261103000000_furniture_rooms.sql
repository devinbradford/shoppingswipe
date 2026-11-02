-- MVP scope: furniture only, organised by room and product type.
-- Mirrors CATEGORY_IDS / SUBCATEGORY_IDS and Product.subcategoryId in
-- src/domain/types.ts. Safe to run now: there are no real users or products yet.

-- Rooms replace the old shopping categories.
alter table public.categories drop constraint categories_id_check;
alter table public.categories
  add constraint categories_id_check check (id in ('bedroom', 'living-room', 'kitchen-dining'));

-- Product types within a room (sofas, nightstands, bar stools...).
create table public.subcategories (
  id           text primary key
               check (id in ('bed-frames', 'nightstands', 'dressers', 'sofas', 'accent-chairs',
                             'coffee-tables', 'tv-stands', 'rugs', 'bar-stools', 'dining-tables',
                             'dining-chairs')),
  category_id  text not null references public.categories (id),
  label        text not null,
  sort_order   integer not null default 0
);

alter table public.subcategories enable row level security;
create policy "Catalog: anyone can read subcategories"
  on public.subcategories for select to anon, authenticated using (true);

-- Every product belongs to one product type. A trigger keeps the product's
-- room in step with its type so the two can never disagree.
alter table public.products add column subcategory_id text not null references public.subcategories (id);
create index products_subcategory_active_idx on public.products (subcategory_id) where is_active;

create function public.products_room_matches_type() returns trigger
language plpgsql as $$
begin
  select category_id into new.category_id from public.subcategories where id = new.subcategory_id;
  if new.category_id is null then
    raise exception 'Unknown product type: %', new.subcategory_id using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger products_room_matches_type
  before insert or update of subcategory_id, category_id on public.products
  for each row execute function public.products_room_matches_type();

insert into public.categories (id, label, sort_order) values
  ('bedroom', 'Bedroom', 1),
  ('living-room', 'Living room', 2),
  ('kitchen-dining', 'Kitchen & dining', 3)
on conflict (id) do update set label = excluded.label, sort_order = excluded.sort_order;

insert into public.subcategories (id, category_id, label, sort_order) values
  ('bed-frames', 'bedroom', 'Bed frames', 1),
  ('nightstands', 'bedroom', 'Nightstands', 2),
  ('dressers', 'bedroom', 'Dressers', 3),
  ('sofas', 'living-room', 'Sofas', 1),
  ('accent-chairs', 'living-room', 'Accent chairs', 2),
  ('coffee-tables', 'living-room', 'Coffee tables', 3),
  ('tv-stands', 'living-room', 'TV stands', 4),
  ('rugs', 'living-room', 'Rugs', 5),
  ('bar-stools', 'kitchen-dining', 'Bar stools', 1),
  ('dining-tables', 'kitchen-dining', 'Dining tables', 2),
  ('dining-chairs', 'kitchen-dining', 'Dining chairs', 3);
