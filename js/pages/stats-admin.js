import { getAuthState } from '../auth.js';
import { statApi } from '../stats.js';
import { validateStat, statChanges, statError } from '../stat-admin-model.js';
import { esc, message } from '../ui.js';
let activePage=null;
export function confirmLeaveStatsAdmin(release=true) {
  if(!activePage)return true;
  if(activePage.busy){alert('저장 결과를 확인한 뒤 이동해주세요.');return false;}
  if(activePage.dirty&&!confirm('저장하지 않은 스탯 정의 변경을 취소할까요?'))return false;
  if(release)activePage=null;return true;
}
window.addEventListener('beforeunload',event=>{if(activePage?.dirty||activePage?.busy){event.preventDefault();event.returnValue='';}});
export function renderStatsAdmin() {
  activePage=null;const auth=getAuthState();
  if(!auth.loggedIn)return '<section class="shell status-page">'+message('로그인이 필요합니다.','error')+'<a href="#/login">로그인하기</a></section>';
  if(!auth.isAdmin)return '<section class="shell status-page">'+message('관리자 권한이 없습니다.','error')+'</section>';
  return `<section class="character-admin stat-admin" data-stat-admin>
    <header class="character-admin-heading"><div><small>STAT DEFINITIONS</small><h1>스탯 정의 관리</h1><p>캐릭터의 현재 수치가 아닌, 공통 스탯 종류를 관리합니다.</p></div>
      </header>
    <div class="character-workspace"><aside class="character-sidebar"><button type="button" class="submit-button skill-new" id="stat-new">＋ 새 스탯</button>
      <form id="stat-search"><label>표시 이름 / 내부 key<div class="character-search-row"><input name="search" type="search" maxlength="200" placeholder="이름 또는 key"><button type="submit">검색</button></div></label>
      <label>활성 상태<select name="enabled"><option value="">전체</option><option value="true">활성</option><option value="false">비활성</option></select></label></form>
      <div id="stat-list" aria-live="polite"></div></aside><div id="stat-editor" class="character-detail" aria-live="polite"><h2>스탯을 선택하거나 새로 만드세요</h2><p class="character-note">스탯 정의만 저장합니다. 캐릭터별 수치는 캐릭터 관리에서 수정해주세요.</p></div></div></section>`;
}
export function renderStatList(data,offset=0,selected=null) {
  return `<p class="character-list-count">검색 결과 ${data.total}개</p>`+data.items.map(s=>`<button type="button" data-stat-id="${esc(s.id)}" class="character-list-item stat-list-item ${s.id===selected?'selected':''}">
    <span><strong>${esc(s.display_name)}</strong><small class="skill-key">${esc(s.stat_key)}</small><span class="stat-list-description">${esc(s.description||'설명 없음')}</span>
    <small>초기값 ${esc(s.default_value)} · ${s.enabled?'활성':'비활성'}</small></span></button>`).join('')+
    (!data.items.length?'<p class="character-empty">검색 결과가 없습니다.</p>':'')+
    `<div class="character-pagination"><button type="button" data-page="-1" ${offset===0?'disabled':''}>이전</button><span>${Math.floor(offset/25)+1} / ${Math.max(1,Math.ceil(data.total/25))}</span><button type="button" data-page="1" ${offset+25>=data.total?'disabled':''}>다음</button></div>`;
}
export function renderStatEditor(data) {
  const s=data.stat;
  return `<header class="character-detail-heading"><div><small>${s.id?'SHARED STAT':'NEW STAT'}</small><h2>${s.id?esc(s.display_name):'새 스탯'}</h2></div><button type="button" id="stat-reload">${s.id?'새로고침':'입력 초기화'}</button></header>
    <p class="character-note">확인된 DB 자동 생성: 새 캐릭터에는 활성 스탯이, 새 활성 스탯에는 기존 활성 캐릭터의 수치가 초기값으로 생성됩니다. 기존 수치는 덮어쓰지 않습니다.</p>
    <p class="skill-warning">자동 생성은 신규 등록 시에만 실행됩니다. 비활성으로 등록한 스탯을 나중에 활성화하거나, 스탯 등록 때 비활성이었던 캐릭터를 다시 활성화하면 누락 수치가 자동 보충되지 않습니다. 캐릭터 관리에서 해당 항목을 확인해주세요.</p>
    <form id="stat-edit"><fieldset><legend>스탯 정의</legend><div class="character-fields">
    <label>표시 이름<input name="display_name" required maxlength="200" value="${esc(s.display_name)}"></label>
    <label>내부 key<input name="stat_key" required maxlength="${s.id?200:80}" ${s.id?'readonly':'pattern="[a-z][a-z0-9_]{0,79}"'} value="${esc(s.stat_key)}"><small>생성 후 변경할 수 없습니다.</small></label>
    <label>초기값<input name="default_value" type="number" required step="1" min="-2147483648" max="2147483647" value="${esc(s.default_value)}"><small>새 수치 행의 초기값입니다. 기존 캐릭터의 현재 값을 변경하는 기능이 아닙니다.</small></label>
    <label>활성 여부<select name="enabled"><option value="true" ${s.enabled?'selected':''}>활성</option><option value="false" ${!s.enabled?'selected':''}>비활성</option></select><small>비활성화해도 기존 참조·캐릭터 수치를 삭제하지 않습니다. 기존 행동 효과를 끄려면 행동 규칙을 따로 확인해주세요.</small></label>
    <label>설명<textarea name="description" rows="4" maxlength="10000">${esc(s.description||'')}</textarea></label>
    </div></fieldset><section class="character-review"><h3>저장 전 변경사항</h3><div id="stat-preview"><p>아직 변경한 항목이 없습니다.</p></div></section>
    <label class="character-pause"><input id="stat-bot-paused" type="checkbox">봇 실행을 일시 중지했습니다. (자동 중지 기능이 아닙니다.)</label>
    <div class="character-actions"><button type="submit" class="submit-button">${s.id?'변경사항 저장':'스탯 등록'}</button><button type="button" id="stat-cancel">취소</button></div><div id="stat-message" role="status"></div></form>`;
}
export function bindStatsAdmin(params) {
  const root=document.querySelector('[data-stat-admin]');if(!root)return;
  const page={dirty:false,busy:false,data:null,selected:null,offset:0,search:'',enabled:null,version:0,listVersion:0,user:getAuthState().user?.id};activePage=page;
  const live=()=>root.isConnected&&activePage===page&&getAuthState().isAdmin&&getAuthState().user?.id===page.user;
  const editor=root.querySelector('#stat-editor'),list=root.querySelector('#stat-list');
  const canDiscard=()=>!page.busy&&(!page.dirty||confirm('저장하지 않은 변경사항을 취소할까요?'));
  const say=(text,type='error')=>{const box=root.querySelector('#stat-message');if(box)box.innerHTML=message(text,type);};
  function readDraft() {
    const form=new FormData(root.querySelector('#stat-edit'));
    return validateStat({stat_key:String(form.get('stat_key')),display_name:String(form.get('display_name')),
      description:form.get('description')===''&&page.data.stat.description===null?null:String(form.get('description')),
      default_value:form.get('default_value'),enabled:form.get('enabled')==='true'},page.selected!==null);
  }
  function review() {
    try {const rows=statChanges(page.data,readDraft());page.dirty=rows.length>0;
      root.querySelector('#stat-preview').innerHTML=rows.length?'<ul>'+rows.map(r=>`<li><span>${esc(r.label)}</span><strong>${esc(r.before)} → ${esc(r.after)}</strong></li>`).join('')+'</ul>':'<p>변경한 항목이 없습니다.</p>';
    }catch(e){page.dirty=true;root.querySelector('#stat-preview').innerHTML=message(statError(e),'error');}
  }
  function show(data) {
    page.data=data;page.selected=data.stat.id;page.dirty=false;editor.innerHTML=renderStatEditor(data);
    const form=root.querySelector('#stat-edit');form.addEventListener('input',review);form.addEventListener('change',review);form.addEventListener('submit',save);
    root.querySelector('#stat-reload').addEventListener('click',()=>select(page.selected));
    root.querySelector('#stat-cancel').addEventListener('click',()=>{if(canDiscard())show(page.data);});
    history.replaceState(null,'',page.selected?'#/admin/stats?id='+encodeURIComponent(page.selected):'#/admin/stats?new=1');
  }
  async function save(event) {
    event.preventDefault();if(page.busy||!live())return;
    let draft,changes;try{draft=readDraft();changes=statChanges(page.data,draft);}catch(e){say(statError(e));return;}
    if(page.selected&&!changes.length){say('변경한 항목이 없습니다.','');return;}
    if(!root.querySelector('#stat-bot-paused').checked){say(statError({message:'BOT_PAUSE_REQUIRED'}));return;}
    if(!confirm(changes.map(r=>r.label+': '+r.before+' → '+r.after).join('\n')+'\n\n공유 스탯 정의를 저장할까요? 캐릭터별 현재 수치는 이 요청에서 수정하지 않습니다.'))return;
    page.busy=true;const controls=[...editor.querySelectorAll('input,select,textarea,button')].map(c=>[c,c.disabled]);controls.forEach(([c])=>c.disabled=true);say('저장 중…','');
    try{const data=await statApi.save(page.selected,page.data.revision,draft,true);if(live()){show(data);say('스탯 정의를 저장했습니다. 캐릭터·행동·스킬 화면은 새로고침해서 확인해주세요.','success');loadList();}}
    catch(e){if(live())say(statError(e));}
    finally{page.busy=false;if(live())controls.forEach(([c,disabled])=>{if(c.isConnected)c.disabled=disabled;});}
  }
  async function select(id) {
    if(!live()||!canDiscard())return;const version=++page.version;page.dirty=false;editor.innerHTML='<p class="character-empty">스탯 정의를 불러오는 중…</p>';
    try{const data=await statApi.detail(id);if(live()&&version===page.version){show(data);list.querySelectorAll('[data-stat-id]').forEach(b=>b.classList.toggle('selected',b.dataset.statId===page.selected));}}
    catch(e){if(live()&&version===page.version){editor.innerHTML=message(statError(e),'error')+'<button type="button" id="stat-retry">다시 시도</button>';editor.querySelector('#stat-retry').addEventListener('click',()=>select(id));}}
  }
  async function loadList() {
    const version=++page.listVersion;list.innerHTML='<p class="character-empty">스탯 목록을 불러오는 중…</p>';
    try{const data=await statApi.list(page);if(!live()||version!==page.listVersion)return;list.innerHTML=renderStatList(data,page.offset,page.selected);
      list.querySelectorAll('[data-stat-id]').forEach(b=>b.addEventListener('click',()=>select(b.dataset.statId)));
      list.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>{if(page.busy)return;page.offset+=Number(b.dataset.page)*25;loadList();}));
    }catch(e){if(live()&&version===page.listVersion)list.innerHTML=message(statError(e),'error');}
  }
  root.querySelector('#stat-new').addEventListener('click',()=>select(null));
  const form=root.querySelector('#stat-search');
  const search=event=>{event.preventDefault();if(page.busy)return;const f=new FormData(form);page.search=String(f.get('search')).trim();page.enabled=f.get('enabled')===''?null:f.get('enabled')==='true';page.offset=0;loadList();};
  form.addEventListener('submit',search);form.querySelector('select').addEventListener('change',search);
  loadList();if(params.has('id'))select(params.get('id'));else if(params.has('new'))select(null);
}
