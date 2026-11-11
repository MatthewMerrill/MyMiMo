import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api.ts'
import { keys, useDebounced } from '../hooks.ts'
import { href } from '../route.ts'
import { TaskList } from '../components/TaskList.tsx'
import { NoteList } from '../components/Notes.tsx'
import { Section } from '../components/Section.tsx'

// Survives switching tabs (but not reloads).
let lastQuery = ''

export function SearchView() {
  const [q, setQ] = useState(lastQuery)
  const query = useDebounced(q.trim(), 200)
  const { data, status, error } = useQuery({
    queryKey: keys.search(query),
    queryFn: () => api.search(query),
    enabled: query !== '',
    placeholderData: keepPreviousData,
  })
  const empty = data && !data.categories.length && !data.pages.length && !data.notes.length && !data.tasks.length

  return (
    <>
      <header className="page-head"><h1>Search</h1></header>
      <div className="capture">
        <form className="quick-add big" role="search" onSubmit={(e) => e.preventDefault()}>
          <div className="row">
            <input
              type="search"
              autoFocus
              enterKeyHint="search"
              placeholder="Search the wiki and tasks…  (press / anywhere)"
              aria-label="Search"
              value={q}
              onChange={(e) => { setQ(e.target.value); lastQuery = e.target.value }}
            />
          </div>
        </form>
      </div>
      {status === 'error' && <p className="error">{error.message}</p>}
      {query && empty && <p className="muted">No matches for “{query}”.</p>}
      {query && data && (
        <>
          {data.categories.length > 0 && (
            <Section title="Categories" count={data.categories.length}>
              <div className="meta">
                {data.categories.map((c) => <a key={c.id} className="tag link" href={href.category(c.id)}>{c.name}</a>)}
              </div>
            </Section>
          )}
          {data.pages.length > 0 && (
            <Section title="Pages" count={data.pages.length}>
              <ul className="index-list">
                {data.pages.map((p) => (
                  <li key={p.id}>
                    <a href={href.page(p.id)}>{p.title}</a>
                    <span className="counts">{p.path !== p.title ? p.path.slice(0, p.path.lastIndexOf(' › ')) : ''}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {data.notes.length > 0 && (
            <Section title="Notes" count={data.notes.length}>
              <NoteList notes={data.notes} showPage />
            </Section>
          )}
          {data.tasks.length > 0 && (
            <Section title="Tasks" count={data.tasks.length}>
              <TaskList tasks={data.tasks} />
            </Section>
          )}
        </>
      )}
    </>
  )
}
