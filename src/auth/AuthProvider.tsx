import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** true after the user opened a password-reset link */
  recovering: boolean;
  /** error carried back in an e-mail link (expired, already used...) */
  linkError: string | null;
  clearLinkError: () => void;
  finishRecovery: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readLinkError(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
  const code = params.get('error_code');
  if (!code && !params.get('error')) return null;
  if (code === 'otp_expired') return 'Odkaz z e-mailu už vypršal alebo bol použitý. Pošli si nový.';
  return params.get('error_description')?.replace(/\+/g, ' ') ?? 'Odkaz z e-mailu sa nepodarilo použiť.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(() => readLinkError());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setLoading(false);
    });
    if (linkError) window.history.replaceState(null, '', window.location.pathname);
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        recovering,
        linkError,
        clearLinkError: () => setLinkError(null),
        finishRecovery: () => setRecovering(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
