// Accounts: sign in with an email and a password (or with Google, once its keys are set), pick a username, and that
// name is yours in online games. One Durable Object keeps every account in its SQLite database, so usernames and
// emails are unique. Passwords are kept only as salted PBKDF2 hashes; a session is a random token the game keeps,
// stored here only as its SHA-256.
//
//   GET  /v2/auth/config                       { google, apple }: which sign-in buttons to show
//   POST /v2/auth/register {email, password, username}   -> { token, name, email }
//   POST /v2/auth/login    {email, password}             -> { token, name, email }
//   GET  /v2/auth/me       (Authorization: Bearer token) -> { name, email, provider }
//   POST /v2/auth/username {username}          (signed in) -> { name }
//   POST /v2/auth/logout                       (signed in)
//   GET  /v2/auth/google/start?sid=..          the page the game opens in the browser: on to Google
//   GET  /v2/auth/google/callback              Google comes back here; the account is ready for the game
//   GET  /v2/auth/poll?sid=..                  the game asks, every couple of seconds, if the sign-in is done
//   GET  /v2/auth/alarm/info                   the C-RAM alarm everyone hears: { v, name, size, mine } or { v: 0 }
//   GET  /v2/auth/alarm                        that recording
//   POST /v2/auth/alarm {data: data URL, name} (signed in) share a recording with everyone. The first account to
//                                              share one owns it; only that account can change or remove it after
//   POST /v2/auth/alarm/remove                 (the owner) back to the built-in alarm for everyone
// Errors: { error: code } with code one of bad_email, bad_password, bad_username, email_taken, name_taken,
// wrong_login, locked, signed_out, not_enabled, pending, not_owner, bad_sound.
import { DurableObject } from 'cloudflare:workers';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
const json = (body, status = 200) => Response.json(body, { status, headers: { ...CORS, 'cache-control': 'no-store' } });
const err = (code, status = 400) => json({ error: code }, status);
const enc = new TextEncoder();
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const sha256 = async (s) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))));
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_ .-]{1,14}[A-Za-z0-9_.]$/;
const RESERVED = new Set(['recruit', 'player', 'admin', 'administrator', 'moderator', 'sixth front', 'sixthfront', 'host', 'server', 'system']);
const cleanEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 254);
const okName = (n) => NAME.test(n) && !/ {2}/.test(n) && !RESERVED.has(n.toLowerCase());

async function hashPassword(password, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { salt: b64(salt), hash: b64(new Uint8Array(bits)) };
}
// compares without stopping at the first difference
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

