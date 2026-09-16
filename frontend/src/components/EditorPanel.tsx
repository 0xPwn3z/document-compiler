import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { findMatches, replaceInMarkdown } from '../lib/findReplace'
import { countWords } from '../lib/markdown'
import type { MatchRange } from '../lib/findReplace'
import type { SaveStatus } from '../hooks/useProject'
import { FindBar } from './FindBar'

interface EditorPanelProps {
  markdown: string
  status: SaveStatus
  onMarkdownChange: (value: string) => void
  onMessage: (text: string, warning?: boolean) => void
}

const STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'salvato',
  dirty: 'modifiche non salvate',
  saving: 'salvataggio…',
  error: 'errore',
}

export function EditorPanel({ markdown, status, onMarkdownChange, onMessage }: EditorPanelProps) {
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const [findOpen, setFindOpen] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [index, setIndex] = useState(-1)
  const pendingCaret = useRef<number | null>(null)

  const matches = useMemo(
    () => (findOpen && findText ? findMatches(markdown, { find: findText, caseSensitive, wholeWord }) : []),
    [findOpen, findText, caseSensitive, wholeWord, markdown],
  )

  const selectAt = useCallback((target: MatchRange) => {
    const editor = editorRef.current
    if (!editor) return
    editor.setSelectionRange(target.start, target.end)
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 23
    const line = editor.value.slice(0, target.start).split('\n').length
    editor.scrollTop = Math.max(0, (line - 6) * lineHeight)
  }, [])

  const goTo = useCallback(
    (next: number) => {
      if (next < 0 || next >= matches.length) return
      setIndex(next)
      selectAt(matches[next])
    },
    [matches, selectAt],
  )

  const step = useCallback(
    (delta: number) => {
      if (!matches.length) return
      goTo((index + delta + matches.length) % matches.length)
    },
    [index, matches.length, goTo],
  )

  const openFind = useCallback(() => {
    setFindOpen(true)
    const editor = editorRef.current
    if (editor) {
      const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd)
      if (selection && !selection.includes('\n')) setFindText(selection)
    }
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('#find-input')?.focus()
      document.querySelector<HTMLInputElement>('#find-input')?.select()
    })
  }, [])

  const closeFind = useCallback(() => {
    setFindOpen(false)
    editorRef.current?.focus()
  }, [])

  // First match is selected as soon as a query produces results.
  useEffect(() => {
    if (!findOpen || !findText) {
      setIndex(-1)
      return
    }
    if (index === -1 && matches.length) goTo(0)
    else if (index >= matches.length) setIndex(matches.length - 1)
  }, [findOpen, findText, matches, index, goTo])

  // After edits (manual typing or replaces) keep the active match in sync.
  useLayoutEffect(() => {
    if (!findOpen) return
    const caret = pendingCaret.current
    if (caret != null) {
      pendingCaret.current = null
      const next = matches.find((m) => m.start >= caret) ?? matches[0]
      if (next) {
        setIndex(matches.indexOf(next))
        selectAt(next)
      } else {
        setIndex(-1)
      }
      return
    }
    if (index >= matches.length) {
      const clamped = matches.length - 1
      setIndex(clamped)
      if (clamped >= 0) selectAt(matches[clamped])
    }
  }, [markdown, findOpen, matches, index, selectAt])

  // Ctrl+F / Cmd+F opens the find bar.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        openFind()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [openFind])

  const replaceOne = () => {
    if (!matches.length) return
    const caret = editorRef.current?.selectionStart ?? 0
    const current = matches.find((m) => m.start >= caret) ?? matches[0]
    const updated = markdown.slice(0, current.start) + replaceText + markdown.slice(current.end)
    pendingCaret.current = current.start + replaceText.length
    onMarkdownChange(updated)
  }

  const replaceAll = () => {
    if (!findText) return
    const replaced = replaceInMarkdown(markdown, { find: findText, replace: replaceText, caseSensitive, wholeWord })
    if (!replaced.count) {
      setIndex(-1)
      return
    }
    pendingCaret.current = null
    onMarkdownChange(replaced.result)
    onMessage(`Sostituite ${replaced.count} occorrenze di "${findText}".`)
    setIndex(-1)
  }

  const words = countWords(markdown)

  return (
    <section className="panel editor-panel">
      <div className="panel-head">
        <span className="panel-title">Markdown mirror</span>
        <span className="status">{STATUS_LABEL[status]}</span>
      </div>
      {findOpen && (
        <FindBar
          findText={findText}
          replaceText={replaceText}
          caseSensitive={caseSensitive}
          wholeWord={wholeWord}
          index={index}
          total={matches.length}
          onFindTextChange={(value) => {
            setFindText(value)
            setIndex(-1)
          }}
          onReplaceTextChange={setReplaceText}
          onToggleCase={() => {
            setCaseSensitive((value) => !value)
            setIndex(-1)
          }}
          onToggleWhole={() => {
            setWholeWord((value) => !value)
            setIndex(-1)
          }}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          onReplaceOne={replaceOne}
          onReplaceAll={replaceAll}
          onClose={closeFind}
        />
      )}
      <textarea
        ref={editorRef}
        className="editor-area"
        spellCheck={false}
        aria-label="Editor Markdown"
        value={markdown}
        onChange={(event) => onMarkdownChange(event.target.value)}
        onKeyDown={(event) => {
          if (findOpen && event.key === 'Escape') closeFind()
          if (findOpen && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            step(event.shiftKey ? -1 : 1)
          }
        }}
      />
      <div className="editor-foot">
        <span className="word-count">{words.toLocaleString('it-IT')} parole</span>
        <span>
          i marker <code>dc:block</code> mantengono il legame col template
        </span>
      </div>
    </section>
  )
}
