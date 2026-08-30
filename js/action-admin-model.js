import { characterId, integerInput, characterError } from './character-admin-model.js';
import { commandDefinition, commandError } from './skill-command-model.js';
export const RULE_TYPES={effect:'일반 효과',repeat_penalty:'반복 패널티',requirement:'행동 필수 조건'};
export const RULE_FIELDS=['rule_key','description','enabled','priority','rule_type','use_from','use_to','previous_command_id','condition_min','condition_max','dice_outcome','condition_delta'];
export function newActionRule(rules=[]) {
  let index=1;while(rules.some(r=>r.rule_key==='rule_'+index))index++;
  return {id:null,rule_key:'rule_'+index,description:'',enabled:true,priority:100,rule_type:'effect',use_from:null,use_to:null,
    previous_command_id:null,condition_min:null,condition_max:null,dice_outcome:null,condition_delta:0,stats:[]};
}
export function actionDefinition(data) {
  const {id,...command}=data.command;
  return {command:{...command,display_name:command.display_name||command.command.replace(/^\//,''),description:command.description||''},
    rules:data.rules.map(r=>({id:r.id,...Object.fromEntries(RULE_FIELDS.filter(key=>r.rule_type!=='requirement'||key!=='condition_delta').map(key=>[key,key==='description'?r[key]||'':r[key]])),
      ...(r.rule_type==='requirement'?{}:{stats:r.stats.map(({id,stat_id,delta})=>({id,stat_id,delta}))})}))};
}
function nullableInteger(value,min=-2147483648) {return value===null || String(value).trim()===''?null:integerInput(value,min);}
function template(value) {
  const stripped=String(value||'').replaceAll('{{','').replaceAll('}}','').replace(/\{(?:display_name|result|dice_result)\}/g,'');
  if(/[{}]/.test(stripped))throw new Error('INVALID_ACTION_MESSAGE');
}
export function validateAction(raw,before=null) {
  const d=structuredClone(raw),source=d.command;
  const c=commandDefinition(source);
  if(typeof source.hidden!=='boolean')throw new Error('INVALID_ACTION');
  c.hidden=source.hidden;
  for(const key of ['success_message','fail_message']) {
    const text=source[key]===null?null:String(source[key]??'');
    if(text?.length>10000)throw new Error('INVALID_ACTION_MESSAGE');
    if(text!==(before?.command[key]??null))template(text);
    c[key]=text;
  }
  d.command=c;
  if(!Array.isArray(d.rules) || d.rules.length>100)throw new Error('TOO_MANY_RULES');
  const ids=new Set(),keys=new Set();
  for(const r of d.rules) {
    if(r.id!==null){characterId(r.id);if(ids.has(r.id))throw new Error('DUPLICATE_RULE');ids.add(r.id);}
    if(!Object.hasOwn(RULE_TYPES,r.rule_type) || typeof r.enabled!=='boolean')throw new Error('INVALID_RULE');
    r.rule_key=String(r.rule_key??'').trim();r.description=String(r.description??'');
    if(!r.rule_key || (r.id===null && !/^[a-z][a-z0-9_]{0,79}$/.test(r.rule_key)) || r.rule_key.length>200)throw new Error('INVALID_RULE_KEY');
    if(keys.has(r.rule_key))throw new Error('DUPLICATE_RULE');keys.add(r.rule_key);
    if(r.description.length>10000)throw new Error('INVALID_RULE');
    r.priority=integerInput(r.priority);
    for(const key of ['use_from','use_to'])r[key]=nullableInteger(r[key],1);
    for(const key of ['condition_min','condition_max'])r[key]=nullableInteger(r[key]);
    for(const [low,high] of [['use_from','use_to'],['condition_min','condition_max']])if(r[low]!==null && r[high]!==null && r[low]>r[high])throw new Error('INVALID_RULE_RANGE');
    if(r.previous_command_id!==null)characterId(r.previous_command_id);
    if(![null,'success','fail'].includes(r.dice_outcome))throw new Error('INVALID_DICE_OUTCOME');
    if(r.enabled && r.dice_outcome!==null && (!c.dice_enabled || c.dice_threshold===null))throw new Error('DICE_JUDGMENT_REQUIRED');
    if(r.rule_type==='requirement') {
      // No ignored effects in the payload. Existing DB effects are left untouched.
      delete r.condition_delta;delete r.stats;continue;
    }
    r.condition_delta=integerInput(r.condition_delta);
    if(!Array.isArray(r.stats)||r.stats.length>200)throw new Error('INVALID_RULE_STATS');
    const statIds=new Set();
    for(const e of r.stats) {
      if(e.id!==null)characterId(e.id);characterId(e.stat_id);
      if(statIds.has(e.stat_id))throw new Error('DUPLICATE_RULE_STAT');statIds.add(e.stat_id);
      e.delta=integerInput(e.delta);
    }
  }
  return d;
}
const LABELS={command:'명령어',display_name:'행동 이름',description:'설명',enabled:'활성',hidden:'숨김 행동',consumes_action:'행동횟수 차감',dice_enabled:'다이스 사용',dice_min:'다이스 최소',dice_max:'다이스 최대',dice_threshold:'성공 기준',success_message:'성공 답글',fail_message:'실패 답글',rule_key:'규칙 키',priority:'우선순위',rule_type:'규칙 종류',use_from:'오늘 사용 순서 시작',use_to:'오늘 사용 순서 끝',previous_command_id:'직전 행동',condition_min:'컨디션 최소',condition_max:'컨디션 최대',dice_outcome:'다이스 결과',condition_delta:'컨디션 변화'};
function display(key,value,data) {
  if(value==null || value==='')return '없음';
  if(typeof value==='boolean')return value?'예':'아니오';
  if(key==='rule_type')return RULE_TYPES[value];
  if(key==='dice_outcome')return value==='success'?'성공':'실패';
  if(key==='previous_command_id')return data.commands.find(c=>c.id===value)?.name||value;
  return String(value);
}
export function actionChanges(data,draft) {
  const before=actionDefinition(data),rows=[];
  for(const key of Object.keys(draft.command))if(draft.command[key]!==before.command[key])rows.push({label:LABELS[key],before:display(key,before.command[key],data),after:display(key,draft.command[key],data)});
  for(const r of draft.rules) {
    const old=before.rules.find(x=>r.id!==null && x.id===r.id),prefix='규칙 '+r.rule_key;
    if(!old)rows.push({label:prefix+' 추가',before:'없음',after:RULE_FIELDS.filter(k=>k in r).map(k=>LABELS[k]+': '+display(k,r[k],data)).join(' · ')});
    else for(const key of RULE_FIELDS)if(key in r && old[key]!==r[key])rows.push({label:prefix+' · '+LABELS[key],before:display(key,old[key],data),after:display(key,r[key],data)});
    for(const e of r.stats||[]) {
      const prior=old?.stats?.find(x=>e.id!==null && x.id===e.id);
      if(!prior || prior.delta!==e.delta)rows.push({label:prefix+' · '+(data.stats.find(s=>s.id===e.stat_id)?.name||e.stat_id),before:prior?String(prior.delta):'없음',after:String(e.delta)});
    }
  }
  return rows;
}
export function actionError(error) {
  if(['PGRST202','42883'].includes(error?.code))return '행동 관리 함수가 없습니다. sql/character-admin.sql 다음에 sql/action-admin.sql을 설치해주세요.';
  if(error?.code==='23505')return '이미 등록된 명령이나 규칙 키입니다. 기존 항목을 확인해주세요.';
  return ({INVALID_ACTION:'행동 이름·설명·활성 설정을 확인해주세요.',ACTION_NOT_FOUND:'해당 일반 행동을 찾을 수 없습니다. 조회(status) 명령은 이 화면에서 편집하지 않습니다.',ACTION_CONFLICT:'조회 이후 행동 규칙이 바뀌었습니다. 새로고침 후 다시 수정해주세요.',
    COMMAND_READONLY:'기존 명령어 자체는 변경할 수 없습니다. 행동 이름은 수정할 수 있습니다.',INVALID_ACTION_NUMBER:'수치는 정수로 입력해주세요.',INVALID_RULE:'규칙 설정을 확인해주세요.',
    INVALID_RULE_KEY:'새 규칙 키는 소문자로 시작하는 영문 소문자·숫자·밑줄 1~80자로 입력해주세요.',DUPLICATE_RULE:'규칙 키가 중복되었습니다.',DUPLICATE_RULE_STAT:'같은 규칙에 스탯이 중복되었습니다.',
    INVALID_RULE_RANGE:'시작·최소값이 끝·최대값보다 크면 안 됩니다.',DICE_JUDGMENT_REQUIRED:'성공·실패 조건을 쓰려면 행동의 다이스 사용과 성공 기준을 설정해주세요.',INVALID_ACTION_MESSAGE:'답글에는 {display_name}, {result}, {dice_result}만 사용할 수 있습니다. 중괄호 자체는 {{와 }}로 입력해주세요.',
    TOO_MANY_RULES:'한 행동에 최대 100개 규칙을 편집할 수 있습니다.',RULE_REMOVAL_NOT_ALLOWED:'기존 규칙은 삭제 대신 비활성화해주세요.',EFFECT_REMOVAL_NOT_ALLOWED:'기존 스탯 효과는 삭제 대신 변화량을 0으로 바꾸거나 규칙을 비활성화해주세요.',
    RULE_NOT_OWNED:'다른 행동의 규칙은 수정할 수 없습니다.',EFFECT_NOT_OWNED:'다른 규칙의 스탯 효과는 수정할 수 없습니다.',RULE_KEY_READONLY:'기존 규칙 키는 변경할 수 없습니다.'})[error?.message] || (error?.message?.startsWith('COMMAND') || error?.message?.startsWith('INVALID_COMMAND')?commandError(error):characterError(error));
}
