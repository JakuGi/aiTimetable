-- Push notifications: per-user preferences, device subscriptions, delivery log, minute scheduler

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- preferences (synced across devices)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column timezone text not null default 'Europe/Bratislava' check (char_length(timezone) <= 64),
  add column notify_events boolean not null default true,      -- reminders set on events
  add column notify_sessions boolean not null default true,    -- start of a planned work block
  add column session_lead_minutes integer not null default 5 check (session_lead_minutes between 0 and 60),
  add column notify_gigs boolean not null default true,        -- freelance: time to leave
  add column notify_deadlines boolean not null default true,   -- task deadline coming up
  add column deadline_lead_hours integer not null default 24 check (deadline_lead_hours between 1 and 168),
  add column notify_summary boolean not null default true,     -- morning overview of the day
  add column summary_time time not null default '07:00',
  add column quiet_enabled boolean not null default true,
  add column quiet_from time not null default '22:00',
  add column quiet_to time not null default '07:00';

-- ---------------------------------------------------------------------------
-- one row per device/browser that accepted notifications
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  device text check (char_length(device) <= 120),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: owner can read" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "push_subscriptions: owner can insert" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push_subscriptions: owner can update" on public.push_subscriptions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "push_subscriptions: owner can delete" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- what was already sent, so the minute job never sends twice.
-- Only the Edge Function (secret key) touches it: RLS on, no policies, no grants.
-- ---------------------------------------------------------------------------
create table public.notification_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) <= 200),
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
revoke all on public.notification_log from anon, authenticated;
alter table public.notification_log enable row level security;
