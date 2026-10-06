import { initDatabase, isSupabaseConfigured } from './js/supabase.js';
import { getAuthState, initAuth, onAuthChange, signOut } from './js/auth.js';
import { getPost, listPosts } from './js/posts.js';
import { listComments } from './js/comments.js';
import { FALLBACK_PRESS_POSTS } from './js/data/fallback-posts.js';
import { renderHome } from './js/pages/home.js';
import { getCompanyTitle, renderCompany } from './js/pages/company.js';
import { renderRecruit } from './js/pages/recruit.js';
import { renderBoard } from './js/pages/board.js';
import { bindDetail, renderDetail, resetDetailState } from './js/pages/detail.js';
import { bindAccount, bindAuth, renderAccount, renderAuth } from './js/pages/auth-account.js';
import { bindAdmin, renderAdmin } from './js/pages/admin.js';
import { bindCharactersAdmin, confirmLeaveCharactersAdmin, renderCharactersAdmin } from './js/pages/characters-admin.js';
import { bindSkillsAdmin, confirmLeaveSkillsAdmin, renderSkillsAdmin } from './js/pages/skills-admin.js';
import { bindActionsAdmin, confirmLeaveActionsAdmin, renderActionsAdmin } from './js/pages/actions-admin.js';
import { bindStatsAdmin, confirmLeaveStatsAdmin, renderStatsAdmin } from './js/pages/stats-admin.js';
import { getActiveOrgTemplate, getMyOrgProfile, getOrgProfile, getOrgProfileDetail, loadPublicOrganization } from './js/organization.js';
import { bindOrganizationViewer, renderOrganization } from './js/pages/organization.js';
import { renderOrganizationDetail } from './js/pages/organization-detail.js';
import { bindOrganizationProfileEditor, renderOrganizationProfileEditor } from './js/pages/organization-profile-editor.js';
import { bindOrganizationAdmin, confirmLeaveOrganizationEditor, loadOrganizationAdminData, renderOrganizationAdmin } from './js/pages/organization-admin.js';
import { bindOrganizationTemplateEditor, confirmLeaveOrganizationTemplateEditor, loadOrganizationTemplatesData, renderOrganizationTemplateEditor } from './js/pages/organization-template-editor.js';
import { bindOrganizationUsersAdmin, loadOrganizationUsers, renderOrganizationUsersAdmin } from './js/pages/organization-users-admin.js';
import { categoryFor, errorMessage, esc, message } from './js/ui.js';
import { bindRunner, loginRequired, renderRunner } from './js/pages/runner.js';
import { bindCommunity, loadCommunity } from './js/pages/community.js';

const OPEN_CHAT_URL = 'https://open.kakao.com/'; // 실제 Q&A 오픈채팅 주소로 교체하세요.
const app = document.getElementById('app');
let renderVersion = 0;
let cleanupCommunity = () => {};

function route() {
  return (location.hash.slice(1) || '/').split('?')[0];
}

function navigate(path) {
  location.hash = path;
}

