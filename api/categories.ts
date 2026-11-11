import { db } from './db.ts';
import { HttpError, patchRow } from './http.ts';
import { PAGE_SELECT, toPage, type Page } from './pages.ts';
import { TASK_ORDER, TASK_SELECT, type Task } from './tasks.ts';

export interface Category {
    id: number;
    name: string;
    page_count: number;
}

const SELECT = `
    SELECT c.id, c.name,
        (SELECT count(*) FROM page_categories pc JOIN pages pg ON pg.id = pc.page_id
         WHERE pc.category_id = c.id AND pg.archived_at IS NULL) AS page_count
    FROM categories c`;

const listStmt = db.prepare(`${SELECT} WHERE c.home_id = ? ORDER BY c.name`);
const getStmt = db.prepare(`${SELECT} WHERE c.home_id = ? AND c.id = ?`);
const byNameStmt = db.prepare('SELECT id FROM categories WHERE home_id = ? AND name = ?');
const insertStmt = db.prepare('INSERT INTO categories (home_id, name) VALUES (?, ?) RETURNING id');
const deleteStmt = db.prepare('DELETE FROM categories WHERE home_id = ? AND id = ?');
const uncategorizedCountStmt = db.prepare(`
    SELECT count(*) AS n FROM pages pg
    WHERE pg.home_id = ? AND pg.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM page_categories pc WHERE pc.page_id = pg.id)`);

const pagesInStmt = db.prepare(`${PAGE_SELECT}
    WHERE pg.home_id = :home AND pg.archived_at IS NULL
      AND EXISTS (SELECT 1 FROM page_categories pc WHERE pc.page_id = pg.id AND pc.category_id = :cat)
    ORDER BY pg.title COLLATE NOCASE`);
const uncategorizedStmt = db.prepare(`${PAGE_SELECT}
    WHERE pg.home_id = :home AND pg.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM page_categories pc WHERE pc.page_id = pg.id)
    ORDER BY p.path COLLATE NOCASE`);
const tasksInStmt = db.prepare(`${TASK_SELECT}
    WHERE t.home_id = ? AND t.completed_at IS NULL
      AND t.page_id IN (SELECT page_id FROM page_categories WHERE category_id = ?)
    ${TASK_ORDER}`);

export function listCategories(homeId: number): { categories: Category[]; uncategorized: number } {
    return {
        categories: listStmt.all(homeId) as unknown as Category[],
        uncategorized: Number(uncategorizedCountStmt.get(homeId)!.n),
    };
}

export function getCategory(homeId: number, id: number): Category | undefined {
    return getStmt.get(homeId, id) as unknown as Category | undefined;
}

export function assertCategory(homeId: number, id: number | null | undefined): void {
    if (typeof id === 'number' && !getCategory(homeId, id)) throw new HttpError(400, 'category not found');
}

/** The category landing page: its pages plus their open tasks. */
export function categoryPage(homeId: number, id: number): { category: Category; pages: Page[]; tasks: Task[] } | undefined {
    const category = getCategory(homeId, id);
    if (!category) return undefined;
    return {
        category,
        pages: pagesInStmt.all({ home: homeId, cat: id }).map(toPage),
        tasks: tasksInStmt.all(homeId, id) as unknown as Task[],
    };
}

export function uncategorizedPages(homeId: number): Page[] {
    return uncategorizedStmt.all({ home: homeId }).map(toPage);
}

/** Case-insensitive lookup; creates the category if it doesn't exist yet. */
export function findOrCreateCategory(homeId: number, name: string): Category {
    const existing = byNameStmt.get(homeId, name);
    const id = existing ? existing.id as number : insertStmt.get(homeId, name)!.id as number;
    return getCategory(homeId, id)!;
}

export function renameCategory(homeId: number, id: number, name: string): Category | undefined {
    const clash = byNameStmt.get(homeId, name);
    if (clash && clash.id !== id) throw new HttpError(409, `a category named "${name}" already exists`);
    patchRow(db, 'categories', ['name'], { name }, homeId, id);
    return getCategory(homeId, id);
}

/** Removes the category; its pages stay, just untagged. */
export function deleteCategory(homeId: number, id: number): boolean {
    return Number(deleteStmt.run(homeId, id).changes) > 0;
}
