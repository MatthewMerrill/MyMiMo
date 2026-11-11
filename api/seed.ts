import { db, transaction } from './db.ts';
import { rebuildLinks } from './links.ts';

/**
 * Demo content, written only into a brand-new, empty database when SEED_DEMO=1
 * (the dev script sets it). Real data is never touched.
 */
export function seedDemoIfEmpty(): boolean {
    if (process.env.SEED_DEMO !== '1') return false;
    // "Empty" means no content anywhere: a bare home/user auto-created by a request
    // (login disabled, no seed yet) still counts as empty, and gets filled in.
    const hasContent = db.prepare(`SELECT EXISTS (SELECT 1 FROM pages) OR EXISTS (SELECT 1 FROM notes)
        OR EXISTS (SELECT 1 FROM tasks) OR EXISTS (SELECT 1 FROM categories) AS x`).get()!.x;
    if (hasContent) return false;
    transaction(seed);
    console.log('[db] seeded demo data');
    return true;
}

function seed() {
    const DAY = 86400;
    const now = Math.floor(Date.now() / 1000);

    // Reuse the owner's (empty) home if one exists, so the app's current user sees the demo.
    const existing = db.prepare('SELECT home_id, user_id FROM home_users ORDER BY user_id, home_id LIMIT 1').get();
    let homeId: number, userId: number;
    if (existing) {
        homeId = existing.home_id as number;
        userId = existing.user_id as number;
    } else {
        homeId = db.prepare('INSERT INTO homes (name) VALUES (?) RETURNING id').get('Orchid House')!.id as number;
        userId = db.prepare('INSERT INTO users (name) VALUES (?) RETURNING id').get('Matt')!.id as number;
        db.prepare('INSERT INTO home_users (home_id, user_id) VALUES (?, ?)').run(homeId, userId);
    }

    const insertPage = db.prepare(
        'INSERT INTO pages (home_id, parent_id, title, body, pinned) VALUES (?, ?, ?, ?, ?) RETURNING id');
    const page = (title: string, parent: number | null, body: string | null = null, pinned = false) => {
        const id = insertPage.get(homeId, parent, title, body, pinned ? 1 : 0)!.id as number;
        rebuildLinks(id, body);
        return id;
    };

    const house = page('House', null, 'Built 1962. Main water shutoff is in the garage, left of the water heater.', true);
    const den = page('Den', house);
    const walls = page('Walls', den, [
        '**Paint:** Sherwin-Williams SW 7008 Alabaster',
        '**Sheen:** eggshell',
        '',
        'Touch-up can is in the garage, top shelf.',
    ].join('\n'));
    const kitchen = page('Kitchen', house);
    const fridge = page('Fridge', kitchen, [
        'LG LRMVS3006S, bought 2023.',
        '',
        '| Part | Model |',
        '|---|---|',
        '| Water filter | LT1000P |',
        '| Air filter | LT120F |',
        '',
        'How-to: [[Replace fridge water filter]]',
    ].join('\n'));
    const macbook = page('MacBook Pro', null, [
        '14" M3 Pro, 2023.',
        '',
        '- Uses **OrbStack** (not Docker Desktop) for DevContainers',
        '- AppleCare until Nov 2026',
    ].join('\n'));
    const car = page('Car', null, '2019 Subaru Outback. VIN ends in 4821.');
    const guide = page('Replace fridge water filter', null, [
        'For the [[Fridge]]. Takes 5 minutes; filter is an **LT1000P**.',
        '',
        '1. Open the top-left compartment inside the fridge.',
        '2. Turn the old filter **counter-clockwise** a quarter turn and pull it straight out.',
        '3. Remove the cap from the new filter, line up the arrow, push in and turn clockwise.',
        '4. Run 2.5 gallons of water through the dispenser to flush it.',
        '5. Hold *Filter Reset* for 3 seconds.',
    ].join('\n'));
    const camping = page('Camping', null, [
        'Gear lives on the garage shelf, in numbered boxes. Untick everything after a trip.',
        '',
        '## Box 1: Kitchen',
        '- [x] stove',
        '- [ ] stove fuel (check it\'s not empty!)',
        '- [ ] french press + coffee',
        '- [ ] pots, sporks, mugs',
        '',
        '## Box 2: Sleep',
        '```csv',
        'item,qty,notes',
        'sleeping bag,2,"the -5°C ones, not the summer bags"',
        'sleeping pad,2,check for leaks',
        'pillow,2,',
        '```',
        '',
        '## Before leaving',
        '- [ ] fill water jugs',
        '- [ ] charge headlamps',
    ].join('\n'), true);

    const insertCategory = db.prepare('INSERT INTO categories (home_id, name) VALUES (?, ?) RETURNING id');
    const link = db.prepare('INSERT INTO page_categories (page_id, category_id) VALUES (?, ?)');
    const category = (name: string, ...pages: number[]) => {
        const id = insertCategory.get(homeId, name)!.id as number;
        for (const p of pages) link.run(p, id);
    };
    category('Rooms', den, kitchen);
    category('Computers', macbook);
    category('Things with Batteries', macbook, car);
    category('Appliances', fridge);
    category('Vehicles', car);
    category('Paint & Finishes', walls);
    category('Guides', guide);
    category('Hobbies', camping);

    const insertNote = db.prepare(
        'INSERT INTO notes (home_id, page_id, author_id, body, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const note = (pageId: number | null, body: string, daysAgo: number, pinned = false) =>
        insertNote.run(homeId, pageId, userId, body, pinned ? 1 : 0, now - daysAgo * DAY, now - daysAgo * DAY);
    note(walls, 'Repainted the whole room. Took just under **2 gallons**.', 150);
    note(macbook, 'Battery health 91%.', 3);
    note(camping, 'Yosemite trip: forgot stove fuel. Added it to the list.', 90);
    note(null, 'Wi-Fi guest network password is on the fridge magnet.', 20);

    const insertTask = db.prepare(`
        INSERT INTO tasks (home_id, author_id, page_id, brief, details, due_at, priority, recur, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insertTask.run(homeId, userId, car, 'Car registration renewal', 'Renew online at the DMV site.',
        now + 12 * DAY, 1, 'P1Y', null);
    insertTask.run(homeId, userId, fridge, 'Replace fridge water filter', 'Follow [[Replace fridge water filter]].',
        now + 5 * DAY, 2, 'P6M', null);
    insertTask.run(homeId, userId, camping, 'Re-waterproof the tent', null, now + 120 * DAY, 3, 'P1Y', null);
    insertTask.run(homeId, userId, walls, 'Touch up scuff by den door', null, null, null, null, null);
    insertTask.run(homeId, userId, null, 'Call plumber about slow drain', null, null, null, null, null);
    insertTask.run(homeId, userId, null, 'Return library books', null, now - 2 * DAY, 2, null, now - DAY);
}
