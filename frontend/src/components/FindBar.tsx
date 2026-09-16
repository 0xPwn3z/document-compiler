interface FindBarProps {
  findText: string
  replaceText: string
  caseSensitive: boolean
  wholeWord: boolean
  index: number
  total: number
  onFindTextChange: (value: string) => void
  onReplaceTextChange: (value: string) => void
  onToggleCase: () => void
  onToggleWhole: () => void
  onPrevious: () => void
  onNext: () => void
  onReplaceOne: () => void
  onReplaceAll: () => void
  onClose: () => void
}

export function FindBar(props: FindBarProps) {
  const countLabel = !props.findText ? '' : props.total ? `${props.index + 1}/${props.total}` : 'nessun risultato'

  return (
    <div className="find-bar">
      <div className="find-row">
        <input
          id="find-input"
          type="text"
          placeholder="Trova nel markdown"
          aria-label="Trova nel markdown"
          autoComplete="off"
          className={props.findText && !props.total ? 'no-match' : undefined}
          value={props.findText}
          onChange={(event) => props.onFindTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (event.shiftKey) props.onPrevious()
              else props.onNext()
            }
            if (event.key === 'Escape') props.onClose()
          }}
        />
        <span className="find-count" aria-live="polite">
          {countLabel}
        </span>
        <button className="icon-button" type="button" title="Precedente (Maiusc+Invio)" aria-label="Occorrenza precedente" onClick={props.onPrevious}>
          ↑
        </button>
        <button className="icon-button" type="button" title="Successivo (Invio)" aria-label="Occorrenza successiva" onClick={props.onNext}>
          ↓
        </button>
        <button className="icon-button" type="button" title="Chiudi (Esc)" aria-label="Chiudi ricerca" onClick={props.onClose}>
          ×
        </button>
      </div>
      <div className="find-row">
        <input
          type="text"
          placeholder="Sostituisci con"
          aria-label="Sostituisci con"
          autoComplete="off"
          value={props.replaceText}
          onChange={(event) => props.onReplaceTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              props.onReplaceOne()
            }
            if (event.key === 'Escape') props.onClose()
          }}
        />
        <button className="button ghost button-small" type="button" onClick={props.onReplaceOne}>
          Sostituisci
        </button>
        <button className="button ghost button-small" type="button" onClick={props.onReplaceAll}>
          Tutto
        </button>
        <label className="find-toggle">
          <input type="checkbox" checked={props.caseSensitive} onChange={props.onToggleCase} />
          <span title="Distingui maiuscole/minuscole">Aa</span>
        </label>
        <label className="find-toggle">
          <input type="checkbox" checked={props.wholeWord} onChange={props.onToggleWhole} />
          <span title="Solo parole intere">Parola</span>
        </label>
      </div>
    </div>
  )
}
