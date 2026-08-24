import { subHero } from '../ui.js';

const steps = [
  ['01', '지원서 접수', '당신의 경험과 가능성을 들려주세요.'],
  ['02', '컬처 인터뷰', '서로의 일하는 방식을 알아갑니다.'],
  ['03', '직무 인터뷰', '실무 역량과 성장 가능성을 이야기합니다.'],
  ['04', '최종 합류', '픽후컴퍼니의 새로운 동료가 됩니다.']
];

export function renderRecruit() {
  return `${subHero('CAREERS', '채용정보', '당신만의 가능성으로 픽후컴퍼니의 다음 장면을 함께 만들어 주세요.')}<section class="shell recruit-page"><div class="recruit-lead"><span class="eyebrow dark">WORK WITH US</span><h2>다름이 모여<br>더 큰 가능성이 됩니다.</h2><p>픽후컴퍼니는 스스로 질문하고, 동료와 답을 찾아가며, 자신의 선택을 끝까지 책임지는 사람과 함께합니다.</p></div><div class="recruit-steps">${steps.map((step) => `<div><span>${step[0]}</span><h3>${step[1]}</h3><p>${step[2]}</p></div>`).join('')}</div><div class="open-position"><div><small>OPEN POSITION</small><h3>현재 진행 중인 채용</h3></div><p>현재 진행 중인 공개 채용이 없습니다.<br>새로운 소식은 보도자료에서 가장 먼저 확인하실 수 있습니다.</p><a href="#/board/press">소식 확인하기 ↗</a></div></section>`;
}
