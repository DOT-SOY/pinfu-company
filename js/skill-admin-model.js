import { characterId, integerInput, characterError } from './character-admin-model.js';

// Editable subset of Python's supported types. Legacy monetary effects stay in DB.
export const MONEY_EFFECTS = ['money_delta_bonus','money_gain_multiplier','money_cost_multiplier','block_money_loss'];
export const isProtectedModifier = row => MONEY_EFFECTS.includes(row.modifier_type);
export const EFFECTS = {
  daily_action_bonus: ['일일 행동횟수 보너스', '기본 일일 행동횟수에 더합니다. 특정 명령 전용이면 일반 상태 조회에는 포함되지 않습니다.', 1],
  condition_delta_bonus: ['컨디션 변화량 보너스', '행동의 컨디션 변화량에 더합니다.', 1],
  condition_cost_multiplier: ['컨디션 소모 배율', '컨디션이 감소할 때 적용합니다. 0.8이면 감소량의 80%입니다.', 0.8],
  condition_recovery_multiplier: ['컨디션 회복 배율', '컨디션이 증가할 때 적용합니다.', 1.2],
  stat_delta_bonus: ['스탯 변화량 보너스', '대상 스탯의 변화량에 더합니다.', 1],
  stat_gain_multiplier: ['스탯 증가 배율', '대상 스탯이 증가할 때 적용합니다.', 1.2],
  stat_loss_multiplier: ['스탯 감소 배율', '대상 스탯이 감소할 때 적용합니다.', 0.8],
  dice_threshold_delta: ['다이스 성공 기준 보정', '성공 기준에 더합니다. 음수면 성공 기준이 낮아집니다.', -1],
  dice_result_bonus: ['다이스 결과 보너스', '다이스 결과에 더합니다.', 1],
  dice_reroll: ['실패 시 다이스 재굴림', '다이스 실패 시 이 값만큼 재굴림합니다. 성공하면 중단합니다. 관리 화면에서는 0~100회만 허용합니다.', 1],
  repeat_penalty_delay: ['반복 행동 패널티 지연', '반복 패널티를 지정한 횟수만큼 늦춥니다.', 1],
  block_negative_stat: ['스탯 감소 방어', '대상 스탯이 감소할 때 방어합니다. 수치 값은 사용하지 않습니다.', 0],
  block_condition_loss: ['컨디션 감소 방어', '컨디션이 감소할 때 방어합니다. 수치 값은 사용하지 않습니다.', 0]
};
export const STAT_EFFECTS = ['stat_delta_bonus','stat_gain_multiplier','stat_loss_multiplier','block_negative_stat'];
export function modifierInputs(type) {
  return { value: !['block_negative_stat','block_condition_loss'].includes(type), stat: STAT_EFFECTS.includes(type) };
}
const INTEGER_EFFECTS = ['daily_action_bonus','dice_threshold_delta','dice_result_bonus','dice_reroll','repeat_penalty_delay'];
export function newModifier() {
  return { id:null, modifier_type:'condition_cost_multiplier', value:0.8, enabled:true, priority:100,
    target_command_id:null, target_stat_id:null, period:null, max_uses:null, params:{} };
}
export function modifierFields(row) {
  const { id,modifier_type,value,enabled,priority,target_command_id,target_stat_id,period,max_uses } = row;
  return { id,modifier_type,value,enabled,priority,target_command_id,target_stat_id,period,max_uses };
}
export function skillDefinition(data) {
  return { skill_key:data.skill.skill_key, name:data.skill.name, description:data.skill.description || '',
    enabled:data.skill.enabled, modifiers:data.modifiers.filter(m=>!isProtectedModifier(m)).map(modifierFields) };
}
export function validateSkill(definition, existing = false) {
  const d = structuredClone(definition);
  d.name = String(d.name ?? '').trim(); d.skill_key = String(d.skill_key ?? '').trim();
  if (!d.name || d.name.length > 200 || typeof d.description !== 'string' || d.description.length > 10000 || typeof d.enabled !== 'boolean') throw new Error('INVALID_SKILL');
  if ((!existing && !/^[a-z][a-z0-9_]{0,79}$/.test(d.skill_key)) || !d.skill_key) throw new Error('INVALID_SKILL_KEY');
  if (!Array.isArray(d.modifiers) || d.modifiers.length > 100) throw new Error('TOO_MANY_MODIFIERS');
  const ids = new Set();
  for (const m of d.modifiers) {
    if (!Object.hasOwn(EFFECTS,m.modifier_type)) throw new Error('INVALID_MODIFIER_TYPE');
    if (m.id !== null) { characterId(m.id); if(ids.has(m.id)) throw new Error('DUPLICATE_MODIFIER'); ids.add(m.id); }
    const n = m.value;
    if ((n !== null && (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n)>2147483647)) ||
      (INTEGER_EFFECTS.includes(m.modifier_type) && n !== null && !Number.isInteger(n)) ||
      ((m.modifier_type.endsWith('multiplier') || ['dice_reroll','repeat_penalty_delay'].includes(m.modifier_type)) && n < 0) ||
      (m.modifier_type === 'dice_reroll' && (n === null || n>100))) throw new Error('INVALID_MODIFIER_VALUE');
    m.priority=integerInput(m.priority);
    if (typeof m.enabled !== 'boolean') throw new Error('INVALID_ACTIVE');
    if (m.max_uses !== null) m.max_uses=integerInput(m.max_uses,0);
    if (![null,'always','day','week'].includes(m.period)) throw new Error('INVALID_PERIOD');
    for(const key of ['target_command_id','target_stat_id']) if(m[key] !== null) characterId(m[key]);
    if(m.target_stat_id !== null && !STAT_EFFECTS.includes(m.modifier_type)) throw new Error('STAT_TARGET_NOT_APPLICABLE');
  }
  return d;
}
const labelValue = (key,value,data) => {
  if(value === null) return ['max_uses'].includes(key) ? '제한 없음' : key==='period' ? '누적' : key.startsWith('target_') ? '전체' : '비어 있음';
  if(key==='enabled') return value ? '활성' : '비활성';
  if(key==='modifier_type') return EFFECTS[value]?.[0] || value;
  if(key==='period') return {day:'일일',week:'주간',always:'누적'}[value] || value;
  if(key==='target_command_id' || key==='target_stat_id') return data[key==='target_command_id'?'commands':'stats'].find(x=>x.id===value)?.name || value;
  return String(value);
};
export function skillChanges(data,definition) {
  const before=skillDefinition(data), rows=[];
  const labels={skill_key:'스킬 키',name:'이름',description:'설명',enabled:'활성 상태',modifier_type:'효과 종류',value:'수치',priority:'우선순위',target_command_id:'대상 명령',target_stat_id:'대상 스탯',period:'기간',max_uses:'사용 한도'};
  for(const key of ['skill_key','name','description','enabled']) if(before[key]!==definition[key]) rows.push({label:labels[key],before:labelValue(key,before[key],data),after:labelValue(key,definition[key],data)});
  definition.modifiers.forEach((m,index)=>{
    const old=before.modifiers.find(x=>m.id!==null && x.id===m.id);
    if(!old) { rows.push({label:`새 효과 ${index+1}`,before:'없음',after:Object.keys(labels).filter(k=>k in m).map(k=>labels[k]+': '+labelValue(k,m[k],data)).join(' · ')}); return; }
    for(const key of Object.keys(labels).filter(k=>k in m)) if(m[key]!==old[key]) rows.push({label:`효과 ${index+1} · ${labels[key]}`,before:labelValue(key,old[key],data),after:labelValue(key,m[key],data)});
  });
  return rows;
}
export function skillError(error) {
  if(['PGRST202','42883'].includes(error?.code)) return '스킬 관리 함수가 없습니다. sql/character-admin.sql 다음에 sql/skill-admin.sql을 설치해주세요.';
  if(error?.code==='23505') return '이미 사용 중인 스킬 키입니다. 목록을 새로고침해 확인해주세요.';
  return ({INVALID_SKILL:'이름(1~200자), 설명(최대 10,000자), 활성 상태를 확인해주세요.',INVALID_SKILL_KEY:'스킬 키는 영문 소문자로 시작하는 소문자·숫자·밑줄 1~80자로 입력해주세요.',
    SKILL_KEY_EXISTS:'이미 사용 중인 스킬 키입니다. 이전 저장이 성공했을 수도 있으니 목록에서 확인해주세요.',SKILL_KEY_READONLY:'기존 스킬 키는 바꿀 수 없습니다.',SKILL_NOT_FOUND:'스킬을 찾을 수 없습니다.',
    SKILL_CONFLICT:'조회 이후 스킬 정의가 바뀌었습니다. 새로고침 후 다시 수정해주세요.',INVALID_MODIFIER_TYPE:'현재 봇이 지원하지 않는 효과입니다.',INVALID_MODIFIER_VALUE:'효과 수치를 확인해주세요. 행동횟수·다이스·패널티 지연은 정수, 배율·재굴림·지연은 0 이상이어야 합니다. 재굴림은 최대 100회입니다.',
    INVALID_PERIOD:'사용 제한 기간을 확인해주세요.',INVALID_MAX_USES:'사용 한도는 0 이상의 정수 또는 빈칸이어야 합니다.',STAT_TARGET_NOT_APPLICABLE:'스탯 효과에만 대상 스탯을 지정할 수 있습니다.',
    TOO_MANY_MODIFIERS:'스킬 하나에 최대 100개 효과를 편집할 수 있습니다.',COMMAND_NOT_FOUND:'대상 명령이 삭제되었습니다. 새로고침해주세요.',MODIFIER_REMOVAL_NOT_ALLOWED:'기존 효과는 삭제하지 않고 비활성화해주세요.',MODIFIER_NOT_OWNED:'다른 스킬의 효과는 수정할 수 없습니다.'})[error?.message] || characterError(error);
}
