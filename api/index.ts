import express, { type Request, type Response, type NextFunction } from 'express';
import { DATABASE_PATH } from './db.ts';
import { seedDemoIfEmpty } from './seed.ts';
import { authRouter, requireUser, resolveUser, userInHome } from './auth.ts';
import { HttpError, asBody, idParam, optBool, optInt, optText, type Body } from './http.ts';
import * as tasks from './tasks.ts';
import * as pages from './pages.ts';
import * as notes from './notes.ts';
import * as categories from './categories.ts';
import * as images from './images.ts';
import { search } from './search.ts';

seedDemoIfEmpty();

const app = express();
const port = Number(process.env.PORT ?? 3000);

// Image uploads arrive as base64 JSON (already downscaled in the browser), hence the limit.
app.use(express.json({ limit: '8mb' }));

// Who's asking: a Discord session, or the home's owner when login isn't configured.
interface Ctx { homeId: number; userId: number }
function ctx(res: Response): Ctx { return res.locals as Ctx; }
app.use('/api', resolveUser);
app.use('/api/auth', authRouter);
app.use('/api', requireUser);

/** Copies the listed keys from body when present (undefined = absent). */
function pick<T>(body: Body, keys: readonly string[], parse: (b: Body, k: string) => T | undefined) {
    const out: Record<string, T> = {};
    for (const k of keys) {
        const v = parse(body, k);
        if (v !== undefined) out[k] = v;
    }
    return out;
}

/** `?page_id=5` → 5, `?page_id=none` → null, absent → undefined. */
function pageQuery(req: Request): number | null | undefined {
    const v = req.query.page_id;
    if (v === undefined) return undefined;
    if (v === 'none') return null;
    return idParam(String(v));
}

/** Markdown fields keep their whitespace (indentation matters); only all-blank becomes null. */
function optMarkdown(body: Body, key: string): string | null | undefined {
    const v = body[key];
    if (v === undefined || v === null) return v;
    if (typeof v !== 'string') throw new HttpError(400, `${key} must be a string or null`);
    if (v.length > 200_000) throw new HttpError(413, `${key} is too long`);
    return v.trim() === '' ? null : v.replace(/\s+$/, '');
}

const api = express.Router();

// ---------------------------------------------------------------- tasks

function parseTaskFields(homeId: number, body: Body): tasks.TaskFields {
    const out: tasks.TaskFields = {
        ...pick(body, ['brief', 'recur'], optText),
        ...pick(body, ['details'], optMarkdown),
        ...pick(body, ['page_id', 'assignee_id', 'due_at', 'priority', 'completed_at'], optInt),
    };
    if ('brief' in out && !out.brief) throw new HttpError(400, 'brief must not be empty');
    pages.assertPage(homeId, out.page_id);
    if (out.assignee_id != null && !userInHome(homeId, out.assignee_id)) {
        throw new HttpError(400, 'assignee_id not found');
    }
    if (out.recur != null && !tasks.RECUR_PATTERN.test(out.recur)) {
        throw new HttpError(400, 'recur must look like P1W, P3M, P1Y');
    }
    if (out.priority != null && ![1, 2, 3].includes(out.priority)) {
        throw new HttpError(400, 'priority must be 1, 2, 3 or null');
    }
    return out;
}

api.get('/tasks', (req, res) => {
    res.json(tasks.listTasks(ctx(res).homeId, pageQuery(req) ?? undefined));
});

api.post('/tasks', (req, res) => {
    const { homeId, userId } = ctx(res);
    const f = parseTaskFields(homeId, asBody(req.body));
    if (!f.brief) throw new HttpError(400, 'brief is required');
    res.status(201).json(tasks.createTask(homeId, userId, { ...f, brief: f.brief }));
});

api.patch('/tasks/:id', (req, res) => {
    const { homeId, userId } = ctx(res);
    const task = tasks.updateTask(homeId, idParam(req.params.id), parseTaskFields(homeId, asBody(req.body)), userId);
    if (!task) throw new HttpError(404, 'not found');
    res.json(task);
});

