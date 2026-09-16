import type { Project } from '../types'
import type { SaveStatus, WorkspaceMessage } from '../hooks/useProject'
import { EditorPanel } from './EditorPanel'
import { PreviewPanel } from './PreviewPanel'

interface WorkspaceProps {
  project: Project
  markdown: string
  status: SaveStatus
  exporting: boolean
  message: WorkspaceMessage | null
  onSave: () => void
  onMarkdownChange: (value: string) => void
  onExport: () => void
  onMessage: (text: string, warning?: boolean) => void
  onDismissMessage: () => void
}

export function Workspace({
  project,
  markdown,
  status,
  exporting,
  message,
  onSave,
  onMarkdownChange,
  onExport,
  onMessage,
  onDismissMessage,
}: WorkspaceProps) {
  return (
    <section className="workspace">
      <div className="workspace-head">
        <div className="workspace-title">
          <h2>{project.name}</h2>
          <p className="muted">
            {project.source_filename} · {project.manifest.editable_blocks.length} blocchi editabili
          </p>
        </div>
        <div className="actions">
          <button className="button ghost" type="button" onClick={onSave}>
            Salva <span className="shortcut">Ctrl S</span>
          </button>
          <button className="button primary" type="button" onClick={onExport} disabled={exporting}>
            {exporting ? (
              'Genero DOCX…'
            ) : (
              <>
                Esporta DOCX <span className="button-icon">↓</span>
              </>
            )}
          </button>
        </div>
      </div>
      {message && (
        <div className={`workspace-message${message.warning ? ' warning' : ''}`} role="status">
          {message.text}
          <button className="message-close" type="button" aria-label="Chiudi messaggio" onClick={onDismissMessage}>
            ×
          </button>
        </div>
      )}
      <div className="editor-grid">
        <EditorPanel
          markdown={markdown}
          status={status}
          onMarkdownChange={onMarkdownChange}
          onMessage={onMessage}
        />
        <PreviewPanel markdown={markdown} limitations={project.manifest.limitations ?? []} />
      </div>
    </section>
  )
}
