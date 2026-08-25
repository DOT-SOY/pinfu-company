import { db, requireDatabase } from './supabase.js';

let currentUser = null;
let currentProfile = null;
const listeners = new Set();

export async function initAuth() {
  if (!db) { notify(); return; }
  const { data, error } = await db.auth.getSession();
  if (error) console.error('세션 조회 실패:', error);
  await setUser(data?.session?.user || null);
  db.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => setUser(session?.user || null), 0);
  });
}

async function setUser(user) {
  currentUser = user;
  currentProfile = null;
  if (user) {
    const { data, error } = await db.from('profiles').select('id,nickname,role,created_at,updated_at').eq('id', user.id).maybeSingle();
    if (error) console.error('프로필 조회 실패:', error);
    currentProfile = data || null;
  }
  notify();
}

function notify() { listeners.forEach((listener) => listener(getAuthState())); }
export function onAuthChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function deriveRoleState(role) {
  return {
    isAdmin: role === 'admin',
    isOrgEditor: role === 'org_editor',
    canManageOrgProfile: role === 'org_editor' || role === 'admin'
  };
}
export function getAuthState() {
  const role = currentProfile?.role;
  return {
    user: currentUser,
    profile: currentProfile,
    loggedIn: !!currentUser,
    ...deriveRoleState(role)
  };
}
export const getCurrentUser = () => currentUser;
export const getCurrentProfile = () => currentProfile;
export const getNickname = () => currentProfile?.nickname || '';
export const getRole = () => currentProfile?.role || null;
export const isLoggedIn = () => !!currentUser;
export const isAdmin = () => currentProfile?.role === 'admin';
export const isOrgEditor = () => currentProfile?.role === 'org_editor';
export const canManageOrgProfile = () => ['org_editor', 'admin'].includes(currentProfile?.role);

export async function signUp(email, password, nickname) {
  const client = requireDatabase();
  const { data: duplicate, error: duplicateError } = await client.from('profiles').select('id').eq('nickname', nickname).limit(1);
  if (duplicateError) throw duplicateError;
  if (duplicate?.length) throw new Error('NICKNAME_TAKEN');
  const { data, error } = await client.auth.signUp({ email, password, options: { data: { nickname } } });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await requireDatabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  await setUser(data.user);
  return data;
}

export async function signOut() {
  const { error } = await requireDatabase().auth.signOut();
  if (error) throw error;
  await setUser(null);
}

export async function updateNickname(nickname) {
  if (!currentUser) throw new Error('LOGIN_REQUIRED');
  const { data: duplicate, error: duplicateError } = await db.from('profiles').select('id').eq('nickname', nickname).neq('id', currentUser.id).limit(1);
  if (duplicateError) throw duplicateError;
  if (duplicate?.length) throw new Error('NICKNAME_TAKEN');
  const { data, error } = await db.from('profiles').update({ nickname }).eq('id', currentUser.id).select('id,nickname,role,created_at,updated_at').single();
  if (error) throw error;
  currentProfile = data;
  notify();
  return data;
}
