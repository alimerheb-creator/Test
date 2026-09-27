// Mod loader. A mod is a JSON file ("format": "sixthfront-mod") that patches the game's tables
// (weapons, gadgets, projectiles, classes, movement, rules, scoring, tanks, teams, AI skill,
// lighting, bot names) and can optionally run a script against a small event API.
// Every change is validated and clamped, and all mods are re-applied from a pristine snapshot,
// so turning a mod off always restores the original game. See MODDING.md for the format.
import {
  WEAPONS, GADGETS, PROJECTILES, CLASSES, CLASS_ORDER, MOVE, SCORE, DIFFICULTY, TEAMS,
  RULES, VEHICLES, ATMOSPHERE, BOT_NAMES,
} from './config.js';
import { SHOT_SOUNDS } from './audio.js';
import { ATMOSPHERE_PRESETS } from './world.js';

export const MOD_FORMAT = 'sixthfront-mod';
const STORAGE_KEY = 'sixthfront.mods';
const MAX_MOD_BYTES = 256 * 1024;
const MAX_CLASSES = 8;
const GUN_MODELS = ['ar', 'smg', 'lmg', 'sniper', 'pistol', 'shotgun'];

// ---------------------------------------------------------------- field schemas
const num = (min, max, int = false) => ({ t: 'num', min, max, int });
const bool = { t: 'bool' };
const str = (max = 40) => ({ t: 'str', max });
const color = { t: 'color' };          // stored as a number (0xrrggbb)
const colorStr = { t: 'colorStr' };    // stored as '#rrggbb'
const oneOf = (list) => ({ t: 'enum', list });
const pair = (min, max) => ({ t: 'pair', min, max });
const ref = (table) => ({ t: 'ref', table });

const SCHEMA = {
  weapons: {
    name: str(28), kind: oneOf(['auto', 'semi', 'bolt']), rpm: num(1, 3000), dmg: pair(0, 1000), range: pair(0, 2000),
    mag: num(1, 1000, true), reserve: num(0, 9999, true), reload: num(0.1, 20), spreadHip: num(0, 0.5), spreadAds: num(0, 0.5),
    bloom: num(0, 0.2), bloomMax: num(0, 0.5), recoil: pair(0, 0.5), adsFov: num(5, 90), adsTime: num(0.03, 2),
    head: num(1, 10), sound: oneOf(SHOT_SOUNDS), model: oneOf(GUN_MODELS), scope: bool, botRange: num(5, 400),
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
    fallDamage: bool, infiniteAmmo: bool,
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
};

function parseColor(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(0xffffff, Math.round(v)));
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/^#/, '').replace(/^0x/i, '');
  if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(s)) return null;
  return parseInt(s, 16);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

// Validates one field against its schema. Returns [ok, value, message]
function coerce(spec, value, path, tables) {
  const bad = (why) => [false, undefined, `${path}: ${why}`];
  switch (spec.t) {
    case 'num': {
      const n = Number(value);
      if (typeof value === 'boolean' || value === null || value === '' || !Number.isFinite(n)) return bad('expected a number');
      let v = Math.min(spec.max, Math.max(spec.min, n));
      if (spec.int) v = Math.round(v);
      return [true, v, v !== n ? `${path}: ${n} is outside ${spec.min}–${spec.max}, using ${v}` : null];
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
    case 'ref':
      if (typeof value !== 'string' || !tables[spec.table][value]) return bad(`unknown ${spec.table.replace(/s$/, '')} "${value}"`);
      return [true, value, null];
    default:
      return bad('unsupported field');
  }
}

function applyFields(target, patch, schema, path, tables, log) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) { log.push(`${path}: expected an object`); return; }
  for (const [field, value] of Object.entries(patch)) {
    if (field === 'base' || field.startsWith('_')) continue;
    const spec = schema[field];
    if (!spec) { log.push(`${path}.${field}: unknown setting (ignored)`); continue; }
    const [ok, v, msg] = coerce(spec, value, `${path}.${field}`, tables);
    if (msg) log.push(msg);
    if (ok) target[field] = v;
  }
}

const KEY_RE = /^[a-z][a-z0-9_]{0,23}$/;

export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'mod';
}

