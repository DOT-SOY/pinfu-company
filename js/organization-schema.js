export const DEFAULT_CANVAS = { width: 1600, height: 900, gridSize: 20, background: '#eef4f8', showGrid: true, snap: true };

export const DEFAULT_OUTER_SCHEMA = {
  card: { width: 190, height: 230, background: '#ffffff', border: '1px solid #cbdbe4', borderRadius: 4, padding: 12 },
  fields: [
    { id: 'department', source: 'profile', key: 'department', type: 'text', label: '소속', visible: true, x: 12, y: 12, width: 166, height: 24, fontSize: 11, fontWeight: 700, align: 'left' },
    { id: 'image_url', source: 'profile', key: 'image_url', type: 'image', label: '사진', visible: true, x: 40, y: 44, width: 110, height: 110, fit: 'cover', position: 'center' },
    { id: 'name', source: 'profile', key: 'name', type: 'text', label: '이름', visible: true, x: 12, y: 170, width: 105, height: 28, fontSize: 17, fontWeight: 800, align: 'left' },
    { id: 'position', source: 'profile', key: 'position', type: 'text', label: '직급', visible: true, x: 120, y: 174, width: 58, height: 24, fontSize: 12, fontWeight: 600, align: 'right' }
  ]
};

export const DEFAULT_INNER_SCHEMA = {
  fields: [
    { id: 'inner_image', source: 'profile', key: 'image_url', label: '프로필 사진', type: 'image', required: false, placeholder: 'https://example.com/image', span: 2 },
    { id: 'inner_name', source: 'profile', key: 'name', label: '이름', type: 'text', required: true, placeholder: '이름', span: 1 },
    { id: 'inner_department', source: 'profile', key: 'department', label: '소속', type: 'text', required: true, placeholder: '소속/부서', span: 1 },
    { id: 'inner_position', source: 'profile', key: 'position', label: '직급', type: 'text', required: true, placeholder: '직급', span: 1 }
  ]
};

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeCanvas(value) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_CANVAS,
    ...input,
    width: Math.max(600, number(input.width, DEFAULT_CANVAS.width)),
    height: Math.max(400, number(input.height, DEFAULT_CANVAS.height)),
    gridSize: Math.max(5, number(input.gridSize, DEFAULT_CANVAS.gridSize)),
    showGrid: input.showGrid !== false,
    snap: input.snap !== false
  };
}

export function normalizeOuterSchema(value) {
  const input = value && typeof value === 'object' ? value : {};
  const card = input.card && typeof input.card === 'object' ? input.card : {};
  const sourceFields = Array.isArray(input.fields) ? input.fields : DEFAULT_OUTER_SCHEMA.fields;
  return {
    card: {
      ...DEFAULT_OUTER_SCHEMA.card,
      ...card,
      width: Math.max(120, number(card.width, DEFAULT_OUTER_SCHEMA.card.width)),
      height: Math.max(120, number(card.height, DEFAULT_OUTER_SCHEMA.card.height))
    },
    fields: sourceFields.map((field, index) => ({
      ...DEFAULT_OUTER_SCHEMA.fields[index] || {},
      ...field,
      id: String(field.id || field.key || `field_${index}`),
      visible: field.visible !== false,
      x: number(field.x, 0), y: number(field.y, 0),
      width: Math.max(20, number(field.width, 80)), height: Math.max(18, number(field.height, 24))
    }))
  };
}

export function normalizeInnerSchema(value) {
  const input = value && typeof value === 'object' ? value : {};
  const fields = Array.isArray(input.fields) ? input.fields : DEFAULT_INNER_SCHEMA.fields;
  return { fields: fields.map((field, index) => ({
    id: String(field.id || `fld_${index}`), source: field.source === 'detail' ? 'detail' : 'profile',
    key: String(field.key || field.id || `fld_${index}`), label: String(field.label || '필드'),
    type: ['text', 'textarea', 'number', 'date', 'url', 'select', 'image'].includes(field.type) ? field.type : 'text',
    required: field.required === true, placeholder: String(field.placeholder || ''),
    options: Array.isArray(field.options) ? field.options.map(String) : [], span: Number(field.span) === 2 ? 2 : 1
  })) };
}

export function createStableFieldId() {
  return `fld_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
}

export function isSafeImageUrl(value) {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === 'https:'; }
  catch { return false; }
}

export function orgErrorMessage(error, fallback = '서버에서 요청을 거부했습니다.') {
  console.error(error);
  if (error?.message === 'SUPABASE_CONNECTION_FAILED') return 'Supabase 연결에 실패했습니다.';
  if (error?.message === 'SUPABASE_NOT_CONFIGURED') return 'Supabase 연결에 실패했습니다.';
  if (error?.message === 'ORG_CANVAS_SETTING_MISSING') return '조직도 캔버스 설정을 찾을 수 없습니다.';
  if (error?.code === '23505') return '이미 조직도 프로필이 존재하거나 같은 프로필이 배치되어 있습니다.';
  if (error?.code === '42501' || /permission|policy|row-level/i.test(error?.message || '')) return '권한이 없습니다.';
  return fallback;
}
