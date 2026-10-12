-- Faster entry: school bell times, odd/even weeks, reusable templates (bus connections etc.)

-- ---------------------------------------------------------------------------
-- profiles: bell schedule + which weeks count as odd
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column class_periods jsonb not null default '[
    {"start":"08:00","end":"08:45"},
    {"start":"08:55","end":"09:40"},
    {"start":"09:50","end":"10:35"},
    {"start":"10:55","end":"11:40"},
    {"start":"11:50","end":"12:35"},
    {"start":"12:45","end":"13:30"},
    {"start":"13:35","end":"14:20"},
    {"start":"14:25","end":"15:10"}
  ]'::jsonb,
  -- any Monday of an odd week; parity of other weeks is counted from it
  add column odd_week_anchor date not null default '2024-01-01';

alter table public.profiles
  add constraint profiles_class_periods_array check (
    jsonb_typeof(class_periods) = 'array' and jsonb_array_length(class_periods) <= 16
  ),
  add constraint profiles_odd_week_anchor_monday check (extract(isodow from odd_week_anchor) = 1);

-- ---------------------------------------------------------------------------
-- routine_blocks: odd/even weeks; buses move out of the regular week
-- ---------------------------------------------------------------------------
alter table public.routine_blocks
  add column week_parity text not null default 'all' check (week_parity in ('all', 'odd', 'even'));

-- ---------------------------------------------------------------------------
-- event_templates: saved connections and other repeating-but-not-weekly things,
-- dropped into concrete days of a concrete week
-- ---------------------------------------------------------------------------
create table public.event_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind text not null default 'commute' check (kind in ('event', 'work', 'commute', 'leisure')),
  start_time time not null,
  end_time time not null,
  location text check (char_length(location) <= 200),
  notes text check (char_length(notes) <= 2000),
  category_id uuid,
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  remind_minutes_before integer check (remind_minutes_before between 0 and 10080),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_templates_time_order check (end_time > start_time),
  constraint event_templates_category_fk foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null (category_id)
);
create index event_templates_user_id_idx on public.event_templates (user_id);
create index event_templates_category_idx on public.event_templates (category_id, user_id);

create trigger event_templates_updated_at before update on public.event_templates
  for each row execute function private.set_updated_at();

-- existing weekly bus blocks become templates
insert into public.event_templates (user_id, title, kind, start_time, end_time, location, notes, category_id, color)
select user_id, title, 'commute', start_time, end_time, location, notes, category_id, color
from public.routine_blocks
where kind = 'commute';
delete from public.routine_blocks where kind = 'commute';

alter table public.routine_blocks drop constraint routine_blocks_kind_check;
alter table public.routine_blocks
  add constraint routine_blocks_kind_check check (kind in ('class', 'work', 'leisure', 'other'));

revoke all on public.event_templates from anon;
grant select, insert, update, delete on public.event_templates to authenticated;

alter table public.event_templates enable row level security;

create policy "event_templates: owner can read" on public.event_templates
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "event_templates: owner can insert" on public.event_templates
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "event_templates: owner can update" on public.event_templates
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "event_templates: owner can delete" on public.event_templates
  for delete to authenticated using ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.event_templates;
