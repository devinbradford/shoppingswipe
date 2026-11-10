-- Photo measurements for the studio card on the swipe deck (Devin approved, Nov 2026).
-- Added only: nothing existing is dropped or changed. Filled by the nightly import
-- (one entry per image_urls photo: shape, edge colour, cut-out or room photo, and where
-- the furniture sits). Empty means "show the whole photo", exactly as before.
alter table public.products add column if not exists image_meta jsonb;

comment on column public.products.image_meta is
  'Per photo, in image_urls order: {url, ratio, bg, kind: cutout|scene, box?: [x,y,w,h] fractions, note?}. Read-only hint for the app; the photos themselves are never changed.';
