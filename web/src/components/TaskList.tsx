import { useState, type FormEvent } from 'react'
import { api, type Task } from '../api.ts'
import { useMutate, useThings, useUpdateTask } from '../hooks.ts'
import { href } from '../route.ts'
import { dueLabel, fromDateInput, nowSec, toDateInput } from '../time.ts'

const PRIORITY: Record<number, string> = { 1: 'high', 2: 'normal', 3: 'low' }
const REPEAT: [string, string][] = [
  ['', "Doesn't repeat"], ['P1W', 'Every week'], ['P2W', 'Every 2 weeks'], ['P1M', 'Every month'],
  ['P3M', 'Every 3 months'], ['P6M', 'Every 6 months'], ['P1Y', 'Every year'],
]
const repeatLabel = (r: string) => REPEAT.find(([v]) => v === r)?.[1] ?? `Repeats ${r}`

interface ListProps {
  tasks: Task[]
  /** Hide the thing link (e.g. on that thing's own page). */
  showThing?: boolean
  /** Hide the "inbox" marker when the surrounding grouping already says it. */
  showInbox?: boolean
}

export function TaskList({ tasks, showThing = true, showInbox = true }: ListProps) {
  const [editing, setEditing] = useState<number | null>(null)
  if (tasks.length === 0) return null
  return (
    <ul className="tasks">
      {tasks.map((t) => (
        <TaskItem
          key={t.id}
          task={t}
          showThing={showThing}
          showInbox={showInbox}
          editing={editing === t.id}
          onEdit={() => setEditing(editing === t.id ? null : t.id)}
          onClose={() => setEditing(null)}
        />
      ))}
    </ul>
  )
}

interface ItemProps {
  task: Task
  showThing: boolean
  showInbox: boolean
  editing: boolean
  onEdit: () => void
  onClose: () => void
}

function TaskItem({ task: t, showThing, showInbox, editing, onEdit, onClose }: ItemProps) {
  const update = useUpdateTask()
  const pending = t.id < 0
  const due = t.due_at && !t.completed_at ? dueLabel(t.due_at) : null
  const cls = [t.completed_at && 'done', pending && 'pending', editing && 'editing'].filter(Boolean).join(' ')
  const priority = t.priority != null && t.priority !== 2 && !t.completed_at ? PRIORITY[t.priority] : null

  return (
    <li className={cls || undefined}>
      <div className="task-row">
        <input
          type="checkbox"
          aria-label={t.completed_at ? `Reopen ${t.brief}` : `Complete ${t.brief}`}
          checked={!!t.completed_at}
          disabled={pending}
          onChange={() => update.mutate({ id: t.id, patch: { completed_at: t.completed_at ? null : nowSec() } })}
        />
        <div className="task-main">
          <button className="brief" onClick={onEdit} disabled={pending} aria-expanded={editing}>
            {t.brief}
          </button>
          {t.details && !editing && <p className="task-details">{t.details}</p>}
          <div className="meta">
            {due && <span className={`tag due-${due.tone}`}>{due.text}</span>}
            {priority && <span className={`tag pri-${priority}`}>{priority}</span>}
            {t.recur && <span className="tag" title={repeatLabel(t.recur)}>↻ {repeatLabel(t.recur).replace('Every ', '')}</span>}
            {showThing && t.thing_id && <a className="tag link" href={href.thing(t.thing_id)}>{t.thing_name}</a>}
            {showInbox && t.priority == null && !t.completed_at && !pending && (
              <span className="tag inbox" title="Not triaged yet. Click to add a date or priority.">inbox</span>
            )}
          </div>
        </div>
      </div>
      {editing && <TaskEditor task={t} onClose={onClose} />}
      {update.isError && <p className="error">Couldn't save: {update.error.message}</p>}
    </li>
  )
}

function TaskEditor({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data: things = [] } = useThings()
  const update = useUpdateTask()
  const remove = useMutate(() => api.deleteTask(task.id))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [brief, setBrief] = useState(task.brief)
  const [details, setDetails] = useState(task.details ?? '')
  const [due, setDue] = useState(toDateInput(task.due_at))
  const [priority, setPriority] = useState(task.priority == null ? '' : String(task.priority))
  const [recur, setRecur] = useState(task.recur ?? '')
  const [thingId, setThingId] = useState(task.thing_id == null ? '' : String(task.thing_id))
  const error = update.error ?? remove.error

  function save(e: FormEvent) {
    e.preventDefault()
    if (!brief.trim()) return
    update.mutate(
      {
        id: task.id,
        patch: {
          brief: brief.trim(),
          details: details.trim() || null,
          due_at: fromDateInput(due),
          priority: priority ? Number(priority) : null,
          recur: recur || null,
          thing_id: thingId ? Number(thingId) : null,
        },
      },
      { onSuccess: onClose },
    )
  }

  const sorted = [...things].sort((a, b) => a.path.localeCompare(b.path))

  return (
    <form className="panel editor" onSubmit={save} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <label className="field">
        <span>Brief</span>
        <input value={brief} onChange={(e) => setBrief(e.target.value)} required />
      </label>
      <label className="field">
        <span>Details</span>
        <textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Due</span>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="field">
          <span>Repeat</span>
          <select value={recur} onChange={(e) => setRecur(e.target.value)}>
            {REPEAT.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Untriaged</option>
            <option value="1">High</option>
            <option value="2">Normal</option>
            <option value="3">Low</option>
          </select>
        </label>
        <label className="field">
          <span>Thing</span>
          <select value={thingId} onChange={(e) => setThingId(e.target.value)}>
            <option value="">None</option>
            {sorted.map((th) => <option key={th.id} value={th.id}>{th.path}</option>)}
          </select>
        </label>
      </div>
      {recur && <p className="hint">Completing it creates the next one, {repeatLabel(recur).toLowerCase()} after {due ? 'the due date' : 'completion'}.</p>}
      {error && <p className="error">Couldn't save: {error.message}</p>}
      <div className="actions">
        <button type="submit" className="primary" disabled={update.isPending}>Save</button>
        <button type="button" onClick={onClose}>Cancel</button>
        <span className="spacer" />
        {confirmDelete ? (
          <>
            <span className="hint">Delete this task?</span>
            <button type="button" className="danger" onClick={() => remove.mutate()}>Delete</button>
            <button type="button" onClick={() => setConfirmDelete(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="link danger" onClick={() => setConfirmDelete(true)}>Delete</button>
        )}
      </div>
    </form>
  )
}
