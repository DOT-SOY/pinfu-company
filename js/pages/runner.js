import { eventsForDate } from '../data/runner-schedule.js';
import { esc } from '../ui.js';

export const loginRequired = () => `<section class="runner-shell"><div class="runner-top"><strong>러너 전용</strong><a href="#/">홈으로</a></div><h1>로그인이 필요합니다.</h1><p>로그인 후 러너 전용 페이지와 커뮤니티를 이용할 수 있습니다.</p><a class="community-cta" href="#/login">로그인</a></section>`;
export function renderRunner() {
  return `<section class="runner-shell"><div class="runner-top"><h1>러너 전용</h1><a href="#/">홈으로</a></div><div class="calendar-toolbar"><button id="month-prev" aria-label="이전 달">‹</button><h2 id="calendar-month"></h2><button id="month-next" aria-label="다음 달">›</button></div><div id="runner-calendar" class="runner-calendar" aria-labelledby="calendar-month"></div><div class="runner-shortcuts"><a href="#/community/anonymous">익명게시판 <span>→</span></a><a href="#/community/stock">종목토론방 <span>→</span></a></div></section>`;
}
export function bindRunner() {
  let displayYear = 2026, displayMonth = 9;
  const draw = () => {
    document.getElementById('calendar-month').textContent = `${displayYear}년 ${displayMonth + 1}월`;
    const first = new Date(Date.UTC(displayYear,displayMonth,1)).getUTCDay();
    const days = new Date(Date.UTC(displayYear,displayMonth+1,0)).getUTCDate();
    let cells = ['일','월','화','수','목','금','토'].map(day => `<div class="calendar-weekday">${day}</div>`).join('');
    const total = Math.ceil((first+days)/7)*7;
    for (let i=0; i<total; i++) {
      const day = i-first+1;
      if (day<1 || day>days) { cells += '<div class="calendar-cell calendar-blank" aria-hidden="true"></div>'; continue; }
      const date = `${displayYear}-${String(displayMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      cells += `<div class="calendar-cell"><time datetime="${date}">${day}</time>${eventsForDate(date).map(item => `<div class="calendar-event">${esc(item.title)}${item.title === '최종면접 질문지 공개' && day === 25 ? '<small>20:00 시작</small>' : item.title === '최종면접 질문지 공개' && day === 27 ? '<small>23:59:59 종료</small>' : ''}</div>`).join('')}</div>`;
    }
    document.getElementById('runner-calendar').innerHTML = cells;
  };
  const move = delta => { displayMonth += delta; if (displayMonth<0) {displayMonth=11;displayYear--;} if (displayMonth>11) {displayMonth=0;displayYear++;} draw(); };
  document.getElementById('month-prev').onclick = () => move(-1);
  document.getElementById('month-next').onclick = () => move(1);
  draw();
}