async function render() {
  const version = ++renderVersion;
  cleanupCommunity();
  cleanupCommunity = () => {};
  const path = route();
  const parts = path.split('/').filter(Boolean);
  const memberRoute = path === '/runner' || parts[0] === 'community';
  document.body.classList.toggle('runner-mode', memberRoute);
  let title = '핑후컴퍼니';
  let html;
  let adminPost = null;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  let pageData = null;
  app.innerHTML = `<div class="shell loading-state">${parts.includes('organization') ? '조직도를 불러오는 중입니다...' : '불러오는 중…'}</div>`;

  try {
    if (path === '/runner') {
      html = getAuthState().loggedIn ? renderRunner() : loginRequired();
      title = '러너 전용 | 핑후컴퍼니';
    } else if (parts[0] === 'community') {
      pageData = await loadCommunity(parts);
      html = pageData.html;
      title = '커뮤니티 | 핑후컴퍼니';
    } else if (parts[0] === 'company' && parts[1] === 'organization' && parts[2]) {
      const profileId = Number(parts[2]);
      if (!Number.isSafeInteger(profileId) || profileId < 1) throw new Error('INVALID_ORG_PROFILE_ID');
      const [profile, detail, innerTemplate] = await Promise.all([getOrgProfile(profileId), getOrgProfileDetail(profileId), getActiveOrgTemplate('INNER')]);
      html = renderOrganizationDetail({ profile, detail, innerTemplate });
      title = `${profile?.name || '프로필'} | 핑후컴퍼니`;
    } else if (parts[0] === 'company' && parts[1] === 'organization') {
      pageData = await loadPublicOrganization();
      html = renderOrganization(pageData);
      title = '조직도 | 핑후컴퍼니';
    } else if (parts[0] === 'company') {
      const slug = parts[1] || 'ceo';
      html = renderCompany(slug);
      title = `${getCompanyTitle(slug)} | 핑후컴퍼니`;
    } else if (parts[0] === 'recruit') {
      html = renderRecruit();
      title = '채용정보 | 핑후컴퍼니';
    } else if (parts[0] === 'login' || parts[0] === 'signup') {
      html = renderAuth(parts[0]);
      title = `${parts[0] === 'login' ? '로그인' : '회원가입'} | 핑후컴퍼니`;
    } else if (parts[0] === 'account' && parts[1] === 'organization') {
      const auth = getAuthState();
      let profile = null, detail = null;
      const innerTemplate = await getActiveOrgTemplate('INNER');
      if (auth.loggedIn && auth.canManageOrgProfile) {
        profile = await getMyOrgProfile(auth.user.id);
        detail = profile ? await getOrgProfileDetail(profile.id) : null;
      }
      pageData = { profile, detail, innerTemplate };
      html = renderOrganizationProfileEditor(pageData);
      title = '조직도 프로필 | 핑후컴퍼니';
    } else if (parts[0] === 'account') {
      html = renderAccount();
      title = '마이페이지 | 핑후컴퍼니';
    } else if (parts[0] === 'admin' && parts[1] === 'stats') {
      html = renderStatsAdmin();
      title = '스탯 정의 관리 | 핑후컴퍼니';
    } else if (parts[0] === 'admin' && parts[1] === 'actions') {
      html = renderActionsAdmin();
      title = '행동 관리 | 핑후컴퍼니';
    } else if (parts[0] === 'admin' && parts[1] === 'skills') {
      html = renderSkillsAdmin();
      title = '스킬 관리 | 핑후컴퍼니';
    } else if (parts[0] === 'admin' && parts[1] === 'characters') {
      html = renderCharactersAdmin();
      title = '캐릭터 관리 | 핑후컴퍼니';
    } else if (parts[0] === 'admin' && parts[1] === 'organization' && parts[2] === 'templates') {
      pageData = getAuthState().isAdmin ? await loadOrganizationTemplatesData() : { outer: [], inner: [] };
      html = renderOrganizationTemplateEditor(pageData, params);
      title = '조직도 템플릿 | 핑후컴퍼니';
    } else if (parts[0] === 'admin' && parts[1] === 'organization' && parts[2] === 'users') {
      pageData = getAuthState().isAdmin ? await loadOrganizationUsers() : [];
      html = renderOrganizationUsersAdmin(pageData);
      title = '사용자 권한 관리 | 핑후컴퍼니';
    } else if (parts[0] === 'admin' && parts[1] === 'organization') {
      pageData = getAuthState().isAdmin ? await loadOrganizationAdminData() : { profiles: [], details: [], nodes: [], edges: [], settings: null, outerTemplate: null, innerTemplate: null, users: [] };
      html = renderOrganizationAdmin(pageData, params);
      title = '조직도 관리 | 핑후컴퍼니';
    } else if (parts[0] === 'admin') {
      const mode = parts[1] === 'edit' ? 'edit' : 'new';
      adminPost = mode === 'edit' ? await getPost(Number(params.get('id'))) : null;
      html = renderAdmin(mode, adminPost);
      title = '게시글 관리 | 핑후컴퍼니';
    } else if (parts[0] === 'board' && parts[2]) {
      const id = Number(parts[2]);
      if (!Number.isSafeInteger(id) || id < 1) throw new Error('INVALID_POST_ID');
      const post = await getPost(id);
      const comments = post ? await listComments(id) : [];
      html = renderDetail(parts[1], post, comments);
      title = `${post?.title || '게시글'} | 핑후컴퍼니`;
      if (version !== renderVersion) return;
      app.innerHTML = html;
      document.title = title;
      if (post) bindDetail({ post, comments, refresh: render, navigate });
      window.scrollTo(0, 0);
      return;
    } else if (parts[0] === 'board') {
      const board = parts[1] === 'resources' ? 'resources' : 'press';
      const posts = await listPosts(categoryFor(board));
      html = renderBoard(board, posts);
      title = `${board === 'press' ? '보도자료' : '회사자료'} | 핑후컴퍼니`;
    } else {
      let notices = FALLBACK_PRESS_POSTS;
      if (isSupabaseConfigured) {
        try {
          const news = await listPosts('PRESS');
          notices = news.slice(0, 3).map((post) => ({ id: post.id, title: post.title, publishedMonth: String(post.published_at).slice(0, 7) }));
        } catch (error) {
          console.error(error);
        }
      }
      html = renderHome(notices);
    }

    if (version !== renderVersion) return;
    app.innerHTML = html;
    document.title = title;
    window.scrollTo(0, 0);
    if (path === '/runner' && getAuthState().loggedIn) bindRunner();
    if (parts[0] === 'community') cleanupCommunity = bindCommunity(pageData, { navigate, refresh: render, isCurrent: () => version === renderVersion });
    if (parts[0] === 'login' || parts[0] === 'signup') bindAuth(parts[0], navigate);
    if (parts[0] === 'account') bindAccount({ navigate, onProfileChanged: updateAuthUI });
    if (parts[0] === 'company' && parts[1] === 'organization' && !parts[2]) bindOrganizationViewer();
    if (parts[0] === 'account' && parts[1] === 'organization') bindOrganizationProfileEditor({ ...pageData, navigate });
    if (parts[0] === 'admin' && parts[1] === 'stats') bindStatsAdmin(params);
    else if (parts[0] === 'admin' && parts[1] === 'actions') bindActionsAdmin(params);
    else if (parts[0] === 'admin' && parts[1] === 'skills') bindSkillsAdmin(params);
    else if (parts[0] === 'admin' && parts[1] === 'characters') bindCharactersAdmin(params);
    else if (parts[0] === 'admin' && parts[1] === 'organization' && parts[2] === 'templates') bindOrganizationTemplateEditor({ data: pageData, params, refresh: render, navigate });
    else if (parts[0] === 'admin' && parts[1] === 'organization' && parts[2] === 'users') bindOrganizationUsersAdmin({ users: pageData, refresh: render });
    else if (parts[0] === 'admin' && parts[1] === 'organization') bindOrganizationAdmin({ data: pageData, params, navigate, refresh: render });
    else if (parts[0] === 'admin') bindAdmin(parts[1] === 'edit' ? 'edit' : 'new', adminPost, navigate);
  } catch (error) {
    if (version !== renderVersion) return;
    console.error(error);
    const text = error?.message === 'INVALID_POST_ID' ? '잘못된 게시글 주소입니다.' : error?.message === 'INVALID_ORG_PROFILE_ID' ? '잘못된 프로필 주소입니다.' : errorMessage(error, parts.includes('organization') ? '조직도를 불러오지 못했습니다.' : '요청을 처리하지 못했습니다. 네트워크 상태를 확인해주세요.');
    app.innerHTML = `<section class="shell status-page">${message(text, 'error')}<a href="#/">홈으로 돌아가기</a></section>`;
  }
}

