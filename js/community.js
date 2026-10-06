import { requireDatabase } from './supabase.js';
import { getAuthState } from './auth.js';

export const PAGE_SIZE = 20;
export const COMMENT_SIZE = 40;
const POST_COLUMNS = 'id,board_type,title,content,view_count,comment_count,created_at,edited_at,author_id';
const COMMENT_COLUMNS = 'id,post_id,user_id,content,created_at,edited_at';
async function result(query) { const {data,error} = await query; if(error) throw error; return data; }
function userId() { const auth=getAuthState(); if(!auth.loggedIn) throw new Error('LOGIN_REQUIRED'); return auth.user.id; }
async function withNames(rows, board, field) {
  if(board !== 'stock' || !rows.length) return rows;
  const ids=[...new Set(rows.map(row=>row[field]))];
  const profiles=await result(requireDatabase().from('stock_profiles').select('user_id,nickname').in('user_id',ids));
  const names=new Map(profiles.map(profile=>[profile.user_id,profile.nickname]));
  return rows.map(row=>({...row,nickname:names.get(row[field]) || '알 수 없는 사용자'}));
}
export async function listCommunityPosts(board,page=0) {
  userId();
  const rows=await result(requireDatabase().from('community_posts').select(POST_COLUMNS).eq('board_type',board).order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE));
  return {rows:await withNames(rows.slice(0,PAGE_SIZE),board,'author_id'),hasMore:rows.length>PAGE_SIZE};
}
export async function getCommunityPost(board,id) {
  userId();
  const post=await result(requireDatabase().from('community_posts').select(POST_COLUMNS).eq('board_type',board).eq('id',id).maybeSingle());
  return post ? (await withNames([post],board,'author_id'))[0] : null;
}
export async function saveCommunityPost(board,values,id=null) {
  const client=requireDatabase(), author_id=userId();
  const payload={title:values.title.trim(),content:values.content.trim()};
  const query=id ? client.from('community_posts').update(payload).eq('id',id).eq('author_id',author_id).eq('board_type',board) : client.from('community_posts').insert({...payload,board_type:board,author_id});
  return result(query.select('id').single());
}
export async function deleteCommunityPost(id) { userId(); return result(requireDatabase().from('community_posts').delete().eq('id',id).select('id').single()); }
export async function listCommunityComments(board,postId,page=0) {
  userId();
  const rows=await result(requireDatabase().from('community_comments').select(COMMENT_COLUMNS).eq('post_id',postId).order('created_at',{ascending:true}).order('id',{ascending:true}).range(page*COMMENT_SIZE,page*COMMENT_SIZE+COMMENT_SIZE));
  return {rows:await withNames(rows.slice(0,COMMENT_SIZE),board,'user_id'),hasMore:rows.length>COMMENT_SIZE};
}
export async function saveCommunityComment(postId,content,id=null) {
  const client=requireDatabase(), user_id=userId();
  const query=id ? client.from('community_comments').update({content:content.trim()}).eq('id',id).eq('user_id',user_id) : client.from('community_comments').insert({post_id:postId,user_id,content:content.trim()});
  return result(query.select('id').single());
}
export async function deleteCommunityComment(id) { userId(); return result(requireDatabase().from('community_comments').delete().eq('id',id).select('id').single()); }
export async function getStockProfile() { return result(requireDatabase().from('stock_profiles').select('nickname,bio').eq('user_id',userId()).maybeSingle()); }
export async function saveStockProfile(values,exists) {
  const client=requireDatabase(), user_id=userId();
  const payload={nickname:values.nickname.trim(),bio:values.bio.trim() || null};
  return result((exists ? client.from('stock_profiles').update(payload).eq('user_id',user_id) : client.from('stock_profiles').insert({...payload,user_id})).select('nickname,bio').single());
}
const pendingViews=new Map(), viewed=new Set();
export function incrementCommunityView(id) {
  const uid=userId(), key=`community-view:${uid}:${id}`;
  try { if(sessionStorage.getItem(key)) return Promise.resolve(null); } catch {}
  if(viewed.has(key)) return Promise.resolve(null);
  if(pendingViews.has(key)) return pendingViews.get(key);
  const request=result(requireDatabase().rpc('increment_community_post_view',{p_post_id:id})).then(count=>{
    viewed.add(key); try {sessionStorage.setItem(key,'1');} catch {} return count;
  }).finally(()=>pendingViews.delete(key));
  pendingViews.set(key,request); return request;
}
