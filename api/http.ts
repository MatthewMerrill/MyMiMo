// Small request-validation helpers shared by the route handlers.

export class HttpError extends Error {
    status: number;
    constructor(status: number, message: string) { super(message); this.status = status; }
}

export type Body = Record<string, unknown>;

export function asBody(v: unknown): Body {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        throw new HttpError(400, 'JSON object body required');
    }
    return v as Body;
}

/** undefined = field absent (leave alone), null = clear it. */
export function optInt(body: Body, key: string): number | null | undefined {
    const v = body[key];
    if (v === undefined || v === null) return v;
    if (typeof v !== 'number' || !Number.isInteger(v)) throw new HttpError(400, `${key} must be an integer or null`);
    return v;
}

/** Trims; blank strings become null. */
export function optText(body: Body, key: string): string | null | undefined {
    const v = body[key];
    if (v === undefined || v === null) return v;
    if (typeof v !== 'string') throw new HttpError(400, `${key} must be a string or null`);
    const s = v.trim();
    return s === '' ? null : s;
}

export function optBool(body: Body, key: string): boolean | undefined {
    const v = body[key];
    if (v === undefined) return v;
    if (typeof v !== 'boolean') throw new HttpError(400, `${key} must be a boolean`);
    return v;
}

export function idParam(raw: string | string[] | undefined): number {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not found');
    return id;
}

/** Builds and runs `UPDATE table SET ...` for the whitelisted columns present in patch. */
export function patchRow(
    db: { prepare(sql: string): { run(...a: (string | number | null)[]): unknown } },
    table: string, columns: readonly string[], patch: Record<string, unknown>,
    homeId: number, id: number,
): void {
    const cols = columns.filter(c => c in patch);
    if (cols.length === 0) return;
    // Column names come from the fixed whitelist, never from input.
    const sets = cols.map(c => `${c} = ?`).join(', ');
    db.prepare(`UPDATE ${table} SET ${sets}, updated_at = unixepoch() WHERE home_id = ? AND id = ?`)
        .run(...cols.map(c => (patch[c] ?? null) as string | number | null), homeId, id);
}
