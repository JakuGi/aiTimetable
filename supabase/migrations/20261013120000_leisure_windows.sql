-- Free time is no longer planned as "Voľný čas" blocks. It is a preferred window the planner
-- keeps empty, shown faintly behind the timetable.
--   leisure_when: after_school | evening | before_sleep | custom (leisure_start) | flexible | per_day
--   leisure_days: per_day mode, Monday..Sunday: {"when": ..., "start": "HH:MM" | null, "minutes": int}
--                 ("off" = no free time kept that day)

alter table public.profiles
  add column leisure_when text not null default 'evening'
    check (leisure_when in ('after_school', 'evening', 'before_sleep', 'custom', 'flexible', 'per_day')),
  add column leisure_start time not null default '18:00',
  add column leisure_days jsonb not null default '[]'::jsonb
    check (jsonb_typeof(leisure_days) = 'array' and jsonb_array_length(leisure_days) <= 7);

-- the old planner's free-time blocks (pencil ones and the accepted ones still ahead) give way to the windows
delete from public.sessions
where kind = 'leisure' and (status = 'suggested' or starts_at > now());
