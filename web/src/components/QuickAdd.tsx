import { useRef, useState, type FormEvent } from 'react'

interface Props {
  placeholder: string
  /** Return the save promise; on failure the text is put back so nothing is lost. */
  onAdd: (text: string) => Promise<unknown>
  autoFocus?: boolean
  big?: boolean
  label?: string
}

/** Single-line "type, Enter, done" input. Clears immediately; restores text if the save fails. */
export function QuickAdd({ placeholder, onAdd, autoFocus, big, label = 'Add' }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = text.trim()
    if (!value) return
    setText('')
    setError(null)
    ref.current?.focus()
    onAdd(value).catch((err: Error) => {
      setText((cur) => cur || value)
      setError(err.message)
    })
  }

  return (
    <form className={big ? 'quick-add big' : 'quick-add'} onSubmit={submit}>
      <div className="row">
        <input
          ref={ref}
          autoFocus={autoFocus}
          enterKeyHint="done"
          autoComplete="off"
          placeholder={placeholder}
          aria-label={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={!text.trim()}>{label}</button>
      </div>
      {error && <p className="error">Couldn't save: {error}</p>}
    </form>
  )
}
