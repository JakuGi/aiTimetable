import { useEffect, useRef, type ReactNode } from 'react';
import { t } from '../lib/i18n';

/** open dialogs, newest last: the Android back button closes the top one (window.__rozvrhBack) */
const open: { close: () => void }[] = [];
(window as Window & { __rozvrhBack?: () => boolean }).__rozvrhBack = () => {
  const top = open[open.length - 1];
  if (!top) return false;
  top.close();
  return true;
};

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/** Native <dialog>: focus trap, Esc to close and backdrop for free. */
export function Modal({ title, onClose, children, footer, wide = false }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const entry = { close: () => closeRef.current() };
    open.push(entry);
    return () => {
      open.splice(open.indexOf(entry), 1);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={wide ? 'modal modal-wide' : 'modal'}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Zavrieť')}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}
