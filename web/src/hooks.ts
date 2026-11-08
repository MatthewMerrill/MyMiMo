import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, type Task, type TaskPatch } from './api.ts'
import { nowSec } from './time.ts'

export const keys = {
  tasks: ['tasks'],
  things: ['things'],
  thing: (id: number) => ['thing', id],
  categories: ['categories'],
  category: (id: number | 'uncategorized') => ['category', id],
  looseNotes: ['notes', 'loose'],
  allNotes: ['notes', 'all'],
  search: (q: string) => ['search', q],
}

export function useThings() {
  return useQuery({ queryKey: keys.things, queryFn: api.listThings })
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: api.listCategories })
}

/** A mutation that refetches everything afterwards — the data set is tiny, so keep it simple. */
export function useMutate<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries() })
}

/** Applies a patch to a task wherever it's cached, so toggles/edits feel instant. */
function patchCachedTask(qc: QueryClient, id: number, patch: TaskPatch) {
  const apply = (t: Task) => (t.id === id ? { ...t, ...patch } : t)
  qc.setQueryData<Task[]>(keys.tasks, (old) => old?.map(apply))
  for (const prefix of ['thing', 'category']) {
    qc.setQueriesData<{ tasks?: Task[] }>({ queryKey: [prefix] }, (old) =>
      old?.tasks ? { ...old, tasks: old.tasks.map(apply) } : old,
    )
  }
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TaskPatch }) => api.updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries()
      patchCachedTask(qc, id, patch)
    },
    onSettled: () => qc.invalidateQueries(),
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createTask,
    onMutate: async ({ brief, thing_id = null }) => {
      await qc.cancelQueries({ queryKey: keys.tasks })
      const optimistic: Task = {
        id: -Date.now(), brief, thing_id, thing_name: null, details: null, due_at: null,
        priority: null, recur: null, created_at: nowSec(), updated_at: nowSec(), completed_at: null,
      }
      qc.setQueryData<Task[]>(keys.tasks, (old) => old && [optimistic, ...old])
    },
    onSettled: () => qc.invalidateQueries(),
  })
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
