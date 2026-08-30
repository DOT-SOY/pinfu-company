import { characterId, integerInput, characterError } from './character-admin-model.js';

export function commandDefinition(values) {
  let command=String(values.command ?? '').trim();
  if(!command.startsWith('/')) command='/'+command;
  if(!/^\/[\p{L}\p{N}_-]{1,80}$/u.test(command)) throw new Error('INVALID_COMMAND_TEXT');
  const display_name=String(values.display_name ?? '').trim();
  const description=String(values.description ?? '');
  if(!display_name || display_name.length>200 || description.length>10000) throw new Error('INVALID_COMMAND');
  for(const key of ['enabled','consumes_action','dice_enabled']) if(typeof values[key]!=='boolean') throw new Error('INVALID_COMMAND');
  let dice_min=1,dice_max=100,dice_threshold=null;
  if(values.dice_enabled) {
    try {
      dice_min=integerInput(values.dice_min); dice_max=integerInput(values.dice_max);
      if(String(values.dice_threshold ?? '').trim()!=='') dice_threshold=integerInput(values.dice_threshold);
    } catch { throw new Error('INVALID_COMMAND_DICE'); }
    if(dice_min>dice_max) throw new Error('INVALID_COMMAND_DICE');
  }
  return {command,display_name,description,enabled:values.enabled,consumes_action:values.consumes_action,
    dice_enabled:values.dice_enabled,dice_min,dice_max,dice_threshold};
}

export function commandSummary(command) {
  return `${command.command} · ${command.display_name}\n활성: ${command.enabled?'예':'아니오'}\n행동횟수 차감: ${command.consumes_action?'1회':'없음'}\n다이스: ${command.dice_enabled?`${command.dice_min}~${command.dice_max} / ${command.dice_threshold===null?'성공·실패 판정 없음':command.dice_threshold+' 이상 성공'}`:'사용 안 함'}`;
}

// Refresh options only: never replace the skill snapshot/revision or unsaved rows.
export function mergeTargetCommands(current, additions) {
  const items=new Map(current.map(row=>[String(row.id),row]));
  for(const row of additions) items.set(characterId(row.id),{...row,id:characterId(row.id)});
  return [...items.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'));
}

export function commandError(error) {
  if(['PGRST202','42883'].includes(error?.code)) return '대상 명령 등록 함수가 없습니다. sql/skill-command-admin.sql을 설치해주세요.';
  if(error?.code==='23505' || error?.message==='COMMAND_ALREADY_EXISTS') return '이미 등록된 명령입니다. 기존 설정은 바꾸지 않았습니다. 등록 창을 닫고 대상 명령 옆의 목록 새로고침을 눌러 선택해주세요. 이전 요청이 성공했을 수도 있습니다.';
  return ({INVALID_COMMAND:'표시명(1~200자), 설명(최대 10,000자), 활성 상태를 확인해주세요.',
    INVALID_COMMAND_TEXT:'명령은 / 뒤에 글자·숫자·밑줄·하이픈만 1~80자 입력해주세요. 공백·이모지·추가 슬래시는 사용할 수 없습니다.',
    INVALID_COMMAND_DICE:'다이스 값은 정수이며 최소값이 최대값보다 크면 안 됩니다. 성공 기준은 빈칸이면 판정하지 않습니다.'})[error?.message] || characterError(error);
}