function updateAuthUI() {
  const auth = getAuthState();
  const desktop = document.getElementById('account-nav');
  const utility = document.getElementById('auth-utility');
  const mobileAuth = document.getElementById('mobile-auth-links');
  const links = auth.loggedIn
    ? `<a href="#/account">${esc(auth.profile?.nickname || '내 계정')}</a><a href="#/runner">러너 전용</a>${auth.canManageOrgProfile ? '<a href="#/account/organization">조직도 프로필</a>' : ''}${auth.isAdmin ? '<a href="#/admin/new">게시글 관리</a><a href="#/admin/organization">조직도 관리</a>' : ''}<button type="button" data-global-logout>로그아웃</button>`
    : '<a href="#/login">로그인</a><a href="#/signup">회원가입</a>';
  desktop.innerHTML = links;
  utility.innerHTML = auth.loggedIn ? `<a href="#/account">${esc(auth.profile?.nickname || '내 계정')}</a>` : '<a href="#/login">로그인</a> · <a href="#/signup">회원가입</a>';
  mobileAuth.innerHTML = links;
  document.querySelectorAll('[data-global-logout]').forEach((button) => button.addEventListener('click', async () => {
    if (!confirmLeaveCharactersAdmin(false) || !confirmLeaveSkillsAdmin(false) || !confirmLeaveActionsAdmin(false) || !confirmLeaveStatsAdmin(false)) return;
    try { await signOut(); navigate('/'); }
    catch (error) { alert(errorMessage(error, '로그아웃에 실패했습니다.')); }
  }));
}

