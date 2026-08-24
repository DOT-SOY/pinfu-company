import { esc } from '../ui.js';

function service(number, icon, title, copy, href) {
  return `<a class="service-card" href="${href}"><span class="service-number">${number}</span><span class="card-arrow">↗</span><div class="service-icon">${icon}</div><h3>${title}</h3><p>${copy}</p></a>`;
}

export function renderHome(notices) {
  return [
    '<section class="hero"><div class="shell hero-inner"><div class="hero-copy"><span class="eyebrow">A WIN WITH THE HAND WE HAVE</span><h1>좋은 패를 기다리기보다,<br><em>들어온 패로 화료</em>합니다.</h1><p>1962년부터 전동작탁과 마작용품을 만들어 온 회사.<br>아직 사람이 출근하고, 일하고, 월급을 받는 핑후컴퍼니입니다.</p><a class="primary-button" href="#/company/ceo">회사 이야기 보기 <span>↗</span></a></div></div></section>',
    '<section class="business shell"><div class="section-heading"><div><span class="eyebrow dark">OUR COMPANY</span><h2>핑후컴퍼니를<br>소개합니다.</h2></div><p>전동작탁과 마작패를 만들며<br>사람의 손끝과 경험을 지켜 왔습니다.</p></div><div class="service-grid">',
    service('01', '◎', '회사소개', '1962년 설립된 마작용품 전문 제조기업을 소개합니다.', '#/company/ceo'),
    service('02', '▤', '자료마당', '새로운 소식과 사내 자료를 한곳에서 확인하세요.', '#/board/press'),
    service('03', '◇', '채용정보', '당신의 가능성이 우리의 다음 장면이 됩니다.', '#/recruit'),
    '</div></section>',
    '<section class="news-band"><div class="shell news-grid"><div class="news-title"><span class="eyebrow">PINGHU NEWS</span><h2>노동한국의 오늘을<br>전합니다.</h2><a href="#/board/press">전체 보기 ↗</a></div><div class="notice-list">',
    notices.map((post, index) => `<a href="#/board/press/${post.id}"><span>0${index + 1}</span><strong>${esc(post.title)}</strong><time>${esc(post.publishedMonth)}</time><i>→</i></a>`).join(''),
    '</div></div></section>'
  ].join('');
}
