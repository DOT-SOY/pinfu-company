import { getAuthState } from '../auth.js';
import { createOrgProfile, getOrgProfileDetail, updateOrgProfile, updateOrgProfileDetail } from '../organization.js';
import { isSafeImageUrl, normalizeInnerSchema, orgErrorMessage } from '../organization-schema.js';
import { esc, message, setBusy, subHero } from '../ui.js';
import { safeImage } from '../organization-view.js';

function detailInput(field, value) {
  const common = `name="detail_${esc(field.key)}" ${field.required ? 'required' : ''} placeholder="${esc(field.placeholder)}"`;
  if (field.type === 'textarea') return `<textarea ${common} rows="5">${esc(value || '')}</textarea>`;
  if (field.type === 'select') return `<select ${common}><option value="">선택</option>${field.options.map((option) => `<option value="${esc(option)}" ${String(value)==option?'selected':''}>${esc(option)}</option>`).join('')}</select>`;
  if (field.type === 'image') { const image=safeImage(value); return `<input type="url" ${common} value="${esc(value || '')}"><div class="organization-inline-image-preview" data-detail-image-preview="${esc(field.key)}">${image?`<img src="${esc(image)}" alt="${esc(field.label)} 미리보기">`:'<span>이미지 미리보기</span>'}</div><p class="organization-inline-image-error" data-detail-image-error="${esc(field.key)}" hidden>이미지를 불러올 수 없습니다.</p>`; }
  const type = field.type === 'image' ? 'url' : field.type;
  return `<input type="${type}" ${common} value="${esc(value || '')}">`;
}

export function renderOrganizationProfileEditor({ profile, detail, innerTemplate }) {
  const auth = getAuthState();
  if (!auth.loggedIn) return `${subHero('MY PROFILE', '조직도 프로필', '조직도에 사용할 내 정보를 관리합니다.')}<section class="shell status-page">${message('로그인이 필요합니다.', 'error')}<a href="#/login">로그인하기</a></section>`;
  if (!auth.canManageOrgProfile) return `${subHero('MY PROFILE', '조직도 프로필', '조직도에 사용할 내 정보를 관리합니다.')}<section class="shell status-page">${message('조직도 프로필 등록 권한이 없습니다.', 'error')}<a href="#/account">마이페이지로</a></section>`;
  const schema = normalizeInnerSchema(innerTemplate?.schema_data);
  const customFields = schema.fields.filter((field) => field.source === 'detail');
  const fieldValues = detail?.field_values || {};
  const image = safeImage(profile?.image_url);
  return `${subHero('MY PROFILE', profile ? '조직도 프로필 수정' : '조직도 프로필 작성', '관리자가 만든 양식에 맞춰 공개 프로필 정보를 입력합니다.')}<section class="shell organization-profile-editor"><form id="organization-profile-form" class="organization-profile-form" data-profile-id="${profile?.id || ''}"><div class="organization-profile-form-main"><div class="form-heading"><small>BASIC PROFILE</small><h2>기본 정보</h2></div><div class="organization-form-grid"><label>이름<input name="name" maxlength="80" required value="${esc(profile?.name || '')}"></label><label>소속/부서<input name="department" maxlength="100" required value="${esc(profile?.department || '')}"></label><label>직급<input name="position" maxlength="80" required value="${esc(profile?.position || '')}"></label><label class="span-2">프로필 사진 URL<input name="image_url" type="url" inputmode="url" placeholder="https://example.com/image" value="${esc(profile?.image_url || '')}"><small>HTTPS 외부 이미지 URL만 사용할 수 있습니다.</small></label></div>${customFields.length ? `<div class="form-heading organization-custom-heading"><small>DETAIL PROFILE</small><h2>상세 정보</h2></div><div class="organization-form-grid">${customFields.map((field) => `<label class="span-${field.span}">${esc(field.label)}${detailInput(field, fieldValues[field.key])}</label>`).join('')}</div>` : ''}<div id="org-profile-message"></div><div class="organization-form-actions"><button class="submit-button" type="submit">저장하기</button>${profile ? `<a href="#/company/organization/${profile.id}">상세 프로필 보기</a>` : ''}</div></div><aside class="organization-image-preview"><strong>이미지 미리보기</strong><div data-image-preview>${image ? `<img src="${esc(image)}" alt="프로필 이미지 미리보기">` : '<span aria-hidden="true">P</span>'}</div><p data-image-error hidden>이미지를 불러올 수 없습니다.</p><p>프로필을 저장해도 관리자가 조직도 캔버스에 배치하기 전에는 공개 조직도에 나타나지 않습니다.</p></aside></form></section>`;
}

