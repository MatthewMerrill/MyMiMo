import { DatabaseSync } from 'node:sqlite';

// In-memory for now: resets on every API restart. Swap for a file path + WAL
// + a user_version migration runner once the data is worth keeping.
export const db = new DatabaseSync(':memory:');

db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE homes (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
    ) STRICT;

    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        avatar_url TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
    ) STRICT;

    -- Login sessions. Only a SHA-256 of the cookie token is stored.
    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        expires_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE user_identities (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        UNIQUE (provider, subject)
    ) STRICT;

    CREATE TABLE home_users (
        home_id INTEGER NOT NULL REFERENCES homes(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        PRIMARY KEY (home_id, user_id)
    ) STRICT;

    CREATE TABLE things (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id),
        parent_id INTEGER REFERENCES things(id),
        name TEXT NOT NULL,
        body TEXT,                      -- the wiki page content: current facts
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        archived_at INTEGER
    ) STRICT;
    CREATE INDEX things_home ON things(home_id, parent_id);

    -- Categories are tags: a thing can be in any number of them.
    CREATE TABLE categories (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id),
        name TEXT NOT NULL COLLATE NOCASE,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE (home_id, name)
    ) STRICT;

    CREATE TABLE thing_categories (
        thing_id INTEGER NOT NULL REFERENCES things(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (thing_id, category_id)
    ) STRICT;
    CREATE INDEX thing_categories_cat ON thing_categories(category_id);

    CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id),
        thing_id INTEGER REFERENCES things(id),
        author_id INTEGER NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    ) STRICT;
    CREATE INDEX notes_home ON notes(home_id, thing_id);

    CREATE TABLE tasks (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id),
        author_id INTEGER NOT NULL REFERENCES users(id),
        assignee_id INTEGER REFERENCES users(id),
        thing_id INTEGER REFERENCES things(id),
        brief TEXT NOT NULL,
        details TEXT,
        due_at INTEGER,
        priority INTEGER,
        recur TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        completed_at INTEGER
    ) STRICT;
    CREATE INDEX tasks_home ON tasks(home_id, completed_at, due_at);
`);

// ---------------------------------------------------------------- seed data

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

const insertHome = db.prepare('INSERT INTO homes (name) VALUES (?) RETURNING id');
const insertUser = db.prepare('INSERT INTO users (name) VALUES (?) RETURNING id');
const insertThing = db.prepare(
    'INSERT INTO things (home_id, parent_id, name) VALUES (?, ?, ?) RETURNING id');
const insertNote = db.prepare(
    'INSERT INTO notes (home_id, thing_id, author_id, body, pinned) VALUES (?, ?, ?, ?, ?)');
const insertSeedTask = db.prepare(`
    INSERT INTO tasks (home_id, author_id, thing_id, brief, details, due_at, priority, recur, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const homeId = insertHome.get('Orchid House')!.id as number;
const userId = insertUser.get('Matt')!.id as number;
db.prepare('INSERT INTO home_users (home_id, user_id) VALUES (?, ?)').run(homeId, userId);

const thing = (name: string, parent: number | null = null) =>
    insertThing.get(homeId, parent, name)!.id as number;

const house = thing('House');
const den = thing('Den', house);
const denWalls = thing('Walls', den);
const kitchen = thing('Kitchen', house);
const fridge = thing('Fridge', kitchen);
const macbook = thing('MacBook Pro');
const car = thing('Car');

const setBody = db.prepare('UPDATE things SET body = ? WHERE id = ?');
setBody.run('Paint: Sherwin-Williams SW 7008 Alabaster\nSheen: eggshell\nTouch-up can is in the garage, top shelf.', denWalls);
setBody.run('14" M3 Pro, 2023.\nUses OrbStack (not Docker Desktop) for DevContainers.', macbook);

const insertCategory = db.prepare('INSERT INTO categories (home_id, name) VALUES (?, ?) RETURNING id');
const link = db.prepare('INSERT INTO thing_categories (thing_id, category_id) VALUES (?, ?)');
const category = (name: string, ...things: number[]) => {
    const id = insertCategory.get(homeId, name)!.id as number;
    for (const t of things) link.run(t, id);
};
category('Rooms', den, kitchen);
category('Computers', macbook);
category('Things with Batteries', macbook, car);
category('Appliances', fridge);
category('Vehicles', car);
category('Paint & Finishes', denWalls);

insertNote.run(homeId, denWalls, userId,
    'Repainted June 2026 — took just under 2 gallons for the whole room.', 0);
insertNote.run(homeId, macbook, userId,
    'Battery health 91% as of Nov 2026.', 0);
insertNote.run(homeId, fridge, userId,
    'Water filter model: EveryDrop Filter 1. Replace every ~6 months.', 0);
insertNote.run(homeId, null, userId,
    'Wi-Fi guest network password is on the fridge magnet.', 0);

insertSeedTask.run(homeId, userId, car, 'Car registration renewal', 'Renew online at the DMV site.',
    now + 12 * DAY, 1, 'P1Y', null);
insertSeedTask.run(homeId, userId, fridge, 'Replace fridge water filter', null,
    now + 40 * DAY, 2, 'P6M', null);
insertSeedTask.run(homeId, userId, denWalls, 'Touch up scuff by den door', null, null, null, null, null);
insertSeedTask.run(homeId, userId, null, 'Call plumber about slow drain', null, null, null, null, null);
insertSeedTask.run(homeId, userId, null, 'Return library books', null, now - 2 * DAY, 2, null, now - DAY);

export const seed = { homeId, userId };
