import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { Project } from './types'

const PROJECT: Project = {
  id: 'abc123def456',
  name: 'Template di prova',
  source_filename: 'template.docx',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  manifest: {
    version: 1,
    source: 'template.docx',
    editable_blocks: [{ id: 'b00000', kind: 'paragraph', style: 'Normal', body_index: 0 }],
    preserved: ['styles'],
    limitations: ['Text boxes are preserved only when not edited.'],
  },
  markdown: '<!-- doc-compiler:version 1 -->\n\nContenuto iniziale\n',
}

function mockFetch(responseBody: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('shows the landing page with the upload dropzone', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<App />)
    expect(screen.getByText(/Trascina qui il template DOCX/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Esporta DOCX/i })).not.toBeInTheDocument()
  })

  it('uploads a docx and opens the workspace', async () => {
    const fetchMock = mockFetch(PROJECT)
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)

    const input = document.querySelector<HTMLInputElement>('#file-input')
    expect(input).not.toBeNull()
    await user.upload(input!, new File(['docx-bytes'], 'template.docx'))

    expect(await screen.findByRole('heading', { level: 2, name: 'Template di prova' })).toBeInTheDocument()
    expect(screen.getByText(/template.docx · 1 blocchi editabili/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/projects', expect.objectContaining({ method: 'POST' }))
  })

  it('rejects non-docx files without calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    const input = document.querySelector<HTMLInputElement>('#file-input')
    expect(input).not.toBeNull()
    // fireEvent bypasses userEvent's accept-attribute filter: the point of
    // this test is the client-side .docx validation.
    fireEvent.change(input!, { target: { files: [new File(['x'], 'template.txt')] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Seleziona un file .docx.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('edits markdown and refreshes the live preview', async () => {
    vi.stubGlobal('fetch', mockFetch(PROJECT))
    const user = userEvent.setup()
    render(<App />)

    const input = document.querySelector<HTMLInputElement>('#file-input')
    await user.upload(input!, new File(['docx-bytes'], 'template.docx'))
    expect(await screen.findByRole('heading', { level: 2, name: 'Template di prova' })).toBeInTheDocument()

    const editor = screen.getByLabelText('Editor Markdown') as HTMLTextAreaElement
    await user.clear(editor)
    await user.type(editor, '# Nuovo titolo')

    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Nuovo titolo' })).toBeInTheDocument())
    expect(screen.getByText('3 parole')).toBeInTheDocument()
  })

  it('opens the find bar with Ctrl+F and protects markers while replacing', async () => {
    vi.stubGlobal('fetch', mockFetch(PROJECT))
    const user = userEvent.setup()
    render(<App />)

    const input = document.querySelector<HTMLInputElement>('#file-input')
    await user.upload(input!, new File(['docx-bytes'], 'template.docx'))
    await screen.findByRole('heading', { level: 2, name: 'Template di prova' })

    const editor = screen.getByLabelText('Editor Markdown') as HTMLTextAreaElement
    await user.clear(editor)
    await user.type(editor, 'dc:block id da cercare: id\n')
    expect(editor.value).toContain('id')

    // deterministic Ctrl+F (userEvent's hold syntax keeps Control pressed)
    fireEvent.keyDown(editor, { key: 'f', ctrlKey: true })
    const findInput = await screen.findByLabelText('Trova nel markdown')
    await user.type(findInput, 'id')
    expect(await screen.findByText(/\/\d+/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Sostituisci con'), 'IDENTIFICATORE')
    await user.click(screen.getByRole('button', { name: 'Tutto' }))

    // the structural header comment must survive any replacement
    expect(editor.value).toContain('IDENTIFICATORE')
    expect(editor.value).not.toMatch(/(?<!dc:)block id/)
  })
})
