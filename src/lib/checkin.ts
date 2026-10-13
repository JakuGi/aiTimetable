import type { Session, Task } from './types';
import { DAY } from './time';

/** How far back finished blocks are still asked about. */
export const CHECKIN_DAYS = 14;

/**
 * Accepted work blocks that are over and nobody said how they went yet.
 * Oldest first, so the answers follow the day in order.
 */
export function pendingCheckIns(sessions: Session[], tasks: Task[], now: Date): Session[] {
  const t = now.getTime();
  const open = new Set(tasks.filter((x) => x.status === 'todo').map((x) => x.id));
  return sessions
    .filter((s) => {
      if (s.kind !== 'task' || s.status !== 'planned' || !s.task_id || !open.has(s.task_id)) return false;
      const end = new Date(s.ends_at).getTime();
      return end <= t && end > t - CHECKIN_DAYS * DAY;
    })
    .sort((a, b) => a.ends_at.localeCompare(b.ends_at));
}
