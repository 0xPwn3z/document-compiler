/**
 * Minimal Markdown renderer for the structural live preview.
 * Ported 1:1 from the vanilla implementation: it escapes all HTML first and
 * only re-introduces the handful of tags the editor dialect supports.
 */

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char] as string)
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/&lt;br&gt;/gi, '<br>')
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replaceAll('\\|', '|').trim())
}

const PLACEHOLDER = '<p class="muted">La preview apparirà qui mentre scrivi.</p>'

export function renderMarkdown(markdown: string): string {
  const source = markdown.replace(/^\s*<!--.*?-->\s*$/gm, '').trim()
  if (!source) return PLACEHOLDER

  const lines = source.split(/\n/)
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) {
      i++
      continue
    }
    if (line.startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const rows: string[][] = [splitRow(line)]
      i += 2
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]))
        i++
      }
      const head = `<thead><tr>${rows[0].map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead>`
      const body = `<tbody>${rows
        .slice(1)
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`
      out.push(`<table>${head}${body}</table>`)
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      i++
      continue
    }
    if (/^```/.test(line)) {
      i++
      const code: string[] = []
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++])
      i++
      out.push(`<pre>${escapeHtml(code.join('\n'))}</pre>`)
      continue
    }
    const list = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/)
    if (list) {
      const ordered = /^\d/.test(list[1])
      const items: string[] = []
      while (i < lines.length) {
        const item = lines[i].match(/^\s*([-*+]|\d+\.)\s+(.*)$/)
        if (!item) break
        items.push(`<li>${inline(item[2])}</li>`)
        i++
      }
      const tag = ordered ? 'ol' : 'ul'
      out.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }
    const paragraph = [line]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+/.test(lines[i]) && !/^\s*([-*+]|\d+\.)\s+(.*)$/.test(lines[i])) {
      paragraph.push(lines[i++].trim())
    }
    out.push(`<p>${inline(paragraph.join(' '))}</p>`)
  }
  return out.join('') || PLACEHOLDER
}

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}
