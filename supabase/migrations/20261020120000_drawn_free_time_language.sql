-- Free time is only what the user draws into the week (free_blocks). The planner can still
-- leave gaps between work (leisure_minutes_per_day); the preferred windows (after school,
-- evening, before sleep, a set time, per day) and the "tip" mode are gone.

-- whoever kept only drawn free time keeps no gaps either
update public.profiles set leisure_minutes_per_day = 0 where leisure_auto = false;

alter table public.profiles
  drop column leisure_when,
  drop column leisure_start,
  drop column leisure_days,
  drop column leisure_auto;

-- the app's language follows the user to other devices; null = the device's language
alter table public.profiles
  add column language text check (language in ('sk', 'cs', 'en'));
