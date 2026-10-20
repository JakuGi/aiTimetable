import { useState } from 'react';
import { useData } from './data';
import { Modal } from '../components/Modal';
import { t } from './i18n';
import type { Gender } from './types';

/** g('Splnil som', 'Splnila som'): the form that fits the user (masculine until chosen), translated. */
export function useGender() {
  const { profile } = useData();
  return (m: string, f: string, vars?: Record<string, string | number>) => t(profile?.gender === 'f' ? f : m, vars);
}

export const GENDER_OPTIONS: { value: Gender; label: string; example: string }[] = [
  { value: 'm', get label() { return t('Muž'); }, get example() { return t('Splnil som, nestihol som'); } },
  { value: 'f', get label() { return t('Žena'); }, get example() { return t('Splnila som, nestihla som'); } },
];

/** Asks once, on the first open after sign-up (or until answered). "Neskôr" waits for the next open. */
export function GenderPrompt() {
  const { profile, update } = useData();
  const [later, setLater] = useState(false);
  if (!profile || profile.gender || later) return null;

  const pick = (gender: Gender) => update('profiles', profile.id, { gender });

  return (
    <Modal title={t('Ako ťa má appka oslovovať?')} onClose={() => setLater(true)}>
      <p className="muted">{t('Aby tlačidlá a správy znele prirodzene. Zmeniť to môžeš kedykoľvek v Nastaveniach.')}</p>
      <div className="gender-pick">
        {GENDER_OPTIONS.map((o) => (
          <button key={o.value} type="button" className="gender-option" onClick={() => pick(o.value)}>
            <b>{o.label}</b>
            <span>{o.example}</span>
          </button>
        ))}
      </div>
      <button type="button" className="link-btn gender-later" onClick={() => setLater(true)}>
        {t('Neskôr')}
      </button>
    </Modal>
  );
}
