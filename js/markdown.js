import { esc } from './ui.js';

function safeUrl(value) {
  const url = String(value || '').trim();
  if (/^(https?:\/\/|mailto:|#)/i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return '#';
  return url || '#';
}

function renderInline(value) {
  const tokens = [];
  const hold = (html) => {
    const token = `\u0000${tokens.length}\u0000`;
    tokens.push(html);
    return token;
  };

  let source = String(value || '').replace(/\u0000/g, '');
  source = source.replace(/`([^`\n]+)`/g, (_match, code) => hold(`<code>${esc(code)}</code>`));
  source = source.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g, (_match, alt, url, title) => {
    const safe = safeUrl(url);
    const titleAttribute = title ? ` title="${esc(title)}"` : '';
    return hold(`<img src="${esc(safe)}" alt="${esc(alt)}"${titleAttribute} loading="lazy">`);
  });
  source = source.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g, (_match, label, url, title) => {
    const safe = safeUrl(url);
    const external = /^https?:\/\//i.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : '';
    const titleAttribute = title ? ` title="${esc(title)}"` : '';
    return hold(`<a href="${esc(safe)}"${titleAttribute}${external}>${esc(label)}</a>`);
  });

  source = esc(source)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

  return source.replace(/\u0000(\d+)\u0000/g, (_match, index) => tokens[Number(index)] || '');
}

function splitTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function isBlockStart(lines, index) {
  const line = lines[index] || '';
  const next = lines[index + 1] || '';
  return /^```/.test(line) || /^#{1,6}\s+/.test(line) || /^>\s?/.test(line) || /^\s*([-+*]|\d+\.)\s+/.test(line) || /^\s*((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line) || (line.includes('|') && /^\s*\|?\s*:?-{3,}:?/.test(next));
}

export function renderMarkdown(value) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^```\s*([a-z0-9_-]*)\s*$/i);
    if (fence) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` class="language-${esc(fence[1].toLowerCase())}"` : '';
      output.push(`<pre><code${language}>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s*((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/.test(line)) {
      output.push('<hr>');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
      output.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`);
      continue;
    }

    const listMatch = line.match(/^\s*([-+*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[1]);
      const tag = ordered ? 'ol' : 'ul';
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-+*]|\d+\.)\s+(.+)$/);
        if (!item || /\d+\./.test(item[1]) !== ordered) break;
        items.push(`<li>${renderInline(item[2])}</li>`);
        index += 1;
      }
      output.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    const next = lines[index + 1] || '';
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?/.test(next)) {
      const headers = splitTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) rows.push(splitTableRow(lines[index++]));
      output.push(`<div class="markdown-table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_header, cellIndex) => `<td>${renderInline(row[cellIndex] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) paragraph.push(lines[index++]);
    output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
  }

  return output.join('');
}
