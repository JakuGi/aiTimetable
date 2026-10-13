import { describe, expect, it } from 'vitest';
import { pendingCheckIns } from './checkin';
import type { Session, Task } from './types';

const now = new Date(2026, 9, 13, 19, 0);
const at = (h: number, m = 0, day = 13) => new Date(2026, 9, day, h, m).toISOString();
const block = (over: Partial<Session>): Session => ({
  id: 's',
  user_id: 'u',
  kind: 'task',
  task_id: 't1',
  starts_at: at(17),
  ends_at: at(18),
  status: 'planned',
  ...over,
});
const tasks = [{ id: 't1', status: 'todo' } as Task, { id: 't2', status: 'done' } as Task];

describe('pendingCheckIns', () => {
  it('asks about accepted work blocks that are over, oldest first', () => {
    const list = pendingCheckIns(
      [
        block({ id: 'later', starts_at: at(18), ends_at: at(18, 50) }),
        block({ id: 'first' }),
        block({ id: 'running', starts_at: at(18, 30), ends_at: at(19, 30) }),
      ],
      tasks,
      now,
    );
    expect(list.map((s) => s.id)).toEqual(['first', 'later']);
  });

  it('skips pencil, answered, leisure, finished-task and very old blocks', () => {
    const list = pendingCheckIns(
      [
        block({ id: 'pencil', status: 'suggested' }),
        block({ id: 'done', status: 'done' }),
        block({ id: 'skipped', status: 'skipped' }),
        block({ id: 'fun', kind: 'leisure', task_id: null }),
        block({ id: 'task-done', task_id: 't2' }),
        block({ id: 'old', starts_at: at(9, 0, -5), ends_at: at(10, 0, -5) }), // 18 days ago
      ],
      tasks,
      now,
    );
    expect(list).toEqual([]);
  });
});