api.delete('/tasks/:id', (req, res) => {
    if (!tasks.deleteTask(ctx(res).homeId, idParam(req.params.id))) throw new HttpError(404, 'not found');
    res.sendStatus(204);
});

// ---------------------------------------------------------------- pages

function parsePageFields(homeId: number, body: Body): pages.PageFields {
    const out: pages.PageFields = {
        ...pick(body, ['title'], optText),
        ...pick(body, ['body'], optMarkdown),
        ...pick(body, ['parent_id', 'archived_at', 'cover_image_id'], optInt),
        ...pick(body, ['pinned'], optBool),
    };
    if (out.title && out.title.length > 200) throw new HttpError(400, 'title is too long');
    if (typeof out.cover_image_id === 'number' && !images.imageInHome(homeId, out.cover_image_id)) {
        throw new HttpError(400, 'cover_image_id not found');
    }
    return out;
}

api.get('/pages', (_req, res) => {
    res.json(pages.listPages(ctx(res).homeId));
});

/** Everything the page view needs in one round trip. */
api.get('/pages/:id', (req, res) => {
    const { homeId } = ctx(res);
    const id = idParam(req.params.id);
    const page = pages.getPage(homeId, id);
    if (!page) throw new HttpError(404, 'not found');
    res.json({
        page,
        ancestors: pages.ancestors(homeId, id),
        children: pages.childPages(homeId, id),
        notes: notes.listNotes(homeId, id),
        tasks: tasks.listTasks(homeId, id),
        linked_from: pages.linkedFrom(homeId, page),
    });
});

api.post('/pages', (req, res) => {
    const { homeId } = ctx(res);
    const body = asBody(req.body);
    const categoryId = optInt(body, 'category_id');
    categories.assertCategory(homeId, categoryId);
    res.status(201).json(pages.createPage(homeId, parsePageFields(homeId, body), categoryId));
});

/** Send `version` with body edits to get a 409 instead of overwriting someone else's save. */
api.patch('/pages/:id', (req, res) => {
    const { homeId } = ctx(res);
    const body = asBody(req.body);
    const version = optInt(body, 'version') ?? undefined;
    const page = pages.updatePage(homeId, idParam(req.params.id), parsePageFields(homeId, body), version);
    if (!page) throw new HttpError(404, 'not found');
    res.json(page);
});

/** Tag a page: `{ category_id }` or `{ name }` (found case-insensitively, created if new). */
api.post('/pages/:id/categories', (req, res) => {
    const { homeId } = ctx(res);
    const id = idParam(req.params.id);
    if (!pages.pageInHome(homeId, id)) throw new HttpError(404, 'not found');
    const body = asBody(req.body);
    const categoryId = optInt(body, 'category_id');
    const name = optText(body, 'name');
    let catId: number;
    if (typeof categoryId === 'number') {
        categories.assertCategory(homeId, categoryId);
        catId = categoryId;
    } else if (name) {
        catId = categories.findOrCreateCategory(homeId, name).id;
    } else {
        throw new HttpError(400, 'category_id or name is required');
    }
    pages.linkCategory(id, catId);
    res.json(pages.getPage(homeId, id));
});

api.delete('/pages/:id/categories/:categoryId', (req, res) => {
    const { homeId } = ctx(res);
    const id = idParam(req.params.id);
    if (!pages.pageInHome(homeId, id)) throw new HttpError(404, 'not found');
    pages.unlinkCategory(id, idParam(req.params.categoryId));
    res.json(pages.getPage(homeId, id));
});

// ---------------------------------------------------------------- categories

api.get('/categories', (_req, res) => {
    res.json(categories.listCategories(ctx(res).homeId));
});

api.get('/categories/uncategorized', (_req, res) => {
    res.json({ pages: categories.uncategorizedPages(ctx(res).homeId) });
});

api.get('/categories/:id', (req, res) => {
    const page = categories.categoryPage(ctx(res).homeId, idParam(req.params.id));
    if (!page) throw new HttpError(404, 'not found');
    res.json(page);
});

