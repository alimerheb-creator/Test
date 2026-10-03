// Mod loader. A mod is a JSON file ("format": "sixthfront-mod") that patches the game's tables
// (weapons and their 3D models, gadgets, projectiles, classes, movement, rules, scoring, tanks, teams,
// AI skill, lighting, bot names), can build a whole new map, and can run a script with full access to
// the game through hooks, events and an action API.
// Every change is validated and clamped, and all mods are re-applied from a pristine snapshot, so
// turning a mod off always restores the original game. See MODDING.md for the format.
import * as THREE from 'three';
import {
  WEAPONS, GADGETS, PROJECTILES, CLASSES, CLASS_ORDER, MOVE, SCORE, DIFFICULTY, TEAMS,
  RULES, VEHICLES, ATMOSPHERE, BOT_NAMES, MAP, FLAGS, HQS, BUILDINGS, ROADS, TERRAIN, VEGETATION, MAP_PROPS, PLAY_HALF, WORLD_HALF,
  applyMapSize,
} from './config.js';
import { SHOT_SOUNDS } from './audio.js';
import { ATMOSPHERE_PRESETS } from './world.js';
import { Soldier } from './soldier.js';
import { BotBrain } from './ai.js';
import { yawTo, clamp } from './util.js';
import { Gun } from './weapons.js';

export const MOD_FORMAT = 'sixthfront-mod';
export const API_VERSION = 2;
const STORAGE_KEY = 'sixthfront.mods';      // before 1.9.1: one big entry holding every mod's text
const INDEX_KEY = 'sixthfront.modlist';     // which mods are installed, on or off, and their order (small)
const TEXT_PREFIX = 'sixthfront.modtext.';  // one entry per mod file, written only when the file changes
const STORE_PREFIX = 'sixthfront.moddata.';
const MAX_MOD_BYTES = 512 * 1024;
const MAX_CLASSES = 8;
const GUN_MODELS = ['ar', 'smg', 'lmg', 'sniper', 'pistol', 'shotgun'];
// How far from the centre map objects may go: the map's size can change, so these are read when used
const mapLimit = () => PLAY_HALF - 10;
const worldEdge = () => WORLD_HALF - 20;

// Where the mod list is kept. Switching a mod on or off only rewrites the small list, never the mod files:
// writing a couple of megabytes on every switch is what made browsers (and the Android app in particular)
// delay or drop saves, so mods came back switched off. The Android app also keeps everything in files on the
// phone (window.SixthFrontStore), which survive the app being closed straight after a change.
const KV = {
  nat: () => (typeof window !== 'undefined' && window.SixthFrontStore) || null,
  get(k) {
    const n = this.nat();
    if (n) { try { const v = n.get(k); if (typeof v === 'string') return v; } catch (e) { /* fall back */ } }
    try { return localStorage.getItem(k); } catch (e) { return null; }
  },
  set(k, v) {
    let ok = false;
    const n = this.nat();
    if (n) { try { ok = !!n.put(k, v); } catch (e) { /* fall back */ } }
    try { localStorage.setItem(k, v); ok = true; } catch (e) { /* storage full or blocked */ }
    return ok;
  },
  remove(k) {
    const n = this.nat();
    if (n) { try { n.remove(k); } catch (e) { /* gone */ } }
    try { localStorage.removeItem(k); } catch (e) { /* blocked */ }
  },
};
const parseJSON = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };

// ---------------------------------------------------------------- field schemas
const num = (min, max, int = false) => ({ t: 'num', min, max, int });
const bool = { t: 'bool' };
const str = (max = 40) => ({ t: 'str', max });
const color = { t: 'color' };          // stored as a number (0xrrggbb)
const colorStr = { t: 'colorStr' };    // stored as '#rrggbb'
const oneOf = (list) => ({ t: 'enum', list });
const pair = (min, max) => ({ t: 'pair', min, max });
const ref = (table) => ({ t: 'ref', table });
const coord = { t: 'coord' };          // a map position, kept inside the play area

const SCHEMA = {
  weapons: {
    name: str(28), kind: oneOf(['auto', 'semi', 'bolt']), rpm: num(1, 3000), dmg: pair(0, 1000), range: pair(0, 2000),
    mag: num(1, 1000, true), reserve: num(0, 9999, true), reload: num(0.1, 20), reloadEmpty: num(0.1, 20),
    reloadType: oneOf(['mag', 'box', 'shell']), shellTime: num(0.05, 5), shellStart: num(0, 5), openBolt: bool, cycleDelay: num(0, 3),
    spreadHip: num(0, 0.5), spreadAds: num(0, 0.5),
    bloom: num(0, 0.2), bloomMax: num(0, 0.5), recoil: pair(0, 0.5), adsFov: num(5, 90), adsTime: num(0.03, 2),
    head: num(1, 10), sound: oneOf(SHOT_SOUNDS), model: { t: 'model' }, scope: bool, botRange: num(5, 400),
    pellets: num(1, 20, true), tracer: color,
  },
  gadgets: {
    name: str(28), ammo: num(0, 99, true), reload: num(0, 60), recharge: num(0, 600), projectile: ref('projectiles'), adsFov: num(5, 90),
  },
  projectiles: {
    name: str(28), speed: num(1, 1000), gravity: num(0, 100), fuse: num(0.1, 30), bounce: num(0, 1), radius: num(0, 50),
    dmg: num(0, 5000), structural: num(0, 5000), veh: num(0, 10000), direct: num(0, 5000),
  },
  classes: {
    name: str(16), primary: ref('weapons'), secondary: ref('weapons'), gadget: ref('gadgets'), grenades: num(0, 10, true),
    blurb: str(160), fastRevive: bool, autoSpot: bool, hidden: bool,
  },
  movement: {
    walk: num(0.1, 40), sprint: num(0.1, 60), crouch: num(0.1, 40), prone: num(0.1, 20), adsMul: num(0.05, 2),
    jump: num(0, 40), accel: num(1, 400), airAccel: num(0, 400), slideSpeed: num(0, 60), slideTime: num(0, 5),
  },
  rules: {
    gravity: num(1, 60), playerHealth: num(1, 1000), regenDelay: num(0, 60), regenRate: num(0, 500), damageScale: num(0, 10),
    headshotScale: num(0, 10), explosionScale: num(0.1, 4), captureSpeed: num(0.1, 10), bleedSpeed: num(0, 10),
    reviveTime: num(0.2, 20), downedTime: num(1, 60), respawnTime: num(0.5, 60), spawnProtection: num(0, 10),
    fallDamage: bool, infiniteAmmo: bool, friendlyFire: bool, startTickets: num(0, 5000, true),
  },
  scoring: Object.fromEntries(Object.keys(SCORE).map((k) => [k, num(0, 100000, true)])),
  tank: {
    name: str(24), health: num(1, 100000), speed: num(0.5, 60), reverse: num(0, 40), turnRate: num(0.05, 6),
    turretSpeed: num(0.05, 10), reload: num(0.1, 60), botReload: num(0.1, 60), respawn: num(1, 600), perTeam: num(0, 2, true),
  },
  team: { name: str(16), helmet: color, top: color, pants: color, vest: color, tank: color },
  difficulty: { label: str(16), reaction: pair(0, 5), aimError: num(0, 1), turn: num(0.2, 30), spreadMul: num(0, 10), burst: pair(1, 50), dmgMul: num(0, 10) },
  atmosphere: {
    preset: oneOf(Object.keys(ATMOSPHERE_PRESETS)),
    skyTop: colorStr, horizon: colorStr, ground: colorStr, sunColor: colorStr, sunLight: colorStr, hemiSky: colorStr,
    hemiGround: colorStr, cloudColor: colorStr, cloudLit: colorStr,
    sunIntensity: num(0, 10), hemiIntensity: num(0, 5), fogNear: num(0, 2000), fogFar: num(10, 4000), clouds: num(0, 1),
    stars: num(0, 2), sunElevation: num(3, 89), sunAzimuth: num(-360, 360), exposure: num(0.2, 4), envIntensity: num(0, 3),
  },
  terrain: { seed: num(0, 1000000), hills: num(0, 4), bumps: num(0, 4), mountains: num(0, 3), valley: num(-5, 5), level: num(-80, 80) },
  vegetation: { trees: num(0, 3), bushes: num(0, 3), rocks: num(0, 3), grass: num(0, 2) },
  flag: { id: str(2), name: str(20), x: coord, z: coord, radius: num(5, 400), flat: num(10, 200), town: bool, height: num(4, 3000) },
  hq: { x: coord, z: coord, yaw: num(-360, 360) },
  prop: {
    type: oneOf(['container', 'barrier', 'sandbags', 'crate', 'wreck', 'ruin', 'block']), x: coord, z: coord,
    rot: num(-360, 360), color, y: num(-5, 40), size: { t: 'vec', n: 3, min: 0.2, max: 40 },
  },
};

