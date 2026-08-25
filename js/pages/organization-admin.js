import { getAuthState } from '../auth.js';
import {
  createOrgProfile, deleteOrgProfile, getActiveOrgTemplate, getOrgCanvasSettings,
  listOrgEdges, listOrgNodes, listOrgProfileDetails, listOrgProfiles, listUsersForOrgAdmin,
  saveOrgLayout, updateOrgProfile, updateOrgProfileDetail
} from '../organization.js';
import { normalizeInnerSchema, normalizeOuterSchema, orgErrorMessage, isSafeImageUrl } from '../organization-schema.js';
import { esc, message, setBusy } from '../ui.js';
import { orthogonalPath, renderOuterCard, safeBorder, safeColor, safeImage } from '../organization-view.js';
import { OrganizationEditorState } from '../organization-editor/state.js';

let activeState = null;

export async function loadOrganizationAdminData() {
  const [profiles, details, nodes, edges, settings, outerTemplate, innerTemplate, users] = await Promise.all([
    listOrgProfiles(), listOrgProfileDetails(), listOrgNodes(), listOrgEdges(), getOrgCanvasSettings(),
    getActiveOrgTemplate('OUTER'), getActiveOrgTemplate('INNER'), listUsersForOrgAdmin()
  ]);
  return { profiles, details, nodes, edges, settings, outerTemplate, innerTemplate, users };
}

export function confirmLeaveOrganizationEditor() {
  if (!activeState?.isDirty) { activeState = null; return true; }
  if (!confirm('저장하지 않은 변경사항이 있습니다.\n정말 나가시겠습니까?')) return false;
  activeState = null;
  return true;
}

window.addEventListener('beforeunload', (event) => {
  if (!activeState?.isDirty) return;
  event.preventDefault(); event.returnValue = '';
});

function tabs(active) {
  return `<nav class="organization-admin-tabs" aria-label="조직도 관리"><a class="${active==='layout'?'active':''}" href="#/admin/organization">레이아웃</a><a class="${active==='profiles'?'active':''}" href="#/admin/organization?tab=profiles">프로필</a><a href="#/admin/organization/templates">템플릿</a><a href="#/admin/organization/users">사용자 권한</a><a href="#/admin/new">게시글 관리</a></nav>`;
}

function adminDenied() {
  const auth = getAuthState();
  if (!auth.loggedIn) return `<section class="shell status-page">${message('로그인이 필요합니다.', 'error')}<a href="#/login">로그인하기</a></section>`;
  if (!auth.isAdmin) return `<section class="shell status-page">${message('권한이 없습니다.', 'error')}<a href="#/">홈으로</a></section>`;
  return '';
}

function profileCustomInput(field, value) {
  const common = `name="detail_${esc(field.key)}" ${field.required?'required':''} placeholder="${esc(field.placeholder)}"`;
  if (field.type === 'textarea') return `<textarea ${common} rows="4">${esc(value || '')}</textarea>`;
  if (field.type === 'select') return `<select ${common}><option value="">선택</option>${field.options.map((option)=>`<option value="${esc(option)}" ${String(value)===option?'selected':''}>${esc(option)}</option>`).join('')}</select>`;
  if (field.type === 'image') { const image=safeImage(value);return `<input type="url" ${common} value="${esc(value || '')}"><div class="organization-inline-image-preview" data-admin-detail-image-preview="${esc(field.key)}">${image?`<img src="${esc(image)}" alt="${esc(field.label)} 미리보기">`:'<span>이미지 미리보기</span>'}</div><p class="organization-inline-image-error" data-admin-detail-image-error="${esc(field.key)}" hidden>이미지를 불러올 수 없습니다.</p>`; }
  return `<input type="${field.type==='image'?'url':field.type}" ${common} value="${esc(value || '')}">`;
}

