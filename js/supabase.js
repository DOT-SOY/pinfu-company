export const SUPABASE_URL =
  'https://evzrzwbemqrwlaqeowkq.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_kn7pEbZReknFuf9qmTwyfg_MkNr2ifM';

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_URL.endsWith('.supabase.co') &&
  SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_');

export const db = isSupabaseConfigured && window.supabase
  ? window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    )
  : null;

export function requireDatabase() {
  if (!db) throw new Error('SUPABASE_NOT_CONFIGURED');
  return db;
}