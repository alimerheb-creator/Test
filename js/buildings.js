// Destructible buildings: walls/floors are panels with hit points. Knock out enough of the
// ground floor and the whole structure comes down in a cloud of dust.
import * as THREE from 'three';
import { BUILDINGS } from './config.js';
import { mulberry32, rand } from './util.js';
import { worldUVMaterial } from './textures.js';

const P = 2.5;      // panel width
const H = 3.2;      // storey height
const TH = 0.3;     // wall thickness
const SLAB = 0.25;  // floor slab thickness
const PALETTE = [0xe0d4bd, 0xd6c3a0, 0xcab58e, 0xe6ddd0, 0xb9b3a6, 0xd9b99a, 0xc4c9c6, 0xd8cfae, 0xbfae95];

export class Buildings {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.pieces = [];
    this.panels = [];
    this.list = [];
    this.pending = [];
    this.dirty = false;
    this.crumbleCd = 0;
    this._tmp = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  generate() {
    const rng = mulberry32(777);
    for (const b of BUILDINGS) this._makeBuilding(b[0], b[1], b[2], b[3], b[4], rng);
    this._buildMesh();
  }

  _piece(minX, minY, minZ, maxX, maxY, maxZ, color, panel, mat = 'plaster', collide = true) {
    const piece = { idx: this.pieces.length, minX, minY, minZ, maxX, maxY, maxZ, color, panel, box: null, visible: true, rotY: 0 };
    if (collide) piece.box = this.world.addBox(minX, minY, minZ, maxX, maxY, maxZ, { panel, mat });
    this.pieces.push(piece);
    if (panel) panel.pieces.push(piece);
    return piece;
  }

  _panel(bld, type, floor, key, hp) {
    const p = { id: this.panels.length, building: bld, type, floor, key, hp, maxHp: hp, alive: true, pieces: [], cx: 0, cy: 0, cz: 0 };
    this.panels.push(p);
    bld.panels.push(p);
    return p;
  }

