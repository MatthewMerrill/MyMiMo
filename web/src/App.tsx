import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, UNAUTHORIZED_EVENT } from './api.ts'
import { href, useRoute } from './route.ts'
import { NAV } from './nav.ts'
import { TasksView } from './views/TasksView.tsx'
import { ThingsView } from './views/ThingsView.tsx'
import { ThingView } from './views/ThingView.tsx'
import { CategoryView, UncategorizedView } from './views/CategoryView.tsx'
import { SearchView } from './views/SearchView.tsx'
import { SideNav } from './components/SideNav.tsx'
import { CategoriesView } from './views/CategoriesView.tsx'
import { NotesView } from './views/NotesView.tsx'
import { LoginView } from './components/LoginView.tsx'


const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

export default function App() {
  const qc = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity })

  // Any 401 (e.g. expired session) → re-check who we are, which shows the login screen.
  useEffect(() => {
    const onUnauthorized = () => qc.invalidateQueries({ queryKey: ['me'] })
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [qc])

  // "/" jumps to search from anywhere you're not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault()
        window.location.hash = href.search
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (me.status === 'pending') return null
  if (me.status === 'error') return <p className="error page-error">Can't reach the server: {me.error.message}</p>
  if (me.data.auth_enabled && !me.data.user) return <LoginView />

  return <Shell />
}

function Shell() {
  const route = useRoute()

  return (
    <div className="layout">
      <aside className="sidebar">
        <SideNav route={route} />
      </aside>
      <main>
        {route.name === 'tasks' && <TasksView />}
        {route.name === 'things' && <ThingsView />}
        {route.name === 'categories' && <CategoriesView />}
        {route.name === 'notes' && <NotesView />}
        {route.name === 'thing' && <ThingView key={route.id} id={route.id} />}
        {route.name === 'category' && (route.id === 'uncategorized'
          ? <UncategorizedView />
          : <CategoryView key={route.id} id={route.id} />)}
        {route.name === 'search' && <SearchView />}
      </main>
      <nav className="tabs" aria-label="Sections">
        {NAV.map((t) => (
          <a key={t.label} href={t.href} aria-current={t.active(route) ? 'page' : undefined}>{t.label}</a>
        ))}
      </nav>
    </div>
  )
}
