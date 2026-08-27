import { esc, lines } from './ui.js';
import { isSafeImageUrl, normalizeInnerSchema, normalizeOuterSchema } from './organization-schema.js';

const alignments = new Set(['left', 'center', 'right']);
const fits = new Set(['cover', 'contain', 'fill', 'none', 'scale-down']);
const positions = new Set(['center', 'top', 'bottom', 'left', 'right']);
const customCssProperties = new Set([
  'color', 'background', 'background-color',
  'border', 'border-color', 'border-style', 'border-width', 'border-radius',
  'box-shadow', 'text-shadow', 'opacity', 'overflow',
  'font-family', 'font-size', 'font-style', 'font-weight', 'letter-spacing', 'line-height',
  'text-align', 'text-decoration', 'text-transform', 'white-space', 'word-break',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'align-items', 'justify-content'
]);
const forbiddenCss = /@import|\burl\b|(?:image-set|paint|element)\s*\(|expression\s*\(|javascript\s*:|<\s*\/?\s*(?:script|style)\b|position\s*:\s*fixed/i;
const safeCssValue = /^[\w\s#.,%()+\-/'"]+$/;

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

export function parseSafeCssDeclarations(value) {
  const declarations = {};
  const rejected = [];
  String(value || '').slice(0, 4000).split(';').forEach((raw) => {
    const declaration = raw.trim();
    if (!declaration) return;
    const colon = declaration.indexOf(':');
    if (colon < 1 || forbiddenCss.test(declaration)) { rejected.push(declaration); return; }
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const cssValue = declaration.slice(colon + 1).trim();
    if (!customCssProperties.has(property) || !cssValue || cssValue.length > 300 || !safeCssValue.test(cssValue)) {
      rejected.push(declaration);
      return;
    }
    declarations[property] = cssValue;
  });
  return { declarations, rejected };
}

export function safeCustomStyle(value) {
  const { declarations } = parseSafeCssDeclarations(value);
  if (!declarations['justify-content'] && ['left', 'center', 'right'].includes(declarations['text-align'])) {
    declarations['justify-content'] = declarations['text-align'] === 'center' ? 'center' : declarations['text-align'] === 'right' ? 'flex-end' : 'flex-start';
  }
  return Object.entries(declarations).map(([property, cssValue]) => `${property}:${cssValue}`).join(';');
}

export function renderOuterCard(profile, schemaValue, size = {}) {
  const schema = normalizeOuterSchema(schemaValue);
  const width = Math.max(80, Number(size.width) || schema.card.width);
  const height = Math.max(80, Number(size.height) || schema.card.height);
  const scaleX = width / schema.card.width;
  const scaleY = height / schema.card.height;
  const cardCustomStyle = safeCustomStyle(schema.card.customCss);
  const cardStyle = `width:${width}px;height:${height}px;background:${safeColor(schema.card.background, '#fff')};border:${safeBorder(schema.card.border)};border-radius:${Math.max(0, Number(schema.card.borderRadius) || 0)}px;padding:${Math.max(0, Number(schema.card.padding) || 0)}px${cardCustomStyle ? `;${cardCustomStyle}` : ''}`;
  const fields = schema.fields.filter((field) => field.visible !== false).map((field) => {
    const value = field.source === 'static' ? field.text : profile?.[field.key] ?? '';
    const align = alignments.has(field.align) ? field.align : 'left';
    const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
    const customStyle = safeCustomStyle(field.customCss);
    const style = `left:${field.x * scaleX}px;top:${field.y * scaleY}px;width:${field.width * scaleX}px;height:${field.height * scaleY}px;box-sizing:border-box;text-align:${align};justify-content:${justify};font-size:${Math.max(8, Number(field.fontSize) || 13)}px;font-weight:${String(field.fontWeight || 400).replace(/[^\d]|^(?=0*$)/g, '') || 400};color:${safeColor(field.color, 'inherit')};background:${safeColor(field.background)};border:${safeBorder(field.border, 'none')}${customStyle ? `;${customStyle}` : ''}`;
    if (field.type === 'image' || field.key === 'image_url') {
      const src = safeImage(value);
      return `<div class="organization-card-field organization-card-image" data-field-id="${esc(field.id)}" style="${esc(style)}">${src ? `<img src="${esc(src)}" alt="${esc(profile?.name || '')}" style="object-fit:${fits.has(field.fit) ? field.fit : 'cover'};object-position:${positions.has(field.position) ? field.position : 'center'}">` : '<span class="organization-image-placeholder" aria-hidden="true">P</span>'}</div>`;
    }
    return `<div class="organization-card-field" data-field-id="${esc(field.id)}" style="${esc(style)}">${esc(value)}</div>`;
  }).join('');
  return `<div class="organization-profile-card" style="${esc(cardStyle)}">${fields}</div>`;
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