function renderProfileManager(data, params) {
  activeState = null;
  const editId = params.get('edit');
  const editing = editId === 'new' ? null : data.profiles.find((profile) => String(profile.id) === String(editId));
  const showForm = editId === 'new' || editing;
  const placed = new Set(data.nodes.filter((node)=>node.node_type==='PROFILE').map((node)=>Number(node.profile_id)));
  const schema = normalizeInnerSchema(data.innerTemplate?.schema_data);
  const customFields = schema.fields.filter((field)=>field.source==='detail');
  const detail = editing ? data.details.find((item)=>Number(item.profile_id)===Number(editing.id)) : null;
  const values = detail?.field_values || {};
  const profileImage=safeImage(editing?.image_url);
  const form = !showForm ? '' : `<form class="organization-admin-profile-form" id="organization-admin-profile-form" data-id="${editing?.id || ''}"><div class="form-heading"><small>${editing?'EDIT PROFILE':'NEW PROFILE'}</small><h2>${editing?'프로필 수정':'새 프로필'}</h2></div><div class="organization-form-grid"><label>이름<input name="name" required maxlength="80" value="${esc(editing?.name || '')}"></label><label>소속/부서<input name="department" required maxlength="100" value="${esc(editing?.department || '')}"></label><label>직급<input name="position" required maxlength="80" value="${esc(editing?.position || '')}"></label><label>Owner<select name="owner_user_id"><option value="">Owner 없음</option>${data.users.map((user)=>`<option value="${user.id}" ${editing?.owner_user_id===user.id?'selected':''}>${esc(user.nickname)} · ${esc(user.role)}</option>`).join('')}</select></label><label class="span-2">외부 이미지 URL<input name="image_url" type="url" placeholder="https://example.com/image" value="${esc(editing?.image_url || '')}"><div class="organization-inline-image-preview" data-admin-profile-image-preview>${profileImage?`<img src="${esc(profileImage)}" alt="프로필 이미지 미리보기">`:'<span>이미지 미리보기</span>'}</div><p class="organization-inline-image-error" data-admin-profile-image-error hidden>이미지를 불러올 수 없습니다.</p></label>${customFields.map((field)=>`<label class="span-${field.span}">${esc(field.label)}${profileCustomInput(field, values[field.key])}</label>`).join('')}</div><div id="org-admin-profile-message"></div><div class="organization-form-actions"><button class="submit-button" type="submit">저장</button><a href="#/admin/organization?tab=profiles">취소</a>${editing?'<button class="danger-button" id="delete-org-profile" type="button">프로필 삭제</button>':''}</div></form>`;
  return `<section class="organization-admin-page"><header class="organization-admin-header"><div><small>ORGANIZATION CMS</small><h1>조직도 프로필 관리</h1></div>${tabs('profiles')}</header><div class="organization-profile-manager"><aside><a class="write-button" href="#/admin/organization?tab=profiles&edit=new">새 프로필 ＋</a><div class="organization-admin-profile-list">${data.profiles.map((profile)=>`<a class="${editing?.id===profile.id?'active':''}" href="#/admin/organization?tab=profiles&edit=${profile.id}"><strong>${esc(profile.name)}</strong><span>${esc(profile.department)} · ${esc(profile.position)}</span><small>${placed.has(Number(profile.id))?'배치됨':'미배치'} · ${profile.owner_user_id?'Owner 있음':'Owner 없음'}</small></a>`).join('') || '<p>등록된 프로필이 없습니다.</p>'}</div></aside><main>${form || '<div class="organization-admin-placeholder"><strong>프로필을 선택하거나 새로 만들어주세요.</strong><p>프로필 생성과 조직도 배치는 별개입니다.</p></div>'}</main></div></section>`;
}

