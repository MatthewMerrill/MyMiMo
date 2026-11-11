import { db } from './db.ts';
import { HttpError } from './http.ts';

/** Server-side caps; the browser already downscales to ~1600px before upload. */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_THUMB_BYTES = 512 * 1024;

/** Detects the real type from the first bytes; the client's claim is ignored. */
function sniff(buf: Buffer): string | null {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    return null;
}

function decode(field: string, b64: unknown, max: number): Buffer {
    if (typeof b64 !== 'string' || !b64) throw new HttpError(400, `${field} is required (base64)`);
    const buf = Buffer.from(b64, 'base64');
    if (buf.length === 0) throw new HttpError(400, `${field} is not valid base64`);
    if (buf.length > max) throw new HttpError(413, `${field} is too large (max ${Math.round(max / 1024)} KB)`);
    return buf;
}

const insertStmt = db.prepare(`
    INSERT INTO images (home_id, created_by, mime, width, height, bytes, thumb)
    VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`);
const getStmt = db.prepare('SELECT mime, bytes FROM images WHERE home_id = ? AND id = ?');
const getThumbStmt = db.prepare('SELECT mime, thumb AS bytes FROM images WHERE home_id = ? AND id = ?');
const existsStmt = db.prepare('SELECT 1 FROM images WHERE home_id = ? AND id = ?');

export interface ImageUpload { data: unknown; thumb: unknown; width: unknown; height: unknown }

export function createImage(homeId: number, userId: number, body: ImageUpload): { id: number; width: number; height: number } {
    const bytes = decode('data', body.data, MAX_BYTES);
    const thumb = decode('thumb', body.thumb, MAX_THUMB_BYTES);
    const mime = sniff(bytes);
    if (!mime) throw new HttpError(415, 'only JPEG, PNG or WebP images are accepted');
    if (!sniff(thumb)) throw new HttpError(415, 'thumb must be JPEG, PNG or WebP');
    const width = Number(body.width), height = Number(body.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 10000 || height > 10000) {
        throw new HttpError(400, 'width and height must be positive integers');
    }
    const id = insertStmt.get(homeId, userId, mime, width, height, bytes, thumb)!.id as number;
    return { id, width, height };
}

export function getImage(homeId: number, id: number, thumb: boolean): { mime: string; bytes: Uint8Array } | undefined {
    const row = (thumb ? getThumbStmt : getStmt).get(homeId, id);
    return row ? { mime: row.mime as string, bytes: row.bytes as Uint8Array } : undefined;
}

export function imageInHome(homeId: number, id: number): boolean {
    return existsStmt.get(homeId, id) !== undefined;
}
