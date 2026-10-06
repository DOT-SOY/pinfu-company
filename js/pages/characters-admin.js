import { getAuthState } from '../auth.js';
import { characterApi } from '../characters.js';
import { characterId, editChanges, changeSummary, modifierSummary, usageSummary, characterError } from '../character-admin-model.js';
import { esc, message } from '../ui.js';

let activePage = null;
export function confirmLeaveCharactersAdmin(release = true) {
  if (!activePage) return true;
  if (activePage.busy) { alert('저장 결과를 확인한 뒤 이동해주세요.'); return false; }
  if (activePage.dirty && !confirm('저장하지 않은 캐릭터 수정사항을 버리고 이동할까요?')) return false;
  if (release) activePage = null;
  return true;
}
window.addEventListener('beforeunload', event => {
  if (!activePage?.dirty && !activePage?.busy) return;
  event.preventDefault(); event.returnValue = '';
});

export function renderCharactersAdmin() {
  activePage = null;
  const auth = getAuthState();
  if (!auth.loggedIn) return '<section class="shell status-page">' + message('로그인이 필요합니다.', 'error') + '<a href="#/login">로그인하기</a></section>';
  if (!auth.isAdmin) return '<section class="shell status-page">' + message('관리자 권한이 없습니다.', 'error') + '</section>';
  return `<section class="character-admin" data-character-admin>
    <header class="character-admin-heading"><div><small>CHARACTER ADMIN</small><h1>캐릭터 관리</h1><p>현재 수치와 보유 스킬을 확인하고 관리합니다.</p></div>
      </header>
    <div class="character-workspace">
      <aside class="character-sidebar"><form id="character-search"><label for="character-search-name">캐릭터 이름 검색</label>
        <div class="character-search-row"><input id="character-search-name" name="search" type="search" maxlength="200" placeholder="이름으로 검색"><button type="submit">검색</button></div>
        <label for="character-active-filter">활성 상태</label><select id="character-active-filter" name="active"><option value="">전체</option><option value="true">활성</option><option value="false">비활성</option></select></form>
        <div id="character-list" aria-live="polite"><p class="character-empty">캐릭터 목록을 불러오는 중…</p></div>
      </aside>
      <main id="character-detail" class="character-detail" aria-live="polite"><div class="character-empty"><h2>캐릭터를 선택해주세요</h2><p>왼쪽 목록에서 수치와 스킬을 확인할 캐릭터를 선택하세요.</p></div></main>
    </div>
  </section>`;
}

function skillCard(skill) {
  return `<article class="character-skill-card"><header><h3>${esc(skill.name)}</h3>
    <div>${!skill.enabled ? '<span class="character-badge muted">정의 비활성</span>' : ''}<button type="button" class="character-revoke" data-revoke-skill="${esc(skill.id)}">회수</button></div></header>
    ${skill.description ? '<p>' + esc(skill.description) + '</p>' : ''}
    <ul>${skill.modifiers.map(m => `<li><span>${esc(modifierSummary(m))}</span><small>${esc(usageSummary(m))} · ${!m.enabled ? '효과 비활성' : !skill.enabled ? '스킬 비활성' : m.available ? '적용 조건 충족 시 사용 가능' : '사용 한도 소진'}</small></li>`).join('') || '<li>등록된 효과가 없습니다.</li>'}</ul>
  </article>`;
}

