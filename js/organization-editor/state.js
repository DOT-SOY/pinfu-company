import { normalizeCanvas } from '../organization-schema.js';

const copy = (value) => JSON.parse(JSON.stringify(value));
const uid = (prefix) => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;

export class OrganizationEditorState {
  constructor({ nodes = [], edges = [], settings = null }) {
    this.nodes = copy(nodes);
    this.edges = copy(edges);
    this.settings = normalizeCanvas(settings);
    this.undoStack = [];
    this.redoStack = [];
    this.saved = this.snapshot();
  }

  snapshot() { return JSON.stringify({ nodes: this.nodes, edges: this.edges, settings: this.settings }); }
  restore(snapshot) { const value = JSON.parse(snapshot); this.nodes = value.nodes; this.edges = value.edges; this.settings = value.settings; }
  get isDirty() { return this.snapshot() !== this.saved; }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  mutate(callback) {
    const before = this.snapshot();
    callback(this);
    this.record(before);
  }

  record(before) {
    if (before === this.snapshot()) return;
    this.undoStack.push(before);
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
  }

  undo() {
    if (!this.canUndo) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
  }

  redo() {
    if (!this.canRedo) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
  }

  markSaved(nodes, edges, settings) {
    this.nodes = copy(nodes); this.edges = copy(edges); this.settings = normalizeCanvas(settings);
    this.undoStack = []; this.redoStack = []; this.saved = this.snapshot();
  }

  addProfile(profile, x, y, size) {
    if (this.nodes.some((node) => node.node_type === 'PROFILE' && Number(node.profile_id) === Number(profile.id))) return null;
    const node = { id: uid('tmp_node'), node_type: 'PROFILE', profile_id: profile.id, parent_node_id: null, position_x: x, position_y: y, width: size.width, height: size.height, z_index: 10, config: {} };
    this.mutate(() => this.nodes.push(node));
    return node;
  }

  addGroup() {
    const node = { id: uid('tmp_node'), node_type: 'GROUP', profile_id: null, parent_node_id: null, position_x: 100, position_y: 100, width: 420, height: 260, z_index: 0, config: { label: '새 그룹', background: 'rgba(255,255,255,.55)', border: '1px solid #a8bfcd' } };
    this.mutate(() => this.nodes.push(node)); return node;
  }

  addLabel() {
    const node = { id: uid('tmp_node'), node_type: 'LABEL', profile_id: null, parent_node_id: null, position_x: 140, position_y: 80, width: 220, height: 50, z_index: 20, config: { text: '새 텍스트', fontSize: 20, fontWeight: 'bold', align: 'center', background: 'transparent', border: 'none' } };
    this.mutate(() => this.nodes.push(node)); return node;
  }

  addEdge(sourceId, targetId) {
    if (String(sourceId) === String(targetId) || this.edges.some((edge) => String(edge.source_node_id) === String(sourceId) && String(edge.target_node_id) === String(targetId))) return null;
    const edge = { id: uid('tmp_edge'), source_node_id: sourceId, target_node_id: targetId, edge_type: 'ORTHOGONAL', config: {} };
    this.mutate(() => this.edges.push(edge)); return edge;
  }

  deleteNode(id) {
    this.mutate(() => { this.nodes = this.nodes.filter((node) => String(node.id) !== String(id)); this.edges = this.edges.filter((edge) => String(edge.source_node_id) !== String(id) && String(edge.target_node_id) !== String(id)); });
  }

  deleteEdge(id) { this.mutate(() => { this.edges = this.edges.filter((edge) => String(edge.id) !== String(id)); }); }
  node(id) { return this.nodes.find((node) => String(node.id) === String(id)); }
  edge(id) { return this.edges.find((edge) => String(edge.id) === String(id)); }
}
