import { NavLink, Outlet } from 'react-router-dom';
import { Brand } from './Brand';
import { useReminders } from '../lib/useReminders';
import { useData } from '../lib/data';
import { CheckInPanel } from './CheckIn';
import { GenderPrompt } from '../lib/gender';

const NAV = [
  { to: '/', label: 'Rozvrh', icon: 'M3 5h14v12H3zM3 9h14M7 3v4M13 3v4', end: true },
  { to: '/month', label: 'Kalendár', icon: 'M3 5h14v12H3zM3 9h14M7 12h2M11 12h2M7 15h2' },
  { to: '/tasks', label: 'Úlohy', icon: 'M4 6l2 2 3-3M4 13l2 2 3-3M12 7h5M12 14h5' },
  { to: '/routine', label: 'Môj týždeň', short: 'Týždeň', icon: 'M4 4h12v13H4zM4 8h12M8 8v9M12 8v9' },
  { to: '/freelance', label: 'Freelance', icon: 'M3 7h14v9H3zM7 7V5h6v2M3 11h14', freelance: true },
  { to: '/settings', label: 'Nastavenia', icon: 'M10 7a3 3 0 100 6 3 3 0 000-6zM10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4' },
];

export function Layout() {
  useReminders();
  const { loading, profile } = useData();

  return (
    <div className={`shell${profile?.freelance_enabled ? ' has-6-tabs' : ''}`}>
      <nav className="nav" aria-label="Hlavná navigácia">
        <div className="nav-brand">
          <Brand />
        </div>
        {NAV.filter((n) => !n.freelance || profile?.freelance_enabled).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d={n.icon} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {'short' in n ? (
              <>
                <span className="label-long">{n.label}</span>
                <span className="label-short">{n.short}</span>
              </>
            ) : (
              <span>{n.label}</span>
            )}
          </NavLink>
        ))}
        {profile?.display_name && <div className="nav-user">{profile.display_name}</div>}
      </nav>
      <main className="main">{loading ? <div className="loading">Načítavam tvoj rozvrh…</div> : <Outlet />}</main>
      {!loading && <CheckInPanel />}
      {!loading && <GenderPrompt />}
    </div>
  );
}
