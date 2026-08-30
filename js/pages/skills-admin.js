import { getAuthState } from '../auth.js';
import { skillApi } from '../skills.js';
import { EFFECTS, isProtectedModifier, modifierInputs, newModifier, validateSkill, skillChanges, skillError } from '../skill-admin-model.js';
import { renderCommandDialog, bindCommandDialog } from '../skill-command-dialog.js';
import { mergeTargetCommands } from '../skill-command-model.js';
import { esc, message } from '../ui.js';

let activePage=null;
export function confirmLeaveSkillsAdmin(release=true) {
  if(!activePage) return true;
  if(activePage.busy) { alert('저장 결과를 확인한 뒤 이동해주세요.'); return false; }
  if((activePage.dirty || activePage.commandDirty) && !confirm('저장하지 않은 스킬 변경사항과 입력 중인 명령 등록을 취소할까요? 이미 등록된 명령은 남습니다.')) return false;
  if(release) activePage=null;
  return true;
}
window.addEventListener('beforeunload',event=>{
  if(!activePage?.dirty && !activePage?.busy && !activePage?.commandDirty) return;
  event.preventDefault(); event.returnValue='';
});
export function renderSkillsAdmin() {
  activePage=null;
  const auth=getAuthState();
  if(!auth.loggedIn) return '<section class="shell status-page">'+message('로그인이 필요합니다.','error')+'<a href="#/login">로그인하기</a></section>';
  if(!auth.isAdmin) return '<section class="shell status-page">'+message('관리자 권한이 없습니다.','error')+'</section>';
  return `<section class="character-admin skill-admin" data-skill-admin>
    <header class="character-admin-heading"><div><small>SKILL LIBRARY</small><h1>스킬 관리</h1><p>공유 스킬을 만들고 효과·적용 조건을 설정합니다.</p></div><div class="admin-page-links"><a href="#/admin/stats">스탯 정의 관리 →</a><a href="#/admin/actions">행동 관리 →</a><a href="#/admin/characters">캐릭터 관리 →</a></div></header>
    <div class="character-workspace"><aside class="character-sidebar">
      <button type="button" class="submit-button skill-new" id="skill-new">＋ 새 스킬</button>
      <form id="skill-search"><label>스킬 이름 / 키 검색<div class="character-search-row"><input type="search" name="search" maxlength="200" placeholder="요령, nunchi"><button type="submit">검색</button></div></label>
      <label>활성 상태<select name="enabled"><option value="">전체</option><option value="true">활성</option><option value="false">비활성</option></select></label></form>
      <div id="skill-list" aria-live="polite"></div></aside>
      <div class="character-detail" id="skill-editor" aria-live="polite"><h2>새 스킬을 등록해보세요</h2><p class="character-note">왼쪽의 ‘새 스킬’을 누르거나 기존 스킬을 선택하세요. 만든 스킬은 캐릭터 관리에서 부여할 수 있습니다.</p></div>
    </div></section>`;
}
function options(rows,value,empty) {
  return `<option value="">${esc(empty)}</option>`+rows.map(row=>`<option value="${esc(row.id)}" ${row.id===value?'selected':''}>${esc(row.name)}</option>`).join('');
}
export function renderModifier(row,index,data) {
  if(isProtectedModifier(row)) return '';
  const known=Object.hasOwn(EFFECTS,row.modifier_type);
  const inputs=modifierInputs(row.modifier_type);
  return `<fieldset class="skill-modifier" data-modifier-index="${index}"><legend>효과 ${index+1}${row.id?' · 기존 효과':' · 새 효과'}</legend>
    <div class="character-fields">
      <label>효과 종류<select name="modifier_type">${!known?`<option value="${esc(row.modifier_type)}">지원되지 않는 기존 효과</option>`:''}${Object.entries(EFFECTS).map(([key,value])=>`<option value="${key}" ${key===row.modifier_type?'selected':''}>${value[0]}</option>`).join('')}</select></label>
      <label>효과 활성<select name="enabled"><option value="true" ${row.enabled?'selected':''}>활성</option><option value="false" ${!row.enabled?'selected':''}>비활성</option></select></label>
      ${inputs.value?`<label>수치 / 배율<input name="value" type="number" step="any" min="-2147483647" max="2147483647" value="${row.value===null?'':esc(row.value)}"><small>증감은 ±값, 배율은 0.8처럼 입력. 재굴림은 실패 시 추가로 굴리는 최대 횟수입니다.</small></label>`:''}
      <label>적용 우선순위<input name="priority" type="number" step="1" min="-2147483648" max="2147483647" required value="${esc(row.priority)}"><small>작은 숫자가 먼저입니다. 같은 숫자는 봇의 효과 ID 순서를 따릅니다.</small></label>
      <div class="skill-command-target"><label>대상 명령<select name="target_command_id">${options(data.commands,row.target_command_id,'모든 명령')}</select></label>
        <div class="skill-command-tools"><button type="button" data-new-target-command="${index}">＋ 명령 등록</button><button type="button" data-refresh-target-commands>목록 새로고침</button></div><small class="character-note"><a href="#/admin/actions${row.target_command_id?'?id='+encodeURIComponent(row.target_command_id):'?new=1'}">행동 기본 효과·조건 설정 →</a></small></div>
      ${inputs.stat?`<label>대상 스탯<select name="target_stat_id">${options(data.stats,row.target_stat_id,'모든 스탯')}</select></label>`:''}
      <label>사용 제한 기간<select name="period"><option value="" ${row.period===null?'selected':''}>누적 (기간 미지정)</option><option value="always" ${row.period==='always'?'selected':''}>누적</option><option value="day" ${row.period==='day'?'selected':''}>일일</option><option value="week" ${row.period==='week'?'selected':''}>주간</option></select><small>Asia/Seoul 기준. 주간은 월요일부터입니다.</small></label>
      <label>기간 내 최대 사용횟수<input name="max_uses" type="number" step="1" min="0" max="2147483647" value="${row.max_uses===null?'':esc(row.max_uses)}" placeholder="빈칸 = 제한 없음"><small>효과별 제한입니다. 0이면 사용할 수 없고, 빈칸이면 횟수 제한이 없습니다.</small></label>
    </div><p class="character-note skill-effect-help">${esc(EFFECTS[row.modifier_type]?.[1] || '봇이 지원하는 효과 종류를 선택해주세요.')}</p>
    ${row.params && Object.keys(row.params).length ? '<p class="character-note">기존 추가 설정(params)은 보존합니다. 현재 봇은 이 값을 사용자 정의 조건으로 실행하지 않습니다.</p>':''}
    ${row.id?'<p class="character-note">기존 효과는 삭제하지 않습니다. 사용하지 않으려면 효과 활성을 ‘비활성’으로 바꾸세요. 수정해도 사용 기록은 초기화되지 않습니다.</p>':`<button type="button" data-remove-modifier="${index}">이 새 효과 취소</button>`}
  </fieldset>`;
}
export function renderSkillEditor(data) {
  const s=data.skill;
  const editable=data.modifiers.filter(m=>!isProtectedModifier(m));
  const protectedCount=data.modifiers.length-editable.length;
  return `<header class="character-detail-heading"><div><small>${s.id?'SHARED SKILL':'NEW SKILL'}</small><h2>${s.id?esc(s.name):'새 스킬'}</h2><p>${s.id?`현재 ${esc(data.holders)}명에게 부여된 공유 스킬입니다.`:'등록 후 캐릭터 관리에서 부여할 수 있습니다.'}</p></div><button type="button" id="skill-reload">${s.id?'새로고침':'입력 초기화'}</button></header>
    <p class="skill-warning">기존 정의를 수정하면 이 스킬을 보유한 모든 캐릭터에게 반영됩니다. 스킬·효과를 비활성화해도 보유 관계나 사용 기록은 삭제하지 않습니다.</p>
    <form id="skill-edit"><fieldset><legend>스킬 정의</legend><div class="character-fields">
      <label>스킬 이름<input name="name" required maxlength="200" value="${esc(s.name)}" placeholder="예: 눈치"></label>
      <label>스킬 키<input name="skill_key" required maxlength="${s.id?200:80}" ${s.id?'readonly':'pattern="[a-z][a-z0-9_]{0,79}"'} value="${esc(s.skill_key)}" placeholder="예: nunchi"><small>내부 식별용 영문 소문자·숫자·밑줄. 저장 후에는 변경하지 않습니다.</small></label>
      <label>활성 상태<select name="enabled"><option value="true" ${s.enabled?'selected':''}>활성</option><option value="false" ${!s.enabled?'selected':''}>비활성</option></select><small>비활성 스킬은 부여 후보에서 제외되고 봇 효과도 적용되지 않습니다.</small></label>
      <label>설명<textarea name="description" rows="4" maxlength="10000" placeholder="예: 다이스 실패 시 하루 1회 재굴림">${esc(s.description||'')}</textarea></label>
    </div></fieldset>
    <h3>효과와 적용 조건</h3><p class="character-note">명령·스탯 대상과 사용 한도만 설정합니다. ‘컨디션이 특정 값 이상’ 같은 임의 조건은 현재 스킬 엔진에서 지원하지 않습니다. 발동 상황(실패·감소 등)은 효과 종류에 따릅니다.</p>
    ${protectedCount?`<p class="skill-warning">이 화면의 편집 범위 밖인 기존 효과 ${protectedCount}개는 그대로 보존합니다. 공유 스킬 전체를 비활성화하면 이 효과들도 적용되지 않습니다.</p>`:''}
    <div id="skill-modifiers">${editable.map((m,i)=>renderModifier(m,i,data)).join('') || '<p class="character-empty">편집 가능한 효과가 없습니다. 효과를 추가해주세요.</p>'}</div>
    <button type="button" id="skill-add-modifier">＋ 효과 추가</button>
    <section class="character-review"><h3>저장 전 변경사항</h3><div id="skill-preview"><p>아직 변경한 항목이 없습니다.</p></div></section>
    <label class="character-pause"><input id="skill-bot-paused" type="checkbox">봇 실행을 일시 중지했습니다. (자동 중지 기능이 아닙니다.)</label>
    <div class="character-actions"><button type="submit" class="submit-button">${s.id?'변경사항 저장':'스킬 등록'}</button><button type="button" id="skill-cancel">취소</button></div>
    <div id="skill-message" role="status"></div></form>${renderCommandDialog()}`;
}

