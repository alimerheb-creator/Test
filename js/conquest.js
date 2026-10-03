// Conquest game mode: capture points, ticket bleed, scoring, revives and spawn logic.
import * as THREE from 'three';
import { FLAGS, HQS, TEAMS, SCORE, CLASS_ORDER, RULES } from './config.js';
import { clamp, rand, yawTo, pick, chance } from './util.js';

const NEUTRAL = new THREE.Color(0xc9ccc4);
const TEAMCOL = [new THREE.Color(TEAMS[0].hex), new THREE.Color(TEAMS[1].hex)];

export class Conquest {
  constructor(game) {
    this.game = game;
    this.flags = FLAGS.map((f, i) => ({
      ...f, idx: i, y: game.surfaceAt(f.x, f.z), owner: -1, progress: 0,
      counts: [0, 0], members: [[], []], contested: false, capturing: -1,
    }));
    this.tickets = [250, 250];
    this.maxTickets = 250;
    this.over = false;
    this.winner = -1;
    this.time = 0;
    this._buildVisuals();
    game.on('kill', (e) => this._onKill(e));
    game.on('vehicleDestroyed', (e) => {
      if (e.attacker && e.attacker.team !== e.vehicle.team) this.award(e.attacker, SCORE.vehicle, 'VEHICLE DESTROYED');
    });
  }