// Custom weapon model parts
const PART = {
  shape: oneOf(['box', 'cylinder', 'sphere', 'cone']), size: { t: 'vec', n: 0, min: 0.001, max: 2 },
  pos: { t: 'vec', n: 3, min: -2, max: 2 }, rot: { t: 'vec', n: 3, min: -360, max: 360 },
  color, emissive: color, metal: num(0, 1), rough: num(0, 1), role: oneOf(['mag', 'bolt', 'slide', 'pump', 'cover']),
};
const MODEL = {
  sightY: num(-0.5, 0.5), sightZ: num(-1, 1), sight: oneOf(['reflex', 'none']), muzzle: { t: 'vec', n: 3, min: -3, max: 3 },
  grip: { t: 'vec', n: 3, min: -1, max: 1 }, fore: { t: 'vec', n: 3, min: -2, max: 2 }, offset: { t: 'vec', n: 3, min: -1, max: 1 },
  charge: { t: 'vec', n: 3, min: -2, max: 2 }, port: { t: 'vec', n: 3, min: -2, max: 2 }, boltTravel: num(0, 0.4),
  boltAction: bool, pose: oneOf(['rifle', 'pistol']),
};
const MAX_PARTS = 80;

function parseColor(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(0xffffff, Math.round(v)));
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/^#/, '').replace(/^0x/i, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return parseInt(s, 16);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Validates one field against its schema. Returns [ok, value, message]
function coerce(spec, value, path, tables, key) {
  const bad = (why) => [false, undefined, `${path}: ${why}`];
  switch (spec.t) {
    case 'num': {
      const n = Number(value);
      if (typeof value === 'boolean' || value === null || value === '' || !Number.isFinite(n)) return bad('expected a number');
      let v = Math.min(spec.max, Math.max(spec.min, n));
      if (spec.int) v = Math.round(v);
      return [true, v, v !== n ? `${path}: ${n} is outside ${spec.min}–${spec.max}, using ${v}` : null];
    }
    case 'coord': {
      const n = Number(value), lim = mapLimit();
      if (typeof value === 'boolean' || value === null || value === '' || !Number.isFinite(n)) return bad('expected a number');
      const v = Math.min(lim, Math.max(-lim, n));
      return [true, v, v !== n ? `${path}: ${n} is outside the map (±${lim}), using ${v}` : null];
    }
    case 'bool':
      if (typeof value !== 'boolean') return bad('expected true or false');
      return [true, value, null];
    case 'str':
      if (typeof value !== 'string' || !value.trim()) return bad('expected text');
      return [true, value.trim().slice(0, spec.max), null];
    case 'color': {
      const c = parseColor(value);
      return c === null ? bad('expected a colour like "#ff8800"') : [true, c, null];
    }
    case 'colorStr': {
      const c = parseColor(value);
      return c === null ? bad('expected a colour like "#ff8800"') : [true, '#' + c.toString(16).padStart(6, '0'), null];
    }
    case 'enum':
      if (!spec.list.includes(value)) return bad(`must be one of ${spec.list.join(', ')}`);
      return [true, value, null];
    case 'pair': {
      if (!Array.isArray(value) || value.length !== 2 || !value.every((x) => Number.isFinite(Number(x)))) return bad('expected two numbers like [25, 17]');
      return [true, value.map((x) => Math.min(spec.max, Math.max(spec.min, Number(x)))), null];
    }
    case 'vec': {
      const n = spec.n;
      if (!Array.isArray(value) || (n && value.length !== n) || (!n && (value.length < 1 || value.length > 3)) || !value.every((x) => Number.isFinite(Number(x)))) {
        return bad(n ? `expected ${n} numbers` : 'expected 1 to 3 numbers');
      }
      return [true, value.map((x) => Math.min(spec.max, Math.max(spec.min, Number(x)))), null];
    }
    case 'ref':
      if (typeof value !== 'string' || !tables[spec.table][value]) return bad(`unknown ${spec.table.replace(/s$/, '')} "${value}"`);
      return [true, value, null];
    case 'model':
      if (typeof value === 'string') {
        if (!GUN_MODELS.includes(value)) return bad(`must be one of ${GUN_MODELS.join(', ')}, or a custom model object`);
        return [true, value, null];
      }
      if (!isObj(value)) return bad('expected a model name or a custom model object');
      return coerceModel(value, path, key);
    default:
      return bad('unsupported field');
  }
}

function applyFields(target, patch, schema, path, tables, log, key) {
  if (!isObj(patch)) { log.push(`${path}: expected an object`); return; }
  for (const [field, value] of Object.entries(patch)) {
    if (field === 'base' || field.startsWith('_')) continue;
    const spec = schema[field];
    if (!spec) { log.push(`${path}.${field}: unknown setting (ignored)`); continue; }
    const [ok, v, msg] = coerce(spec, value, `${path}.${field}`, tables, key);
    if (msg) log.push(msg);
    if (ok) target[field] = v;
  }
}

// A custom first-person weapon model (see MODDING.md). Returns [ok, model, message]
let modelSerial = 0;
function coerceModel(value, path, key) {
  const log = [];
  const out = {
    sightY: 0.08, sightZ: -0.07, sight: 'reflex', muzzle: [0, 0.005, -0.6], grip: [0, -0.075, 0.07], fore: [0, -0.035, -0.3],
    offset: [0, 0, 0], charge: null, port: null, boltTravel: 0.07, boltAction: false, pose: 'rifle', parts: [],
  };
  applyFields(out, Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'parts')), MODEL, path, {}, log);
  const parts = Array.isArray(value.parts) ? value.parts : [];
  if (!parts.length) return [false, undefined, `${path}.parts: a custom model needs a list of parts`];
  if (parts.length > MAX_PARTS) log.push(`${path}.parts: only the first ${MAX_PARTS} parts are used`);
  parts.slice(0, MAX_PARTS).forEach((p, i) => {
    const part = { shape: 'box', size: [0.05, 0.05, 0.05], pos: [0, 0, 0], rot: [0, 0, 0], color: 0x2c2e31, metal: 0.2, rough: 0.6, emissive: null, role: null };
    applyFields(part, p, PART, `${path}.parts[${i}]`, {}, log);
    out.parts.push(part);
  });
  out.key = `mod:${key || 'gun'}:${++modelSerial}`;
  return [true, out, log.length ? log.join('; ') : null];
}

const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mod';
}

// Parse and sanity-check a mod file's text. Throws with a readable message.
export function parseMod(text) {
  if (typeof text !== 'string') throw new Error('Mod file is empty.');
  if (text.length > MAX_MOD_BYTES) throw new Error('Mod file is too large (max 512 KB).');
  let mod;
  try {
    mod = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(`Not valid JSON: ${e.message}`);
  }
  if (!isObj(mod)) throw new Error('A mod must be a JSON object.');
  if (mod.format && mod.format !== MOD_FORMAT) throw new Error(`Unknown format "${mod.format}" (expected "${MOD_FORMAT}").`);
  if (typeof mod.name !== 'string' || !mod.name.trim()) throw new Error('The mod needs a "name".');
  return mod;
}

const MAP_TABLES = () => ({ MAP, FLAGS, HQS, BUILDINGS, ROADS, TERRAIN, VEGETATION, MAP_PROPS });
const KNOWN_SECTIONS = new Set(['format', 'id', 'name', 'version', 'author', 'description', 'weapons', 'gadgets', 'projectiles', 'classes',
  'movement', 'rules', 'scoring', 'vehicles', 'teams', 'difficulty', 'atmosphere', 'botNames', 'map', 'script', 'battle', 'battles']);
// The base game's battle: infantry and tanks on the normal maps
export const NORMAL_BATTLE = 'normal';

