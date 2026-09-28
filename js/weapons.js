// Guns (ammo and staged reloads), hitscan bullets, projectiles, explosions, crates, melee, spotting.
import * as THREE from 'three';
import { PROJECTILES, SCORE, RULES } from './config.js';
import { randomInCone, clamp, rand, wrapAngle } from './util.js';

// A firearm's ammunition and reload state.
//
// Reloads happen in stages, each with its own sound and animation:
//   mag   — detachable magazine: 'out' (mag drops), 'in' (new mag seated), then 'charge' (bolt racked)
//           only when the chamber is empty. A tactical reload keeps the chambered round (30+1).
//   box   — belt-fed box (open bolt, nothing chambered): 'out', 'in', and 'charge' after running dry.
//   shell — tube or internal magazine loaded one round at a time: 'start', 'shell' per round, then
//           'charge' (pump / bolt) if the chamber is empty, or 'end'. Firing interrupts it.
// Partly used magazines go back in the pouch; the fullest one is always loaded next.
// Switching weapons cancels a reload. A magazine that already came out stays out.
export class Gun {
  constructor(def) {
    this.def = def;
    this.cool = 0;
    this.bloom = 0;
    this.cycleT = 0;
    this.refill(true);
  }
  get type() { return this.def.reloadType || (this.def.openBolt ? 'box' : 'mag'); }
  get closed() { return !this.def.openBolt && this.type !== 'box'; }
  get reloading() { return this.stage !== null; }
  // Rounds ready to fire (magazine + chamber)
  get rounds() { return this.mag + this.chamber; }
  get empty() { return this.mag + this.chamber === 0; }
  get reserve() {
    let n = this.loose + this.fullMags * this.def.mag;
    for (const m of this.partials) n += m;
    return n;
  }
  set reserve(n) { this._fillPouch(Math.max(0, Math.floor(n))); }
  // Magazines in the pouch, fullest first, as fractions (for the HUD)
  pouchLevels(max = 8) {
    const out = [];
    for (let i = 0; i < this.fullMags && out.length < max; i++) out.push(1);
    const p = this.partials.slice().sort((a, b) => b - a);
    for (const m of p) { if (out.length >= max) break; out.push(m / this.def.mag); }
    return out;
  }
  // Ready to fire right now (closed bolt: a round is chambered)
  get ready() { return this.closed ? this.chamber > 0 : this.mag > 0; }
  // Stage progress 0..1 (for animation)
  get stageP() { return this.stageDur > 0 ? 1 - Math.max(0, this.stageT) / this.stageDur : 1; }
  // Whole-reload progress 0..1 (for the HUD bar); shell reloads show how full the tube is
  get reloadP() {
    if (this.type === 'shell') return this.mag / Math.max(1, this.def.mag);
    return this.reloadTotal > 0 ? Math.min(1, this.reloadElapsed / this.reloadTotal) : 1;
  }

  refill(full) {
    if (!full) { this.addReserve(Math.ceil(this.def.mag * 0.5)); return; }
    this.stage = null; this.stageT = 0; this.stageDur = 0; this.plan = [];
    this.reloadTotal = 0; this.reloadElapsed = 0;
    this.magOut = false;
    this.droppedEmpty = false;
    this.chamber = this.closed ? 1 : 0;
    this.mag = this.def.mag;
    this._fillPouch(this.def.reserve);
  }

  _fillPouch(n) {
    this.loose = 0; this.fullMags = 0; this.partials = [];
    if (this.type === 'shell') { this.loose = n; return; }
    const m = Math.max(1, this.def.mag);
    this.fullMags = Math.floor(n / m);
    if (n % m) this.partials.push(n % m);
  }

  // Adds spare ammo up to the weapon's reserve; tops up partial magazines first. Returns rounds added.
  addReserve(n) {
    n = Math.min(Math.floor(n), this.def.reserve - this.reserve);
    if (n <= 0) return 0;
    const added = n;
    if (this.type === 'shell') { this.loose += n; return added; }
    const m = Math.max(1, this.def.mag);
    this.partials.sort((a, b) => b - a);
    while (n > 0 && this.partials.length) {
      const need = m - this.partials[0];
      if (need > n) { this.partials[0] += n; n = 0; break; }
      n -= need; this.partials.shift(); this.fullMags++;
    }
    this.fullMags += Math.floor(n / m);
    if (n % m) this.partials.push(n % m);
    return added;
  }

