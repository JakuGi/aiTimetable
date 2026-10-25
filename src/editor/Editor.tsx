import { createContext, useContext, useState, type ReactNode } from 'react';
import { useData } from '../lib/data';
import type { CalendarEvent, EventTemplate, FreeBlock, Gig, RoutineBlock, Session, Task, WeekParity } from '../lib/types';
import { FreeBlockDialog } from './FreeBlockDialog';
import { GigDialog } from './GigDialog';
import { ClassGridDialog } from './ClassGridDialog';
import { PlaceTemplateDialog, TemplateDialog } from './TemplateDialogs';
import { EventDialog } from './EventDialog';
import { RoutineDialog } from './RoutineDialog';
import { SessionDialog } from './SessionDialog';
import { TaskDialog } from './TaskDialog';
import { DayDialog, RoutineDayDialog } from './SkipDialogs';

type Open =
  | { type: 'event'; initial: Partial<CalendarEvent> }
  | { type: 'task'; initial: Partial<Task> }
  | { type: 'routine'; initial: Partial<RoutineBlock> }
  | { type: 'session'; session: Session }
  | { type: 'template'; initial: Partial<EventTemplate> }
  | { type: 'place'; template: EventTemplate; weekStart: Date }
  | { type: 'classGrid'; parity: WeekParity }
  | { type: 'gig'; initial: Partial<Gig>; key: number }
  | { type: 'free'; block: FreeBlock }
  | { type: 'routineDay'; routine: RoutineBlock; day: Date }
  | { type: 'day'; day: Date };

interface EditorApi {
  editEvent: (initial?: Partial<CalendarEvent>) => void;
  editTask: (initial?: Partial<Task>) => void;
  editRoutine: (initial?: Partial<RoutineBlock>) => void;
  editSession: (session: Session) => void;
  editTemplate: (initial?: Partial<EventTemplate>) => void;
  placeTemplate: (template: EventTemplate, weekStart: Date) => void;
  editClassGrid: (parity?: WeekParity) => void;
  editGig: (initial?: Partial<Gig>) => void;
  editFreeBlock: (block: FreeBlock) => void;
  /** one day of a regular block: cancel it that day, or the whole day */
  editRoutineDay: (routine: RoutineBlock, day: Date) => void;
  /** a day: holiday, which regular blocks are off */
  editDay: (day: Date) => void;
}

const EditorContext = createContext<EditorApi | null>(null);

/** One place that owns every edit dialog, so any screen can open any of them. */
export function EditorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const { taskById } = useData();
  const close = () => setOpen(null);

  const api: EditorApi = {
    editEvent: (initial = {}) => setOpen({ type: 'event', initial }),
    editTask: (initial = {}) => setOpen({ type: 'task', initial }),
    editRoutine: (initial = {}) => setOpen({ type: 'routine', initial }),
    editSession: (session) => setOpen({ type: 'session', session }),
    editTemplate: (initial = {}) => setOpen({ type: 'template', initial }),
    placeTemplate: (template, weekStart) => setOpen({ type: 'place', template, weekStart }),
    editClassGrid: (parity = 'all') => setOpen({ type: 'classGrid', parity }),
    editGig: (initial = {}) => setOpen({ type: 'gig', initial, key: Date.now() }),
    editFreeBlock: (block) => setOpen({ type: 'free', block }),
    editRoutineDay: (routine, day) => setOpen({ type: 'routineDay', routine, day }),
    editDay: (day) => setOpen({ type: 'day', day }),
  };

  return (
    <EditorContext.Provider value={api}>
      {children}
      {open?.type === 'event' && <EventDialog key={open.initial.id ?? 'new'} initial={open.initial} onClose={close} />}
      {open?.type === 'task' && <TaskDialog key={open.initial.id ?? 'new'} initial={open.initial} onClose={close} />}
      {open?.type === 'routine' && (
        <RoutineDialog key={open.initial.id ?? 'new'} initial={open.initial} onClose={close} />
      )}
      {open?.type === 'session' && (
        <SessionDialog
          session={open.session}
          onClose={close}
          onOpenTask={(id) => {
            const t = taskById(id);
            if (t) setOpen({ type: 'task', initial: t });
          }}
        />
      )}
      {open?.type === 'template' && (
        <TemplateDialog key={open.initial.id ?? 'new'} initial={open.initial} onClose={close} />
      )}
      {open?.type === 'place' && (
        <PlaceTemplateDialog
          template={open.template}
          weekStart={open.weekStart}
          onClose={close}
          onEdit={() => setOpen({ type: 'template', initial: open.template })}
        />
      )}
      {open?.type === 'classGrid' && <ClassGridDialog initialParity={open.parity} onClose={close} />}
      {open?.type === 'gig' && <GigDialog key={open.key} initial={open.initial} onClose={close} />}
      {open?.type === 'free' && <FreeBlockDialog key={open.block.id} block={open.block} onClose={close} />}
      {open?.type === 'routineDay' && (
        <RoutineDayDialog
          routine={open.routine}
          day={open.day}
          onClose={close}
          onEdit={() => setOpen({ type: 'routine', initial: open.routine })}
          onDay={() => setOpen({ type: 'day', day: open.day })}
        />
      )}
      {open?.type === 'day' && <DayDialog day={open.day} onClose={close} />}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside EditorProvider');
  return ctx;
}