// Parse and sanity-check a mod file's text. Throws with a readable message.
export function parseMod(text) {
  if (typeof text !== 'string') throw new Error('Mod file is empty.');
  if (text.length > MAX_MOD_BYTES) throw new Error('Mod file is too large (max 256 KB).');
  let mod;
  try {
    mod = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(`Not valid JSON: ${e.message}`);
  }
  if (!mod || typeof mod !== 'object' || Array.isArray(mod)) throw new Error('A mod must be a JSON object.');
  if (mod.format && mod.format !== MOD_FORMAT) throw new Error(`Unknown format "${mod.format}" (expected "${MOD_FORMAT}").`);
  if (typeof mod.name !== 'string' || !mod.name.trim()) throw new Error('The mod needs a "name".');
  return mod;
}

// ---------------------------------------------------------------- manager
export class ModManager {
  constructor(game) {
    this.game = game;
    this.handlers = [];
    this.storageOk = true;
    this.pristine = {
      WEAPONS: clone(WEAPONS), GADGETS: clone(GADGETS), PROJECTILES: clone(PROJECTILES), CLASSES: clone(CLASSES),
      CLASS_ORDER: clone(CLASS_ORDER), MOVE: clone(MOVE), SCORE: clone(SCORE), DIFFICULTY: clone(DIFFICULTY),
      TEAMS: clone(TEAMS), RULES: clone(RULES), VEHICLES: clone(VEHICLES), ATMOSPHERE: clone(ATMOSPHERE), BOT_NAMES: clone(BOT_NAMES),
    };
    this.list = this._load();
  }

