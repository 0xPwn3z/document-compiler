import { useCallback, useEffect, useRef, useState } from 'react'
import { exportProject, saveMarkdown, uploadProject } from '../api'
import type { Project } from '../types'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

export interface WorkspaceMessage {
  text: string
  warning: boolean
}

const AUTOSAVE_DELAY_MS = 1000
const MESSAGE_TTL_MS = 7000

export function useProject() {
  const [project, setProject] = useState<Project | null>(null)
  const [markdown, setMarkdown] = useState('')
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<WorkspaceMessage | null>(null)
  const saveLock = useRef(false)

  const upload = useCallback(async (file: File) => {
    const uploaded = await uploadProject(file)
    setProject(uploaded)
    setMarkdown(uploaded.markdown)
    setStatus('saved')
    setMessage(null)
  }, [])

  const save = useCallback(async () => {
    if (!project) return
    setStatus('saving')
    try {
      const saved = await saveMarkdown(project.id, markdown)
      setProject(saved)
      setMarkdown(saved.markdown)
      setStatus('saved')
    } catch (error) {
      setStatus('error')
      setMessage({ text: (error as Error).message, warning: true })
    }
  }, [project, markdown])

  // Debounced autosave: one second after the last keystroke, mirroring the
  // behaviour of the original editor.
  useEffect(() => {
    if (status !== 'dirty') return
    const timer = window.setTimeout(() => {
      void save()
    }, AUTOSAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [status, markdown, save])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), MESSAGE_TTL_MS)
    return () => window.clearTimeout(timer)
  }, [message])

  const onMarkdownChange = useCallback((value: string) => {
    setMarkdown(value)
    setStatus('dirty')
  }, [])

  const exportDocx = useCallback(async () => {
    if (!project || exporting || saveLock.current) return
    setExporting(true)
    try {
      const result = await exportProject(project.id, markdown)
      const link = document.createElement('a')
      link.href = result.download_url
      link.download = `${project.name}.docx`
      link.click()
      setMessage(
        result.warnings?.length
          ? { text: `DOCX generato con note: ${result.warnings.join(' ')}`, warning: true }
          : { text: 'DOCX generato dal template originale.', warning: false },
      )
    } catch (error) {
      setMessage({ text: (error as Error).message, warning: true })
    } finally {
      setExporting(false)
    }
  }, [project, markdown, exporting])

  const dismissMessage = useCallback(() => setMessage(null), [])
  const showMessage = useCallback((text: string, warning = false) => setMessage({ text, warning }), [])

  return {
    project,
    markdown,
    status,
    exporting,
    message,
    upload,
    save,
    onMarkdownChange,
    exportDocx,
    dismissMessage,
    showMessage,
  }
}
