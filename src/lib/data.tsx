import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../components/Toast';
import type { CalendarEvent, Category, Profile, RoutineBlock, Session, TableName, Task } from './types';
import type { Suggestion } from './planner';

interface Tables {
  profiles: Profile[];
  categories: Category[];
  tasks: Task[];
  routine_blocks: RoutineBlock[];
  events: CalendarEvent[];
  sessions: Session[];
}

type Row<T extends TableName> = Tables[T][number];
type Draft<T extends TableName> = Partial<Omit<Row<T>, 'id' | 'user_id'>>;

interface DataApi extends Omit<Tables, 'profiles'> {
  profile: Profile | null;
  loading: boolean;
  insert: <T extends TableName>(table: T, row: Draft<T>) => Promise<Row<T> | null>;
  update: <T extends TableName>(table: T, id: string, patch: Draft<T>) => Promise<boolean>;
  remove: (table: TableName, id: string) => Promise<boolean>;
  /** Replace all future "suggested" sessions with a fresh planner result. */
  saveSuggestions: (suggestions: Suggestion[]) => Promise<boolean>;
  setSessionStatus: (ids: string[], status: Session['status']) => Promise<boolean>;
  /** Remove pending suggestions of one task (e.g. after it was finished). */
  dropSuggestions: (taskId: string) => Promise<boolean>;
  categoryById: (id: string | null) => Category | undefined;
  taskById: (id: string | null) => Task | undefined;
}

const ORDER: Record<TableName, { column: string; ascending: boolean }> = {
  profiles: { column: 'id', ascending: true },
  categories: { column: 'sort_order', ascending: true },
  tasks: { column: 'created_at', ascending: false },
  routine_blocks: { column: 'start_time', ascending: true },
  events: { column: 'starts_at', ascending: true },
  sessions: { column: 'starts_at', ascending: true },
};

const TABLES = Object.keys(ORDER) as TableName[];
const EMPTY: Tables = { profiles: [], categories: [], tasks: [], routine_blocks: [], events: [], sessions: [] };

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const notify = useToast();
  const [data, setData] = useState<Tables>(EMPTY);
  const [loading, setLoading] = useState(true);
  const timers = useRef<Partial<Record<TableName, ReturnType<typeof setTimeout>>>>({});

  const fetchTable = useCallback(async (table: TableName) => {
    const { column, ascending } = ORDER[table];
    const { data: rows, error } = await supabase.from(table).select('*').order(column, { ascending });
    if (error) {
      notify(`Nepodarilo sa načítať dáta (${table}): ${error.message}`, 'error');
      return;
    }
    setData((d) => ({ ...d, [table]: rows ?? [] }));
  }, [notify]);

  // collapse bursts of realtime events (e.g. bulk insert of suggestions) into one fetch
  const refetchSoon = useCallback((table: TableName) => {
    clearTimeout(timers.current[table]);
    timers.current[table] = setTimeout(() => fetchTable(table), 150);
  }, [fetchTable]);

  useEffect(() => {
    if (!user) {
      setData(EMPTY);
      setLoading(true);
      return;
    }
    let cancelled = false;
    Promise.all(TABLES.map(fetchTable)).then(() => !cancelled && setLoading(false));

    const channel = supabase.channel(`user-data-${user.id}`);
    for (const table of TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: table === 'profiles' ? `id=eq.${user.id}` : `user_id=eq.${user.id}` },
        () => refetchSoon(table),
      );
    }
    channel.subscribe();

    // catch up after the device was asleep or offline
    const onFocus = () => document.visibilityState === 'visible' && TABLES.forEach(refetchSoon);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('online', onFocus);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [user, fetchTable, refetchSoon]);

  const fail = useCallback((msg: string) => {
    notify(msg, 'error');
    return false;
  }, [notify]);

  const api = useMemo<DataApi>(() => {
    const insert: DataApi['insert'] = async (table, row) => {
      const { data: created, error } = await supabase.from(table).insert(row as never).select().single();
      if (error) {
        fail(`Uloženie zlyhalo: ${error.message}`);
        return null;
      }
      await fetchTable(table);
      return created;
    };
    const update: DataApi['update'] = async (table, id, patch) => {
      const { error } = await supabase.from(table).update(patch as never).eq('id', id);
      if (error) return fail(`Uloženie zlyhalo: ${error.message}`);
      await fetchTable(table);
      return true;
    };
    const remove: DataApi['remove'] = async (table, id) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) return fail(`Odstránenie zlyhalo: ${error.message}`);
      await fetchTable(table);
      return true;
    };
    const saveSuggestions: DataApi['saveSuggestions'] = async (suggestions) => {
      const del = await supabase.from('sessions').delete().eq('status', 'suggested');
      if (del.error) return fail(`Návrh sa nepodarilo uložiť: ${del.error.message}`);
      if (suggestions.length) {
        const { error } = await supabase.from('sessions').insert(
          suggestions.map((s) => ({
            kind: s.kind,
            task_id: s.taskId,
            starts_at: s.start.toISOString(),
            ends_at: s.end.toISOString(),
            status: 'suggested',
          })),
        );
        if (error) return fail(`Návrh sa nepodarilo uložiť: ${error.message}`);
      }
      await fetchTable('sessions');
      return true;
    };
    const dropSuggestions: DataApi['dropSuggestions'] = async (taskId) => {
      const { error } = await supabase.from('sessions').delete().eq('task_id', taskId).eq('status', 'suggested');
      if (error) return fail(`Zmena zlyhala: ${error.message}`);
      await fetchTable('sessions');
      return true;
    };
    const setSessionStatus: DataApi['setSessionStatus'] = async (ids, status) => {
      if (!ids.length) return true;
      const { error } = await supabase.from('sessions').update({ status }).in('id', ids);
      if (error) return fail(`Zmena zlyhala: ${error.message}`);
      await fetchTable('sessions');
      return true;
    };
    return {
      profile: data.profiles[0] ?? null,
      categories: data.categories,
      tasks: data.tasks,
      routine_blocks: data.routine_blocks,
      events: data.events,
      sessions: data.sessions,
      loading,
      insert,
      update,
      remove,
      saveSuggestions,
      setSessionStatus,
      dropSuggestions,
      categoryById: (id) => (id ? data.categories.find((c) => c.id === id) : undefined),
      taskById: (id) => (id ? data.tasks.find((t) => t.id === id) : undefined),
    };
  }, [data, loading, fetchTable, fail]);

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
