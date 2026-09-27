// Soldier entity shared by the player and bots: movement physics, health/downed state, model.
import * as THREE from 'three';
import { TEAMS, MOVE, RULES, CLASSES, WEAPONS, GADGETS } from './config.js';
import { mergeParts, raySphere, rayAABB, dirFromAngles, pick, clamp } from './util.js';
import { Gun } from './weapons.js';

export const RADIUS = 0.34;
const STEP = 0.55;
export const HEIGHTS = [1.8, 1.25, 0.6];
export const EYES = [1.62, 1.1, 0.42];
const SKINS = [0xc79a7a, 0x9c6e4f, 0x6b4a35, 0xe0b594];

const _tmp = [];
const _v = new THREE.Vector3();

// ---------------------------------------------------------------- shared model geometry
let MAT = null;
const GEO = new Map();

function limb(x0, y0, z0, x1, y1, z1, t, c) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const geo = new THREE.CapsuleGeometry(t / 2, Math.max(0.01, len - t), 2, 7);
  geo.rotateX(Math.PI / 2);
  return { geo, p: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], c, r: [-Math.asin(dy / len), Math.atan2(dx, dz), 0] };
}

function sphere(r, sx, sy, sz, p, c, partial = false) {
  const geo = partial
    ? new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55)
    : new THREE.SphereGeometry(r, 10, 8);
  geo.scale(sx, sy, sz);
  return { geo, p, c };
}

function modelGeos(team, skin) {
  const key = `${team}:${skin}`;
  if (GEO.has(key)) return GEO.get(key);
  const T = TEAMS[team];
  const gunDark = 0x1f2022, gunMid = 0x2c2d30, glove = 0x2a2724;
  const torso = mergeParts([
    // torso, vest, pouches, pack
    { s: [0.4, 0.5, 0.24], p: [0, 0.28, 0], c: T.top },
    { s: [0.45, 0.34, 0.3], p: [0, 0.3, 0], c: T.vest },
    { s: [0.11, 0.11, 0.06], p: [-0.12, 0.2, -0.17], c: T.vest },
    { s: [0.11, 0.11, 0.06], p: [0.0, 0.2, -0.17], c: T.vest },
    { s: [0.11, 0.11, 0.06], p: [0.12, 0.2, -0.17], c: T.vest },
    { s: [0.33, 0.38, 0.15], p: [0, 0.32, 0.21], c: T.vest },
    { s: [0.28, 0.08, 0.12], p: [0, 0.54, 0.22], c: T.helmet },
    sphere(0.085, 1, 1, 1, [-0.215, 0.47, 0.0], T.top),
    sphere(0.085, 1, 1, 1, [0.215, 0.47, 0.0], T.top),
    // neck, head, helmet with rim and goggles
    { geo: new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8), p: [0, 0.57, 0], c: skin },
    sphere(0.11, 1, 1.15, 1.05, [0, 0.71, -0.01], skin),
    sphere(0.145, 1, 0.95, 1.08, [0, 0.74, 0.0], T.helmet, true),
    { geo: new THREE.CylinderGeometry(0.152, 0.152, 0.025, 14), p: [0, 0.745, 0.005], c: T.helmet },
    { s: [0.17, 0.045, 0.03], p: [0, 0.735, -0.115], c: 0x1a1a1a },
    // right arm to pistol grip, left arm to handguard
    limb(0.22, 0.47, 0.02, 0.22, 0.28, -0.16, 0.115, T.top),
    limb(0.22, 0.28, -0.16, 0.08, 0.3, -0.36, 0.1, T.top),
    limb(-0.22, 0.47, 0.02, -0.2, 0.3, -0.22, 0.115, T.top),
    limb(-0.2, 0.3, -0.22, 0.03, 0.36, -0.56, 0.1, T.top),
    sphere(0.05, 1, 1, 1.2, [0.08, 0.3, -0.38], glove),
    sphere(0.05, 1, 1, 1.2, [0.04, 0.35, -0.58], glove),
    // rifle
    { s: [0.06, 0.1, 0.42], p: [0.06, 0.38, -0.45], c: gunMid },
    { s: [0.06, 0.07, 0.22], p: [0.06, 0.38, -0.76], c: gunDark },
    { s: [0.045, 0.15, 0.07], p: [0.06, 0.27, -0.46], c: gunDark },
    { geo: new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), r: [Math.PI / 2, 0, 0], p: [0.06, 0.39, -0.99], c: gunDark },
    { s: [0.05, 0.09, 0.22], p: [0.06, 0.35, -0.12], c: gunDark },
    { s: [0.04, 0.05, 0.08], p: [0.06, 0.455, -0.48], c: gunDark },
  ]);
  const leg = mergeParts([
    { geo: new THREE.CapsuleGeometry(0.085, 0.7, 2, 7), p: [0, -0.44, 0], c: T.pants },
    { s: [0.16, 0.12, 0.05], p: [0, -0.46, -0.09], c: T.vest },
    { s: [0.15, 0.12, 0.28], p: [0, -0.9, -0.045], c: 0x2b2622 },
  ]);
  const pelvis = mergeParts([
    { s: [0.37, 0.2, 0.23], p: [0, 0, 0], c: T.pants },
    { s: [0.39, 0.06, 0.25], p: [0, 0.08, 0], c: 0x2f2b24 },
    { s: [0.08, 0.1, 0.06], p: [0.2, -0.04, -0.02], c: T.vest },
  ]);
  const g = { torso, leg, pelvis };
  GEO.set(key, g);
  return g;
}

