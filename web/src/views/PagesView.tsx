import { api, type Page } from '../api.ts'
import { useMutate, usePages } from '../hooks.ts'
import { href } from '../route.ts'
import { QuickAdd } from '../components/QuickAdd.tsx'
import { Account } from '../components/Account.tsx'

/** Every page, as a tree of subpages. */
export function PagesView() {
  const { status, data: pages = [], error } = usePages()
  const create = useMutate(api.createPage)

  const byParent = new Map<number | null, Page[]>()
  for (const p of pages) byParent.set(p.parent_id, [...(byParent.get(p.parent_id) ?? []), p])

  return (
    <article>
      <header className="page-head">
        <h1>Pages</h1>
        <p className="hint">Anything worth writing down: a room, a device, a hobby, a how-to. Indented pages are subpages.</p>
      </header>
      <QuickAdd
        placeholder="New page title…"
        onAdd={(title) => create.mutateAsync({ title }).then((p) => { window.location.hash = href.page(p.id) })}
      />
      {status === 'pending' && <p className="muted">Loading…</p>}
      {status === 'error' && <p className="error">Couldn't load pages: {error.message}</p>}
      <Tree byParent={byParent} parent={null} />

      {/* Phones have no sidebar, so the account line lives here. */}
      <div className="mobile-only"><Account /></div>
    </article>
  )
}

function Tree({ byParent, parent }: { byParent: Map<number | null, Page[]>; parent: number | null }) {
  const kids = byParent.get(parent)
  if (!kids?.length) return null
  return (
    <ul className="tree">
      {kids.map((p) => (
        <li key={p.id}>
          <a href={href.page(p.id)}>
            <span>{p.title}</span>
            <Counts page={p} />
          </a>
          <Tree byParent={byParent} parent={p.id} />
        </li>
      ))}
    </ul>
  )
}

export function Counts({ page }: { page: Pick<Page, 'open_tasks' | 'note_count'> }) {
  const parts = [
    page.open_tasks > 0 && `${page.open_tasks} open`,
    page.note_count > 0 && `${page.note_count} log`,
  ].filter(Boolean)
  return parts.length ? <span className="counts">{parts.join(' · ')}</span> : null
}
