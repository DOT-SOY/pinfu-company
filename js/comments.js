import { requireDatabase } from './supabase.js';

const PROFILE_JOIN = 'profile:profiles(nickname)';
export async function listComments(postId) {
  const { data, error } = await requireDatabase().from('comments').select(`id,post_id,user_id,parent_comment_id,content,is_deleted,created_at,updated_at,${PROFILE_JOIN}`).eq('post_id', postId).order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}
export async function createComment(postId, userId, content, parentCommentId = null) {
  const { error } = await requireDatabase().from('comments').insert({ post_id: postId, user_id: userId, parent_comment_id: parentCommentId, content });
  if (error) throw error;
}
export async function updateComment(id, content) {
  const { error } = await requireDatabase().from('comments').update({ content }).eq('id', id);
  if (error) throw error;
}
export async function softDeleteComment(id) {
  const { error } = await requireDatabase().from('comments').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}

export function buildCommentTree(comments) {
  const nodes = new Map(comments.map((comment) => [comment.id, { ...comment, children: [] }]));
  const roots = [];
  nodes.forEach((node) => {
    const parent = node.parent_comment_id && nodes.get(node.parent_comment_id);
    if (parent) parent.children.push(node); else roots.push(node);
  });
  return roots;
}