// Mods can recolour uniforms; drop cached geometry so the next soldiers pick it up
export function clearSoldierModelCache() {
  GEO.clear();
}

export class Soldier {
  constructor(game, { team, name, isPlayer = false, squad = 0, classId = 'assault' }) {
    this.game = game;
    this.team = team;
    this.name = name;
    this.isPlayer = isPlayer;
    this.squad = squad;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.jumped = false;
    this.stance = 0;
    this.eyeH = EYES[0];
    this.sprinting = false;
    this.slideT = 0;
    this.health = 100;
    this.state = 'inactive'; // inactive | alive | downed | dead
    this.downedT = 0;
    this.respawnT = 0;
    this.spawnProtect = 0;
    this.lastDamageT = -100;
    this.lastAttacker = null;
    this.damageBy = new Map();
    this.lastFireT = -100;
    this.spottedUntil = 0;   // visible to the enemy team (3D marker)
    this.miniUntil = 0;      // visible on the enemy minimap
    this.vehicle = null;
    this.guns = [];
    this.slot = 0;
    this.gadget = null;
    this.gadgetAmmo = 0;
    this.gadgetCd = 0;
    this.grenades = 0;
    this.adsT = 0;
    this.stats = { score: 0, kills: 0, deaths: 0, assists: 0, revives: 0, caps: 0 };
    this.walkPhase = Math.random() * 6;
    this.stepDist = 0;
    this.fallT = 0;
    this.bodyT = 0;
    this.brain = null;
    this._head = false;
    this.skin = pick(SKINS);
    this._buildModel();
    this.setClass(classId);
  }

  get cls() { return CLASSES[this.classId]; }
  get maxHealth() { return RULES.playerHealth; }
  get gun() { return this.slot < 2 ? this.guns[this.slot] : null; }
  get alive() { return this.state === 'alive'; }
  get height() { return HEIGHTS[this.stance]; }

  eye(out) { return out.set(this.pos.x, this.pos.y + this.eyeH, this.pos.z); }
  chest(out) {
    const h = this.stance === 2 ? 0.3 : this.eyeH * 0.72;
    return out.set(this.pos.x, this.pos.y + h, this.pos.z);
  }
  forward(out) { return dirFromAngles(this.yaw, this.pitch, out); }

