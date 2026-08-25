export const SUPABASE_URL =
  'https://evzrzwbemqrwlaqeowkq.supabase.co';

export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_kn7pEbZReknFuf9qmTwyfg_MkNr2ifM';

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_URL.endsWith('.supabase.co') &&
  SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_');

export let db = null;
let databaseInitPromise = null;

export function initDatabase() {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  if (db) return Promise.resolve(db);
  if (databaseInitPromise) return databaseInitPromise;

  databaseInitPromise = new Promise((resolve, reject) => {
    const connect = () => {
      if (!window.supabase?.createClient) {
        reject(new Error('SUPABASE_SDK_LOAD_FAILED'));
        return;
      }
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
      resolve(db);
    };

    if (window.supabase?.createClient) {
      connect();
      return;
    }

    const sdk = document.getElementById('supabase-sdk');
    if (!sdk) {
      reject(new Error('SUPABASE_SDK_LOAD_FAILED'));
      return;
    }

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('SUPABASE_SDK_LOAD_FAILED'));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      sdk.removeEventListener('load', loaded);
      sdk.removeEventListener('error', failed);
    };
    const loaded = () => { cleanup(); connect(); };
    const failed = () => { cleanup(); reject(new Error('SUPABASE_SDK_LOAD_FAILED')); };
    sdk.addEventListener('load', loaded, { once: true });
    sdk.addEventListener('error', failed, { once: true });
    if (window.supabase?.createClient) loaded();
  }).catch((error) => {
    databaseInitPromise = null;
    throw error;
  });

  return databaseInitPromise;
}

export function requireDatabase() {
  if (!db) throw new Error(isSupabaseConfigured ? 'SUPABASE_CONNECTION_FAILED' : 'SUPABASE_NOT_CONFIGURED');
  return db;
}
