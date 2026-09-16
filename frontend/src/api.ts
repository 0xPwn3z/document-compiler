import type { ExportResult, Project } from './types'

async function parseJson<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (data as { error?: string } | null)?.error ?? 'Richiesta non riuscita.'
    throw new Error(message)
  }
  return data as T
}

export async function uploadProject(file: File): Promise<Project> {
  const form = new FormData()
  form.append('file', file, file.name)
  const response = await fetch('/api/projects', { method: 'POST', body: form })
  return parseJson<Project>(response)
}

export async function saveMarkdown(id: string, markdown: string): Promise<Project> {
  const response = await fetch(`/api/projects/${id}/markdown`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })
  return parseJson<Project>(response)
}

export async function exportProject(id: string, markdown: string): Promise<ExportResult> {
  const response = await fetch(`/api/projects/${id}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ markdown }),
  })
  return parseJson<ExportResult>(response)
}
