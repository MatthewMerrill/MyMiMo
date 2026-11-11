/**
 * Discord OAuth2 login (authorization-code flow, `identify` scope only).
 *
 * Disabled unless DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are set — in that
 * case every request acts as the home's owner (the first user; created if the DB is empty).
 *
 * Flow:
 *   GET /api/auth/discord/login     → sets a CSRF state cookie, redirects to Discord
 *   GET /api/auth/discord/callback  → checks state, swaps code for a token, fetches
 *                                     the Discord profile, finds/creates the user,
 *                                     sets the session cookie, redirects to /
 *   GET  /api/auth/me               → { auth_enabled, user }
 *   POST /api/auth/logout           → deletes the session
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { db, transaction } from './db.ts';
import { HttpError } from './http.ts';

const config = {
    clientId: process.env.DISCORD_CLIENT_ID ?? '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
    // Must exactly match a redirect registered in the Discord developer portal.
    redirectUri: process.env.DISCORD_REDIRECT_URI ?? 'http://localhost:5173/api/auth/discord/callback',
    // Comma-separated Discord user IDs allowed to sign in. Empty = anyone (each gets their own home).
    allowedIds: new Set((process.env.DISCORD_ALLOWED_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)),
    secureCookies: process.env.NODE_ENV === 'production',
};

export const authEnabled = Boolean(config.clientId && config.clientSecret);

if (authEnabled && config.allowedIds.size === 0) {
    console.warn('[auth] DISCORD_ALLOWED_USER_IDS is empty: any Discord user can sign in (each gets a separate, empty home).');
}

const SESSION_COOKIE = 'mymimo_session';
const STATE_COOKIE = 'mymimo_oauth_state';
const SESSION_TTL = 30 * 86400;
const DISCORD_API = 'https://discord.com/api/v10';

export interface SessionUser { id: number; name: string; avatar_url: string | null }

// ---------------------------------------------------------------- storage

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const findSessionStmt = db.prepare(`
    SELECT u.id, u.name, u.avatar_url FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > unixepoch()`);
const insertSessionStmt = db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
const purgeSessionsStmt = db.prepare('DELETE FROM sessions WHERE expires_at <= unixepoch()');
const homeForUserStmt = db.prepare('SELECT home_id FROM home_users WHERE user_id = ? ORDER BY home_id LIMIT 1');
const userStmt = db.prepare('SELECT id, name, avatar_url FROM users WHERE id = ?');
const userInHomeStmt = db.prepare('SELECT 1 FROM home_users WHERE home_id = ? AND user_id = ?');
const findIdentityStmt = db.prepare('SELECT user_id FROM user_identities WHERE provider = ? AND subject = ?');
const anyIdentityStmt = db.prepare('SELECT 1 FROM user_identities LIMIT 1');
const insertIdentityStmt = db.prepare('INSERT INTO user_identities (user_id, provider, subject) VALUES (?, ?, ?)');
const insertUserStmt = db.prepare('INSERT INTO users (name, avatar_url) VALUES (?, ?) RETURNING id');
const updateUserStmt = db.prepare('UPDATE users SET name = ?, avatar_url = ? WHERE id = ?');
const insertHomeStmt = db.prepare('INSERT INTO homes (name) VALUES (?) RETURNING id');
const insertHomeUserStmt = db.prepare('INSERT INTO home_users (home_id, user_id) VALUES (?, ?)');
const ownerStmt = db.prepare(`
    SELECT u.id, u.name, u.avatar_url FROM users u
    WHERE EXISTS (SELECT 1 FROM home_users hu WHERE hu.user_id = u.id)
    ORDER BY u.id LIMIT 1`);

/** The first user who has a home — or a fresh "Me" + "My home" in an empty database. */
function owner(): SessionUser {
    const existing = ownerStmt.get() as unknown as SessionUser | undefined;
    if (existing) return existing;
    return transaction(() => {
        const userId = insertUserStmt.get('Me', null)!.id as number;
        const homeId = insertHomeStmt.get('My home')!.id as number;
        insertHomeUserStmt.run(homeId, userId);
        return userStmt.get(userId) as unknown as SessionUser;
    });
}

export function userInHome(homeId: number, userId: number): boolean {
    return userInHomeStmt.get(homeId, userId) !== undefined;
}

function createSession(userId: number): string {
    purgeSessionsStmt.run();
    const token = randomBytes(32).toString('base64url');
    insertSessionStmt.run(sha256(token), userId, Math.floor(Date.now() / 1000) + SESSION_TTL);
    return token;
}

interface DiscordProfile { id: string; username: string; global_name: string | null; avatar: string | null }

