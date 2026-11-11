import { useEffect } from 'react'
import { api } from '../api.ts'
import { useMutate, usePageTitles, usePages } from '../hooks.ts'
import { href } from '../route.ts'

/** Target of a [[wiki link]]: jumps to the page with that title, or offers to create it. */
export function WikiLinkView({ title }: { title: string }) {
  const { status } = usePages()
  const titles = usePageTitles()
  const id = titles.get(title.toLowerCase())
  const create = useMutate(() => api.createPage({ title }))

  useEffect(() => {
    if (id) window.location.replace(href.page(id))
  }, [id])

  if (status === 'pending' || id) return <p className="muted">Opening…</p>
  return (
    <article>
      <header className="page-head">
        <h1 className="missing-title">{title}</h1>
        <p className="hint">There's no page with this title yet.</p>
      </header>
      {create.isError && <p className="error">{create.error.message}</p>}
      <div className="actions">
        <button
          className="primary"
          disabled={create.isPending}
          onClick={() => create.mutate(undefined, { onSuccess: (p) => window.location.replace(href.page(p.id)) })}
        >
          Create “{title}”
        </button>
        <a className="button" href={href.pages}>Back to pages</a>
      </div>
    </article>
  )
}
