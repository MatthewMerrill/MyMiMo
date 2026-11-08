import type { Thing } from '../api.ts'
import { href } from '../route.ts'

/** Cards for a category page: name, where it lives, other categories, first line of the page body. */
export function ThingList({ things, hideCategory }: { things: Thing[]; hideCategory?: number }) {
  if (things.length === 0) return null
  return (
    <ul className="thing-list">
      {things.map((t) => {
        const where = t.path.includes(' › ') ? t.path.slice(0, t.path.lastIndexOf(' › ')) : null
        const others = t.categories.filter((c) => c.id !== hideCategory)
        const firstLine = t.body?.split('\n')[0]
        return (
          <li key={t.id}>
            <a className="title" href={href.thing(t.id)}>{t.name}</a>
            {where && <span className="where"> in {where}</span>}
            {firstLine && <p className="snippet">{firstLine}</p>}
            <div className="meta">
              {others.map((c) => <a key={c.id} className="tag link" href={href.category(c.id)}>{c.name}</a>)}
              {t.open_tasks > 0 && <span className="tag">{t.open_tasks} open</span>}
              {t.note_count > 0 && <span className="tag">{t.note_count} {t.note_count === 1 ? 'note' : 'notes'}</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
