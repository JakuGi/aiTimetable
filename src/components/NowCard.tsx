import { useEffect, useState, type CSSProperties } from 'react';
import { useData } from '../lib/data';
import { useEditor } from '../editor/Editor';
import { currentLine, nextLine, nowAndNext, type NowItem, type NowKind } from '../lib/now';
import { LEISURE_GREEN } from '../lib/leisure';
import { EVENT_KINDS, ROUTINE_KINDS } from '../lib/meta';
import { FREELANCE_COLOR } from '../lib/freelance';
import { t } from '../lib/i18n';

const KIND_COLOR: Record<NowKind, string> = {
  work: '#2B4BDB',
  school: ROUTINE_KINDS.class.color,
  job: ROUTINE_KINDS.work.color,
  commute: EVENT_KINDS.commute.color,
  event: EVENT_KINDS.event.color,
  gig: FREELANCE_COLOR,
  free: LEISURE_GREEN,
  other: ROUTINE_KINDS.other.color,
};

function useNow(every: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), every);
    const wake = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [every]);
  return now;
}

/** At a glance on the timetable: what is on right now and what comes next. */
export function NowCard() {
  const data = useData();
  const editor = useEditor();
  const now = useNow(20_000);
  if (!data.profile) return null;

  const { current, next } = nowAndNext({
    now,
    oddAnchor: data.profile.odd_week_anchor,
    routine: data.routine_blocks,
    events: data.events,
    sessions: data.sessions,
    tasks: data.tasks,
    gigs: data.profile.freelance_enabled ? data.gigs : [],
    freeBlocks: data.free_blocks,
  });
  const cur = currentLine(current, now, data.profile.gender);
  const nxt = nextLine(next, now);

  const open = (i: NowItem) => {
    const r = i.ref;
    if (r.type === 'session') editor.editSession(r.item);
    else if (r.type === 'event') editor.editEvent(r.item);
    else if (r.type === 'routine') editor.editRoutine(r.item);
    else if (r.type === 'gig') editor.editGig(r.item);
    else editor.editFreeBlock(r.item);
  };
  const color = (i: NowItem | null) => i?.color ?? (i ? KIND_COLOR[i.kind] : LEISURE_GREEN);
  const progress = current
    ? Math.min(100, ((now.getTime() - current.start.getTime()) / (current.end.getTime() - current.start.getTime())) * 100)
    : 0;

  return (
    <section className="now-card" aria-label={t('Teraz a potom')} aria-live="polite">
      <button
        type="button"
        className={`now-row is-now${current ? '' : ' is-idle'}`}
        style={{ '--c': color(current) } as CSSProperties}
        onClick={() => current && open(current)}
        disabled={!current}
      >
        <span className="now-tag">{t('Teraz')}</span>
        <span className="now-text">
          {cur.lead}
          {cur.title && <b> {cur.title}</b>}
          <span className="now-detail">{cur.detail}</span>
        </span>
        {current && (
          <span className="now-progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
        )}
      </button>
      {nxt && next && (
        <button type="button" className="now-row is-next" style={{ '--c': color(next) } as CSSProperties} onClick={() => open(next)}>
          <span className="now-tag">{t('Potom')}</span>
          <span className="now-text">
            {nxt.lead}
            {nxt.title && <b> {nxt.title}</b>}
            <span className="now-detail">{nxt.detail}</span>
          </span>
        </button>
      )}
    </section>
  );
}
