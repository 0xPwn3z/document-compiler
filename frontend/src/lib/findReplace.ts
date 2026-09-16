/**
 * Find & replace core for the Markdown mirror.
 *
 * Structural dc:* marker lines (and the doc-compiler header) are never
 * touched: they carry the block ids and Word styles that the exporter
 * relies on, and they are not user-visible content. Ported 1:1 from the
 * battle-tested vanilla implementation (see tests).
 */

export interface FindOptions {
  find: string
  replace?: string
  caseSensitive?: boolean
  wholeWord?: boolean
}

export interface MatchRange {
  start: number
  end: number
}

export interface ReplaceResult {
  result: string
  count: number
}

// Only full-line structural comments are protected — the same set the
// server-side parser skips (dc:block, dc:blank, dc:page-break, dc:opaque,
// doc-compiler header). Any other comment-looking line is content.
const MARKER_LINE = /^\s*<!--\s*(?:dc:(?:block|blank|page-break|opaque)\b|doc-compiler:)/

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildRegExp(find: string, caseSensitive: boolean, wholeWord: boolean): RegExp {
  let source = escapeRegExp(find)
  if (wholeWord) {
    source = `(?<![\\p{L}\\p{N}_])${source}(?![\\p{L}\\p{N}_])`
  }
  return new RegExp(source, (caseSensitive ? 'g' : 'gi') + 'u')
}

interface ResolvedOptions {
  find: string
  replace: string
  caseSensitive: boolean
  wholeWord: boolean
}

function resolveOptions(options: FindOptions): ResolvedOptions | null {
  if (!options.find) return null
  return {
    find: options.find,
    replace: options.replace ?? '',
    caseSensitive: options.caseSensitive ?? false,
    wholeWord: options.wholeWord ?? false,
  }
}

export function findMatches(markdown: string, options: FindOptions): MatchRange[] {
  const config = resolveOptions(options)
  const matches: MatchRange[] = []
  if (!config) return matches

  const regex = buildRegExp(config.find, config.caseSensitive, config.wholeWord)
  let offset = 0
  for (const line of markdown.split('\n')) {
    if (!MARKER_LINE.test(line)) {
      regex.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = regex.exec(line)) !== null) {
        matches.push({ start: offset + match.index, end: offset + match.index + match[0].length })
        if (match[0].length === 0) break
      }
    }
    offset += line.length + 1
  }
  return matches
}

export function replaceInMarkdown(markdown: string, options: FindOptions): ReplaceResult {
  const config = resolveOptions(options)
  if (!config) return { result: markdown, count: 0 }

  // The replacer is a function, so the replacement is inserted literally:
  // '$' insertion patterns ($&, $', $$...) never apply.
  const lines = markdown.split('\n')
  let count = 0
  const result = lines
    .map((line) => {
      if (MARKER_LINE.test(line)) return line
      return line.replace(buildRegExp(config.find, config.caseSensitive, config.wholeWord), () => {
        count += 1
        return config.replace
      })
    })
    .join('\n')
  return { result, count }
}
