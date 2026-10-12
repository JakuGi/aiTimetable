import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

// Implicit flow: the confirmation link from the e-mail works on any device,
// not only in the browser where the account was created.
export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});

/** Base URL used in e-mail links (confirmation, password reset). */
export function appUrl(path = '/') {
  return new URL(path, window.location.origin).toString();
}
