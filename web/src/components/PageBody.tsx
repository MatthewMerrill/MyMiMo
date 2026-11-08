import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { api, type Thing } from '../api.ts'
import { useMutate } from '../hooks.ts'

/** The wiki page content for a thing: the current facts, edited in place. */
export function PageBody({ thing, editing, setEditing }: {
  thing: Thing
  editing: boolean
  setEditing: (v: boolean) => void
}) {
  const [draft, setDraft] = useState(thing.body ?? '')
  const update = useMutate((body: string | null) => api.updateThing(thing.id, { body }))

  function save(e: FormEvent) {
    e.preventDefault()
    update.mutate(draft.trim() || null, { onSuccess: () => setEditing(false) })
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
    if (e.key === 'Escape') cancel()
  }
  function cancel() {
    setDraft(thing.body ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={save}>
        <textarea
          className="body-editor"
          rows={Math.max(5, draft.split('\n').length + 1)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={'Facts worth keeping, one per line, e.g.\nPaint: SW 7008 Alabaster\nSheen: eggshell'}
          aria-label={`About ${thing.name}`}
          autoFocus
        />
        {update.isError && <p className="error">Couldn't save: {update.error.message}</p>}
        <div className="actions">
          <button type="submit" className="primary" disabled={update.isPending}>Save</button>
          <button type="button" onClick={cancel}>Cancel</button>
          <span className="hint">⌘/Ctrl+Enter to save</span>
        </div>
      </form>
    )
  }

  return thing.body ? (
    <p className="article">{thing.body}</p>
  ) : (
    <button className="empty-slot" onClick={() => { setDraft(''); setEditing(true) }}>
      Add details about {thing.name}: model numbers, paint codes, where the manual is…
    </button>
  )
}
