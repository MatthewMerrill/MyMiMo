import { db } from './db.ts';

/**
 * [[Title]] or [[Title|label]]. The title can't start/end with whitespace, so
 * shell tests like `[[ -f x ]]` aren't mistaken for links. Keep in sync with web/src/wiki.ts.
 */
export const WIKI_LINK = /\[\[([^\s[\]|](?:[^[\]|\n]*[^\s[\]|])?)(?:\|([^[\]\n]+))?\]\]/g;

const FENCE = /^\s*(```|~~~)/;

/** Calls fn on each line that isn't inside a fenced code block. */
export function eachProseLine(md: string, fn: (line: string) => void): void {
    let fence: string | null = null;
    for (const line of md.split('\n')) {
        const m = FENCE.exec(line);
        if (m) {
            if (fence === null) fence = m[1];
            else if (m[1] === fence) fence = null;
            continue;
        }
        if (fence === null) fn(line);
    }
}

/** Distinct link targets in a markdown body (outside code fences). */
export function wikiTitles(md: string | null): string[] {
    const seen = new Map<string, string>();
    if (!md) return [];
    eachProseLine(md, line => {
        for (const m of line.matchAll(WIKI_LINK)) {
            const title = m[1].trim().slice(0, 200);
            if (!seen.has(title.toLowerCase())) seen.set(title.toLowerCase(), title);
        }
    });
    return [...seen.values()];
}

const clearStmt = db.prepare('DELETE FROM page_links WHERE from_page_id = ?');
const insertStmt = db.prepare('INSERT OR IGNORE INTO page_links (from_page_id, to_title) VALUES (?, ?)');

/** Replaces a page's outgoing links with those found in its body. */
export function rebuildLinks(pageId: number, body: string | null): void {
    clearStmt.run(pageId);
    for (const title of wikiTitles(body)) insertStmt.run(pageId, title);
}
