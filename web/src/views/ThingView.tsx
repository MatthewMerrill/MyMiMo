import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Thing } from '../api.ts'
import { keys, useCreateTask, useMutate, useThings } from '../hooks.ts'
import { href } from '../route.ts'
import { nowSec } from '../time.ts'
import { QuickAdd } from '../components/QuickAdd.tsx'
import { TaskList } from '../components/TaskList.tsx'
import { AddNote, NoteList } from '../components/Notes.tsx'
import { PageBody } from '../components/PageBody.tsx'
import { ThingCategories } from '../components/ThingCategories.tsx'
import { Section } from '../components/Section.tsx'
import { Counts } from './ThingsView.tsx'

export function ThingView({ id }: { id: number }) {
  const { status, data, error } = useQuery({ queryKey: keys.thing(id), queryFn: () => api.getThing(id) })
  const createTask = useCreateTask()
  const createChild = useMutate(api.createThing)
  const [editing, setEditing] = useState(false)
  const [editingBody, setEditingBody] = useState(false)
  const [showDone, setShowDone] = useState(false)

  if (status === 'pending') return <p className="muted">Loading…</p>
  if (status === 'error') return <p className="error">{error.message}</p>

  const { thing, ancestors, children, notes, tasks } = data
  const open = tasks.filter((t) => !t.completed_at)
  const done = tasks.filter((t) => t.completed_at)

  return (
    <article>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={href.things}>Things</a>
        {ancestors.map((a) => <span key={a.id}> / <a href={href.thing(a.id)}>{a.name}</a></span>)}
      </nav>

      <header className="page-head">
        <div className="title-row">
          <h1>{thing.name}</h1>
          {!editing && !thing.archived_at && <button onClick={() => setEditing(true)}>Edit</button>}
        </div>
        {thing.archived_at && <ArchivedBanner thing={thing} />}
        {editing && <ThingEditPanel thing={thing} onClose={() => setEditing(false)} />}
        <ThingCategories thing={thing} />
      </header>

      <Section
        title="About"
        action={thing.body && !editingBody && <button className="link" onClick={() => setEditingBody(true)}>Edit</button>}
      >
        <PageBody key={thing.id} thing={thing} editing={editingBody} setEditing={setEditingBody} />
      </Section>

      <Section title="Tasks" count={open.length}>
        <QuickAdd placeholder={`Add a task for ${thing.name}…`} onAdd={(brief) => createTask.mutateAsync({ brief, thing_id: id })} />
        <TaskList tasks={open} showThing={false} />
        {done.length > 0 && (
          <>
            <button className="link" onClick={() => setShowDone((s) => !s)}>
              {showDone ? 'Hide' : 'Show'} {done.length} completed
            </button>
            {showDone && <TaskList tasks={done} showThing={false} />}
          </>
        )}
      </Section>

      <Section title="Log" count={notes.length}>
        <AddNote thingId={id} placeholder="Add a dated note: what happened, what you changed…" />
        <NoteList notes={notes} />
      </Section>

      <Section title={`Inside ${thing.name}`} count={children.length}>
        <QuickAdd placeholder="Add something inside…" onAdd={(name) => createChild.mutateAsync({ name, parent_id: id })} />
        {children.length > 0 && (
          <ul className="tree">
            {children.map((c) => (
              <li key={c.id}>
                <a href={href.thing(c.id)}><span>{c.name}</span><Counts thing={c} /></a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </article>
  )
}

function ArchivedBanner({ thing }: { thing: Thing }) {
  const restore = useMutate(() => api.updateThing(thing.id, { archived_at: null }))
  return (
    <p className="banner">
      This thing is archived and hidden from lists and search.{' '}
      <button className="link" onClick={() => restore.mutate()}>Restore it</button>
    </p>
  )
}

/** Name, location, and archive in one panel instead of three separate controls. */
function ThingEditPanel({ thing, onClose }: { thing: Thing; onClose: () => void }) {
  const { data: things = [] } = useThings()
  const [name, setName] = useState(thing.name)
  const [parent, setParent] = useState(thing.parent_id == null ? '' : String(thing.parent_id))
  const [confirmArchive, setConfirmArchive] = useState(false)
  const update = useMutate((patch: Parameters<typeof api.updateThing>[1]) => api.updateThing(thing.id, patch))

  // Can't move a thing into itself or anything inside it.
  const targets = things
    .filter((t) => t.id !== thing.id && !t.path.startsWith(thing.path + ' › '))
    .sort((a, b) => a.path.localeCompare(b.path))

  function save(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    update.mutate({ name: name.trim(), parent_id: parent ? Number(parent) : null }, { onSuccess: onClose })
  }
  function archive() {
    update.mutate({ archived_at: nowSec() }, {
      onSuccess: () => { window.location.hash = thing.parent_id ? href.thing(thing.parent_id) : href.things },
    })
  }

  return (
    <form className="panel" onSubmit={save} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="field-grid">
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>Located in</span>
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Nothing (top level)</option>
            {targets.map((t) => <option key={t.id} value={t.id}>{t.path}</option>)}
          </select>
        </label>
      </div>
      {update.isError && <p className="error">{update.error.message}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={update.isPending}>Save</button>
        <button type="button" onClick={onClose}>Cancel</button>
        <span className="spacer" />
        {confirmArchive ? (
          <>
            <span className="hint">Hide it from lists and search?</span>
            <button type="button" className="danger" onClick={archive}>Archive</button>
            <button type="button" onClick={() => setConfirmArchive(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="link danger" onClick={() => setConfirmArchive(true)}>Archive…</button>
        )}
      </div>
    </form>
  )
}
