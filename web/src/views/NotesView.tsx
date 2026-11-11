import { useQuery } from '@tanstack/react-query'
import { api } from '../api.ts'
import { keys } from '../hooks.ts'
import { AddNote, NoteList } from '../components/Notes.tsx'
import { Section } from '../components/Section.tsx'

/** Unfiled trivia, plus the most recent log entries from every page. */
export function NotesView() {
  const all = useQuery({ queryKey: keys.allNotes, queryFn: api.listNotes })
  const notes = all.data ?? []
  const unfiled = notes.filter((n) => n.page_id == null)
  const recent = notes
    .filter((n) => n.page_id != null)
    .sort((a, b) => b.created_at - a.created_at || b.id - a.id)
    .slice(0, 30)

  return (
    <article>
      <header className="page-head">
        <h1>Notes</h1>
      </header>
      {all.status === 'error' && <p className="error">{all.error.message}</p>}

      <Section title="Unfiled" count={unfiled.length}>
        <p className="hint">Trivia that isn't about any one page.</p>
        <AddNote pageId={null} />
        <NoteList notes={unfiled} />
      </Section>

      <Section title="Recent log entries" count={recent.length}>
        <p className="hint">The latest Log entries from all pages.</p>
        <NoteList notes={recent} showPage />
        {all.status === 'success' && recent.length === 0 && <p className="muted">None yet.</p>}
      </Section>
    </article>
  )
}
