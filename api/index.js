import express from 'express';
import cookieParser from 'cookie-parser';

import * as db from './db.ts';

const app = express();
const port = 3000;

app.use(express.json());
app.use(cookieParser('foobarbaz'));

function validateTaskCreate(req, res, next) {
    // TODO
    next(req.task);
}

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});


app.get('/tasks', (req, res) => {
    let homeId = req.signedCookies['session']?.home || 1;
    let tasks = db.loadTasks(homeId);
    res.send(tasks);
});
app.post('/tasks', (req, res) => {
    let home = req.signedCookies['session'].home || 1;
    validateTaskCreate(req, res, task => {
        let taskId = db.saveTask(req.task);
        res.send(tasks);
    });
});

app.get('/login', (req, res) => {
    res.cookie('session', {'home': 1}, {
        expires: new Date(Date.now() + 900000),
        httpOnly: true,
        signed: true,
        secret: 'foo',
    });
    res.send('ok');
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});

/*

const { Database } = require('node:sqlite');
const database = new Database(':memory:');

// Execute SQL statements from strings.
database.exec(`
  CREATE TABLE data(
    key INTEGER PRIMARY KEY,
    value TEXT
  ) STRICT
`);
// Create a prepared statement to insert data into the database.
const insert = database.prepare('INSERT INTO data (key, value) VALUES (?, ?)');
// Execute the prepared statement with bound values.
insert.run(1, 'hello');
insert.run(2, 'world');
// Finalize the prepared statement once it is no longer needed.
insert.close();
// Create a prepared statement to read data from the database.
const query = database.prepare('SELECT * FROM data ORDER BY key');
// Execute the prepared statement and log the result set.
console.log(query.all());
// Prints: [ { key: 1, value: 'hello' }, { key: 2, value: 'world' } ]
query.close();


*/