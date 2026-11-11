export interface Task {
  id: number
  page_id: number | null
  page_title: string | null
  brief: string
  /** markdown */
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
  Pick<Task, 'brief' | 'details' | 'page_id' | 'due_at' | 'priority' | 'recur' | 'completed_at'>
>

export interface CategoryRef {
  id: number
  name: string
}

export interface Category extends CategoryRef {
  page_count: number
}

export interface PageRef {
  id: number
  title: string
  /** "House › Den › Walls" */
  path: string
}

export interface Page extends PageRef {
  parent_id: number | null
  /** markdown */
  body: string | null
  cover_image_id: number | null
  pinned: boolean
  /** bumps on every save; send it back with body edits */
  version: number
  categories: CategoryRef[]
  archived_at: number | null
  open_tasks: number
  note_count: number
  child_count: number
}

export interface PageDetail {
  page: Page
  ancestors: { id: number; title: string }[]
  children: Page[]
  notes: Note[]
  tasks: Task[]
  linked_from: PageRef[]
}

export type PagePatch = Partial<Pick<Page, 'title' | 'body' | 'parent_id' | 'cover_image_id' | 'pinned' | 'archived_at'>> & {
  version?: number
}

export interface Note {
  id: number
  page_id: number | null
  page_title: string | null
  /** only present on search results */
  page_path?: string | null
  /** set when written automatically by completing a task */
  task_id: number | null
  /** markdown */
  body: string
  pinned: boolean
  created_at: number
  updated_at: number
}

export interface CategoryPage {
  category: Category
  pages: Page[]
  tasks: Task[]
}

export interface SearchResults {
  categories: CategoryRef[]
  pages: (PageRef & { cover_image_id: number | null })[]
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

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error ?? `${res.status} ${res.statusText}`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const send = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const api = {
  me: () => request<Me>('/auth/me'),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  listTasks: () => request<Task[]>('/tasks'),
  createTask: (t: { brief: string; page_id?: number | null }) => request<Task>('/tasks', send('POST', t)),
  updateTask: (id: number, patch: TaskPatch) => request<Task>(`/tasks/${id}`, send('PATCH', patch)),
  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),

  listPages: () => request<Page[]>('/pages'),
  getPage: (id: number) => request<PageDetail>(`/pages/${id}`),
  createPage: (p: { title: string; parent_id?: number | null; category_id?: number | null; body?: string }) =>
    request<Page>('/pages', send('POST', p)),
  updatePage: (id: number, patch: PagePatch) => request<Page>(`/pages/${id}`, send('PATCH', patch)),
  /** Tags by name; the category is created if it doesn't exist. */
  addPageCategory: (id: number, name: string) => request<Page>(`/pages/${id}/categories`, send('POST', { name })),
  removePageCategory: (id: number, categoryId: number) =>
    request<Page>(`/pages/${id}/categories/${categoryId}`, { method: 'DELETE' }),

  listCategories: () => request<{ categories: Category[]; uncategorized: number }>('/categories'),
  getCategory: (id: number) => request<CategoryPage>(`/categories/${id}`),
  uncategorized: () => request<{ pages: Page[] }>('/categories/uncategorized'),
  createCategory: (name: string) => request<Category>('/categories', send('POST', { name })),
  renameCategory: (id: number, name: string) => request<Category>(`/categories/${id}`, send('PATCH', { name })),
  deleteCategory: (id: number) => request<void>(`/categories/${id}`, { method: 'DELETE' }),

  listNotes: () => request<Note[]>('/notes'),
  listLooseNotes: () => request<Note[]>('/notes?page_id=none'),
  createNote: (n: { body: string; page_id?: number | null }) => request<Note>('/notes', send('POST', n)),
  updateNote: (id: number, patch: { body?: string; pinned?: boolean; page_id?: number | null }) =>
    request<Note>(`/notes/${id}`, send('PATCH', patch)),
  deleteNote: (id: number) => request<void>(`/notes/${id}`, { method: 'DELETE' }),

  uploadImage: (img: { data: string; thumb: string; width: number; height: number }) =>
    request<{ id: number; width: number; height: number }>('/images', send('POST', img)),

  search: (q: string) => request<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
}