function nodeHtml(node, profiles, outer, selectedId) {
  const selected = String(selectedId) === String(node.id);
  const style = `left:${node.position_x}px;top:${node.position_y}px;width:${node.width}px;height:${node.height}px;z-index:${node.z_index}`;
  let body;
  if (node.node_type === 'PROFILE') {
    const profile=profiles.find((item)=>Number(item.id)===Number(node.profile_id));
    body=profile?renderOuterCard(profile,outer,{width:node.width,height:node.height}):'<span>프로필 없음</span>';
  } else if(node.node_type==='GROUP') {
    body=`<div class="organization-editor-group" style="background:${safeColor(node.config?.background,'rgba(255,255,255,.55)')};border:${safeBorder(node.config?.border,'1px solid #a8bfcd')}"><strong>${esc(node.config?.label||'그룹')}</strong></div>`;
  } else {
    body=`<div class="organization-editor-label" style="background:${safeColor(node.config?.background)};border:${safeBorder(node.config?.border,'none')};font-size:${Math.max(10,Number(node.config?.fontSize)||18)}px;font-weight:${node.config?.fontWeight==='bold'?700:Number(node.config?.fontWeight)||700};text-align:${['left','center','right'].includes(node.config?.align)?node.config.align:'center'}">${esc(node.config?.text||'텍스트')}</div>`;
  }
  return `<div class="organization-node organization-editor-node ${selected?'organization-selection':''}" data-editor-node="${esc(node.id)}" style="${style}">${body}${selected?'<button class="organization-resize-handle" data-resize-handle aria-label="크기 조절"></button>':''}</div>`;
}

function renderLayout(data) {
  const outer=normalizeOuterSchema(data.outerTemplate?.schema_data);
  const placed=new Set(data.nodes.filter((node)=>node.node_type==='PROFILE').map((node)=>Number(node.profile_id)));
  const unplaced=data.profiles.filter((profile)=>!placed.has(Number(profile.id)));
  return `<section class="organization-admin-page organization-editor" data-org-editor><header class="organization-admin-header"><div><small>ORGANIZATION CMS</small><h1>조직도 편집</h1></div>${tabs('layout')}</header><div class="organization-editor-toolbar"><div><button data-editor-action="undo">↶ 실행 취소</button><button data-editor-action="redo">↷ 다시 실행</button></div><div><button data-editor-action="zoom-out">−</button><output data-editor-zoom>100%</output><button data-editor-action="zoom-in">＋</button><button data-editor-action="fit">Fit</button></div><button class="submit-button" data-editor-action="save">저장</button></div><div class="organization-editor-workspace"><aside class="organization-editor-sidebar"><div class="organization-tool-buttons"><button data-editor-action="add-group">＋ 그룹</button><button data-editor-action="add-label">＋ 텍스트</button><button data-editor-action="edge-mode">연결선 모드</button></div><label class="organization-toggle"><input type="checkbox" data-editor-setting="showGrid" ${data.settings?.showGrid!==false?'checked':''}> Grid 표시</label><label class="organization-toggle"><input type="checkbox" data-editor-setting="snap" ${data.settings?.snap!==false?'checked':''}> Snap</label><label>Grid size<input type="number" min="5" max="100" step="5" value="${Number(data.settings?.gridSize)||20}" data-editor-setting="gridSize"></label><div class="organization-unplaced-list"><strong>미배치 프로필</strong><p>드래그하거나 배치 버튼을 누르세요.</p>${unplaced.map((profile)=>`<div draggable="true" data-unplaced-profile="${profile.id}"><span><strong>${esc(profile.name)}</strong><small>${esc(profile.department)} · ${esc(profile.position)}</small></span><button data-place-profile="${profile.id}">배치</button></div>`).join('') || '<p>모든 프로필이 배치되었습니다.</p>'}</div></aside><main class="organization-editor-center"><div class="organization-editor-viewport"><div class="organization-editor-canvas"></div></div><footer><span data-editor-status>Canvas</span><span data-editor-dirty>저장됨</span></footer></main><aside class="organization-property-panel"><div data-property-panel><p>Canvas에서 요소를 선택하세요.</p></div></aside></div></section>`;
}

