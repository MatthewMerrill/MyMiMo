import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Category } from '../api.ts'
import { keys, useMutate } from '../hooks.ts'
import { href } from '../route.ts'
import { QuickAdd } from '../components/QuickAdd.tsx'
import { ThingList } from '../components/ThingList.tsx'
import { TaskList } from '../components/TaskList.tsx'
import { Section } from '../components/Section.tsx'

/** Landing page for one category: everything tagged with it, and their open tasks. */
export function CategoryView({ id }: { id: number }) {
  const { status, data, error } = useQuery({ queryKey: keys.category(id), queryFn: () => api.getCategory(id) })
  const create = useMutate((name: string) => api.createThing({ name, category_id: id }))
  const [editing, setEditing] = useState(false)

  if (status === 'pending') return <p className="muted">Loading…</p>
  if (status === 'error') return <p className="error">{error.message}</p>
  const { category, things, tasks } = data

  return (
    <article>
      <nav className="crumbs" aria-label="Breadcrumb"><a href={href.categories}>Categories</a></nav>
      <header className="page-head">
        <div className="title-row">
          <h1>{category.name}</h1>
          {!editing && <button onClick={() => setEditing(true)}>Edit</button>}
        </div>
        {editing && <CategoryEditPanel category={category} onClose={() => setEditing(false)} />}
      </header>

      <Section title="Things" count={things.length}>
        <QuickAdd placeholder={`Add a thing to ${category.name}…`} onAdd={(name) => create.mutateAsync(name)} />
        <ThingList things={things} hideCategory={id} />
        {things.length === 0 && <p className="muted">Nothing here yet.</p>}
      </Section>

      {tasks.length > 0 && (
        <Section title="Open tasks" count={tasks.length}>
          <TaskList tasks={tasks} />
        </Section>
      )}
    </article>
  )
}

export function UncategorizedView() {
  const { status, data, error } = useQuery({ queryKey: keys.category('uncategorized'), queryFn: api.uncategorized })
  if (status === 'pending') return <p className="muted">Loading…</p>
  if (status === 'error') return <p className="error">{error.message}</p>
  return (
    <article>
      <nav className="crumbs" aria-label="Breadcrumb"><a href={href.categories}>Categories</a></nav>
      <header className="page-head"><h1>Uncategorized</h1></header>
      <Section title="Things" count={data.things.length}>
        <p className="hint">Not in any category yet. Open one and use “+ category” to file it.</p>
        <ThingList things={data.things} />
        {data.things.length === 0 && <p className="muted">Everything has a category.</p>}
      </Section>
    </article>
  )
}

function CategoryEditPanel({ category, onClose }: { category: Category; onClose: () => void }) {
  const [name, setName] = useState(category.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rename = useMutate((n: string) => api.renameCategory(category.id, n))
  // Navigate inside the mutation, before the refetch, so this page never shows a 404 for itself.
  const remove = useMutate(() => api.deleteCategory(category.id).then(() => { window.location.hash = href.categories }))
  const error = rename.error ?? remove.error

  function save(e: FormEvent) {
    e.preventDefault()
    if (name.trim()) rename.mutate(name.trim(), { onSuccess: onClose })
  }

  return (
    <form className="panel" onSubmit={save} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </label>
      {error && <p className="error">{error.message}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={rename.isPending}>Save</button>
        <button type="button" onClick={onClose}>Cancel</button>
        <span className="spacer" />
        {confirmDelete ? (
          <>
            <span className="hint">Its {category.thing_count} thing(s) stay, just untagged.</span>
            <button
              type="button"
              className="danger"
              onClick={() => remove.mutate()}
            >
              Delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="link danger" onClick={() => setConfirmDelete(true)}>Delete category…</button>
        )}
      </div>
    </form>
  )
}