export function bindOrganizationProfileEditor({ profile, innerTemplate, navigate }) {
  const form = document.getElementById('organization-profile-form');
  if (!form) return;
  const imageInput = form.elements.image_url;
  const preview = form.querySelector('[data-image-preview]');
  const imageError = form.querySelector('[data-image-error]');
  const updatePreview = () => {
    const url = imageInput.value.trim(); imageError.hidden = true;
    if (!url) { preview.innerHTML = '<span aria-hidden="true">P</span>'; return; }
    if (!isSafeImageUrl(url)) { preview.innerHTML = '<span aria-hidden="true">P</span>'; imageError.textContent='이미지 URL 형식이 올바르지 않습니다.';imageError.hidden=false;return; }
    preview.innerHTML = `<img src="${esc(url)}" alt="프로필 이미지 미리보기">`;
    const img=preview.querySelector('img');img.addEventListener('error',()=>{preview.innerHTML='<span aria-hidden="true">P</span>';imageError.textContent='이미지를 불러올 수 없습니다.';imageError.hidden=false;},{once:true});
  };
  imageInput.addEventListener('input', updatePreview);
  normalizeInnerSchema(innerTemplate?.schema_data).fields.filter((field)=>field.source==='detail'&&field.type==='image').forEach((field)=>{
    const input=form.elements[`detail_${field.key}`],target=form.querySelector(`[data-detail-image-preview="${CSS.escape(field.key)}"]`),error=form.querySelector(`[data-detail-image-error="${CSS.escape(field.key)}"]`);if(!input||!target||!error)return;
    const update=()=>{const url=input.value.trim();error.hidden=true;if(!url){target.innerHTML='<span>이미지 미리보기</span>';return;}if(!isSafeImageUrl(url)){target.innerHTML='<span>이미지 미리보기</span>';error.textContent='이미지 URL 형식이 올바르지 않습니다.';error.hidden=false;return;}target.innerHTML=`<img src="${esc(url)}" alt="${esc(field.label)} 미리보기">`;target.querySelector('img').addEventListener('error',()=>{target.innerHTML='<span>이미지 미리보기</span>';error.textContent='이미지를 불러올 수 없습니다.';error.hidden=false;},{once:true});};
    input.addEventListener('input',update);update();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const auth=getAuthState(),data=new FormData(form),button=form.querySelector('[type="submit"]'),box=document.getElementById('org-profile-message');
    const imageUrl=String(data.get('image_url')||'').trim();
    if(!isSafeImageUrl(imageUrl)){box.innerHTML=message('이미지 URL 형식이 올바르지 않습니다.','error');return;}
    const values={name:String(data.get('name')||'').trim(),department:String(data.get('department')||'').trim(),position:String(data.get('position')||'').trim(),image_url:imageUrl};
    if(!values.name||!values.department||!values.position){box.innerHTML=message('이름, 소속, 직급을 모두 입력해주세요.','error');return;}
    const schema=normalizeInnerSchema(innerTemplate?.schema_data),fieldValues={};
    for(const field of schema.fields.filter((item)=>item.source==='detail')){const value=String(data.get(`detail_${field.key}`)||'').trim();if(field.required&&!value){box.innerHTML=message(`${field.label} 항목을 입력해주세요.`,'error');return;}if(field.type==='image'&&value&&!isSafeImageUrl(value)){box.innerHTML=message(`${field.label} 이미지 URL 형식이 올바르지 않습니다.`,'error');return;}fieldValues[field.key]=field.type==='number'&&value!==''?Number(value):value;}
    setBusy(button,true,'저장 중...');
    try{
      const saved=profile?await updateOrgProfile(profile.id,{...values,owner_user_id:profile.owner_user_id}):await createOrgProfile({...values,owner_user_id:auth.user.id,created_by:auth.user.id});
      const detail=await getOrgProfileDetail(saved.id);
      if(!detail)throw new Error('ORG_PROFILE_DETAIL_MISSING');
      await updateOrgProfileDetail(saved.id,fieldValues);
      navigate(`/company/organization/${saved.id}`);
    }catch(error){box.innerHTML=message(orgErrorMessage(error,'조직도 프로필 저장에 실패했습니다.'),'error');setBusy(button,false);}
  });
}
