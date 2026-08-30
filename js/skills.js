import { requireDatabase } from './supabase.js';
import { getAuthState } from './auth.js';
import { characterId } from './character-admin-model.js';
export function createSkillApi(client,authState) {
  async function rpc(name,args) {
    if(!authState().isAdmin) throw new Error('ADMIN_REQUIRED');
    const {data,error}=await client().rpc(name,args);
    if(error) throw error;
    return data;
  }
  return {
    list: ({search='',enabled=null,offset=0}={})=>rpc('admin_list_skills',{p_search:search,p_enabled:enabled,p_offset:offset}),
    detail: id=>rpc('admin_skill_editor',{p_skill_id:id===null?null:characterId(id)}),
    save: (id,revision,definition,paused)=>rpc('admin_save_skill',{p_skill_id:id===null?null:characterId(id),p_revision:revision,p_definition:definition,p_bot_paused:paused===true}),
    createTargetCommand: (definition,paused)=>rpc('admin_create_skill_target_command',{p_definition:definition,p_bot_paused:paused===true})
  };
}
export const skillApi=createSkillApi(requireDatabase,getAuthState);
