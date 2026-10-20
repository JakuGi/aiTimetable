import { addHours, startOfHour } from 'date-fns';
import { useEditor } from './Editor';
import { Segmented } from './fields';
import { t } from '../lib/i18n';

export type NewKind = 'task' | 'event' | 'reminder';

const OPTIONS: { value: NewKind; label: string }[] = [
  { value: 'task', get label() { return t('Úloha'); } },
  { value: 'event', get label() { return t('Udalosť'); } },
  { value: 'reminder', get label() { return t('Pripomienka'); } },
];

export const NEW_TITLES: Record<NewKind, string> = {
  get task() { return t('Nová úloha'); },
  get event() { return t('Nová udalosť'); },
  get reminder() { return t('Nová pripomienka'); },
};

/**
 * Top of a new task / event dialog: switch what is being added, keeping the title typed so far.
 * Within the event dialog, event <-> reminder only changes its kind (onLocal).
 */
export function NewKindSwitch({
  value,
  title,
  startsAt,
  onLocal,
}: {
  value: NewKind;
  title: string;
  startsAt?: string | null;
  onLocal?: (k: NewKind) => boolean;
}) {
  const editor = useEditor();
  const change = (k: NewKind) => {
    if (k === value || onLocal?.(k)) return;
    const name = title.trim() ? title : undefined;
    if (k === 'task') return editor.editTask({ title: name });
    // a new event starts at the next full hour unless the dialog already knew a time
    const starts = startsAt ?? addHours(startOfHour(new Date()), 1).toISOString();
    editor.editEvent({ title: name, kind: k === 'reminder' ? 'reminder' : 'event', starts_at: starts, ...(k === 'reminder' ? { blocks_planning: false, remind_minutes_before: 0 } : {}) });
  };
  return (
    <div className="new-kind">
      <Segmented label={t('Čo pridávaš')} value={value} onChange={change} options={OPTIONS} />
    </div>
  );
}
