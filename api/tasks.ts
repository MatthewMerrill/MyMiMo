import { db, transaction } from './db.ts';
import { patchRow } from './http.ts';

export interface Task {
    id: number;
    home_id: number;
    author_id: number;
    assignee_id: number | null;
    page_id: number | null;
    page_title: string | null;
    brief: string;
    details: string | null;   // markdown
    due_at: number | null;
    priority: number | null;  // null = untriaged ("inbox"); 1 high, 2 normal, 3 low
    recur: string | null;
    created_at: number;
    updated_at: number;
    completed_at: number | null;
}

export const TASK_SELECT = `
    SELECT t.*, pg.title AS page_title
    FROM tasks t LEFT JOIN pages pg ON pg.id = t.page_id`;

/** Open first; then by due date (undated last), then priority, then newest. */
export const TASK_ORDER = `
    ORDER BY t.completed_at IS NOT NULL, t.completed_at DESC, t.due_at IS NULL, t.due_at,
        t.priority IS NULL DESC, t.priority, t.created_at DESC, t.id DESC`;

const listStmt = db.prepare(`${TASK_SELECT} WHERE t.home_id = ? ${TASK_ORDER}`);
const listForPageStmt = db.prepare(`${TASK_SELECT} WHERE t.home_id = ? AND t.page_id = ? ${TASK_ORDER}`);
const getStmt = db.prepare(`${TASK_SELECT} WHERE t.home_id = ? AND t.id = ?`);
const insertStmt = db.prepare(`
    INSERT INTO tasks (home_id, author_id, brief, page_id, details, due_at, priority, recur)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`);
const deleteStmt = db.prepare('DELETE FROM tasks WHERE home_id = ? AND id = ?');
const spawnStmt = db.prepare(`
    INSERT INTO tasks (home_id, author_id, assignee_id, page_id, brief, details, due_at, priority, recur)
    SELECT home_id, author_id, assignee_id, page_id, brief, details, ?, priority, recur
    FROM tasks WHERE id = ?`);
const logStmt = db.prepare(`
    INSERT INTO notes (home_id, page_id, task_id, author_id, body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
const unlogStmt = db.prepare('DELETE FROM notes WHERE home_id = ? AND task_id = ?');

export function listTasks(homeId: number, pageId?: number): Task[] {
    const rows = pageId === undefined ? listStmt.all(homeId) : listForPageStmt.all(homeId, pageId);
    return rows as unknown as Task[];
}

export function getTask(homeId: number, id: number): Task | undefined {
    return getStmt.get(homeId, id) as unknown as Task | undefined;
}

export const TASK_PATCHABLE = [
    'brief', 'details', 'page_id', 'assignee_id', 'due_at', 'priority', 'recur', 'completed_at',
] as const;
export type TaskFields = Partial<Pick<Task, typeof TASK_PATCHABLE[number]>>;

export function createTask(homeId: number, authorId: number, t: TaskFields & { brief: string }): Task {
    const row = insertStmt.get(homeId, authorId, t.brief, t.page_id ?? null,
        t.details ?? null, t.due_at ?? null, t.priority ?? null, t.recur ?? null)!;
    return getTask(homeId, row.id as number)!;
}

export const RECUR_PATTERN = /^P(\d{1,3})([DWMY])$/;

/** Adds an ISO-8601-style period (P1W, P3M, P1Y…) to a unix timestamp, clamping month ends. */
export function advance(sec: number, recur: string): number {
    const m = RECUR_PATTERN.exec(recur);
    if (!m) throw new Error(`bad recur ${recur}`);
    const n = Number(m[1]);
    const d = new Date(sec * 1000);
    if (m[2] === 'D' || m[2] === 'W') {
        d.setDate(d.getDate() + n * (m[2] === 'W' ? 7 : 1));
    } else {
        const months = m[2] === 'Y' ? n * 12 : n;
        const day = d.getDate();
        d.setDate(1);
        d.setMonth(d.getMonth() + months);
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        d.setDate(Math.min(day, lastDay));
    }
    return Math.floor(d.getTime() / 1000);
}

/**
 * Completing a task:
 *  - on a page, writes a Log entry there ("Done: …"), removed again if the task is reopened;
 *  - if it repeats, creates the next occurrence one period after the old due date
 *    (so a late renewal keeps its anniversary). The repeat moves to the new task,
 *    so reopening/re-completing the old one won't spawn duplicates.
 */
export function updateTask(homeId: number, id: number, patch: TaskFields, userId: number): Task | undefined {
    const before = getTask(homeId, id);
    if (!before) return undefined;
    transaction(() => {
        patchRow(db, 'tasks', TASK_PATCHABLE, patch, homeId, id);
        const after = getTask(homeId, id)!;
        const completed = after.completed_at != null && before.completed_at == null;
        const reopened = after.completed_at == null && before.completed_at != null;
        if (completed && after.page_id != null) {
            logStmt.run(homeId, after.page_id, id, userId, `Done: ${after.brief}`, after.completed_at, after.completed_at);
        }
        if (reopened) unlogStmt.run(homeId, id);
        if (completed && after.recur) {
            spawnStmt.run(advance(after.due_at ?? after.completed_at!, after.recur), id);
            patchRow(db, 'tasks', ['recur'], { recur: null }, homeId, id);
        }
    });
    return getTask(homeId, id);
}

export function deleteTask(homeId: number, id: number): boolean {
    return Number(deleteStmt.run(homeId, id).changes) > 0;
}
