import { db, transaction } from './db.ts';
import { HttpError, patchRow } from './http.ts';
import { rebuildLinks } from './links.ts';

export interface CategoryRef { id: number; name: string }
export interface PageRef { id: number; title: string; path: string }

export interface Page {
    id: number;
    parent_id: number | null;
    title: string;
    path: string;                 // "House › Den › Walls"
    body: string | null;          // markdown
    cover_image_id: number | null;
    pinned: boolean;
    version: number;
    categories: CategoryRef[];
    created_at: number;
    updated_at: number;
    archived_at: number | null;
    open_tasks: number;
    note_count: number;
    child_count: number;
}

/** Recursive CTE giving every page in :home its full " › "-joined path. */
export const PATHS_CTE = `
    paths(id, path) AS (
        SELECT id, title FROM pages WHERE home_id = :home AND parent_id IS NULL
        UNION ALL
        SELECT c.id, p.path || ' › ' || c.title FROM pages c JOIN paths p ON c.parent_id = p.id
    )`;

/** SQL expression: a page's categories as a JSON array of {id, name}. */
export const CATEGORIES_JSON = (pageCol: string) => `(
    SELECT coalesce(json_group_array(json_object('id', c.id, 'name', c.name)), '[]')
    FROM (SELECT c.id, c.name FROM page_categories pc JOIN categories c ON c.id = pc.category_id
          WHERE pc.page_id = ${pageCol} ORDER BY c.name) c)`;

/** SQL expression: space-joined category names, for search matching. */
export const CATEGORY_NAMES = (pageCol: string) => `coalesce((
    SELECT group_concat(c.name, ' ') FROM page_categories pc JOIN categories c ON c.id = pc.category_id
    WHERE pc.page_id = ${pageCol}), '')`;

export const PAGE_SELECT = `
    WITH RECURSIVE ${PATHS_CTE}
    SELECT pg.id, pg.parent_id, pg.title, p.path, pg.body, pg.cover_image_id, pg.pinned, pg.version,
        pg.created_at, pg.updated_at, pg.archived_at,
        ${CATEGORIES_JSON('pg.id')} AS categories,
        (SELECT count(*) FROM tasks t WHERE t.page_id = pg.id AND t.completed_at IS NULL) AS open_tasks,
        (SELECT count(*) FROM notes n WHERE n.page_id = pg.id) AS note_count,
        (SELECT count(*) FROM pages c WHERE c.parent_id = pg.id AND c.archived_at IS NULL) AS child_count
    FROM pages pg JOIN paths p ON p.id = pg.id`;

export function toPage(row: unknown): Page {
    const r = row as Omit<Page, 'categories' | 'pinned'> & { categories: string; pinned: number };
    return { ...r, pinned: !!r.pinned, categories: JSON.parse(r.categories) };
}

const listStmt = db.prepare(`${PAGE_SELECT}
    WHERE pg.home_id = :home AND pg.archived_at IS NULL
    ORDER BY pg.title COLLATE NOCASE`);
const childrenStmt = db.prepare(`${PAGE_SELECT}
    WHERE pg.home_id = :home AND pg.parent_id = :id AND pg.archived_at IS NULL
    ORDER BY pg.title COLLATE NOCASE`);
const getStmt = db.prepare(`${PAGE_SELECT} WHERE pg.home_id = :home AND pg.id = :id`);
const ancestorsStmt = db.prepare(`
    WITH RECURSIVE up(id, parent_id, title, depth) AS (
        SELECT id, parent_id, title, 0 FROM pages WHERE home_id = :home AND id = :id
        UNION ALL
        SELECT pg.id, pg.parent_id, pg.title, up.depth + 1 FROM pages pg JOIN up ON pg.id = up.parent_id
    )
    SELECT id, title FROM up WHERE depth > 0 ORDER BY depth DESC`);
const linkedFromStmt = db.prepare(`
    WITH RECURSIVE ${PATHS_CTE}
    SELECT pg.id, pg.title, p.path
    FROM page_links l JOIN pages pg ON pg.id = l.from_page_id JOIN paths p ON p.id = pg.id
    WHERE pg.home_id = :home AND pg.archived_at IS NULL AND l.to_title = :title AND pg.id != :id
    ORDER BY pg.title COLLATE NOCASE`);