function findOrCreateUser(p: DiscordProfile): number {
    const name = p.global_name || p.username;
    const avatar = p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=64` : null;

    const existing = findIdentityStmt.get('discord', p.id);
    if (existing) {
        const userId = existing.user_id as number;
        updateUserStmt.run(name, avatar, userId);
        return userId;
    }

    return transaction(() => {
        let userId: number;
        const existingOwner = ownerStmt.get() as unknown as SessionUser | undefined;
        if (!anyIdentityStmt.get() && existingOwner) {
            // The very first sign-in adopts the existing owner, so anything created
            // while login was disabled (or the demo seed) stays yours. Protect this
            // with DISCORD_ALLOWED_USER_IDS so a stranger can't be first.
            userId = existingOwner.id;
            updateUserStmt.run(name, avatar, userId);
        } else {
            userId = insertUserStmt.get(name, avatar)!.id as number;
            const homeId = insertHomeStmt.get(`${name}'s home`)!.id as number;
            insertHomeUserStmt.run(homeId, userId);
        }
        insertIdentityStmt.run(userId, 'discord', p.id);
        return userId;
    });
}

// ---------------------------------------------------------------- cookies

function parseCookies(header: string | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const part of header?.split(';') ?? []) {
        const i = part.indexOf('=');
        if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}

const cookieOpts = (maxAgeSec: number, path = '/') => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.secureCookies,
    path,
    maxAge: maxAgeSec * 1000,
});

function sameString(a: string, b: string): boolean {
    const ab = Buffer.from(a), bb = Buffer.from(b);
    return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// ---------------------------------------------------------------- middleware

/** Sets res.locals.{userId, homeId, user} when signed in (or always, when auth is disabled). */
export function resolveUser(req: Request, res: Response, next: NextFunction) {
    let user: SessionUser | undefined;
    if (!authEnabled) {
        user = owner();
    } else {
        const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
        if (token) user = findSessionStmt.get(sha256(token)) as unknown as SessionUser | undefined;
    }
    if (user) {
        const home = homeForUserStmt.get(user.id);
        res.locals.user = user;
        res.locals.userId = user.id;
        res.locals.homeId = home?.home_id;
    }
    next();
}

export function requireUser(_req: Request, res: Response, next: NextFunction) {
    if (!res.locals.userId || !res.locals.homeId) throw new HttpError(401, 'sign in required');
    next();
}

// ---------------------------------------------------------------- routes

export const authRouter = express.Router();

authRouter.get('/me', (_req, res) => {
    res.json({ auth_enabled: authEnabled, provider: authEnabled ? 'discord' : null, user: res.locals.user ?? null });
});

authRouter.post('/logout', (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) deleteSessionStmt.run(sha256(token));
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.sendStatus(204);
});

authRouter.get('/discord/login', (_req, res) => {
    if (!authEnabled) throw new HttpError(404, 'Discord login is not configured');
    const state = randomBytes(16).toString('base64url');
    res.cookie(STATE_COOKIE, state, cookieOpts(600, '/api/auth'));
    const params = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        redirect_uri: config.redirectUri,
        scope: 'identify',
        state,
    });
    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

/** Failures land back on the app with ?login_error=… for the login screen to show. */
authRouter.get('/discord/callback', async (req, res) => {
    if (!authEnabled) throw new HttpError(404, 'Discord login is not configured');
    const fail = (reason: string) => res.redirect(`/?login_error=${encodeURIComponent(reason)}`);

    const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: '/api/auth' });
    const { code, state, error } = req.query;
    if (typeof error === 'string') return fail(error === 'access_denied' ? 'cancelled' : error);
    if (typeof code !== 'string' || typeof state !== 'string' || !expected || !sameString(state, expected)) {
        return fail('state_mismatch');
    }

    let profile: DiscordProfile;
    try {
        const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: 'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64'),
            },
            body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri }),
        });
        if (!tokenRes.ok) throw new Error(`token exchange ${tokenRes.status}: ${await tokenRes.text()}`);
        const { access_token } = await tokenRes.json() as { access_token: string };

        const meRes = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${access_token}` } });
        if (!meRes.ok) throw new Error(`profile ${meRes.status}: ${await meRes.text()}`);
        profile = await meRes.json() as DiscordProfile;
    } catch (e) {
        console.error('[auth] Discord login failed:', e);
        return fail('discord_error');
    }

    if (config.allowedIds.size > 0 && !config.allowedIds.has(profile.id)) {
        console.warn(`[auth] rejected Discord user ${profile.id} (${profile.username}): not in DISCORD_ALLOWED_USER_IDS`);
        return fail('not_allowed');
    }

    const token = createSession(findOrCreateUser(profile));
    res.cookie(SESSION_COOKIE, token, cookieOpts(SESSION_TTL));
    res.redirect('/');
});