  _buildVisuals() {
    const scene = this.game.scene;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8d8f91, roughness: 0.5, metalness: 0.6 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x9a948a, roughness: 0.9 });
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 9, 8);
    poleGeo.translate(0, 4.5, 0);
    const clothGeo = new THREE.PlaneGeometry(1.5, 0.9, 8, 1);
    clothGeo.translate(0.75, 0, 0);
    for (const f of this.flags) {
      const g = new THREE.Group();
      g.position.set(f.x, f.y, f.z);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.castShadow = true;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.4, 12), baseMat);
      base.position.y = 0.1;
      base.receiveShadow = true;
      const clothMat = new THREE.MeshStandardMaterial({ color: NEUTRAL.clone(), side: THREE.DoubleSide, roughness: 0.9, emissive: NEUTRAL.clone(), emissiveIntensity: 0.15 });
      const cloth = new THREE.Mesh(clothGeo.clone(), clothMat);
      cloth.position.set(0.08, 2, 0);
      cloth.castShadow = true;
      const ringMat = new THREE.MeshBasicMaterial({ color: NEUTRAL.clone(), transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const ring = new THREE.Mesh(new THREE.RingGeometry(f.radius - 0.35, f.radius, 72), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      g.add(pole, base, cloth, ring);
      scene.add(g);
      f.cloth = cloth;
      f.ring = ring;
      f.clothBase = cloth.geometry.attributes.position.array.slice();
    }
    // HQ banners
    HQS.forEach((q, t) => {
      const g = new THREE.Group();
      g.position.set(q.x, this.game.surfaceAt(q.x, q.z), q.z);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ color: TEAMS[t].hex, side: THREE.DoubleSide, emissive: TEAMS[t].hex, emissiveIntensity: 0.2 }));
      cloth.position.set(0.08, 8, 0);
      g.add(pole, cloth);
      scene.add(g);
    });
  }

  reset(tickets) {
    this.tickets = [tickets, tickets];
    this.maxTickets = tickets;
    this.over = false;
    this.winner = -1;
    this.time = 0;
    for (const f of this.flags) {
      f.owner = -1; f.progress = 0; f.contested = false; f.capturing = -1;
      f.cloth.material.color.copy(NEUTRAL);
      f.cloth.material.emissive.copy(NEUTRAL);
      f.ring.material.color.copy(NEUTRAL);
    }
  }

  // ------------------------------------------------------------ scoring
  award(s, pts, label) {
    if (!s) return;
    if (this.game.hasFilter('score')) {
      const f = this.game.filter('score', { soldier: s, points: pts, label });
      if (!f) return;
      pts = Math.round(Number(f.points) || 0); label = String(f.label ?? label);
    }
    s.stats.score += pts;
    if (s.isPlayer) this.game.emit('score', { pts, label });
  }

  _onKill({ victim, killer, headshot }) {
    if (this.over) return;
    if (killer && killer.team !== victim.team) {
      killer.stats.kills++;
      this.award(killer, SCORE.kill + (headshot ? SCORE.headshot : 0), headshot ? 'HEADSHOT' : 'ENEMY KILLED');
    }
    for (const [att, dmg] of victim.damageBy) {
      if (att === killer || att.team === victim.team || dmg < 20) continue;
      att.stats.assists++;
      this.award(att, SCORE.assist, 'KILL ASSIST');
    }
  }

  revive(by, target) {
    if (target.state !== 'downed') return;
    target.revive(by);
    target.reviver = null;
    by.stats.revives++;
    this.award(by, SCORE.revive, `REVIVED ${target.name.toUpperCase()}`);
  }

  ticketLoss(team) {
    if (this.over) return;
    this.tickets[team] = Math.max(0, this.tickets[team] - 1);
    if (this.tickets[team] <= 0) this._end(1 - team);
  }

  _end(winner) {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.game.emit('matchEnd', { winner });
  }

  // ------------------------------------------------------------ flags
  _neutralize(f, byTeam) {
    const lost = f.owner;
    f.owner = -1;
    for (const s of f.members[byTeam]) this.award(s, SCORE.neutralize, `NEUTRALIZED ${f.id}`);
    this.game.emit('flag', { flag: f, team: byTeam, lost, type: 'neutralized' });
  }

  _capture(f, team) {
    f.owner = team;
    for (const s of f.members[team]) { s.stats.caps++; this.award(s, SCORE.capture, `CAPTURED ${f.id}`); }
    this.game.emit('flag', { flag: f, team, type: 'captured' });
  }

  update(dt) {
    const g = this.game;
    if (this.over) return;
    this.time += dt;
    for (const f of this.flags) {
      f.counts[0] = 0; f.counts[1] = 0;
      f.members[0].length = 0; f.members[1].length = 0;
      const r2 = f.radius * f.radius;
      for (const s of g.soldiers) {
        if (s.state !== 'alive') continue;
        const p = s.pos;
        const dx = p.x - f.x, dz = p.z - f.z;
        // a flag's zone reaches 12 m up, or f.height for sky zones that aircraft capture
        if (dx * dx + dz * dz > r2 || p.y - f.y < -12 || p.y - f.y > (f.height || 12)) continue;
        f.counts[s.team]++;
        f.members[s.team].push(s);
      }
      const diff = f.counts[0] - f.counts[1];
      f.contested = f.counts[0] > 0 && f.counts[1] > 0;
      if (diff !== 0) {
        const team = diff > 0 ? 0 : 1;
        f.capturing = team;
        f.progress = clamp(f.progress + (team === 0 ? 1 : -1) * 0.085 * RULES.captureSpeed * Math.min(Math.abs(diff), 4) * dt, -1, 1);
      } else {
        f.capturing = -1;
        if (f.counts[0] === 0 && f.counts[1] === 0 && f.owner !== -1) {
          const full = f.owner === 0 ? 1 : -1;
          f.progress += clamp(full - f.progress, -0.05 * dt, 0.05 * dt);
        }
      }
      if (f.owner === 0 && f.progress <= 0) this._neutralize(f, 1);
      else if (f.owner === 1 && f.progress >= 0) this._neutralize(f, 0);
      if (f.owner === -1 && f.progress >= 1) this._capture(f, 0);
      else if (f.owner === -1 && f.progress <= -1) this._capture(f, 1);
      this._visual(f, dt);
    }

    // Ticket bleed for the side holding a minority of flags
    const own = [0, 0];
    for (const f of this.flags) if (f.owner >= 0) own[f.owner]++;
    for (let t = 0; t < 2; t++) {
      const o = 1 - t;
      if (own[o] > own[t] && own[o] > this.flags.length / 2) {
        this.tickets[t] = Math.max(0, this.tickets[t] - (0.12 + 0.1 * (own[o] - own[t])) * RULES.bleedSpeed * dt);
        if (this.tickets[t] <= 0) this._end(o);
      }
    }

    // Bot redeploys
    for (const s of g.soldiers) {
      if (s.isPlayer) continue;
      if (s.state === 'dead' && s.respawnT <= 0 && this.tickets[s.team] > 0) this.respawnBot(s);
    }
  }

  _visual(f, dt) {
    const target = f.owner >= 0 ? TEAMCOL[f.owner] : f.capturing >= 0 && Math.abs(f.progress) > 0.05
      ? _mix.copy(NEUTRAL).lerp(TEAMCOL[f.progress > 0 ? 0 : 1], Math.abs(f.progress) * 0.7) : NEUTRAL;
    const k = Math.min(1, dt * 4);
    f.cloth.material.color.lerp(target, k);
    f.cloth.material.emissive.lerp(target, k);
    f.ring.material.color.lerp(target, k);
    f.cloth.position.y = 1.6 + Math.abs(f.progress) * 6.6;
    // flutter
    const pos = f.cloth.geometry.attributes.position;
    const base = f.clothBase, t = this.time * 4 + f.idx;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.array[i * 3 + 2] = Math.sin(t + x * 2.2) * 0.12 * x;
    }
    pos.needsUpdate = true;
  }

  // ------------------------------------------------------------ spawning
  spawnPoints(team, forPlayer = false) {
    const pts = [{ type: 'hq', id: 'HQ', label: 'HEADQUARTERS', x: HQS[team].x, z: HQS[team].z }];
    for (const f of this.flags) {
      if (f.owner === team && !f.contested) pts.push({ type: 'flag', id: f.id, label: f.name, flag: f, x: f.x, z: f.z });
    }
    if (forPlayer) {
      const P = this.game.player;
      for (const s of this.game.soldiers) {
        if (s === P || s.team !== team || s.squad !== P.squad || s.state !== 'alive' || s.vehicle) continue;
        const safe = this.game.time - s.lastDamageT > 5;
        pts.push({ type: 'squad', id: s.name, label: s.name.toUpperCase(), soldier: s, x: s.pos.x, z: s.pos.z, safe });
      }
    }
    return pts;
  }

  spawnPos(pt, team) {
    const w = this.game.world;
    const enemyHQ = HQS[1 - team];
    if (pt.type === 'squad' && pt.soldier.state === 'alive') {
      const m = pt.soldier;
      const bx = Math.sin(m.yaw) * 1.5, bz = Math.cos(m.yaw) * 1.5;
      const x = m.pos.x + bx, z = m.pos.z + bz;
      const y = Math.max(m.pos.y, w.heightAt(x, z));
      if (w.isFree(x, y + 0.05, z, 0.36, 1.8)) return { x, y: y + 0.05, z, yaw: m.yaw };
      return { x: m.pos.x, y: m.pos.y + 0.05, z: m.pos.z, yaw: m.yaw };
    }
    for (let i = 0; i < 30; i++) {
      let x, z;
      if (pt.type === 'hq') {
        const a = Math.random() * Math.PI * 2, r = rand(3, 14);
        x = pt.x + Math.cos(a) * r; z = pt.z + Math.sin(a) * r;
      } else {
        const a = Math.random() * Math.PI * 2, r = rand(pt.flag.radius + 2, pt.flag.radius + 12);
        x = pt.x + Math.cos(a) * r; z = pt.z + Math.sin(a) * r;
      }
      const y = w.heightAt(x, z);
      if (!w.isFree(x, y + 0.1, z, 0.4, 1.8)) continue;
      // avoid spawning in the open right next to an enemy
      let danger = false;
      for (const s of this.game.soldiers) {
        if (s.team !== team && s.state === 'alive' && Math.abs(s.pos.x - x) < 12 && Math.abs(s.pos.z - z) < 12) { danger = true; break; }
      }
      if (danger && i < 25) continue;
      const yaw = pt.type === 'hq' ? HQS[team].yaw : yawTo(enemyHQ.x - x, enemyHQ.z - z);
      return { x, y: y + 0.05, z, yaw };
    }
    return { x: pt.x, y: w.heightAt(pt.x, pt.z) + 0.05, z: pt.z, yaw: HQS[team].yaw };
  }

  respawnBot(s) {
    const pts = this.spawnPoints(s.team);
    let pt = pts[0];
    const flagPts = pts.filter((p) => p.type === 'flag');
    if (flagPts.length && chance(0.75)) {
      // spawn at the owned flag nearest to the fight
      let best = null, bd = Infinity;
      for (const p of flagPts) {
        let d = Infinity;
        for (const f of this.flags) if (f.owner !== s.team) d = Math.min(d, Math.hypot(f.x - p.x, f.z - p.z));
        d += rand(0, 60);
        if (d < bd) { bd = d; best = p; }
      }
      pt = best || pt;
    }
    if (chance(0.25)) s.setClass(pick(CLASS_ORDER));
    const sp = this.spawnPos(pt, s.team);
    s.spawn(sp.x, sp.y, sp.z, sp.yaw);
  }
}

const _mix = new THREE.Color();
