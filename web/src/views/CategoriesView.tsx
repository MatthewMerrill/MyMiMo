import { api } from '../api.ts'
import { useCategories, useMutate } from '../hooks.ts'
import { href } from '../route.ts'
import { QuickAdd } from '../components/QuickAdd.tsx'
import { Section } from '../components/Section.tsx'

/** Index of every category. */
export function CategoriesView() {
  const { status, data, error } = useCategories()
  const create = useMutate(api.createCategory)

  return (
    <article>
      <header className="page-head">
        <h1>Categories</h1>
        <p className="hint">Tags for pages. A page can be in any number of them, e.g. Guides, Appliances, Hobbies.</p>
      </header>

      <Section title="All categories" count={data?.categories.length}>
        <QuickAdd
          placeholder="New category…"
          onAdd={(name) => create.mutateAsync(name).then((c) => { window.location.hash = href.category(c.id) })}
        />
        {status === 'pending' && <p className="muted">Loading…</p>}
        {status === 'error' && <p className="error">{error.message}</p>}
        <ul className="index-list">
          {data?.categories.map((c) => (
            <li key={c.id}>
              <a href={href.category(c.id)}>{c.name}</a>
              <span className="counts">{c.page_count} {c.page_count === 1 ? 'page' : 'pages'}</span>
            </li>
          ))}
          {data && data.uncategorized > 0 && (
            <li>
              <a href={href.category('uncategorized')}><i>Uncategorized</i></a>
              <span className="counts">{data.uncategorized} {data.uncategorized === 1 ? 'page' : 'pages'}</span>
            </li>
          )}
        </ul>
        {data?.categories.length === 0 && <p className="muted">No categories yet.</p>}
      </Section>
    </article>
  )
}
