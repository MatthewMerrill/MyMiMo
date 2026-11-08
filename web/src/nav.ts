import { href, type Route } from './route.ts'

/** Top-level pages. Drives both the sidebar (wide screens) and the bottom tabs (phones). */
export const NAV: { label: string; href: string; active: (r: Route) => boolean }[] = [
  { label: 'Tasks', href: href.tasks, active: (r) => r.name === 'tasks' },
  { label: 'Things', href: href.things, active: (r) => r.name === 'things' || r.name === 'thing' },
  { label: 'Categories', href: href.categories, active: (r) => r.name === 'categories' || r.name === 'category' },
  { label: 'Notes', href: href.notes, active: (r) => r.name === 'notes' },
  { label: 'Search', href: href.search, active: (r) => r.name === 'search' },
]
