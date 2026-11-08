import { db } from './db.ts';
import { HttpError, patchRow } from './http.ts';
import { THING_SELECT, toThing, type Thing } from './things.ts';
import { TASK_ORDER, TASK_SELECT, type Task } from './tasks.ts';

export interface Category {
    id: number;
    name: string;
    thing_count: number;
}

const SELECT = `
    SELECT c.id, c.name,
        (SELECT count(*) FROM thing_categories tc JOIN things th ON th.id = tc.thing_id
         WHERE tc.category_id = c.id AND th.archived_at IS NULL) AS thing_count
    FROM categories c`;

const listStmt = db.prepare(`${SELECT} WHERE c.home_id = ? ORDER BY c.name`);
const getStmt = db.prepare(`${SELECT} WHERE c.home_id = ? AND c.id = ?`);
const byNameStmt = db.prepare('SELECT id FROM categories WHERE home_id = ? AND name = ?');
const insertStmt = db.prepare('INSERT INTO categories (home_id, name) VALUES (?, ?) RETURNING id');
const deleteStmt = db.prepare('DELETE FROM categories WHERE home_id = ? AND id = ?');
const uncategorizedCountStmt = db.prepare(`
    SELECT count(*) AS n FROM things th
    WHERE th.home_id = ? AND th.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM thing_categories tc WHERE tc.thing_id = th.id)`);

const thingsInStmt = db.prepare(`${THING_SELECT}
    WHERE th.home_id = :home AND th.archived_at IS NULL
      AND EXISTS (SELECT 1 FROM thing_categories tc WHERE tc.thing_id = th.id AND tc.category_id = :cat)
    ORDER BY th.name COLLATE NOCASE`);
const uncategorizedStmt = db.prepare(`${THING_SELECT}
    WHERE th.home_id = :home AND th.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM thing_categories tc WHERE tc.thing_id = th.id)
    ORDER BY p.path COLLATE NOCASE`);
const tasksInStmt = db.prepare(`${TASK_SELECT}
    WHERE t.home_id = ? AND t.completed_at IS NULL
      AND t.thing_id IN (SELECT thing_id FROM thing_categories WHERE category_id = ?)
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

/** The category landing page: its things plus their open tasks. */
export function categoryPage(homeId: number, id: number): { category: Category; things: Thing[]; tasks: Task[] } | undefined {
    const category = getCategory(homeId, id);
    if (!category) return undefined;
    return {
        category,
        things: thingsInStmt.all({ home: homeId, cat: id }).map(toThing),
        tasks: tasksInStmt.all(homeId, id) as unknown as Task[],
    };
}

export function uncategorizedThings(homeId: number): Thing[] {
    return uncategorizedStmt.all({ home: homeId }).map(toThing);
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

/** Removes the category; its things stay, just untagged. */
export function deleteCategory(homeId: number, id: number): boolean {
    return Number(deleteStmt.run(homeId, id).changes) > 0;
}
