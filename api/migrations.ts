import type { DatabaseSync } from 'node:sqlite';

/**
 * Ordered schema migrations. `PRAGMA user_version` records how many have run.
 * NEVER edit a migration that has shipped — append a new one instead.
 */
export const migrations: string[] = [
    // 1 — v2 schema: everything is a page.
    `
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

    CREATE TABLE user_identities (
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        subject TEXT NOT NULL,
        UNIQUE (provider, subject)
    ) STRICT;

    CREATE TABLE home_users (
        home_id INTEGER NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (home_id, user_id)
    ) STRICT;

    -- Login sessions. Only a SHA-256 of the cookie token is stored.
    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX sessions_user ON sessions(user_id);

    -- Photos, downscaled in the browser before upload; thumb is ~320px.
    CREATE TABLE images (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        mime TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        bytes BLOB NOT NULL,
        thumb BLOB NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
    ) STRICT;
    CREATE INDEX images_home ON images(home_id);

    CREATE TABLE pages (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        parent_id INTEGER REFERENCES pages(id),
        title TEXT NOT NULL,
        body TEXT,                                   -- markdown
        cover_image_id INTEGER REFERENCES images(id) ON DELETE SET NULL,
        pinned INTEGER NOT NULL DEFAULT 0,           -- shown in the sidebar
        version INTEGER NOT NULL DEFAULT 1,          -- bumps on every edit; guards concurrent saves
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        archived_at INTEGER
    ) STRICT;
    CREATE INDEX pages_home ON pages(home_id, parent_id);
    CREATE INDEX pages_title ON pages(home_id, title COLLATE NOCASE);

    -- Categories are tags: a page can be in any number of them.
    CREATE TABLE categories (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        name TEXT NOT NULL COLLATE NOCASE,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        UNIQUE (home_id, name)
    ) STRICT;

    CREATE TABLE page_categories (
        page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        PRIMARY KEY (page_id, category_id)
    ) STRICT;
    CREATE INDEX page_categories_cat ON page_categories(category_id);

    -- [[Wiki links]] found in each page body, rebuilt on save. Powers "Linked from".
    CREATE TABLE page_links (
        from_page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
        to_title TEXT NOT NULL COLLATE NOCASE,
        PRIMARY KEY (from_page_id, to_title)
    ) STRICT;
    CREATE INDEX page_links_to ON page_links(to_title);

    CREATE TABLE tasks (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        author_id INTEGER NOT NULL REFERENCES users(id),
        assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        page_id INTEGER REFERENCES pages(id) ON DELETE SET NULL,
        brief TEXT NOT NULL,
        details TEXT,                                -- markdown
        due_at INTEGER,
        priority INTEGER,                            -- null = untriaged ("inbox")
        recur TEXT,                                  -- P1W, P3M, P1Y…
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        completed_at INTEGER
    ) STRICT;
    CREATE INDEX tasks_home ON tasks(home_id, completed_at, due_at);
    CREATE INDEX tasks_page ON tasks(page_id);

    -- The Log on a page (or unfiled when page_id is null). task_id marks an
    -- entry written automatically when that task was completed.
    CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
        page_id INTEGER REFERENCES pages(id) ON DELETE SET NULL,
        task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        author_id INTEGER NOT NULL REFERENCES users(id),
        body TEXT NOT NULL,                          -- markdown
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    ) STRICT;
    CREATE INDEX notes_home ON notes(home_id, page_id);
    `,
];

/** Applies pending migrations, each in its own transaction. Returns versions before/after. */
export function migrate(db: DatabaseSync): { from: number; to: number } {
    const from = Number(db.prepare('PRAGMA user_version').get()!.user_version);
    if (from > migrations.length) {
        throw new Error(`Database is at schema v${from}, newer than this code (v${migrations.length}).`);
    }
    for (let v = from; v < migrations.length; v++) {
        db.exec('BEGIN IMMEDIATE');
        try {
            db.exec(migrations[v]);
            db.exec(`PRAGMA user_version = ${v + 1}`);
            db.exec('COMMIT');
        } catch (e) {
            db.exec('ROLLBACK');
            throw new Error(`Migration ${v + 1} failed: ${(e as Error).message}`);
        }
    }
    return { from, to: migrations.length };
}
