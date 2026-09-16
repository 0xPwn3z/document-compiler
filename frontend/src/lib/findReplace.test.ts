import { describe, expect, it } from 'vitest'
import { findMatches, replaceInMarkdown } from './findReplace'

const MARKER =
  '<!-- dc:block {"id":"b00001","kind":"paragraph","style":"Normal","body_index":1} -->'
const HEADER = '<!-- doc-compiler:version 1 -->'

describe('replaceInMarkdown', () => {
  it('replaces every content occurrence, case-insensitive by default', () => {
    const out = replaceInMarkdown('Il cliente ACME è acme.\n\nAcme spa', { find: 'acme', replace: 'Beta' })
    expect(out.result).toBe('Il cliente Beta è Beta.\n\nBeta spa')
    expect(out.count).toBe(3)
  })

  it('never touches dc: marker lines, even when they contain the needle', () => {
    const md = `${HEADER}\n\n${MARKER}\nVecchio id di riferimento\n\n<!-- dc:blank -->\n`
    const out = replaceInMarkdown(md, { find: 'id', replace: 'ID' })
    expect(out.result).toContain(MARKER)
    expect(out.result).toContain(HEADER)
    expect(out.result).toContain('<!-- dc:blank -->')
    expect(out.result).toContain('Vecchio ID di riferimento')
    expect(out.count).toBe(1)
  })

  it('keeps marker JSON with needle-like keys byte-identical', () => {
    const marker = '<!-- dc:block {"id":"b00007","page_break":true,"list_type":null} -->'
    const out = replaceInMarkdown(`pagina page_break di prova\n\n${marker}\n`, {
      find: 'page_break',
      replace: 'interruzione',
    })
    expect(out.result).toContain(marker)
    expect(out.result).toContain('pagina interruzione di prova')
    expect(out.count).toBe(1)
  })

  it('protects dc:page-break and dc:opaque comments', () => {
    const out = replaceInMarkdown(
      '<!-- dc:page-break -->\n<!-- dc:opaque {"reason":"page_break"} -->\ncontenuto page_break\n',
      { find: 'page_break', replace: 'x' },
    )
    expect(out.result).toContain('<!-- dc:page-break -->')
    expect(out.result).toContain('<!-- dc:opaque {"reason":"page_break"} -->')
    expect(out.count).toBe(1)
  })

  it('treats regex metacharacters literally', () => {
    const out = replaceInMarkdown('prezzo (EUR) 100\nprezzo EUR 200', { find: '(EUR)', replace: '[eur]' })
    expect(out.result).toBe('prezzo [eur] 100\nprezzo EUR 200')
    expect(out.count).toBe(1)
  })

  it('inserts dollar signs literally', () => {
    const out = replaceInMarkdown('a e b', { find: 'e', replace: "$&$'" })
    expect(out.result).toBe("a $&$' b")
  })

  it('wholeWord does not match inside longer words', () => {
    const out = replaceInMarkdown('il test e il testing', { find: 'test', replace: 'verifica', wholeWord: true })
    expect(out.result).toBe('il verifica e il testing')
    expect(out.count).toBe(1)
  })

  it('wholeWord respects accented characters', () => {
    const out = replaceInMarkdown('città cittàs', { find: 'città', replace: 'urbe', wholeWord: true })
    expect(out.result).toBe('urbe cittàs')
  })

  it('caseSensitive restricts matches', () => {
    const out = replaceInMarkdown('Acme acme ACME', { find: 'acme', replace: 'X', caseSensitive: true })
    expect(out.result).toBe('Acme X ACME')
    expect(out.count).toBe(1)
  })

  it('empty find is a no-op', () => {
    const md = 'testo dc:block integro'
    const out = replaceInMarkdown(md, { find: '', replace: 'x' })
    expect(out.result).toBe(md)
    expect(out.count).toBe(0)
  })
})

describe('findMatches', () => {
  it('returns content-only ranges in order', () => {
    const md = `${MARKER}\nuno due tre\n\ndue ancora`
    const matches = findMatches(md, { find: 'due' })
    expect(matches.map((m) => md.slice(m.start, m.end))).toEqual(['due', 'due'])
    expect(matches[0].start).toBeGreaterThan(MARKER.length)
  })

  it('honours case and wholeWord options', () => {
    const md = 'Test testing test'
    expect(findMatches(md, { find: 'test' }).length).toBe(3)
    expect(findMatches(md, { find: 'test', caseSensitive: true }).length).toBe(2)
    expect(findMatches(md, { find: 'test', wholeWord: true }).length).toBe(2)
  })

  it('round trips with replaceInMarkdown', () => {
    const md = 'alpha beta gamma beta'
    const direct = replaceInMarkdown(md, { find: 'beta', replace: 'δ' }).result
    let stepwise = md
    let matches = findMatches(stepwise, { find: 'beta' })
    while (matches.length) {
      const m = matches[0]
      stepwise = stepwise.slice(0, m.start) + 'δ' + stepwise.slice(m.end)
      matches = findMatches(stepwise, { find: 'beta' })
    }
    expect(direct).toBe(stepwise)
  })
})
