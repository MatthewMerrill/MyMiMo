import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, type Page, type PageDetail, type Task, type TaskPatch } from './api.ts'
import { nowSec } from './time.ts'

export const keys = {
  tasks: ['tasks'],
  pages: ['pages'],
  page: (id: number) => ['page', id],
  categories: ['categories'],
  category: (id: number | 'uncategorized') => ['category', id],
  looseNotes: ['notes', 'loose'],
  allNotes: ['notes', 'all'],
  search: (q: string) => ['search', q],
}

export function usePages() {
  return useQuery({ queryKey: keys.pages, queryFn: api.listPages })
}

/** Lower-cased title → page id, for resolving [[wiki links]]. */
export function usePageTitles(): Map<string, number> {
  const { data } = usePages()
  return useMemo(() => new Map((data ?? []).map((p) => [p.title.toLowerCase(), p.id])), [data])
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
  for (const prefix of ['page', 'category']) {
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
    onMutate: async ({ brief, page_id = null }) => {
      await qc.cancelQueries({ queryKey: keys.tasks })
      const optimistic: Task = {
        id: -Date.now(), brief, page_id, page_title: null, details: null, due_at: null,
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

/** Saves a page body with its version, so a stale tab gets a 409 instead of overwriting. */
export function useSaveBody(page: Page) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: string | null) => api.updatePage(page.id, { body, version: page.version }),
    // Update the cached page immediately so the next edit carries the new version.
    onSuccess: (updated) =>
      qc.setQueryData<PageDetail>(keys.page(page.id), (old) => old && { ...old, page: updated }),
    onSettled: () => qc.invalidateQueries(),
  })
}

