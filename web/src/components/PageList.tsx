import type { Page } from '../api.ts'
import { imageUrl } from '../images.ts'
import { href } from '../route.ts'
import { plainText } from '../wiki.ts'

/** Rows for a category page: thumbnail, title, where it lives, other categories, first line of the body. */
export function PageList({ pages, hideCategory }: { pages: Page[]; hideCategory?: number }) {
  if (pages.length === 0) return null
  return (
    <ul className="page-list">
      {pages.map((p) => {
        const where = p.path.includes(' › ') ? p.path.slice(0, p.path.lastIndexOf(' › ')) : null
        const others = p.categories.filter((c) => c.id !== hideCategory)
        const firstLine = p.body && plainText(p.body).split('\n').find((l) => l.trim() && !l.startsWith('```'))
        return (
          <li key={p.id}>
            {p.cover_image_id
              ? <img className="thumb" src={imageUrl(p.cover_image_id, true)} alt="" loading="lazy" />
              : <span className="thumb empty" aria-hidden />}
            <div className="page-list-main">
              <a className="title" href={href.page(p.id)}>{p.title}</a>
              {where && <span className="where"> in {where}</span>}
              {firstLine && <p className="snippet">{firstLine.replace(/[*_`#>]/g, '').trim()}</p>}
              <div className="meta">
                {others.map((c) => <a key={c.id} className="tag link" href={href.category(c.id)}>{c.name}</a>)}
                {p.open_tasks > 0 && <span className="tag">{p.open_tasks} open</span>}
                {p.note_count > 0 && <span className="tag">{p.note_count} {p.note_count === 1 ? 'log entry' : 'log entries'}</span>}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
