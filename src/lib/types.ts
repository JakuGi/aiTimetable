export type Priority = 1 | 2 | 3 | 4;

export interface Profile {
  id: string;
  display_name: string | null;
  day_start: string; // "HH:MM:SS"
  day_end: string;
  focus_block_minutes: number;
  break_minutes: number;
  max_focus_minutes_per_day: number;
  leisure_minutes_per_day: number;
  leisure_when: LeisureMode;
  leisure_start: string; // "HH:MM[:SS]", for leisure_when = 'custom'
  leisure_days: LeisureDay[]; // Monday..Sunday, for leisure_when = 'per_day'
  /** false: the planner keeps only the free time drawn by hand (FreeBlock) */
  leisure_auto: boolean;
  /** how the app talks to the user: "urobil" / "urobila"; null = not chosen yet */
  gender: Gender | null;
  planning_horizon_days: number;
  priority_colors: string[];
  class_periods: ClassPeriod[];
  odd_week_anchor: string; // "YYYY-MM-DD", a Monday of an odd week
  freelance_enabled: boolean;
  freelance_default_mode: GigMode;
  timezone: string;
  notify_events: boolean;
  notify_sessions: boolean;
  session_lead_minutes: number;
  notify_gigs: boolean;
  notify_deadlines: boolean;
  deadline_lead_hours: number;
  notify_summary: boolean;
  summary_time: string;
  quiet_enabled: boolean;
  quiet_from: string;
  quiet_to: string;
}

export type Gender = 'm' | 'f';

/** Free time drawn into the timetable by hand: kept empty, given up last. */
export interface FreeBlock {
  id: string;
  user_id: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
}

/** When free time is kept: a preferred window the planner leaves empty. */
export type LeisureWhen = 'after_school' | 'evening' | 'before_sleep' | 'custom' | 'flexible';
export type LeisureMode = LeisureWhen | 'per_day';

export interface LeisureDay {
  when: LeisureWhen | 'off';
  start: string | null; // "HH:MM" for 'custom'
  minutes: number;
}

/** event = a gig at a place and time (loading, moving, event work); project = task-based work */
export type GigMode = 'event' | 'project';
export type GigStatus = 'planned' | 'confirmed' | 'done' | 'paid' | 'cancelled';

export interface GigExpense {
  id: string;
  label: string;
  amount: number;
}

export interface Gig {
  id: string;
  user_id: string;
  title: string;
  mode: GigMode;
  client: string | null;
  contact: string | null;
  status: GigStatus;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  prep_minutes: number;
  travel_minutes: number;
  prep_notes: string | null;
  deadline: string | null;
  estimated_minutes: number | null;
  task_id: string | null;
  pay_type: 'fixed' | 'hourly';
  pay_amount: number | string; // numeric comes back as string
  hours: number | string | null;
  expenses: GigExpense[];
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface ClassPeriod {
  start: string; // "HH:MM"
  end: string;
}

export type WeekParity = 'all' | 'odd' | 'even';

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
}

export type TaskStatus = 'todo' | 'done';

export interface Task {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  category_id: string | null;
  priority: Priority;
  estimated_minutes: number;
  deadline: string | null;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
}

export type RoutineKind = 'class' | 'work' | 'leisure' | 'other';

export interface RoutineBlock {
  id: string;
  user_id: string;
  title: string;
  kind: RoutineKind;
  weekdays: number[]; // ISO 1 = Monday ... 7 = Sunday
  start_time: string; // "HH:MM:SS"
  end_time: string;
  location: string | null;
  notes: string | null;
  category_id: string | null;
  color: string | null;
  valid_from: string | null; // "YYYY-MM-DD"
  valid_until: string | null;
  week_parity: WeekParity;
}

export type TemplateKind = 'event' | 'work' | 'commute' | 'leisure';

/** A saved connection (bus, train) or other block you drop into chosen days of a week. */
export interface EventTemplate {
  id: string;
  user_id: string;
  title: string;
  kind: TemplateKind;
  start_time: string;
  end_time: string;
  location: string | null;
  notes: string | null;
  category_id: string | null;
  color: string | null;
  remind_minutes_before: number | null;
  sort_order: number;
}

export type EventKind = 'event' | 'work' | 'commute' | 'reminder' | 'leisure';

export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  kind: EventKind;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  category_id: string | null;
  color: string | null;
  remind_minutes_before: number | null;
  blocks_planning: boolean;
}

export type SessionStatus = 'suggested' | 'planned' | 'done' | 'skipped';
export type SessionKind = 'task' | 'leisure';

export interface Session {
  id: string;
  user_id: string;
  kind: SessionKind;
  task_id: string | null;
  starts_at: string;
  ends_at: string;
  status: SessionStatus;
}

export type TableName =
  | 'profiles'
  | 'categories'
  | 'tasks'
  | 'routine_blocks'
  | 'events'
  | 'sessions'
  | 'event_templates'
  | 'gigs'
  | 'free_blocks';