  _bestInPouch() {
    if (this.type === 'shell') return this.loose > 0 ? 1 : 0;
    if (this.fullMags > 0) return this.def.mag;
    let b = 0;
    for (const m of this.partials) if (m > b) b = m;
    return b;
  }
  _takeFromPouch() {
    if (this.fullMags > 0) { this.fullMags--; return this.def.mag; }
    let bi = -1;
    for (let i = 0; i < this.partials.length; i++) if (bi < 0 || this.partials[i] > this.partials[bi]) bi = i;
    if (bi < 0) return 0;
    return this.partials.splice(bi, 1)[0];
  }
  _stow(rounds) {
    if (rounds <= 0) return;
    if (rounds >= this.def.mag) this.fullMags++;
    else this.partials.push(rounds);
  }

  // Starts a reload if there's anything to gain. Returns true if it started.
  startReload() {
    if (this.stage) return false;
    const d = this.def, closed = this.closed;
    const needCharge = closed && this.chamber === 0;
    if (this.type === 'shell') {
      if (this.mag < d.mag && this.loose > 0) { this._setStage('start'); return true; }
      if (needCharge && this.mag > 0) { this._setStage('charge'); return true; }
      return false;
    }
    const best = this._bestInPouch();
    const swap = best > (this.magOut ? 0 : this.mag) && (this.magOut || this.mag < d.mag);
    if (!swap) {
      if (needCharge && this.mag > 0) {
        this.plan = [];
        this._setStage('charge');
        this.reloadTotal = this.stageDur; this.reloadElapsed = 0;
        return true;
      }
      return false;
    }
    const box = this.type === 'box';
    const dry = this.empty || needCharge;
    const T = Math.max(0.1, d.reload), Te = Math.max(0.1, d.reloadEmpty ?? T * (box ? 1.12 : 1.3));
    const plan = [];
    if (dry) {
      if (!this.magOut) plan.push(['out', Te * (box ? 0.34 : 0.3)]);
      plan.push(['in', Te * (box ? 0.5 : 0.46)]);
      plan.push(['charge', Te * (box ? 0.16 : 0.24)]);
    } else {
      if (!this.magOut) plan.push(['out', T * 0.42]);
      plan.push(['in', T * 0.58]);
    }
    this.droppedEmpty = this.mag === 0 && !this.magOut;
    this.plan = plan;
    this.reloadTotal = plan.reduce((t, s) => t + s[1], 0);
    this.reloadElapsed = 0;
    this._next();
    return true;
  }

  _stageDur(st) {
    const d = this.def;
    if (st === 'start') return d.shellStart ?? 0.35;
    if (st === 'shell') return Math.max(0.05, d.shellTime ?? 0.5);
    if (st === 'end') return 0.25;
    if (st === 'charge') return this.type === 'shell' ? 0.45 : Math.max(0.1, (d.reloadEmpty ?? d.reload * 1.3) * 0.24);
    return 0.3;
  }
  _setStage(st, dur) {
    this.stage = st;
    this.cued = false;
    this.stageDur = this.stageT = dur ?? this._stageDur(st);
  }
  _next() {
    if (this.type === 'shell') {
      const d = this.def, prev = this.stage;
      if ((prev === 'start' || prev === 'shell') && this.mag < d.mag && this.loose > 0) this._setStage('shell');
      else if (prev !== 'charge' && prev !== 'end' && this.closed && this.chamber === 0 && this.mag > 0) this._setStage('charge');
      else if (prev === 'start' || prev === 'shell') this._setStage('end');
      else { this.stage = null; this.stageT = this.stageDur = 0; }
      return;
    }
    const s = this.plan.shift();
    if (s) this._setStage(s[0], s[1]);
    else { this.stage = null; this.stageT = this.stageDur = 0; }
  }

  // Stops a reload partway (weapon switch). A magazine that came out stays out.
  cancel() {
    this.stage = null; this.stageT = this.stageDur = 0; this.plan = [];
  }

