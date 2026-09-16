export interface EditableBlock {
  id: string
  kind: 'paragraph' | 'table'
  style?: string | null
  body_index: number
  list_type?: string | null
  page_break?: boolean
  rows?: number
  columns?: number
}

export interface Manifest {
  version: number
  source: string
  editable_blocks: EditableBlock[]
  preserved: string[]
  limitations: string[]
}

export interface Project {
  id: string
  name: string
  source_filename: string
  created_at: string
  updated_at: string
  manifest: Manifest
  markdown: string
}

export interface ExportResult {
  download_url: string
  warnings: string[]
}
