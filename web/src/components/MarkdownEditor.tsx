import { useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { uploadImage, imageUrl } from '../images.ts'
import { looksTabular, tsvToCsvBlock } from '../wiki.ts'
import { Markdown } from './Markdown.tsx'

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  onCancel?: () => void
  rows?: number
  placeholder?: string
  autoFocus?: boolean
  label: string
  /** Show the Write/Preview tabs and the help line (off for one-line-ish inputs). */
  full?: boolean
}

/**
 * Plain textarea for markdown, with:
 *  - paste/drop images → uploaded and inserted as ![](…)
 *  - paste spreadsheet cells → inserted as a ```csv block
 *  - Cmd/Ctrl+Enter to submit, Esc to cancel
 */
export function MarkdownEditor({ value, onChange, onSubmit, onCancel, rows = 6, placeholder, autoFocus, label, full = true }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Latest value, for inserting uploads that finish after more typing.
  const latest = useRef(value)
  useLayoutEffect(() => { latest.current = value }, [value])
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)

  /** Inserts text at the cursor (or at the end if the textarea isn't focused). */
  function insert(text: string) {
    const el = ref.current
    const cur = latest.current
    const start = el && document.activeElement === el ? el.selectionStart : cur.length
    const end = el && document.activeElement === el ? el.selectionEnd : cur.length
    const next = cur.slice(0, start) + text + cur.slice(end)
    latest.current = next
    onChange(next)
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = start + text.length
    })
  }

  async function addImages(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    setError(null)
    setUploading((n) => n + images.length)
    for (const file of images) {
      try {
        const id = await uploadImage(file)
        insert(`\n![${file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '')}](${imageUrl(id)})\n`)
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setUploading((n) => n - 1)
      }
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = [...e.clipboardData.files]
    if (files.some((f) => f.type.startsWith('image/'))) {
      e.preventDefault()
      void addImages(files)
      return
    }
    const text = e.clipboardData.getData('text/plain')
    if (looksTabular(text)) {
      e.preventDefault()
      insert(tsvToCsvBlock(text))
    }
  }

  function onDrop(e: DragEvent<HTMLTextAreaElement>) {
    const files = [...e.dataTransfer.files]
    if (files.length) {
      e.preventDefault()
      void addImages(files)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && onSubmit) {
      e.preventDefault()
      onSubmit()
    } else if (e.key === 'Escape' && onCancel) {
      onCancel()
    }
  }

  return (
    <div className="md-editor">
      {full && (
        <div className="md-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')}>Write</button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>Preview</button>
          <span className="spacer" />
          <button type="button" className="link" onClick={() => fileRef.current?.click()}>Add photo</button>
        </div>
      )}
      {tab === 'write' || !full ? (
        <textarea
          ref={ref}
          rows={Math.max(rows, Math.min(30, value.split('\n').length + 1))}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={onPaste}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={label}
          autoFocus={autoFocus}
        />
      ) : (
        <div className="md-preview">{value.trim() ? <Markdown source={value} /> : <p className="muted">Nothing to preview.</p>}</div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { void addImages([...(e.target.files ?? [])]); e.target.value = '' }}
      />
      {!full && (
        <button type="button" className="link add-photo" onClick={() => fileRef.current?.click()}>Add photo</button>
      )}
      {uploading > 0 && <p className="hint">Uploading {uploading} photo{uploading > 1 ? 's' : ''}…</p>}
      {error && <p className="error">{error}</p>}
      {full && (
        <p className="hint md-help">
          Markdown: **bold**, - [ ] checklist, [[Page]] link, ```csv table. Paste photos or spreadsheet cells.
        </p>
      )}
    </div>
  )
}