  // Shotguns: firing during a shell-by-shell reload stops it (after pumping if nothing is chambered)
  interrupt() {
    if (this.type !== 'shell' || (this.stage !== 'start' && this.stage !== 'shell')) return false;
    if (this.chamber > 0) { this.cancel(); return true; }
    if (this.mag > 0) { this.plan = []; this._setStage('charge'); return true; }
    return false;
  }

  // One round fired
  consume() {
    if (!RULES.infiniteAmmo) {
      if (this.closed) {
        this.chamber = 0;
        if (this.mag > 0) { this.mag--; this.chamber = 1; }
      } else if (this.mag > 0) this.mag--;
    }
    if (this.def.kind === 'bolt') this.cycleT = Math.min(this.def.cycleDelay ?? (this.type === 'shell' ? 0.12 : 0.2), 60 / this.def.rpm);
  }

  canFire() { return this.cool <= 0 && !this.stage && this.ready; }

  // The moment in each stage (0..1) when the action happens: the magazine comes free, seats, the bolt
  // slams home, a shell goes in. Ammo changes and the sound play at that point.
  _cue(st) {
    switch (st) {
      case 'out': return this.type === 'box' ? 0.3 : 0.42;
      case 'in': return this.type === 'box' ? 0.72 : 0.76;
      case 'charge': return this.type === 'shell' ? 0.15 : this.def.kind === 'bolt' ? 0.1 : this.def.model === 'pistol' ? 0.5 : 0.6;
      case 'shell': return 0.85;
      default: return 0;
    }
  }

  _act(st) {
    if (st === 'out') {
      this.droppedEmpty = this.mag === 0;
      this._stow(this.mag);
      this.mag = 0;
      this.magOut = true;
    } else if (st === 'in') {
      const m = this._takeFromPouch();
      if (m > 0) { this.mag = m; this.magOut = false; }
    } else if (st === 'charge') {
      if (this.closed && this.chamber === 0 && this.mag > 0) { this.mag--; this.chamber = 1; }
    } else if (st === 'shell') {
      if (this.loose > 0 && this.mag < this.def.mag) { this.loose--; this.mag++; }
    }
  }

  // Advances timers. Returns a stage name ('out', 'in', 'charge', 'shell', 'start', 'end') at the moment
  // its action happens, 'cycle' when a bolt or pump is worked after a shot, otherwise null.
  update(dt, active) {
    if (this.cool > 0) this.cool -= dt;
    if (this.bloom > 0) this.bloom = Math.max(0, this.bloom - dt * 0.12);
    let ev = null;
    if (this.cycleT > 0) { this.cycleT -= dt; if (this.cycleT <= 0 && active) ev = 'cycle'; }
    if (!this.stage) return ev;
    if (!active) { this.cancel(); return ev; }
    this.stageT -= dt;
    this.reloadElapsed += dt;
    const st = this.stage;
    if (!this.cued && this.stageP >= this._cue(st)) {
      this.cued = true;
      this._act(st);
      ev = st;
    }
    if (this.stageT <= 0) this._next();
    return ev;
  }
}

export function dmgAt(def, dist) {
  const [n, f] = def.dmg, [r0, r1] = def.range;
  if (dist <= r0) return n;
  if (dist >= r1) return f;
  return n + ((f - n) * (dist - r0)) / (r1 - r0);
}