  _wallPieces(panel, axis, a0, a1, c0, c1, y, hgt, kind, color) {
    const add = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.02 || y1 - y0 < 0.02) return;
      if (axis === 'x') this._piece(s0, y0, c0, s1, y1, c1, color, panel);
      else this._piece(c0, y0, s0, c1, y1, s1, color, panel);
    };
    if (kind === 'solid' || kind === 'parapet') add(a0, a1, y, y + hgt);
    else if (kind === 'window') {
      const mid = (a0 + a1) / 2, gw = Math.min(0.65, (a1 - a0) / 2 - 0.3);
      add(a0, a1, y, y + 1.0);
      add(a0, a1, y + 2.3, y + hgt);
      add(a0, mid - gw, y + 1.0, y + 2.3);
      add(mid + gw, a1, y + 1.0, y + 2.3);
    } else if (kind === 'door') {
      const mid = (a0 + a1) / 2, gw = Math.min(0.65, (a1 - a0) / 2 - 0.25);
      add(a0, a1, y + 2.4, y + hgt);
      add(a0, mid - gw, y, y + 2.4);
      add(mid + gw, a1, y, y + 2.4);
    }
    // centre for effects
    const cx = axis === 'x' ? (a0 + a1) / 2 : (c0 + c1) / 2;
    const cz = axis === 'x' ? (c0 + c1) / 2 : (a0 + a1) / 2;
    panel.cx = cx; panel.cy = y + hgt / 2; panel.cz = cz;
  }

  _makeBuilding(cx, cz, nx, nz, floors, rng) {
    const w = nx * P, d = nz * P;
    const x0 = cx - w / 2, z0 = cz - d / 2, x1 = x0 + w, z1 = z0 + d;
    const base = this.world.heightAt(cx, cz) + 0.12;
    const color = PALETTE[Math.floor(rng() * PALETTE.length)];
    const slabColor = 0xa8a397;
    const bld = {
      cx, cz, x0, z0, x1, z1, base, floors, color, nx, nz,
      panels: [], walls: {}, groundWalls: [], rubble: [], collapsed: false, collapsing: false, lastAttacker: null,
    };
    this.list.push(bld);

    // Foundation: never destroyed, keeps the building seated on uneven ground
    this._piece(x0 - 0.25, base - 2.6, z0 - 0.25, x1 + 0.25, base, z1 + 0.25, 0x8f8a80, null, 'concrete');

    const hasStairs = floors >= 2 && nx >= 3 && nz >= 2;
    // Pick door slots that the staircase won't block
    const candidates = [];
    for (let side = 0; side < 4; side++) {
      const n = side < 2 ? nx : nz;
      for (let i = 0; i < n; i++) {
        if (hasStairs) {
          if (side === 0 || side === 2) continue;
          if (side === 1 && nz === 2 && i < 2) continue;
        }
        candidates.push(`${side}:${i}`);
      }
    }
    const doors = new Set();
    const nDoors = 1 + (rng() < 0.6 ? 1 : 0);
    for (let k = 0; k < nDoors && candidates.length; k++) {
      doors.add(candidates.splice(Math.floor(rng() * candidates.length), 1)[0]);
    }

    for (let f = 0; f <= floors; f++) {
      const y = base + f * H;
      const parapet = f === floors;
      for (let side = 0; side < 4; side++) {
        const n = side < 2 ? nx : nz;
        for (let i = 0; i < n; i++) {
          const key = `${side}:${i}`;
          let kind;
          if (parapet) kind = 'parapet';
          else if (f === 0 && doors.has(key)) kind = 'door';
          else kind = rng() < (f === 0 ? 0.45 : 0.62) ? 'window' : 'solid';
          const panel = this._panel(bld, 'wall', f, key, parapet ? 60 : 100);
          bld.walls[`${f}:${key}`] = panel;
          if (f === 0) bld.groundWalls.push(panel);
          let a0, a1, c0, axis;
          if (side < 2) {
            axis = 'x'; a0 = x0 + i * P; a1 = a0 + P; c0 = side === 0 ? z0 : z1 - TH;
          } else {
            axis = 'z'; a0 = Math.max(z0 + i * P, z0 + TH); a1 = Math.min(z0 + (i + 1) * P, z1 - TH); c0 = side === 2 ? x0 : x1 - TH;
          }
          this._wallPieces(panel, axis, a0, a1, c0, c0 + TH, y, parapet ? 0.9 : H, kind, color);
        }
      }
      if (parapet) continue;

      // Ceiling slab (floor of the next storey / roof)
      const holeRow = hasStairs ? f % 2 : -1;
      const sy = y + H;
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          if (iz === holeRow && ix < 2) continue;
          const panel = this._panel(bld, 'slab', f + 1, `${ix}:${iz}`, 170);
          this._piece(x0 + ix * P, sy - SLAB, z0 + iz * P, x0 + (ix + 1) * P, sy, z0 + (iz + 1) * P, slabColor, panel, 'concrete');
          panel.cx = x0 + (ix + 0.5) * P; panel.cy = sy; panel.cz = z0 + (iz + 0.5) * P;
        }
      }

      // Staircase climbing along +x in row (f % 2)
      if (hasStairs) {
        const panel = this._panel(bld, 'stair', f, `s${f}`, 150);
        const zc = z0 + (holeRow + 0.5) * P;
        const xs = x0 + TH, xe = x0 + 2 * P;
        const steps = 8, run = (xe - xs) / steps, rise = H / steps;
        for (let k = 0; k < steps; k++) {
          this._piece(xs + k * run, y, zc - 0.6, xs + (k + 1) * run, y + (k + 1) * rise, zc + 0.6, 0x9d978b, panel, 'concrete');
        }
        panel.cx = (xs + xe) / 2; panel.cy = y + H / 2; panel.cz = zc;
      }
    }

    // Rubble (hidden until the building collapses)
    const rubCol = new THREE.Color(color).multiplyScalar(0.72).getHex();
    bld.rubble.push(this._piece(x0 + 0.5, base - 0.3, z0 + 0.5, x1 - 0.5, base + 0.55, z1 - 0.5, rubCol, null, 'concrete', false));
    for (let k = 0; k < 7; k++) {
      const sx = 1.5 + rng() * 2.4, sz = 1.5 + rng() * 2.4, sh = 0.5 + rng() * 1.6;
      const px = x0 + sx / 2 + rng() * Math.max(0.1, w - sx), pz = z0 + sz / 2 + rng() * Math.max(0.1, d - sz);
      const piece = this._piece(px - sx / 2, base, pz - sz / 2, px + sx / 2, base + sh, pz + sz / 2, rng() < 0.5 ? rubCol : 0x8c877d, null, 'concrete', false);
      piece.rotY = rng() * Math.PI;
      bld.rubble.push(piece);
    }
    for (const r of bld.rubble) r.visible = false;
  }

  _buildMesh() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = worldUVMaterial({ map: this.world.tex.plaster, normalMap: this.world.tex.plasterN, normalScale: 0.75, scale: 0.32 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, this.pieces.length);
    const col = new THREE.Color();
    for (const piece of this.pieces) {
      this._show(piece, piece.visible);
      this.mesh.setColorAt(piece.idx, col.set(piece.color));
    }
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.game.scene.add(this.mesh);
  }

  _show(piece, vis) {
    piece.visible = vis;
    if (vis) {
      this._p.set((piece.minX + piece.maxX) / 2, (piece.minY + piece.maxY) / 2, (piece.minZ + piece.maxZ) / 2);
      this._s.set(piece.maxX - piece.minX, piece.maxY - piece.minY, piece.maxZ - piece.minZ);
      this._q.setFromEuler(this._e.set(0, piece.rotY, 0));
      this._m.compose(this._p, this._q, this._s);
    } else {
      this._m.makeScale(0, 0, 0);
    }
    this.mesh?.setMatrixAt(piece.idx, this._m);
    this.dirty = true;
  }

  // Explosion damage to every panel touching the sphere
  damageSphere(x, y, z, r, dmg, attacker) {
    const hits = new Map();
    this.world.queryBoxes(x - r, y - r, z - r, x + r, y + r, z + r, this._tmp);
    for (const b of this._tmp) {
      const p = b.data && b.data.panel;
      if (!p || !p.alive) continue;
      const dx = Math.max(b.minX - x, 0, x - b.maxX);
      const dy = Math.max(b.minY - y, 0, y - b.maxY);
      const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > r) continue;
      const f = 1 - d / r;
      if (!hits.has(p) || hits.get(p) < f) hits.set(p, f);
    }
    for (const [p, f] of hits) {
      if (attacker) p.building.lastAttacker = attacker;
      this.damagePanel(p, dmg * (0.3 + 0.7 * f));
    }
  }

  damagePanel(p, amount) {
    if (!p.alive) return;
    p.hp -= amount;
    if (p.hp <= 0) this.destroyPanel(p, true);
  }

  destroyPanel(p, cascade = true, quiet = false) {
    if (!p.alive) return;
    p.alive = false;
    for (const piece of p.pieces) {
      this._show(piece, false);
      if (piece.box) this.world.disableBox(piece.box);
    }
    const b = p.building;
    const fx = this.game.effects;
    if (!quiet && fx) {
      const col = p.type === 'wall' ? b.color : 0xa8a397;
      fx.debris(p.cx, p.cy, p.cz, col, p.type === 'wall' ? 7 : 5, 0.45);
      fx.dust(p.cx, p.cy, p.cz, 2.2, 10, 0xb9ad98);
      if (this.crumbleCd <= 0) {
        this.game.audio.crumble(p.cx, p.cy, p.cz, false);
        this.crumbleCd = 0.12;
      }
    }
    if (p.type === 'wall' && cascade) {
      const above = b.walls[`${p.floor + 1}:${p.key}`];
      if (above && above.alive) this.pending.push({ t: 0.12 + Math.random() * 0.12, panel: above });
    }
    if (p.type === 'wall' && p.floor === 0 && !b.collapsed && !b.collapsing) {
      const dead = b.groundWalls.reduce((n, w) => n + (w.alive ? 0 : 1), 0);
      if (dead / b.groundWalls.length >= (b.floors >= 2 ? 0.42 : 0.55)) {
        b.collapsing = true;
        this.pending.push({ t: 0.9, collapse: b });
        this.game.audio.crumble(b.cx, b.base + 3, b.cz, true);
      }
    }
  }

  // Tank driving into a wall
  crush(box, attacker) {
    const p = box.data && box.data.panel;
    if (!p || !p.alive) return false;
    if (attacker) p.building.lastAttacker = attacker;
    this.destroyPanel(p, true);
    return true;
  }

  collapse(b) {
    if (b.collapsed) return;
    b.collapsed = true;
    for (const p of b.panels) {
      if (!p.alive) continue;
      p.alive = false;
      for (const piece of p.pieces) {
        this._show(piece, false);
        if (piece.box) this.world.disableBox(piece.box);
      }
    }
    for (const r of b.rubble) {
      this._show(r, true);
      if (!r.box) r.box = this.world.addBox(r.minX, r.minY, r.minZ, r.maxX, r.maxY, r.maxZ, { mat: 'concrete', rubble: true });
      else this.world.enableBox(r.box);
    }
    const fx = this.game.effects;
    const w = b.x1 - b.x0, d = b.z1 - b.z0, top = b.base + b.floors * H;
    for (let k = 0; k < 16; k++) {
      fx.debris(b.x0 + Math.random() * w, b.base + Math.random() * (top - b.base), b.z0 + Math.random() * d, k % 3 ? b.color : 0xa8a397, 3, 0.7);
    }
    for (let k = 0; k < 70; k++) {
      const px = b.x0 - 2 + Math.random() * (w + 4), pz = b.z0 - 2 + Math.random() * (d + 4);
      const py = b.base + Math.random() * (top - b.base + 2);
      fx.smoke.add(px, py, pz, (Math.random() - 0.5) * 6, rand(0.5, 3), (Math.random() - 0.5) * 6,
        rand(3, 6), rand(3, 5), rand(8, 13), 0xb5a891, 0.75, -0.2, 0.6);
    }
    this.game.audio.explosion(b.cx, b.base + 2, b.cz, 0.6);
    const cam = this.game.camera.position;
    const dist = Math.hypot(cam.x - b.cx, cam.z - b.cz);
    fx.addShake(Math.max(0, 1.2 - dist / 70));

    // Anyone inside gets crushed
    for (const s of this.game.soldiers) {
      if (s.state !== 'alive' || s.vehicle) continue;
      if (s.pos.x > b.x0 - 0.5 && s.pos.x < b.x1 + 0.5 && s.pos.z > b.z0 - 0.5 && s.pos.z < b.z1 + 0.5) {
        const upstairs = s.pos.y > b.base + 1.5;
        s.takeDamage(upstairs ? 250 : 80, b.lastAttacker, { weapon: 'BUILDING COLLAPSE', explosive: true, noRevive: upstairs });
      }
    }
    // Snap anyone standing inside the rubble up onto it
    for (const s of this.game.soldiers) {
      if (s.state === 'inactive' || s.vehicle) continue;
      if (s.pos.x > b.x0 && s.pos.x < b.x1 && s.pos.z > b.z0 && s.pos.z < b.z1) {
        s.pos.y = this.world.groundAt(s.pos.x, s.pos.z, s.pos.y + 3);
      }
    }
    this.game.emit('collapse', b);
  }

  update(dt) {
    this.crumbleCd -= dt;
    if (this.pending.length) {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const job = this.pending[i];
        job.t -= dt;
        if (job.t > 0) continue;
        this.pending.splice(i, 1);
        if (job.collapse) this.collapse(job.collapse);
        else this.destroyPanel(job.panel, true);
      }
    }
    if (this.dirty && this.mesh) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.dirty = false;
    }
  }

  reset() {
    this.pending.length = 0;
    for (const p of this.panels) {
      p.hp = p.maxHp;
      if (p.alive) continue;
      p.alive = true;
      for (const piece of p.pieces) {
        this._show(piece, true);
        if (piece.box) this.world.enableBox(piece.box);
      }
    }
    for (const b of this.list) {
      b.collapsed = false;
      b.collapsing = false;
      b.lastAttacker = null;
      for (const r of b.rubble) {
        this._show(r, false);
        if (r.box) this.world.disableBox(r.box);
      }
    }
  }
}
