import { getAuthState, signIn, signOut, signUp, updateNickname } from '../auth.js';
import { errorMessage, esc, message, setBusy, subHero } from '../ui.js';

export function renderAuth(kind) {
  const signup = kind === 'signup';
  return `${subHero('MEMBERS', signup ? '회원가입' : '로그인', signup ? '핑후컴퍼니의 구성원으로 가입합니다.' : '계정으로 로그인해 회원 기능을 이용하세요.')}<section class="shell account-page"><form class="account-form" id="auth-form"><label>이메일<input type="email" name="email" autocomplete="email" required></label><label>비밀번호<input type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required></label>${signup ? '<label>비밀번호 확인<input type="password" name="passwordConfirm" autocomplete="new-password" minlength="6" required></label><label>닉네임<input name="nickname" maxlength="30" required></label>' : ''}<div id="form-message"></div><button class="submit-button" type="submit">${signup ? '가입하기' : '로그인'}</button><p class="form-switch">${signup ? '이미 계정이 있나요? <a href="#/login">로그인</a>' : '아직 계정이 없나요? <a href="#/signup">회원가입</a>'}</p></form></section>`;
}

export function renderAccount() {
  const auth = getAuthState();
  if (!auth.loggedIn) return renderAuth('login');
  return `${subHero('MY ACCOUNT', '마이페이지', '계정 정보와 사이트에서 사용할 닉네임을 관리합니다.')}<section class="shell account-page"><form class="account-form" id="profile-form"><label>현재 닉네임<input name="nickname" maxlength="30" required value="${esc(auth.profile?.nickname || '')}"></label><p class="role-line">권한 <strong>${esc(auth.profile?.role || 'user')}</strong></p>${auth.canManageOrgProfile?'<a class="account-feature-link" href="#/account/organization"><strong>조직도 프로필</strong><span>내 공개 프로필 작성 및 수정 →</span></a>':''}${auth.isAdmin?'<a class="account-feature-link" href="#/admin/organization"><strong>조직도 관리</strong><span>레이아웃과 템플릿 관리 →</span></a>':''}<div id="form-message"></div><button class="submit-button" type="submit">닉네임 변경</button><button class="secondary-button" id="account-logout" type="button">로그아웃</button></form></section>`;
}

export function bindAuth(kind, navigate) {
  const form = document.getElementById('auth-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    const nickname = String(data.get('nickname') || '').trim();
    const box = document.getElementById('form-message');
    const button = form.querySelector('button[type=submit]');
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return void (box.innerHTML = message('올바른 이메일 주소를 입력해주세요.', 'error'));
    if (!password) return void (box.innerHTML = message('비밀번호를 입력해주세요.', 'error'));
    if (kind === 'signup' && password !== String(data.get('passwordConfirm') || '')) return void (box.innerHTML = message('비밀번호 확인이 일치하지 않습니다.', 'error'));
    if (kind === 'signup' && !nickname) return void (box.innerHTML = message('닉네임을 입력해주세요.', 'error'));
    setBusy(button, true);
    try {
      if (kind === 'signup') {
        const result = await signUp(email, password, nickname);
        box.innerHTML = message(result.session ? '회원가입이 완료되었습니다.' : '가입 확인 메일을 확인해주세요.', 'success');
        if (result.session) setTimeout(() => navigate('/'), 500);
      } else {
        await signIn(email, password);
        navigate('/');
      }
    } catch (error) {
      box.innerHTML = message(errorMessage(error, kind === 'signup' ? '회원가입에 실패했습니다.' : '로그인에 실패했습니다.'), 'error');
    } finally { setBusy(button, false); }
  });
}

export function bindAccount({ navigate, onProfileChanged }) {
  const form = document.getElementById('profile-form');
  if (form) form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nickname = String(new FormData(form).get('nickname') || '').trim();
    const box = document.getElementById('form-message');
    const button = form.querySelector('button[type=submit]');
    if (!nickname) return void (box.innerHTML = message('닉네임을 입력해주세요.', 'error'));
    setBusy(button, true);
    try {
      await updateNickname(nickname);
      box.innerHTML = message('닉네임을 변경했습니다.', 'success');
      onProfileChanged();
    } catch (error) {
      box.innerHTML = message(errorMessage(error, '닉네임 변경에 실패했습니다.'), 'error');
    } finally { setBusy(button, false); }
  });
  const logout = document.getElementById('account-logout');
  if (logout) logout.addEventListener('click', async () => { await signOut(); navigate('/'); });
}
