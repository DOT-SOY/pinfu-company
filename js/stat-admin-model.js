import { integerInput, characterError } from './character-admin-model.js';
export const STAT_FIELDS=['stat_key','display_name','description','default_value','enabled'];
export function statDefinition(snapshot) {
  return Object.fromEntries(STAT_FIELDS.map(k=>[k,snapshot.stat[k]]));
}
export function validateStat(raw,existing=false) {
  const d={...raw};
  d.stat_key=String(d.stat_key??'').trim();d.display_name=String(d.display_name??'').trim();
  if(!d.stat_key || d.stat_key.length>200 || (!existing&&!/^[a-z][a-z0-9_]{0,79}$/.test(d.stat_key)))throw new Error('INVALID_STAT_KEY');
  if(!d.display_name || d.display_name.length>200 || (d.description!==null && (typeof d.description!=='string'||d.description.length>10000)) || typeof d.enabled!=='boolean')throw new Error('INVALID_STAT');
  if(Object.keys(d).some(k=>!STAT_FIELDS.includes(k)))throw new Error('FIELD_NOT_ALLOWED');
  d.default_value=integerInput(d.default_value);return d;
}
export function statChanges(snapshot,draft) {
  const labels={stat_key:'내부 key',display_name:'표시 이름',description:'설명',default_value:'초기값',enabled:'활성 여부'};
  const format=v=>typeof v==='boolean'?(v?'활성':'비활성'):v==null||v===''?'없음':String(v);
  return STAT_FIELDS.filter(k=>draft[k]!==snapshot.stat[k]).map(k=>({label:labels[k],before:format(snapshot.stat[k]),after:format(draft[k])}));
}
export function statError(e) {
  if(['PGRST202','42883'].includes(e?.code))return '스탯 관리 함수가 없습니다. sql/stat-admin.sql을 설치해주세요.';
  if(e?.code==='23505')return '이미 존재하는 스탯 key입니다. 목록을 확인해주세요.';
  return ({INVALID_STAT:'표시 이름·설명·활성 여부를 확인해주세요.',INVALID_STAT_KEY:'새 key는 소문자로 시작하는 영문 소문자·숫자·밑줄 1~80자로 입력해주세요.',
    STAT_KEY_EXISTS:'이미 존재하는 스탯 key입니다. 이전 저장이 성공했는지 목록을 확인해주세요.',STAT_KEY_READONLY:'기존 스탯 key는 변경할 수 없습니다.',
    STAT_CONFLICT:'조회 이후 스탯 정의가 변경되었습니다. 새로고침 후 다시 수정해주세요.'})[e?.message]||characterError(e);
}
