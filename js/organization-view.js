import { esc, lines } from './ui.js';
import { isSafeImageUrl, normalizeInnerSchema, normalizeOuterSchema } from './organization-schema.js';

const alignments = new Set(['left', 'center', 'right']);
const fits = new Set(['cover', 'contain', 'fill', 'none', 'scale-down']);
const positions = new Set(['center', 'top', 'bottom', 'left', 'right']);

export function safeColor(value, fallback = 'transparent') {
  const color = String(value || '').trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|transparent)$/i.test(color) ? color : fallback;
}

export function safeBorder(value, fallback = '1px solid #cbdbe4') {
  const border = String(value || '').trim();
  return border === 'none' || /^\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted)\s+(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(border) ? border : fallback;
}

export function safeImage(value) {
  return isSafeImageUrl(value) ? String(value || '') : '';
}

export function renderOuterCard(profile, schemaValue, size = {}) {
  const schema = normalizeOuterSchema(schemaValue);
  const width = Math.max(80, Number(size.width) || schema.card.width);
  const height = Math.max(80, Number(size.height) || schema.card.height);
  const scaleX = width / schema.card.width;
  const scaleY = height / schema.card.height;
  const cardStyle = `width:${width}px;height:${height}px;background:${safeColor(schema.card.background, '#fff')};border:${safeBorder(schema.card.border)};border-radius:${Math.max(0, Number(schema.card.borderRadius) || 0)}px;padding:${Math.max(0, Number(schema.card.padding) || 0)}px`;
  const fields = schema.fields.filter((field) => field.visible !== false).map((field) => {
    const value = profile?.[field.key] || '';
    const align = alignments.has(field.align) ? field.align : 'left';
    const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
    const style = `left:${field.x * scaleX}px;top:${field.y * scaleY}px;width:${field.width * scaleX}px;height:${field.height * scaleY}px;text-align:${align};justify-content:${justify};font-size:${Math.max(8, Number(field.fontSize) || 13)}px;font-weight:${String(field.fontWeight || 400).replace(/[^\d]|^(?=0*$)/g, '') || 400}`;
    if (field.type === 'image' || field.key === 'image_url') {
      const src = safeImage(value);
      return `<div class="organization-card-field organization-card-image" data-field-id="${esc(field.id)}" style="${style}">${src ? `<img src="${esc(src)}" alt="${esc(profile?.name || '')}" style="object-fit:${fits.has(field.fit) ? field.fit : 'cover'};object-position:${positions.has(field.position) ? field.position : 'center'}">` : '<span class="organization-image-placeholder" aria-hidden="true">P</span>'}</div>`;
    }
    return `<div class="organization-card-field" data-field-id="${esc(field.id)}" style="${style}">${esc(value)}</div>`;
  }).join('');
  return `<div class="organization-profile-card" style="${cardStyle}">${fields}</div>`;
}

export function fieldValue(field, profile, detail) {
  return field.source === 'detail' ? detail?.field_values?.[field.key] : profile?.[field.key];
}

export function renderInnerFields(profile, detail, schemaValue) {
  const schema = normalizeInnerSchema(schemaValue);
  return schema.fields.map((field) => {
    const value = fieldValue(field, profile, detail);
    if (value == null || value === '') return '';
    let body;
    if (field.type === 'image') {
      const src = safeImage(value);
      body = src ? `<img class="organization-detail-image-field" src="${esc(src)}" alt="${esc(field.label)}">` : '<span class="organization-invalid-value">표시할 수 없는 이미지 URL입니다.</span>';
    } else if (field.type === 'url') {
      const url = safeImage(value);
      body = url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(value)} ↗</a>` : esc(value);
    } else if (field.type === 'textarea') body = `<p>${lines(value)}</p>`;
    else body = `<p>${esc(value)}</p>`;
    return `<div class="organization-detail-field span-${field.span}"><small>${esc(field.label)}</small>${body}</div>`;
  }).join('');
}

export function orthogonalPath(source, target) {
  const sx = Number(source.position_x) + Number(source.width) / 2;
  const sy = Number(source.position_y) + Number(source.height);
  const tx = Number(target.position_x) + Number(target.width) / 2;
  const ty = Number(target.position_y);
  const middle = sy + (ty - sy) / 2;
  return `M ${sx} ${sy} V ${middle} H ${tx} V ${ty}`;
}
