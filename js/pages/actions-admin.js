import { getAuthState } from '../auth.js';
import { actionApi } from '../actions.js';
import { RULE_TYPES, newActionRule, validateAction, actionChanges, actionError } from '../action-admin-model.js';
import { esc, message } from '../ui.js';
let activePage=null;
export function confirmLeaveActionsAdmin(release=true) {
  if(!activePage)return true;
  if(activePage.busy){alert('저장 결과를 확인한 뒤 이동해주세요.');return false;}
  if(activePage.dirty && !confirm('저장하지 않은 행동 변경사항을 버릴까요?'))return false;
  if(release)activePage=null;return true;
}
window.addEventListener('beforeunload',event=>{if(activePage?.dirty||activePage?.busy){event.preventDefault();event.returnValue='';}});
const yesNo=(name,value,yes='활성',no='비활성')=>`<select name="${name}"><option value="true" ${value?'selected':''}>${yes}</option><option value="false" ${!value?'selected':''}>${no}</option></select>`;
const num=(name,value,required=false,min=-2147483648)=>`<input name="${name}" type="number" step="1" min="${min}" max="2147483647" value="${value==null?'':esc(value)}" ${required?'required':''}>`;
const opts=(items,value,empty)=>`<option value="">${empty}</option>`+items.map(x=>`<option value="${esc(x.id)}" ${x.id===value?'selected':''}>${esc(x.name)}</option>`).join('');
export function renderActionsAdmin() {
  activePage=null;const auth=getAuthState();
  if(!auth.loggedIn)return '<section class="shell status-page">'+message('로그인이 필요합니다.','error')+'<a href="#/login">로그인하기</a></section>';
  if(!auth.isAdmin)return '<section class="shell status-page">'+message('관리자 권한이 없습니다.','error')+'</section>';
  return `<section class="character-admin action-admin" data-action-admin><header class="character-admin-heading"><div><small>ACTION LIBRARY</small><h1>행동 관리</h1><p>행동과 기본 효과, 적용 조건을 함께 설정합니다.</p></div></header>
    <div class="character-workspace"><aside class="character-sidebar"><button type="button" class="submit-button skill-new" id="action-new">＋ 새 행동</button>
    <form id="action-search"><label>행동 이름 / 명령어 검색<div class="character-search-row"><input name="search" type="search" maxlength="200" placeholder="청소, /정리"><button type="submit">검색</button></div></label>
      <label>활성 상태<select name="enabled"><option value="">전체</option><option value="true">활성</option><option value="false">비활성</option></select></label></form>
    <div id="action-list" aria-live="polite"></div></aside><div id="action-editor" class="character-detail" aria-live="polite"><h2>행동을 선택하거나 새로 만드세요</h2><p class="character-note">명령어뿐 아니라 컨디션·스탯 변화량과 다이스 조건을 함께 등록할 수 있습니다.</p></div></div></section>`;
}
export function renderActionRule(rule,index,data) {
  const effects=rule.stats||[];
  return `<fieldset class="action-rule" data-rule-index="${index}"><legend>규칙 ${index+1}${rule.id?'':' · 새 규칙'}</legend><div class="character-fields">
    <label>규칙 종류<select name="rule_type">${Object.entries(RULE_TYPES).map(([k,label])=>`<option value="${k}" ${rule.rule_type===k?'selected':''}>${label}</option>`).join('')}</select></label>
    <label>규칙 활성${yesNo('enabled',rule.enabled)}</label>
    <label>규칙 키<input name="rule_key" required maxlength="${rule.id?200:80}" ${rule.id?'readonly':'pattern="[a-z][a-z0-9_]{0,79}"'} value="${esc(rule.rule_key)}"><small>같은 행동에서 중복되지 않는 내부 식별자입니다.</small></label>
    <label>우선순위${num('priority',rule.priority,true)}<small>작은 숫자부터 조회합니다. 조건에 맞는 효과는 모두 합산합니다.</small></label>
    <label>규칙 설명<textarea name="description" rows="2" maxlength="10000">${esc(rule.description||'')}</textarea></label></div>
    <p class="action-rule-help character-note">일반 효과: 조건이 맞을 때만 적용 · 반복 패널티: 지연 스킬 반영 · 필수 조건: 하나라도 미충족이면 행동 불가, 아래 증감은 적용하지 않음.</p>
    <details class="action-rule-conditions" ${rule.use_from!==null||rule.use_to!==null||rule.previous_command_id!==null||rule.condition_min!==null||rule.condition_max!==null||rule.dice_outcome!==null?'open':''}><summary>적용 조건 (빈칸은 제한 없음)</summary><div class="character-fields">
      <label>오늘 이 행동의 사용 순서: 시작${num('use_from',rule.use_from,false,1)}</label><label>오늘 이 행동의 사용 순서: 끝${num('use_to',rule.use_to,false,1)}</label>
      <label>컨디션 최소${num('condition_min',rule.condition_min)}</label><label>컨디션 최대${num('condition_max',rule.condition_max)}</label>
      <label>직전 행동<select name="previous_command_id">${opts(data.commands,rule.previous_command_id,'관계없음')}</select></label>
      <label>다이스 결과<select name="dice_outcome"><option value="">관계없음</option><option value="success" ${rule.dice_outcome==='success'?'selected':''}>성공</option><option value="fail" ${rule.dice_outcome==='fail'?'selected':''}>실패</option></select></label>
    </div><p class="character-note">순서는 오늘 행동횟수를 차감한 동일 행동 기록 기준입니다. 컨디션은 행동 전 값입니다. 일반 효과 조건이 불일치하면 행동을 막지 않고 해당 효과만 건너뜁니다.</p></details>
    ${rule.has_preserved_settings?'<p class="skill-warning">이 규칙에는 이 화면에서 편집하지 않는 추가 설정이 있습니다. 해당 설정은 그대로 보존됩니다.</p>':''}
    ${rule.rule_type==='requirement'?(rule.id&&(rule.condition_delta!==0||effects.length)?'<p class="skill-warning">기존 규칙에 실행 시 사용되지 않는 효과 값이 있습니다. 이 화면에서는 수정하거나 삭제하지 않고 보존합니다.</p>':''):`<div class="action-rule-effects"><h3>기본 변화량</h3><p class="character-note">증가는 양수, 감소는 음수. 이 기본값에 보유 스킬 효과가 적용됩니다.</p>
      <label>컨디션 변화${num('condition_delta',rule.condition_delta,true)}</label>
      <div class="character-stat-grid">${data.stats.map(s=>{const effect=effects.find(e=>e.stat_id===s.id);return `<label>${esc(s.name)}${s.enabled?'':' (정의 비활성)'}<input data-action-stat="${esc(s.id)}" type="number" step="1" min="-2147483648" max="2147483647" value="${effect?esc(effect.delta):''}" placeholder="미설정"><small>${effect?.id?'기존 효과를 끄려면 0 또는 규칙 비활성':'빈칸이면 효과 행을 생성하지 않습니다.'}</small></label>`;}).join('')||'<p class="character-note">등록된 스탯 정의가 없습니다.</p>'}</div>
    </div>`}${rule.id?'<p class="character-note">기존 규칙은 삭제하지 않습니다. 사용하지 않으려면 규칙을 비활성화하세요.</p>':`<button type="button" data-remove-rule="${index}">이 새 규칙 취소</button>`}</fieldset>`;
}
export function renderActionEditor(data,rows=data.rules) {
  const c=data.command;
  return `<header class="character-detail-heading"><div><small>${c.id?'SHARED ACTION':'NEW ACTION'}</small><h2>${c.id?esc(c.display_name||c.command):'새 행동'}</h2><p>모든 캐릭터가 사용하는 공통 행동 정의입니다.</p></div><button type="button" id="action-reload">${c.id?'새로고침':'입력 초기화'}</button></header>
    <form id="action-edit"><fieldset><legend>행동 기본 정보</legend><div class="character-fields">
      <label>명령어<input name="command" required maxlength="81" value="${esc(c.command)}" ${c.id?'readonly':''} placeholder="예: /청소"><small>기존 명령어는 조회 전용입니다. 이름과 효과는 수정할 수 있습니다.</small></label>
      <label>행동 이름<input name="display_name" required maxlength="200" value="${esc(c.display_name||c.command.replace(/^\//,''))}" placeholder="예: 청소"></label>
      <label>활성 상태${yesNo('enabled',c.enabled)}</label><label>행동횟수 차감${yesNo('consumes_action',c.consumes_action,'1회 차감','차감하지 않음')}</label>
      <label>숨김 행동${yesNo('hidden',c.hidden,'예','아니오')}<small>현재 봇의 숨김 행동 발견 기록 기능에 사용됩니다.</small></label>
      <label>설명<textarea name="description" rows="3" maxlength="10000">${esc(c.description||'')}</textarea></label>
    </div></fieldset><fieldset><legend>다이스</legend><label>다이스 사용${yesNo('dice_enabled',c.dice_enabled,'사용','사용하지 않음')}</label>
      <div class="character-fields action-dice-fields" ${c.dice_enabled?'':'hidden'}><label>최소값${num('dice_min',c.dice_min,true)}</label><label>최대값${num('dice_max',c.dice_max,true)}</label><label>성공 기준${num('dice_threshold',c.dice_threshold)}<small>이상일 때 성공. 빈칸이면 성공·실패를 판정하지 않습니다.</small></label></div></fieldset>
    <details class="action-replies"><summary>성공·실패 답글 (선택)</summary><div class="character-fields"><label>성공 답글<textarea name="success_message" rows="3" maxlength="10000" placeholder="빈칸이면 봇 기본 답글">${esc(c.success_message||'')}</textarea></label><label>실패 답글<textarea name="fail_message" rows="3" maxlength="10000" placeholder="빈칸이면 봇 기본 답글">${esc(c.fail_message||'')}</textarea></label></div><p class="character-note">사용 가능: {display_name}, {result}, {dice_result}. 다이스 숫자와 성공·실패 표시는 봇이 답글 앞에 붙입니다.</p></details>
    <h3>행동 규칙과 스탯 효과</h3><p class="character-note">예: 일반 효과에 컨디션 -5, 원하는 스탯 +2. 스탯 항목은 현재 정의에서 자동으로 불러옵니다. 여러 규칙이 일치하면 효과가 합산됩니다.</p>
    <p class="skill-warning">스탯 효과를 추가했다면 행동할 캐릭터에 해당 스탯 행이 있는지도 확인해주세요. 없는 캐릭터의 수치는 이 화면에서 자동 생성하지 않습니다.</p>
    <div id="action-rules">${rows.map((r,i)=>renderActionRule(r,i,data)).join('')}</div><button type="button" id="action-add-rule">＋ 규칙 추가</button>
    <section class="character-review"><h3>저장 전 변경사항</h3><div id="action-preview"><p>아직 변경한 항목이 없습니다.</p></div></section>
    <label class="character-pause"><input id="action-bot-paused" type="checkbox">봇 실행을 일시 중지했습니다. (자동 중지 기능이 아닙니다.)</label>
    <div class="character-actions"><button type="submit" class="submit-button">${c.id?'변경사항 저장':'행동 등록'}</button><button type="button" id="action-cancel">취소</button></div><div id="action-message" role="status"></div></form>`;
}
export function bindActionsAdmin(params) {
  const root=document.querySelector('[data-action-admin]');if(!root)return;
  const page={dirty:false,busy:false,data:null,rows:[],selected:null,search:'',enabled:null,offset:0,version:0,listVersion:0,user:getAuthState().user?.id};activePage=page;
  const live=()=>root.isConnected&&activePage===page&&getAuthState().isAdmin&&getAuthState().user?.id===page.user;
  const editor=root.querySelector('#action-editor'),list=root.querySelector('#action-list');
  const canDiscard=()=>!page.busy&&(!page.dirty||confirm('저장하지 않은 행동 변경사항을 취소할까요?'));
  const say=(text,type='error')=>{const box=root.querySelector('#action-message');if(box)box.innerHTML=message(text,type);};
  function readDraft() {
    const form=root.querySelector('#action-edit');
    // Query only direct basic fields; repeated rule field names must not shadow them.
    const basic={};for(const name of ['command','display_name','description','enabled','hidden','consumes_action','dice_enabled','dice_min','dice_max','dice_threshold','success_message','fail_message'])basic[name]=form.querySelector(`[name="${name}"]`).value;
    for(const key of ['enabled','hidden','consumes_action','dice_enabled'])basic[key]=basic[key]==='true';
    for(const key of ['success_message','fail_message'])basic[key]=basic[key]===''?null:basic[key];
    const rules=[...root.querySelectorAll('[data-rule-index]')].map(card=>{
      const original=page.rows[Number(card.dataset.ruleIndex)],value=name=>card.querySelector(`[name="${name}"]`).value;
      const r={id:original.id,rule_key:value('rule_key'),description:value('description'),enabled:value('enabled')==='true',priority:value('priority'),rule_type:value('rule_type'),
        use_from:value('use_from'),use_to:value('use_to'),previous_command_id:value('previous_command_id')||null,condition_min:value('condition_min'),condition_max:value('condition_max'),dice_outcome:value('dice_outcome')||null,
        condition_delta:card.querySelector('[name="condition_delta"]')?.value??original.condition_delta,stats:card.querySelector('.action-rule-effects')?[]:structuredClone(original.stats)};
      card.querySelectorAll('[data-action-stat]').forEach(input=>{
        const existing=original.stats.find(e=>e.stat_id===input.dataset.actionStat);
        if(input.value.trim()===''){if(existing?.id)throw new Error('EFFECT_REMOVAL_NOT_ALLOWED');return;}
        r.stats.push({id:existing?.id||null,stat_id:input.dataset.actionStat,delta:input.value});
      });return r;
    });return {command:basic,rules};
  }
  function review() {
    try {const d=validateAction(readDraft(),page.data),changes=actionChanges(page.data,d);page.dirty=changes.length>0;
      root.querySelector('#action-preview').innerHTML=changes.length?'<ul>'+changes.map(r=>`<li><span>${esc(r.label)}</span><strong>${esc(r.before)} → ${esc(r.after)}</strong></li>`).join('')+'</ul>':'<p>변경한 항목이 없습니다.</p>';
    }catch(error){page.dirty=true;root.querySelector('#action-preview').innerHTML=message(actionError(error),'error');}
  }
  function syncRows(){try{page.rows=readDraft().rules.map((r,i)=>({...r,has_preserved_settings:page.rows[i].has_preserved_settings}));return true;}catch(error){say(actionError(error));return false;}}
  function bindRules(){
    root.querySelectorAll('[data-remove-rule]').forEach(b=>b.addEventListener('click',()=>{if(page.busy||!syncRows())return;page.rows.splice(Number(b.dataset.removeRule),1);redrawRules();review();}));
    root.querySelectorAll('[data-rule-index] [name="rule_type"]').forEach(select=>select.addEventListener('change',()=>{if(page.busy||!syncRows())return;redrawRules();review();}));
  }
  function redrawRules(){root.querySelector('#action-rules').innerHTML=page.rows.map((r,i)=>renderActionRule(r,i,page.data)).join('');bindRules();}
  function show(data){page.data=data;page.selected=data.command.id;page.rows=structuredClone(data.rules);if(!page.selected&&!page.rows.length)page.rows=[newActionRule()];page.dirty=false;
    editor.innerHTML=renderActionEditor(data,page.rows);bindRules();
    const form=root.querySelector('#action-edit');form.addEventListener('input',review);form.addEventListener('change',review);form.addEventListener('submit',save);
    const dice=root.querySelector('[name="dice_enabled"]'),diceFields=root.querySelector('.action-dice-fields');
    const toggleDice=()=>{diceFields.hidden=dice.value!=='true';diceFields.querySelectorAll('input').forEach(input=>input.disabled=dice.value!=='true');};dice.addEventListener('change',toggleDice);toggleDice();
    root.querySelector('#action-add-rule').addEventListener('click',()=>{if(page.busy||!syncRows())return;if(page.rows.length>=100){say(actionError({message:'TOO_MANY_RULES'}));return;}page.rows.push(newActionRule(page.rows));redrawRules();review();});
    root.querySelector('#action-reload').addEventListener('click',()=>select(page.selected));root.querySelector('#action-cancel').addEventListener('click',()=>{if(canDiscard())show(page.data);});
    history.replaceState(null,'',page.selected?'#/admin/actions?id='+encodeURIComponent(page.selected):'#/admin/actions?new=1');
  }
  async function save(event){event.preventDefault();if(page.busy||!live())return;let d,changes;
    try{d=validateAction(readDraft(),page.data);changes=actionChanges(page.data,d);}catch(error){say(actionError(error));return;}
    if(page.selected&&!changes.length){say('변경한 항목이 없습니다.','');return;}
    if(!root.querySelector('#action-bot-paused').checked){say(actionError({message:'BOT_PAUSE_REQUIRED'}));return;}
    const empty=!d.rules.some(r=>r.enabled&&r.rule_type!=='requirement')?'\n활성 기본 효과가 없습니다.':'';
    if(!confirm(changes.map(r=>r.label+': '+r.before+' → '+r.after).join('\n')+'\n\n모든 캐릭터에게 적용되는 행동 정의를 저장합니다.'+empty+'\n저장할까요?'))return;
    page.busy=true;const controls=[...editor.querySelectorAll('input,select,textarea,button')].map(c=>[c,c.disabled]);controls.forEach(([c])=>c.disabled=true);say('저장 중…','');
    try{const data=await actionApi.save(page.selected,page.data.revision,d,true);if(!live())return;show(data);say('행동과 규칙을 저장했습니다. 스킬 관리의 대상 명령에서도 선택할 수 있습니다.','success');loadList();}
    catch(error){if(live())say(actionError(error));}finally{page.busy=false;if(live())controls.forEach(([c,disabled])=>{if(c.isConnected)c.disabled=disabled;});}
  }
  async function select(id){if(!live()||!canDiscard())return;const version=++page.version;page.dirty=false;editor.innerHTML='<p class="character-empty">행동을 불러오는 중…</p>';
    try{const data=await actionApi.detail(id);if(!live()||version!==page.version)return;show(data);list.querySelectorAll('[data-action-id]').forEach(b=>b.classList.toggle('selected',b.dataset.actionId===page.selected));}
    catch(error){if(live()&&version===page.version){editor.innerHTML=message(actionError(error),'error')+'<button type="button" id="action-retry">다시 시도</button>';editor.querySelector('#action-retry').addEventListener('click',()=>select(id));}}
  }
  async function loadList(){const version=++page.listVersion;list.innerHTML='<p class="character-empty">목록을 불러오는 중…</p>';
    try{const data=await actionApi.list(page);if(!live()||version!==page.listVersion)return;
      list.innerHTML=`<p class="character-list-count">검색 결과 ${data.total}개</p>`+data.items.map(c=>`<button type="button" class="character-list-item ${page.selected===c.id?'selected':''}" data-action-id="${esc(c.id)}"><span><strong>${esc(c.display_name||c.command)}</strong><small class="skill-key">${esc(c.command)}</small></span><span class="character-badge ${c.enabled?'':'muted'}">${c.enabled?'활성':'비활성'}</span></button>`).join('')+
        (!data.items.length?'<p class="character-empty">검색 결과가 없습니다. 새 행동을 추가해보세요.</p>':'')+`<div class="character-pagination"><button type="button" data-action-page="-1" ${page.offset===0?'disabled':''}>이전</button><span>${Math.floor(page.offset/25)+1} / ${Math.max(1,Math.ceil(data.total/25))}</span><button type="button" data-action-page="1" ${page.offset+25>=data.total?'disabled':''}>다음</button></div>`;
      list.querySelectorAll('[data-action-id]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.actionId)));list.querySelectorAll('[data-action-page]').forEach(b=>b.addEventListener('click',()=>{if(page.busy)return;page.offset+=Number(b.dataset.actionPage)*25;loadList();}));
    }catch(error){if(live()&&version===page.listVersion)list.innerHTML=message(actionError(error),'error');}
  }
  root.querySelector('#action-new').addEventListener('click',()=>select(null));const searchForm=root.querySelector('#action-search');
  const search=event=>{event.preventDefault();if(page.busy)return;const f=new FormData(searchForm);page.search=String(f.get('search')).trim();page.enabled=f.get('enabled')===''?null:f.get('enabled')==='true';page.offset=0;loadList();};
  searchForm.addEventListener('submit',search);searchForm.querySelector('select').addEventListener('change',search);loadList();if(params.has('id'))select(params.get('id'));else if(params.has('new'))select(null);
}
