// UI-only formatting and edit validation. Daily/weekly usage is computed by
// the database RPC with the bot's rules, never reinterpreted in the browser.
export const BASIC_FIELDS = ['name', 'condition', 'base_daily_actions', 'active'];
const LABELS = { name: '캐릭터 이름', condition: '컨디션', base_daily_actions: '기본 일일 행동횟수', active: '활성 상태' };

export function characterId(value) {
  const id = String(value ?? '');
  if (!/^[1-9][0-9]*$/.test(id) || BigInt(id) > 9223372036854775807n) throw new Error('INVALID_CHARACTER_ID');
  return id; // Keep bigint IDs out of JavaScript floating point.
}

export function integerInput(value, minimum = -2147483648) {
  const text = String(value).trim();
  if (!/^-?\d+$/.test(text)) throw new Error('INVALID_INTEGER');
  const number = Number(text);
  if (!Number.isInteger(number) || number < minimum || number > 2147483647) throw new Error('INVALID_INTEGER');
  return number;
}

export function editChanges(snapshot, values, statValues) {
  const changes = {};
  const name = String(values.name ?? '').trim();
  if (!name || name.length > 200) throw new Error('INVALID_NAME');
  const basic = { name, condition: integerInput(values.condition, 0),
    base_daily_actions: integerInput(values.base_daily_actions, 0), active: values.active };
  if (typeof basic.active !== 'boolean') throw new Error('INVALID_ACTIVE');
  for (const key of BASIC_FIELDS) if (basic[key] !== snapshot.character[key]) changes[key] = basic[key];
  const stats = [];
  for (const row of snapshot.stats) {
    const raw = statValues[String(row.stat_id)];
    if (row.value == null && String(raw ?? '').trim() === '') continue;
    const value = integerInput(raw);
    if (row.value !== value) stats.push({ stat_id: characterId(row.stat_id), value });
  }
  if (stats.length) changes.stats = stats;
  return changes;
}

export function changeSummary(snapshot, changes) {
  const display = (key, value) => key === 'active' ? (value ? '활성' : '비활성') : String(value);
  const rows = BASIC_FIELDS.filter(key => key in changes).map(key => ({
    label: LABELS[key], before: display(key, snapshot.character[key]), after: display(key, changes[key])
  }));
  for (const change of changes.stats || []) {
    const stat = snapshot.stats.find(row => String(row.stat_id) === change.stat_id);
    rows.push({ label: stat.display_name, before: stat.value == null ? '미등록' : String(stat.value), after: String(change.value) });
  }
  return rows;
}

export function modifierSummary(modifier) {
  const value = modifier.value ?? 0;
  const target = modifier.target_command_id ? (modifier.target_command || '지정 명령') : '모든 행동';
  const stat = modifier.target_stat_id ? (modifier.target_stat_name || '지정 스탯') : '대상 스탯';
  const signed = Number(value) >= 0 ? '+' + value : String(value);
  const text = {
    daily_action_bonus: '일일 행동 가능 횟수 ' + signed,
    condition_delta_bonus: '컨디션 변화량 ' + signed,
    condition_cost_multiplier: '컨디션 감소 시 변화량 ×' + value,
    condition_recovery_multiplier: '컨디션 회복 시 변화량 ×' + value,
    stat_delta_bonus: stat + ' 변화량 ' + signed,
    stat_gain_multiplier: stat + ' 증가 시 변화량 ×' + value,
    stat_loss_multiplier: stat + ' 감소 시 변화량 ×' + value,
    dice_threshold_delta: '다이스 성공 기준 ' + signed,
    dice_result_bonus: '다이스 결과 ' + signed,
    dice_reroll: '다이스 실패 시 최대 ' + value + '회 재굴림',
    repeat_penalty_delay: '반복 행동 패널티 ' + value + '회 지연',
    block_negative_stat: stat + ' 감소 방어',
    block_condition_loss: '컨디션 감소 방어'
  };
  // These effects remain on the shared skill; this screen never edits them.
  if (['money_delta_bonus','money_gain_multiplier','money_cost_multiplier','block_money_loss'].includes(modifier.modifier_type)) {
    return '이 관리 화면에서 표시하지 않는 효과';
  }
  return target + ' · ' + (text[modifier.modifier_type] || '지원되지 않는 효과 유형 — 봇 설정 확인 필요');
}

export function usageSummary(modifier) {
  if (modifier.max_uses == null) return '횟수 제한 없음';
  const period = { day: '오늘', week: '이번 주', always: '누적' }[modifier.period] || '누적';
  return period + ' ' + modifier.used + ' / ' + modifier.max_uses + '회 사용';
}

export function characterError(error) {
  const messages = {
    ADMIN_REQUIRED: '관리자만 캐릭터 데이터를 조회하거나 수정할 수 있습니다.',
    CHARACTER_NOT_FOUND: '캐릭터를 찾을 수 없습니다.',
    CHARACTER_CONFLICT: '조회 이후 데이터가 변경됐습니다. 새로고침한 뒤 다시 수정해주세요.',
    BOT_PAUSE_REQUIRED: '봇을 일시 중지한 뒤 확인란에 체크해주세요.',
    INVALID_INTEGER: '수치는 정수여야 합니다. 컨디션과 기본 행동횟수는 0 이상으로 입력해주세요.',
    INVALID_NAME: '캐릭터 이름은 1~200자로 입력해주세요.',
    INVALID_ACTIVE: '활성 상태 값이 잘못되었습니다.',
    INVALID_CHARACTER_ID: '잘못된 캐릭터 ID입니다.',
    SKILL_ALREADY_OWNED: '이미 보유한 스킬입니다. 새로고침해주세요.',
    SKILL_NOT_AVAILABLE: '비활성화되었거나 존재하지 않는 스킬입니다.',
    STAT_NOT_FOUND: '스탯 구성이 변경됐습니다. 새로고침해주세요.',
    FIELD_NOT_ALLOWED: '수정할 수 없는 항목이 포함되어 있습니다.'
  };
  if (error?.code === 'PGRST202' || error?.code === '42883') return '캐릭터 관리 DB 함수가 아직 설치되지 않았습니다. sql/character-admin.sql을 적용해주세요.';
  if (error?.code === '42501') return messages.ADMIN_REQUIRED;
  return messages[error?.message] || '요청에 실패했습니다. 연결 및 관리자 권한을 확인해주세요. 저장 결과가 불확실하면 새로고침 후 확인하세요.';
}
