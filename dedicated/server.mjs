// Sixth Front dedicated servers: the game itself, run without a screen, hosts every public server
// (INFANTRY 1, TANKS 1, ... ALL-OUT 1 and 2) around the clock. Players who come in always join; nobody
// hosts on their own phone or PC, and a server keeps going when everyone has left.
//
//   node dedicated/server.mjs                 (the servers listed in SERVERS, default below)
//   SERVERS=aio-1,aio-2 node dedicated/server.mjs
//
// It builds the offline copy of the game (android/prepare-web.mjs) into dedicated/www, serves it on this machine
// only, and opens one headless Chromium page per server with ?dedicated=<server>. A page that crashes, hangs or
// stops hosting is reloaded. See dedicated/README.md for putting it on a cloud machine.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const www = join(here, 'www');
const PORT = +(process.env.PORT || 8790);
const SERVERS = (process.env.SERVERS || 'inf-1,tank-1,air-1,sea-1,aio-1,aio-2').split(',').map((s) => s.trim()).filter(Boolean);
const BAD = SERVERS.filter((s) => !/^(inf|tank|air|sea|aio)-([1-9]\d?)$/.test(s));
if (BAD.length) { console.error('unknown servers:', BAD.join(', ')); process.exit(1); }
const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace('T', ' '), ...a);

// ---------------------------------------------------------------- the game, served on this machine
// (the deploy workflow ships it ready built; from a checkout of the game it's built here)
if (!existsSync(join(www, 'index.html')) || process.env.BUILD === '1') {
  log('building the game');
  execFileSync(process.execPath, [join(root, 'android/prepare-web.mjs'), www], { stdio: 'inherit' });
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const http = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    let file = join(www, path || 'index.html');
    if (!file.startsWith(www)) throw new Error('outside');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise((ok) => http.listen(PORT, '127.0.0.1', ok));
log(`game served on 127.0.0.1:${PORT}`);

// ---------------------------------------------------------------- one page per server
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});
browser.on('disconnected', () => { log('the browser closed: exiting (systemd starts it again)'); process.exit(1); });

const SETTINGS = { quality: 'low', welcomed: true, tutorialDone: true, weather: 'clear', _t: Date.now() };
const rooms = new Map();
async function open(id) {
  const old = rooms.get(id);
  if (old) { try { await old.ctx.close(); } catch (e) { /* gone */ } }
  const ctx = await browser.newContext({ viewport: { width: 640, height: 360 } });
  await ctx.addInitScript((s) => {
    try { if (!localStorage.getItem('sixthfront.settings')) localStorage.setItem('sixthfront.settings', JSON.stringify(s.settings)); } catch (e) { /* ignore */ }
    // (MP_SERVER: another matchmaking server, for testing)
    try { if (s.server) localStorage.setItem('sixthfront.mp.server', s.server); } catch (e) { /* ignore */ }
  }, { settings: SETTINGS, server: process.env.MP_SERVER || '' });
  const page = await ctx.newPage();
  const r = { id, ctx, page, openedAt: Date.now(), okAt: Date.now(), last: '' };
  rooms.set(id, r);
  page.on('console', (m) => { if (m.type() === 'error') log(`[${id}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => log(`[${id}] page error: ${String(e && e.message).slice(0, 300)}`));
  page.on('crash', () => { log(`[${id}] crashed`); setTimeout(() => open(id), 3000); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?dedicated=${id}`, { timeout: 120000 }).catch((e) => log(`[${id}] load: ${e.message}`));
  log(`[${id}] opened`);
}
for (const id of SERVERS) { await open(id); await new Promise((ok) => setTimeout(ok, 4000)); }

// every 20 s: is each server hosting? (a page that hasn't for 3 minutes is reloaded)
setInterval(async () => {
  for (const r of rooms.values()) {
    let st = null;
    try { st = await r.page.evaluate(() => (window.__dedicated ? window.__dedicated() : null)); } catch (e) { st = null; }
    const t = Date.now();
    if (st && st.role === 'host') r.okAt = t;
    const line = st ? `${st.role || 'starting'} · ${st.players} player(s) · ${st.phase || '-'} · ${st.map || ''}` : 'not running';
    if (line !== r.last) { log(`[${r.id}] ${line}`); r.last = line; }
    if (t - r.okAt > 180000 && t - r.openedAt > 180000) { log(`[${r.id}] not hosting for 3 minutes: reloading`); r.openedAt = t; r.okAt = t; open(r.id); }
  }
}, 20000);

const stop = async () => { log('stopping'); try { await browser.close(); } catch (e) { /* ignore */ } process.exit(0); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
