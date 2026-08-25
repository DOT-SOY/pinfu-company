import { getAuthState } from '../auth.js';
import { esc, message, subHero } from '../ui.js';
import { renderInnerFields, safeImage } from '../organization-view.js';
import { renderCompanySideNav } from './company.js';

export function renderOrganizationDetail({ profile, detail, innerTemplate }) {
  if (!profile) return `${subHero('ORGANIZATION', '프로필', '핑후컴퍼니 구성원 상세정보입니다.')}<div class="shell sub-layout organization-company-layout">${renderCompanySideNav('organization')}<article class="content-panel">${message('프로필이 존재하지 않습니다.', 'error')}</article></div>`;
  const auth = getAuthState();
  const canEdit = auth.isAdmin || (auth.canManageOrgProfile && auth.user?.id === profile.owner_user_id);
  const image = safeImage(profile.image_url);
  const editHref = auth.isAdmin ? `#/admin/organization?tab=profiles&edit=${profile.id}` : '#/account/organization';
  return `${subHero('PROFILE', esc(profile.name), `${esc(profile.department)} · ${esc(profile.position)}`)}<div class="shell sub-layout organization-company-layout">${renderCompanySideNav('organization')}<article class="content-panel organization-profile-detail"><div class="organization-profile-summary"><div class="organization-profile-photo">${image ? `<img src="${esc(image)}" alt="${esc(profile.name)}">` : '<span aria-hidden="true">P</span>'}</div><div><small>${esc(profile.department)}</small><h2>${esc(profile.name)}</h2><p>${esc(profile.position)}</p>${canEdit ? `<a class="write-button" href="${editHref}">프로필 수정</a>` : ''}</div></div><div class="organization-detail-grid">${renderInnerFields(profile, detail, innerTemplate?.schema_data)}</div><a class="organization-back-link" href="#/company/organization">← 조직도로 돌아가기</a></article></div>`;
}
