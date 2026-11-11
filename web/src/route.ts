import { useEffect, useMemo, useSyncExternalStore } from 'react'

export type Route =
  | { name: 'tasks' }
  | { name: 'pages' }
  | { name: 'page'; id: number }
  | { name: 'wiki'; title: string }
  | { name: 'categories' }
  | { name: 'category'; id: number | 'uncategorized' }
  | { name: 'notes' }
  | { name: 'search' }

function parse(hash: string): Route {
  const [a, b] = hash.replace(/^#\/?/, '').split('/')
  const id = Number(b)
  const validId = Number.isInteger(id) && id > 0
  if (a === 'pages' && validId) return { name: 'page', id }
  if (a === 'pages') return { name: 'pages' }
  if (a === 'wiki' && b) {
    try { return { name: 'wiki', title: decodeURIComponent(b) } } catch { /* malformed: fall through */ }
  }
  if (a === 'categories' && b === 'uncategorized') return { name: 'category', id: 'uncategorized' }
  if (a === 'categories' && validId) return { name: 'category', id }
  if (a === 'categories') return { name: 'categories' }
  if (a === 'notes') return { name: 'notes' }
  if (a === 'search') return { name: 'search' }
  return { name: 'tasks' }
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/** Tiny hash router: #/ · #/pages[/:id] · #/wiki/:title · #/categories[/:id|uncategorized] · #/notes · #/search */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  useEffect(() => window.scrollTo(0, 0), [hash])
  return useMemo(() => parse(hash), [hash])
}

export const href = {
  tasks: '#/',
  pages: '#/pages',
  page: (id: number) => `#/pages/${id}`,
  categories: '#/categories',
  category: (id: number | 'uncategorized') => `#/categories/${id}`,
  notes: '#/notes',
  search: '#/search',
}