  // ------------------------------------------------------------ model
  _buildModel() {
    if (!MAT) MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.04, envMapIntensity: 0.6 });
    const g = modelGeos(this.team, this.skin);
    const root = new THREE.Group();
    const body = new THREE.Group();
    const hip = new THREE.Group();
    hip.position.y = 0.95;
    const pelvis = new THREE.Mesh(g.pelvis, MAT);
    const legL = new THREE.Mesh(g.leg, MAT);
    const legR = new THREE.Mesh(g.leg, MAT);
    legL.position.x = -0.11;
    legR.position.x = 0.11;
    const torso = new THREE.Mesh(g.torso, MAT);
    torso.position.y = 0.08;
    for (const m of [pelvis, legL, legR, torso]) { m.castShadow = true; m.receiveShadow = false; hip.add(m); }
    body.add(hip);
    root.add(body);
    root.visible = false;
    this.model = { root, body, hip, legL, legR, torso };
    this.game.scene.add(root);
  }

  dispose() {
    this.game.scene.remove(this.model.root);
  }

  setClass(id) {
    this.classId = id;
    const c = CLASSES[id];
    this.guns = [new Gun(WEAPONS[c.primary]), new Gun(WEAPONS[c.secondary])];
    this.gadget = GADGETS[c.gadget];
    this.gadgetAmmo = this.gadget.ammo;
    this.gadgetCd = 0;
    this.grenades = c.grenades;
    this.slot = 0;
  }

  refill(full = true) {
    for (const g of this.guns) g.refill(full);
    if (full) {
      this.gadgetAmmo = this.gadget.ammo;
      this.grenades = this.cls.grenades;
    }
  }

  spawn(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.stance = 0;
    this.eyeH = EYES[0];
    this.health = RULES.playerHealth;
    this.state = 'alive';
    this.spawnProtect = RULES.spawnProtection;
    this.downedT = 0;
    this.fallT = 0;
    this.bodyT = 0;
    this.slideT = 0;
    this.vehicle = null;
    this.damageBy.clear();
    this.lastAttacker = null;
    this.slot = 0;
    this.adsT = 0;
    this.onGround = false;
    this.refill(true);
    const m = this.model;
    m.body.rotation.set(0, 0, 0);
    m.body.position.set(0, 0, 0);
    if (this.brain) this.brain.reset();
    this.game.emit('spawn', this);
  }

  canStand(st) {
    return this.game.world.isFree(this.pos.x, this.pos.y + 0.05, this.pos.z, RADIUS * 0.9, HEIGHTS[st]);
  }

  setStance(st) {
    if (st === this.stance) return true;
    if (st < this.stance && !this.canStand(st)) return false;
    this.stance = st;
    return true;
  }

  // ------------------------------------------------------------ physics
  move(dt, wx, wz, speed, jump) {
    const accel = this.onGround ? MOVE.accel : MOVE.airAccel;
    const ax = wx * speed - this.vel.x, az = wz * speed - this.vel.z;
    const al = Math.sqrt(ax * ax + az * az), maxA = accel * dt;
    if (al > maxA) { this.vel.x += (ax / al) * maxA; this.vel.z += (az / al) * maxA; }
    else { this.vel.x += ax; this.vel.z += az; }
    if (jump && this.onGround && this.stance === 0) {
      this.vel.y = MOVE.jump;
      this.onGround = false;
      this.jumped = true;
    }
    this.physics(dt);
  }

  physics(dt) {
    const wasGround = this.onGround;
    this.vel.y -= RULES.gravity * dt;
    if (this.vel.y < -45) this.vel.y = -45;
    const fallSpeed = -this.vel.y;
    const dx = this.vel.x * dt, dz = this.vel.z * dt, dy = this.vel.y * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz), Math.abs(dy)) / 0.25));
    this.onGround = false;
    this.blocked = false;
    for (let i = 0; i < steps; i++) {
      this._axis(0, dx / steps, wasGround);
      this._axis(2, dz / steps, wasGround);
      this._vert(dy / steps);
    }
    if (!this.onGround && wasGround && this.vel.y <= 0 && !this.jumped) {
      const g = this._supportBelow(0.5);
      if (g !== null) { this.pos.y = g; this.vel.y = 0; this.onGround = true; }
    }
    if (RULES.fallDamage && this.onGround && !wasGround && fallSpeed > 15) {
      this.takeDamage((fallSpeed - 15) * 9, null, { weapon: 'FALL', force: true });
    }
    this.jumped = false;
    for (const v of this.game.vehicles) v.pushOut(this);
    const lim = 330;
    if (this.pos.x > lim) this.pos.x = lim; else if (this.pos.x < -lim) this.pos.x = -lim;
    if (this.pos.z > lim) this.pos.z = lim; else if (this.pos.z < -lim) this.pos.z = -lim;
  }

  _axis(axis, d, wasGround) {
    if (d === 0) return;
    const p = this.pos, w = this.game.world, R = RADIUS, h = this.height;
    if (axis === 0) p.x += d; else p.z += d;
    const boxes = w.queryBoxes(p.x - R, p.y + 0.01, p.z - R, p.x + R, p.y + h, p.z + R, _tmp);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!(p.x + R > b.minX && p.x - R < b.maxX && p.z + R > b.minZ && p.z - R < b.maxZ && p.y + h > b.minY && p.y + 0.01 < b.maxY)) continue;
      const rise = b.maxY - p.y;
      if (rise > 0 && rise <= STEP && (wasGround || this.onGround) && w.isFree(p.x, b.maxY, p.z, R, h)) {
        p.y = b.maxY;
        this.onGround = true;
        continue;
      }
      if (axis === 0) { p.x = d > 0 ? b.minX - R - 1e-4 : b.maxX + R + 1e-4; this.vel.x = 0; }
      else { p.z = d > 0 ? b.minZ - R - 1e-4 : b.maxZ + R + 1e-4; this.vel.z = 0; }
      this.blocked = true;
    }
  }

  _vert(d) {
    const p = this.pos, w = this.game.world, R = RADIUS, h = this.height;
    p.y += d;
    const boxes = w.queryBoxes(p.x - R, p.y, p.z - R, p.x + R, p.y + h, p.z + R, _tmp);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (d <= 0) {
        if (b.maxY - p.y <= -d + 0.08) {
          p.y = b.maxY;
          if (this.vel.y < 0) this.vel.y = 0;
          this.onGround = true;
        }
      } else if (b.minY >= p.y + h - d - 0.08) {
        p.y = b.minY - h - 0.001;
        if (this.vel.y > 0) this.vel.y = 0;
      }
    }
    const g = w.heightAt(p.x, p.z);
    if (p.y <= g) {
      p.y = g;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    }
  }

  _supportBelow(maxDrop) {
    const p = this.pos, w = this.game.world, r = RADIUS * 0.7;
    let best = w.heightAt(p.x, p.z);
    const boxes = w.queryBoxes(p.x - r, p.y - maxDrop, p.z - r, p.x + r, p.y + 0.02, p.z + r, _tmp);
    for (const b of boxes) if (b.maxY <= p.y + 0.02 && b.maxY > best) best = b.maxY;
    return p.y - best <= maxDrop ? best : null;
  }

  // ------------------------------------------------------------ combat state
  takeDamage(amount, attacker, info = {}) {
    if (this.state !== 'alive') return false;
    if (this.spawnProtect > 0 && !info.force) return false;
    if (attacker && attacker !== this && attacker.team === this.team) return false;
    if (attacker === this) amount *= 0.5;
    if (!info.force) amount *= RULES.damageScale;
    this.health -= amount;
    this.lastDamageT = this.game.time;
    if (attacker && attacker !== this) {
      this.lastAttacker = attacker;
      this.damageBy.set(attacker, (this.damageBy.get(attacker) || 0) + amount);
    }
    this.game.emit('damage', { victim: this, attacker, amount, info });
    if (this.health <= 0) {
      this.die(attacker, info);
      return true;
    }
    return false;
  }

  die(attacker, info = {}) {
    if (this.state !== 'alive') return;
    this.health = 0;
    if (this.vehicle) this.vehicle.removeDriver(this, false);
    const revivable = !info.noRevive;
    this.state = revivable ? 'downed' : 'dead';
    this.downedT = revivable ? RULES.downedTime + (this.isPlayer ? 4 : 0) : 0;
    this.respawnT = RULES.respawnTime;
    this.fallT = 0;
    this.bodyT = 0;
    this.slideT = 0;
    this.adsT = 0;
    this.stance = 0;
    this.stats.deaths++;
    this.deathYaw = attacker ? Math.atan2(-(attacker.pos.x - this.pos.x), -(attacker.pos.z - this.pos.z)) : this.yaw;
    this.game.emit('kill', { victim: this, killer: attacker && attacker !== this ? attacker : null, weapon: info.weapon || '', headshot: !!info.headshot, self: attacker === this });
    if (!revivable) this.game.mode.ticketLoss(this.team);
  }

  revive(by) {
    if (this.state !== 'downed') return;
    this.state = 'alive';
    this.health = Math.max(1, RULES.playerHealth * 0.45);
    this.downedT = 0;
    this.fallT = 0;
    this.spawnProtect = 1;
    this.damageBy.clear();
    this.model.body.rotation.set(0, 0, 0);
    this.model.body.position.set(0, 0, 0);
    if (this.brain) this.brain.reset();
    this.game.emit('revive', { soldier: this, by });
  }

  bleedOut() {
    if (this.state !== 'downed') return;
    this.state = 'dead';
    this.respawnT = this.isPlayer ? 0 : RULES.respawnTime;
    this.game.mode.ticketLoss(this.team);
    this.game.emit('bleedout', this);
  }

  update(dt) {
    if (this.state === 'alive') {
      if (this.spawnProtect > 0) this.spawnProtect -= dt;
      for (let i = 0; i < this.guns.length; i++) this.guns[i].update(dt, i === this.slot);
      if (this.gadgetCd > 0) this.gadgetCd -= dt;
      if (this.gadget.recharge && this.gadgetAmmo < this.gadget.ammo && this.gadgetCd <= 0) this.gadgetAmmo = this.gadget.ammo;
      const maxHp = RULES.playerHealth;
      if (this.game.time - this.lastDamageT > RULES.regenDelay && this.health < maxHp) this.health = Math.min(maxHp, this.health + RULES.regenRate * dt);
      const targetEye = EYES[this.stance];
      this.eyeH += (targetEye - this.eyeH) * Math.min(1, dt * 12);
      // footsteps
      if (this.onGround && !this.vehicle) {
        const sp = Math.hypot(this.vel.x, this.vel.z);
        this.stepDist += sp * dt;
        const stride = this.sprinting ? 2.6 : 2.0;
        if (this.stepDist > stride && this.stance < 2) {
          this.stepDist = 0;
          const a = this.game.audio;
          if (this.isPlayer) a.footstep(this.pos.x, this.pos.y, this.pos.z, this.sprinting ? 0.9 : 0.6);
          else a.footstep(this.pos.x, this.pos.y, this.pos.z, this.sprinting ? 0.8 : 0.5);
        }
      }
    } else if (this.state === 'downed') {
      this.downedT -= dt;
      this.fallT = Math.min(1, this.fallT + dt * 2.5);
      if (this.downedT <= 0) this.bleedOut();
    } else if (this.state === 'dead') {
      this.respawnT -= dt;
      this.bodyT += dt;
      this.fallT = Math.min(1, this.fallT + dt * 2.5);
    }
    this.updateModel(dt);
  }

  updateModel(dt) {
    const m = this.model;
    const visible = !this.isPlayer && !this.vehicle && this.state !== 'inactive' && !(this.state === 'dead' && this.bodyT > 10);
    m.root.visible = visible;
    if (!visible) return;
    m.root.position.copy(this.pos);
    if (this.state !== 'alive') {
      m.root.rotation.y = this.deathYaw ?? this.yaw;
      const t = this.fallT;
      const e = t * t * (3 - 2 * t);
      m.body.rotation.set(e * Math.PI * 0.5, 0, e * 0.25);
      m.body.position.set(0, e * 0.15, 0);
      m.hip.position.y = 0.95;
      m.legL.rotation.x = 0.1; m.legR.rotation.x = -0.15;
      m.torso.rotation.x = 0;
      return;
    }
    m.root.rotation.y = this.yaw;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.walkPhase += sp * dt * (this.sprinting ? 1.6 : 2.1);
    const amp = Math.min(1, sp / 4) * (this.sprinting ? 0.85 : 0.55);
    const sw = Math.sin(this.walkPhase) * amp;
    if (this.stance === 2) {
      m.body.rotation.set(-Math.PI / 2, 0, 0);
      m.body.position.set(0, 0.22, 0.85);
      m.hip.position.y = 0.95;
      m.legL.rotation.x = sw * 0.3; m.legR.rotation.x = -sw * 0.3;
      m.torso.rotation.x = clamp(this.pitch, -0.3, 0.6) + 0.15;
    } else if (this.stance === 1) {
      m.body.rotation.set(0, 0, 0);
      m.body.position.set(0, 0, 0);
      m.hip.position.y = 0.62;
      m.legL.rotation.x = -0.55 + sw * 0.5;
      m.legR.rotation.x = 0.95 - sw * 0.5;
      m.torso.rotation.x = this.pitch * 0.7;
    } else {
      m.body.rotation.set(0, 0, 0);
      m.body.position.set(0, 0, 0);
      m.hip.position.y = 0.95 + Math.abs(Math.cos(this.walkPhase)) * amp * 0.05;
      m.legL.rotation.x = sw;
      m.legR.rotation.x = -sw;
      m.torso.rotation.x = this.pitch * 0.7 - (this.sprinting ? 0.25 : 0);
    }
  }

  // Hit test against head sphere + body box. Sets this._head.
  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    if (this.state !== 'alive' || this.vehicle) return Infinity;
    const p = this.pos;
    const lx = p.x - ox, ly = p.y + 0.8 - oy, lz = p.z - oz;
    const tc = lx * dx + ly * dy + lz * dz;
    const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
    if (d2 > 1.9 || tc < -1.5 || tc > maxT + 1.5) return Infinity;
    let head, body;
    if (this.stance === 2) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      head = raySphere(ox, oy, oz, dx, dy, dz, p.x + fx * 0.75, p.y + 0.3, p.z + fz * 0.75, 0.17, maxT);
      body = rayAABB(ox, oy, oz, dx, dy, dz, p.x - 0.45, p.y, p.z - 0.45, p.x + 0.45, p.y + 0.42, p.z + 0.45, maxT);
    } else {
      head = raySphere(ox, oy, oz, dx, dy, dz, p.x, p.y + this.eyeH + 0.06, p.z, 0.15, maxT);
      body = rayAABB(ox, oy, oz, dx, dy, dz, p.x - 0.27, p.y, p.z - 0.27, p.x + 0.27, p.y + this.eyeH - 0.12, p.z + 0.27, maxT);
    }
    if (head <= body) { this._head = head < Infinity; return head; }
    this._head = false;
    return body;
  }

  muzzle(out) {
    // Approximate third-person muzzle position
    const f = dirFromAngles(this.yaw, this.pitch, _v);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    return out.set(
      this.pos.x + f.x * 0.9 + rx * 0.08,
      this.pos.y + this.eyeH - 0.2 + f.y * 0.9,
      this.pos.z + f.z * 0.9 + rz * 0.08,
    );
  }
}