api.post('/categories', (req, res) => {
    const name = optText(asBody(req.body), 'name');
    if (!name) throw new HttpError(400, 'name is required');
    res.status(201).json(categories.findOrCreateCategory(ctx(res).homeId, name));
});

api.patch('/categories/:id', (req, res) => {
    const name = optText(asBody(req.body), 'name');
    if (!name) throw new HttpError(400, 'name is required');
    const cat = categories.renameCategory(ctx(res).homeId, idParam(req.params.id), name);
    if (!cat) throw new HttpError(404, 'not found');
    res.json(cat);
});

api.delete('/categories/:id', (req, res) => {
    if (!categories.deleteCategory(ctx(res).homeId, idParam(req.params.id))) throw new HttpError(404, 'not found');
    res.sendStatus(204);
});

// ---------------------------------------------------------------- notes

function parseNoteFields(homeId: number, body: Body): notes.NoteFields {
    const out: notes.NoteFields = {
        ...pick(body, ['body'], optMarkdown),
        ...pick(body, ['page_id'], optInt),
        ...pick(body, ['pinned'], optBool),
    };
    if ('body' in out && !out.body) throw new HttpError(400, 'body must not be empty');
    pages.assertPage(homeId, out.page_id);
    return out;
}

api.get('/notes', (req, res) => {
    res.json(notes.listNotes(ctx(res).homeId, pageQuery(req)));
});

api.post('/notes', (req, res) => {
    const { homeId, userId } = ctx(res);
    const f = parseNoteFields(homeId, asBody(req.body));
    if (!f.body) throw new HttpError(400, 'body is required');
    res.status(201).json(notes.createNote(homeId, userId, { ...f, body: f.body }));
});

api.patch('/notes/:id', (req, res) => {
    const { homeId } = ctx(res);
    const note = notes.updateNote(homeId, idParam(req.params.id), parseNoteFields(homeId, asBody(req.body)));
    if (!note) throw new HttpError(404, 'not found');
    res.json(note);
});

api.delete('/notes/:id', (req, res) => {
    if (!notes.deleteNote(ctx(res).homeId, idParam(req.params.id))) throw new HttpError(404, 'not found');
    res.sendStatus(204);
});

// ---------------------------------------------------------------- images

/** Body: { data, thumb } as base64 (downscaled in the browser), plus width/height. */
api.post('/images', (req, res) => {
    const { homeId, userId } = ctx(res);
    res.status(201).json(images.createImage(homeId, userId, asBody(req.body) as unknown as images.ImageUpload));
});

api.get('/images/:id', (req, res) => {
    const img = images.getImage(ctx(res).homeId, idParam(req.params.id), req.query.thumb !== undefined);
    if (!img) throw new HttpError(404, 'not found');
    res.set({
        'Content-Type': img.mime,
        'Cache-Control': 'private, max-age=31536000, immutable', // images never change once uploaded
        'X-Content-Type-Options': 'nosniff',
    });
    res.send(Buffer.from(img.bytes));
});

// ---------------------------------------------------------------- search

api.get('/search', (req, res) => {
    res.json(search(ctx(res).homeId, typeof req.query.q === 'string' ? req.query.q : ''));
});

app.use('/api', api);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not found')));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
    } else if (err instanceof SyntaxError) {
        res.status(400).json({ error: 'invalid JSON' });
    } else if ((err as { type?: string }).type === 'entity.too.large') {
        res.status(413).json({ error: 'request too large' });
    } else {
        console.error(err);
        res.status(500).json({ error: 'internal error' });
    }
});

// Express 5 passes listen errors (e.g. port in use) to this callback instead of throwing.
app.listen(port, (err?: Error) => {
    if (err) {
        console.error(`[api] could not listen on port ${port}: ${err.message}`);
        process.exit(1);
    }
    console.log(`mymimo api listening on http://localhost:${port} (db: ${DATABASE_PATH})`);
});
