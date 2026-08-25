export function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

export function lines(value) {
  return esc(value).replace(/\n/g, '<br>');
}

export function subHero(eyebrow, title, description) {
  return `<section class="sub-hero"><div class="shell"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div></section>`;
}

export function formatDate(value, withTime = false) {
  if (!value) return '-';
  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) return '-';
  const date = dateValue.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
  return withTime ? `${date} ${dateValue.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : date;
}

export const categoryFor = (board) => board === 'resources' ? 'RESOURCE' : 'PRESS';
export const boardFor = (category) => category === 'RESOURCE' ? 'resources' : 'press';

export function setBusy(button, busy, label = '처리 중…') {
  if (!button) return;
  button.disabled = busy;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
}

export function errorMessage(error, fallback) {
  console.error(error);
  if (error?.message === 'SUPABASE_CONNECTION_FAILED') return 'Supabase 연결에 실패했습니다.';
  if (error?.message === 'SUPABASE_NOT_CONFIGURED') return 'Supabase 연결 정보가 아직 설정되지 않았습니다.';
  if (error?.message === 'NICKNAME_TAKEN' || error?.code === '23505') return '이미 사용 중인 닉네임입니다.';
  if (error?.message?.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  return fallback;
}

export function message(text, type = '') {
  return `<p class="form-message ${type}" role="status">${esc(text)}</p>`;
}
