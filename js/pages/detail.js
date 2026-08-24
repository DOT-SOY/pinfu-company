import { getAuthState } from '../auth.js';
import { buildCommentTree, createComment, softDeleteComment, updateComment } from '../comments.js';
import { deletePost } from '../posts.js';
import { boardFor, errorMessage, esc, formatDate, lines, setBusy } from '../ui.js';

let replyOpen = null;

export function resetDetailState() {
  replyOpen = null;
}

function commentForm(parentId) {
  const auth = getAuthState();
  if (!auth.loggedIn) return '<div class="login-prompt">댓글을 작성하려면 <a href="#/login">로그인</a>해주세요.</div>';
  return `<form class="comment-form ${parentId ? 'reply-form' : ''}" data-parent="${parentId || ''}"><textarea name="content" maxlength="2000" rows="3" required aria-label="댓글 내용" placeholder="${parentId ? '답글' : '댓글'}을 입력해 주세요"></textarea><button type="submit">등록</button></form>`;
}

function renderCommentNode(node, depth) {
  const auth = getAuthState();
  const canManage = auth.user?.id === node.user_id || auth.isAdmin;
  const deleted = node.is_deleted;
  const edited = node.updated_at && node.created_at && Math.abs(new Date(node.updated_at) - new Date(node.created_at)) > 1000;
  const controls = deleted ? '' : `<div class="comment-actions">${auth.loggedIn ? `<button data-action="reply" data-id="${node.id}">답글</button>` : ''}${canManage ? `<button data-action="edit" data-id="${node.id}">수정</button><button data-action="delete" data-id="${node.id}">삭제</button>` : ''}</div>`;
  const body = deleted ? '<p class="deleted-comment">삭제된 댓글입니다.</p>' : `<p>${lines(node.content)}</p>`;
  const children = node.children.map((child) => renderCommentNode(child, depth + 1)).join('');
  return `<div class="comment-node depth-${Math.min(depth, 4)}"><div class="comment" data-comment="${node.id}"><div class="comment-meta"><strong>${esc(node.profile?.nickname || '알 수 없는 사용자')}</strong><time>${formatDate(node.created_at, true)}${edited && !deleted ? ' (수정됨)' : ''}</time></div>${body}${controls}</div>${replyOpen === node.id ? commentForm(node.id) : ''}${children}</div>`;
}

export function renderDetail(board, post, comments) {
  if (!post) return `<div class="shell empty-state">게시글을 찾을 수 없습니다.<br><a href="#/board/${board}">목록으로 돌아가기</a></div>`;
  const auth = getAuthState();
  const tree = buildCommentTree(comments);
  const thread = tree.length ? tree.map((node) => renderCommentNode(node, 0)).join('') : '<div class="empty-state">첫 댓글을 남겨보세요.</div>';
  return `<section class="detail-shell shell"><article class="post-detail"><header><span class="post-category">${esc(post.category)}</span><h1>${esc(post.title)}</h1><div class="post-meta"><span>${esc(post.author?.nickname || '관리자')}</span><time>${formatDate(post.published_at)}</time></div></header><div class="post-body preserve-lines">${lines(post.content)}</div><div class="post-navigation"><a href="#/board/${board}">← 목록으로</a>${auth.isAdmin ? `<span><a href="#/admin/edit?id=${post.id}">수정</a><button id="delete-post" type="button">삭제</button></span>` : ''}</div><section class="comments"><div class="comments-title"><h2>댓글 <span>${comments.length}</span></h2></div>${commentForm(null)}<div class="comment-list">${thread}</div></section></article></section>`;
}

export function bindDetail({ post, comments, refresh, navigate }) {
  document.querySelectorAll('.comment-form').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const auth = getAuthState();
    const content = String(new FormData(form).get('content') || '').trim();
    const button = form.querySelector('button');
    if (!auth.loggedIn) return navigate('/login');
    if (!content) return alert('댓글 내용을 입력해주세요.');
    setBusy(button, true);
    try {
      await createComment(post.id, auth.user.id, content, form.dataset.parent ? Number(form.dataset.parent) : null);
      replyOpen = null;
      refresh();
    } catch (error) {
      alert(errorMessage(error, '댓글 등록에 실패했습니다.'));
      setBusy(button, false);
    }
  }));

  document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', async () => {
    const id = Number(button.dataset.id);
    const item = comments.find((comment) => comment.id === id);
    if (button.dataset.action === 'reply') {
      replyOpen = replyOpen === id ? null : id;
      return refresh();
    }
    if (button.dataset.action === 'edit') {
      let content = prompt('수정할 댓글 내용을 입력해주세요.', item?.content || '');
      if (content === null) return;
      content = content.trim();
      if (!content) return alert('빈 댓글로 수정할 수 없습니다.');
      try { await updateComment(id, content); refresh(); }
      catch (error) { alert(errorMessage(error, '댓글 수정에 실패했습니다.')); }
    }
    if (button.dataset.action === 'delete' && confirm('이 댓글을 삭제하시겠습니까?')) {
      try { await softDeleteComment(id); refresh(); }
      catch (error) { alert(errorMessage(error, '댓글 삭제에 실패했습니다.')); }
    }
  }));

  const deleteButton = document.getElementById('delete-post');
  if (deleteButton) deleteButton.addEventListener('click', async () => {
    if (!confirm('이 게시글을 삭제하시겠습니까?')) return;
    setBusy(deleteButton, true);
    try { await deletePost(post.id); navigate(`/board/${boardFor(post.category)}`); }
    catch (error) { alert(errorMessage(error, '게시글 삭제에 실패했습니다.')); setBusy(deleteButton, false); }
  });
}
