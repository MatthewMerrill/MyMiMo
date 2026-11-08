import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { api, type Note } from '../api.ts'
import { useMutate } from '../hooks.ts'
import { href } from '../route.ts'
import { shortDate } from '../time.ts'

/** Cmd/Ctrl+Enter submits a textarea's form. */
function submitOnModEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    e.currentTarget.form?.requestSubmit()
  }
}

export function AddNote({ thingId, placeholder = 'Jot something down…' }: { thingId: number | null; placeholder?: string }) {
  const [body, setBody] = useState('')
  const create = useMutate(api.createNote)

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    setBody('')
    create.mutate({ body: text, thing_id: thingId }, { onError: () => setBody((cur) => cur || text) })
  }

  return (
    <form className="add-note" onSubmit={submit}>
      <textarea
        rows={2}
        placeholder={placeholder}
        aria-label={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={submitOnModEnter}
      />
      {body.trim() && (
        <div className="actions">
          <button type="submit" className="primary">Save note</button>
        </div>
      )}
      {create.isError && <p className="error">Couldn't save: {create.error.message}</p>}
    </form>
  )
}

export function NoteList({ notes, showThing = false }: { notes: Note[]; showThing?: boolean }) {
  if (notes.length === 0) return null
  return (
    <ul className="notes">
      {notes.map((n) => <NoteItem key={n.id} note={n} showThing={showThing} />)}
    </ul>
  )
}

function NoteItem({ note, showThing }: { note: Note; showThing: boolean }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view')
  const [draft, setDraft] = useState(note.body)
  const update = useMutate((patch: { body?: string; pinned?: boolean }) => api.updateNote(note.id, patch))
  const remove = useMutate(() => api.deleteNote(note.id))
  const error = update.error ?? remove.error

  function save(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    update.mutate({ body: draft.trim() }, { onSuccess: () => setMode('view') })
  }

  return (
    <li className={note.pinned ? 'pinned' : undefined}>
      {mode === 'edit' ? (
        <form onSubmit={save}>
          <textarea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={submitOnModEnter} autoFocus />
          <div className="actions">
            <button type="submit" className="primary" disabled={update.isPending}>Save</button>
            <button type="button" onClick={() => { setDraft(note.body); setMode('view') }}>Cancel</button>
          </div>
        </form>
      ) : (
        <p className="body">{note.body}</p>
      )}
      <div className="note-meta">
        {showThing && note.thing_id && (
          <a className="tag link" href={href.thing(note.thing_id)}>{note.thing_path ?? note.thing_name}</a>
        )}
        <time>{shortDate(note.created_at)}</time>
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
