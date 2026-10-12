import { createContext, useContext, useState, type ReactNode } from 'react';
import { useData } from '../lib/data';
import type { CalendarEvent, EventTemplate, RoutineBlock, Session, Task, WeekParity } from '../lib/types';
import { ClassGridDialog } from './ClassGridDialog';
import { PlaceTemplateDialog, TemplateDialog } from './TemplateDialogs';
import { EventDialog } from './EventDialog';
import { RoutineDialog } from './RoutineDialog';
import { SessionDialog } from './SessionDialog';
import { TaskDialog } from './TaskDialog';

type Open =
  | { type: 'event'; initial: Partial<CalendarEvent> }
  | { type: 'task'; initial: Partial<Task> }
  | { type: 'routine'; initial: Partial<RoutineBlock> }
  | { type: 'session'; session: Session }
  | { type: 'template'; initial: Partial<EventTemplate> }
  | { type: 'place'; template: EventTemplate; weekStart: Date }
  | { type: 'classGrid'; parity: WeekParity };

interface EditorApi {
  editEvent: (initial?: Partial<CalendarEvent>) => void;
  editTask: (initial?: Partial<Task>) => void;
  editRoutine: (initial?: Partial<RoutineBlock>) => void;
  editSession: (session: Session) => void;
  editTemplate: (initial?: Partial<EventTemplate>) => void;
  placeTemplate: (template: EventTemplate, weekStart: Date) => void;
  editClassGrid: (parity?: WeekParity) => void;
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
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used inside EditorProvider');
  return ctx;
}
