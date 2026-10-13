import { useState } from 'react';
import { useData } from './data';
import { Modal } from '../components/Modal';
import type { Gender } from './types';

/** g('Splnil som', 'Splnila som'): the form that fits the user (masculine until chosen). */
export function useGender() {
  const { profile } = useData();
  return (m: string, f: string) => (profile?.gender === 'f' ? f : m);
}

export const GENDER_OPTIONS: { value: Gender; label: string; example: string }[] = [
  { value: 'm', label: 'Muž', example: 'Splnil som, nestihol som' },
  { value: 'f', label: 'Žena', example: 'Splnila som, nestihla som' },
];

/** Asks once, on the first open after sign-up (or until answered). "Neskôr" waits for the next open. */
export function GenderPrompt() {
  const { profile, update } = useData();
  const [later, setLater] = useState(false);
  if (!profile || profile.gender || later) return null;

  const pick = (gender: Gender) => update('profiles', profile.id, { gender });

  return (
    <Modal title="Ako ťa má appka oslovovať?" onClose={() => setLater(true)}>
      <p className="muted">Aby tlačidlá a správy znele prirodzene. Zmeniť to môžeš kedykoľvek v Nastaveniach.</p>
      <div className="gender-pick">
        {GENDER_OPTIONS.map((o) => (
          <button key={o.value} type="button" className="gender-option" onClick={() => pick(o.value)}>
            <b>{o.label}</b>
            <span>{o.example}</span>
          </button>
        ))}
      </div>
      <button type="button" className="link-btn gender-later" onClick={() => setLater(true)}>
        Neskôr
      </button>
    </Modal>
  );
}
