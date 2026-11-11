import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError, type Page } from '../api.ts'
import { useSaveBody } from '../hooks.ts'
import { toggleTaskLine } from '../wiki.ts'
import { Markdown } from './Markdown.tsx'
import { MarkdownEditor } from './MarkdownEditor.tsx'

function ConflictNote({ error }: { error: Error }) {
  const qc = useQueryClient()
  if (!(error instanceof ApiError && error.status === 409)) return <p className="error">Couldn't save: {error.message}</p>
  return (
    <p className="error">
      {error.message}{' '}
      <button type="button" className="link" onClick={() => qc.invalidateQueries()}>Reload page</button>
    </p>
  )
}

/** The page's markdown body: rendered with clickable checklists, or edited in place. */
export function PageBody({ page, editing, setEditing }: {
  page: Page
  editing: boolean
  setEditing: (v: boolean) => void
}) {
  const [draft, setDraft] = useState(page.body ?? '')
  const save = useSaveBody(page)
  const toggle = useSaveBody(page)

  function submit(e?: FormEvent) {
    e?.preventDefault()
    save.mutate(draft.trim() ? draft : null, { onSuccess: () => setEditing(false) })
  }
  function cancel() {
    setDraft(page.body ?? '')
    save.reset()
    setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={submit}>
        <MarkdownEditor
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          onCancel={cancel}
          rows={8}
          label={`${page.title} page`}
          placeholder={'Facts, steps, checklists…\n\n**Paint:** SW 7008 Alabaster\n- [ ] packing item'}
          autoFocus
        />
        {save.error && <ConflictNote error={save.error} />}
        <div className="actions">
          <button type="submit" className="primary" disabled={save.isPending}>Save</button>
          <button type="button" onClick={cancel}>Cancel</button>
          <span className="hint">⌘/Ctrl+Enter to save · Esc to cancel</span>
        </div>
      </form>
    )
  }

  if (!page.body) {
    return (
      <button className="empty-slot" onClick={() => { setDraft(''); setEditing(true) }}>
        Write about {page.title}: facts, steps, a packing list, photos…
      </button>
    )
  }

  return (
    <>
      <Markdown
        source={page.body}
        onToggleTask={toggle.isPending ? undefined : (line) => {
          const next = toggleTaskLine(page.body ?? '', line)
          if (next !== null) toggle.mutate(next)
        }}
      />
      {toggle.error && <ConflictNote error={toggle.error} />}
    </>
  )
}