// ---------------------------------------------------------------- manager
export class ModManager {
  constructor(game) {
    this.game = game;
    this.storageOk = true;
    this.pristine = {
      WEAPONS: clone(WEAPONS), GADGETS: clone(GADGETS), PROJECTILES: clone(PROJECTILES), CLASSES: clone(CLASSES),
      CLASS_ORDER: clone(CLASS_ORDER), MOVE: clone(MOVE), SCORE: clone(SCORE), DIFFICULTY: clone(DIFFICULTY),
      TEAMS: clone(TEAMS), RULES: clone(RULES), VEHICLES: clone(VEHICLES), ATMOSPHERE: clone(ATMOSPHERE), BOT_NAMES: clone(BOT_NAMES),
      MAP: clone(MAP_TABLES()),
    };
    this._resetResources();
    this.rev = 0;
    this.missing = [];
    this.list = this._load();
    // a list saved by an older version moves to the new layout once
    if (this.migrated) {
      this._save();
      if (this.storageOk) KV.remove(STORAGE_KEY);
    }
    this.appliedMapSig = null;
    // Mod timers and held keys run on game time
    game.on('tick', (dt) => this._tick(dt));
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
    window.addEventListener('blur', () => { for (const k of this.keys) if (k.down) { k.down = false; k.call(false); } });
    // Another copy of the game (a second tab, the same page opened twice) changed the mod list: take its
    // version, so this copy doesn't write its older list back over it the next time it saves
    window.addEventListener('storage', (e) => {
      if (e.key !== INDEX_KEY) return;
      const idx = parseJSON(e.newValue);
      if (idx && (idx.rev | 0) !== this.rev) this._syncFromStorage();
    });
  }

  _syncFromStorage() {
    const old = new Map(this.list.map((m) => [m.id, m]));
    const fresh = this._load(old);
    this.list = fresh.map((e) => {
      const o = old.get(e.id);
      if (o && o.text === e.text) { o.enabled = e.enabled; return o; }
      return e;
    });
    const ui = this.game.ui;
    if (ui) {
      if (ui.screens && ui.screens.mods && !ui.screens.mods.hidden) ui.renderModList();
      if (ui.updateModsButton) ui.updateModsButton();
      if (ui.renderBattles) ui.renderBattles();
    }
  }

  // switched-on mods (counting the ones waiting for another battle type)
  get activeCount() { return this.list.filter((m) => m.enabled && m.status !== 'error').length; }

  // known: mods already loaded (their text isn't read again unless it changed)
  _load(known) {
    this.missing = [];
    const idx = parseJSON(KV.get(INDEX_KEY));
    if (idx && Array.isArray(idx.mods)) {
      this.rev = idx.rev | 0;
      const out = [];
      let prev = null;
      for (const e of idx.mods) {
        if (!e || typeof e.id !== 'string') continue;
        const text = KV.get(TEXT_PREFIX + e.id);
        const after = prev;
        prev = e.id;
        if (typeof text !== 'string') { this.missing.push({ id: e.id, enabled: !!e.on, after }); continue; }
        const k = known && known.get(e.id);
        const entry = k && k.text === text ? { ...k, enabled: !!e.on } : this._entry(text, !!e.on);
        if (!entry) continue;
        entry.savedText = text;
        out.push(entry);
      }
      return out;
    }
    const arr = parseJSON(KV.get(STORAGE_KEY));
    if (!Array.isArray(arr)) return [];
    this.migrated = true;
    return arr.filter((e) => e && typeof e.text === 'string').map((e) => this._entry(e.text, !!e.enabled)).filter(Boolean);
  }

  _save() {
    let ok = true;
    for (const m of this.list) {
      if (m.savedText === m.text) continue;
      if (KV.set(TEXT_PREFIX + m.id, m.text)) m.savedText = m.text; else ok = false;
    }
    // mods whose file couldn't be read back stay listed, so a later start can still recover them
    const mods = this.list.map((m) => ({ id: m.id, on: !!m.enabled }));
    for (const x of this.missing) if (!mods.some((m) => m.id === x.id)) mods.splice(this._slot(mods, x.after), 0, { id: x.id, on: x.enabled });
    this.rev = (this.rev | 0) + 1;
    if (!KV.set(INDEX_KEY, JSON.stringify({ v: 2, rev: this.rev, mods }))) ok = false;
    this.storageOk = ok;
  }

  // where a mod goes back into a list: right after the one it followed
  _slot(list, after) {
    if (!after) return 0;
    const i = list.findIndex((m) => m.id === after);
    return i < 0 ? list.length : i + 1;
  }

  // A mod file that couldn't be read back (storage was full when it was saved): mods that ship with the game
  // are fetched again from the game's mods folder. Runs once at startup, before the battlefield is built.
  async recoverMissing() {
    if (!this.missing.length) return;
    let idx = null;
    try { const r = await fetch('mods/index.json'); if (r.ok) idx = await r.json(); } catch (e) { idx = null; }
    const files = idx && Array.isArray(idx.mods) ? idx.mods : [];
    for (const x of this.missing.slice()) {
      const f = files.find((m) => m && slugify(m.id || m.name) === x.id && typeof m.file === 'string' && /^[\w.-]+$/.test(m.file));
      if (!f) continue;
      try {
        const r = await fetch(`mods/${f.file}`);
        if (!r.ok) continue;
        const entry = this._entry(await r.text(), x.enabled);
        if (!entry || entry.id !== x.id) continue;
        this.list.splice(this._slot(this.list, x.after), 0, entry);
        this.missing = this.missing.filter((m) => m !== x);
      } catch (e) { /* offline: stays listed for next time */ }
    }
    this._save();
  }

  _entry(text, enabled) {
    try {
      const mod = parseMod(text);
      return {
        id: slugify(mod.id || mod.name), name: String(mod.name).slice(0, 48), version: String(mod.version || ''),
        author: String(mod.author || ''), description: String(mod.description || '').slice(0, 300),
        hasScript: !!mod.script, hasMap: mod.map !== undefined, enabled, text, mod, status: 'ok', messages: [], mapMessages: [],
        battle: this._battleInfo(mod), battles: Array.isArray(mod.battles) ? mod.battles.filter((b) => typeof b === 'string').map(slugify).slice(0, 8) : null,
      };
    } catch (e) {
      return null;
    }
  }

  // A "battle" section makes the mod a battle type of its own, picked on the main menu (see MODDING.md)
  _battleInfo(mod) {
    const b = mod.battle;
    if (!isObj(b)) return null;
    const txt = (v, n, d = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : d);
    return {
      name: txt(b.name, 16, String(mod.name).slice(0, 16)).toUpperCase(), tagline: txt(b.tagline, 240), blurb: txt(b.blurb, 60),
      order: Number.isFinite(+b.order) ? +b.order : 50,
      needs: Array.isArray(b.needs) ? b.needs.filter((x) => typeof x === 'string').map(slugify).slice(0, 8) : [],
    };
  }

  // The battle being played: the one picked on the main menu, if its mod is installed and switched on
  currentBattle() {
    const id = this.game.settings.battleType;
    if (!id || id === NORMAL_BATTLE) return NORMAL_BATTLE;
    const m = this.list.find((x) => x.id === id && x.battle);
    return m && m.enabled ? id : NORMAL_BATTLE;
  }

  battleEntry(id = this.currentBattle()) { return this.list.find((m) => m.id === id && m.battle) || null; }

  // Whether a switched-on mod takes part in this battle. A battle mod only runs in its own battle; a mod with
  // "battles" only in those (or when a battle needs it); map mods replace the normal battlefield, so they only
  // run in the normal battle; every other mod runs everywhere.
  _activeIn(m, battle) {
    if (!m.enabled) return false;
    if (m.battle) return m.id === battle;
    const b = this.battleEntry(battle);
    if (b && b.battle.needs.includes(m.id)) return true;
    if (m.battles) return m.battles.includes(battle);
    if (m.hasMap) return battle === NORMAL_BATTLE;
    return true;
  }

  // The order mods are applied in: the list order, except that battle mods come last
  _ordered() { return [...this.list.filter((m) => !m.battle), ...this.list.filter((m) => m.battle)]; }

  // Why a switched-on mod isn't running right now (shown on the MODS screen)
  _standbyText(m) {
    if (m.battle) return 'Waiting: pick this battle on the main menu to play it.';
    const names = (m.battles || [NORMAL_BATTLE]).map((id) => (id === NORMAL_BATTLE ? 'NORMAL' : (this.battleEntry(id) || { battle: { name: id.toUpperCase() } }).battle.name));
    return `Waiting: this mod only runs in ${names.join(' / ')} battles.`;
  }

  // Every change starts from the newest saved list, so a copy of the game that hasn't caught up with another
  // copy's changes can't save its older list over them
  _fresh() {
    const idx = parseJSON(KV.get(INDEX_KEY));
    if (idx && (idx.rev | 0) !== this.rev) this._syncFromStorage();
  }

