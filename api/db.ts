import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { migrate } from './migrations.ts';

export const DATABASE_PATH = process.env.DATABASE_PATH ?? resolve(import.meta.dirname, '../data/mymimo.db');
if (DATABASE_PATH !== ':memory:') mkdirSync(dirname(DATABASE_PATH), { recursive: true });

export const db = new DatabaseSync(DATABASE_PATH);
db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
`);

const { from, to } = migrate(db);
if (from !== to) console.log(`[db] ${DATABASE_PATH}: migrated schema v${from} → v${to}`);

/** Runs fn in a transaction (not nestable — call only from top-level operations). */
export function transaction<T>(fn: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = fn();
        db.exec('COMMIT');
        return result;
    } catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
