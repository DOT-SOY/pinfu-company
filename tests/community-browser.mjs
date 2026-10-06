// Browser UI tests use a controlled Auth/PostgREST fixture. Live database RLS is
// verified separately with rollback-only SQL; no production credentials here.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const out=resolve(process.env.QA_OUTPUT || '../../work/community-qa');
await mkdir(out,{recursive:true});
const sdk=await (await fetch('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2')).text();
const server=http.createServer(async(req,res)=>{
  try {const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname === '/'?'/index.html':new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root))throw new Error();res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}
  catch {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,channel:process.env.QA_BROWSER_CHANNEL || 'chrome'});
const uid='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const seed=()=>Array.from({length:45},(_,i)=>({id:45-i,board_type:'anonymous',author_id:i===0?uid:other,title:`테스트 제목 ${45-i}`,content:'본문 미리보기 <script>unsafe</script>\n둘째 줄',created_at:new Date(Date.UTC(2026,9,6,0,0,45-i)).toISOString(),edited_at:null,view_count:0,comment_count:0}));
let actions=[],posts=seed(),comments=[],stock=null,log=[],admin=false,nextId=100;
const context=await browser.newContext({viewport:{width:1280,height:900}});
await context.route('**/cdn.jsdelivr.net/npm/@supabase/supabase-js@2',route=>route.fulfill({contentType:'text/javascript',body:sdk}));
await context.route('https://evzrzwbemqrwlaqeowkq.supabase.co/**',async route=>{
  const request=route.request(),u=new URL(request.url()),table=u.pathname.split('/').pop(),method=request.method();
  const body=request.postDataJSON();log.push({table,method,query:u.search,headers:request.headers()});
  let rows=[],error=null;
  if(table==='profiles') rows=[{id:uid,nickname:'홈페이지닉네임',role:admin?'admin':'user'}];
  if(table==='stock_profiles') {
    if(method==='POST'||method==='PATCH'){if(body.nickname==='중복'){error={code:'23505',message:'duplicate'};}else{stock={user_id:uid,...body};}}
    rows=stock?[stock]:[];
    if(u.searchParams.has('user_id') && u.searchParams.get('user_id').startsWith('in.')) rows.push({user_id:other,nickname:'다른종토닉네임'});
  }
  if(table==='community_posts') {
    const board=(u.searchParams.get('board_type')||'eq.anonymous').slice(3);
    if(method==='POST') {const row={...body,id:nextId++,created_at:new Date().toISOString(),edited_at:null,view_count:0,comment_count:0};posts.unshift(row);rows=[row];}
    else if(method==='PATCH'||method==='DELETE') {const id=Number(u.searchParams.get('id')?.slice(3));const row=posts.find(p=>p.id===id);if(row){if(method==='PATCH'){Object.assign(row,body,{edited_at:new Date().toISOString()});rows=[row];}else{posts=posts.filter(p=>p.id!==id);rows=[{id}];}}}
    else {rows=posts.filter(p=>p.board_type===board);if(u.searchParams.has('saved_actions.action'))rows=rows.filter(p=>actions.some(a=>a.post_id===p.id&&a.action==='bookmark'));if(u.searchParams.has('id')) rows=rows.filter(p=>p.id===Number(u.searchParams.get('id').slice(3)));const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||rows.length);rows=rows.slice(offset,offset+limit);}
  }
  if(table==='community_post_actions') {const ids=(u.searchParams.get('post_id')||'').match(/\d+/g)||[];rows=actions.filter(a=>ids.includes(String(a.post_id)));}
  if(table==='set_community_post_action') {
    const row=posts.find(p=>p.id===body.p_post_id),found=actions.some(a=>a.post_id===row.id&&a.action===body.p_action);
    if(body.p_active&&!found)actions.push({post_id:row.id,action:body.p_action});
    if(!body.p_active)actions=actions.filter(a=>!(a.post_id===row.id&&a.action===body.p_action));
    row.like_count=actions.filter(a=>a.post_id===row.id&&a.action==='like').length;
    return route.fulfill({contentType:'application/json',body:JSON.stringify({active:body.p_active,like_count:row.like_count})});
  }
  if(table==='community_comments') {
    const id=Number(u.searchParams.get('id')?.slice(3)),postId=Number(u.searchParams.get('post_id')?.slice(3));
    if(method==='POST'){const row={...body,id:nextId++,created_at:new Date().toISOString(),edited_at:null};comments.push(row);posts.find(p=>p.id===row.post_id).comment_count++;rows=[row];}
    else if(method==='PATCH'){const row=comments.find(c=>c.id===id);Object.assign(row,body);rows=[row];}
    else if(method==='DELETE'){const row=comments.find(c=>c.id===id);posts.find(p=>p.id===row.post_id).comment_count--;comments=comments.filter(c=>c.id!==id);rows=[{id}];}
    else {rows=comments.filter(c=>c.post_id===postId);const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||41);rows=rows.slice(offset,offset+limit);}
  }
  if(table==='increment_community_post_view'){const row=posts.find(p=>p.id===body.p_post_id);row.view_count++;return route.fulfill({contentType:'application/json',body:JSON.stringify(row.view_count)});}
  if(error) return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify(error)});
  const single=request.headers().accept?.includes('vnd.pgrst.object');
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(single?rows[0]||null:rows)});
});
const page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.accept());
const go=async hash=>{await page.evaluate(h=>location.hash=h,hash);};
const visible=selector=>page.locator(selector).waitFor({state:'visible'});
const checkChrome=async shown=>{for(const selector of ['.utility','.site-header','.contact-strip','body > footer'])assert.equal(await page.locator(selector).isVisible(),shown,selector);};
try {
  await page.goto(url+'/#/runner');await visible('.runner-shell h1');assert.match(await page.locator('#app').innerText(),/로그인이 필요/);await checkChrome(false);assert.equal(log.filter(x=>x.table.startsWith('community')).length,0);
  await go('/community/anonymous');await visible('.runner-shell');assert.equal(await page.locator('#community-feed').count(),0);
  // Seed a fixture session using the existing Supabase client's storage format.
  await page.evaluate(uid=>{const b=v=>btoa(JSON.stringify(v));const token=`${b({alg:'HS256',typ:'JWT'})}.${b({sub:uid,role:'authenticated',exp:Math.floor(Date.now()/1000)+7200})}.fixture`;localStorage.setItem('sb-evzrzwbemqrwlaqeowkq-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+7200,expires_in:7200,token_type:'bearer',user:{id:uid,email:'fixture@example.invalid',app_metadata:{provider:'email'},user_metadata:{}}}));},uid);
  await page.reload();await visible('#community-feed');
  await go('/runner');await visible('#runner-calendar');assert.equal(await page.locator('.calendar-cell time').count(),31);assert.equal(await page.locator('.calendar-event').filter({hasText:'오리엔테이션'}).count(),7);
  const before=log.length;await page.locator('#month-prev').click();assert.equal(await page.locator('.calendar-event').count(),0);assert.match(await page.locator('#calendar-month').innerText(),/9월/);await page.locator('#month-next').click();assert.equal(log.length,before);
  await page.screenshot({path:resolve(out,'runner-desktop.png'),fullPage:true});
  await go('/');await visible('.site-header');await checkChrome(true);assert.equal(await page.locator('#account-nav a[href="#/runner"]').count(),1);assert.equal(await page.locator('#mobile-auth-links a[href="#/runner"]').count(),1);
  await go('/community/anonymous');await visible('#community-feed');assert.equal(await page.locator('.community-row').count(),20);await checkChrome(false);
  assert(!await page.locator('#community-feed').innerText().then(t=>t.includes('홈페이지닉네임')));assert.equal(await page.locator('#app script').count(),0);
  const queries=log.filter(x=>x.table==='community_posts'&&x.method==='GET');assert(queries.every(x=>new URLSearchParams(x.query).get('limit')==='21'||new URLSearchParams(x.query).has('id')));
  assert(!log.some(x=>x.headers.prefer?.includes('count=exact')));
  await page.screenshot({path:resolve(out,'anonymous-desktop.png'),fullPage:true});
  await page.locator('#feed-pagination button').last().click();await page.waitForFunction(()=>document.querySelector('#feed-pagination').innerText.includes('2 페이지'));assert.equal(await page.locator('.community-row').count(),20);
  await page.locator('#feed-pagination button').first().click();await page.waitForFunction(()=>document.querySelector('#feed-pagination').innerText.includes('1 페이지'));
  await page.locator('.community-row-link').first().click();await visible('#community-comment-form');await page.waitForFunction(()=>document.querySelector('#community-view-count').textContent==='1');
  const viewCalls=log.filter(x=>x.table==='increment_community_post_view').length;await page.reload();await visible('#community-comment-form');assert.equal(log.filter(x=>x.table==='increment_community_post_view').length,viewCalls);
  await page.locator('#community-comment-form textarea').fill('**내 댓글**');await page.locator('#community-comment-form button').click();await visible('.community-comment');assert.equal(await page.locator('#community-comment-count').innerText(),'1');assert.equal(await page.locator('.community-comment strong').innerText(),'내 댓글');
  await page.locator('[data-action="comment-edit"]').click();await page.locator('.community-comment textarea').fill('수정 댓글');await page.locator('.community-comment [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.community-comment')?.innerText.includes('수정 댓글'));
  await page.locator('[data-action="comment-delete"]').click();await page.waitForFunction(()=>document.querySelector('#community-comment-count').textContent==='0');
  await page.locator('[data-action="post-edit"]').click();await visible('#community-post-form');await page.locator('input[name=title]').fill('수정된 글');await page.locator('#community-post-form [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#app h1')?.textContent==='수정된 글');
  await page.locator('[data-action="post-delete"]').click();await visible('#community-feed');
  await page.locator('.community-nav .community-cta').click();await visible('#community-post-form');await page.locator('input[name=title]').fill('새 익명 글');await page.locator('#community-post-form textarea').fill('# 제목\n\n**굵게** [위험](javascript:alert(1))\n\n- 목록\n\n```js\nconst x = 1;\n```\n\n<script>unsafe</script>');await page.locator('#community-post-form [type=submit]').click();await visible('#community-comment-form');

  assert.equal(await page.locator('.community-post-content h1').innerText(),'제목');assert.equal(await page.locator('.community-post-content strong').innerText(),'굵게');assert.equal(await page.locator('.community-post-content script').count(),0);assert(!await page.locator('.community-post-content a').getAttribute('href').then(h=>h.startsWith('javascript:')));
  await page.locator('[data-reaction="like"]').click();await page.waitForFunction(()=>document.querySelector('[data-reaction="like"]').getAttribute('aria-pressed')==='true');assert.equal(await page.locator('[data-reaction="like"] span').innerText(),'1');
  await page.locator('[data-reaction="bookmark"]').click();await page.waitForFunction(()=>document.querySelector('[data-reaction="bookmark"]').getAttribute('aria-pressed')==='true');
  await page.reload();await visible('#community-comment-form');assert.equal(await page.locator('[data-reaction="bookmark"]').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:resolve(out,'markdown-reactions-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('[data-reaction="like"]').click();await page.waitForFunction(()=>document.querySelector('[data-reaction="like"]').getAttribute('aria-pressed')==='false');assert.equal(await page.locator('[data-reaction="like"] span').innerText(),'0');
  await page.screenshot({path:resolve(out,'markdown-reactions-mobile.png'),fullPage:true});await page.setViewportSize({width:1280,height:900});
  await go('/community/anonymous/saved');await visible('#community-feed');assert.equal(await page.locator('.community-row').count(),1);await page.locator('[data-reaction="bookmark"]').click();await visible('.community-empty');assert.equal(await page.locator('.community-row').count(),0);
  await go('/community/stock');await visible('#stock-profile-form');await page.locator('input[name=nickname]').fill('중복');await page.locator('#stock-profile-form button').click();await page.waitForFunction(()=>document.querySelector('.community-error').textContent.includes('이미 사용'));
  await page.locator('input[name=nickname]').fill('종토전용닉네임');await page.locator('textarea[name=bio]').fill('한줄 소개');await page.locator('#stock-profile-form button').click();await visible('#community-feed');
  await page.locator('.community-nav .community-cta').click();await visible('#community-post-form');assert.match(await page.locator('#app').innerText(),/종토전용닉네임/);await page.locator('input[name=title]').fill('핑후 이야기');await page.locator('#community-post-form textarea').fill('**종목토론 본문**');await page.locator('#community-post-form [type=submit]').click();await visible('#community-comment-form');assert.match(await page.locator('#app').innerText(),/종토전용닉네임/);
  assert.equal(await page.locator('.community-post-content strong').innerText(),'종목토론 본문');await page.locator('[data-reaction="like"]').click();await page.waitForFunction(()=>document.querySelector('[data-reaction="like"] span').textContent==='1');await page.locator('[data-reaction="bookmark"]').click();await page.waitForFunction(()=>document.querySelector('[data-reaction="bookmark"]').getAttribute('aria-pressed')==='true');
  await go('/community/stock/profile');await visible('#stock-profile-form');await page.locator('input[name=nickname]').fill('수정종토닉네임');await page.locator('#stock-profile-form button').click();await visible('#community-feed');assert.match(await page.locator('#community-feed').innerText(),/수정종토닉네임/);assert(!await page.locator('#community-feed').innerText().then(t=>t.includes('한줄 소개')));
  await page.screenshot({path:resolve(out,'stock-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:resolve(out,'stock-mobile.png'),fullPage:true});
  await go('/community/stock/profile');await visible('#stock-profile-form');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve(out,'profile-mobile.png'),fullPage:true});
  await go('/community/stock/write');await visible('#community-post-form');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve(out,'write-mobile.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});await go('/runner');await visible('#runner-calendar');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:resolve(out,'runner-mobile.png'),fullPage:true});
  posts=seed();log=[];await go('/community/anonymous');await visible('#community-feed');assert.equal(await page.locator('.community-pagination').isVisible(),false);await page.screenshot({path:resolve(out,'anonymous-mobile.png'),fullPage:true});
  for(let i=0;i<4;i++){await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(180);}
  await page.waitForFunction(()=>document.querySelectorAll('.community-row').length===45);const offsets=log.filter(x=>x.table==='community_posts').map(x=>new URLSearchParams(x.query).get('offset')||'0');assert.deepEqual(offsets,['0','20','40']);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  comments=Array.from({length:45},(_,i)=>({id:200+i,post_id:45,user_id:i===0?uid:other,content:`댓글 ${i}`,created_at:new Date(Date.UTC(2026,9,6,0,0,i)).toISOString(),edited_at:null}));posts[0].comment_count=45;
  await go('/community/anonymous/45');await visible('#community-comment-form');assert.equal(await page.locator('.community-comment').count(),40);await page.locator('#comments-more').click();await page.waitForFunction(()=>document.querySelectorAll('.community-comment').length===45);assert.equal(await page.locator('#comments-more').isVisible(),false);
  await page.screenshot({path:resolve(out,'detail-mobile.png'),fullPage:true});
  await page.locator('[data-action="comment-delete"]').click();await page.waitForFunction(()=>document.querySelectorAll('.community-comment').length===40);await page.locator('#comments-more').click();await page.waitForFunction(()=>document.querySelectorAll('.community-comment').length===44);
  await go('/community/anonymous/44');await visible('#community-comment-form');assert.equal(await page.locator('[data-action="post-edit"],[data-action="post-delete"]').count(),0);
  // An in-flight request must not overwrite a newer route.
  await go('/community/anonymous');await go('/recruit');await visible('.site-header');await page.waitForTimeout(200);await checkChrome(true);assert.equal(await page.locator('.community-shell').count(),0);
  await go('/board/press');await visible('.board-list');await checkChrome(true);await go('/board/resources');await visible('.board-list');await checkChrome(true);
  admin=true;await page.reload();await visible('.board-list');await go('/admin/new');await visible('#admin-post-form');await checkChrome(true);
  await go('/community/anonymous/44');await visible('#community-comment-form');assert.equal(await page.locator('[data-action="post-edit"]').count(),0);assert.equal(await page.locator('[data-action="post-delete"]').count(),1);
  await go('/runner');await visible('#runner-calendar');await page.evaluate(async()=>{const {signOut}=await import('/js/auth.js');await signOut();});await page.waitForFunction(()=>document.querySelector('#app').innerText.includes('로그인이 필요'));assert.equal(await page.locator('#runner-calendar').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile calendar, chrome, menu, pagination/infinite scroll, escaping, UI CRUD, profile uniqueness/edit, session views, route races, logout, PRESS/RESOURCE/admin smoke.');
} catch(error) {await page.screenshot({path:resolve(out,'failure.png'),fullPage:true});console.error(await page.locator('#app').innerText());throw error;}
finally {await browser.close();await new Promise(r=>server.close(r));}