const page = (title, text) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0d1012;color:#e8eae3;font:17px system-ui,sans-serif;text-align:center;padding:24px">
<div><p style="letter-spacing:.2em;color:#f2b33d;font-size:13px">SIXTH FRONT</p><h1 style="margin:.2em 0">${title}</h1><p style="color:#a9aea4">${text}</p></div>`,
{ headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export class Accounts extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, name TEXT UNIQUE COLLATE NOCASE,
      salt TEXT, hash TEXT, google TEXT UNIQUE, apple TEXT UNIQUE, created INTEGER)`);
    this.sql.exec('CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, uid INTEGER, created INTEGER)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS pending (sid TEXT PRIMARY KEY, token TEXT, created INTEGER)');
    // the shared alarm recording, in parts (a stored value is at most 2 MB), and what it is
    this.sql.exec('CREATE TABLE IF NOT EXISTS sound (part INTEGER PRIMARY KEY, data BLOB)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
    this.fails = new Map(); // email -> { n, at }: wrong passwords, to slow down guessing
  }

  one(q, ...a) { const r = this.sql.exec(q, ...a).toArray(); return r[0] || null; }

  async session(uid) {
    const token = randomHex(32);
    this.sql.exec('INSERT INTO sessions (token, uid, created) VALUES (?, ?, ?)', await sha256(token), uid, Date.now());
    return token;
  }

  async user(req) {
    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get('authorization') || '');
    if (!m) return null;
    const s = this.one('SELECT uid FROM sessions WHERE token = ?', await sha256(m[1]));
    return s ? this.one('SELECT * FROM users WHERE id = ?', s.uid) : null;
  }

  meta(k) { const r = this.one('SELECT v FROM meta WHERE k = ?', k); return r ? r.v : null; }
  setMeta(k, v) { if (v === null) this.sql.exec('DELETE FROM meta WHERE k = ?', k); else this.sql.exec('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', k, String(v)); }

  async alarmInfo(req) {
    const v = Number(this.meta('alarmV') || 0), owner = this.meta('alarmOwner');
    const u = await this.user(req);
    const mine = !!(u && owner && String(u.id) === owner);
    return v ? { v, name: this.meta('alarmName') || '', size: Number(this.meta('alarmSize') || 0), mine, canShare: mine } : { v: 0, canShare: !owner || mine, mine };
  }

  out(u, token) { return { token, name: u.name || null, email: u.email || null, provider: u.google ? 'google' : u.apple ? 'apple' : 'email' }; }

  async fetch(req) {
    const url = new URL(req.url), path = url.pathname.replace(/^\/v2\/auth/, '');
    const env = this.env, google = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    let body = {};
    if (req.method === 'POST') { try { body = await req.json(); } catch (e) { body = {}; } }

    if (path === '/config') return json({ google, apple: false });

    // the C-RAM alarm everyone hears
    if (path === '/alarm/info') return json(await this.alarmInfo(req));
    if (path === '/alarm' && req.method === 'GET') {
      const type = this.meta('alarmType');
      if (!type) return err('not_found', 404);
      const parts = this.sql.exec('SELECT data FROM sound ORDER BY part').toArray().map((r) => new Uint8Array(r.data));
      const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let o = 0;
      for (const p of parts) { all.set(p, o); o += p.length; }
      return new Response(all, { headers: { ...CORS, 'content-type': type, 'cache-control': 'public, max-age=60' } });
    }
    if (path === '/alarm' && req.method === 'POST') {
      const u = await this.user(req);
      if (!u) return err('signed_out', 401);
      const owner = this.meta('alarmOwner');
      if (owner && owner !== String(u.id)) return err('not_owner', 403);
      const m = /^data:(audio\/[a-z0-9.+-]+|video\/mp4|application\/octet-stream)?(?:;[^,]*)?;base64,([A-Za-z0-9+/=]+)$/i.exec(String(body.data || ''));
      if (!m) return err('bad_sound');
      let bytes;
      try { bytes = unb64(m[2]); } catch (e) { return err('bad_sound'); }
      if (bytes.length < 100 || bytes.length > 2.6e6) return err('bad_sound');
      this.sql.exec('DELETE FROM sound');
      for (let i = 0, k = 0; i < bytes.length; i += 1e6, k++) this.sql.exec('INSERT INTO sound (part, data) VALUES (?, ?)', k, bytes.slice(i, i + 1e6).buffer);
      this.setMeta('alarmType', m[1] || 'audio/mpeg');
      this.setMeta('alarmName', String(body.name || '').slice(0, 40));
      this.setMeta('alarmSize', bytes.length);
      this.setMeta('alarmV', Date.now());
      this.setMeta('alarmOwner', u.id);
      return json(await this.alarmInfo(req));
    }
    if (path === '/alarm/remove' && req.method === 'POST') {
      const u = await this.user(req);
      if (!u) return err('signed_out', 401);
      const owner = this.meta('alarmOwner');
      if (owner && owner !== String(u.id)) return err('not_owner', 403);
      this.sql.exec('DELETE FROM sound');
      for (const k of ['alarmType', 'alarmName', 'alarmSize', 'alarmV']) this.setMeta(k, null);
      return json(await this.alarmInfo(req));
    }

    if (path === '/register' && req.method === 'POST') {
      const email = cleanEmail(body.email), password = String(body.password || ''), name = String(body.username || '').trim();
      if (!EMAIL.test(email)) return err('bad_email');
      if (password.length < 8 || password.length > 128) return err('bad_password');
      if (!okName(name)) return err('bad_username');
      if (this.one('SELECT id FROM users WHERE email = ?', email)) return err('email_taken', 409);
      if (this.one('SELECT id FROM users WHERE name = ?', name)) return err('name_taken', 409);
      const { salt, hash } = await hashPassword(password);
      this.sql.exec('INSERT INTO users (email, name, salt, hash, created) VALUES (?, ?, ?, ?, ?)', email, name, salt, hash, Date.now());
      const u = this.one('SELECT * FROM users WHERE email = ?', email);
      return json(this.out(u, await this.session(u.id)));
    }

    if (path === '/login' && req.method === 'POST') {
      const email = cleanEmail(body.email), password = String(body.password || '');
      const f = this.fails.get(email);
      if (f && f.n >= 8 && Date.now() - f.at < 15 * 60e3) return err('locked', 429);
      const u = this.one('SELECT * FROM users WHERE email = ?', email);
      const ok = u && u.hash && same((await hashPassword(password, u.salt)).hash, u.hash);
      if (!ok) {
        const n = f && Date.now() - f.at < 15 * 60e3 ? f.n + 1 : 1;
        this.fails.set(email, { n, at: Date.now() });
        return err('wrong_login', 401);
      }
      this.fails.delete(email);
      return json(this.out(u, await this.session(u.id)));
    }

    if (path === '/me') {
      const u = await this.user(req);
      return u ? json(this.out(u)) : err('signed_out', 401);
    }

    if (path === '/username' && req.method === 'POST') {
      const u = await this.user(req);
      if (!u) return err('signed_out', 401);
      const name = String(body.username || '').trim();
      if (!okName(name)) return err('bad_username');
      const other = this.one('SELECT id FROM users WHERE name = ?', name);
      if (other && other.id !== u.id) return err('name_taken', 409);
      this.sql.exec('UPDATE users SET name = ? WHERE id = ?', name, u.id);
      return json({ name });
    }

    if (path === '/logout' && req.method === 'POST') {
      const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.get('authorization') || '');
      if (m) this.sql.exec('DELETE FROM sessions WHERE token = ?', await sha256(m[1]));
      return json({ ok: true });
    }

    // ---- Google: the game opens /google/start in the browser and asks /poll until the account is ready
    if (path === '/google/start') {
      if (!google) return page('Not available yet', 'Signing in with Google is not switched on for Sixth Front yet. Use your email and a password in the game.');
      const sid = String(url.searchParams.get('sid') || '');
      if (!/^[0-9a-f]{32}$/.test(sid)) return page('Something went wrong', 'Start again from the game.');
      this.sql.exec('INSERT OR REPLACE INTO pending (sid, token, created) VALUES (?, NULL, ?)', sid, Date.now());
      const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/v2/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state: sid, prompt: 'select_account' });
      return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, 302);
    }
    if (path === '/google/callback') {
      const sid = String(url.searchParams.get('state') || ''), code = url.searchParams.get('code');
      const p = /^[0-9a-f]{32}$/.test(sid) && this.one('SELECT sid FROM pending WHERE sid = ? AND created > ?', sid, Date.now() - 15 * 60e3);
      if (!google || !p || !code) return page('Something went wrong', 'Start signing in again from the game.');
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${url.origin}/v2/auth/google/callback`, grant_type: 'authorization_code' }),
      });
      const t = r.ok ? await r.json() : null;
      // (the ID token comes straight from Google over TLS, in answer to our own request)
      let claims = null;
      try { claims = JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { claims = null; }
      if (!claims || !claims.sub || claims.aud !== env.GOOGLE_CLIENT_ID) return page('Something went wrong', 'Google did not sign you in. Try again from the game.');
      const email = claims.email_verified ? cleanEmail(claims.email) : null;
      let u = this.one('SELECT * FROM users WHERE google = ?', claims.sub);
      if (!u && email) { u = this.one('SELECT * FROM users WHERE email = ?', email); if (u) this.sql.exec('UPDATE users SET google = ? WHERE id = ?', claims.sub, u.id); }
      if (!u) {
        this.sql.exec('INSERT INTO users (email, google, created) VALUES (?, ?, ?)', email, claims.sub, Date.now());
        u = this.one('SELECT * FROM users WHERE google = ?', claims.sub);
      }
      this.sql.exec('UPDATE pending SET token = ? WHERE sid = ?', await this.session(u.id), sid);
      return page('Signed in', 'You can close this page and go back to Sixth Front.');
    }
    if (path === '/poll') {
      const sid = String(url.searchParams.get('sid') || '');
      const p = /^[0-9a-f]{32}$/.test(sid) && this.one('SELECT token FROM pending WHERE sid = ?', sid);
      if (!p || !p.token) return err('pending', 202);
      this.sql.exec('DELETE FROM pending WHERE sid = ?', sid);
      this.sql.exec('DELETE FROM pending WHERE created < ?', Date.now() - 60 * 60e3);
      const s = this.one('SELECT uid FROM sessions WHERE token = ?', await sha256(p.token));
      const u = s && this.one('SELECT * FROM users WHERE id = ?', s.uid);
      return u ? json(this.out(u, p.token)) : err('signed_out', 401);
    }
    return err('not_found', 404);
  }
}
