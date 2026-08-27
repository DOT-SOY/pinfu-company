const number = (value) => Number(value) || 0;

export function getItemBounds(items, { xKey = 'x', yKey = 'y' } = {}) {
  if (!items.length) return null;
  const left = Math.min(...items.map((item) => number(item[xKey])));
  const top = Math.min(...items.map((item) => number(item[yKey])));
  const right = Math.max(...items.map((item) => number(item[xKey]) + number(item.width)));
  const bottom = Math.max(...items.map((item) => number(item[yKey]) + number(item.height)));
  return { left, top, right, bottom, width: right - left, height: bottom - top, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

export function expandGroupChildren(nodes, ids) {
  const expanded = new Set([...ids].map(String));
  const groupIds = new Set(nodes.filter((node) => node.node_type === 'GROUP' && expanded.has(String(node.id))).map((node) => String(node.id)));
  nodes.forEach((node) => {
    if (node.node_type === 'PROFILE' && node.parent_node_id != null && groupIds.has(String(node.parent_node_id))) expanded.add(String(node.id));
  });
  return expanded;
}

export function moveUnselectedGroupChildren(nodes, before, selectedIds) {
  const explicit = new Set([...selectedIds].map(String));
  const moved = new Set();
  nodes.filter((node) => node.node_type === 'GROUP' && explicit.has(String(node.id))).forEach((group) => {
    const origin = before.get(String(group.id));
    if (!origin) return;
    const dx = number(group.position_x) - number(origin.x);
    const dy = number(group.position_y) - number(origin.y);
    nodes.filter((node) => node.node_type === 'PROFILE' && String(node.parent_node_id ?? '') === String(group.id) && !explicit.has(String(node.id)) && !moved.has(String(node.id))).forEach((node) => {
      node.position_x = Math.max(0, number(node.position_x) + dx);
      node.position_y = Math.max(0, number(node.position_y) + dy);
      moved.add(String(node.id));
    });
  });
  return moved;
}

export function arrangeItems(items, mode, { xKey = 'x', yKey = 'y', targetX = 0, targetY = 0, clamp = true } = {}) {
  if (!items.length) return false;
  const bounds = getItemBounds(items, { xKey, yKey });
  const setX = (item, value) => { item[xKey] = clamp ? Math.max(0, value) : value; };
  const setY = (item, value) => { item[yKey] = clamp ? Math.max(0, value) : value; };

  if (mode === 'left') items.forEach((item) => setX(item, bounds.left));
  else if (mode === 'center-x') items.forEach((item) => setX(item, bounds.centerX - number(item.width) / 2));
  else if (mode === 'right') items.forEach((item) => setX(item, bounds.right - number(item.width)));
  else if (mode === 'top') items.forEach((item) => setY(item, bounds.top));
  else if (mode === 'center-y') items.forEach((item) => setY(item, bounds.centerY - number(item.height) / 2));
  else if (mode === 'bottom') items.forEach((item) => setY(item, bounds.bottom - number(item.height)));
  else if (mode === 'distribute-x' && items.length >= 3) {
    const ordered = [...items].sort((a, b) => number(a[xKey]) - number(b[xKey]));
    const totalWidth = ordered.reduce((sum, item) => sum + number(item.width), 0);
    const gap = (bounds.width - totalWidth) / (ordered.length - 1);
    let cursor = bounds.left;
    ordered.forEach((item) => { setX(item, cursor); cursor += number(item.width) + gap; });
  } else if (mode === 'distribute-y' && items.length >= 3) {
    const ordered = [...items].sort((a, b) => number(a[yKey]) - number(b[yKey]));
    const totalHeight = ordered.reduce((sum, item) => sum + number(item.height), 0);
    const gap = (bounds.height - totalHeight) / (ordered.length - 1);
    let cursor = bounds.top;
    ordered.forEach((item) => { setY(item, cursor); cursor += number(item.height) + gap; });
  } else if (mode === 'target-center-x' || mode === 'target-center-y' || mode === 'target-center') {
    let dx = targetX - bounds.centerX;
    let dy = targetY - bounds.centerY;
    if (clamp) { dx = Math.max(-bounds.left, dx); dy = Math.max(-bounds.top, dy); }
    if (mode !== 'target-center-y') items.forEach((item) => setX(item, number(item[xKey]) + dx));
    if (mode !== 'target-center-x') items.forEach((item) => setY(item, number(item[yKey]) + dy));
  } else return false;
  return true;
}