  // Add (or replace) a mod from file text. Returns the entry; throws on invalid files.
  add(text) {
    parseMod(text);
    this._fresh();
    const entry = this._entry(text, true);
    const i = this.list.findIndex((m) => m.id === entry.id);
    if (i >= 0) { entry.enabled = this.list[i].enabled; this.list[i] = entry; }
    else this.list.push(entry);
    this._save();
    return entry;
  }

  remove(id) {
    this._fresh();
    this.list = this.list.filter((m) => m.id !== id);
    this.missing = this.missing.filter((m) => m.id !== id);
    this._save();
    KV.remove(TEXT_PREFIX + id);
  }

  setEnabled(id, on) {
    this._fresh();
    const m = this.list.find((x) => x.id === id);
    if (m) { m.enabled = on; this._save(); }
  }

  move(id, delta) {
    this._fresh();
    const i = this.list.findIndex((m) => m.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.list.length) return;
    [this.list[i], this.list[j]] = [this.list[j], this.list[i]];
    this._save();
  }

  // ---------------------------------------------------------------- maps
  _mapSig() {
    const battle = this.currentBattle();
    return JSON.stringify([battle, this.list.filter((m) => m.hasMap && this._activeIn(m, battle)).map((m) => m.mod.map)]);
  }

  // True when the enabled map mods differ from the map the world was built with
  mapChanged() { return this.appliedMapSig !== null && this._mapSig() !== this.appliedMapSig; }

  // Map sections are applied once, before the world is built
  applyMap() {
    const P = this.pristine.MAP;
    const battle = this.currentBattle();
    this.mapBattle = battle;
    const maps = this.list.filter((m) => m.hasMap && this._activeIn(m, battle));
    // the size goes first: everything else on the map is placed (and clamped) inside it
    applyMapSize(undefined);
    for (const m of maps) if (isObj(m.mod.map) && m.mod.map.size !== undefined) this._applySize(m.mod.map.size, []);
    Object.keys(MAP).forEach((k) => delete MAP[k]);
    Object.assign(MAP, clone(P.MAP));
    Object.assign(TERRAIN, clone(P.TERRAIN));
    Object.assign(VEGETATION, clone(P.VEGETATION));
    FLAGS.splice(0, FLAGS.length, ...clone(P.FLAGS));
    HQS.splice(0, HQS.length, ...clone(P.HQS));
    BUILDINGS.splice(0, BUILDINGS.length, ...clone(P.BUILDINGS));
    ROADS.splice(0, ROADS.length, ...clone(P.ROADS));
    MAP_PROPS.splice(0, MAP_PROPS.length, ...clone(P.MAP_PROPS));
    for (const m of this._ordered()) {
      m.mapMessages = [];
      if (!maps.includes(m)) continue;
      try { this._applyMap(m.mod.map, m.mapMessages); } catch (e) { m.mapMessages.push(`map: ${e.message}`); }
    }
    this.appliedMapSig = this._mapSig();
  }

  // map.size: { play, world, fine, inner } in metres (see MODDING.md)
  _applySize(size, log) {
    if (!isObj(size)) { log.push('map.size: expected an object like { "play": 600 }'); return; }
    for (const k of Object.keys(size)) if (!['play', 'world', 'fine', 'inner'].includes(k)) log.push(`map.size.${k}: unknown setting (ignored)`);
    applyMapSize(size);
  }

  _applyMap(map, log) {
    if (!isObj(map)) { log.push('map: expected an object'); return; }
    const known = ['name', 'flags', 'hq', 'buildings', 'addBuildings', 'roads', 'props', 'randomProps', 'terrain', 'vegetation', 'size', 'water', 'islands'];
    if (map.size !== undefined && !isObj(map.size)) log.push('map.size: expected an object like { "play": 600 }');
    if (map.water !== undefined) {
      if (map.water === null) TERRAIN.water = null;
      else {
        const [ok, v, msg] = coerce(num(-60, 60), map.water, 'map.water');
        if (msg) log.push(msg);
        if (ok) TERRAIN.water = v;
      }
    }
    if (map.islands !== undefined) {
      if (!Array.isArray(map.islands)) log.push('map.islands: expected a list of [x, z, radius, height]');
      else {
        const lim = worldEdge();
        TERRAIN.islands = map.islands.slice(0, 40).filter((s, i) => {
          const ok = Array.isArray(s) && s.length === 4 && s.every((x) => Number.isFinite(Number(x)));
          if (!ok) log.push(`map.islands[${i}]: expected [x, z, radius, height]`);
          return ok;
        }).map(([x, z, r, h]) => [clamp(+x, -lim, lim), clamp(+z, -lim, lim), clamp(+r, 10, 1500), clamp(+h, -60, 120)]);
      }
    }
    for (const k of Object.keys(map)) if (!known.includes(k) && !k.startsWith('_')) log.push(`map.${k}: unknown setting (ignored)`);
    if (map.name !== undefined) {
      const [ok, v, msg] = coerce(str(24), map.name, 'map.name');
      if (msg) log.push(msg);
      if (ok) MAP.name = v.toUpperCase();
    }
    if (map.randomProps !== undefined) {
      if (typeof map.randomProps === 'boolean') MAP.randomProps = map.randomProps; else log.push('map.randomProps: expected true or false');
    }
    if (map.terrain !== undefined) applyFields(TERRAIN, map.terrain, SCHEMA.terrain, 'map.terrain', {}, log);
    if (map.vegetation !== undefined) applyFields(VEGETATION, map.vegetation, SCHEMA.vegetation, 'map.vegetation', {}, log);
    if (map.flags !== undefined) {
      if (!Array.isArray(map.flags)) log.push('map.flags: expected a list (use [] for team deathmatch)');
      else {
        if (map.flags.length > 8) log.push('map.flags: at most 8 flags, extra ones ignored');
        const flags = [];
        map.flags.slice(0, 8).forEach((f, i) => {
          const id = String.fromCharCode(65 + i);
          const out = { id, name: `POINT ${id}`, x: 0, z: 0, radius: 13, flat: 0, town: false };
          applyFields(out, f, SCHEMA.flag, `map.flags[${i}]`, {}, log);
          out.id = out.id.toUpperCase();
          if (!out.flat) out.flat = Math.max(out.radius * 3.4, out.radius + 20);
          if (!f || f.x === undefined || f.z === undefined) { log.push(`map.flags[${i}]: needs "x" and "z"`); return; }
          flags.push(out);
        });
        FLAGS.splice(0, FLAGS.length, ...flags);
      }
    }
    if (map.hq !== undefined) {
      if (!Array.isArray(map.hq) || map.hq.length !== 2) log.push('map.hq: expected a list of two HQs (yours first)');
      else map.hq.forEach((h, i) => {
        const out = { x: HQS[i].x, z: HQS[i].z, yaw: null };
        applyFields(out, h, SCHEMA.hq, `map.hq[${i}]`, {}, log);
        HQS[i] = { x: out.x, z: out.z, yaw: out.yaw === null ? yawTo(-out.x, -out.z) : (out.yaw * Math.PI) / 180 };
      });
    }
    const building = (b, path) => {
      if (!Array.isArray(b) || b.length < 4 || !b.slice(0, 5).every((x) => Number.isFinite(Number(x)))) {
        log.push(`${path}: expected [x, z, width, depth, floors]`);
        return null;
      }
      const [x, z, w, d, f = 1] = b.map(Number);
      const lim = mapLimit();
      return [clamp(x, -lim, lim), clamp(z, -lim, lim), clamp(Math.round(w), 2, 8), clamp(Math.round(d), 2, 8), clamp(Math.round(f), 1, 5)];
    };
    for (const key of ['buildings', 'addBuildings']) {
      if (map[key] === undefined) continue;
      if (!Array.isArray(map[key])) { log.push(`map.${key}: expected a list`); continue; }
      const list = map[key].slice(0, 80).map((b, i) => building(b, `map.${key}[${i}]`)).filter(Boolean);
      if (key === 'buildings') BUILDINGS.splice(0, BUILDINGS.length, ...list);
      else BUILDINGS.push(...list.slice(0, Math.max(0, 80 - BUILDINGS.length)));
    }
    if (map.roads !== undefined) {
      if (!Array.isArray(map.roads)) log.push('map.roads: expected a list of roads');
      else {
        const roads = [];
        map.roads.slice(0, 16).forEach((r, i) => {
          const pts = Array.isArray(r) ? r.filter((p) => Array.isArray(p) && p.length === 2 && p.every((x) => Number.isFinite(Number(x)))) : [];
          if (pts.length < 2) { log.push(`map.roads[${i}]: a road needs at least two [x, z] points`); return; }
          const e = worldEdge();
          roads.push(pts.slice(0, 40).map(([x, z]) => [clamp(+x, -e, e), clamp(+z, -e, e)]));
        });
        ROADS.splice(0, ROADS.length, ...roads);
      }
    }
    if (map.props !== undefined) {
      if (!Array.isArray(map.props)) log.push('map.props: expected a list');
      else {
        if (map.props.length > 400) log.push('map.props: only the first 400 props are used');
        const props = [];
        map.props.slice(0, 400).forEach((p, i) => {
          const out = { type: null, x: 0, z: 0, rot: 0, color: null, y: 0, size: null };
          applyFields(out, p, SCHEMA.prop, `map.props[${i}]`, {}, log);
          if (!out.type) { log.push(`map.props[${i}]: needs a "type"`); return; }
          out.rot = Math.round(out.rot / 90) % 2 !== 0;
          props.push(out);
        });
        MAP_PROPS.splice(0, MAP_PROPS.length, ...props);
      }
    }
  }