export function renderOrganizationAdmin(data, params) {
  const denied=adminDenied(); if(denied)return denied;
  return params.get('tab')==='profiles'?renderProfileManager(data,params):renderLayout(data);
}

function propertyPanel(node, edge) {
  if(edge)return `<div class="property-heading"><small>EDGE</small><h2>연결선</h2></div><p>선택한 연결선을 삭제할 수 있습니다.</p><button class="danger-button" data-editor-action="delete-selection">연결선 삭제</button>`;
  if(!node)return '<p>Canvas에서 요소를 선택하세요.</p>';
  const field=(label,key,value,type='number')=>`<label>${label}<input type="${type}" data-node-prop="${key}" value="${esc(value)}"></label>`;
  const common=`${field('X','position_x',node.position_x)}${field('Y','position_y',node.position_y)}${field('Width','width',node.width)}${field('Height','height',node.height)}${field('z-index','z_index',node.z_index)}`;
  let config='';
  if(node.node_type==='GROUP')config=`${field('그룹명','config.label',node.config?.label||'','text')}${field('배경','config.background',node.config?.background||'','text')}${field('테두리','config.border',node.config?.border||'','text')}`;
  if(node.node_type==='LABEL')config=`${field('텍스트','config.text',node.config?.text||'','text')}${field('글자 크기','config.fontSize',node.config?.fontSize||18)}<label>굵기<select data-node-prop="config.fontWeight"><option value="400" ${String(node.config?.fontWeight)==='400'?'selected':''}>보통</option><option value="bold" ${node.config?.fontWeight==='bold'?'selected':''}>굵게</option></select></label><label>정렬<select data-node-prop="config.align"><option value="left">왼쪽</option><option value="center" ${node.config?.align==='center'?'selected':''}>가운데</option><option value="right" ${node.config?.align==='right'?'selected':''}>오른쪽</option></select></label>${field('배경','config.background',node.config?.background||'','text')}${field('테두리','config.border',node.config?.border||'','text')}`;
  return `<div class="property-heading"><small>${esc(node.node_type)}</small><h2>선택 요소</h2></div><div class="property-fields">${common}${config}</div><button class="danger-button" data-editor-action="delete-selection">요소 삭제</button>`;
}

