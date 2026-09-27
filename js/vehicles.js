// Main battle tank: drivable by the player or a bot, crushes walls and trees, stabilised turret.
import * as THREE from 'three';
import { TEAMS, HQS, WEAPONS, PLAY_HALF, VEHICLES } from './config.js';
import { mergeParts, clamp, wrapAngle, rayAABB, rand, dirFromAngles, randomInCone } from './util.js';
import { Gun } from './weapons.js';

const HW = 1.95, HL = 3.55;
let MAT = null, WRECK = null;
const GEOS = {};

function tankGeos(team) {
  if (GEOS[team]) return GEOS[team];
  const base = TEAMS[team].tank;
  const dark = new THREE.Color(base).multiplyScalar(0.7).getHex();
  const wheels = [];
  for (let i = 0; i < 6; i++) {
    for (const sx of [-1, 1]) {
      wheels.push({ geo: new THREE.CylinderGeometry(0.38, 0.38, 0.22, 10), r: [0, 0, Math.PI / 2], p: [sx * 1.93, 0.45, -2.6 + i * 1.04], c: 0x34332f });
    }
  }
  const hull = mergeParts([
    { s: [3.3, 0.9, 6.5], p: [0, 0.95, 0], c: base },
    { s: [3.1, 0.55, 1.5], p: [0, 1.18, -3.05], c: base, r: [-0.55, 0, 0] },
    { s: [0.72, 0.95, 7.0], p: [-1.58, 0.55, 0], c: 0x262624 },
    { s: [0.72, 0.95, 7.0], p: [1.58, 0.55, 0], c: 0x262624 },
    { s: [0.86, 0.1, 6.9], p: [-1.58, 1.1, 0], c: base },
    { s: [0.86, 0.1, 6.9], p: [1.58, 1.1, 0], c: base },
    { s: [2.3, 0.28, 1.8], p: [0, 1.52, 2.4], c: dark },
    { s: [0.3, 0.25, 0.12], p: [-1.25, 1.25, -3.3], c: 0xe8dcae },
    { s: [0.3, 0.25, 0.12], p: [1.25, 1.25, -3.3], c: 0xe8dcae },
    { s: [0.5, 0.5, 0.6], p: [-1.2, 1.55, 3.0], c: dark },
    { s: [0.5, 0.5, 0.6], p: [1.2, 1.55, 3.0], c: dark },
    ...wheels,
  ]);
  const turret = mergeParts([
    { s: [2.5, 0.8, 3.0], p: [0, 0.4, 0.2], c: base },
    { s: [2.1, 0.55, 0.9], p: [0, 0.35, -1.45], c: base },
    { s: [1.6, 0.55, 0.9], p: [0, 0.42, 1.95], c: dark },
    { geo: new THREE.CylinderGeometry(0.42, 0.45, 0.35, 10), p: [0.6, 0.97, 0.5], c: dark },
    { s: [0.05, 1.8, 0.05], p: [-0.9, 1.6, 1.3], c: 0x1f1f1f },
    { s: [0.35, 0.25, 0.5], p: [-0.95, 0.9, -0.6], c: dark },
  ]);
  const barrel = mergeParts([
    { geo: new THREE.CylinderGeometry(0.1, 0.13, 5.0, 10), r: [Math.PI / 2, 0, 0], p: [0, 0, -2.6], c: base },
    { geo: new THREE.CylinderGeometry(0.17, 0.17, 0.7, 10), r: [Math.PI / 2, 0, 0], p: [0, 0, -3.3], c: dark },
    { geo: new THREE.CylinderGeometry(0.16, 0.14, 0.35, 10), r: [Math.PI / 2, 0, 0], p: [0, 0, -5.1], c: dark },
    { s: [0.6, 0.5, 0.5], p: [0, 0, -0.1], c: dark },
  ]);
  GEOS[team] = { hull, turret, barrel };
  return GEOS[team];
}

const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _tmp = [];

export class Tank {
  constructor(game, team, slot) {
    this.game = game;
    this.team = team;
    this.slot = slot;
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.turretYaw = 0;
    this.gunPitch = 0;
    this.pitch = 0;
    this.roll = 0;
    this.maxHealth = VEHICLES.tank.health;
    this.health = this.maxHealth;
    this.alive = false;
    this.exists = false;
    this.driver = null;
    this.reload = 0;
    this.respawnT = 0;
    this.recoilT = 0;
    this.input = { throttle: 0, steer: 0, aimYaw: 0, aimPitch: 0, fire: false, fireMG: false };
    this.coax = new Gun(WEAPONS.coax);
    this.lastDamageT = -100;
    this.lastAttacker = null;
    this.spottedUntil = 0;
    this.miniUntil = 0;
    this.name = 'TANK';
    this._build();
  }

