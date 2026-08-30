import { requireDatabase } from './supabase.js';
import { getAuthState } from './auth.js';
import { characterId } from './character-admin-model.js';
export function createStatApi(client,authState) {
  async function rpc(name,args){if(!authState().isAdmin)throw new Error('ADMIN_REQUIRED');const {data,error}=await client().rpc(name,args);if(error)throw error;return data;}
  return {
    list:({search='',enabled=null,offset=0}={})=>rpc('admin_list_stats',{p_search:search,p_enabled:enabled,p_offset:offset}),
    detail:id=>rpc('admin_stat_editor',{p_stat_id:id===null?null:characterId(id)}),
    save:(id,revision,definition,paused)=>rpc('admin_save_stat',{p_stat_id:id===null?null:characterId(id),p_revision:revision,p_definition:definition,p_bot_paused:paused===true})
  };
}
export const statApi=createStatApi(requireDatabase,getAuthState);