const existsStmt = db.prepare('SELECT 1 FROM pages WHERE home_id = ? AND id = ? AND archived_at IS NULL');
const insertStmt = db.prepare(
    'INSERT INTO pages (home_id, parent_id, title, body) VALUES (?, ?, ?, ?) RETURNING id');
const linkStmt = db.prepare('INSERT OR IGNORE INTO page_categories (page_id, category_id) VALUES (?, ?)');
const unlinkStmt = db.prepare('DELETE FROM page_categories WHERE page_id = ? AND category_id = ?');

export function listPages(homeId: number): Page[] {
    return listStmt.all({ home: homeId }).map(toPage);
}

export function getPage(homeId: number, id: number): Page | undefined {
    const row = getStmt.get({ home: homeId, id });
    return row ? toPage(row) : undefined;
}

export function childPages(homeId: number, id: number): Page[] {
    return childrenStmt.all({ home: homeId, id }).map(toPage);
}

export function ancestors(homeId: number, id: number): { id: number; title: string }[] {
    return ancestorsStmt.all({ home: homeId, id }) as unknown as { id: number; title: string }[];
}

/** Pages whose body has a [[link]] to this page's title. */
export function linkedFrom(homeId: number, page: Pick<Page, 'id' | 'title'>): PageRef[] {
    return linkedFromStmt.all({ home: homeId, title: page.title, id: page.id }) as unknown as PageRef[];
}

/** True if the page exists in this home and isn't archived. */
export function pageInHome(homeId: number, id: number): boolean {
    return existsStmt.get(homeId, id) !== undefined;
}

export function assertPage(homeId: number, id: number | null | undefined, field = 'page_id'): void {
    if (typeof id === 'number' && !pageInHome(homeId, id)) throw new HttpError(400, `${field} not found`);
}

export interface PageFields {
    title?: string | null;
    parent_id?: number | null;
    body?: string | null;
    cover_image_id?: number | null;
    pinned?: boolean;
    archived_at?: number | null;
}

/** categoryId must already be validated as belonging to homeId. */
export function createPage(homeId: number, f: PageFields, categoryId?: number | null): Page {
    if (!f.title) throw new HttpError(400, 'title is required');
    assertPage(homeId, f.parent_id, 'parent_id');
    return transaction(() => {
        const id = insertStmt.get(homeId, f.parent_id ?? null, f.title!, f.body ?? null)!.id as number;
        if (categoryId != null) linkStmt.run(id, categoryId);
        rebuildLinks(id, f.body ?? null);
        return getPage(homeId, id)!;
    });
}

/**
 * Pass `version` (the version you loaded) when saving the body: if someone saved
 * in between, this throws 409 instead of silently overwriting their edit.
 */
export function updatePage(homeId: number, id: number, f: PageFields, version?: number): Page | undefined {
    const current = getPage(homeId, id);
    if (!current) return undefined;
    if (version !== undefined && version !== current.version) {
        throw new HttpError(409, 'This page was changed somewhere else. Reload to get the latest, then redo your edit.');
    }
    if ('title' in f && !f.title) throw new HttpError(400, 'title must not be empty');
    if (typeof f.parent_id === 'number') {
        assertPage(homeId, f.parent_id, 'parent_id');
        if (f.parent_id === id || ancestors(homeId, f.parent_id).some(a => a.id === id)) {
            throw new HttpError(400, "can't move a page inside itself");
        }
    }
    if (f.archived_at != null && current.child_count > 0) {
        throw new HttpError(400, 'move or archive its subpages first');
    }
    const patch: Record<string, unknown> = { ...f };
    if ('pinned' in f) patch.pinned = f.pinned ? 1 : 0;
    transaction(() => {
        patchRow(db, 'pages', ['title', 'parent_id', 'body', 'cover_image_id', 'pinned', 'archived_at'],
            patch, homeId, id, ', version = version + 1');
        if ('body' in f) rebuildLinks(id, f.body ?? null);
    });
    return getPage(homeId, id);
}

/** Both ids must already be validated as belonging to the same home. */
export function linkCategory(pageId: number, categoryId: number): void {
    linkStmt.run(pageId, categoryId);
}
export function unlinkCategory(pageId: number, categoryId: number): void {
    unlinkStmt.run(pageId, categoryId);
}
