import { db } from './db.ts';
import { HttpError, patchRow } from './http.ts';

export interface CategoryRef { id: number; name: string }

export interface Thing {
    id: number;
    parent_id: number | null;
    name: string;
    path: string;          // "House › Den › Walls"
    body: string | null;   // wiki page content
    categories: CategoryRef[];
    created_at: number;
    updated_at: number;
    archived_at: number | null;
    open_tasks: number;
    note_count: number;
    child_count: number;
}

/** Recursive CTE giving every thing in :home its full " › "-joined path. */
export const PATHS_CTE = `
    paths(id, path) AS (
        SELECT id, name FROM things WHERE home_id = :home AND parent_id IS NULL
        UNION ALL
        SELECT c.id, p.path || ' › ' || c.name FROM things c JOIN paths p ON c.parent_id = p.id
    )`;

/** SQL expression: a thing's categories as a JSON array of {id, name}. */
export const CATEGORIES_JSON = (thingCol: string) => `(
    SELECT coalesce(json_group_array(json_object('id', c.id, 'name', c.name)), '[]')
    FROM (SELECT c.id, c.name FROM thing_categories tc JOIN categories c ON c.id = tc.category_id
          WHERE tc.thing_id = ${thingCol} ORDER BY c.name) c)`;

/** SQL expression: space-joined category names, for search matching. */
export const CATEGORY_NAMES = (thingCol: string) => `coalesce((
    SELECT group_concat(c.name, ' ') FROM thing_categories tc JOIN categories c ON c.id = tc.category_id
    WHERE tc.thing_id = ${thingCol}), '')`;

export const THING_SELECT = `
    WITH RECURSIVE ${PATHS_CTE}
    SELECT th.id, th.parent_id, th.name, p.path, th.body, th.created_at, th.updated_at, th.archived_at,
        ${CATEGORIES_JSON('th.id')} AS categories,
        (SELECT count(*) FROM tasks t WHERE t.thing_id = th.id AND t.completed_at IS NULL) AS open_tasks,
        (SELECT count(*) FROM notes n WHERE n.thing_id = th.id) AS note_count,
        (SELECT count(*) FROM things c WHERE c.parent_id = th.id AND c.archived_at IS NULL) AS child_count
    FROM things th JOIN paths p ON p.id = th.id`;

export function toThing(row: unknown): Thing {
    const r = row as Thing & { categories: string };
    return { ...r, categories: JSON.parse(r.categories) };
}

const listStmt = db.prepare(`${THING_SELECT}
    WHERE th.home_id = :home AND th.archived_at IS NULL
    ORDER BY th.name COLLATE NOCASE`);
const childrenStmt = db.prepare(`${THING_SELECT}
    WHERE th.home_id = :home AND th.parent_id = :id AND th.archived_at IS NULL
    ORDER BY th.name COLLATE NOCASE`);
const getStmt = db.prepare(`${THING_SELECT} WHERE th.home_id = :home AND th.id = :id`);
const ancestorsStmt = db.prepare(`
    WITH RECURSIVE up(id, parent_id, name, depth) AS (
        SELECT id, parent_id, name, 0 FROM things WHERE home_id = :home AND id = :id
        UNION ALL
        SELECT t.id, t.parent_id, t.name, up.depth + 1 FROM things t JOIN up ON t.id = up.parent_id
    )
    SELECT id, name FROM up WHERE depth > 0 ORDER BY depth DESC`);
const existsStmt = db.prepare('SELECT 1 FROM things WHERE home_id = ? AND id = ? AND archived_at IS NULL');
const insertStmt = db.prepare(
    'INSERT INTO things (home_id, parent_id, name, body) VALUES (?, ?, ?, ?) RETURNING id');
const linkStmt = db.prepare('INSERT OR IGNORE INTO thing_categories (thing_id, category_id) VALUES (?, ?)');
const unlinkStmt = db.prepare('DELETE FROM thing_categories WHERE thing_id = ? AND category_id = ?');

export function listThings(homeId: number): Thing[] {
    return listStmt.all({ home: homeId }).map(toThing);
}

export function getThing(homeId: number, id: number): Thing | undefined {
    const row = getStmt.get({ home: homeId, id });
    return row ? toThing(row) : undefined;
}

export function childThings(homeId: number, id: number): Thing[] {
    return childrenStmt.all({ home: homeId, id }).map(toThing);
}

export function ancestors(homeId: number, id: number): CategoryRef[] {
    return ancestorsStmt.all({ home: homeId, id }) as unknown as CategoryRef[];
}

/** True if the thing exists in this home and isn't archived. */
export function thingInHome(homeId: number, id: number): boolean {
    return existsStmt.get(homeId, id) !== undefined;
}

export function assertThing(homeId: number, id: number | null | undefined, field = 'thing_id'): void {
    if (typeof id === 'number' && !thingInHome(homeId, id)) throw new HttpError(400, `${field} not found`);
}

export interface ThingFields {
    name?: string | null;
    parent_id?: number | null;
    body?: string | null;
    archived_at?: number | null;
}

/** categoryId must already be validated as belonging to homeId. */
export function createThing(homeId: number, f: ThingFields, categoryId?: number | null): Thing {
    if (!f.name) throw new HttpError(400, 'name is required');
    assertThing(homeId, f.parent_id, 'parent_id');
    const row = insertStmt.get(homeId, f.parent_id ?? null, f.name, f.body ?? null)!;
    const id = row.id as number;
    if (categoryId != null) linkStmt.run(id, categoryId);
    return getThing(homeId, id)!;
}

export function updateThing(homeId: number, id: number, f: ThingFields): Thing | undefined {
    const current = getThing(homeId, id);
    if (!current) return undefined;
    if ('name' in f && !f.name) throw new HttpError(400, 'name must not be empty');
    if (typeof f.parent_id === 'number') {
        assertThing(homeId, f.parent_id, 'parent_id');
        if (f.parent_id === id || ancestors(homeId, f.parent_id).some(a => a.id === id)) {
            throw new HttpError(400, "can't move a thing inside itself");
        }
    }
    if (f.archived_at != null && current.child_count > 0) {
        throw new HttpError(400, 'move or archive the things inside it first');
    }
    patchRow(db, 'things', ['name', 'parent_id', 'body', 'archived_at'], f as Record<string, unknown>, homeId, id);
    return getThing(homeId, id);
}

/** Both ids must already be validated as belonging to the same home. */
export function linkCategory(thingId: number, categoryId: number): void {
    linkStmt.run(thingId, categoryId);
}
export function unlinkCategory(thingId: number, categoryId: number): void {
    unlinkStmt.run(thingId, categoryId);
}
