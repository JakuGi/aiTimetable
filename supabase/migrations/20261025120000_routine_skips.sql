-- Regular blocks that don't happen on a given day: one class cancelled, or a whole day off
-- (holiday) when routine_block_id is null. Shown crossed out; the planner treats the time as free.

alter table public.routine_blocks
  add constraint routine_blocks_id_user_unique unique (id, user_id);

create table public.routine_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  routine_block_id uuid,                               -- null = the whole day (holiday)
  day date not null,
  note text check (char_length(note) <= 120),
  created_at timestamptz not null default now(),
  constraint routine_skips_block_fk foreign key (routine_block_id, user_id)
    references public.routine_blocks (id, user_id) on delete cascade
);
-- one mark per block and day, one holiday per day
create unique index routine_skips_block_day_idx on public.routine_skips (user_id, routine_block_id, day)
  where routine_block_id is not null;
create unique index routine_skips_holiday_idx on public.routine_skips (user_id, day)
  where routine_block_id is null;
create index routine_skips_user_day_idx on public.routine_skips (user_id, day);
-- deleting a regular block cascades to its skips
create index routine_skips_block_fk_idx on public.routine_skips (routine_block_id, user_id);

revoke all on public.routine_skips from anon;
grant select, insert, update, delete on public.routine_skips to authenticated;

alter table public.routine_skips enable row level security;

create policy "routine_skips: owner can read" on public.routine_skips
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "routine_skips: owner can insert" on public.routine_skips
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "routine_skips: owner can update" on public.routine_skips
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "routine_skips: owner can delete" on public.routine_skips
  for delete to authenticated using ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.routine_skips;