const _eye = new THREE.Vector3(), _muz = new THREE.Vector3(), _dir = new THREE.Vector3();
const _c = new THREE.Vector3(), _e2 = new THREE.Vector3(), _step = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    const dark = new THREE.MeshStandardMaterial({ color: 0x2f3526, roughness: 0.7 });
    const olive = new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.8 });
    const tan = new THREE.MeshStandardMaterial({ color: 0xa08a60, roughness: 0.9 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd080 });
    const crate = new THREE.Group();
    crate.add(new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.5), olive));
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.08, 0.52), new THREE.MeshStandardMaterial({ color: 0xd8c27a }));
    crate.add(band);
    const rocket = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), olive);
    body.rotation.x = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 8), dark);
    head.rotation.x = -Math.PI / 2;
    head.position.z = -0.42;
    rocket.add(body, head);
    const c4 = new THREE.Group();
    c4.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.14), tan));
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.04), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    led.position.y = 0.055;
    c4.add(led);
    this.templates = {
      grenade: new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), dark),
      ugl: new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), dark),
      rocket,
      shell: new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), glow),
      c4,
      crate,
    };
  }

  clear() {
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    this.projectiles.length = 0;
  }

  // ------------------------------------------------------------ bullets
  fireGun(s, dir, spread, opts = {}) {
    const gun = s.gun;
    if (!gun) return false;
    if (gun.stage) gun.interrupt();
    if (!gun.canFire()) return false;
    const def = gun.def, g = this.game;
    let dmgMul = opts.dmgMul ?? 1, pellets = Math.max(1, def.pellets || 1);
    if (g.hasFilter('fire')) {
      const f = g.filter('fire', { soldier: s, gun, weapon: def, dir, spread, dmgMul, pellets });
      if (!f) return false;
      spread = Math.max(0, Number(f.spread) || 0);
      dmgMul = Number(f.dmgMul) || 0;
      pellets = Math.max(1, Math.min(64, Math.round(f.pellets) || 1));
    }
    gun.consume();
    gun.cool = 60 / def.rpm;
    gun.bloom = Math.min(def.bloomMax, gun.bloom + def.bloom);
    const eye = opts.origin || s.eye(_eye);
    const muzzle = opts.muzzle || s.muzzle(_muz);
    for (let i = 0; i < pellets; i++) {
      randomInCone(dir, spread, _dir);
      this.fireBullet(s, eye, _dir, def, dmgMul, muzzle, i < 3);
    }
    if (g.hasListener('fire')) g.emit('fire', { soldier: s, gun, weapon: def });
    s.lastFireT = this.game.time;
    s.miniUntil = Math.max(s.miniUntil, this.game.time + 1.2);
    this.game.audio.shot(def.sound, eye.x, eye.y, eye.z, s.isPlayer);
    if (!s.isPlayer) this.game.effects.muzzle(muzzle.x, muzzle.y, muzzle.z, _dir.x, _dir.y, _dir.z, false);
    return true;
  }

  fireBullet(shooter, o, dir, def, dmgMul, muzzle, tracer = true) {
    const g = this.game;
    const maxT = 600;
    const wh = g.world.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, maxT);
    let best = wh.hit ? wh.t : maxT;
    const wHit = wh.hit, nx = wh.nx, ny = wh.ny, nz = wh.nz;
    const mat = wh.box ? (wh.box.data && wh.box.data.mat) || 'concrete' : 'dirt';
    let victim = null, head = false, veh = null;
    for (const s of g.soldiers) {
      if (s === shooter || (s.team === shooter.team && !RULES.friendlyFire) || s.state !== 'alive' || s.vehicle) continue;
      const t = s.rayHit(o.x, o.y, o.z, dir.x, dir.y, dir.z, best);
      if (t < best) { best = t; victim = s; head = s._head; }
    }
    for (const v of g.vehicles) {
      if (!v.alive || v === shooter.vehicle) continue;
      const t = v.rayHit(o.x, o.y, o.z, dir.x, dir.y, dir.z, best);
      if (t < best) { best = t; veh = v; victim = null; }
    }
    const px = o.x + dir.x * best, py = o.y + dir.y * best, pz = o.z + dir.z * best;
    if (victim) {
      const dmg = dmgAt(def, best) * (head ? def.head * RULES.headshotScale : 1) * dmgMul;
      const killed = victim.takeDamage(dmg, shooter, { weapon: def.name, headshot: head, dir: dir.clone() });
      g.effects.blood(px, py, pz, dir.x, dir.y, dir.z);
      if (shooter.isPlayer) g.hud.hitmarker(head, killed);
    } else if (veh) {
      veh.damage(def.id === 'coax' ? 2 : 1, shooter, def.name);
      g.effects.impact(px - dir.x * 0.05, py - dir.y * 0.05, pz - dir.z * 0.05, -dir.x, -dir.y, -dir.z, 'metal');
      if (shooter.isPlayer) g.hud.hitmarker(false, false, true);
    } else if (wHit) {
      g.effects.impact(px, py, pz, nx, ny, nz, mat);
      g.audio.impact(px, py, pz, mat === 'metal');
    }
    if (tracer) g.effects.tracer(muzzle.x, muzzle.y, muzzle.z, px, py, pz, def.tracer || (shooter.team === 0 ? 0xffc46b : 0xff8a5a));
    if ((victim || veh || wHit) && g.hasListener('bulletHit')) {
      g.emit('bulletHit', { shooter, weapon: def, x: px, y: py, z: pz, victim, vehicle: veh, headshot: !!(victim && head), material: victim ? 'flesh' : veh ? 'metal' : mat, normal: { x: nx, y: ny, z: nz } });
    }

    // Near misses crack past the player's head and suppress them
    const P = g.player;
    if (P && shooter !== P && shooter.team !== P.team && P.state === 'alive' && !P.vehicle && victim !== P) {
      const e = P.eye(_e2);
      const t = clamp((e.x - o.x) * dir.x + (e.y - o.y) * dir.y + (e.z - o.z) * dir.z, 0, best);
      const cx = o.x + dir.x * t, cy = o.y + dir.y * t, cz = o.z + dir.z * t;
      const d = Math.sqrt((cx - e.x) ** 2 + (cy - e.y) ** 2 + (cz - e.z) ** 2);
      if (d < 2.4 && t > 3) {
        g.audio.whiz(cx, cy, cz);
        g.hud.suppress(1 - d / 2.4);
      }
    }
  }

  // ------------------------------------------------------------ projectiles
  launch(key, owner, pos, dir, extraVel = null) {
    const g = this.game;
    if (g.hasFilter('projectile')) {
      const f = g.filter('projectile', { type: key, owner, pos, dir });
      if (!f) return null;
      if (PROJECTILES[f.type]) key = f.type;
    }
    const def = PROJECTILES[key];
    // Modded projectiles behave like the projectile they were based on
    const type = def.behavior || key;
    const mesh = (this.templates[type] || this.templates.grenade).clone();
    mesh.castShadow = type === 'crate';
    this.game.scene.add(mesh);
    const p = {
      type, def, owner, team: owner.team, pos: pos.clone(), vel: dir.clone().multiplyScalar(def.speed),
      life: 0, stuck: false, resting: false, mesh, attached: null, local: null, tick: 0, crateT: 30, ticks: 0,
    };
    if (extraVel) p.vel.add(extraVel);
    mesh.position.copy(p.pos);
    this.projectiles.push(p);
    if (g.hasListener('projectile')) g.emit('projectile', p);
    return p;
  }

  throwGrenade(s) {
    if (s.grenades <= 0 || (s.throwCd || 0) > 0) return false;
    if (!RULES.infiniteAmmo) s.grenades--;
    s.throwCd = 1.0;
    const eye = s.eye(_eye);
    const f = s.forward(_dir);
    f.y += 0.18;
    f.normalize();
    _step.set(s.vel.x * 0.5, 0, s.vel.z * 0.5);
    this.launch('grenade', s, eye.addScaledVector(f, 0.5), f, _step);
    return true;
  }

  useGadget(s, dir) {
    const gd = s.gadget;
    if (!gd || s.gadgetAmmo <= 0 || s.gadgetCd > 0) return false;
    const eye = s.eye(_eye);
    const g = this.game;
    if (gd.id === 'ugl') {
      this.launch('ugl', s, eye.clone().addScaledVector(dir, 0.7), dir);
      s.gadgetCd = gd.reload;
      g.audio.shot('pistol', eye.x, eye.y, eye.z, s.isPlayer);
    } else if (gd.id === 'rpg') {
      this.launch('rocket', s, eye.clone().addScaledVector(dir, 0.9), dir);
      s.gadgetCd = gd.reload;
      g.audio.launch(eye.x, eye.y, eye.z);
      for (let i = 0; i < 10; i++) {
        g.effects.smoke.add(eye.x - dir.x * 1.2, eye.y - dir.y * 1.2, eye.z - dir.z * 1.2,
          -dir.x * rand(3, 8) + rand(-1, 1), rand(0, 1.5), -dir.z * rand(3, 8) + rand(-1, 1), rand(1, 2), 0.6, 2.5, 0xcfc8bd, 0.5, -0.2, 1);
      }
    } else if (gd.id === 'crate') {
      const d = dir.clone(); d.y += 0.3; d.normalize();
      this.launch('crate', s, eye.clone().addScaledVector(d, 0.6), d, _step.set(s.vel.x * 0.5, 0, s.vel.z * 0.5));
      s.gadgetCd = gd.recharge;
    } else if (gd.id === 'c4') {
      const d = dir.clone(); d.y += 0.15; d.normalize();
      this.launch('c4', s, eye.clone().addScaledVector(d, 0.5), d, _step.set(s.vel.x * 0.5, 0, s.vel.z * 0.5));
      s.gadgetCd = gd.reload;
    }
    if (!RULES.infiniteAmmo || s.gadget.recharge) s.gadgetAmmo--;
    return true;
  }

  detonateC4(owner) {
    let any = false;
    for (const p of this.projectiles) {
      if (p.type === 'c4' && p.owner === owner && !p.dead) { p.detonate = true; any = true; }
    }
    return any;
  }

  hasC4(owner) {
    return this.projectiles.some((p) => p.type === 'c4' && p.owner === owner && !p.dead);
  }

  explode(x, y, z, def, owner) {
    const g = this.game;
    if (g.hasFilter('explosion')) {
      const f = g.filter('explosion', { x, y, z, def, owner, radius: def.radius });
      if (!f) return;
      x = f.x; y = f.y; z = f.z; owner = f.owner;
      if (f.def !== def || f.radius !== def.radius) def = { ...def, ...(f.def || {}), radius: Number(f.radius) || 0 };
    }
    const r = def.radius * RULES.explosionScale;
    if (g.hasListener('explosion')) g.emit('explosion', { x, y, z, def, owner, radius: r });
    const fxs = def.fxScale ?? clamp(r / 5.5, 0.6, 1.5);
    g.effects.explosion(x, y, z, fxs);
    g.audio.explosion(x, y, z, Math.min(1.4, fxs));
    for (const s of g.soldiers) {
      if (s.state !== 'alive' || s.vehicle) continue;
      const c = s.chest(_c);
      const dx = c.x - x, dy = c.y - y, dz = c.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > r) continue;
      let f = Math.pow(1 - d / r, 0.8);
      if (!g.world.lineClear(x, y + 0.3, z, c.x, c.y, c.z)) f *= 0.35;
      const dmg = def.dmg * f;
      if (dmg < 3) continue;
      const killed = s.takeDamage(dmg, owner, { weapon: def.name, explosive: true });
      if (owner && owner.isPlayer && s !== owner && s.team !== owner.team) g.hud.hitmarker(false, killed);
    }
    for (const v of g.vehicles) {
      if (!v.alive) continue;
      const d = Math.max(0, v.pos.distanceTo(_c.set(x, y, z)) - 2.4);
      if (d < r) {
        v.damage(def.veh * (1 - d / r), owner, def.name);
        if (owner && owner.isPlayer && v.team !== owner.team) g.hud.hitmarker(false, false, true);
      }
    }
    if (def.structural) g.buildings.damageSphere(x, y, z, r * 0.85, def.structural, owner);
    g.world.damageTrees(x, z, r * 0.45);
    const cam = g.camera.position;
    const pd = Math.sqrt((cam.x - x) ** 2 + (cam.y - y) ** 2 + (cam.z - z) ** 2);
    g.effects.addShake(clamp(1.3 - pd / (r * 6), 0, 1.2));
    if (pd < r * 4) g.vibrate(pd < r * 1.5 ? 120 : 50);
  }

  update(dt) {
    const g = this.game, w = g.world;
    const list = this.projectiles;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life += dt;
      let explodeNow = false;

      if (p.type === 'crate' && p.resting) {
        this._crateTick(p, dt);
        if (p.crateT <= 0) { this._remove(i); continue; }
        continue;
      }

      if (p.stuck) {
        if (p.attached) {
          if (!p.attached.alive) { explodeNow = true; }
          else p.pos.copy(p.local).applyMatrix4(p.attached.hull.matrixWorld);
          p.mesh.position.copy(p.pos);
        }
        if (p.detonate || explodeNow) {
          this.explode(p.pos.x, p.pos.y, p.pos.z, p.def, p.owner);
          this._remove(i);
        } else if (p.owner.state === 'dead' || p.owner.state === 'inactive') {
          this._remove(i); // charges are cleared when their owner redeploys
        }
        continue;
      }

      if (!p.resting) {
        p.vel.y -= p.def.gravity * dt;
        const sx = p.vel.x * dt, sy = p.vel.y * dt, sz = p.vel.z * dt;
        const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
        if (len > 1e-6) {
          const dx = sx / len, dy = sy / len, dz = sz / len;
          const wh = w.raycast(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, len);
          let best = wh.hit ? wh.t : Infinity;
          const nx = wh.nx, ny = wh.ny, nz = wh.nz;
          let hitS = null, hitV = null;
          const impact = p.type === 'ugl' || p.type === 'rocket' || p.type === 'shell';
          if (impact || p.type === 'c4') {
            const maxT = Math.min(best, len);
            for (const s of g.soldiers) {
              if (!impact || s.team === p.team || s.state !== 'alive' || s.vehicle) continue;
              const t = s.rayHit(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, Math.min(best, maxT));
              if (t < best) { best = t; hitS = s; }
            }
            for (const v of g.vehicles) {
              if (!v.alive || (v === p.owner.vehicle && p.life < 0.6)) continue;
              const t = v.rayHit(p.pos.x, p.pos.y, p.pos.z, dx, dy, dz, Math.min(best, len));
              if (t < best) { best = t; hitV = v; hitS = null; }
            }
          }
          if (best <= len) {
            const hx = p.pos.x + dx * best, hy = p.pos.y + dy * best, hz = p.pos.z + dz * best;
            if (impact) {
              if (hitS) {
                const killed = hitS.takeDamage(p.def.direct || 100, p.owner, { weapon: p.def.name, explosive: true });
                if (p.owner.isPlayer) g.hud.hitmarker(false, killed);
              }
              this.explode(hx - dx * 0.15, hy - dy * 0.15, hz - dz * 0.15, p.def, p.owner);
              this._remove(i);
              continue;
            } else if (p.type === 'c4') {
              p.stuck = true;
              p.pos.set(hx - dx * 0.04, hy - dy * 0.04, hz - dz * 0.04);
              if (hitV) {
                p.attached = hitV;
                hitV.hull.updateMatrixWorld();
                p.local = p.pos.clone().applyMatrix4(new THREE.Matrix4().copy(hitV.hull.matrixWorld).invert());
              }
              p.mesh.position.copy(p.pos);
              continue;
            } else {
              // grenade / crate bounce
              p.pos.set(hx + nx * 0.06, hy + ny * 0.06, hz + nz * 0.06);
              const vn = p.vel.x * nx + p.vel.y * ny + p.vel.z * nz;
              p.vel.x -= 2 * vn * nx; p.vel.y -= 2 * vn * ny; p.vel.z -= 2 * vn * nz;
              p.vel.multiplyScalar(p.def.bounce || 0.3);
              if (p.vel.length() < 1.6 && ny > 0.6) {
                p.resting = true;
                p.vel.set(0, 0, 0);
                if (p.type === 'crate') {
                  p.mesh.rotation.set(0, Math.random() * 6, 0);
                  p.pos.y = hy + 0.22;
                  p.mesh.position.copy(p.pos);
                  g.emit('crate', p);
                }
              }
            }
          } else {
            p.pos.x += sx; p.pos.y += sy; p.pos.z += sz;
          }
        }
        p.mesh.position.copy(p.pos);
        if (p.type === 'rocket' || p.type === 'shell' || p.type === 'ugl') {
          p.mesh.lookAt(p.pos.x - p.vel.x, p.pos.y - p.vel.y, p.pos.z - p.vel.z);
          if (p.type === 'rocket') g.effects.rocketTrail(p.pos.x, p.pos.y, p.pos.z);
          if (p.type === 'shell' && Math.random() < 0.5) g.effects.fire.add(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.08, 0.6, 0.2, 0xffc070, 1);
        } else if (p.type === 'grenade') {
          p.mesh.rotation.x += dt * 10;
        }
      }

      if (p.type === 'grenade' && p.life >= p.def.fuse) {
        this.explode(p.pos.x, p.pos.y + 0.1, p.pos.z, p.def, p.owner);
        this._remove(i);
        continue;
      }
      if (p.life > 14 || p.pos.y < -50) this._remove(i);
    }
  }

  _crateTick(p, dt) {
    const g = this.game;
    p.crateT -= dt;
    p.tick -= dt;
    if (p.tick > 0) return;
    p.tick = 1;
    p.ticks++;
    let helped = 0;
    for (const s of g.soldiers) {
      if (s.team !== p.team || s.state !== 'alive' || s.vehicle) continue;
      if (s.pos.distanceToSquared(p.pos) > 30) continue;
      let did = false;
      if (s.health < RULES.playerHealth) { s.health = Math.min(RULES.playerHealth, s.health + RULES.playerHealth * 0.12); did = true; }
      for (const gun of s.guns) {
        if (gun.addReserve(Math.ceil(gun.def.mag * 0.25)) > 0) did = true;
      }
      if (p.ticks % 5 === 0) {
        if (s.grenades < s.cls.grenades) { s.grenades++; did = true; }
        if (s.gadgetAmmo < s.gadget.ammo && !s.gadget.recharge) { s.gadgetAmmo++; did = true; }
      }
      if (did && s !== p.owner) helped++;
    }
    if (helped && p.owner) g.mode.award(p.owner, SCORE.resupply * helped, 'RESUPPLY');
  }

  _remove(i) {
    const p = this.projectiles[i];
    p.dead = true;
    this.game.scene.remove(p.mesh);
    this.projectiles.splice(i, 1);
  }

  // ------------------------------------------------------------ melee & spotting
  melee(s) {
    const g = this.game;
    const eye = s.eye(_eye);
    const f = s.forward(_dir);
    let best = null, bd = 2.4;
    for (const e of g.soldiers) {
      if (e.team === s.team || e.state !== 'alive' || e.vehicle) continue;
      const c = e.chest(_c);
      const dx = c.x - eye.x, dy = c.y - eye.y, dz = c.z - eye.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > bd) continue;
      if ((dx * f.x + dy * f.y + dz * f.z) / d < 0.6) continue;
      best = e; bd = d;
    }
    if (!best) return false;
    const back = Math.abs(wrapAngle(best.yaw - s.yaw)) < 1.0;
    const killed = best.takeDamage(back ? 250 : 60, s, { weapon: 'COMBAT KNIFE', melee: true, noRevive: back });
    const c = best.chest(_c);
    g.effects.blood(c.x, c.y, c.z, f.x, f.y, f.z);
    if (s.isPlayer) g.hud.hitmarker(false, killed);
    return true;
  }

  spot(s, maxAngle = 0.12, range = 320) {
    const g = this.game;
    const eye = s.eye(_eye);
    const f = s.forward(_dir);
    let best = null, bestAng = maxAngle;
    const consider = (target, pos) => {
      const dx = pos.x - eye.x, dy = pos.y - eye.y, dz = pos.z - eye.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > range || d < 1) return;
      const ang = Math.acos(clamp((dx * f.x + dy * f.y + dz * f.z) / d, -1, 1));
      if (ang >= bestAng) return;
      if (!g.world.lineClear(eye.x, eye.y, eye.z, pos.x, pos.y, pos.z)) return;
      best = target; bestAng = ang;
    };
    for (const e of g.soldiers) {
      if (e.team === s.team || e.state !== 'alive' || e.vehicle) continue;
      consider(e, e.chest(_c));
    }
    for (const v of g.vehicles) {
      if (!v.alive || v.team === s.team || !v.driver) continue;
      consider(v, _c.set(v.pos.x, v.pos.y + 1.6, v.pos.z));
    }
    if (best) {
      best.spottedUntil = g.time + 8;
      best.miniUntil = Math.max(best.miniUntil || 0, g.time + 8);
    }
    return best;
  }
}
