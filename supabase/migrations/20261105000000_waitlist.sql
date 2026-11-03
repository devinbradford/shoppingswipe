-- Website waitlist: anyone can add their email; nobody can read the list
-- through the public API (you read it in the Supabase dashboard).
create table public.waitlist (
  email       text primary key check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  source      text not null default 'website' check (char_length(source) <= 40),
  created_at  timestamptz not null default now()
);

alter table public.waitlist enable row level security;

create policy "Waitlist: anyone can join"
  on public.waitlist for insert to anon, authenticated with check (true);

-- Only inserting is allowed for the public: no select, update or delete.
revoke all on public.waitlist from anon, authenticated;
grant insert on public.waitlist to anon, authenticated;
