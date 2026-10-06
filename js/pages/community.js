import { getAuthState } from '../auth.js';
import { esc, errorMessage } from '../ui.js';
import { listCommunityPosts, getCommunityPost, saveCommunityPost, deleteCommunityPost, listCommunityComments, saveCommunityComment, deleteCommunityComment, getStockProfile, saveStockProfile, incrementCommunityView } from '../community.js';
import { loginRequired } from './runner.js';

const label = board => board === 'stock' ? '종목토론방' : '익명게시판';
const name = (board,row) => board === 'stock' ? esc(row.nickname || '알 수 없는 사용자') : '익명';
const date = value => esc(new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}));
const meta = (board,row) => `${name(board,row)} · ${date(row.created_at)}${row.edited_at ? ' · 수정됨' : ''}`;
function shell(board,body,write=true) {
  return `<section class="community-shell ${board === 'stock' ? 'community-blue' : 'community-red'}"><div class="runner-top"><a href="#/runner">러너 전용</a><a href="#/">홈으로</a></div><div class="community-nav"><nav aria-label="커뮤니티"><a class="${board==='anonymous'?'active':''}" href="#/community/anonymous">익명게시판</a><a class="${board==='stock'?'active':''}" href="#/community/stock">종목토론방</a></nav>${write?`<a class="community-cta" href="#/community/${board}/write">글쓰기</a>`:''}</div>${body}</section>`;
}
export async function loadCommunity(parts) {
  if (!getAuthState().loggedIn) return {html:loginRequired()};
  const board=parts[1];
  if(!['anonymous','stock'].includes(board)) throw new Error('INVALID_COMMUNITY_ROUTE');
  const profile=board==='stock' ? await getStockProfile() : null;
  if(board==='stock' && (!profile || parts[2]==='profile')) {
    return {html:shell(board,profileForm(profile),false),kind:'profile',board,profile};
  }
  if(parts[2]==='write' && parts.length===3) return {html:shell(board,postForm(board,profile),false),kind:'write',board,profile};
  if(parts[2]) {
    const id=Number(parts[2]);
    if(!Number.isSafeInteger(id) || id<1 || parts.length>4 || (parts[3] && parts[3]!=='edit')) throw new Error('INVALID_COMMUNITY_ROUTE');
    const post=await getCommunityPost(board,id);
    if(!post) return {html:shell(board,`<p>게시글을 찾을 수 없습니다.</p><a href="#/community/${board}">목록으로</a>`,false)};
    if(parts[3]==='edit') {
      if(post.author_id!==getAuthState().user.id) return {html:shell(board,'<p>본인 글만 수정할 수 있습니다.</p>',false)};
      return {html:shell(board,postForm(board,profile,post),false),kind:'write',board,profile,post};
    }
    const comments=await listCommunityComments(board,id);
    return {html:shell(board,detail(board,post,comments),false),kind:'detail',board,post,comments};
  }
  const feed=await listCommunityPosts(board);
  return {html:shell(board,`${board==='stock'?'<div class="community-heading"><h1>핑후컴퍼니</h1><p>종목토론방</p><a href="#/community/stock/profile">프로필 설정</a></div>':'<h1 class="community-heading">익명게시판</h1>'}<div id="community-feed">${rowsHtml(board,feed.rows)}</div><p id="feed-status" role="status"></p><div id="feed-pagination" class="community-pagination"></div><div id="feed-sentinel" class="community-sentinel"></div><button id="feed-more" class="community-mobile-more" type="button">더 불러오기</button>`),kind:'feed',board,feed};
}
function rowsHtml(board,rows) {
  return rows.map(row=>`<a class="community-row" href="#/community/${board}/${row.id}">${board==='stock'?`<div class="community-meta">${meta(board,row)}</div>`:''}<h2>${esc(row.title)}</h2><p class="community-preview">${esc(row.content)}</p><div class="community-meta">${board==='anonymous'?`${meta(board,row)} · `:''}조회 ${row.view_count} · 댓글 ${row.comment_count}</div></a>`).join('') || '<p class="community-empty">등록된 글이 없습니다.</p>';
}
function postForm(board,profile,post=null) {
  return `<a class="community-back" href="#/community/${board}${post?`/${post.id}`:''}">← ${label(board)}</a><h1>${post?'글 수정':'글쓰기'}</h1><p class="community-meta">${board==='anonymous'?'익명으로 등록됩니다.':`${esc(profile.nickname)} 이름으로 등록됩니다.`}</p><form id="community-post-form" class="community-form"><label>제목<input name="title" maxlength="200" required value="${esc(post?.title || '')}"></label><label>내용<textarea name="content" maxlength="20000" rows="12" required>${esc(post?.content || '')}</textarea></label><p class="community-error" role="status"></p><div class="community-actions"><a href="#/community/${board}${post?`/${post.id}`:''}">취소</a><button class="community-cta" type="submit">${post?'저장하기':'등록하기'}</button></div></form>`;
}
function profileForm(profile) {
  return `<h1>프로필 ${profile?'설정':'만들기'}</h1><form id="stock-profile-form" class="community-form"><label>닉네임 *<input name="nickname" maxlength="20" required value="${esc(profile?.nickname || '')}"></label><label>한 줄 소개 (선택)<textarea name="bio" maxlength="100" rows="3">${esc(profile?.bio || '')}</textarea></label><p class="community-meta">종목토론방에서 사용할 프로필입니다. 익명게시판에는 표시되지 않습니다.</p><p class="community-error" role="status"></p><div class="community-actions"><a href="#/runner">취소</a><button class="community-cta" type="submit">저장하기</button></div></form>`;
}
function controls(row,field,comment=false) {
  const auth=getAuthState(), own=auth.user.id===row[field];
  if(!own&&!auth.isAdmin) return '';
  return `<div class="community-actions">${own?`<button type="button" data-action="${comment?'comment-edit':'post-edit'}" data-id="${row.id}">수정</button>`:''}<button type="button" data-action="${comment?'comment-delete':'post-delete'}" data-id="${row.id}">삭제</button></div>`;
}
function commentsHtml(board,rows) {
  return rows.map(row=>`<article class="community-comment" data-comment="${row.id}"><div class="community-meta">${meta(board,row)}</div><p class="community-content">${esc(row.content)}</p>${controls(row,'user_id',true)}</article>`).join('');
}
function detail(board,post,comments) {
  return `<a class="community-back" href="#/community/${board}">← ${label(board)}</a><article><h1>${esc(post.title)}</h1><div class="community-meta">${meta(board,post)}</div>${controls(post,'author_id')}<p class="community-content community-post-content">${esc(post.content)}</p><p class="community-meta">조회 <span id="community-view-count">${post.view_count}</span> · 댓글 <span id="community-comment-count">${post.comment_count}</span></p></article><section class="community-comments"><h2>댓글</h2><div id="community-comments-list">${commentsHtml(board,comments.rows)}</div><button id="comments-more" type="button" ${comments.hasMore?'':'hidden'}>댓글 더보기</button><p id="comments-status" class="community-error" role="status"></p><form id="community-comment-form" class="community-form"><label>댓글<textarea name="content" maxlength="2000" rows="3" required></textarea></label><div class="community-actions"><button class="community-cta" type="submit">등록하기</button></div></form></section>`;
}
export function bindCommunity(data,{navigate,refresh,isCurrent}) {
  const cleanups=[], active=()=>isCurrent()&&getAuthState().loggedIn;
  const fail=(box,error)=>{ if(active()) box.textContent=errorMessage(error,'요청을 처리하지 못했습니다. 다시 시도해주세요.'); };
  const bindForm=(id,save)=>{
    const form=document.getElementById(id); if(!form) return;
    form.onsubmit=async event=>{
      event.preventDefault(); const button=form.querySelector('[type=submit]'), box=form.querySelector('.community-error');
      if(button.disabled||!active()) return; button.disabled=true; box.textContent='';
      const values=Object.fromEntries(new FormData(form));
      if(Object.entries(values).some(([key,value])=>key!=='bio'&&!value.trim())) {box.textContent='필수 항목을 입력해주세요.';button.disabled=false;return;}
      try {await save(values);} catch(error) {fail(box,error);} finally {button.disabled=false;}
    };
  };
  if(data.kind==='profile') bindForm('stock-profile-form',async values=>{await saveStockProfile(values,!!data.profile);if(active()){if(location.hash.split('?')[0]==='#/community/stock') refresh();else navigate('/community/stock');}});
  if(data.kind==='write') bindForm('community-post-form',async values=>{const post=await saveCommunityPost(data.board,values,data.post?.id);if(active()) navigate(`/community/${data.board}/${post.id}`);});
  if(data.kind==='feed') {
    const media=window.matchMedia('(max-width: 760px)'), feed=document.getElementById('community-feed'), status=document.getElementById('feed-status'), pagination=document.getElementById('feed-pagination'), sentinel=document.getElementById('feed-sentinel'), more=document.getElementById('feed-more');
    let page=0,hasMore=data.feed.hasMore,loading=false,failed=false,version=0,observer=null;
    const showControls=()=>{
      pagination.innerHTML=`<button data-page="${page-1}" ${page===0?'disabled':''}>이전</button><span>${page+1} 페이지</span><button data-page="${page+1}" ${hasMore?'':'disabled'}>다음</button>`;
      pagination.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>load(Number(button.dataset.page),false));
      more.hidden=!hasMore; more.disabled=loading; more.textContent=loading?'불러오는 중…':failed?'다시 시도':'더 불러오기';
      if(observer) {observer.disconnect();if(media.matches&&hasMore&&!loading&&!failed) observer.observe(sentinel);}
    };
    const load=async (next,append)=>{
      if(loading||!active()||(append&&!hasMore)) return;
      const token=version; loading=true;failed=false;status.textContent='불러오는 중…';showControls();
      try {
        const result=await listCommunityPosts(data.board,next);
        if(!active()||token!==version) return;
        if(append) {
          const existing=new Set([...feed.querySelectorAll('a')].map(a=>a.getAttribute('href')));
          const unique=result.rows.filter(row=>!existing.has(`#/community/${data.board}/${row.id}`));
          if(unique.length) feed.insertAdjacentHTML('beforeend',rowsHtml(data.board,unique));
        } else {feed.innerHTML=rowsHtml(data.board,result.rows);}
        page=next;hasMore=result.hasMore;status.textContent=hasMore?'':'마지막 페이지입니다.';
      } catch(error) {fail(status,error);failed=true;}
      finally {if(token===version&&active()){loading=false;showControls();}}
    };
    if('IntersectionObserver' in window) observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&media.matches) load(page+1,true);},{rootMargin:'180px'});
    more.onclick=()=>load(page+1,true);
    const changed=()=>{version++;loading=false;hasMore=true;load(0,false);};
    media.addEventListener('change',changed);
    cleanups.push(()=>{version++;observer?.disconnect();media.removeEventListener('change',changed);});
    showControls();
  }
  if(data.kind==='detail') {
    // Run only once the detail DOM is mounted; render never waits on the RPC.
    incrementCommunityView(data.post.id).then(count=>{if(active()&&count!==null) document.getElementById('community-view-count').textContent=count;}).catch(error=>console.error('조회수 기록 실패',error));
    let comments=data.comments.rows,page=0,loading=false,commentsVersion=0;
    const list=document.getElementById('community-comments-list'), more=document.getElementById('comments-more'), box=document.getElementById('comments-status');
    const countChange=delta=>{const node=document.getElementById('community-comment-count');node.textContent=Math.max(0,Number(node.textContent)+delta);};
    const reloadComments=async()=>{
      const token=++commentsVersion;
      const first=await listCommunityComments(data.board,data.post.id);
      if(!active()||token!==commentsVersion)return;
      page=0;comments=first.rows;list.innerHTML=commentsHtml(data.board,comments);more.hidden=!first.hasMore;
    };
    more.onclick=async()=>{
      if(loading||!active()) return;loading=true;more.disabled=true;const token=commentsVersion;
      try {const next=await listCommunityComments(data.board,data.post.id,page+1);if(!active()||token!==commentsVersion) return;page++;const known=new Set(comments.map(c=>c.id));const added=next.rows.filter(c=>!known.has(c.id));comments.push(...added);list.insertAdjacentHTML('beforeend',commentsHtml(data.board,added));more.hidden=!next.hasMore;} catch(error){fail(box,error);} finally{loading=false;more.disabled=false;}
    };
    const form=document.getElementById('community-comment-form');
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('button'),content=form.elements.content.value.trim();
      if(button.disabled||!active()) return;if(!content){box.textContent='댓글 내용을 입력해주세요.';return;}button.disabled=true;
      try {await saveCommunityComment(data.post.id,content);if(!active()) return;form.reset();countChange(1);box.textContent='댓글을 등록했습니다.';await reloadComments();} catch(error){fail(box,error);} finally{button.disabled=false;}
    };
    const root=document.querySelector('.community-shell');
    root.onclick=async event=>{
      const button=event.target.closest('[data-action]');if(!button||button.disabled||!active()) return;
      const action=button.dataset.action,id=Number(button.dataset.id);
      if(action==='post-edit') return navigate(`/community/${data.board}/${id}/edit`);
      if(action==='comment-edit') {
        const comment=comments.find(item=>item.id===id), article=button.closest('article');
        article.innerHTML=`<form class="community-form"><label>댓글 수정<textarea maxlength="2000" name="content" rows="3" required>${esc(comment.content)}</textarea></label><p class="community-error" role="status"></p><div class="community-actions"><button type="button" data-cancel-edit>취소</button><button type="submit" class="community-cta">저장하기</button></div></form>`;
        const editForm=article.querySelector('form');
        editForm.querySelector('[data-cancel-edit]').onclick=()=>{article.outerHTML=commentsHtml(data.board,[comment]);};
        editForm.onsubmit=async e=>{e.preventDefault();const content=editForm.elements.content.value.trim(),submit=editForm.querySelector('[type=submit]');if(!content||submit.disabled)return;submit.disabled=true;try{await saveCommunityComment(data.post.id,content,id);if(active()){comment.content=content;comment.edited_at=new Date().toISOString();article.outerHTML=commentsHtml(data.board,[comment]);}}catch(error){fail(editForm.querySelector('.community-error'),error);submit.disabled=false;}};
        return;
      }
      if(!confirm(action==='post-delete'?'게시글을 삭제하시겠습니까?':'댓글을 삭제하시겠습니까?')) return;
      button.disabled=true;
      try {
        if(action==='post-delete'){await deleteCommunityPost(id);if(active()) navigate(`/community/${data.board}`);}
        else if(action==='comment-delete'){await deleteCommunityComment(id);if(active()){button.closest('article').remove();comments=comments.filter(c=>c.id!==id);countChange(-1);await reloadComments();}}
      } catch(error){fail(box,error);button.disabled=false;}
    };
  }
  return ()=>cleanups.forEach(cleanup=>cleanup());
}
