import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type Task } from '../api.ts'
import { keys, useCreateTask } from '../hooks.ts'
import { daysFromToday } from '../time.ts'
import { QuickAdd } from '../components/QuickAdd.tsx'
import { TaskList } from '../components/TaskList.tsx'
import { Section } from '../components/Section.tsx'

type Group = 'overdue' | 'week' | 'inbox' | 'later' | 'someday'

const GROUPS: { key: Group; title: string; hint?: string }[] = [
  { key: 'overdue', title: 'Overdue' },
  { key: 'week', title: 'This week' },
  { key: 'inbox', title: 'Inbox', hint: 'Captured but not sorted yet. Click one to add a date or priority.' },
  { key: 'later', title: 'Coming up' },
  { key: 'someday', title: 'No date' },
]

function groupOf(t: Task): Group {
  if (t.due_at != null) {
    const d = daysFromToday(t.due_at)
    return d < 0 ? 'overdue' : d <= 7 ? 'week' : 'later'
  }
  return t.priority == null ? 'inbox' : 'someday'
}

export function TasksView() {
  const { status, data: tasks = [], error } = useQuery({ queryKey: keys.tasks, queryFn: api.listTasks })
  const create = useCreateTask()
  const [showDone, setShowDone] = useState(false)

  const open = tasks.filter((t) => !t.completed_at)
  const done = tasks.filter((t) => t.completed_at)
  const grouped = new Map<Group, Task[]>()
  for (const t of open) {
    const g = groupOf(t)
    grouped.set(g, [...(grouped.get(g) ?? []), t])
  }

  return (
    <>
      <header className="page-head"><h1>Tasks</h1></header>
      <div className="capture">
        <QuickAdd big autoFocus placeholder="What needs doing?" onAdd={(brief) => create.mutateAsync({ brief })} />
      </div>
      {status === 'pending' && <p className="muted">Loading…</p>}
      {status === 'error' && <p className="error">Couldn't load tasks: {error.message}</p>}
      {status === 'success' && open.length === 0 && <p className="muted">Nothing to do.</p>}

      {GROUPS.map(({ key, title, hint }) => {
        const list = grouped.get(key)
        if (!list?.length) return null
        return (
          <Section key={key} title={title} count={list.length}>
            {hint && <p className="hint">{hint}</p>}
            <TaskList tasks={list} showInbox={false} />
          </Section>
        )
      })}

      {done.length > 0 && (
        <Section
          title="Completed"
          count={done.length}
          action={<button className="link" onClick={() => setShowDone((s) => !s)}>{showDone ? 'Hide' : 'Show'}</button>}
        >
          {showDone && <TaskList tasks={done} />}
        </Section>
      )}
    </>
  )
}
