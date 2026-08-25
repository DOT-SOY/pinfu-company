import { subHero, esc } from '../ui.js';
import { normalizeCanvas, normalizeOuterSchema } from '../organization-schema.js';
import { orthogonalPath, renderOuterCard, safeBorder, safeColor } from '../organization-view.js';
import { renderCompanySideNav } from './company.js';

function renderNode(node, profiles, outerSchema) {
  const style = `left:${Number(node.position_x) || 0}px;top:${Number(node.position_y) || 0}px;width:${Number(node.width) || 180}px;height:${Number(node.height) || 100}px;z-index:${Number(node.z_index) || 0}`;
  if (node.node_type === 'PROFILE') {
    const profile = profiles.find((item) => Number(item.id) === Number(node.profile_id));
    if (!profile) return '';
    return `<a class="organization-node organization-profile-node" data-node-id="${node.id}" href="#/company/organization/${profile.id}" style="${style}">${renderOuterCard(profile, outerSchema, { width: node.width, height: node.height })}</a>`;
  }
  const config = node.config || {};
  if (node.node_type === 'GROUP') return `<div class="organization-node organization-group-node" data-node-id="${node.id}" style="${style};background:${safeColor(config.background, 'rgba(255,255,255,.55)')};border:${safeBorder(config.border, '1px solid #a8bfcd')}"><strong>${esc(config.label || '그룹')}</strong></div>`;
  return `<div class="organization-node organization-label-node" data-node-id="${node.id}" style="${style};background:${safeColor(config.background)};border:${safeBorder(config.border, 'none')};font-size:${Math.max(10, Number(config.fontSize) || 18)}px;font-weight:${config.fontWeight === 'bold' ? 700 : Number(config.fontWeight) || 700};text-align:${['left','center','right'].includes(config.align) ? config.align : 'center'}">${esc(config.text || '텍스트')}</div>`;
}

export function renderOrganization(data) {
  const canvas = normalizeCanvas(data.canvas);
  const outerSchema = normalizeOuterSchema(data.outerTemplate?.schema_data);
  const nodes = (data.nodes || []).filter((node) => node.node_type !== 'PROFILE' || data.profiles.some((profile) => Number(profile.id) === Number(node.profile_id)));
  const nodeMap = new Map(nodes.map((node) => [Number(node.id), node]));
  const edges = (data.edges || []).filter((edge) => nodeMap.has(Number(edge.source_node_id)) && nodeMap.has(Number(edge.target_node_id)));
  const grid = canvas.showGrid ? `background-color:${safeColor(canvas.background, '#eef4f8')};background-image:linear-gradient(#cbdbe4 1px,transparent 1px),linear-gradient(90deg,#cbdbe4 1px,transparent 1px);background-size:${canvas.gridSize}px ${canvas.gridSize}px` : `background:${safeColor(canvas.background, '#eef4f8')}`;
  return `${subHero('ORGANIZATION', '조직도', '핑후컴퍼니를 움직이는 사람과 조직을 소개합니다.')}<div class="shell sub-layout organization-company-layout">${renderCompanySideNav('organization')}<article class="content-panel organization-public-page"><div class="organization-viewer" data-canvas-width="${canvas.width}" data-canvas-height="${canvas.height}"><div class="organization-viewer-toolbar"><span>마우스로 이동하고 확대할 수 있습니다.</span><div><button data-org-view="out" aria-label="축소">−</button><output data-org-zoom>100%</output><button data-org-view="in" aria-label="확대">＋</button><button data-org-view="fit">전체 보기</button></div></div><div class="organization-viewport"><div class="organization-canvas" style="width:${canvas.width}px;height:${canvas.height}px;${grid}"><svg class="organization-edge-layer" width="${canvas.width}" height="${canvas.height}" aria-hidden="true">${edges.map((edge) => `<path d="${orthogonalPath(nodeMap.get(Number(edge.source_node_id)), nodeMap.get(Number(edge.target_node_id)))}"></path>`).join('')}</svg>${nodes.map((node) => renderNode(node, data.profiles, outerSchema)).join('')}</div>${nodes.length ? '' : '<div class="organization-empty">아직 공개된 조직도 항목이 없습니다.</div>'}</div></div></article></div>`;
}

export function bindOrganizationViewer() {
  const viewer = document.querySelector('.organization-viewer');
  if (!viewer) return;
  const viewport = viewer.querySelector('.organization-viewport');
  const canvas = viewer.querySelector('.organization-canvas');
  const output = viewer.querySelector('[data-org-zoom]');
  let scale = 1, x = 0, y = 0, pan = null;
  const apply = () => { canvas.style.transform = `translate(${x}px,${y}px) scale(${scale})`; output.value = `${Math.round(scale * 100)}%`; };
  const fit = () => { const pad = 28; scale = Math.min((viewport.clientWidth-pad*2)/Number(viewer.dataset.canvasWidth),(viewport.clientHeight-pad*2)/Number(viewer.dataset.canvasHeight),1); scale = Math.max(.2, scale); x=(viewport.clientWidth-Number(viewer.dataset.canvasWidth)*scale)/2;y=(viewport.clientHeight-Number(viewer.dataset.canvasHeight)*scale)/2;apply(); };
  const zoom = (amount, cx=viewport.clientWidth/2, cy=viewport.clientHeight/2) => { const previous=scale;scale=Math.min(2,Math.max(.2,scale+amount));x=cx-(cx-x)*(scale/previous);y=cy-(cy-y)*(scale/previous);apply(); };
  viewer.querySelector('[data-org-view="in"]').addEventListener('click',()=>zoom(.1));
  viewer.querySelector('[data-org-view="out"]').addEventListener('click',()=>zoom(-.1));
  viewer.querySelector('[data-org-view="fit"]').addEventListener('click',fit);
  viewport.addEventListener('wheel',(event)=>{event.preventDefault();const rect=viewport.getBoundingClientRect();zoom(event.deltaY<0?.1:-.1,event.clientX-rect.left,event.clientY-rect.top);},{passive:false});
  viewport.addEventListener('pointerdown',(event)=>{if(event.target.closest('.organization-profile-node'))return;pan={px:event.clientX,py:event.clientY,x,y};viewport.setPointerCapture(event.pointerId);});
  viewport.addEventListener('pointermove',(event)=>{if(!pan)return;x=pan.x+event.clientX-pan.px;y=pan.y+event.clientY-pan.py;apply();});
  viewport.addEventListener('pointerup',()=>{pan=null;});
  requestAnimationFrame(fit);
}
