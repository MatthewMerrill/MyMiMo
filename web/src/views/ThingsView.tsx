import { api, type Thing } from '../api.ts'
import { useMutate, useThings } from '../hooks.ts'
import { href } from '../route.ts'
import { QuickAdd } from '../components/QuickAdd.tsx'
import { Account } from '../components/Account.tsx'

/** Every thing, as a tree by where it lives. */
export function ThingsView() {
  const { status, data: things = [], error } = useThings()
  const create = useMutate(api.createThing)

  const byParent = new Map<number | null, Thing[]>()
  for (const t of things) byParent.set(t.parent_id, [...(byParent.get(t.parent_id) ?? []), t])

  return (
    <article>
      <header className="page-head">
        <h1>Things</h1>
        <p className="hint">Indented things live inside the one above them.</p>
      </header>
      <QuickAdd placeholder="Add a thing: a room, device, car…" onAdd={(name) => create.mutateAsync({ name })} />
      {status === 'pending' && <p className="muted">Loading…</p>}
      {status === 'error' && <p className="error">Couldn't load things: {error.message}</p>}
      <Tree byParent={byParent} parent={null} />

      {/* Phones have no sidebar, so the account line lives here. */}
      <div className="mobile-only"><Account /></div>
    </article>
  )
}

function Tree({ byParent, parent }: { byParent: Map<number | null, Thing[]>; parent: number | null }) {
  const kids = byParent.get(parent)
  if (!kids?.length) return null
  return (
    <ul className="tree">
      {kids.map((t) => (
        <li key={t.id}>
          <a href={href.thing(t.id)}>
            <span>{t.name}</span>
            <Counts thing={t} />
          </a>
          <Tree byParent={byParent} parent={t.id} />
        </li>
      ))}
    </ul>
  )
}

export function Counts({ thing }: { thing: Pick<Thing, 'open_tasks' | 'note_count'> }) {
  const parts = [
    thing.open_tasks > 0 && `${thing.open_tasks} open`,
    thing.note_count > 0 && `${thing.note_count} ${thing.note_count === 1 ? 'note' : 'notes'}`,
  ].filter(Boolean)
  return parts.length ? <span className="counts">{parts.join(' · ')}</span> : null
}
