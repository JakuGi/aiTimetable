-- How the app addresses the user (urobil / urobila), and free time the user reserves by hand.

alter table public.profiles
  add column gender text check (gender in ('m', 'f')),           -- null = not chosen yet, the app asks
  add column leisure_auto boolean not null default true;          -- false: only the drawn free time is kept

-- Free time drawn into the timetable. The planner keeps it empty and takes from it last,
-- only for work that would otherwise miss its deadline (and then says so).
create table public.free_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint free_blocks_time_order check (ends_at > starts_at)
);
create index free_blocks_user_starts_idx on public.free_blocks (user_id, starts_at);

create trigger free_blocks_updated_at before update on public.free_blocks
  for each row execute function private.set_updated_at();

revoke all on public.free_blocks from anon;
grant select, insert, update, delete on public.free_blocks to authenticated;

alter table public.free_blocks enable row level security;

create policy "free_blocks: owner can read" on public.free_blocks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "free_blocks: owner can insert" on public.free_blocks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "free_blocks: owner can update" on public.free_blocks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "free_blocks: owner can delete" on public.free_blocks
  for delete to authenticated using ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.free_blocks;