  _build() {
    if (!MAT) {
      MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.3 });
      WRECK = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x2a2826, roughness: 1, metalness: 0.1 });
    }
    const g = tankGeos(this.team);
    this.hull = new THREE.Group();
    this.hull.rotation.order = 'YXZ';
    this.hullMesh = new THREE.Mesh(g.hull, MAT);
    this.turret = new THREE.Group();
    this.turret.position.set(0, 1.42, 0.3);
    this.turretMesh = new THREE.Mesh(g.turret, MAT);
    this.barrelPivot = new THREE.Group();
    this.barrelPivot.position.set(0, 0.45, -1.8);
    this.barrelMesh = new THREE.Mesh(g.barrel, MAT);
    this.barrelPivot.add(this.barrelMesh);
    this.turret.add(this.turretMesh, this.barrelPivot);
    this.hull.add(this.hullMesh, this.turret);
    for (const m of [this.hullMesh, this.turretMesh, this.barrelMesh]) { m.castShadow = true; m.receiveShadow = true; }
    this.hull.visible = false;
    this.game.scene.add(this.hull);
  }

  _setWreck(w) {
    for (const m of [this.hullMesh, this.turretMesh, this.barrelMesh]) m.material = w ? WRECK : MAT;
  }

  // Rebuild the mesh after a mod changes the team's tank colour
  rebuildModel() {
    this.game.scene.remove(this.hull);
    delete GEOS[this.team];
    this._build();
    this.coax = new Gun(WEAPONS.coax);
    this.maxHealth = VEHICLES.tank.health;
    this.health = Math.min(this.health, this.maxHealth);
  }

  spawn() {
    const hq = HQS[this.team];
    const side = this.slot === 0 ? -1 : 1;
    const back = this.team === 0 ? 1 : -1;
    this.yaw = hq.yaw;
    this.speed = 0;
    for (const [ox, oz] of [[16, 4], [22, 4], [10, 10], [16, -4], [26, -6], [8, -8]]) {
      this.pos.set(hq.x + side * ox, 0, hq.z + back * oz);
      this.pos.y = this.game.world.heightAt(this.pos.x, this.pos.z);
      if (!this._blockers(this.pos.x, this.pos.z, false).length) break;
    }
    this.turretYaw = hq.yaw;
    this.gunPitch = 0;
    this.speed = 0;
    this.health = this.maxHealth;
    this.alive = true;
    this.exists = true;
    this.driver = null;
    this.claimedBy = null;
    this.reload = 0;
    this.input.throttle = 0; this.input.steer = 0; this.input.fire = false; this.input.fireMG = false;
    this.input.aimYaw = this.yaw; this.input.aimPitch = 0;
    this.coax.refill(true);
    this._setWreck(false);
    this.hull.visible = true;
    this._ground(1);
    this._sync();
  }

  get center() { return _v.set(this.pos.x, this.pos.y + 1.4, this.pos.z); }

  enter(s) {
    if (!this.alive || this.driver) return false;
    this.driver = s;
    s.vehicle = this;
    s.stance = 0;
    s.sprinting = false;
    s.adsT = 0;
    this.input.aimYaw = this.turretYaw;
    this.input.aimPitch = this.gunPitch;
    this.game.emit('enterVehicle', { soldier: s, vehicle: this });
    return true;
  }

  removeDriver(s, place = true) {
    if (this.driver !== s) return;
    this.driver = null;
    s.vehicle = null;
    this.input.throttle = 0; this.input.steer = 0; this.input.fire = false; this.input.fireMG = false;
    if (!place) return;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const w = this.game.world;
    const opts = [[rx * 3.2, rz * 3.2], [-rx * 3.2, -rz * 3.2], [-fx * 4.8, -fz * 4.8], [fx * 4.8, fz * 4.8]];
    for (const [ox, oz] of opts) {
      const x = this.pos.x + ox, z = this.pos.z + oz;
      const y = w.heightAt(x, z);
      if (w.isFree(x, y, z, 0.4, 1.8)) {
        s.pos.set(x, y + 0.05, z);
        s.vel.set(0, 0, 0);
        this.game.emit('exitVehicle', { soldier: s, vehicle: this });
        return;
      }
    }
    s.pos.set(this.pos.x, this.pos.y + 2.6, this.pos.z);
    this.game.emit('exitVehicle', { soldier: s, vehicle: this });
  }

  damage(amount, attacker, weapon) {
    if (!this.alive || amount <= 0) return;
    if (attacker && attacker.team === this.team) return;
    this.health -= amount;
    this.lastDamageT = this.game.time;
    if (attacker) this.lastAttacker = attacker;
    if (this.driver) {
      this.driver.lastDamageT = this.game.time;
      this.game.emit('vehicleDamage', { vehicle: this, amount, attacker });
    }
    if (this.health <= 0) this.destroy(attacker, weapon);
  }

  destroy(attacker, weapon) {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.respawnT = VEHICLES.tank.respawn;
    const g = this.game;
    g.effects.explosion(this.pos.x, this.pos.y + 1.5, this.pos.z, 1.6);
    g.effects.explosion(this.pos.x, this.pos.y + 2.5, this.pos.z, 1.0);
    g.audio.explosion(this.pos.x, this.pos.y, this.pos.z, 1.5);
    this._setWreck(true);
    this.turret.rotation.z = rand(-0.2, 0.2);
    const d = this.driver;
    if (d) {
      this.driver = null;
      d.vehicle = null;
      d.pos.copy(this.pos);
      d.takeDamage(999, attacker, { weapon: weapon || 'EXPLOSION', force: true, noRevive: true, explosive: true });
    }
    g.emit('vehicleDestroyed', { vehicle: this, attacker, weapon });
  }

  // Soldiers can't walk through the hull
  pushOut(s) {
    if (!this.exists) return;
    const dx = s.pos.x - this.pos.x, dz = s.pos.z - this.pos.z;
    if (dx * dx + dz * dz > 30 || s.pos.y > this.pos.y + 2.5) return;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    let lx = dx * rx + dz * rz, lf = dx * fx + dz * fz;
    const R = 0.36;
    if (Math.abs(lx) >= HW + R || Math.abs(lf) >= HL + R) return;
    const px = HW + R - Math.abs(lx), pf = HL + R - Math.abs(lf);
    if (px < pf) lx = Math.sign(lx || 1) * (HW + R);
    else lf = Math.sign(lf || 1) * (HL + R);
    s.pos.x = this.pos.x + lx * rx + lf * fx;
    s.pos.z = this.pos.z + lx * rz + lf * fz;
  }

  rayHit(ox, oy, oz, dx, dy, dz, maxT) {
    if (!this.exists) return Infinity;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const px = ox - this.pos.x, pz = oz - this.pos.z;
    const olx = px * rx + pz * rz, olf = px * fx + pz * fz;
    const dlx = dx * rx + dz * rz, dlf = dx * fx + dz * fz;
    return rayAABB(olx, oy - this.pos.y, olf, dlx, dy, dlf, -HW, 0.1, -HL, HW, 2.55, HL, maxT);
  }

  barrelTip(out) {
    this.hull.updateMatrixWorld(true);
    this.barrelPivot.getWorldPosition(out);
    const d = dirFromAngles(this.turretYaw, this.gunPitch, _d);
    return out.addScaledVector(d, 5.4);
  }

  aimDir(out) { return dirFromAngles(this.turretYaw, this.gunPitch, out); }

  fireCannon() {
    const g = this.game;
    this.reload = this.driver && this.driver.isPlayer ? VEHICLES.tank.reload : VEHICLES.tank.botReload;
    const tip = this.barrelTip(new THREE.Vector3());
    const dir = this.aimDir(new THREE.Vector3());
    g.combat.launch('shell', this.driver, tip, dir);
    g.effects.muzzle(tip.x, tip.y, tip.z, dir.x, dir.y, dir.z, true);
    g.effects.flash(tip.x, tip.y, tip.z, 40, 30, 0.12);
    for (let i = 0; i < 16; i++) {
      g.effects.smoke.add(tip.x, tip.y, tip.z, dir.x * rand(2, 9) + rand(-2, 2), rand(0, 2), dir.z * rand(2, 9) + rand(-2, 2),
        rand(1, 2.2), 1, 4, 0xbfb6a8, 0.5, -0.2, 1.5);
    }
    // dust kicked up around the hull
    g.effects.dust(this.pos.x, this.pos.y + 0.5, this.pos.z, 5, 8, 0xa89a80);
    g.audio.cannon(tip.x, tip.y, tip.z);
    this.recoilT = 1;
    if (this.driver && this.driver.isPlayer) g.effects.addShake(0.45);
    this.driver && (this.driver.lastFireT = g.time);
  }

  fireCoax() {
    const c = this.coax;
    if (!c.canFire()) {
      if (c.mag <= 0) c.startReload();
      return;
    }
    c.mag--;
    c.cool = 60 / c.def.rpm;
    const g = this.game;
    this.hull.updateMatrixWorld(true);
    const o = this.barrelPivot.getWorldPosition(new THREE.Vector3());
    const dir = this.aimDir(new THREE.Vector3());
    const rx = Math.cos(this.turretYaw), rz = -Math.sin(this.turretYaw);
    o.x += rx * 0.45 + dir.x * 1.2; o.y += dir.y * 1.2; o.z += rz * 0.45 + dir.z * 1.2;
    const d = randomInCone(dir, 0.012, new THREE.Vector3());
    g.combat.fireBullet(this.driver, o, d, c.def, 1, o);
    g.audio.shot('lmg', o.x, o.y, o.z, this.driver && this.driver.isPlayer);
    g.effects.muzzle(o.x, o.y, o.z, d.x, d.y, d.z, false);
    if (this.driver) this.driver.lastFireT = g.time;
  }

  // Boxes that would block the hull at (px, pz). With `act`, walls and trees in the way get crushed.
  _blockers(px, pz, act) {
    const g = this.game, w = g.world;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const r = 1.95;
    const out = [];
    for (const o of [-2.3, 0, 2.3]) {
      const cx = px + fx * o, cz = pz + fz * o;
      w.queryBoxes(cx - r, this.pos.y + 0.6, cz - r, cx + r, this.pos.y + 2.6, cz + r, _tmp);
      for (const b of _tmp) {
        if (!b.active || out.includes(b)) continue;
        const qx = clamp(cx, b.minX, b.maxX), qz = clamp(cz, b.minZ, b.maxZ);
        if ((qx - cx) ** 2 + (qz - cz) ** 2 > r * r) continue;
        const d = b.data || {};
        if (d.rubble || b.maxY < this.pos.y + 1.0) continue;
        if (act && d.panel && Math.abs(this.speed) > 1.2) { g.buildings.crush(b, this.driver); this.speed *= 0.93; continue; }
        if (act && d.tree !== undefined) { w.destroyTree(d.tree); this.speed *= 0.9; continue; }
        out.push(b);
      }
    }
    return out;
  }

  _collide(nx, nz) {
    let blocked = false;
    const hits = this._blockers(nx, nz, true);
    if (hits.length) {
      // Only boxes we are not already stuck inside count, so a wedged tank can always drive out
      const now = this._blockers(this.pos.x, this.pos.z, false);
      blocked = hits.some((b) => !now.includes(b));
    }
    for (const v of this.game.vehicles) {
      if (v === this || !v.exists) continue;
      const dn = (v.pos.x - nx) ** 2 + (v.pos.z - nz) ** 2;
      const d0 = (v.pos.x - this.pos.x) ** 2 + (v.pos.z - this.pos.z) ** 2;
      if (dn < 42 && dn < d0) blocked = true;
    }
    return blocked;
  }

  _ground(dt) {
    const w = this.game.world;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const p = this.pos;
    const hF = w.heightAt(p.x + fx * 2.8, p.z + fz * 2.8), hB = w.heightAt(p.x - fx * 2.8, p.z - fz * 2.8);
    const hL = w.heightAt(p.x - rx * 1.5, p.z - rz * 1.5), hR = w.heightAt(p.x + rx * 1.5, p.z + rz * 1.5);
    const ty = (hF + hB + hL + hR) / 4;
    p.y += (ty - p.y) * Math.min(1, dt * 12);
    const tp = Math.atan2(hF - hB, 5.6), tr = Math.atan2(hR - hL, 3.0);
    this.pitch += (tp - this.pitch) * Math.min(1, dt * 8);
    this.roll += (tr - this.roll) * Math.min(1, dt * 8);
  }

  _sync() {
    this.hull.position.copy(this.pos);
    this.hull.rotation.set(this.pitch, this.yaw, this.roll);
    this.turret.rotation.y = this.turretYaw - this.yaw;
    this.barrelPivot.rotation.x = this.gunPitch - this.pitch * Math.cos(this.turretYaw - this.yaw);
    this.barrelMesh.position.z = this.recoilT * 0.45;
  }

  update(dt) {
    const g = this.game;
    if (!this.exists) return;
    if (!this.alive) {
      this.respawnT -= dt;
      if (Math.random() < dt * 14) {
        g.effects.smoke.add(this.pos.x + rand(-1, 1), this.pos.y + 2, this.pos.z + rand(-1, 1), rand(-0.5, 0.5), rand(2, 4), rand(-0.5, 0.5), rand(3, 5), 1.5, 6, 0x2a2622, 0.6, -0.3, 0.3);
        if (Math.random() < 0.5) g.effects.fire.add(this.pos.x + rand(-1, 1), this.pos.y + 1.8, this.pos.z + rand(-1, 1), 0, rand(1, 3), 0, rand(0.3, 0.6), 1.2, 0.3, 0xff8a30, 0.9);
      }
      if (this.respawnT <= 0) this.spawn();
      return;
    }
    const inp = this.input;
    if (!this.driver) { inp.throttle = 0; inp.steer = 0; inp.fire = false; inp.fireMG = false; }

    const T = VEHICLES.tank;
    const target = inp.throttle >= 0 ? inp.throttle * T.speed : inp.throttle * T.reverse;
    const acc = Math.abs(target) > Math.abs(this.speed) ? 4.5 : 9;
    this.speed += clamp(target - this.speed, -acc * dt, acc * dt);
    const turn = -inp.steer * T.turnRate * (this.speed < -0.5 ? -1 : 1);
    const oldYaw = this.yaw;
    this.yaw += turn * dt;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const nx = this.pos.x + fx * this.speed * dt, nz = this.pos.z + fz * this.speed * dt;
    if (this._collide(nx, nz)) {
      this.speed *= -0.2;
      if (this._collide(this.pos.x, this.pos.z)) this.yaw = oldYaw;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
    }
    const lim = PLAY_HALF + 25;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);
    this._ground(dt);

    // Stabilised turret
    const rel = wrapAngle(inp.aimYaw - this.turretYaw);
    const tr = T.turretSpeed * dt;
    this.turretYaw = wrapAngle(this.turretYaw + clamp(rel, -tr, tr));
    this.gunPitch += clamp(clamp(inp.aimPitch, -0.14, 0.38) - this.gunPitch, -0.8 * dt, 0.8 * dt);

    this.reload -= dt;
    this.recoilT = Math.max(0, this.recoilT - dt * 3);
    if (inp.fire && this.reload <= 0) this.fireCannon();
    this.coax.update(dt, true);
    if (inp.fireMG) this.fireCoax();

    // Roadkill
    if (Math.abs(this.speed) > 2.5) {
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      for (const s of g.soldiers) {
        if (s.state !== 'alive' || s.vehicle || s.team === this.team) continue;
        const dx = s.pos.x - this.pos.x, dz = s.pos.z - this.pos.z;
        if (dx * dx + dz * dz > 25) continue;
        const lx = dx * rx + dz * rz, lf = dx * fx + dz * fz;
        if (Math.abs(lx) < HW + 0.45 && Math.abs(lf) < HL + 0.6 && s.pos.y < this.pos.y + 2) {
          s.takeDamage(300, this.driver, { weapon: 'ROADKILL', noRevive: true });
        }
      }
    }

    if (g.time - this.lastDamageT > 7 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 20 * dt);
    if (this.health < this.maxHealth * 0.35 && Math.random() < dt * 10) {
      g.effects.smoke.add(this.pos.x - fx * 2.4, this.pos.y + 2, this.pos.z - fz * 2.4, rand(-0.4, 0.4), rand(1.5, 3), rand(-0.4, 0.4), 2.5, 1, 4, 0x3a3530, 0.55, -0.2, 0.3);
    }
    if (Math.abs(this.speed) > 3 && Math.random() < dt * 8) {
      g.effects.smoke.add(this.pos.x - fx * 3.4, this.pos.y + 0.3, this.pos.z - fz * 3.4, rand(-1, 1), rand(0.3, 1), rand(-1, 1), 1.6, 1, 3, 0xa89a80, 0.35, -0.1, 0.8);
    }

    if (this.driver) {
      this.driver.pos.copy(this.pos);
      this.driver.vel.set(fx * this.speed, 0, fz * this.speed);
    }
    this._sync();
  }
}
