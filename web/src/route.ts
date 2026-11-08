import { useEffect, useMemo, useSyncExternalStore } from 'react'

export type Route =
  | { name: 'tasks' }
  | { name: 'things' }
  | { name: 'categories' }
  | { name: 'notes' }
  | { name: 'thing'; id: number }
  | { name: 'category'; id: number | 'uncategorized' }
  | { name: 'search' }

function parse(hash: string): Route {
  const [a, b] = hash.replace(/^#\/?/, '').split('/')
  if (a === 'things' && b) {
    const id = Number(b)
    if (Number.isInteger(id) && id > 0) return { name: 'thing', id }
  }
  if (a === 'things') return { name: 'things' }
  if (a === 'categories' && b === 'uncategorized') return { name: 'category', id: 'uncategorized' }
  if (a === 'categories' && b) {
    const id = Number(b)
    if (Number.isInteger(id) && id > 0) return { name: 'category', id }
  }
  if (a === 'categories') return { name: 'categories' }
  if (a === 'notes') return { name: 'notes' }
  if (a === 'search') return { name: 'search' }
  return { name: 'tasks' }
}

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

/** Tiny hash router: #/ · #/things[/:id] · #/categories[/:id|uncategorized] · #/notes · #/search */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  useEffect(() => window.scrollTo(0, 0), [hash])
  return useMemo(() => parse(hash), [hash])
}

export const href = {
  tasks: '#/',
  things: '#/things',
  thing: (id: number) => `#/things/${id}`,
  categories: '#/categories',
  notes: '#/notes',
  category: (id: number | 'uncategorized') => `#/categories/${id}`,
  search: '#/search',
}
