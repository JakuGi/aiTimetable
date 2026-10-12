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
  planning_horizon_days: number;
  priority_colors: string[];
  class_periods: ClassPeriod[];
  odd_week_anchor: string; // "YYYY-MM-DD", a Monday of an odd week
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
  | 'event_templates';
