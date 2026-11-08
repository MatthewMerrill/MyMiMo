import express, { type Request, type Response, type NextFunction } from 'express';
import { authRouter, requireUser, resolveUser, userInHome } from './auth.ts';
import { HttpError, asBody, idParam, optBool, optInt, optText, type Body } from './http.ts';
import * as tasks from './tasks.ts';
import * as things from './things.ts';
import * as notes from './notes.ts';
import * as categories from './categories.ts';
import { search } from './search.ts';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

// Who's asking: a Discord session, or the seeded demo user when auth isn't configured.
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

/** `?thing_id=5` → 5, `?thing_id=none` → null, absent → undefined. */
function thingQuery(req: Request): number | null | undefined {
    const v = req.query.thing_id;
    if (v === undefined) return undefined;
    if (v === 'none') return null;
    return idParam(String(v));
}

// ---------------------------------------------------------------- tasks

function parseTaskFields(homeId: number, body: Body): tasks.TaskFields {
    const out: tasks.TaskFields = {
        ...pick(body, ['brief', 'details', 'recur'], optText),
        ...pick(body, ['thing_id', 'assignee_id', 'due_at', 'priority', 'completed_at'], optInt),
    };
    if ('brief' in out && !out.brief) throw new HttpError(400, 'brief must not be empty');
    things.assertThing(homeId, out.thing_id);
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

const api = express.Router();

api.get('/tasks', (req, res) => {
    const thingId = thingQuery(req);
    res.json(tasks.listTasks(ctx(res).homeId, thingId ?? undefined));
});

api.post('/tasks', (req, res) => {
    const { homeId, userId } = ctx(res);
    const f = parseTaskFields(homeId, asBody(req.body));
    if (!f.brief) throw new HttpError(400, 'brief is required');
    res.status(201).json(tasks.createTask(homeId, userId, { ...f, brief: f.brief }));
});

api.patch('/tasks/:id', (req, res) => {
    const { homeId } = ctx(res);
    const task = tasks.updateTask(homeId, idParam(req.params.id), parseTaskFields(homeId, asBody(req.body)));
    if (!task) throw new HttpError(404, 'not found');
    res.json(task);
});

api.delete('/tasks/:id', (req, res) => {
    if (!tasks.deleteTask(ctx(res).homeId, idParam(req.params.id))) throw new HttpError(404, 'not found');
    res.sendStatus(204);
});

// ---------------------------------------------------------------- things

function parseThingFields(body: Body): things.ThingFields {
    return {
        ...pick(body, ['name', 'body'], optText),
        ...pick(body, ['parent_id', 'archived_at'], optInt),
    };
}

api.get('/things', (_req, res) => {
    res.json(things.listThings(ctx(res).homeId));
});

/** Everything the thing page needs in one round trip. */
api.get('/things/:id', (req, res) => {
    const { homeId } = ctx(res);
    const id = idParam(req.params.id);
    const thing = things.getThing(homeId, id);
    if (!thing) throw new HttpError(404, 'not found');
    res.json({
        thing,
        ancestors: things.ancestors(homeId, id),
        children: things.childThings(homeId, id),
        notes: notes.listNotes(homeId, id),
        tasks: tasks.listTasks(homeId, id),
    });
});

api.post('/things', (req, res) => {
    const { homeId } = ctx(res);
    const body = asBody(req.body);
    const categoryId = optInt(body, 'category_id');
    categories.assertCategory(homeId, categoryId);
    res.status(201).json(things.createThing(homeId, parseThingFields(body), categoryId));
});

api.patch('/things/:id', (req, res) => {
    const thing = things.updateThing(ctx(res).homeId, idParam(req.params.id), parseThingFields(asBody(req.body)));
    if (!thing) throw new HttpError(404, 'not found');
    res.json(thing);
});

/** Tag a thing: `{ category_id }` or `{ name }` (found case-insensitively, created if new). */
api.post('/things/:id/categories', (req, res) => {
    const { homeId } = ctx(res);
    const id = idParam(req.params.id);
    if (!things.thingInHome(homeId, id)) throw new HttpError(404, 'not found');
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
    things.linkCategory(id, catId);
    res.json(things.getThing(homeId, id));
});

api.delete('/things/:id/categories/:categoryId', (req, res) => {
    const { homeId } = ctx(res);
    const id = idParam(req.params.id);
    if (!things.thingInHome(homeId, id)) throw new HttpError(404, 'not found');
    things.unlinkCategory(id, idParam(req.params.categoryId));
    res.json(things.getThing(homeId, id));
});

// ---------------------------------------------------------------- categories

api.get('/categories', (_req, res) => {
    res.json(categories.listCategories(ctx(res).homeId));
});

api.get('/categories/uncategorized', (_req, res) => {
    res.json({ things: categories.uncategorizedThings(ctx(res).homeId) });
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
        ...pick(body, ['body'], optText),
        ...pick(body, ['thing_id'], optInt),
        ...pick(body, ['pinned'], optBool),
    };
    if ('body' in out && !out.body) throw new HttpError(400, 'body must not be empty');
    things.assertThing(homeId, out.thing_id);
    return out;
}

api.get('/notes', (req, res) => {
    res.json(notes.listNotes(ctx(res).homeId, thingQuery(req)));
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
    } else {
        console.error(err);
        res.status(500).json({ error: 'internal error' });
    }
});

app.listen(port, () => {
    console.log(`mymimo api listening on http://localhost:${port}`);
});
