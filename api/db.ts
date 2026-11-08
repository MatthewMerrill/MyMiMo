import { Database } from 'node:sqlite';
const database = new Database(':memory:');

database.exec(`
    CREATE TABLE IF NOT EXISTS homes (
        id INTEGER PRIMARY KEY,
        name TEXT);
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        name TEXT);
    CREATE TABLE IF NOT EXISTS user_connections (
        user_id INTEGER NOT NULL REFERENCES users(id),
        oauth_provider TEXT NOT NULL,
        oauth_id TEXT NOT NULL,
        PRIMARY KEY (user_id, oauth_provider, oauth_id));
    CREATE TABLE IF NOT EXISTS home_users (
        home_id INTEGER NOT NULL REFERENCES homes(id),
        user_id INTEGER NOT NULL REFERENCES users(id),
        PRIMARY KEY (home_id, user_id));
    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id),
        name TEXT,
        category TEXT);
    CREATE TABLE IF NOT EXISTS asset_categories (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id),
        parent_id INTEGER REFERENCES asset_categories(id),
        name TEXT,
        color TEXT);
    CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY,
        home_id INTEGER NOT NULL REFERENCES homes(id),
        name TEXT);
    CREATE TABLE IF NOT EXISTS asset_tags (
        asset_id INTEGER NOT NULL REFERENCES assets(id),
        tag_id INTEGER NOT NULL REFERENCES tags(id),
        PRIMARY KEY (asset_id, tag_id));
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY,

        home_id INTEGER NOT NULL REFERENCES homes(id),
        author_id INTEGER NOT NULL REFERENCES users(id),
        assignee_id INTEGER REFERENCES users(id),
        asset_id INTEGER REFERENCES assets(id),

        brief TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT FALSE);
    CREATE TABLE IF NOT EXISTS task_deps (
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        depends_on INTEGER NOT NULL REFERENCES tasks(id),
        PRIMARY KEY (task_id, depends_on));
`);

const orchidId = database.prepare('INSERT INTO homes (name) VALUES (?) RETURNING id').get('Orchid House').id
const mattId = database.prepare('INSERT INTO users (name) VALUES (?) RETURNING id').get('Matt').id
console.log(orchidId, mattId);
database.prepare('INSERT INTO home_users (home_id, user_id) VALUES (?, ?)').all(orchidId, mattId);
{
    // debug print home admins
    const query = database.prepare('SELECT * FROM home_users ORDER BY home_id');
    // Execute the prepared statement and log the result set.
    console.log(query.all());
    // Prints: [ { key: 1, value: 'hello' }, { key: 2, value: 'world' } ]
    query.close();
}
for (let i = 0; i < 10; i++) {
    let statement = database.prepare('INSERT INTO tasks (home_id, author_id, brief) VALUES (?, ?, ?) RETURNING id');
    statement.get(orchidId, mattId, 'Task #' + i);
    statement.close();
}
{
    let query = database.prepare('SELECT * FROM tasks ORDER BY home_id');
    console.log(query.all());
    query.close();
}

export function loadTasks(homeId: number): Array<any> {
    let statement = database.prepare(`
        SELECT * FROM tasks WHERE home_id = ?`);
    try {
        let tasks = statement.all(homeId);
        console.log(tasks);
        return tasks;
    } finally {
        statement.close();
    }
}