import { requireDatabase } from './supabase.js';
import { getAuthState } from './auth.js';
import { characterId } from './character-admin-model.js';

// Every RPC independently verifies auth.uid() / profiles.role on the server.
export function createCharacterApi(client, authState) {
  async function rpc(name, args) {
    if (!authState().isAdmin) throw new Error('ADMIN_REQUIRED');
    const { data, error } = await client().rpc(name, args);
    if (error) throw error;
    return data;
  }
  return {
    list: ({ search = '', active = null, offset = 0 } = {}) => rpc('admin_list_characters', {
      p_search: search, p_active: active, p_offset: offset, p_limit: 25
    }),
    detail: id => rpc('admin_get_character', { p_character_id: characterId(id) }),
    save: (id, revision, changes, paused) => rpc('admin_save_character', {
      p_character_id: characterId(id), p_revision: revision, p_changes: changes, p_bot_paused: paused === true
    }),
    skills: (id, search = '', offset = 0) => rpc('admin_search_character_skills', {
      p_character_id: characterId(id), p_search: search, p_offset: offset, p_limit: 20
    }),
    setSkill: (id, skillId, active, paused) => rpc('admin_set_character_skill', {
      p_character_id: characterId(id), p_skill_id: characterId(skillId),
      p_active: active, p_bot_paused: paused === true
    })
  };
}

export const characterApi = createCharacterApi(requireDatabase, getAuthState);
