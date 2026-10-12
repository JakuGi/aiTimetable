-- aiTimetable – initial schema
-- Every user-owned table carries user_id and is protected by RLS (owner-only access).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: per-user planning preferences
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  day_start time not null default '07:00',
  day_end time not null default '22:00',
  focus_block_minutes integer not null default 50 check (focus_block_minutes between 15 and 240),
  break_minutes integer not null default 10 check (break_minutes between 0 and 60),
  max_focus_minutes_per_day integer not null default 240 check (max_focus_minutes_per_day between 15 and 960),
  leisure_minutes_per_day integer not null default 60 check (leisure_minutes_per_day between 0 and 480),
  planning_horizon_days integer not null default 14 check (planning_horizon_days between 1 and 60),
  priority_colors text[] not null default array['#8FB8A8', '#F2C14E', '#F08A4B', '#E2483D'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_day_bounds check (day_end > day_start),
  constraint profiles_priority_colors check (cardinality(priority_colors) = 4)
);

-- ---------------------------------------------------------------------------
-- categories: user-defined labels with colors (Škola, Hry, ...)
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint categories_id_user_unique unique (id, user_id)
);
create index categories_user_id_idx on public.categories (user_id);

-- ---------------------------------------------------------------------------
-- tasks: things to get done, with estimate, priority and deadline
-- ---------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text check (char_length(notes) <= 5000),
  category_id uuid,
  priority smallint not null default 2 check (priority between 1 and 4),
  estimated_minutes integer not null default 60 check (estimated_minutes between 5 and 10000),
  deadline timestamptz,
  status text not null default 'todo' check (status in ('todo', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_id_user_unique unique (id, user_id),
  constraint tasks_category_fk foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null (category_id)
);
create index tasks_user_status_deadline_idx on public.tasks (user_id, status, deadline);
create index tasks_category_idx on public.tasks (category_id, user_id);

-- ---------------------------------------------------------------------------
-- routine_blocks: the regular week (classes, commute/bus, work shifts, leisure)
-- weekdays use ISO numbering: 1 = Monday ... 7 = Sunday
-- ---------------------------------------------------------------------------
create table public.routine_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  kind text not null default 'class' check (kind in ('class', 'work', 'commute', 'leisure', 'other')),
  weekdays smallint[] not null check (cardinality(weekdays) > 0 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  start_time time not null,
  end_time time not null,
  location text check (char_length(location) <= 200),
  notes text check (char_length(notes) <= 2000),
  category_id uuid,
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  valid_from date,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_time_order check (end_time > start_time),
  constraint routine_valid_range check (valid_until is null or valid_from is null or valid_until >= valid_from),
  constraint routine_category_fk foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null (category_id)
);
create index routine_blocks_user_id_idx on public.routine_blocks (user_id);
create index routine_blocks_category_idx on public.routine_blocks (category_id, user_id);

-- ---------------------------------------------------------------------------
-- events: one-off calendar entries (events, trips, reminders, leisure)
-- ---------------------------------------------------------------------------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  kind text not null default 'event' check (kind in ('event', 'work', 'commute', 'reminder', 'leisure')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text check (char_length(location) <= 200),
  notes text check (char_length(notes) <= 5000),
  category_id uuid,
  color text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  remind_minutes_before integer check (remind_minutes_before between 0 and 10080),
  blocks_planning boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order check (ends_at is null or ends_at >= starts_at),
  constraint events_category_fk foreign key (category_id, user_id)
    references public.categories (id, user_id) on delete set null (category_id)
);
create index events_user_starts_idx on public.events (user_id, starts_at);
create index events_category_idx on public.events (category_id, user_id);

-- ---------------------------------------------------------------------------
-- sessions: concrete time blocks produced by the planner (or placed by hand)
-- status: suggested -> planned -> done | skipped
-- ---------------------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'task' check (kind in ('task', 'leisure')),
  task_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'suggested' check (status in ('suggested', 'planned', 'done', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_time_order check (ends_at > starts_at),
  constraint sessions_task_required check (kind = 'leisure' or task_id is not null),
  constraint sessions_task_fk foreign key (task_id, user_id)
    references public.tasks (id, user_id) on delete cascade
);
create index sessions_user_starts_idx on public.sessions (user_id, starts_at);
create index sessions_task_idx on public.sessions (task_id, user_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger tasks_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();
create trigger routine_blocks_updated_at before update on public.routine_blocks
  for each row execute function private.set_updated_at();
create trigger events_updated_at before update on public.events
  for each row execute function private.set_updated_at();
create trigger sessions_updated_at before update on public.sessions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- new user bootstrap: profile + starter categories
-- Lives in the unexposed private schema; runs only as an auth.users trigger.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(new.raw_user_meta_data ->> 'display_name', 80), ''));

  insert into public.categories (user_id, name, color, sort_order)
  values
    (new.id, 'Škola', '#2B4BDB', 0),
    (new.id, 'Práca', '#7A5AF8', 1),
    (new.id, 'Osobné', '#12A39A', 2),
    (new.id, 'Voľný čas', '#E8A317', 3),
    (new.id, 'Hry', '#E2489A', 4),
    (new.id, 'Cestovanie', '#7C879C', 5);

  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Data API exposure (explicit; new tables are not exposed automatically)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.categories, public.tasks,
  public.routine_blocks, public.events, public.sessions from anon;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.categories, public.tasks,
  public.routine_blocks, public.events, public.sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: owner-only
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.tasks enable row level security;
alter table public.routine_blocks enable row level security;
alter table public.events enable row level security;
alter table public.sessions enable row level security;

create policy "profiles: owner can read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles: owner can update" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'tasks', 'routine_blocks', 'events', 'sessions'] loop
    execute format(
      'create policy "%1$s: owner can read" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner can insert" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner can update" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy "%1$s: owner can delete" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Realtime: push row changes to every signed-in device of the owner
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.profiles, public.categories, public.tasks,
  public.routine_blocks, public.events, public.sessions;