export function renderCharacterDetail(data) {
  const c = data.character;
  const daily = data.daily;
  return `<header class="character-detail-heading"><div><small>CHARACTER</small><h2>${esc(c.name)}</h2><p>commu 프로필 ID <code>${esc(c.commu_profile_id)}</code></p></div>
    <button type="button" id="character-reload">새로고침</button></header>
    <section class="character-daily" aria-label="오늘 행동 조회">
      <div><span>오늘 행동</span><strong>${esc(daily.used)} / ${daily.maximum == null ? '—' : esc(daily.maximum)}<small>회</small></strong></div>
      <div><span>남은 행동</span><strong>${daily.remaining == null ? '—' : esc(daily.remaining)}<small>회</small></strong></div>
      <p>Asia/Seoul 기준 · 조회 전용<br>스킬의 일일 행동 보너스 반영</p>
    </section>
    ${daily.error ? message('스킬 설정 오류로 최대·남은 행동횟수를 계산할 수 없습니다. 봇 설정을 확인해주세요.', 'error') : ''}
    <p class="character-note">조회 시각: ${esc(new Date(data.as_of).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }))} (서울)<br>횟수는 조회 시점의 값입니다. 최신 상태는 새로고침으로 확인하세요.</p>
    <form id="character-edit"><fieldset><legend>기본 정보</legend><div class="character-fields">
      <label>캐릭터 이름<input name="name" maxlength="200" required value="${esc(c.name)}"><small>봇이 다음 게시물 처리 시 commu 이름으로 다시 동기화할 수 있습니다.</small></label>
      <label>활성 상태<select name="active"><option value="true" ${c.active ? 'selected' : ''}>활성</option><option value="false" ${!c.active ? 'selected' : ''}>비활성</option></select></label>
      <label>컨디션<input name="condition" type="number" min="0" max="2147483647" step="1" required value="${esc(c.condition)}"></label>
      <label>기본 일일 행동횟수<input name="base_daily_actions" type="number" min="0" max="2147483647" step="1" required value="${esc(c.base_daily_actions)}"></label>
    </div></fieldset>
    <fieldset><legend>캐릭터 스탯</legend><p class="character-note">항목은 등록된 스탯 정의에서 자동으로 불러옵니다. 여기서는 이 캐릭터의 값만 수정합니다.</p>
      <div class="character-stat-grid">${data.stats.map(stat => `<label>${esc(stat.display_name)}${!stat.enabled ? '<small>정의 비활성</small>' : ''}
        <input type="number" data-stat-id="${esc(stat.stat_id)}" step="1" min="-2147483648" max="2147483647" value="${stat.value == null ? '' : esc(stat.value)}" placeholder="미등록">
        ${stat.value == null ? '<small>값을 입력해 저장하면 이 캐릭터의 스탯 행을 등록합니다.</small>' : ''}</label>`).join('') || '<p class="character-empty">등록된 스탯이 없습니다.</p>'}</div>
    </fieldset>
    <section class="character-review"><h3>저장 전 변경사항</h3><div id="character-change-preview"><p>아직 변경한 항목이 없습니다.</p></div></section>
    <label class="character-pause"><input id="character-bot-paused" type="checkbox">봇 실행을 일시 중지했습니다. (이 확인란이 봇을 자동으로 중지하지는 않습니다.)</label>
    <p class="character-note">봇과 동시에 수정하면 값이 덮어써질 수 있습니다. 기본 수치 저장·스킬 부여·회수 전에 봇을 중지해주세요.</p>
    <div class="character-actions"><button class="submit-button" type="submit">변경사항 저장</button><button type="button" id="character-reset">취소</button><span id="character-save-message" role="status"></span></div>
    </form>
    <section class="character-skills"><header><div><h2>보유 스킬</h2><p>사용 제한은 스킬 전체가 아닌 개별 효과별로 계산됩니다.</p></div><button type="button" id="character-open-grant">＋ 스킬 부여</button></header>
      <div class="character-skill-list">${data.skills.map(skillCard).join('') || '<p class="character-empty">보유한 스킬이 없습니다.</p>'}</div>
      <div id="character-grant" hidden><p class="character-note">찾는 스킬이 없나요? <a href="#/admin/skills?new=1">새 스킬 만들기 →</a></p><form id="character-skill-search"><label>기존 스킬 검색<input type="search" name="search" maxlength="200" placeholder="활성화된 스킬 이름"></label><button type="submit">검색</button></form><div id="character-skill-results"></div></div>
      <div id="character-skill-message" role="status"></div>
    </section>`;
}

