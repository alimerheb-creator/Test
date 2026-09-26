// Bot brains: objective play, target acquisition with reaction time and aim error,
// burst fire, grenades, anti-tank rockets, reviving teammates, crates and tank driving.
import * as THREE from 'three';
import { DIFFICULTY, MOVE, PROJECTILES } from './config.js';
import { rand, randInt, clamp, wrapAngle, yawTo, dirFromAngles, chance } from './util.js';

const _eye = new THREE.Vector3(), _t = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3();

export class BotBrain {
  constructor(game, s) {
    this.g = game;
    this.s = s;
    s.brain = this;
    this.pref = game.mode.flags.map(() => rand(0, 28));
    this.lastPos = new THREE.Vector3();
    this.lastSeen = new THREE.Vector3();
    this.reset();
  }

  get D() { return DIFFICULTY[this.g.settings.difficulty] || DIFFICULTY.normal; }

  reset() {
    if (this.wantTank && this.wantTank.claimedBy === this.s) this.wantTank.claimedBy = null;
    this.objective = null;
    this.moveTarget = null;
    this.target = null;
    this.targetVeh = null;
    this.visible = false;
    this.lostT = 0;
    this.reactT = 0;
    this.trackT = 0;
    this.errYaw = 0; this.errPitch = 0;
    this.scanT = rand(0, 0.3);
    this.thinkT = 0;
    this.burst = 0; this.burstPause = 0; this.fireDelay = rand(0.2, 0.5);
    this.strafeDir = chance(0.5) ? 1 : -1; this.strafeT = 0; this.crouch = false;
    this.stuckT = 0; this.stuckCount = 0; this.lastPos.copy(this.s.pos);
    this.detourT = 0; this.detourYaw = 0; this.avoidSide = chance(0.5) ? 1 : -1; this.probeT = 0; this.probeYaw = 0;
    this.reviveTarget = null; this.reviveT = 0;
    this.grenadeCd = rand(6, 14); this.crateCd = rand(10, 30);
    this.loiterT = 0; this.lookYaw = null; this.lookT = 0;
    this.wantTank = null;
    this.tankStuckT = 0; this.tankReverseT = 0; this.revSteer = 1;
    this.tankTarget = null; this.mgBurst = 0;
    this.seed = Math.random() * 100;
  }

  // ------------------------------------------------------------ strategic layer
  think() {
    const s = this.s, g = this.g;
    const flags = g.mode.flags;
    let best = null, bestScore = -Infinity;
    flags.forEach((f, i) => {
      const d = Math.hypot(f.x - s.pos.x, f.z - s.pos.z);
      let sc = this.pref[i] - d / 5;
      const full = s.team === 0 ? f.progress >= 1 : f.progress <= -1;
      if (f.owner !== s.team) sc += 60;
      else if (f.contested || !full) sc += 52;
      else sc += 4;
      if (f === this.objective) sc += 12;
      if (sc > bestScore) { bestScore = sc; best = f; }
    });
    if (best !== this.objective) { this.objective = best; this.moveTarget = null; }

    if (s.vehicle) return;
    // Revive a nearby downed teammate
    if (!this.target && !this.reviveTarget) {
      let bd = 32, pick = null;
      for (const o of g.soldiers) {
        if (o.team !== s.team || o.state !== 'downed' || o === s) continue;
        const d = o.pos.distanceTo(s.pos);
        if (d < bd && !(o.reviver && o.reviver !== s && o.reviver.state === 'alive')) { bd = d; pick = o; }
      }
      if (pick) { this.reviveTarget = pick; pick.reviver = s; this.reviveT = 0; }
    }
    // Grab an empty tank near HQ
    if (!this.wantTank && !this.target) {
      const P = g.player;
      for (const v of g.vehicles) {
        if (!v.alive || v.driver || v.team !== s.team || v.claimedBy) continue;
        if (v.pos.distanceTo(s.pos) > 45) continue;
        if (P && P.team === s.team && P.state !== 'inactive' && P.pos.distanceTo(v.pos) < 35) continue;
        if (chance(0.6)) { this.wantTank = v; v.claimedBy = s; }
        break;
      }
    }
  }

