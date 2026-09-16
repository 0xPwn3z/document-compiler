import { useMemo } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { escapeHtml } from '../lib/markdown'

interface PreviewPanelProps {
  markdown: string
  limitations: string[]
}

export function PreviewPanel({ markdown, limitations }: PreviewPanelProps) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown])

  return (
    <section className="panel preview-panel">
      <div className="panel-head">
        <span className="panel-title">Anteprima strutturale</span>
        <span className="status status--live">live</span>
      </div>
      {/* renderMarkdown escapes all content before re-introducing the
          supported tag subset, mirroring the original preview behaviour. */}
      <div className="preview" dangerouslySetInnerHTML={{ __html: html }} />
      {limitations.length > 0 && (
        <div
          className="limitations"
          dangerouslySetInnerHTML={{
            __html: `<strong>Nota:</strong> ${limitations.map(escapeHtml).join(' ')}`,
          }}
        />
      )}
    </section>
  )
}
