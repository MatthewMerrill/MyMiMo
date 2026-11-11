import { db } from './db.ts';
import { patchRow } from './http.ts';

export interface Note {
    id: number;
    page_id: number | null;
    page_title: string | null;
    task_id: number | null;       // set when written automatically by completing a task
    body: string;                 // markdown
    pinned: boolean;
    created_at: number;
    updated_at: number;
}

export const NOTE_SELECT = `
    SELECT n.id, n.page_id, pg.title AS page_title, n.task_id, n.body, n.pinned, n.created_at, n.updated_at
    FROM notes n LEFT JOIN pages pg ON pg.id = n.page_id`;
export const NOTE_ORDER = 'ORDER BY n.pinned DESC, n.created_at DESC, n.id DESC';

const listAllStmt = db.prepare(`${NOTE_SELECT} WHERE n.home_id = ? ${NOTE_ORDER}`);
const listLooseStmt = db.prepare(`${NOTE_SELECT} WHERE n.home_id = ? AND n.page_id IS NULL ${NOTE_ORDER}`);
const listForPageStmt = db.prepare(`${NOTE_SELECT} WHERE n.home_id = ? AND n.page_id = ? ${NOTE_ORDER}`);
const getStmt = db.prepare(`${NOTE_SELECT} WHERE n.home_id = ? AND n.id = ?`);
const insertStmt = db.prepare(
    'INSERT INTO notes (home_id, page_id, author_id, body, pinned) VALUES (?, ?, ?, ?, ?) RETURNING id');
const deleteStmt = db.prepare('DELETE FROM notes WHERE home_id = ? AND id = ?');

export function toNote(row: unknown): Note {
    const r = row as Note;
    return { ...r, pinned: !!r.pinned };
}

/** pageId: undefined = all notes, null = notes not attached to any page. */
export function listNotes(homeId: number, pageId?: number | null): Note[] {
    const rows = pageId === undefined ? listAllStmt.all(homeId)
        : pageId === null ? listLooseStmt.all(homeId)
        : listForPageStmt.all(homeId, pageId);
    return rows.map(toNote);
}

export function getNote(homeId: number, id: number): Note | undefined {
    const row = getStmt.get(homeId, id);
    return row ? toNote(row) : undefined;
}

export interface NoteFields { body?: string | null; page_id?: number | null; pinned?: boolean }

export function createNote(homeId: number, authorId: number, f: NoteFields & { body: string }): Note {
    const row = insertStmt.get(homeId, f.page_id ?? null, authorId, f.body, f.pinned ? 1 : 0)!;
    return getNote(homeId, row.id as number)!;
}

export function updateNote(homeId: number, id: number, f: NoteFields): Note | undefined {
    const patch: Record<string, unknown> = { ...f };
    if ('pinned' in f) patch.pinned = f.pinned ? 1 : 0;
    patchRow(db, 'notes', ['body', 'page_id', 'pinned'], patch, homeId, id);
    return getNote(homeId, id);
}

export function deleteNote(homeId: number, id: number): boolean {
    return Number(deleteStmt.run(homeId, id).changes) > 0;
}