export function bindSkillsAdmin(params) {
  const root=document.querySelector('[data-skill-admin]'); if(!root) return;
  const page={dirty:false,commandDirty:false,busy:false,data:null,rows:[],selected:null,offset:0,search:'',enabled:null,listVersion:0,version:0,user:getAuthState().user?.id};
  activePage=page;
  const live=()=>root.isConnected && activePage===page && getAuthState().isAdmin && getAuthState().user?.id===page.user;
  const editor=root.querySelector('#skill-editor'),listBox=root.querySelector('#skill-list');
  const canDiscard=()=>!page.busy && (!(page.dirty || page.commandDirty) || confirm('저장하지 않은 변경사항을 취소할까요?'));
  let openCommandDialog=()=>{};
  const say=(text,type='error')=>{const box=root.querySelector('#skill-message'); if(box) box.innerHTML=message(text,type);};
  function readDraft() {
    const form=root.querySelector('#skill-edit');
    const basic=new FormData(form);
    const modifiers=[...root.querySelectorAll('[data-modifier-index]')].map(card=>{
      const get=name=>card.querySelector(`[name="${name}"]`).value;
      const number=name=>get(name).trim()===''?null:Number(get(name));
      const original=page.rows[Number(card.dataset.modifierIndex)],type=get('modifier_type'),inputs=modifierInputs(type);
      return {id:original.id,modifier_type:type,enabled:get('enabled')==='true',
        value:inputs.value?(card.querySelector('[name="value"]')?number('value'):original.value):original.value,
        priority:get('priority'),target_command_id:get('target_command_id')||null,
        target_stat_id:inputs.stat?(card.querySelector('[name="target_stat_id"]')?.value||null):null,
        period:get('period')||null,max_uses:get('max_uses')===''?null:get('max_uses')};
    });
    return {name:String(basic.get('name')),skill_key:String(basic.get('skill_key')),description:String(basic.get('description')),enabled:basic.get('enabled')==='true',modifiers};
  }
  function review() {
    try {
      const draft=validateSkill(readDraft(),page.selected!==null);
      const rows=skillChanges(page.data,draft);
      page.dirty=rows.length>0;
      root.querySelector('#skill-preview').innerHTML=rows.length?'<ul>'+rows.map(r=>`<li><span>${esc(r.label)}</span><strong>${esc(r.before)} → ${esc(r.after)}</strong></li>`).join('')+'</ul>':'<p>변경한 항목이 없습니다.</p>';
    } catch(error) { page.dirty=true; root.querySelector('#skill-preview').innerHTML=message(skillError(error),'error'); }
  }
  function syncRows() { page.rows=readDraft().modifiers.map((m,i)=>({...m,params:page.rows[i].params})); }
  function updateTargetOptions(commands,selectedId=null,targetIndex=null) {
    // Only the option lists change. Keep all unsaved fields and the original revision.
    page.data.commands=commands;
    root.querySelectorAll('[data-modifier-index]').forEach(card=>{
      const select=card.querySelector('[name="target_command_id"]');
      const target=Number(card.dataset.modifierIndex)===targetIndex?selectedId:select.value;
      const available=target && !commands.some(c=>c.id===target)
        ? [...commands,{id:target,name:'삭제되었거나 확인이 필요한 대상 (#'+target+')'}]:commands;
      select.innerHTML=options(available,target,'모든 명령');select.value=target || '';
    });
    review();
  }
  async function refreshTargets() {
    if(page.busy || !live())return;
    page.busy=true;say('대상 명령 목록을 갱신하는 중…','');
    try {
      const data=await skillApi.detail(null);
      if(live()) {updateTargetOptions(data.commands);say('대상 명령 목록을 갱신했습니다. 스킬 편집 내용은 유지됩니다.','success');}
    } catch(error) {if(live())say(skillError(error));}
    finally {page.busy=false;}
  }
  function bindModifiers() {
    root.querySelectorAll('[data-modifier-index]').forEach(card=>{
      card.querySelector('[name="modifier_type"]').addEventListener('change',event=>{
        const type=event.target.value,index=Number(card.dataset.modifierIndex);
        syncRows();
        if(page.rows[index].id===null && EFFECTS[type]) page.rows[index].value=EFFECTS[type][2];
        redrawModifiers();
        review();
      });
    });
    root.querySelectorAll('[data-remove-modifier]').forEach(button=>button.addEventListener('click',()=>{
      if(page.busy) return;
      syncRows(); page.rows.splice(Number(button.dataset.removeModifier),1); redrawModifiers(); review();
    }));
    root.querySelectorAll('[data-new-target-command]').forEach(button=>button.addEventListener('click',()=>{
      const card=button.closest('[data-modifier-index]');
      openCommandDialog(Number(button.dataset.newTargetCommand),card.querySelector('[name="modifier_type"]').value);
    }));
    root.querySelectorAll('[data-refresh-target-commands]').forEach(button=>button.addEventListener('click',refreshTargets));
  }
  function redrawModifiers() { root.querySelector('#skill-modifiers').innerHTML=page.rows.map((m,i)=>renderModifier(m,i,page.data)).join(''); bindModifiers(); }
  function show(data) {
    page.data=data; page.selected=data.skill.id; page.rows=structuredClone(data.modifiers.filter(m=>!isProtectedModifier(m))); page.dirty=false;page.commandDirty=false;
    editor.innerHTML=renderSkillEditor(data);
    openCommandDialog=bindCommandDialog({root,page,live,createCommand:skillApi.createTargetCommand,onCreated:(command,index)=>{
      updateTargetOptions(mergeTargetCommands(page.data.commands,[command]),command.id,index);
      say(`${command.name} 명령을 등록하고 대상으로 선택했습니다.${command.enabled?'':' 명령이 비활성이므로 봇에서는 아직 실행되지 않습니다.'} 스킬 변경사항도 저장해주세요.`,'success');
    }});
    bindModifiers();
    const form=root.querySelector('#skill-edit'); form.addEventListener('input',review); form.addEventListener('change',review);
    root.querySelector('#skill-add-modifier').addEventListener('click',()=>{
      if(page.busy) return;
      if(page.rows.length>=100) {say(skillError({message:'TOO_MANY_MODIFIERS'}));return;}
      syncRows(); page.rows.push(newModifier()); redrawModifiers(); review();
    });
    root.querySelector('#skill-reload').addEventListener('click',()=>select(page.selected));
    root.querySelector('#skill-cancel').addEventListener('click',()=>{if(canDiscard()) show(page.data);});
    form.addEventListener('submit',save);
    history.replaceState(null,'',page.selected?'#/admin/skills?id='+encodeURIComponent(page.selected):'#/admin/skills?new=1');
  }
  async function save(event) {
    event.preventDefault(); if(page.busy || !live()) return;
    let draft,changes;
    try {draft=validateSkill(readDraft(),page.selected!==null);changes=skillChanges(page.data,draft);} catch(error) {say(skillError(error));return;}
    if(page.selected && !changes.length) {say('변경한 항목이 없습니다.','');return;}
    if(!root.querySelector('#skill-bot-paused').checked) {say(skillError({message:'BOT_PAUSE_REQUIRED'}));return;}
    const noEffects=![...draft.modifiers,...page.data.modifiers.filter(isProtectedModifier)].some(m=>m.enabled)?'\n활성 효과가 없어 현재 봇 행동에는 영향을 주지 않습니다.':'';
    if(!confirm(changes.map(r=>r.label+': '+r.before+' → '+r.after).join('\n')+'\n\n기존 스킬 변경은 모든 보유 캐릭터에게 반영됩니다.'+noEffects+'\n저장할까요?')) return;
    page.busy=true;
    const controls=[...editor.querySelectorAll('input,select,textarea,button')].map(c=>[c,c.disabled]);controls.forEach(([c])=>c.disabled=true);
    say('저장 중…','');
    try {
      const data=await skillApi.save(page.selected,page.data.revision,draft,true);
      if(!live()) return;
      show(data); say('저장했습니다. 캐릭터 관리 → 스킬 부여에서 선택할 수 있습니다.','success');loadList();
    } catch(error) {if(live()) say(skillError(error));}
    finally {page.busy=false;if(live()) controls.forEach(([c,disabled])=>{if(c.isConnected)c.disabled=disabled;});}
  }
  async function select(id) {
    if(!live() || !canDiscard()) return;
    const version=++page.version; page.dirty=false;
    editor.innerHTML='<p class="character-empty">스킬 정보를 불러오는 중…</p>';
    try {
      const data=await skillApi.detail(id);
      if(!live() || version!==page.version) return;
      show(data);listBox.querySelectorAll('[data-skill-id]').forEach(b=>b.classList.toggle('selected',b.dataset.skillId===page.selected));
    } catch(error) {if(live() && version===page.version) {editor.innerHTML=message(skillError(error),'error')+'<button type="button" id="skill-retry">다시 시도</button>';editor.querySelector('#skill-retry').addEventListener('click',()=>select(id));}}
  }
  async function loadList() {
    const version=++page.listVersion;listBox.innerHTML='<p class="character-empty">목록을 불러오는 중…</p>';
    try {
      const data=await skillApi.list(page); if(!live() || version!==page.listVersion)return;
      listBox.innerHTML=`<p class="character-list-count">검색 결과 ${data.total}개</p>`+data.items.map(s=>`<button type="button" data-skill-id="${esc(s.id)}" class="character-list-item ${s.id===page.selected?'selected':''}"><span><strong>${esc(s.name)}</strong><small class="skill-key">${esc(s.skill_key)}</small></span><span class="character-badge ${s.enabled?'':'muted'}">${s.enabled?'활성':'비활성'}</span></button>`).join('')+
        (!data.items.length?'<p class="character-empty">검색 결과가 없습니다. ‘새 스킬’로 등록할 수 있습니다.</p>':'')+
        `<div class="character-pagination"><button type="button" data-page="-1" ${page.offset===0?'disabled':''}>이전</button><span>${Math.floor(page.offset/25)+1} / ${Math.max(1,Math.ceil(data.total/25))}</span><button type="button" data-page="1" ${page.offset+25>=data.total?'disabled':''}>다음</button></div>`;
      listBox.querySelectorAll('[data-skill-id]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.skillId)));
      listBox.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>{if(page.busy)return;page.offset+=Number(b.dataset.page)*25;loadList();}));
    } catch(error) {if(live() && version===page.listVersion)listBox.innerHTML=message(skillError(error),'error');}
  }
  root.querySelector('#skill-new').addEventListener('click',()=>select(null));
  const searchForm=root.querySelector('#skill-search');
  const search=event=>{event.preventDefault();if(page.busy)return;const f=new FormData(searchForm);page.search=String(f.get('search')).trim();page.enabled=f.get('enabled')===''?null:f.get('enabled')==='true';page.offset=0;loadList();};
  searchForm.addEventListener('submit',search); searchForm.querySelector('select').addEventListener('change',search);
  loadList(); if(params.has('id')) select(params.get('id')); else if(params.has('new')) select(null);
}