function bindProfileManager(data, navigate, refresh) {
  const form=document.getElementById('organization-admin-profile-form');
  if(!form)return;
  const editing=data.profiles.find((profile)=>String(profile.id)===String(form.dataset.id));
  const bindPreview=(input,target,error,label)=>{if(!input||!target||!error)return;const update=()=>{const url=input.value.trim();error.hidden=true;if(!url){target.innerHTML='<span>이미지 미리보기</span>';return;}if(!isSafeImageUrl(url)){target.innerHTML='<span>이미지 미리보기</span>';error.textContent='이미지 URL 형식이 올바르지 않습니다.';error.hidden=false;return;}target.innerHTML=`<img src="${esc(url)}" alt="${esc(label)} 미리보기">`;target.querySelector('img').addEventListener('error',()=>{target.innerHTML='<span>이미지 미리보기</span>';error.textContent='이미지를 불러올 수 없습니다.';error.hidden=false;},{once:true});};input.addEventListener('input',update);update();};
  bindPreview(form.elements.image_url,form.querySelector('[data-admin-profile-image-preview]'),form.querySelector('[data-admin-profile-image-error]'),'프로필 이미지');
  normalizeInnerSchema(data.innerTemplate?.schema_data).fields.filter((field)=>field.source==='detail'&&field.type==='image').forEach((field)=>bindPreview(form.elements[`detail_${field.key}`],form.querySelector(`[data-admin-detail-image-preview="${CSS.escape(field.key)}"]`),form.querySelector(`[data-admin-detail-image-error="${CSS.escape(field.key)}"]`),field.label));
  form.addEventListener('submit',async(event)=>{
    event.preventDefault();const valuesData=new FormData(form),button=form.querySelector('[type="submit"]'),box=document.getElementById('org-admin-profile-message');
    const values={name:String(valuesData.get('name')||'').trim(),department:String(valuesData.get('department')||'').trim(),position:String(valuesData.get('position')||'').trim(),image_url:String(valuesData.get('image_url')||'').trim(),owner_user_id:String(valuesData.get('owner_user_id')||'')||null};
    if(values.image_url&&!isSafeImageUrl(values.image_url)){box.innerHTML=message('이미지 URL 형식이 올바르지 않습니다.','error');return;}
    const schema=normalizeInnerSchema(data.innerTemplate?.schema_data),fieldValues={};
    for(const field of schema.fields.filter((item)=>item.source==='detail')){
      const value=String(valuesData.get(`detail_${field.key}`)||'').trim();
      if(field.required&&!value){box.innerHTML=message(`${field.label} 항목을 입력해주세요.`,'error');return;}
      if(field.type==='image'&&value&&!isSafeImageUrl(value)){box.innerHTML=message(`${field.label} 이미지 URL 형식이 올바르지 않습니다.`,'error');return;}
      fieldValues[field.key]=field.type==='number'&&value!==''?Number(value):value;
    }
    setBusy(button,true,'저장 중...');
    try{const saved=editing?await updateOrgProfile(editing.id,values):await createOrgProfile({...values,created_by:getAuthState().user.id});await updateOrgProfileDetail(saved.id,fieldValues);navigate(`/admin/organization?tab=profiles&edit=${saved.id}`);refresh();}catch(error){box.innerHTML=message(orgErrorMessage(error,'프로필 저장에 실패했습니다.'),'error');setBusy(button,false);}
  });
  const remove=document.getElementById('delete-org-profile');
  if(remove)remove.addEventListener('click',async()=>{if(!confirm('프로필을 삭제하면 상세 프로필과 배치된 PROFILE Node도 함께 삭제될 수 있습니다.\n계속하시겠습니까?'))return;setBusy(remove,true,'삭제 중...');try{await deleteOrgProfile(editing.id);navigate('/admin/organization?tab=profiles');refresh();}catch(error){alert(orgErrorMessage(error,'프로필 삭제에 실패했습니다.'));setBusy(remove,false);}});
}

