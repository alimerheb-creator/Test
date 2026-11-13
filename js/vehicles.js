// Main battle tank: drivable by the player or a bot, crushes walls and trees, stabilised turret.
import * as THREE from 'three';
import { TEAMS, HQS, WEAPONS, PLAY_HALF, VEHICLES } from './config.js';
import { clamp, wrapAngle, rayAABB, rand, dirFromAngles, randomInCone } from './util.js';
import { Gun } from './weapons.js';
import { ABRAMS } from './abrams.js';
import { T90 } from './t90.js';

const HW = 1.95, HL = 3.55;
let MAT = null, WRECK = null;
const GEOS = {};

// A modern main battle tank: sloped glacis, side skirts over seven road wheels a side with the track running round
// the sprocket and idler, a wedge-fronted turret with a bustle, commander's cupola and machine gun, the gunner's
// sight, smoke dischargers and engine grilles. Mud and dust are baked into the paint low down (vertex colours);
// the material adds mottling on top (tankMaterial)
const _tc = new THREE.Color(), MUD = new THREE.Color(0x5b4b38);
function weather(geo, y0) {
  const pos = geo.attributes.position, col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i) + y0, z = pos.getZ(i);
    const n = Math.sin(x * 3.1 + z * 1.7) * 0.5 + Math.sin(z * 4.3 - x * 2.2) * 0.5;
    const dirt = clamp((1.15 - y) / 0.95, 0, 1) * (0.55 + 0.25 * n);
    _tc.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(MUD, clamp(dirt, 0, 0.85));
    col.setXYZ(i, _tc.r, _tc.g, _tc.b);
  }
  return geo;
}
// Vanguard's tank is the M1 Abrams (abrams.js), Onyx's the T-90 (t90.js): real 3D models, each unpacked once, then
// painted for its team (the body in the team's colour, the rest in its own: tracks, guns, lamps, stowage) and
// weathered (mud low down). Each has a full close-up version (Ultra), a lighter one and a far one; the Abrams also its
// burnt-out wreck (the T-90 just goes black)
const PACKED = new Map();
function packedParts(D) {
  if (PACKED.has(D)) return PACKED.get(D);
  const raw = atob(D.bin), buf = new ArrayBuffer(raw.length), u8 = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
  const ABR = {};
  PACKED.set(D, ABR);
  for (const h of D.parts) {
    const n = h.v, P = new Int16Array(buf, h.po, n * 3), N = new Int8Array(buf, h.no, n * 3);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) { const j = i % 3; pos[i] = D.lo[j] + ((P[i] + 32767) / 65534) * (D.hi[j] - D.lo[j]); nor[i] = N[i] / 127; }
    ABR[h.n] = {
      pos: new THREE.BufferAttribute(pos, 3), nor: new THREE.BufferAttribute(nor, 3), mats: new Uint8Array(buf, h.mo, n),
      index: new THREE.BufferAttribute(h.i32 ? new Uint32Array(buf.slice(h.io, h.io + h.i * 4)) : new Uint16Array(buf.slice(h.io, h.io + h.i * 2)), 1),
    };
  }
  return ABR;
}
// (ultra: the full close-up model, else the lighter one; far off and the wreck the same for every quality)
function realGeos(D, team, ultra) {
  const R = packedParts(D), base = new THREE.Color(TEAMS[team].tank);
  const PAL = { body: base, detail: base.clone().multiplyScalar(0.8), steel: 0x5c5c58, track: 0x2a2927, lamp: 0x8a1a14, gun: 0x1d1d1c,
    brass: 0x8a6a20, olive: 0x3a3a26, green: 0x34452a, black: 0x141414, scorch: 0x121110, rust: 0x5a3a1c };
  const cols = D.mats.map((m) => new THREE.Color(PAL[m] ?? 0x5c5c58));
  const make = (name, y0) => {
    const r = R[name], g = new THREE.BufferGeometry(), n = r.mats.length, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = cols[r.mats[i]]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('position', r.pos); g.setAttribute('normal', r.nor); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(r.index);
    g.computeBoundingSphere();
    g.userData.real = true;
    return weather(g, y0);
  };
  const ty = D.turret[1], by = ty + D.trunnion[1], s = ultra ? '' : '@1';
  return {
    hull: make('hull' + s, 0), turret: make('turret' + s, ty), barrel: make('barrel' + s, by),
    far: { hull: make('hull@2', 0), turret: make('turret@2', ty), barrel: make('barrel@2', by) },
    wreck: R['wreck@1'] ? make('wreck@1', 0) : null, tp: D.turret, bp: D.trunnion, muzzle: D.muzzle + 0.1,
  };
}
// The team's tank geometry, made again only when a mod changes the team's tank colour (or Ultra is switched on or off)
function tankGeos(team, ultra = false) {
  const col = TEAMS[team].tank;
  if (GEOS[team] && GEOS[team].color === col && GEOS[team].ultra === ultra) return GEOS[team];
  const old = GEOS[team];
  GEOS[team] = realGeos(team === 0 ? ABRAMS : T90, team, ultra);
  GEOS[team].color = col; GEOS[team].ultra = ultra;
  if (old) for (const geo of [old.hull, old.turret, old.barrel, old.wreck, ...(old.far ? Object.values(old.far) : [])]) if (geo) geo.dispose();
  return GEOS[team];
}
// Close up the Abrams is the full model; beyond this many metres (seen at the normal field of view: zoomed in through
// a sight it counts as nearer) the far one. Ultra keeps the full model furthest out, Low swaps soonest
const LOD_DIST = { low: 60, medium: 85, high: 120, ultra: 200 };
const TAN35 = Math.tan((35 * Math.PI) / 180);

