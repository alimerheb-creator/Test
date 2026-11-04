// Sixth Front's public game servers, on Cloudflare Workers.
//
// The game itself still runs in the host player's game (the bots, the flags, the tickets); the servers pass
// everyone's state along, so players reach each other from any network, and keep the list of open games
// that every copy of the game sees. Each room is a Durable Object: one "lobby" where hosts advertise their
// games, and one per game, named after its 4-letter code.
//
//   GET /                      a status line
//   GET /v1/lobby              WebSocket: the list of open games
//   GET /v1/game/ABCD?host=1   WebSocket: host the game ABCD (or join it, without host=1)
//
// Messages are text. The page sends a channel letter and its whole state on that channel:
//   m{...}  the game's slow state (who is in, the score, ...)    f{...}  the fast state, ~15 times a second
//   l{...}  a lobby advert
// The server passes it to everyone else in the room as P<channel><sender's 8-letter id><state>, and sends
//   H{"id":..}  your id, first thing after you connect (then everyone's last state)
//   B<id>       that player left
//   E<code>     could not connect: taken (that code is hosted already), nogame, full, busy
// "ping" is answered "pong" without waking the room, to keep connections open through quiet spells.
import { DurableObject } from 'cloudflare:workers';

const MAX_GAME = 10;      // 8 players, and room for two of them coming back after a dropped connection
const MAX_LOBBY = 4000;
const MAX_MSG = 65536;
const MAX_RATE = 90;      // messages a second from one page
const ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ID_CHARS[b & 31]).join('');
const CORS = { 'access-control-allow-origin': '*' };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/v1') {
      return Response.json({ game: 'Sixth Front', servers: 'online', protocol: 1 }, { headers: CORS });
    }
    let room = '';
    if (url.pathname === '/v1/lobby') room = 'lobby';
    else {
      const m = /^\/v1\/game\/([A-Za-z]{4})$/.exec(url.pathname);
      if (m) room = 'game:' + m[1].toUpperCase();
    }
    if (!room) return new Response('Not found', { status: 404, headers: CORS });
    if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('This address takes a WebSocket', { status: 426, headers: CORS });
    }
    const fwd = new URL(req.url);
    fwd.searchParams.set('room', room);
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(new Request(fwd, req));
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.lobby = false;
    this.socks = new Map();  // id -> { ws, host, m, f, l, n, t }
    this.ids = new Map();    // ws -> id
    // back from hibernation: the connections are still open; their ids (and lobby adverts) were kept with them
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a || !a.id) continue;
      if (a.lobby) this.lobby = true;
      this.socks.set(a.id, { ws, host: !!a.host, m: '', f: '', l: a.l || '', n: 0, t: 0 });
      this.ids.set(ws, a.id);
    }
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(req) {
    const url = new URL(req.url);
    this.lobby = url.searchParams.get('room') === 'lobby';
    const host = !this.lobby && url.searchParams.get('host') === '1';
    const [client, server] = Object.values(new WebSocketPair());
    const refuse = (code) => {
      server.accept();
      server.send('E' + code);
      server.close(4000, code);
      return new Response(null, { status: 101, webSocket: client });
    };
    if (this.lobby) {
      if (this.socks.size >= MAX_LOBBY) return refuse('busy');
    } else {
      const hosted = [...this.socks.values()].some((s) => s.host);
      if (host && hosted) return refuse('taken');
      if (!host && !hosted) return refuse('nogame');
      if (this.socks.size >= MAX_GAME) return refuse('full');
    }
    // a page coming back after a dropped connection keeps its id, so the others see the same player
    let id = (url.searchParams.get('id') || '').slice(0, 8);
    if (id.length !== 8 || /[^a-z0-9]/.test(id) || this.socks.has(id)) id = newId();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, host: host ? 1 : 0, lobby: this.lobby ? 1 : 0 });
    this.socks.set(id, { ws: server, host, m: '', f: '', l: '', n: 0, t: 0 });
    this.ids.set(server, id);
    server.send('H' + JSON.stringify({ id, n: this.socks.size }));
    for (const [oid, o] of this.socks) {
      if (oid === id) continue;
      if (o.m) server.send('Pm' + oid + o.m);
      if (o.f) server.send('Pf' + oid + o.f);
      if (o.l) server.send('Pl' + oid + o.l);
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length < 3 || msg.length > MAX_MSG) return;
    const id = this.ids.get(ws), me = id && this.socks.get(id);
    if (!me) return;
    const t = Date.now();
    if (t - me.t > 1000) { me.t = t; me.n = 0; }
    if (++me.n > MAX_RATE) return;
    const c = msg[0];
    if (this.lobby ? c !== 'l' : c !== 'm' && c !== 'f') return;
    const body = msg.slice(1);
    me[c] = body;
    if (c === 'l' && body.length < 1800) ws.serializeAttachment({ id, host: 0, lobby: 1, l: body });
    const out = 'P' + c + id + body;
    for (const [oid, o] of this.socks) if (oid !== id) { try { o.ws.send(out); } catch (e) { /* closing */ } }
  }

  webSocketClose(ws, code) { this.drop(ws, code); }
  webSocketError(ws) { this.drop(ws, 1011); }

  drop(ws, code) {
    const id = this.ids.get(ws);
    this.ids.delete(ws);
    try { ws.close(code >= 1000 && code < 5000 && code !== 1005 && code !== 1006 ? code : 1000, 'bye'); } catch (e) { /* closed */ }
    const me = id && this.socks.get(id);
    if (!me) return;
    this.socks.delete(id);
    // in the lobby only someone who advertised a game is news
    if (this.lobby && !me.l) return;
    for (const o of this.socks.values()) { try { o.ws.send('B' + id); } catch (e) { /* closing */ } }
  }
}
