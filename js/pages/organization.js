import { subHero, esc } from '../ui.js';
import { normalizeCanvas, normalizeOuterSchema } from '../organization-schema.js';
import { getItemBounds } from '../organization-editor/alignment.js';
import { orthogonalPath, renderOuterCard, safeBorder, safeColor } from '../organization-view.js';

const nodeOrder = (a, b) => (Number(a.position_y) || 0) - (Number(b.position_y) || 0) || (Number(a.position_x) || 0) - (Number(b.position_x) || 0);

function renderNode(node, profiles, outerSchema) {
  const style = `left:${Number(node.position_x) || 0}px;top:${Number(node.position_y) || 0}px;width:${Number(node.width) || 180}px;height:${Number(node.height) || 100}px;z-index:${Number(node.z_index) || 0}`;
  if (node.node_type === 'PROFILE') {
    const profile = profiles.find((item) => Number(item.id) === Number(node.profile_id));
    if (!profile) return '';
    return `<a class="organization-node organization-profile-node" data-node-id="${esc(node.id)}" href="#/company/organization/${profile.id}" style="${style}">${renderOuterCard(profile, outerSchema, { width: node.width, height: node.height })}</a>`;
  }
  const config = node.config || {};
  if (node.node_type === 'GROUP') return `<div class="organization-node organization-group-node" data-node-id="${esc(node.id)}" style="${style};background:${safeColor(config.background, 'rgba(255,255,255,.55)')};border:${safeBorder(config.border, '1px solid #a8bfcd')}"><strong>${esc(config.label || '그룹')}</strong></div>`;
  return `<div class="organization-node organization-label-node" data-node-id="${esc(node.id)}" style="${style};background:${safeColor(config.background)};border:${safeBorder(config.border, 'none')};font-size:${Math.max(10, Number(config.fontSize) || 18)}px;font-weight:${config.fontWeight === 'bold' ? 700 : Number(config.fontWeight) || 700};text-align:${['left','center','right'].includes(config.align) ? config.align : 'center'}">${esc(config.text || '텍스트')}</div>`;
}

function profileNavButton(node, profiles) {
  const profile = profiles.find((item) => Number(item.id) === Number(node.profile_id));
  return profile ? `<button type="button" data-org-nav-target="${esc(node.id)}" data-org-nav-profile>${esc(profile.name)}</button>` : '';
}

function renderNavigator(nodes, profiles) {
  const groups = nodes.filter((node) => node.node_type === 'GROUP').sort(nodeOrder);
  const profileNodes = nodes.filter((node) => node.node_type === 'PROFILE').sort(nodeOrder);
  const groupIds = new Set(groups.map((group) => String(group.id)));
  const grouped = new Map(groups.map((group) => [String(group.id), []]));
  const unclassified = [];
  profileNodes.forEach((node) => {
    const parentId = node.parent_node_id == null ? '' : String(node.parent_node_id);
    if (groupIds.has(parentId)) grouped.get(parentId).push(node);
    else unclassified.push(node);
  });
  const sections = groups.map((group) => {
    const key = `group-${group.id}`;
    const members = grouped.get(String(group.id));
    return `<section class="organization-navigator-group"><div><button type="button" class="organization-navigator-arrow" data-org-nav-toggle="${esc(key)}" aria-expanded="true" aria-label="${esc(group.config?.label || '그룹')} 목록 접기">▼</button><button type="button" class="organization-navigator-target" data-org-nav-target="${esc(group.id)}">${esc(group.config?.label || '그룹')}</button></div><div class="organization-navigator-members" data-org-nav-members="${esc(key)}">${members.map((node) => profileNavButton(node, profiles)).join('') || '<span>등록된 구성원이 없습니다.</span>'}</div></section>`;
  }).join('');
  const unclassifiedSection = unclassified.length ? `<section class="organization-navigator-group"><div><button type="button" class="organization-navigator-arrow" data-org-nav-toggle="unclassified" aria-expanded="true" aria-label="미분류 목록 접기">▼</button><strong>미분류</strong></div><div class="organization-navigator-members" data-org-nav-members="unclassified">${unclassified.map((node) => profileNavButton(node, profiles)).join('')}</div></section>` : '';
  return `<aside class="organization-navigator"><a class="organization-navigator-back" href="#/company/ceo">← 회사소개</a><button type="button" class="organization-navigator-mobile-toggle" data-org-nav-drawer aria-expanded="false">조직 바로가기 <span>＋</span></button><div class="organization-navigator-panel" data-org-nav-panel><h2>조직 바로가기</h2>${sections}${unclassifiedSection}${!groups.length&&!unclassified.length?'<p>표시할 조직이 없습니다.</p>':''}</div></aside>`;
}