  // ---------------------------------------------------------------- applying
  _resetResources() {
    this.handlers = [];   // [event, fn]
    this.filters = [];    // [name, fn]
    this.timers = [];
    this.keys = [];
    this.models = [];
    this.widgets = new Map();
    this.cleanups = [];   // api.onDisable callbacks
  }

  // Put every table back exactly as the base game shipped it, and undo everything scripts created
  _restore() {
    const P = this.pristine, g = this.game;
    // Scripts undo their own changes first, while the game is still as they left it
    for (const fn of (this.cleanups || []).slice().reverse()) fn();
    for (const [table, src] of [[WEAPONS, P.WEAPONS], [GADGETS, P.GADGETS], [PROJECTILES, P.PROJECTILES], [CLASSES, P.CLASSES],
      [MOVE, P.MOVE], [SCORE, P.SCORE], [RULES, P.RULES], [VEHICLES, P.VEHICLES], [ATMOSPHERE, P.ATMOSPHERE]]) {
      for (const k of Object.keys(table)) delete table[k];
      Object.assign(table, clone(src));
    }
    for (const k of Object.keys(DIFFICULTY)) Object.assign(DIFFICULTY[k], clone(P.DIFFICULTY[k]));
    TEAMS.forEach((t, i) => Object.assign(t, clone(P.TEAMS[i])));
    CLASS_ORDER.splice(0, CLASS_ORDER.length, ...P.CLASS_ORDER);
    BOT_NAMES.splice(0, BOT_NAMES.length, ...P.BOT_NAMES);
    for (const [ev, fn] of this.handlers) g.off(ev, fn);
    for (const [name, fn] of this.filters) g.removeFilter(name, fn);
    for (const k of this.keys) if (k.btn) k.btn.remove();
    for (const m of this.models) m.remove();
    for (const el of this.widgets.values()) el.remove();
    this._resetResources();
    g.timeScale = 1;
  }

  // Re-apply all enabled mods in list order (later mods win). Map sections were applied at startup.
  applyAll() {
    this._restore();
    const battle = this.currentBattle();
    this.battle = battle;
    for (const m of this._ordered()) {
      m.messages = [...(m.mapMessages || [])];
      if (!m.enabled) { m.status = 'off'; continue; }
      if (!this._activeIn(m, battle)) { m.status = 'standby'; m.messages = [this._standbyText(m)]; continue; }
      try {
        this._apply(m);
        m.status = m.messages.length ? 'warn' : 'ok';
      } catch (e) {
        m.status = 'error';
        m.messages.push(e.message);
      }
    }
    this._layoutKeys();
    return this.list;
  }

