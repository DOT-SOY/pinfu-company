import { requireDatabase } from './supabase.js';

const PROFILE_JOIN = 'author:profiles(nickname)';
export async function listPosts(category) {
  const { data, error } = await requireDatabase().from('posts').select(`id,category,title,content,author_id,published_at,created_at,updated_at,${PROFILE_JOIN}`).eq('category', category).order('published_at', { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function getPost(id) {
  const { data, error } = await requireDatabase().from('posts').select(`id,category,title,content,author_id,published_at,created_at,updated_at,${PROFILE_JOIN}`).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
export async function createPost(values) {
  const { data, error } = await requireDatabase().from('posts').insert(values).select('id').single();
  if (error) throw error;
  return data;
}
export async function updatePost(id, values) {
  const { data, error } = await requireDatabase().from('posts').update(values).eq('id', id).select('id').single();
  if (error) throw error;
  return data;
}
export async function deletePost(id) {
  const { error } = await requireDatabase().from('posts').delete().eq('id', id);
  if (error) throw error;
}