  // ------------------------------------------------------------ perception
  scan() {
    const s = this.s, g = this.g, now = g.time;
    const eye = s.eye(_eye);
    const range = s.guns[0].def.botRange;
    const cands = [];
    for (const e of g.soldiers) {
      if (e.team === s.team || e.state !== 'alive' || e.vehicle) continue;
      const dx = e.pos.x - s.pos.x, dz = e.pos.z - s.pos.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      let r = range;
      if (e.stance === 2) r *= 0.5; else if (e.stance === 1) r *= 0.8;
      if (now - e.lastFireT < 1) r = Math.max(r, 95);
      if (d > r) continue;
      const ang = Math.abs(wrapAngle(yawTo(dx, dz) - s.yaw));
      const aware = d < 10 || (s.lastAttacker === e && now - s.lastDamageT < 4) || (now - e.lastFireT < 0.6 && d < 70) || e.spottedUntil > now;
      if (ang > 1.25 && !aware) continue;
      let score = d * (1 + ang * 0.6);
      if (e === this.target) score *= 0.5;
      cands.push([score, e]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    let found = null;
    const w = g.world;
    for (let i = 0; i < Math.min(3, cands.length); i++) {
      const e = cands[i][1];
      let c = e.chest(_c);
      if (w.lineClear(eye.x, eye.y, eye.z, c.x, c.y, c.z)) { found = e; break; }
      c = e.eye(_c);
      if (w.lineClear(eye.x, eye.y, eye.z, c.x, c.y + 0.05, c.z)) { found = e; break; }
    }
    if (found) {
      if (found !== this.target) this.acquire(found);
      this.visible = true;
      this.lostT = 0;
      this.lastSeen.copy(found.pos);
      if (g.player && s.team === g.player.team) found.miniUntil = Math.max(found.miniUntil, now + 1.5);
      if (this.reviveTarget && found.pos.distanceTo(s.pos) < 40) { this.reviveTarget.reviver = null; this.reviveTarget = null; }
    } else {
      this.visible = false;
      if (this.target && (this.target.state !== 'alive' || this.lostT > 3.5 || this.target.vehicle)) this.target = null;
    }
    this.targetVeh = null;
    if (s.gadget.id === 'rpg' || s.gadget.id === 'ugl') {
      for (const v of g.vehicles) {
        if (!v.alive || v.team === s.team || !v.driver) continue;
        const d = v.pos.distanceTo(s.pos);
        if (d > (s.gadget.id === 'rpg' ? 170 : 75)) continue;
        if (!w.lineClear(eye.x, eye.y, eye.z, v.pos.x, v.pos.y + 1.5, v.pos.z)) continue;
        this.targetVeh = v;
        if (!this.reactT || this.reactT <= 0) this.reactT = rand(this.D.reaction[0], this.D.reaction[1]);
        break;
      }
    }
  }

  acquire(e) {
    const D = this.D;
    this.target = e;
    this.reactT = rand(D.reaction[0], D.reaction[1]);
    this.trackT = 0;
    this.errYaw = rand(-1, 1) * D.aimError * 2.4;
    this.errPitch = rand(-1, 1) * D.aimError * 1.5;
    this.burst = 0;
    this.burstPause = rand(0, 0.2);
    this.fireDelay = rand(0.1, 0.4);
  }

  // ------------------------------------------------------------ movement helpers
  _clear(yaw, len) {
    const s = this.s;
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
    return !this.g.world.raycast(s.pos.x, s.pos.y + 0.75, s.pos.z, dx, 0, dz, len, false).hit;
  }

  // Returns distance to target and writes a normalised XZ direction into _d
  steer(tx, tz, dt) {
    const s = this.s;
    const dx = tx - s.pos.x, dz = tz - s.pos.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.4) { _d.set(0, 0, 0); return d; }
    let yaw = yawTo(dx, dz);
    if (this.detourT > 0) {
      this.detourT -= dt;
      yaw = this.detourYaw;
    } else {
      this.probeT -= dt;
      if (this.probeT <= 0) {
        this.probeT = 0.15;
        this.probeYaw = yaw;
        if (!this._clear(yaw, 2.6)) {
          for (const a of [0.55, 1.05, 1.6, 2.2]) {
            const y1 = yaw + a * this.avoidSide;
            if (this._clear(y1, 2.6)) { this.detourYaw = y1; this.detourT = 0.55; yaw = y1; break; }
            const y2 = yaw - a * this.avoidSide;
            if (this._clear(y2, 2.6)) { this.detourYaw = y2; this.detourT = 0.55; this.avoidSide *= -1; yaw = y2; break; }
          }
        }
      }
    }
    _d.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    return d;
  }

  // ------------------------------------------------------------ main update
  update(dt) {
    const s = this.s, g = this.g, D = this.D;
    if (s.state !== 'alive') return;
    if (s.vehicle) { this.updateTank(dt); return; }
    this.grenadeCd -= dt;
    this.crateCd -= dt;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = rand(1.5, 3); this.think(); }
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = rand(0.22, 0.38); this.scan(); }
    if (this.target && !this.visible) this.lostT += dt;
    if (this.reactT > 0) this.reactT -= dt;