export function bindCharactersAdmin(params) {
  const root = document.querySelector('[data-character-admin]');
  if (!root) return;
  const page = { dirty: false, busy: false, data: null, selected: null, listVersion: 0, detailVersion: 0, skillVersion: 0,
    offset: 0, search: '', active: null, skillOffset: 0, skillSearch: '', user: getAuthState().user?.id };
  activePage = page;
  const live = () => root.isConnected && activePage === page && getAuthState().isAdmin && getAuthState().user?.id === page.user;
  const listBox = root.querySelector('#character-list');
  const detailBox = root.querySelector('#character-detail');
  const canDiscard = () => !page.busy && (!page.dirty || confirm('저장하지 않은 수치 변경을 취소할까요?'));
  const messageAt = (id, text, type = 'error') => {
    const box = root.querySelector(id);
    if (box) box.innerHTML = message(text, type);
  };
  function readEdits() {
    const form = root.querySelector('#character-edit');
    const values = new FormData(form);
    const statValues = Object.fromEntries([...form.querySelectorAll('[data-stat-id]')].map(input => [input.dataset.statId, input.value]));
    return editChanges(page.data, { name: values.get('name'), condition: values.get('condition'),
      base_daily_actions: values.get('base_daily_actions'), active: values.get('active') === 'true' }, statValues);
  }
  function updateReview() {
    try {
      const rows = changeSummary(page.data, readEdits());
      page.dirty = rows.length > 0;
      root.querySelector('#character-change-preview').innerHTML = rows.length
        ? '<ul>' + rows.map(row => '<li><span>' + esc(row.label) + '</span><strong>' + esc(row.before) + ' → ' + esc(row.after) + '</strong></li>').join('') + '</ul>'
        : '<p>아직 변경한 항목이 없습니다.</p>';
    } catch (error) {
      page.dirty = true;
      messageAt('#character-change-preview', characterError(error));
    }
  }
  function showDetail(data) {
    page.data = data; page.dirty = false; page.skillVersion++;
    detailBox.innerHTML = renderCharacterDetail(data);
    root.querySelector('#character-edit').addEventListener('input', updateReview);
    root.querySelector('#character-edit').addEventListener('change', updateReview);
    root.querySelector('#character-edit').addEventListener('submit', async event => {
      event.preventDefault();
      if (page.busy) return;
      let changes;
      try { changes = readEdits(); } catch (error) { messageAt('#character-save-message', characterError(error)); return; }
      if (!Object.keys(changes).length) { messageAt('#character-save-message', '변경한 항목이 없습니다.', ''); return; }
      if (!root.querySelector('#character-bot-paused').checked) { messageAt('#character-save-message', characterError({ message: 'BOT_PAUSE_REQUIRED' })); return; }
      const summary = changeSummary(page.data, changes).map(row => row.label + ': ' + row.before + ' → ' + row.after).join('\n');
      if (!confirm(summary + '\n\n변경사항을 저장할까요?')) return;
      await mutate(() => characterApi.save(page.selected, page.data.revision, changes, true), '#character-save-message', '변경사항을 저장했습니다.');
    });
    root.querySelector('#character-reset').addEventListener('click', () => { if (canDiscard()) showDetail(page.data); });
    root.querySelector('#character-reload').addEventListener('click', () => selectCharacter(page.selected));
    root.querySelector('#character-open-grant').addEventListener('click', () => {
      root.querySelector('#character-grant').hidden = false; page.skillOffset = 0; loadSkills();
    });
    root.querySelector('#character-skill-search').addEventListener('submit', event => {
      event.preventDefault(); page.skillSearch = String(new FormData(event.currentTarget).get('search')).trim(); page.skillOffset = 0; loadSkills();
    });
    root.querySelectorAll('[data-revoke-skill]').forEach(button => button.addEventListener('click', () => changeSkill(button.dataset.revokeSkill, false)));
  }
  async function mutate(operation, messageId, successText) {
    if (page.busy) return;
    page.busy = true;
    page.skillVersion++; // Ignore pending skill searches during a relationship change.
    const controls = [...detailBox.querySelectorAll('button,input,select')].map(control => [control, control.disabled]);
    controls.forEach(([control]) => control.disabled = true);
    messageAt(messageId, '저장 중…', '');
    try {
      const data = await operation();
      if (!live()) return;
      showDetail(data);
      messageAt(messageId, successText, 'success');
      loadList(false);
    } catch (error) {
      if (live()) messageAt(messageId, characterError(error));
    } finally {
      page.busy = false;
      if (live()) controls.forEach(([control, disabled]) => { if (control.isConnected) control.disabled = disabled; });
    }
  }
  async function changeSkill(skillId, active) {
    if (page.busy) return;
    if (page.dirty) { messageAt('#character-skill-message', '먼저 기본 정보·스탯 변경사항을 저장하거나 취소해주세요.'); return; }
    if (!root.querySelector('#character-bot-paused').checked) { messageAt('#character-skill-message', characterError({ message: 'BOT_PAUSE_REQUIRED' })); return; }
    const label = active ? '부여' : '회수';
    const question = active ? '선택한 캐릭터에게 스킬을 부여할까요?' : '선택한 캐릭터의 스킬을 회수할까요?';
    if (!confirm(question + '\n공유 스킬 정의와 다른 캐릭터의 스킬은 변경하지 않습니다.')) return;
    await mutate(() => characterApi.setSkill(page.selected, skillId, active, true), '#character-skill-message', '스킬을 ' + label + '했습니다.');
  }
  async function loadSkills() {
    const version = ++page.skillVersion;
    const box = root.querySelector('#character-skill-results');
    box.innerHTML = message('스킬을 불러오는 중…');
    try {
      const data = await characterApi.skills(page.selected, page.skillSearch, page.skillOffset);
      if (!live() || version !== page.skillVersion) return;
      box.innerHTML = data.items.map(skill => `<article><div><strong>${esc(skill.name)}</strong><p>${esc(skill.description || '')}</p></div><button type="button" data-grant-skill="${esc(skill.id)}">부여</button></article>`).join('') || '<p>부여할 수 있는 스킬이 없습니다.</p>';
      box.insertAdjacentHTML('beforeend', `<div class="character-pagination"><button type="button" data-skill-page="-1" ${page.skillOffset === 0 ? 'disabled' : ''}>이전</button><span>${page.skillOffset + (data.items.length ? 1 : 0)}–${page.skillOffset + data.items.length} / ${data.total}</span><button type="button" data-skill-page="1" ${page.skillOffset + 20 >= data.total ? 'disabled' : ''}>다음</button></div>`);
      box.querySelectorAll('[data-grant-skill]').forEach(button => button.addEventListener('click', () => changeSkill(button.dataset.grantSkill, true)));
      box.querySelectorAll('[data-skill-page]').forEach(button => button.addEventListener('click', () => { if (page.busy) return; page.skillOffset += Number(button.dataset.skillPage) * 20; loadSkills(); }));
    } catch (error) { if (live() && version === page.skillVersion) box.innerHTML = message(characterError(error), 'error'); }
  }
  async function selectCharacter(id) {
    if (!live() || !canDiscard()) return;
    const version = ++page.detailVersion;
    page.skillVersion++; page.dirty = false; page.selected = id;
    detailBox.innerHTML = '<p class="character-empty">캐릭터 정보를 불러오는 중…</p>';
    root.querySelectorAll('[data-select-character]').forEach(button => button.classList.toggle('selected', button.dataset.selectCharacter === id));
    try {
      const data = await characterApi.detail(id);
      if (!live() || version !== page.detailVersion) return;
      showDetail(data);
      history.replaceState(null, '', '#/admin/characters?id=' + encodeURIComponent(id));
    } catch (error) {
      if (live() && version === page.detailVersion) detailBox.innerHTML = message(characterError(error), 'error') + '<button type="button" id="character-retry">다시 시도</button>';
      detailBox.querySelector('#character-retry')?.addEventListener('click', () => selectCharacter(id));
    }
  }
  async function loadList(selectInitial = true) {
    const version = ++page.listVersion;
    listBox.innerHTML = '<p class="character-empty">목록을 불러오는 중…</p>';
    try {
      const data = await characterApi.list({ search: page.search, active: page.active, offset: page.offset });
      if (!live() || version !== page.listVersion) return;
      listBox.innerHTML = `<p class="character-list-count">검색 결과 ${data.total}명</p>` + data.items.map(c =>
        `<button type="button" class="character-list-item ${page.selected === c.id ? 'selected' : ''}" data-select-character="${esc(c.id)}"><strong>${esc(c.name)}</strong><span class="character-badge ${c.active ? '' : 'muted'}">${c.active ? '활성' : '비활성'}</span></button>`).join('');
      if (!data.items.length) listBox.insertAdjacentHTML('beforeend', '<p class="character-empty">검색 결과가 없습니다.</p>');
      listBox.insertAdjacentHTML('beforeend', `<div class="character-pagination"><button type="button" data-character-page="-1" ${page.offset === 0 ? 'disabled' : ''}>이전</button><span>${Math.floor(page.offset / 25) + 1} / ${Math.max(1, Math.ceil(data.total / 25))}</span><button type="button" data-character-page="1" ${page.offset + 25 >= data.total ? 'disabled' : ''}>다음</button></div>`);
      listBox.querySelectorAll('[data-select-character]').forEach(button => button.addEventListener('click', () => selectCharacter(button.dataset.selectCharacter)));
      listBox.querySelectorAll('[data-character-page]').forEach(button => button.addEventListener('click', () => { if (page.busy) return; page.offset += Number(button.dataset.characterPage) * 25; loadList(false); }));
      if (selectInitial && !page.selected) {
        const id = params.get('id') || data.items[0]?.id;
        if (id) { characterId(id); await selectCharacter(id); }
      }
    } catch (error) { if (live() && version === page.listVersion) listBox.innerHTML = message(characterError(error), 'error'); }
  }
  const searchForm = root.querySelector('#character-search');
  const search = event => {
    event.preventDefault(); if (page.busy) return;
    const values = new FormData(searchForm);
    page.search = String(values.get('search')).trim();
    page.active = values.get('active') === '' ? null : values.get('active') === 'true';
    page.offset = 0; loadList(false);
  };
  searchForm.addEventListener('submit', search);
  root.querySelector('#character-active-filter').addEventListener('change', search);
  loadList();
}
