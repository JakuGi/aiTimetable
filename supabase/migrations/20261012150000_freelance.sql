-- Freelance mode: optional gigs with pay, expenses, preparation and travel

alter table public.profiles
  add column freelance_enabled boolean not null default false,
  add column freelance_default_mode text not null default 'event'
    check (freelance_default_mode in ('event', 'project'));

-- mode 'event'   = a gig at a place and time (loading, moving, working at an event)
-- mode 'project' = task-based work with a deadline (programming, design...)
create table public.gigs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  mode text not null default 'event' check (mode in ('event', 'project')),
  client text check (char_length(client) <= 200),
  contact text check (char_length(contact) <= 200),
  status text not null default 'planned' check (status in ('planned', 'confirmed', 'done', 'paid', 'cancelled')),
  -- event mode
  starts_at timestamptz,
  ends_at timestamptz,
  location text check (char_length(location) <= 200),
  prep_minutes integer not null default 0 check (prep_minutes between 0 and 1440),
  travel_minutes integer not null default 0 check (travel_minutes between 0 and 1440),
  prep_notes text check (char_length(prep_notes) <= 5000),
  -- project mode
  deadline timestamptz,
  estimated_minutes integer check (estimated_minutes between 5 and 100000),
  task_id uuid,
  -- money (EUR)
  pay_type text not null default 'fixed' check (pay_type in ('fixed', 'hourly')),
  pay_amount numeric(10, 2) not null default 0 check (pay_amount >= 0),
  hours numeric(7, 2) check (hours >= 0),
  -- [{ "id": "...", "label": "Doprava", "amount": 12.5 }]
  expenses jsonb not null default '[]'::jsonb check (jsonb_typeof(expenses) = 'array'),
  paid_at timestamptz,
  notes text check (char_length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gigs_event_time check (
    mode <> 'event' or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  ),
  constraint gigs_task_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete set null (task_id)
);
create index gigs_user_starts_idx on public.gigs (user_id, starts_at);
create index gigs_task_idx on public.gigs (task_id, user_id);

create trigger gigs_updated_at before update on public.gigs
  for each row execute function private.set_updated_at();

revoke all on public.gigs from anon;
grant select, insert, update, delete on public.gigs to authenticated;

alter table public.gigs enable row level security;

create policy "gigs: owner can read" on public.gigs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "gigs: owner can insert" on public.gigs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "gigs: owner can update" on public.gigs
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "gigs: owner can delete" on public.gigs
  for delete to authenticated using ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.gigs;
