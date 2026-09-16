import { describe, expect, it } from 'vitest'
import { renderMarkdown, countWords } from './markdown'

describe('renderMarkdown', () => {
  it('strips structural comment lines', () => {
    const html = renderMarkdown('<!-- dc:block {"id":"b1"} -->\nContenuto\n\n<!-- dc:blank -->')
    expect(html).toContain('Contenuto')
    expect(html).not.toContain('dc:block')
    expect(html).not.toContain('dc:blank')
  })

  it('escapes HTML in content', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders headings, lists, emphasis and code', () => {
    const html = renderMarkdown('# Titolo\n\n- punto\n\n1. primo\n\n**grassetto** e _corsivo_ e `codice`')
    expect(html).toContain('<h1>Titolo</h1>')
    expect(html).toContain('<ul><li>punto</li></ul>')
    expect(html).toContain('<ol><li>primo</li></ol>')
    expect(html).toContain('<strong>grassetto</strong>')
    expect(html).toContain('<em>corsivo</em>')
    expect(html).toContain('<code>codice</code>')
  })

  it('renders tables with escaped cells', () => {
    const html = renderMarkdown('| A | B |\n| --- | --- |\n| 1 | <b>x</b> |')
    expect(html).toContain('<table><thead><tr><th>A</th><th>B</th></tr></thead>')
    expect(html).toContain('<td>1</td>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })

  it('renders fenced code blocks', () => {
    const html = renderMarkdown('```\nciao <b>\n```')
    expect(html).toContain('<pre>ciao &lt;b&gt;</pre>')
  })

  it('shows a placeholder for empty input', () => {
    expect(renderMarkdown('')).toContain('La preview apparirà qui mentre scrivi.')
  })
})

describe('countWords', () => {
  it('counts words and handles empty input', () => {
    expect(countWords('uno due\ttre\nquattro')).toBe(4)
    expect(countWords('   ')).toBe(0)
    expect(countWords('')).toBe(0)
  })
})
