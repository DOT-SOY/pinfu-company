import { requireDatabase } from './supabase.js';

async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export const listOrgProfiles = () => result(requireDatabase().from('org_profiles').select('*').order('name'));
export const getOrgProfile = (id) => result(requireDatabase().from('org_profiles').select('*').eq('id', id).maybeSingle());
export const getMyOrgProfile = (userId) => result(requireDatabase().from('org_profiles').select('*').eq('owner_user_id', userId).maybeSingle());

export function createOrgProfile(values) {
  return result(requireDatabase().from('org_profiles').insert({
    owner_user_id: values.owner_user_id || null,
    created_by: values.created_by || null,
    name: values.name,
    department: values.department,
    position: values.position,
    image_url: values.image_url || null
  }).select('*').single());
}

export function updateOrgProfile(id, values) {
  return result(requireDatabase().from('org_profiles').update({
    owner_user_id: values.owner_user_id || null,
    name: values.name,
    department: values.department,
    position: values.position,
    image_url: values.image_url || null
  }).eq('id', id).select('*').single());
}

export async function deleteOrgProfile(id) {
  await result(requireDatabase().from('org_profiles').delete().eq('id', id));
}

export const getOrgProfileDetail = (profileId) => result(requireDatabase().from('org_profile_details').select('*').eq('profile_id', profileId).maybeSingle());
export const listOrgProfileDetails = () => result(requireDatabase().from('org_profile_details').select('*'));
export const updateOrgProfileDetail = (profileId, fieldValues) => result(requireDatabase().from('org_profile_details').update({ field_values: fieldValues }).eq('profile_id', profileId).select('*').single());

export const listOrgNodes = () => result(requireDatabase().from('org_nodes').select('*').order('z_index').order('id'));
export const createOrgNode = (values) => result(requireDatabase().from('org_nodes').insert(values).select('*').single());
export const updateOrgNode = (id, values) => result(requireDatabase().from('org_nodes').update(values).eq('id', id).select('*').single());
export async function deleteOrgNode(id) { await result(requireDatabase().from('org_nodes').delete().eq('id', id)); }

export const listOrgEdges = () => result(requireDatabase().from('org_edges').select('*').order('id'));
export const createOrgEdge = (values) => result(requireDatabase().from('org_edges').insert(values).select('*').single());
export const updateOrgEdge = (id, values) => result(requireDatabase().from('org_edges').update(values).eq('id', id).select('*').single());
export async function deleteOrgEdge(id) { await result(requireDatabase().from('org_edges').delete().eq('id', id)); }

export const getActiveOrgTemplate = (type) => result(requireDatabase().from('org_templates').select('*').eq('template_type', type).eq('is_active', true).maybeSingle());
export const listOrgTemplates = (type) => result(requireDatabase().from('org_templates').select('*').eq('template_type', type).order('created_at'));
export const createOrgTemplate = (values) => result(requireDatabase().from('org_templates').insert({ template_type: values.template_type, name: values.name, schema_data: values.schema_data }).select('*').single());
export const updateOrgTemplate = (id, values) => result(requireDatabase().from('org_templates').update({ name: values.name, schema_data: values.schema_data }).eq('id', id).select('*').single());
export async function activateOrgTemplate(templateId) {
  await result(requireDatabase().rpc('activate_org_template', { p_template_id: templateId }));
}

export async function getOrgCanvasSettings() {
  const row = await result(requireDatabase().from('org_settings').select('value').eq('key', 'canvas').maybeSingle());
  return row?.value || null;
}

export async function updateOrgCanvasSettings(value) {
  const rows = await result(requireDatabase().from('org_settings').update({ value }).eq('key', 'canvas').select('key'));
  if (!rows?.length) throw new Error('ORG_CANVAS_SETTING_MISSING');
}

export const listUsersForOrgAdmin = () => result(requireDatabase().from('profiles').select('id,nickname,role').order('nickname'));
export async function setUserRole(userId, role) {
  await result(requireDatabase().rpc('set_user_role', { p_user_id: userId, p_role: role }));
}

function nodePayload(node, idMap = new Map()) {
  const parent = node.parent_node_id == null ? null : idMap.get(String(node.parent_node_id)) || node.parent_node_id;
  return {
    node_type: node.node_type,
    profile_id: node.node_type === 'PROFILE' ? Number(node.profile_id) : null,
    parent_node_id: parent && Number.isFinite(Number(parent)) ? Number(parent) : null,
    position_x: Number(node.position_x) || 0,
    position_y: Number(node.position_y) || 0,
    width: Math.max(40, Number(node.width) || 180),
    height: Math.max(30, Number(node.height) || 100),
    z_index: Number(node.z_index) || 0,
    config: node.config && typeof node.config === 'object' ? node.config : {}
  };
}

function edgePayload(edge, idMap = new Map()) {
  return {
    source_node_id: Number(idMap.get(String(edge.source_node_id)) || edge.source_node_id),
    target_node_id: Number(idMap.get(String(edge.target_node_id)) || edge.target_node_id),
    edge_type: edge.edge_type || 'ORTHOGONAL',
    config: edge.config && typeof edge.config === 'object' ? edge.config : {}
  };
}

export async function saveOrgLayout({ nodes, edges, settings }) {
  const client = requireDatabase();
  const [storedNodes, storedEdges] = await Promise.all([listOrgNodes(), listOrgEdges()]);
  const keptNodeIds = new Set(nodes.filter((node) => Number.isFinite(Number(node.id))).map((node) => Number(node.id)));
  const keptEdgeIds = new Set(edges.filter((edge) => Number.isFinite(Number(edge.id))).map((edge) => Number(edge.id)));
  const removeEdgeIds = storedEdges.map((edge) => edge.id).filter((id) => !keptEdgeIds.has(Number(id)));
  if (removeEdgeIds.length) await result(client.from('org_edges').delete().in('id', removeEdgeIds));
  const removeNodeIds = storedNodes.map((node) => node.id).filter((id) => !keptNodeIds.has(Number(id)));
  if (removeNodeIds.length) await result(client.from('org_nodes').delete().in('id', removeNodeIds));

  const idMap = new Map();
  for (const node of nodes) {
    if (Number.isFinite(Number(node.id))) {
      await updateOrgNode(Number(node.id), nodePayload(node, idMap));
      idMap.set(String(node.id), Number(node.id));
    } else {
      const created = await createOrgNode(nodePayload(node, idMap));
      idMap.set(String(node.id), created.id);
    }
  }

  for (const edge of edges) {
    const payload = edgePayload(edge, idMap);
    if (Number.isFinite(Number(edge.id))) await updateOrgEdge(Number(edge.id), payload);
    else await createOrgEdge(payload);
  }
  await updateOrgCanvasSettings(settings);
  return Promise.all([listOrgNodes(), listOrgEdges(), getOrgCanvasSettings()]);
}

export async function loadPublicOrganization() {
  const [profiles, nodes, edges, outerTemplate, canvas] = await Promise.all([
    listOrgProfiles(), listOrgNodes(), listOrgEdges(), getActiveOrgTemplate('OUTER'), getOrgCanvasSettings()
  ]);
  return { profiles, nodes, edges, outerTemplate, canvas };
}
