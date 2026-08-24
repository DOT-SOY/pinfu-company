import { isSupabaseConfigured } from './js/supabase.js';
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
import { categoryFor, errorMessage, esc, message } from './js/ui.js';

const OPEN_CHAT_URL = 'https://open.kakao.com/'; // 실제 Q&A 오픈채팅 주소로 교체하세요.
const app = document.getElementById('app');

function route() {
  return (location.hash.slice(1) || '/').split('?')[0];
}

function navigate(path) {
  location.hash = path;
}

async function render() {
  const path = route();
  const parts = path.split('/').filter(Boolean);
  let title = '핑후컴퍼니';
  let html;
  let adminPost = null;
  app.innerHTML = '<div class="shell loading-state">불러오는 중…</div>';

  try {
    if (parts[0] === 'company') {
      const slug = parts[1] || 'ceo';
      html = renderCompany(slug);
      title = `${getCompanyTitle(slug)} | 핑후컴퍼니`;
    } else if (parts[0] === 'recruit') {
      html = renderRecruit();
      title = '채용정보 | 핑후컴퍼니';
    } else if (parts[0] === 'login' || parts[0] === 'signup') {
      html = renderAuth(parts[0]);
      title = `${parts[0] === 'login' ? '로그인' : '회원가입'} | 핑후컴퍼니`;
    } else if (parts[0] === 'account') {
      html = renderAccount();
      title = '마이페이지 | 핑후컴퍼니';
    } else if (parts[0] === 'admin') {
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
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

    app.innerHTML = html;
    document.title = title;
    window.scrollTo(0, 0);
    if (parts[0] === 'login' || parts[0] === 'signup') bindAuth(parts[0], navigate);
    if (parts[0] === 'account') bindAccount({ navigate, onProfileChanged: updateAuthUI });
    if (parts[0] === 'admin') bindAdmin(parts[1] === 'edit' ? 'edit' : 'new', adminPost, navigate);
  } catch (error) {
    console.error(error);
    const text = error?.message === 'INVALID_POST_ID' ? '잘못된 게시글 주소입니다.' : errorMessage(error, '요청을 처리하지 못했습니다. 네트워크 상태를 확인해주세요.');
    app.innerHTML = `<section class="shell status-page">${message(text, 'error')}<a href="#/">홈으로 돌아가기</a></section>`;
  }
}

function updateAuthUI() {
  const auth = getAuthState();
  const desktop = document.getElementById('account-nav');
  const utility = document.getElementById('auth-utility');
  const mobileAuth = document.getElementById('mobile-auth-links');
  const links = auth.loggedIn
    ? `<a href="#/account">${esc(auth.profile?.nickname || '내 계정')}</a>${auth.isAdmin ? '<a href="#/admin/new">관리</a>' : ''}<button type="button" data-global-logout>로그아웃</button>`
    : '<a href="#/login">로그인</a><a href="#/signup">회원가입</a>';
  desktop.innerHTML = links;
  utility.innerHTML = auth.loggedIn ? `<a href="#/account">${esc(auth.profile?.nickname || '내 계정')}</a>` : '<a href="#/login">로그인</a> · <a href="#/signup">회원가입</a>';
  mobileAuth.innerHTML = links;
  document.querySelectorAll('[data-global-logout]').forEach((button) => button.addEventListener('click', async () => {
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
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') === 'true';
  toggle.setAttribute('aria-expanded', String(!open));
  mobile.hidden = open;
});
mobile.addEventListener('click', () => {
  mobile.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
});

window.addEventListener('hashchange', () => {
  resetDetailState();
  render();
});
onAuthChange(updateAuthUI);
initAuth().then(() => { updateAuthUI(); render(); }).catch((error) => {
  console.error('인증 초기화 실패:', error);
  updateAuthUI();
  render();
});
