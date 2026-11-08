import { db } from './db.ts';
import { CATEGORY_NAMES, PATHS_CTE, type Thing } from './things.ts';
import { NOTE_ORDER, toNote, type Note } from './notes.ts';
import { TASK_ORDER, type Task } from './tasks.ts';

export interface SearchResults {
    categories: { id: number; name: string }[];
    things: Pick<Thing, 'id' | 'name' | 'path'>[];
    notes: (Note & { thing_path: string | null })[];
    tasks: Task[];
}

const LIMIT = 25;

/**
 * Plain word matching: every word must appear (case-insensitive substring)
 * somewhere in the row's text, its thing's path, or its thing's category names,
 * so "den paint" finds the paint facts on House › Den › Walls.
 * Swap for FTS5 here if results get noisy.
 */
export function search(homeId: number, q: string): SearchResults {
    const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    if (words.length === 0) return { categories: [], things: [], notes: [], tasks: [] };

    const params: Record<string, string | number> = { home: homeId };
    words.forEach((w, i) => { params[`w${i}`] = `%${w.replace(/[\\%_]/g, c => '\\' + c)}%`; });
    const matches = (haystack: string) =>
        words.map((_, i) => `(${haystack}) LIKE :w${i} ESCAPE '\\'`).join(' AND ');

    const categories = db.prepare(`
        SELECT id, name FROM categories WHERE home_id = :home AND ${matches('name')}
        ORDER BY name LIMIT ${LIMIT}`).all(params);

    const things = db.prepare(`
        WITH RECURSIVE ${PATHS_CTE}
        SELECT th.id, th.name, p.path FROM things th JOIN paths p ON p.id = th.id
        WHERE th.home_id = :home AND th.archived_at IS NULL
            AND ${matches(`p.path || ' ' || coalesce(th.body, '') || ' ' || ${CATEGORY_NAMES('th.id')}`)}
        ORDER BY length(p.path) LIMIT ${LIMIT}`).all(params);

    const notes = db.prepare(`
        WITH RECURSIVE ${PATHS_CTE}
        SELECT n.id, n.thing_id, th.name AS thing_name, p.path AS thing_path,
            n.body, n.pinned, n.created_at, n.updated_at
        FROM notes n LEFT JOIN things th ON th.id = n.thing_id LEFT JOIN paths p ON p.id = n.thing_id
        WHERE n.home_id = :home AND ${matches(`n.body || ' ' || coalesce(p.path, '') || ' ' || ${CATEGORY_NAMES('n.thing_id')}`)}
        ${NOTE_ORDER} LIMIT ${LIMIT}`).all(params);

    const tasks = db.prepare(`
        WITH RECURSIVE ${PATHS_CTE}
        SELECT t.*, th.name AS thing_name
        FROM tasks t LEFT JOIN things th ON th.id = t.thing_id LEFT JOIN paths p ON p.id = t.thing_id
        WHERE t.home_id = :home
            AND ${matches("t.brief || ' ' || coalesce(t.details, '') || ' ' || coalesce(p.path, '')")}
        ${TASK_ORDER} LIMIT ${LIMIT}`).all(params);

    return {
        categories: categories as unknown as SearchResults['categories'],
        things: things as unknown as SearchResults['things'],
        notes: notes.map(n => toNote(n) as SearchResults['notes'][number]),
        tasks: tasks as unknown as Task[],
    };
}