    let mx = 0, mz = 0, speed = MOVE.walk, sprint = false, jump = false;
    let stance = 0, wantMove = false;
    let wantYaw = s.yaw, wantPitch = 0;
    let fire = false, fireGadget = false;
    const eye = s.eye(_eye);
    const now = g.time;

    const v = this.targetVeh;
    if (v && s.gadgetAmmo > 0 && !(this.target && this.visible && this.target.pos.distanceTo(s.pos) < 12)) {
      // Anti-armor: lead the tank and arc the shot
      s.slot = 2;
      const pdef = PROJECTILES[s.gadget.projectile];
      const dist = v.pos.distanceTo(s.pos);
      const tt = dist / pdef.speed;
      const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
      _t.set(v.pos.x + fx * v.speed * tt, v.pos.y + 1.3, v.pos.z + fz * v.speed * tt);
      const hd = Math.hypot(_t.x - eye.x, _t.z - eye.z);
      wantYaw = yawTo(_t.x - eye.x, _t.z - eye.z);
      wantPitch = Math.atan2(_t.y - eye.y + 0.5 * pdef.gravity * tt * tt, hd);
      stance = 1;
      const off = Math.abs(wrapAngle(wantYaw - s.yaw)) + Math.abs(wantPitch - s.pitch);
      if (off < 0.035 && s.gadgetCd <= 0 && this.reactT <= 0) fireGadget = true;
    } else {
      if (s.slot === 2) s.slot = 0;
      if (this.target) {
        const e = this.target;
        const aimHead = this.g.settings.difficulty === 'hard' && (this.seed % 4) < 1;
        const tp = aimHead ? e.eye(_t) : e.chest(_t);
        if (!this.visible) tp.set(this.lastSeen.x, this.lastSeen.y + 1.2, this.lastSeen.z);
        const dx = tp.x - eye.x, dy = tp.y - eye.y, dz = tp.z - eye.z;
        const hd = Math.sqrt(dx * dx + dz * dz);
        const dist = Math.sqrt(hd * hd + dy * dy);
        this.trackT += dt;
        const k = Math.max(0.15, 1 - this.trackT * 0.55);
        const wob = Math.sin(now * 2.3 + this.seed) * D.aimError * 0.35;
        wantYaw = yawTo(dx, dz) + this.errYaw * k + wob;
        wantPitch = Math.atan2(dy, hd) + this.errPitch * k;

        // Combat movement: strafe, hold preferred range
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafeT = rand(0.5, 1.6);
          this.strafeDir = chance(0.5) ? 1 : -1;
          this.crouch = chance(s.classId === 'recon' ? 0.7 : 0.3);
        }
        const rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
        const pref = s.guns[0].def.botRange * 0.45;
        let fwd = 0;
        if (dist > pref * 1.4 || !this.visible) fwd = 0.9;
        else if (dist < 7) fwd = -0.6;
        const strafe = s.classId === 'recon' && dist > 60 ? 0 : 0.8;
        mx = rx * this.strafeDir * strafe + fx * fwd;
        mz = rz * this.strafeDir * strafe + fz * fwd;
        const l = Math.hypot(mx, mz);
        if (l > 0.01) { mx /= l; mz /= l; wantMove = true; }
        speed = MOVE.walk * 0.8;
        stance = this.crouch && this.visible ? 1 : 0;
        if (!this.visible && fwd > 0) {
          // push toward last known position with obstacle avoidance
          this.steer(this.lastSeen.x, this.lastSeen.z, dt);
          mx = _d.x; mz = _d.z;
          speed = MOVE.walk;
          stance = 0;
        }

        // Shooting
        const gun = s.gun;
        if (gun) {
          if (gun.mag === 0) { if (!gun.reloading) gun.startReload(); }
          else if (this.visible && this.reactT <= 0) {
            const off = Math.abs(wrapAngle(wantYaw - s.yaw)) + Math.abs(wantPitch - s.pitch);
            if (off < 0.07 + 0.6 / Math.max(5, dist)) {
              if (gun.def.kind === 'auto') {
                if (this.burst > 0) fire = gun.canFire();
                else {
                  this.burstPause -= dt;
                  if (this.burstPause <= 0) this.burst = randInt(D.burst[0], D.burst[1]) + (dist < 20 ? 3 : 0);
                }
              } else {
                this.fireDelay -= dt;
                if (this.fireDelay <= 0 && gun.canFire()) {
                  fire = true;
                  this.fireDelay = rand(0.25, 0.6) * (gun.def.kind === 'bolt' ? 1.8 : 1);
                }
              }
            }
          }
        }

        // Flush them out with a grenade or 40mm
        if (!this.visible && this.lostT > 0.6 && this.lostT < 3 && this.grenadeCd <= 0) {
          const ld = this.lastSeen.distanceTo(s.pos);
          if (s.gadget.id === 'ugl' && s.gadgetAmmo > 0 && ld > 12 && ld < 70) {
            const pd = PROJECTILES.ugl;
            const a = 0.5 * Math.asin(clamp((pd.gravity * ld) / (pd.speed * pd.speed), -1, 1));
            s.yaw = yawTo(this.lastSeen.x - s.pos.x, this.lastSeen.z - s.pos.z);
            s.pitch = a;
            s.slot = 2;
            g.combat.useGadget(s, s.forward(_c));
            s.slot = 0;
            this.grenadeCd = rand(10, 18);
          } else if (s.grenades > 0 && ld > 7 && ld < 30) {
            const pd = PROJECTILES.grenade;
            const a = 0.5 * Math.asin(clamp((pd.gravity * ld) / (pd.speed * pd.speed), -1, 1));
            s.yaw = yawTo(this.lastSeen.x - s.pos.x, this.lastSeen.z - s.pos.z);
            s.pitch = a - 0.18;
            g.combat.throwGrenade(s);
            this.grenadeCd = rand(12, 22);
          }
        }
      } else if (this.reviveTarget) {
        const o = this.reviveTarget;
        if (o.state !== 'downed') {
          this.reviveTarget = null;
        } else {
          const d = this.steer(o.pos.x, o.pos.z, dt);
          if (d > 1.3) {
            mx = _d.x; mz = _d.z; wantMove = true;
            sprint = d > 8;
            wantYaw = Math.atan2(-mx, -mz);
          } else {
            stance = 1;
            this.reviveT += dt;
            wantYaw = yawTo(o.pos.x - s.pos.x, o.pos.z - s.pos.z);
            wantPitch = -0.6;
            if (this.reviveT >= (s.cls.fastRevive ? 1.2 : 2.4)) {
              g.mode.revive(s, o);
              this.reviveTarget = null;
              this.reviveT = 0;
            }
          }
        }
      } else if (this.wantTank) {
        const tk = this.wantTank;
        if (!tk.alive || tk.driver) { tk.claimedBy = null; this.wantTank = null; }
        else {
          const d = this.steer(tk.pos.x, tk.pos.z, dt);
          if (d < 5) {
            tk.claimedBy = null;
            this.wantTank = null;
            tk.enter(s);
            return;
          }
          mx = _d.x; mz = _d.z; wantMove = true; sprint = true;
          wantYaw = Math.atan2(-mx, -mz);
        }
      } else if (this.objective) {
        const f = this.objective;
        const inZone = Math.hypot(f.x - s.pos.x, f.z - s.pos.z) < f.radius;
        const secure = f.owner === s.team && !f.contested;
        if (!this.moveTarget) {
          const a = Math.random() * Math.PI * 2, r = Math.random() * f.radius * (secure ? 0.95 : 0.6);
          this.moveTarget = new THREE.Vector3(f.x + Math.cos(a) * r, 0, f.z + Math.sin(a) * r);
          this.loiterT = secure ? rand(3, 8) : rand(1, 3);
        }
        const d = this.steer(this.moveTarget.x, this.moveTarget.z, dt);
        if (d > 1.2) {
          mx = _d.x; mz = _d.z; wantMove = true;
          sprint = d > 18 && now - s.lastDamageT > 3;
          wantYaw = Math.atan2(-mx, -mz);
        } else {
          this.loiterT -= dt;
          this.lookT -= dt;
          if (this.lookT <= 0 || this.lookYaw === null) { this.lookYaw = s.yaw + rand(-1.8, 1.8); this.lookT = rand(1.2, 3); }
          wantYaw = this.lookYaw;
          stance = inZone && chance(0.5) ? 1 : stance;
          if (this.loiterT <= 0) this.moveTarget = null;
          // Support: drop a crate for the squad
          if (s.gadget.id === 'crate' && this.crateCd <= 0 && s.gadgetAmmo > 0) {
            s.pitch = -0.4;
            g.combat.useGadget(s, s.forward(_c));
            this.crateCd = rand(35, 60);
          }
        }
      }
    }

    // Reload when idle
    const gun = s.gun;
    if (gun && !this.target && gun.mag < gun.def.mag * 0.5 && !gun.reloading) gun.startReload();

    // Keep a little space from teammates
    if (wantMove) {
      for (const o of g.soldiers) {
        if (o === s || o.team !== s.team || o.state !== 'alive' || o.vehicle) continue;
        const dx = s.pos.x - o.pos.x, dz = s.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.6 && d2 > 1e-4) { const d = Math.sqrt(d2); mx += (dx / d) * 0.5; mz += (dz / d) * 0.5; }
      }
      const l = Math.hypot(mx, mz);
      if (l > 1e-3) { mx /= l; mz /= l; }
    }

    // Turn toward desired aim
    const turn = D.turn * dt * (this.target || this.targetVeh ? 1 : 0.7);
    s.yaw = wrapAngle(s.yaw + clamp(wrapAngle(wantYaw - s.yaw), -turn, turn));
    s.pitch += clamp(wantPitch - s.pitch, -turn, turn);
    s.pitch = clamp(s.pitch, -1.3, 1.3);

    if (fire) {
      const spread = s.gun.def.spreadAds * D.spreadMul + (wantMove ? 0.008 : 0) + (stance === 1 ? -0.002 : 0);
      if (g.combat.fireGun(s, s.forward(_c), Math.max(0.002, spread), { dmgMul: D.dmgMul })) {
        if (s.gun.def.kind === 'auto') {
          this.burst--;
          if (this.burst <= 0) this.burstPause = rand(0.18, 0.5);
        }
      }
    }
    if (fireGadget) {
      g.combat.useGadget(s, s.forward(_c));
      this.reactT = rand(0.3, 0.8);
      if (s.gadgetAmmo <= 0) s.slot = 0;
    }

    // Stuck detection
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const moved = Math.hypot(s.pos.x - this.lastPos.x, s.pos.z - this.lastPos.z);
      if (wantMove && moved < 0.8) {
        this.stuckCount++;
        jump = true;
        this.detourYaw = s.yaw + (chance(0.5) ? 1 : -1) * rand(1.3, 2.5);
        this.detourT = 1.1;
        if (this.stuckCount > 3) { this.moveTarget = null; this.stuckCount = 0; }
      } else this.stuckCount = 0;
      this.lastPos.copy(s.pos);
      this.stuckT = 0;
    }

    s.sprinting = sprint && wantMove && stance === 0;
    if (s.sprinting) speed = MOVE.sprint;
    else if (stance === 1) speed = Math.min(speed, MOVE.crouch);
    s.setStance(stance);
    if (!wantMove) { mx = 0; mz = 0; }
    s.move(dt, mx, mz, speed, jump);
  }

  // ------------------------------------------------------------ tank driving
  tankScan() {
    const s = this.s, g = this.g, v = s.vehicle;
    const ox = v.pos.x, oy = v.pos.y + 2.6, oz = v.pos.z;
    let best = null, bd = Infinity, isVeh = false;
    for (const o of g.vehicles) {
      if (!o.alive || o.team === s.team || !o.driver) continue;
      const d = o.pos.distanceTo(v.pos);
      if (d > 220) continue;
      if (!g.world.lineClear(ox, oy, oz, o.pos.x, o.pos.y + 1.5, o.pos.z)) continue;
      if (d < bd) { bd = d; best = o; isVeh = true; }
    }
    if (!best) {
      for (const e of g.soldiers) {
        if (e.team === s.team || e.state !== 'alive' || e.vehicle) continue;
        const d = e.pos.distanceTo(v.pos);
        if (d > 150 || d > bd) continue;
        const c = e.chest(_c);
        if (!g.world.lineClear(ox, oy, oz, c.x, c.y, c.z)) continue;
        bd = d; best = e;
      }
    }
    if (best !== this.tankTarget) this.reactT = rand(0.6, 1.4);
    this.tankTarget = best;
    this.tankTargetVeh = isVeh;
  }

  updateTank(dt) {
    const s = this.s, g = this.g, v = s.vehicle, inp = v.input;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = rand(2, 4); this.think(); }
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.5; this.tankScan(); }
    if (this.reactT > 0) this.reactT -= dt;

    const f = this.objective;
    if (f) {
      const dx = f.x - v.pos.x, dz = f.z - v.pos.z;
      const d = Math.hypot(dx, dz);
      const dy = wrapAngle(yawTo(dx, dz) - v.yaw);
      inp.steer = clamp(-dy * 1.6, -1, 1);
      inp.throttle = d > 18 ? (Math.abs(dy) < 0.9 ? 1 : 0.25) : 0;
      if (this.tankTarget && this.tankTargetVeh && d < 60) inp.throttle *= 0.4;
    } else { inp.throttle = 0; inp.steer = 0; }
    if (inp.throttle > 0.2 && Math.abs(v.speed) < 0.6) this.tankStuckT += dt; else this.tankStuckT = 0;
    if (this.tankStuckT > 1.6) { this.tankReverseT = 1.8; this.tankStuckT = 0; this.revSteer = chance(0.5) ? 1 : -1; }
    if (this.tankReverseT > 0) { this.tankReverseT -= dt; inp.throttle = -0.9; inp.steer = this.revSteer; }

    const t = this.tankTarget;
    inp.fire = false; inp.fireMG = false;
    if (t && (t.alive || t.state === 'alive')) {
      const tp = t.chest ? t.chest(_t) : _t.set(t.pos.x, t.pos.y + 1.3, t.pos.z);
      const ox = v.pos.x, oy = v.pos.y + 1.9, oz = v.pos.z;
      const dx = tp.x - ox, dz = tp.z - oz, hd = Math.hypot(dx, dz);
      inp.aimYaw = yawTo(dx, dz);
      inp.aimPitch = Math.atan2(tp.y - oy, hd) + (this.tankTargetVeh ? 0 : 0.004);
      const aligned = Math.abs(wrapAngle(inp.aimYaw - v.turretYaw)) < 0.05 && Math.abs(clamp(inp.aimPitch, -0.14, 0.38) - v.gunPitch) < 0.05;
      if (aligned && this.reactT <= 0) {
        if (this.tankTargetVeh || hd > 45) inp.fire = true;
        if (!this.tankTargetVeh && hd < 110) {
          if (this.mgBurst > 0) { inp.fireMG = true; this.mgBurst -= dt; }
          else if (Math.random() < dt * 2) this.mgBurst = rand(0.4, 1.2);
        }
      }
    } else {
      inp.aimYaw = v.yaw;
      inp.aimPitch = 0;
    }
  }
}