['open-chat-nav', 'open-chat-mobile', 'open-chat-footer'].forEach((id) => {
  const link = document.getElementById(id);
  if (link) link.href = OPEN_CHAT_URL;
});

const toggle = document.querySelector('.mobile-toggle');
const mobile = document.getElementById('mobile-menu');
const closeMobileMenu = () => {
  mobile.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', '전체 메뉴 열기');
};
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') === 'true';
  if (open) closeMobileMenu();
  else {
    mobile.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', '전체 메뉴 닫기');
  }
});
mobile.addEventListener('click', (event) => {
  if (event.target.closest('a, button')) closeMobileMenu();
});
document.addEventListener('pointerdown', (event) => {
  if (!mobile.hidden && !mobile.contains(event.target) && !toggle.contains(event.target)) closeMobileMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !mobile.hidden) { closeMobileMenu(); toggle.focus(); }
});
window.matchMedia('(min-width: 761px)').addEventListener?.('change', closeMobileMenu);
closeMobileMenu();

let lastHash = location.hash || '#/';
let restoringHash = false;
window.addEventListener('hashchange', (event) => {
  closeMobileMenu();
  if (restoringHash) { restoringHash = false; lastHash = location.hash || '#/'; return; }
  if (!confirmLeaveCharactersAdmin() || !confirmLeaveSkillsAdmin() || !confirmLeaveActionsAdmin() || !confirmLeaveStatsAdmin() || !confirmLeaveOrganizationEditor() || !confirmLeaveOrganizationTemplateEditor()) {
    restoringHash = true;
    location.hash = new URL(event.oldURL).hash || lastHash;
    return;
  }
  lastHash = location.hash;
  resetDetailState();
  render();
});
let characterAuthIdentity = null;
onAuthChange(() => {
  updateAuthUI();
  // Do not retain another session's character details after logout/role changes.
  const auth = getAuthState();
  const identity = String(auth.user?.id || '') + ':' + auth.isAdmin;
  if (identity !== characterAuthIdentity && ['/admin/characters','/admin/skills','/admin/actions','/admin/stats'].includes(route())) render();
  if (identity !== characterAuthIdentity && (route() === '/runner' || route().startsWith('/community/'))) render();
  characterAuthIdentity = identity;
});
initDatabase().catch((error) => {
  console.error('Supabase SDK 초기화 실패:', error);
}).then(initAuth).then(() => { updateAuthUI(); render(); }).catch((error) => {
  console.error('인증 초기화 실패:', error);
  updateAuthUI();
  render();
});