export function bindOrganizationAdmin({ data, params, navigate, refresh }) {
  if(params.get('tab')==='profiles'){bindProfileManager(data,navigate,refresh);return;}
  const root=document.querySelector('[data-org-editor]');if(!root)return;
  const state=new OrganizationEditorState({nodes:data.nodes,edges:data.edges,settings:data.settings});activeState=state;
  const outer=normalizeOuterSchema(data.outerTemplate?.schema_data),viewport=root.querySelector('.organization-editor-viewport'),canvas=root.querySelector('.organization-editor-canvas'),panel=root.querySelector('[data-property-panel]'),zoomOutput=root.querySelector('[data-editor-zoom]');
  let selectedNode=null,selectedEdge=null,edgeMode=false,edgeSource=null,scale=1,panX=0,panY=0,gesture=null;
  const snap=(value)=>state.settings.snap?Math.round(value/state.settings.gridSize)*state.settings.gridSize:value;
  const setTransform=()=>{canvas.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;zoomOutput.value=`${Math.round(scale*100)}%`;};
  const draw=()=>{
    const map=new Map(state.nodes.map((node)=>[String(node.id),node]));
    canvas.style.width=`${state.settings.width}px`;canvas.style.height=`${state.settings.height}px`;canvas.style.backgroundColor=safeColor(state.settings.background,'#eef4f8');canvas.style.backgroundImage=state.settings.showGrid?'linear-gradient(#cbdbe4 1px,transparent 1px),linear-gradient(90deg,#cbdbe4 1px,transparent 1px)':'none';canvas.style.backgroundSize=`${state.settings.gridSize}px ${state.settings.gridSize}px`;
    canvas.innerHTML=`<svg class="organization-edge-layer" width="${state.settings.width}" height="${state.settings.height}">${state.edges.map((edge)=>{const source=map.get(String(edge.source_node_id)),target=map.get(String(edge.target_node_id));return source&&target?`<path class="organization-editor-edge ${String(selectedEdge)===String(edge.id)?'selected':''}" data-editor-edge="${esc(edge.id)}" d="${orthogonalPath(source,target)}"></path>`:'';}).join('')}</svg>${state.nodes.map((node)=>nodeHtml(node,data.profiles,outer,selectedNode)).join('')}`;
    panel.innerHTML=propertyPanel(state.node(selectedNode),state.edge(selectedEdge));
    root.querySelector('[data-editor-dirty]').textContent=state.isDirty?'저장되지 않음':'저장됨';root.querySelector('[data-editor-status]').textContent=`Canvas ${state.settings.width} × ${state.settings.height} / Grid ${state.settings.gridSize} / Snap ${state.settings.snap?'ON':'OFF'}${edgeMode?` / 연결선 ${edgeSource?'대상 선택':'시작점 선택'}`:''}`;
    root.querySelector('[data-editor-action="undo"]').disabled=!state.canUndo;root.querySelector('[data-editor-action="redo"]').disabled=!state.canRedo;
  };
  const fit=()=>{const pad=30;scale=Math.min((viewport.clientWidth-pad*2)/state.settings.width,(viewport.clientHeight-pad*2)/state.settings.height,1);scale=Math.max(.2,scale);panX=(viewport.clientWidth-state.settings.width*scale)/2;panY=(viewport.clientHeight-state.settings.height*scale)/2;setTransform();};
  const zoom=(amount)=>{scale=Math.min(2,Math.max(.2,scale+amount));setTransform();};
  const selectNode=(id)=>{selectedNode=id;selectedEdge=null;draw();};
  const placeProfile=(profileId,x=80,y=80)=>{const profile=data.profiles.find((item)=>Number(item.id)===Number(profileId));if(!profile)return;if(state.nodes.some((node)=>node.node_type==='PROFILE'&&Number(node.profile_id)===Number(profileId))){alert('이미 배치된 프로필입니다.');return;}const node=state.addProfile(profile,snap(x),snap(y),{width:outer.card.width,height:outer.card.height});selectedNode=node.id;draw();};

  root.addEventListener('click',async(event)=>{
    const action=event.target.closest('[data-editor-action]')?.dataset.editorAction;
    if(action==='undo'){state.undo();draw();}if(action==='redo'){state.redo();draw();}if(action==='zoom-in')zoom(.1);if(action==='zoom-out')zoom(-.1);if(action==='fit')fit();
    if(action==='add-group'){const node=state.addGroup();selectedNode=node.id;selectedEdge=null;draw();}if(action==='add-label'){const node=state.addLabel();selectedNode=node.id;selectedEdge=null;draw();}
    if(action==='edge-mode'){edgeMode=!edgeMode;edgeSource=null;event.target.classList.toggle('active',edgeMode);draw();}
    if(action==='delete-selection'){if(selectedNode&&confirm('선택한 요소를 삭제하시겠습니까?')){state.deleteNode(selectedNode);selectedNode=null;draw();}else if(selectedEdge&&confirm('선택한 연결선을 삭제하시겠습니까?')){state.deleteEdge(selectedEdge);selectedEdge=null;draw();}}
    if(action==='save'){const button=event.target;setBusy(button,true,'저장 중...');try{const[nodes,edges,settings]=await saveOrgLayout({nodes:state.nodes,edges:state.edges,settings:state.settings});state.markSaved(nodes,edges,settings);selectedNode=null;selectedEdge=null;draw();alert('조직도를 저장했습니다.');}catch(error){alert(orgErrorMessage(error,'조직도 저장에 실패했습니다.'));}finally{setBusy(button,false);}}
    const place=event.target.closest('[data-place-profile]');if(place)placeProfile(place.dataset.placeProfile,80+state.nodes.length*20,80+state.nodes.length*20);
  });
  root.addEventListener('change',(event)=>{
    const setting=event.target.dataset.editorSetting;if(setting){state.mutate(()=>{state.settings[setting]=event.target.type==='checkbox'?event.target.checked:Number(event.target.value);});draw();return;}
    const key=event.target.dataset.nodeProp,node=state.node(selectedNode);if(!key||!node)return;state.mutate(()=>{let value=event.target.type==='number'?Number(event.target.value):event.target.value;if(key.startsWith('config.')){node.config=node.config||{};node.config[key.slice(7)]=value;}else node[key]=value;});draw();
  });
  canvas.addEventListener('pointerdown',(event)=>{
    const edge=event.target.closest('[data-editor-edge]');if(edge){selectedEdge=edge.dataset.editorEdge;selectedNode=null;draw();return;}
    const element=event.target.closest('[data-editor-node]');
    if(element){const id=element.dataset.editorNode;if(edgeMode){if(!edgeSource){edgeSource=id;selectedNode=id;}else{const made=state.addEdge(edgeSource,id);if(!made)alert('같은 요소이거나 이미 존재하는 연결입니다.');edgeSource=null;}draw();return;}selectedNode=id;selectedEdge=null;const node=state.node(id),before=state.snapshot();gesture={type:event.target.closest('[data-resize-handle]')?'resize':'move',id,startX:event.clientX,startY:event.clientY,x:Number(node.position_x),y:Number(node.position_y),w:Number(node.width),h:Number(node.height),before};draw();return;}
    selectedNode=null;selectedEdge=null;gesture={type:'pan',startX:event.clientX,startY:event.clientY,x:panX,y:panY};viewport.setPointerCapture(event.pointerId);draw();
  });
  window.addEventListener('pointermove',(event)=>{if(!root.isConnected||!gesture||gesture.type==='pan')return;const node=state.node(gesture.id),dx=(event.clientX-gesture.startX)/scale,dy=(event.clientY-gesture.startY)/scale;if(gesture.type==='move'){node.position_x=Math.max(0,snap(gesture.x+dx));node.position_y=Math.max(0,snap(gesture.y+dy));}else{node.width=Math.max(60,snap(gesture.w+dx));node.height=Math.max(40,snap(gesture.h+dy));}draw();});
  window.addEventListener('pointerup',()=>{if(!root.isConnected||!gesture||gesture.type==='pan')return;state.record(gesture.before);gesture=null;draw();});
  viewport.addEventListener('pointermove',(event)=>{if(gesture?.type!=='pan')return;panX=gesture.x+event.clientX-gesture.startX;panY=gesture.y+event.clientY-gesture.startY;setTransform();});viewport.addEventListener('pointerup',()=>{if(gesture?.type==='pan')gesture=null;});
  viewport.addEventListener('wheel',(event)=>{event.preventDefault();zoom(event.deltaY<0?.08:-.08);},{passive:false});
  root.querySelectorAll('[data-unplaced-profile]').forEach((item)=>item.addEventListener('dragstart',(event)=>event.dataTransfer.setData('text/org-profile',item.dataset.unplacedProfile)));
  viewport.addEventListener('dragover',(event)=>event.preventDefault());viewport.addEventListener('drop',(event)=>{event.preventDefault();const id=event.dataTransfer.getData('text/org-profile'),rect=viewport.getBoundingClientRect();placeProfile(id,(event.clientX-rect.left-panX)/scale,(event.clientY-rect.top-panY)/scale);});
  document.addEventListener('keydown',(event)=>{if(!root.isConnected||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName))return;if((event.key==='Delete'||event.key==='Backspace')&&(selectedNode||selectedEdge)){event.preventDefault();if(selectedNode){state.deleteNode(selectedNode);selectedNode=null;}else{state.deleteEdge(selectedEdge);selectedEdge=null;}draw();}});
  draw();requestAnimationFrame(fit);
}
