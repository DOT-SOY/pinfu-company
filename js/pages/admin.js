import { getAuthState } from '../auth.js';
import { createPost, updatePost } from '../posts.js';
import { boardFor, errorMessage, esc, message, setBusy, subHero } from '../ui.js';

export function renderAdmin(mode, post) {
  const auth = getAuthState();
  if (!auth.loggedIn) return `<section class="shell status-page">${message('로그인이 필요합니다.', 'error')}<a href="#/login">로그인하기</a></section>`;
  if (!auth.isAdmin) return `<section class="shell status-page">${message('관리자 권한이 없습니다.', 'error')}<a href="#/">홈으로</a></section>`;
  const editing = mode === 'edit';
  return `${subHero('ADMIN', editing ? '게시글 수정' : '게시글 작성', '핑후컴퍼니 자료마당의 게시글을 관리합니다.')}<section class="shell account-page"><form class="post-form" id="admin-post-form" data-id="${post?.id || ''}"><label>분류<select name="category"><option value="PRESS" ${post?.category === 'PRESS' ? 'selected' : ''}>보도자료</option><option value="RESOURCE" ${post?.category === 'RESOURCE' ? 'selected' : ''}>회사자료</option></select></label><label>제목<input name="title" maxlength="120" required value="${esc(post?.title || '')}"></label><label>게시일시<input name="published_at" type="datetime-local" required value="${post?.published_at ? new Date(post.published_at).toISOString().slice(0, 16) : ''}"></label><label>내용 <small class="field-help">Markdown 문법을 사용할 수 있습니다.</small><textarea name="content" maxlength="20000" rows="14" required>${esc(post?.content || '')}</textarea></label><div id="form-message"></div><button class="submit-button" type="submit">${editing ? '수정 완료' : '게시글 등록'}</button></form></section>`;
}

export function bindAdmin(mode, post, navigate) {
  const form = document.getElementById('admin-post-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const auth = getAuthState();
    const data = new FormData(form);
    const button = form.querySelector('button[type=submit]');
    const box = document.getElementById('form-message');
    const values = { category: String(data.get('category')), title: String(data.get('title')).trim(), content: String(data.get('content')).trim(), published_at: new Date(String(data.get('published_at'))).toISOString() };
    if (!values.title || !values.content) return void (box.innerHTML = message('제목과 내용을 모두 입력해주세요.', 'error'));
    setBusy(button, true);
    try {
      const result = mode === 'edit' ? await updatePost(post.id, values) : await createPost({ ...values, author_id: auth.user.id });
      navigate(`/board/${boardFor(values.category)}/${result.id}`);
    } catch (error) {
      box.innerHTML = message(errorMessage(error, '게시글 저장에 실패했습니다.'), 'error');
      setBusy(button, false);
    }
  });
}
