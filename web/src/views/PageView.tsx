import { useRef, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Page } from '../api.ts'
import { keys, useCreateTask, useMutate, usePages, useSaveBody } from '../hooks.ts'
import { imageUrl, uploadImage } from '../images.ts'
import { href } from '../route.ts'
import { nowSec } from '../time.ts'
import { hasCheckedTasks, uncheckAll } from '../wiki.ts'
import { QuickAdd } from '../components/QuickAdd.tsx'
import { TaskList } from '../components/TaskList.tsx'
import { AddNote, NoteList } from '../components/Notes.tsx'
import { PageBody } from '../components/PageBody.tsx'
import { PageCategories } from '../components/PageCategories.tsx'
import { Section } from '../components/Section.tsx'
import { Counts } from './PagesView.tsx'

export function PageView({ id }: { id: number }) {
  const { status, data, error } = useQuery({ queryKey: keys.page(id), queryFn: () => api.getPage(id) })
  const createTask = useCreateTask()
  const createChild = useMutate(api.createPage)
  const [editing, setEditing] = useState(false)
  const [editingBody, setEditingBody] = useState(false)
  const [showDone, setShowDone] = useState(false)

  if (status === 'pending') return <p className="muted">Loading…</p>
  if (status === 'error') return <p className="error">{error.message}</p>

  const { page, ancestors, children, notes, tasks, linked_from } = data
  const open = tasks.filter((t) => !t.completed_at)
  const done = tasks.filter((t) => t.completed_at)

  return (
    <article>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a href={href.pages}>Pages</a>
        {ancestors.map((a) => <span key={a.id}> / <a href={href.page(a.id)}>{a.title}</a></span>)}
      </nav>

      <header className="page-head">
        <div className="title-row">
          <h1>{page.title}</h1>
          {!editing && !page.archived_at && (
            <div className="title-actions">
              <PinButton page={page} />
              <button onClick={() => setEditing(true)}>Edit</button>
            </div>
          )}
        </div>
        {page.archived_at && <ArchivedBanner page={page} />}
        {editing && <PageEditPanel page={page} onClose={() => setEditing(false)} />}
        <PageCategories page={page} />
        {page.cover_image_id && (
          <a href={imageUrl(page.cover_image_id)} target="_blank" rel="noopener noreferrer">
            <img className="cover" src={imageUrl(page.cover_image_id)} alt="" />
          </a>
        )}
      </header>

      <Section
        title="About"
        action={page.body && !editingBody && (
          <span className="section-actions">
            {hasCheckedTasks(page.body) && <UncheckAll page={page} />}
            <button className="link" onClick={() => setEditingBody(true)}>Edit</button>
          </span>
        )}
      >
        <PageBody key={page.id} page={page} editing={editingBody} setEditing={setEditingBody} />
      </Section>

      <Section title="Tasks" count={open.length}>
        <QuickAdd placeholder={`Add a task for ${page.title}…`} onAdd={(brief) => createTask.mutateAsync({ brief, page_id: id })} />
        <TaskList tasks={open} showPage={false} />
        {done.length > 0 && (
          <>
            <button className="link" onClick={() => setShowDone((s) => !s)}>
              {showDone ? 'Hide' : 'Show'} {done.length} completed
            </button>
            {showDone && <TaskList tasks={done} showPage={false} />}
          </>
        )}
      </Section>

      <Section title="Log" count={notes.length}>
        <AddNote pageId={id} placeholder="Add a dated note: what happened, what you changed…" />
        <NoteList notes={notes} />
      </Section>

      {linked_from.length > 0 && (
        <Section title="Linked from" count={linked_from.length}>
          <ul className="index-list">
            {linked_from.map((l) => (
              <li key={l.id}><a href={href.page(l.id)}>{l.title}</a><span className="counts">{l.path !== l.title ? l.path : ''}</span></li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Subpages" count={children.length}>
        <QuickAdd placeholder={`Add a page inside ${page.title}…`} onAdd={(title) => createChild.mutateAsync({ title, parent_id: id })} />
        {children.length > 0 && (
          <ul className="tree">
            {children.map((c) => (
              <li key={c.id}>
                <a href={href.page(c.id)}><span>{c.title}</span><Counts page={c} /></a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </article>
  )
}

function PinButton({ page }: { page: Page }) {
  const pin = useMutate(() => api.updatePage(page.id, { pinned: !page.pinned }))
  return (
    <button className="link" onClick={() => pin.mutate()} title={page.pinned ? 'Remove from the sidebar' : 'Show in the sidebar'}>
      {page.pinned ? 'Unpin' : 'Pin'}
    </button>
  )
}

function UncheckAll({ page }: { page: Page }) {
  const save = useSaveBody(page)
  return (
    <button className="link" disabled={save.isPending} onClick={() => save.mutate(uncheckAll(page.body ?? ''))}>
      Uncheck all
    </button>
  )
}

function ArchivedBanner({ page }: { page: Page }) {
  const restore = useMutate(() => api.updatePage(page.id, { archived_at: null }))
  return (
    <p className="banner">
      This page is archived and hidden from lists and search.{' '}
      <button className="link" onClick={() => restore.mutate()}>Restore it</button>
    </p>
  )
}

/** Title, location, cover photo and archive in one panel. */
function PageEditPanel({ page, onClose }: { page: Page; onClose: () => void }) {
  const { data: pages = [] } = usePages()
  const [title, setTitle] = useState(page.title)
  const [parent, setParent] = useState(page.parent_id == null ? '' : String(page.parent_id))
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [coverError, setCoverError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const update = useMutate((patch: Parameters<typeof api.updatePage>[1]) => api.updatePage(page.id, patch))

  // Can't move a page into itself or anything inside it.
  const targets = pages
    .filter((p) => p.id !== page.id && !p.path.startsWith(page.path + ' › '))
    .sort((a, b) => a.path.localeCompare(b.path))

  function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    update.mutate({ title: title.trim(), parent_id: parent ? Number(parent) : null }, { onSuccess: onClose })
  }
  function archive() {
    update.mutate({ archived_at: nowSec() }, {
      onSuccess: () => { window.location.hash = page.parent_id ? href.page(page.parent_id) : href.pages },
    })
  }
  async function setCover(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setCoverError(null)
    try {
      const id = await uploadImage(file)
      update.mutate({ cover_image_id: id })
    } catch (e) {
      setCoverError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <form className="panel" onSubmit={save} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="field-grid">
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>Inside</span>
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Nothing (top level)</option>
            {targets.map((p) => <option key={p.id} value={p.id}>{p.path}</option>)}
          </select>
        </label>
      </div>
      <div className="field">
        <span>Cover photo</span>
        <div className="cover-field">
          {page.cover_image_id && <img className="thumb" src={imageUrl(page.cover_image_id, true)} alt="" />}
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : page.cover_image_id ? 'Replace' : 'Choose photo'}
          </button>
          {page.cover_image_id && (
            <button type="button" className="link danger" onClick={() => update.mutate({ cover_image_id: null })}>Remove</button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void setCover(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        {coverError && <p className="error">{coverError}</p>}
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