export function renderOrganization(data) {
  const canvas = normalizeCanvas(data.canvas);
  const outerSchema = normalizeOuterSchema(data.outerTemplate?.schema_data);
  const sourceNodes = (data.nodes || []).filter((node) => node.node_type !== 'PROFILE' || data.profiles.some((profile) => Number(profile.id) === Number(node.profile_id)));
  const bounds = getItemBounds(sourceNodes, { xKey: 'position_x', yKey: 'position_y' });
  const padding = 90;
  const offsetX = bounds ? padding - bounds.left : 0;
  const offsetY = bounds ? padding - bounds.top : 0;
  const width = bounds ? Math.max(720, Math.ceil(bounds.width + padding * 2)) : 720;
  const height = bounds ? Math.max(520, Math.ceil(bounds.height + padding * 2)) : 520;
  const nodes = sourceNodes.map((node) => ({ ...node, position_x: (Number(node.position_x) || 0) + offsetX, position_y: (Number(node.position_y) || 0) + offsetY }));
  const nodeMap = new Map(nodes.map((node) => [String(node.id), node]));
  const edges = (data.edges || []).filter((edge) => nodeMap.has(String(edge.source_node_id)) && nodeMap.has(String(edge.target_node_id)));
  const background = safeColor(canvas.background, '#eef4f8');
  return `${subHero('ORGANIZATION', '조직도', '핑후컴퍼니를 움직이는 사람과 조직을 소개합니다.')}<div class="shell sub-layout organization-company-layout">${renderNavigator(nodes, data.profiles)}<article class="content-panel organization-public-page"><div class="organization-viewer" data-canvas-width="${width}" data-canvas-height="${height}"><div class="organization-viewer-toolbar"><span>조직도를 드래그하여 이동할 수 있습니다.</span></div><div class="organization-viewport"><div class="organization-canvas" style="width:${width}px;height:${height}px;background:${background}"><svg class="organization-edge-layer" width="${width}" height="${height}" aria-hidden="true">${edges.map((edge) => `<path d="${orthogonalPath(nodeMap.get(String(edge.source_node_id)), nodeMap.get(String(edge.target_node_id)))}"></path>`).join('')}</svg>${nodes.map((node) => renderNode(node, data.profiles, outerSchema)).join('')}</div>${nodes.length ? '' : '<div class="organization-empty">아직 공개된 조직도 항목이 없습니다.</div>'}</div></div></article></div>`;
}

