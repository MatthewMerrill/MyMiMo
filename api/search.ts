import { db } from './db.ts';
import { CATEGORY_NAMES, PATHS_CTE, type PageRef } from './pages.ts';
import { NOTE_ORDER, toNote, type Note } from './notes.ts';
import { TASK_ORDER, type Task } from './tasks.ts';

export interface SearchResults {
    categories: { id: number; name: string }[];
    pages: (PageRef & { cover_image_id: number | null })[];
    notes: (Note & { page_path: string | null })[];
    tasks: Task[];
}

const LIMIT = 25;

/**
 * Plain word matching: every word must appear (case-insensitive substring)
 * somewhere in the row's text, its page's path, or its page's category names,
 * so "den paint" finds the paint facts on House › Den › Walls.
 * Swap for FTS5 here if results get noisy.
 */
export function search(homeId: number, q: string): SearchResults {
    const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    if (words.length === 0) return { categories: [], pages: [], notes: [], tasks: [] };

    const params: Record<string, string | number> = { home: homeId };
    words.forEach((w, i) => { params[`w${i}`] = `%${w.replace(/[\\%_]/g, c => '\\' + c)}%`; });
    const matches = (haystack: string) =>
        words.map((_, i) => `(${haystack}) LIKE :w${i} ESCAPE '\\'`).join(' AND ');

    const categories = db.prepare(`
        SELECT id, name FROM categories WHERE home_id = :home AND ${matches('name')}
        ORDER BY name LIMIT ${LIMIT}`).all(params);

    const pages = db.prepare(`
        WITH RECURSIVE ${PATHS_CTE}
        SELECT pg.id, pg.title, p.path, pg.cover_image_id FROM pages pg JOIN paths p ON p.id = pg.id
        WHERE pg.home_id = :home AND pg.archived_at IS NULL
            AND ${matches(`p.path || ' ' || coalesce(pg.body, '') || ' ' || ${CATEGORY_NAMES('pg.id')}`)}
        ORDER BY length(p.path) LIMIT ${LIMIT}`).all(params);

    const notes = db.prepare(`
        WITH RECURSIVE ${PATHS_CTE}
        SELECT n.id, n.page_id, pg.title AS page_title, p.path AS page_path, n.task_id,
            n.body, n.pinned, n.created_at, n.updated_at
        FROM notes n LEFT JOIN pages pg ON pg.id = n.page_id LEFT JOIN paths p ON p.id = n.page_id
        WHERE n.home_id = :home
            AND ${matches(`n.body || ' ' || coalesce(p.path, '') || ' ' || ${CATEGORY_NAMES('n.page_id')}`)}
        ${NOTE_ORDER} LIMIT ${LIMIT}`).all(params);

    const tasks = db.prepare(`
        WITH RECURSIVE ${PATHS_CTE}
        SELECT t.*, pg.title AS page_title
        FROM tasks t LEFT JOIN pages pg ON pg.id = t.page_id LEFT JOIN paths p ON p.id = t.page_id
        WHERE t.home_id = :home
            AND ${matches("t.brief || ' ' || coalesce(t.details, '') || ' ' || coalesce(p.path, '')")}
        ${TASK_ORDER} LIMIT ${LIMIT}`).all(params);

    return {
        categories: categories as unknown as SearchResults['categories'],
        pages: pages as unknown as SearchResults['pages'],
        notes: notes.map(n => toNote(n) as SearchResults['notes'][number]),
        tasks: tasks as unknown as Task[],
    };
}