  _apply(entry) {
    const mod = entry.mod, log = entry.messages;
    const tables = { weapons: WEAPONS, gadgets: GADGETS, projectiles: PROJECTILES, classes: CLASSES };
    const keyed = (section, table, schema, onCreate, onPatched) => {
      const patches = mod[section];
      if (patches === undefined) return;
      if (!isObj(patches)) { log.push(`${section}: expected an object`); return; }
      for (const [key, patch] of Object.entries(patches)) {
        if (key.startsWith('_')) continue;
        if (!KEY_RE.test(key)) { log.push(`${section}.${key}: ids must be lowercase letters, digits or _ (max 24)`); continue; }
        let target = table[key];
        if (!target) {
          const base = patch && table[patch.base];
          if (!base) { log.push(`${section}.${key}: new entries need "base" set to an existing one (${Object.keys(table).join(', ')})`); continue; }
          target = clone(base);
          if (onCreate) onCreate(target, key, patch.base);
          table[key] = target;
        }
        const before = { ...target };
        applyFields(target, patch, schema, `${section}.${key}`, tables, log, key);
        if (onPatched) onPatched(target, patch, before);
      }
    };
    keyed('projectiles', PROJECTILES, SCHEMA.projectiles, (t, key, base) => { t.behavior = t.behavior || base; });
    keyed('weapons', WEAPONS, SCHEMA.weapons, (t, key) => { t.id = key; }, (t, patch, before) => {
      // A new tactical reload time keeps the empty reload in proportion unless that's set too
      if (patch.reload !== undefined && patch.reloadEmpty === undefined && before.reloadEmpty) {
        t.reloadEmpty = +(t.reload * (before.reloadEmpty / before.reload)).toFixed(2);
      }
      if (patch.reloadType === 'box' && patch.openBolt === undefined) t.openBolt = true;
      if (patch.reloadType && patch.reloadType !== 'box' && patch.openBolt === undefined) t.openBolt = false;
    });
    keyed('gadgets', GADGETS, SCHEMA.gadgets);
    keyed('classes', CLASSES, SCHEMA.classes, (t, key) => { t.id = key; });
    // class order: new classes are appended, hidden ones removed (at least one must remain)
    for (const key of Object.keys(mod.classes || {})) {
      const c = CLASSES[key];
      if (!c) continue;
      const i = CLASS_ORDER.indexOf(key);
      if (c.hidden && i >= 0 && CLASS_ORDER.length > 1) CLASS_ORDER.splice(i, 1);
      else if (!c.hidden && i < 0) {
        if (CLASS_ORDER.length < MAX_CLASSES) CLASS_ORDER.push(key);
        else log.push(`classes.${key}: at most ${MAX_CLASSES} classes can be shown`);
      }
    }

    const flat = (section, target, schema) => { if (mod[section] !== undefined) applyFields(target, mod[section], schema, section, tables, log); };
    flat('movement', MOVE, SCHEMA.movement);
    flat('rules', RULES, SCHEMA.rules);
    flat('scoring', SCORE, SCHEMA.scoring);
    if (mod.vehicles !== undefined) {
      if (isObj(mod.vehicles)) {
        for (const k of Object.keys(mod.vehicles)) if (k !== 'tank') log.push(`vehicles.${k}: only "tank" is supported`);
        if (mod.vehicles.tank !== undefined) applyFields(VEHICLES.tank, mod.vehicles.tank, SCHEMA.tank, 'vehicles.tank', tables, log);
      } else log.push('vehicles: expected an object');
    }
    if (mod.teams !== undefined) {
      if (!Array.isArray(mod.teams)) log.push('teams: expected a list of up to two teams');
      else mod.teams.slice(0, 2).forEach((t, i) => { if (t) applyFields(TEAMS[i], t, SCHEMA.team, `teams[${i}]`, tables, log); });
    }
    if (mod.difficulty !== undefined) {
      for (const [k, patch] of Object.entries(mod.difficulty || {})) {
        if (!DIFFICULTY[k]) { log.push(`difficulty.${k}: use easy, normal or hard`); continue; }
        applyFields(DIFFICULTY[k], patch, SCHEMA.difficulty, `difficulty.${k}`, tables, log);
      }
    }
    if (mod.atmosphere !== undefined) {
      const next = {};
      applyFields(next, mod.atmosphere, SCHEMA.atmosphere, 'atmosphere', tables, log);
      if (next.preset) for (const k of Object.keys(ATMOSPHERE)) delete ATMOSPHERE[k];
      Object.assign(ATMOSPHERE, next);
    }
    if (mod.botNames !== undefined) {
      const names = Array.isArray(mod.botNames) ? mod.botNames.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim().slice(0, 16)) : [];
      if (names.length >= 4) BOT_NAMES.splice(0, BOT_NAMES.length, ...names);
      else log.push('botNames: need a list of at least 4 names');
    }
    if (mod.script !== undefined) this._runScript(entry, Array.isArray(mod.script) ? mod.script.join('\n') : mod.script);
    for (const k of Object.keys(mod)) if (!KNOWN_SECTIONS.has(k) && !k.startsWith('_')) log.push(`${k}: unknown section (ignored)`);
  }

  _runScript(entry, code) {
    if (typeof code !== 'string') { entry.messages.push('Script: "script" must be text or a list of lines'); return; }
    const api = this._api(entry);
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('api', 'THREE', `"use strict";\n${code}`);
      fn(api, THREE);
    } catch (e) {
      entry.messages.push(`Script could not run: ${e.message}`);
    }
  }

  // ---------------------------------------------------------------- timers & keys
  _tick(dt) {
    if (!this.timers.length) return;
    const now = this.game.time;
    for (const t of this.timers.slice()) {
      if (t.dead || now < t.at) continue;
      if (t.every > 0) t.at = now + t.every; else t.dead = true;
      t.call();
    }
    this.timers = this.timers.filter((t) => !t.dead);
  }

  _key(e, down) {
    if (!this.keys.length || e.repeat) return;
    const g = this.game;
    if (down && g.state !== 'playing') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    for (const k of this.keys) {
      if (k.code !== e.code || k.down === down) continue;
      k.down = down;
      k.call(down);
    }
  }

  // Touch buttons for keys that mods bind, stacked on the left edge
  _layoutKeys() {
    const touch = document.getElementById('touch');
    let col = document.getElementById('t-mods');
    if (!col && touch) {
      col = document.createElement('div');
      col.id = 't-mods';
      touch.appendChild(col);
    }
    if (col) col.hidden = !this.keys.some((k) => k.btn);
  }

  // ---------------------------------------------------------------- script API
  _api(entry) {
    const g = this.game, mgr = this;
    let reported = false;
    const report = (e) => {
      if (reported) return;
      reported = true;
      console.warn(`[mod ${entry.name}]`, e);
      g.hud && g.hud.toast(`MOD ERROR: ${entry.name}`);
      entry.messages.push(`Script error: ${e && e.message ? e.message : e}`);
      if (entry.status === 'ok') entry.status = 'warn';
    };
    const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { report(e); return undefined; } };
    const fnCheck = (fn, what) => { if (typeof fn !== 'function') throw new Error(`${what} needs a function`); };
    const V = (x, y, z) => (Array.isArray(x) ? new THREE.Vector3(+x[0] || 0, +x[1] || 0, +x[2] || 0)
      : x && typeof x === 'object' ? new THREE.Vector3(+x.x || 0, +x.y || 0, +x.z || 0) : new THREE.Vector3(+x || 0, +y || 0, +z || 0));
    const isSoldier = (s) => s && g.soldiers.includes(s);
    const storeKey = STORE_PREFIX + entry.id;
    let store = {};
    try { store = JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; } catch (e) { store = {}; }
    const hudLayer = () => {
      let el = document.getElementById('mod-hud');
      if (!el) {
        el = document.createElement('div');
        el.id = 'mod-hud';
        (document.getElementById('hud') || document.body).appendChild(el);
      }
      return el;
    };
    const widget = (id, cls) => {
      const key = `${entry.id}:${id}`;
      let el = mgr.widgets.get(key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'mod-w ' + cls;
        hudLayer().appendChild(el);
        mgr.widgets.set(key, el);
      }
      return el;
    };
    const place = (el, o = {}) => {
      const s = el.style;
      s.left = o.x !== undefined ? `${clamp(+o.x, 0, 100)}%` : '';
      s.top = o.y !== undefined ? `${clamp(+o.y, 0, 100)}%` : '';
      s.color = o.color ? '#' + (parseColor(o.color) ?? 0xffffff).toString(16).padStart(6, '0') : '';
      s.fontSize = o.size ? `${clamp(+o.size, 0.4, 4)}rem` : '';
      s.textAlign = o.align || '';
    };
    const MATS = {};
    const modelMat = (p) => {
      const c = parseColor(p.color) ?? 0x888888, e = p.emissive !== undefined ? parseColor(p.emissive) : null;
      const k = `${c}|${e}|${p.metal}|${p.rough}|${p.opacity}`;
      if (!MATS[k]) {
        MATS[k] = new THREE.MeshStandardMaterial({
          color: c, emissive: e ?? 0, emissiveIntensity: e !== null ? 2 : 0, metalness: clamp(+p.metal || 0, 0, 1), roughness: clamp(p.rough ?? 0.8, 0, 1),
          transparent: p.opacity !== undefined && p.opacity < 1, opacity: clamp(p.opacity ?? 1, 0.05, 1),
        });
      }
      return MATS[k];
    };

    const api = {
      version: API_VERSION,
      game: g,
      THREE,
      config: {
        WEAPONS, GADGETS, PROJECTILES, CLASSES, CLASS_ORDER, MOVE, SCORE, DIFFICULTY, TEAMS, RULES, VEHICLES, ATMOSPHERE, BOT_NAMES,
        MAP, FLAGS, HQS, BUILDINGS, ROADS, TERRAIN, VEGETATION,
      },
      rules: RULES,
      mod: { id: entry.id, name: entry.name, version: entry.version },

      // ---- events and hooks
      on(event, fn) {
        if (typeof event !== 'string') throw new Error('api.on needs an event name');
        fnCheck(fn, 'api.on');
        const wrapped = (data) => { try { fn(data); } catch (e) { report(e); } };
        g.on(event, wrapped);
        mgr.handlers.push([event, wrapped]);
        return wrapped;
      },
      off(event, fn) {
        g.off(event, fn);
        mgr.handlers = mgr.handlers.filter(([e, f]) => !(e === event && f === fn));
      },
      filter(name, fn) {
        if (typeof name !== 'string') throw new Error('api.filter needs a hook name');
        fnCheck(fn, 'api.filter');
        const wrapped = (data) => { try { return fn(data); } catch (e) { report(e); return undefined; } };
        g.addFilter(name, wrapped);
        mgr.filters.push([name, wrapped]);
        return wrapped;
      },
      after(seconds, fn) {
        fnCheck(fn, 'api.after');
        const t = { at: g.time + Math.max(0, +seconds || 0), every: 0, call: () => { try { fn(); } catch (e) { report(e); } } };
        mgr.timers.push(t);
        return t;
      },
      every(seconds, fn) {
        fnCheck(fn, 'api.every');
        const iv = Math.max(0.02, +seconds || 0);
        const t = { at: g.time + iv, every: iv, call: () => { try { fn(); } catch (e) { report(e); } } };
        mgr.timers.push(t);
        return t;
      },
      cancel(timer) { if (timer) timer.dead = true; },
      // Runs when the mod is switched off or the mod list is re-applied: undo anything done through api.game
      onDisable(fn) {
        fnCheck(fn, 'api.onDisable');
        mgr.cleanups.push(() => { try { fn(); } catch (e) { report(e); } });
      },

      // ---- information
      player: () => g.player,
      soldiers: () => g.soldiers.slice(),
      alive: (team) => g.soldiers.filter((s) => s.state === 'alive' && (team === undefined || s.team === team)),
      vehicles: () => g.vehicles.filter((v) => v.exists),
      flags: () => g.mode.flags,
      tickets: () => g.mode.tickets.slice(),
      time: () => g.time,
      state: () => g.state,
      battle: () => mgr.battle || NORMAL_BATTLE,
      mapSize: () => ({ play: PLAY_HALF, world: WORLD_HALF }),
      water: () => g.world.water,
      heightAt: (x, z) => g.world.heightAt(+x, +z),
      vec: V,
      raycast(from, dir, maxDist = 500, opts = {}) {
        const o = V(from), d = V(dir).normalize();
        const w = g.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, +maxDist || 500);
        let best = w.hit ? w.t : +maxDist || 500, soldier = null, vehicle = null;
        const res = { hit: w.hit, terrain: w.terrain, normal: { x: w.nx, y: w.ny, z: w.nz } };
        for (const s of g.soldiers) {
          if (s.state !== 'alive' || s.vehicle || s === opts.ignore) continue;
          const t = s.rayHit(o.x, o.y, o.z, d.x, d.y, d.z, best);
          if (t < best) { best = t; soldier = s; vehicle = null; }
        }
        for (const v of g.vehicles) {
          if (!v.alive || v === opts.ignore) continue;
          const t = v.rayHit(o.x, o.y, o.z, d.x, d.y, d.z, best);
          if (t < best) { best = t; vehicle = v; soldier = null; }
        }
        return { ...res, hit: res.hit || !!soldier || !!vehicle, distance: best, soldier, vehicle, x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best };
      },

      // ---- messages and score
      toast: (msg) => g.hud && g.hud.toast(String(msg).slice(0, 80)),
      banner: (msg, col) => g.hud && g.hud.banner(String(msg).slice(0, 60), col),
      award: (soldier, points, label) => g.mode.award(soldier, Math.round(+points || 0), String(label || 'MOD BONUS').slice(0, 32)),
      log: (...a) => console.log(`[mod ${entry.name}]`, ...a),

      // ---- soldiers
      teleport(s, x, y, z) {
        if (!isSoldier(s)) return;
        const p = V(x, y, z);
        const ground = x && typeof x === 'object' ? (Array.isArray(x) ? x.length < 3 : x.y === undefined) : y === undefined || y === null;
        if (ground) p.y = g.world.heightAt(p.x, p.z) + 0.05;
        if (s.vehicle) s.vehicle.removeDriver(s, true);
        s.pos.copy(p);
        s.vel.set(0, 0, 0);
      },
      push(s, vx, vy, vz) { if (isSoldier(s)) { s.vel.add(V(vx, vy, vz)); if (s.vel.y > 0) s.onGround = false; } },
      setVelocity(s, vx, vy, vz) { if (isSoldier(s)) { s.vel.copy(V(vx, vy, vz)); if (s.vel.y > 0) s.onGround = false; } },
      heal(s, n) { if (isSoldier(s) && s.state === 'alive') s.health = Math.min(s.maxHealth, s.health + Math.max(0, +n || 0)); },
      setHealth(s, n) { if (isSoldier(s) && s.state === 'alive') { s.health = clamp(+n || 0, 1, 100000); } },
      damage(s, n, attacker = null, weapon = 'MOD') {
        if (!isSoldier(s)) return false;
        return s.takeDamage(Math.max(0, +n || 0), attacker, { weapon: String(weapon).slice(0, 24), force: true });
      },
      kill(s, attacker = null, weapon = 'MOD', revivable = false) {
        if (!isSoldier(s) || s.state !== 'alive') return;
        s.takeDamage(1e6, attacker, { weapon: String(weapon).slice(0, 24), force: true, noRevive: !revivable });
      },
      revive(s, by = null) { if (isSoldier(s) && s.state === 'downed') s.revive(by); },
      setClass(s, id) {
        if (!isSoldier(s) || !CLASSES[id]) return false;
        s.setClass(id);
        s.refill(true);
        if (s === g.player && g.playerCtl.s === s) g.playerCtl._setVM();
        return true;
      },
      giveWeapon(s, slot, id) {
        if (!isSoldier(s) || !WEAPONS[id] || (slot !== 0 && slot !== 1)) return false;
        s.guns[slot] = new Gun(WEAPONS[id]);
        if (s === g.player && g.playerCtl.s === s) g.playerCtl._setVM();
        return true;
      },
      setGadget(s, id) {
        if (!isSoldier(s) || !GADGETS[id]) return false;
        s.gadget = GADGETS[id];
        s.gadgetAmmo = s.gadget.ammo;
        s.gadgetCd = 0;
        if (s === g.player && g.playerCtl.s === s) g.playerCtl._setVM();
        return true;
      },
      refillAmmo(s) { if (isSoldier(s)) s.refill(true); },
      spawnBot(team = 1, opts = {}) {
        team = team === 0 ? 0 : 1;
        if (g.soldiers.length >= 96) return null;
        const classId = CLASSES[opts.classId] ? opts.classId : CLASS_ORDER[Math.floor(Math.random() * CLASS_ORDER.length)];
        const name = String(opts.name || BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]).slice(0, 16);
        const squad = 100 + g.soldiers.length;
        const s = new Soldier(g, { team, name, squad, classId });
        new BotBrain(g, s);
        g.soldiers.push(s);
        if (opts.x !== undefined && opts.z !== undefined) {
          const x = clamp(+opts.x, -PLAY_HALF, PLAY_HALF), z = clamp(+opts.z, -PLAY_HALF, PLAY_HALF);
          s.spawn(x, g.world.heightAt(x, z) + 0.05, z, yawTo(-x, -z));
        } else g.mode.respawnBot(s);
        return s;
      },
      removeBot(s) {
        if (!isSoldier(s) || s.isPlayer) return;
        if (s.vehicle) s.vehicle.removeDriver(s, true);
        s.dispose();
        g.soldiers.splice(g.soldiers.indexOf(s), 1);
      },

      // ---- match
      setTickets(team, n) { if (team === 0 || team === 1) g.mode.tickets[team] = Math.max(0, +n || 0); },
      endMatch(winner) { if (winner === 0 || winner === 1) g.mode._end(winner); },
      setTimeScale(k) { g.timeScale = clamp(+k || 1, 0.05, 4); },
      timeScale: () => g.timeScale,
      setAtmosphere(opts) {
        const next = {};
        const log = [];
        applyFields(next, opts, SCHEMA.atmosphere, 'setAtmosphere', {}, log);
        if (log.length) report(new Error(log.join('; ')));
        if (next.preset) for (const k of Object.keys(ATMOSPHERE)) delete ATMOSPHERE[k];
        Object.assign(ATMOSPHERE, next);
        const atm = g.world.applyAtmosphere(ATMOSPHERE);
        g.exposure = atm.exposure;
        g.renderer.toneMappingExposure = atm.exposure;
        if (g.post) g.post.setExposure(atm.exposure);
        g.playerCtl.setViewmodelLight(atm.viewmodelLight ?? 1);
      },

      // ---- combat
      explode(x, y, z, opts = {}) {
        if (typeof x === 'object') { opts = y || {}; ({ x, y, z } = x); }
        const def = {
          name: String(opts.name || 'EXPLOSION').slice(0, 24), radius: clamp(+(opts.radius ?? 5), 0.5, 50), dmg: clamp(+(opts.damage ?? 120), 0, 5000),
          structural: clamp(+(opts.structural ?? 150), 0, 5000), veh: clamp(+(opts.vehicle ?? 150), 0, 10000),
        };
        if (opts.size !== undefined) def.fxScale = clamp(+opts.size, 0.1, 3);
        g.combat.explode(+x, +y, +z, def, isSoldier(opts.owner) ? opts.owner : null);
      },
      projectile(type, owner, pos, dir, speed) {
        if (!PROJECTILES[type] || !isSoldier(owner)) return null;
        const d = V(dir).normalize();
        const p = g.combat.launch(type, owner, V(pos), d);
        if (p && speed !== undefined) p.vel.copy(d).multiplyScalar(clamp(+speed, 0, 1000));
        return p;
      },
      fire(s) {
        if (!isSoldier(s) || s.state !== 'alive' || !s.gun) return false;
        return g.combat.fireGun(s, s.forward(new THREE.Vector3()), s.gun.def.spreadAds);
      },

      // ---- world, models and effects
      addModel(parts, pos, opts = {}) {
        if (!Array.isArray(parts) || !parts.length) throw new Error('api.addModel needs a list of parts');
        if (mgr.models.length >= 400) throw new Error('api.addModel: too many models (400)');
        const group = new THREE.Group();
        for (const p of parts.slice(0, 200)) {
          const s = Array.isArray(p.size) ? p.size.map((v) => clamp(+v || 0.1, 0.01, 200)) : [1, 1, 1];
          let geo;
          if (p.shape === 'sphere') geo = new THREE.SphereGeometry(s[0], 16, 12);
          else if (p.shape === 'cylinder') geo = new THREE.CylinderGeometry(s[0], s.length > 2 ? s[1] : s[0], s[s.length - 1] || 1, 16);
          else if (p.shape === 'cone') geo = new THREE.ConeGeometry(s[0], s[1] || 1, 16);
          else geo = new THREE.BoxGeometry(s[0], s[1] ?? s[0], s[2] ?? s[0]);
          const m = new THREE.Mesh(geo, modelMat(p));
          const at = Array.isArray(p.pos) ? p.pos : [0, 0, 0], r = Array.isArray(p.rot) ? p.rot : [0, 0, 0];
          m.position.set(+at[0] || 0, +at[1] || 0, +at[2] || 0);
          m.rotation.set((+r[0] || 0) * Math.PI / 180, (+r[1] || 0) * Math.PI / 180, (+r[2] || 0) * Math.PI / 180);
          m.castShadow = opts.shadows !== false; m.receiveShadow = true;
          group.add(m);
        }
        // Without a height (or with onGround) the model stands on the terrain, raised by y if given
        const P = V(pos);
        const ground = opts.onGround || (Array.isArray(pos) ? pos.length < 3 : !pos || pos.y === undefined);
        if (ground) P.y += g.world.heightAt(P.x, P.z);
        group.position.copy(P);
        group.rotation.y = (+opts.rotY || 0) * Math.PI / 180;
        group.scale.setScalar(clamp(+opts.scale || 1, 0.01, 100));
        g.scene.add(group);
        const boxes = [];
        const handle = {
          object: group,
          get position() { return group.position; },
          move(x, y, z) { group.position.copy(V(x, y, z)); if (boxes.length) handle._collide(); },
          rotate(deg) { group.rotation.y = (+deg || 0) * Math.PI / 180; if (boxes.length) handle._collide(); },
          setVisible(v) { group.visible = !!v; },
          remove() {
            g.scene.remove(group);
            for (const b of boxes) g.world.disableBox(b);
            boxes.length = 0;
            mgr.models = mgr.models.filter((h) => h !== handle);
          },
          _collide() {
            for (const b of boxes) g.world.disableBox(b);
            boxes.length = 0;
            group.updateMatrixWorld(true);
            const bb = new THREE.Box3();
            for (const m of group.children) {
              bb.setFromObject(m);
              boxes.push(g.world.addBox(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, { mat: opts.material || 'concrete' }));
            }
          },
        };
        if (opts.collide) handle._collide();
        mgr.models.push(handle);
        return handle;
      },
      effect(kind, x, y, z, opts = {}) {
        if (typeof x === 'object') { opts = y || {}; ({ x, y, z } = x); }
        const fx = g.effects, s = clamp(+(opts.size ?? 1), 0.1, 5);
        const col = opts.color !== undefined ? parseColor(opts.color) ?? 0xffffff : null;
        switch (kind) {
          case 'explosion': fx.explosion(x, y, z, s); break;
          case 'flash': fx.flash(x, y, z, 6 * s, 14 * s, clamp(+(opts.duration ?? 0.1), 0.02, 3), col ?? 0xffa850); break;
          case 'smoke': for (let i = 0; i < 12 * s; i++) fx.smoke.add(x + (Math.random() - 0.5) * s, y + Math.random() * s, z + (Math.random() - 0.5) * s, (Math.random() - 0.5), 0.5 + Math.random(), (Math.random() - 0.5), 2 + Math.random() * 2, s, 3 * s, col ?? 0xcfc8bd, 0.5, -0.2, 0.5); break;
          case 'fire': for (let i = 0; i < 10 * s; i++) fx.fire.add(x + (Math.random() - 0.5) * s, y, z + (Math.random() - 0.5) * s, 0, 1 + Math.random() * 2, 0, 0.4 + Math.random() * 0.4, 0.4 * s, 0.1, col ?? 0xffa040, 1); break;
          case 'dust': fx.dust(x, y, z, 2 * s, Math.round(10 * s), col ?? 0xb9ad98); break;
          case 'blood': fx.blood(x, y, z, 0, 1, 0); break;
          case 'sparks': fx.impact(x, y, z, 0, 1, 0, 'metal'); break;
          case 'debris': fx.debris(x, y, z, col ?? 0x8a8378, Math.round(6 * s), 0.3 * s); break;
          case 'tracer': if (opts.to) fx.tracer(x, y, z, +opts.to.x, +opts.to.y, +opts.to.z, col ?? 0xffc46b); break;
          case 'shake': fx.addShake(clamp(s * 0.5, 0, 1.6)); break;
          default: throw new Error(`api.effect: unknown effect "${kind}"`);
        }
      },
      sound(kind, x, y, z, opts = {}) {
        const a = g.audio;
        const own = x === undefined;
        if (typeof x === 'object' && x) ({ x, y, z } = x);
        const P = g.player ? g.player.pos : { x: 0, y: 0, z: 0 };
        if (own) ({ x, y, z } = P);
        const [type, sub] = String(kind).split(':');
        if (type === 'shot') a.shot(sub || 'rifle', x, y, z, own);
        else if (type === 'explosion') a.explosion(x, y, z, clamp(+(opts.size ?? 1), 0.2, 3));
        else if (type === 'foley') a.foley(sub || 'charge', x, y, z, own, clamp(+(opts.pitch ?? 1), 0.3, 3));
        else if (type === 'whiz') a.whiz(x, y, z);
        else if (type === 'hit') a.hit(sub === 'head');
        else if (type === 'kill') a.kill();
        else if (type === 'capture') a.capture();
        else if (type === 'click') a.click();
        else throw new Error(`api.sound: unknown sound "${kind}"`);
      },
      tone(freq = 880, duration = 0.1, wave = 'sine', volume = 0.15) {
        g.audio._tone(clamp(+freq, 20, 12000), clamp(+duration, 0.01, 3), ['sine', 'square', 'sawtooth', 'triangle'].includes(wave) ? wave : 'sine', clamp(+volume, 0, 0.6));
      },
      vibrate(pattern) { g.vibrate(pattern); },

      // ---- HUD
      hud: {
        text(id, text, o = {}) {
          const el = widget(id, 'mod-text');
          el.textContent = String(text).slice(0, 200);
          place(el, o);
          return el;
        },
        bar(id, value, o = {}) {
          const el = widget(id, 'mod-bar');
          if (!el.firstChild) { el.innerHTML = '<span></span><i><b></b></i>'; }
          el.firstChild.textContent = o.label ? String(o.label).slice(0, 32) : '';
          const fill = el.lastChild.firstChild;
          fill.style.width = `${Math.round(clamp(+value || 0, 0, 1) * 100)}%`;
          fill.style.background = o.color ? '#' + (parseColor(o.color) ?? 0xffffff).toString(16).padStart(6, '0') : '';
          place(el, { ...o, color: undefined });
          return el;
        },
        remove(id) {
          const key = `${entry.id}:${id}`;
          const el = mgr.widgets.get(key);
          if (el) { el.remove(); mgr.widgets.delete(key); }
        },
      },

      // ---- input
      bindKey(code, label, onPress, onRelease) {
        if (typeof code !== 'string' || !/^[A-Za-z0-9]+$/.test(code)) throw new Error('api.bindKey needs a key code like "KeyH"');
        fnCheck(onPress, 'api.bindKey');
        if (mgr.keys.length >= 12) throw new Error('api.bindKey: at most 12 keys');
        const k = {
          code, label: String(label || code).slice(0, 10), down: false, btn: null,
          call: (down) => { try { if (down) onPress(true); else if (onRelease) onRelease(false); } catch (e) { report(e); } },
        };
        if (g.isTouch) {
          mgr._layoutKeys();
          const col = document.getElementById('t-mods');
          if (col) {
            const b = document.createElement('button');
            b.textContent = k.label;
            const on = (e) => { e.preventDefault(); if (!k.down) { k.down = true; b.classList.add('on'); k.call(true); } };
            const off = (e) => { e.preventDefault(); if (k.down) { k.down = false; b.classList.remove('on'); k.call(false); } };
            b.addEventListener('touchstart', on, { passive: false });
            b.addEventListener('touchend', off, { passive: false });
            b.addEventListener('touchcancel', off, { passive: false });
            col.appendChild(b);
            k.btn = b;
          }
        }
        mgr.keys.push(k);
        mgr._layoutKeys();
        return k;
      },
      isDown(code) {
        if (g.input.keys.has(code)) return true;
        return mgr.keys.some((k) => k.code === code && k.down);
      },

      // ---- saved data (per mod, kept on this device)
      store: {
        get: (key, fallback) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : fallback),
        set(key, value) {
          store[String(key)] = value;
          try { localStorage.setItem(storeKey, JSON.stringify(store)); } catch (e) { report(e); }
        },
      },
    };
    // Every API call reports errors on the MODS screen instead of breaking the game
    for (const k of Object.keys(api)) if (typeof api[k] === 'function' && !['on', 'filter', 'after', 'every', 'bindKey', 'onDisable'].includes(k)) api[k] = safe(api[k]);
    for (const k of Object.keys(api.hud)) api.hud[k] = safe(api.hud[k]);
    Object.freeze(api.hud);
    Object.freeze(api.store);
    return Object.freeze(api);
  }
}