  get activeCount() { return this.list.filter((m) => m.enabled && m.status !== 'error').length; }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter((e) => e && typeof e.text === 'string').map((e) => this._entry(e.text, !!e.enabled)).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.list.map((m) => ({ id: m.id, enabled: m.enabled, text: m.text }))));
      this.storageOk = true;
    } catch (e) {
      this.storageOk = false;
    }
  }

  _entry(text, enabled) {
    try {
      const mod = parseMod(text);
      return {
        id: slugify(mod.id || mod.name), name: String(mod.name).slice(0, 48), version: String(mod.version || ''),
        author: String(mod.author || ''), description: String(mod.description || '').slice(0, 300),
        hasScript: !!mod.script, enabled, text, mod, status: 'ok', messages: [],
      };
    } catch (e) {
      return null;
    }
  }

  // Add (or replace) a mod from file text. Returns the entry; throws on invalid files.
  add(text) {
    parseMod(text);
    const entry = this._entry(text, true);
    const i = this.list.findIndex((m) => m.id === entry.id);
    if (i >= 0) { entry.enabled = this.list[i].enabled; this.list[i] = entry; }
    else this.list.push(entry);
    this._save();
    return entry;
  }

  remove(id) {
    this.list = this.list.filter((m) => m.id !== id);
    this._save();
  }

  setEnabled(id, on) {
    const m = this.list.find((x) => x.id === id);
    if (m) { m.enabled = on; this._save(); }
  }

  move(id, delta) {
    const i = this.list.findIndex((m) => m.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.list.length) return;
    [this.list[i], this.list[j]] = [this.list[j], this.list[i]];
    this._save();
  }

  // Put every table back exactly as the base game shipped it
  _restore() {
    const P = this.pristine;
    for (const [table, src] of [[WEAPONS, P.WEAPONS], [GADGETS, P.GADGETS], [PROJECTILES, P.PROJECTILES], [CLASSES, P.CLASSES],
      [MOVE, P.MOVE], [SCORE, P.SCORE], [RULES, P.RULES], [VEHICLES, P.VEHICLES], [ATMOSPHERE, P.ATMOSPHERE]]) {
      for (const k of Object.keys(table)) delete table[k];
      Object.assign(table, clone(src));
    }
    for (const k of Object.keys(DIFFICULTY)) Object.assign(DIFFICULTY[k], clone(P.DIFFICULTY[k]));
    TEAMS.forEach((t, i) => Object.assign(t, clone(P.TEAMS[i])));
    CLASS_ORDER.splice(0, CLASS_ORDER.length, ...P.CLASS_ORDER);
    BOT_NAMES.splice(0, BOT_NAMES.length, ...P.BOT_NAMES);
    for (const [ev, fn] of this.handlers) this.game.off(ev, fn);
    this.handlers = [];
  }

  // Re-apply all enabled mods in list order (later mods win)
  applyAll() {
    this._restore();
    for (const m of this.list) {
      m.messages = [];
      if (!m.enabled) { m.status = 'off'; continue; }
      try {
        this._apply(m);
        m.status = m.messages.length ? 'warn' : 'ok';
      } catch (e) {
        m.status = 'error';
        m.messages.push(e.message);
      }
    }
    return this.list;
  }

  _apply(entry) {
    const mod = entry.mod, log = entry.messages;
    const tables = { weapons: WEAPONS, gadgets: GADGETS, projectiles: PROJECTILES, classes: CLASSES };
    const keyed = (section, table, schema, onCreate) => {
      const patches = mod[section];
      if (patches === undefined) return;
      if (!patches || typeof patches !== 'object' || Array.isArray(patches)) { log.push(`${section}: expected an object`); return; }
      for (const [key, patch] of Object.entries(patches)) {
        if (!KEY_RE.test(key)) { log.push(`${section}.${key}: ids must be lowercase letters, digits or _ (max 24)`); continue; }
        let target = table[key];
        if (!target) {
          const base = patch && table[patch.base];
          if (!base) { log.push(`${section}.${key}: new entries need "base" set to an existing one (${Object.keys(table).join(', ')})`); continue; }
          target = clone(base);
          if (onCreate) onCreate(target, key, patch.base);
          table[key] = target;
        }
        applyFields(target, patch, schema, `${section}.${key}`, tables, log);
      }
    };
    keyed('projectiles', PROJECTILES, SCHEMA.projectiles, (t, key, base) => { t.behavior = t.behavior || base; });
    keyed('weapons', WEAPONS, SCHEMA.weapons);
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
      if (mod.vehicles && typeof mod.vehicles === 'object') {
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
    const known = new Set(['format', 'id', 'name', 'version', 'author', 'description', 'weapons', 'gadgets', 'projectiles', 'classes',
      'movement', 'rules', 'scoring', 'vehicles', 'teams', 'difficulty', 'atmosphere', 'botNames', 'script']);
    for (const k of Object.keys(mod)) if (!known.has(k) && !k.startsWith('_')) log.push(`${k}: unknown section (ignored)`);
  }

  _runScript(entry, code) {
    if (typeof code !== 'string') { entry.messages.push('Script: "script" must be text or a list of lines'); return; }
    const api = this._api(entry);
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('api', `"use strict";\n${code}`);
      fn(api);
    } catch (e) {
      entry.messages.push(`Script could not run: ${e.message}`);
    }
  }

  // The object handed to mod scripts
  _api(entry) {
    const g = this.game, handlers = this.handlers;
    let reported = false;
    return Object.freeze({
      version: 1,
      game: g,
      config: { WEAPONS, GADGETS, PROJECTILES, CLASSES, MOVE, SCORE, DIFFICULTY, TEAMS, RULES, VEHICLES },
      rules: RULES,
      on(event, fn) {
        if (typeof event !== 'string' || typeof fn !== 'function') return;
        const wrapped = (data) => {
          try { fn(data); } catch (e) {
            if (!reported) { reported = true; console.warn(`[mod ${entry.name}]`, e); g.hud && g.hud.toast(`MOD ERROR: ${entry.name}`); }
          }
        };
        g.on(event, wrapped);
        handlers.push([event, wrapped]);
      },
      toast: (msg) => g.hud && g.hud.toast(String(msg).slice(0, 80)),
      banner: (msg, color) => g.hud && g.hud.banner(String(msg).slice(0, 60), color),
      award: (soldier, points, label) => g.mode.award(soldier, Math.round(+points || 0), String(label || 'MOD BONUS').slice(0, 32)),
      player: () => g.player,
      soldiers: () => g.soldiers.slice(),
      vehicles: () => g.vehicles.slice(),
      flags: () => g.mode.flags,
      tickets: () => g.mode.tickets.slice(),
      log: (...a) => console.log(`[mod ${entry.name}]`, ...a),
    });
  }
}