// Painted armour: the vertex colours (paint and mud) mottled by a grime texture projected from three sides in the
// tank's own space, so it sticks to the hull as it moves
function tankMaterial(grime) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.25 });
  if (!grime) return m;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.grimeMap = { value: grime };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjP; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjP = position; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vObjP; varying vec3 vObjN; uniform sampler2D grimeMap;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gw = abs(normalize(vObjN)) + 1e-4; gw /= gw.x + gw.y + gw.z;
        float gn = texture2D(grimeMap, vObjP.zy * 0.42).r * gw.x + texture2D(grimeMap, vObjP.xz * 0.42).r * gw.y + texture2D(grimeMap, vObjP.xy * 0.42).r * gw.z;
        diffuseColor.rgb *= 0.74 + 0.5 * gn;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (1.15 - 0.3 * gn), 0.3, 1.0);');
  };
  m.customProgramCacheKey = () => 'tank-grime';
  return m;
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
      MAT = tankMaterial(this.game.world && this.game.world.tex && this.game.world.tex.grime);
      WRECK = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x2a2826, roughness: 1, metalness: 0.1 });
    }
    const g = tankGeos(this.team, (this.game.qualityName ? this.game.qualityName() : 'high') === 'ultra');
    this._geos = g;
    this._far = false;
    this.muzzle = g.muzzle;
    this.hull = new THREE.Group();
    this.hull.rotation.order = 'YXZ';
    this.hullMesh = new THREE.Mesh(g.hull, MAT);
    this.turret = new THREE.Group();
    this.turret.position.set(...g.tp);
    this.turretMesh = new THREE.Mesh(g.turret, MAT);
    this.barrelPivot = new THREE.Group();
    this.barrelPivot.position.set(...g.bp);
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
    // the Abrams burns out into its wreck: the turret knocked askew, a track thrown, wheels off (unless a mission has
    // dressed the tank as another one; the T-90 has no wreck model and just goes black)
    const G = this._geos;
    if (G && G.wreck && this.hullMesh.geometry.userData.real) {
      this.hullMesh.geometry = w ? G.wreck : G.hull; this.turretMesh.geometry = G.turret; this.barrelMesh.geometry = G.barrel;
      this.turretMesh.visible = this.barrelMesh.visible = !w;
      this._far = false;
    }
  }

  // The tank's close-up or far model, by how far it is from the camera (not when a mission has dressed it as another)
  _lod() {
    const G = this._geos, cam = this.game.camera;
    if (!G || !G.far || !cam || !this.hullMesh.geometry.userData.real || this.hullMesh.geometry === G.wreck) return;
    const q = this.game.qualityName ? this.game.qualityName() : 'high', d = LOD_DIST[q] || 120;
    const k = Math.tan((cam.fov * Math.PI) / 360) / TAN35;
    const far = cam.position.distanceToSquared(this.pos) * k * k > d * d;
    const S = far ? G.far : G;
    if (this.hullMesh.geometry === S.hull && this.turretMesh.geometry === S.turret) return;
    this._far = far;
    this.hullMesh.geometry = S.hull; this.turretMesh.geometry = S.turret; this.barrelMesh.geometry = S.barrel;
  }

  // Rebuild the mesh after a mod changes the team's tank colour
  rebuildModel() {
    this.game.scene.remove(this.hull);
    this._build();
    this.coax = new Gun(WEAPONS.coax);
    this.maxHealth = VEHICLES.tank.health;
    this.health = Math.min(this.health, this.maxHealth);
  }

  spawn() {
    this._lastMark = null;
    const hq = HQS[this.team];
    const side = this.slot === 0 ? -1 : 1;
    // Park beside the HQ, relative to the way it faces (map mods can put HQs anywhere)
    const fx = -Math.sin(hq.yaw), fz = -Math.cos(hq.yaw), rx = Math.cos(hq.yaw), rz = -Math.sin(hq.yaw);
    this.yaw = hq.yaw;
    this.speed = 0;
    for (const [ox, oz] of [[16, 4], [22, 4], [10, 10], [16, -4], [26, -6], [8, -8]]) {
      this.pos.set(hq.x + rx * side * ox - fx * oz, 0, hq.z + rz * side * ox - fz * oz);
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
    if (this.game.hasFilter('vehicleDamage')) {
      const f = this.game.filter('vehicleDamage', { vehicle: this, attacker, amount, weapon });
      if (!f) return;
      amount = Number(f.amount) || 0;
      if (amount <= 0) return;
    }
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
    return out.addScaledVector(d, this.muzzle || 5.4);
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
      if (!c.ready && !c.reloading) c.startReload();
      return;
    }
    c.consume();
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
    if (this.hull.visible) this._lod();
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
    // the tracks' prints in the dirt behind it, a pair every metre it actually moves
    const lm = this._lastMark || (this._lastMark = { x: this.pos.x, z: this.pos.z });
    if ((this.pos.x - lm.x) ** 2 + (this.pos.z - lm.z) ** 2 > 0.9) { lm.x = this.pos.x; lm.z = this.pos.z; this.game.effects.trackMark(this.pos.x, this.pos.z, this.yaw, 1.55); }

    // Stabilised turret
    const rel = wrapAngle(inp.aimYaw - this.turretYaw);
    const tr = T.turretSpeed * dt;
    this.turretYaw = wrapAngle(this.turretYaw + clamp(rel, -tr, tr));
    this.gunPitch += clamp(clamp(inp.aimPitch, -0.14, 0.38) - this.gunPitch, -0.8 * dt, 0.8 * dt);

    this.reload -= dt;
    this.recoilT = Math.max(0, this.recoilT - dt * 3);
    if (inp.fire && this.reload <= 0) this.fireCannon();
    const cev = this.coax.update(dt, true);
    if (cev && this.driver && this.driver.isPlayer) {
      const kinds = { out: 'cover', in: 'belt', charge: 'charge' };
      if (kinds[cev]) this.game.audio.foley(kinds[cev], 0, 0, 0, true, 0.8);
    }
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
