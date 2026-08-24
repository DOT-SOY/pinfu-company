import { subHero } from '../ui.js';
import { COMPANY_PAGES, CEO_CONTENT, TALENT_VALUES, HISTORY_ITEMS, ORGANIZATION_TEAMS } from '../data/company-content.js';

const menus = [
  ['ceo', 'CEO 인사말'],
  ['talent', '핑후컴퍼니 인재상'],
  ['history', '회사 연혁'],
  ['organization', '조직도']
];

function sideNav(active) {
  return `<aside class="side-nav"><strong>회사소개</strong>${menus.map((item) => `<a class="${active === item[0] ? 'active' : ''}" href="#/company/${item[0]}">${item[1]}<span>→</span></a>`).join('')}</aside>`;
}

function renderCeo() {
  return `<div class="ceo-message"><span class="quote-mark">“</span><h2>${CEO_CONTENT.heading}</h2>${CEO_CONTENT.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('')}<div class="signature"><span>${CEO_CONTENT.signatureLabel}</span><strong>${CEO_CONTENT.signatureName}</strong></div></div>`;
}

function renderTalent() {
  return `<div class="article-lead"><h2>PINFU 人</h2><p>핑후컴퍼니는 오래 함께할 인재를 기다립니다. 정말 오래요.</p></div><div class="value-list">${TALENT_VALUES.map((value) => `<div><span>${value[0]}</span><h3>${value[1]}</h3><p>${value[2]}</p></div>`).join('')}</div>`;
}

function renderHistory() {
  return `<div class="timeline">${HISTORY_ITEMS.map((item) => `<div><strong>${item[0]}</strong><ul><li>${item[1]}</li><li>${item[2]}</li></ul></div>`).join('')}</div>`;
}

function renderOrganization() {
  return `<div class="org-chart"><div class="org-ceo">CEO<strong>대표이사</strong></div><div class="org-line"></div><div class="org-teams">${ORGANIZATION_TEAMS.map((team) => `<div><h3>${team[0]}</h3><span>${team[1]}</span><span>${team[2]}</span></div>`).join('')}</div></div>`;
}

function companyContent(slug) {
  if (slug === 'talent') return renderTalent();
  if (slug === 'history') return renderHistory();
  if (slug === 'organization') return renderOrganization();
  return renderCeo();
}

export function getCompanyTitle(slug) {
  return (COMPANY_PAGES[slug] || COMPANY_PAGES.ceo).title;
}

export function renderCompany(slug = 'ceo') {
  const page = COMPANY_PAGES[slug] || COMPANY_PAGES.ceo;
  return `${subHero(page.eyebrow, page.title, page.description)}<div class="shell sub-layout">${sideNav(slug)}<article class="content-panel">${companyContent(slug)}</article></div>`;
}