export function bindOrganizationViewer() {
  const viewer = document.querySelector('.organization-viewer');
  if (!viewer) return;
  const viewport = viewer.querySelector('.organization-viewport');
  const canvas = viewer.querySelector('.organization-canvas');
  const navigator = document.querySelector('.organization-navigator');
  const dragThreshold = 7;
  let x = 0, y = 0, pan = null, smoothTimer = null, highlightTimer = null, suppressedProfile = null, suppressProfileClickUntil = 0;
  const apply = (smooth = false) => {
    window.clearTimeout(smoothTimer);
    canvas.classList.toggle('is-centering', smooth);
    canvas.style.transform = `translate(${x}px,${y}px)`;
    if (smooth) smoothTimer = window.setTimeout(() => canvas.classList.remove('is-centering'), 420);
  };
  const centerCanvas = () => {
    x = (viewport.clientWidth - Number(viewer.dataset.canvasWidth)) / 2;
    y = (viewport.clientHeight - Number(viewer.dataset.canvasHeight)) / 2;
    apply();
  };
  const centerNode = (id, highlight = false) => {
    const node = canvas.querySelector(`[data-node-id="${CSS.escape(String(id))}"]`);
    if (!node) return;
    x = viewport.clientWidth / 2 - (Number.parseFloat(node.style.left) + Number.parseFloat(node.style.width) / 2);
    y = viewport.clientHeight / 2 - (Number.parseFloat(node.style.top) + Number.parseFloat(node.style.height) / 2);
    apply(true);
    if (highlight) {
      window.clearTimeout(highlightTimer);
      canvas.querySelectorAll('.organization-profile-highlight').forEach((item) => item.classList.remove('organization-profile-highlight'));
      node.classList.add('organization-profile-highlight');
      highlightTimer = window.setTimeout(() => node.classList.remove('organization-profile-highlight'), 1100);
    }
  };

  viewer.querySelectorAll('img').forEach((image) => { image.draggable = false; });
  viewer.addEventListener('dragstart', (event) => event.preventDefault());
  viewer.addEventListener('selectstart', (event) => event.preventDefault());

  viewport.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || pan) return;
    canvas.classList.remove('is-centering');
    const profile = event.target.closest('.organization-profile-node');
    pan = { pointerId: event.pointerId, px: event.clientX, py: event.clientY, x, y, profile, dragged: false, captured: false };
    if (!profile) {
      event.preventDefault();
      viewport.setPointerCapture(event.pointerId);
      pan.captured = true;
    }
  });
  viewport.addEventListener('pointermove', (event) => {
    if (!pan || event.pointerId !== pan.pointerId) return;
    const dx = event.clientX - pan.px;
    const dy = event.clientY - pan.py;
    if (!pan.dragged) {
      if (Math.hypot(dx, dy) < dragThreshold) return;
      pan.dragged = true;
      viewport.classList.add('is-panning');
      if (!pan.captured) {
        viewport.setPointerCapture(event.pointerId);
        pan.captured = true;
      }
    }
    event.preventDefault();
    x = pan.x + dx;
    y = pan.y + dy;
    apply();
  });
  const stopPan = (event, cancelled = false) => {
    if (!pan || event.pointerId !== pan.pointerId) return;
    const finished = pan;
    pan = null;
    viewport.classList.remove('is-panning');
    if (finished.captured && viewport.hasPointerCapture?.(finished.pointerId)) viewport.releasePointerCapture(finished.pointerId);
    if (!cancelled && finished.dragged && finished.profile) {
      suppressedProfile = finished.profile;
      suppressProfileClickUntil = performance.now() + 350;
      event.preventDefault();
    } else if (!cancelled && !finished.dragged && finished.profile && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      const href = finished.profile.getAttribute('href');
      if (href?.startsWith('#/')) {
        event.preventDefault();
        window.location.hash = href;
      }
    }
  };
  viewport.addEventListener('pointerup', stopPan);
  viewport.addEventListener('pointercancel', (event) => stopPan(event, true));
  viewport.addEventListener('lostpointercapture', (event) => stopPan(event, true));
  viewport.addEventListener('click', (event) => {
    const profile = event.target.closest('.organization-profile-node');
    if (profile && profile === suppressedProfile && performance.now() < suppressProfileClickUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  navigator?.addEventListener('click', (event) => {
    const drawer = event.target.closest('[data-org-nav-drawer]');
    if (drawer) {
      const open = drawer.getAttribute('aria-expanded') === 'true';
      drawer.setAttribute('aria-expanded', String(!open));
      drawer.querySelector('span').textContent = open ? '＋' : '−';
      navigator.querySelector('[data-org-nav-panel]').classList.toggle('open', !open);
      return;
    }
    const toggle = event.target.closest('[data-org-nav-toggle]');
    if (toggle) {
      const members = navigator.querySelector(`[data-org-nav-members="${CSS.escape(toggle.dataset.orgNavToggle)}"]`);
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.setAttribute('aria-label', toggle.getAttribute('aria-label').replace(expanded ? '접기' : '펼치기', expanded ? '펼치기' : '접기'));
      toggle.textContent = expanded ? '▶' : '▼';
      if (members) members.hidden = expanded;
      return;
    }
    const target = event.target.closest('[data-org-nav-target]');
    if (target) {
      centerNode(target.dataset.orgNavTarget, target.hasAttribute('data-org-nav-profile'));
      if (window.matchMedia('(max-width: 760px)').matches) {
        navigator.querySelector('[data-org-nav-panel]').classList.remove('open');
        const drawerButton = navigator.querySelector('[data-org-nav-drawer]');
        drawerButton.setAttribute('aria-expanded', 'false');
        drawerButton.querySelector('span').textContent = '＋';
      }
    }
  });
  requestAnimationFrame(centerCanvas);
}
