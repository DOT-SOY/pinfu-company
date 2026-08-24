import { getAuthState } from '../auth.js';
import { categoryFor, esc, formatDate, subHero } from '../ui.js';

export function renderBoard(board, posts) {
  const isPress = board === 'press';
  const auth = getAuthState();
  const list = posts.length
    ? posts.map((post, index) => `<a href="#/board/${board}/${post.id}"><span>${String(posts.length - index).padStart(2, '0')}</span><strong>${esc(post.title)}</strong><span>${esc(post.author?.nickname || '관리자')}</span><time>${formatDate(post.published_at)}</time><i>→</i></a>`).join('')
    : '<div class="empty-state">등록된 게시물이 없습니다.</div>';

  return `${subHero(isPress ? 'NEWSROOM' : 'RESOURCES', isPress ? '보도자료' : '회사자료', isPress ? '생체반도체와 시시포스가 바꾼 노동한국의 주요 소식을 전합니다.' : '업무와 커뮤니티 활동에 필요한 회사 자료를 확인하세요.')}<section class="shell board-page"><div class="board-tabs"><a class="${isPress ? 'active' : ''}" href="#/board/press">보도자료</a><a class="${!isPress ? 'active' : ''}" href="#/board/resources">회사자료</a></div><div class="board-tools"><p>총 <strong>${posts.length}</strong>건의 게시물이 있습니다.</p>${auth.isAdmin ? `<a class="write-button" href="#/admin/new?category=${categoryFor(board)}">글 등록 ＋</a>` : ''}</div><div class="board-head"><span>NO.</span><span>제목</span><span>작성자</span><span>작성일</span><span></span></div><div class="board-list">${list}</div></section>`;
}
