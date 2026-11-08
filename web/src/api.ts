export interface Task {
  id: number
  thing_id: number | null
  thing_name: string | null
  brief: string
  details: string | null
  due_at: number | null
  /** null = untriaged ("inbox"); 1 high, 2 normal, 3 low */
  priority: number | null
  recur: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
}

export type TaskPatch = Partial<
  Pick<Task, 'brief' | 'details' | 'thing_id' | 'due_at' | 'priority' | 'recur' | 'completed_at'>
>

export interface CategoryRef {
  id: number
  name: string
}

export interface Category extends CategoryRef {
  thing_count: number
}

export interface Thing {
  id: number
  parent_id: number | null
  name: string
  /** "House › Den › Walls" */
  path: string
  /** the wiki page content */
  body: string | null
  categories: CategoryRef[]
  archived_at: number | null
  open_tasks: number
  note_count: number
  child_count: number
}

export interface ThingDetail {
  thing: Thing
  ancestors: { id: number; name: string }[]
  children: Thing[]
  notes: Note[]
  tasks: Task[]
}

export interface Note {
  id: number
  thing_id: number | null
  thing_name: string | null
  /** only present on search results */
  thing_path?: string | null
  body: string
  pinned: boolean
  created_at: number
  updated_at: number
}

export interface CategoryPage {
  category: Category
  things: Thing[]
  tasks: Task[]
}

export interface SearchResults {
  categories: CategoryRef[]
  things: Pick<Thing, 'id' | 'name' | 'path'>[]
  notes: Note[]
  tasks: Task[]
}

export interface Me {
  auth_enabled: boolean
  provider: 'discord' | null
  user: { id: number; name: string; avatar_url: string | null } | null
}

/** Fired when any request comes back 401, so the app can drop to the login screen. */
export const UNAUTHORIZED_EVENT = 'mymimo:unauthorized'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const send = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const api = {
  me: () => request<Me>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  listTasks: () => request<Task[]>('/tasks'),
  createTask: (t: { brief: string; thing_id?: number | null }) => request<Task>('/tasks', send('POST', t)),
  updateTask: (id: number, patch: TaskPatch) => request<Task>(`/tasks/${id}`, send('PATCH', patch)),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  listThings: () => request<Thing[]>('/things'),
  getThing: (id: number) => request<ThingDetail>(`/things/${id}`),
  createThing: (t: { name: string; parent_id?: number | null; category_id?: number | null }) =>
    request<Thing>('/things', send('POST', t)),
  updateThing: (
    id: number,
    patch: { name?: string; body?: string | null; parent_id?: number | null; archived_at?: number | null },
  ) => request<Thing>(`/things/${id}`, send('PATCH', patch)),
  /** Tags by name; the category is created if it doesn't exist. */
  addThingCategory: (id: number, name: string) => request<Thing>(`/things/${id}/categories`, send('POST', { name })),
  removeThingCategory: (id: number, categoryId: number) =>
    request<Thing>(`/things/${id}/categories/${categoryId}`, { method: 'DELETE' }),

  listCategories: () => request<{ categories: Category[]; uncategorized: number }>('/categories'),
  getCategory: (id: number) => request<CategoryPage>(`/categories/${id}`),
  uncategorized: () => request<{ things: Thing[] }>('/categories/uncategorized'),
  createCategory: (name: string) => request<Category>('/categories', send('POST', { name })),
  renameCategory: (id: number, name: string) => request<Category>(`/categories/${id}`, send('PATCH', { name })),
  deleteCategory: (id: number) => request<void>(`/categories/${id}`, { method: 'DELETE' }),

  listNotes: () => request<Note[]>('/notes'),
  listLooseNotes: () => request<Note[]>('/notes?thing_id=none'),
  createNote: (n: { body: string; thing_id?: number | null }) => request<Note>('/notes', send('POST', n)),
  updateNote: (id: number, patch: { body?: string; pinned?: boolean; thing_id?: number | null }) =>
    request<Note>(`/notes/${id}`, send('PATCH', patch)),
  deleteNote: (id: number) => request<void>(`/notes/${id}`, { method: 'DELETE' }),

  search: (q: string) => request<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
}
