import { useState, type FormEvent } from 'react'
import { api, type Note } from '../api.ts'
import { useMutate } from '../hooks.ts'
import { href } from '../route.ts'
import { shortDate } from '../time.ts'
import { Markdown } from './Markdown.tsx'
import { MarkdownEditor } from './MarkdownEditor.tsx'

export function AddNote({ pageId, placeholder = 'Jot something down…' }: { pageId: number | null; placeholder?: string }) {
  const [body, setBody] = useState('')
  const create = useMutate(api.createNote)

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const text = body.trim()
    if (!text) return
    setBody('')
    create.mutate({ body: text, page_id: pageId }, { onError: () => setBody((cur) => cur || text) })
  }

  return (
    <form className="add-note" onSubmit={submit}>
      <MarkdownEditor value={body} onChange={setBody} onSubmit={submit} rows={2} placeholder={placeholder} label={placeholder} full={false} />
      {body.trim() && (
        <div className="actions">
          <button type="submit" className="primary">Save note</button>
        </div>
      )}
      {create.isError && <p className="error">Couldn't save: {create.error.message}</p>}
    </form>
  )
}

export function NoteList({ notes, showPage = false }: { notes: Note[]; showPage?: boolean }) {
  if (notes.length === 0) return null
  return (
    <ul className="notes">
      {notes.map((n) => <NoteItem key={n.id} note={n} showPage={showPage} />)}
    </ul>
  )
}

function NoteItem({ note, showPage }: { note: Note; showPage: boolean }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view')
  const [draft, setDraft] = useState(note.body)
  const update = useMutate((patch: { body?: string; pinned?: boolean }) => api.updateNote(note.id, patch))
  const remove = useMutate(() => api.deleteNote(note.id))
  const error = update.error ?? remove.error

  function save(e?: FormEvent) {
    e?.preventDefault()
    if (!draft.trim()) return
    update.mutate({ body: draft.trim() }, { onSuccess: () => setMode('view') })
  }
  function cancel() {
    setDraft(note.body)
    setMode('view')
  }

  return (
    <li className={note.pinned ? 'pinned' : undefined}>
      {mode === 'edit' ? (
        <form onSubmit={save}>
          <MarkdownEditor value={draft} onChange={setDraft} onSubmit={save} onCancel={cancel} rows={3} label="Edit note" autoFocus full={false} />
          <div className="actions">
            <button type="submit" className="primary" disabled={update.isPending}>Save</button>
            <button type="button" onClick={cancel}>Cancel</button>
          </div>
        </form>
      ) : (
        <Markdown source={note.body} />
      )}
      <div className="note-meta">
        {showPage && note.page_id && (
          <a className="tag link" href={href.page(note.page_id)}>{note.page_path ?? note.page_title}</a>
        )}
        <time>{shortDate(note.created_at)}</time>
        {note.task_id && <span title="Written automatically when the task was completed">from a task</span>}
        <span className="spacer" />
        {mode === 'confirm-delete' ? (
          <>
            <span>Delete?</span>
            <button className="link danger" onClick={() => remove.mutate()}>Yes</button>
            <button className="link" onClick={() => setMode('view')}>No</button>
          </>
        ) : mode === 'view' && (
          <>
            <button className="link" onClick={() => update.mutate({ pinned: !note.pinned })}>
              {note.pinned ? 'Unpin' : 'Pin'}
            </button>
            <button className="link" onClick={() => setMode('edit')}>Edit</button>
            <button className="link" onClick={() => setMode('confirm-delete')}>Delete</button>
          </>
        )}
      </div>
      {error && <p className="error">{error.message}</p>}
    </li>
  )
}
