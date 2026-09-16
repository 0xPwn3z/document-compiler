import { useRef, useState } from 'react'
import type { DragEvent, ChangeEvent } from 'react'

interface LandingProps {
  onUpload: (file: File) => Promise<void>
}

export function Landing({ onUpload }: LandingProps) {
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const startUpload = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setError('Seleziona un file .docx.')
      return
    }
    setUploading(true)
    try {
      await onUpload(file)
    } catch (uploadError) {
      setError((uploadError as Error).message)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    void startUpload(event.target.files?.[0])
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    void startUpload(event.dataTransfer.files?.[0])
  }

  return (
    <section id="landing" className="landing">
      <div className="hero">
        <svg className="deco deco-sparkle" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2c.6 5.4 4 8.8 9.4 9.4-5.4.6-8.8 4-9.4 9.4-.6-5.4-4-8.8-9.4-9.4C8 10.8 11.4 7.4 12 2Z" />
        </svg>
        <svg className="deco deco-squiggle" viewBox="0 0 120 24" aria-hidden="true">
          <path
            d="M2 14c8-12 16-12 24 0s16 12 24 0 16-12 24 0 16 12 24 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <h1>
          Il tuo template Word.
          <br />
          La libertà del <span className="highlight-pill">Markdown</span>.
        </h1>
        <p className="lead">
          Carica un template DOCX, lavora su un mirror testuale leggibile dagli LLM e scarica un Word che conserva il
          sistema grafico originale.
        </p>
        <label
          className={`dropzone${dragging ? ' dragging' : ''}`}
          htmlFor="file-input"
          onDragEnter={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input ref={inputRef} id="file-input" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleChange} />
          <span className="upload-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V6" />
              <path d="m6 11 6-6 6 6" />
            </svg>
          </span>
          <strong>{uploading ? 'Sto leggendo il template…' : 'Trascina qui il template DOCX'}</strong>
          <span className="dropzone-hint">
            oppure <u>scegli un file</u> · massimo 50 MB
          </span>
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
      </div>

      <div className="feature-row">
        <article className="step-card step-card--marigold">
          <span className="step-pill">01</span>
          <strong>Import</strong>
          <small>struttura e stili riconosciuti</small>
        </article>
        <article className="step-card step-card--sky">
          <span className="step-pill">02</span>
          <strong>Edit</strong>
          <small>Markdown con blocchi stabili</small>
        </article>
        <article className="step-card step-card--midnight">
          <span className="step-pill">03</span>
          <strong>Export</strong>
          <small>DOCX dal template sorgente</small>
        </article>
      </div>
    </section>
  )
}
