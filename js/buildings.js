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
    // the pieces by the mesh that draws them: walls and floors, trim (frames, cornices, balconies), glass, metal
    this.layers = { main: [], trim: [], glass: [], metal: [] };
    this.meshes = {};
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
    // MEDIUM graphics and up dress the buildings: window frames and glass, sills, string courses, cornices and a
    // plinth; HIGH and up add mullions, shutters, quoins, balconies, downpipes and more on the roofs. None of it
    // collides or has hit points of its own: each piece is fixed to a wall or roof panel and goes with it. Its choices
    // come from a random stream of each building's own, so the buildings, panels and collision are the same at every
    // quality (multiplayer depends on that).
    const q = this.game.qualityName ? this.game.qualityName() : 'high';
    this.detail = q === 'low' ? 0 : q === 'medium' ? 1 : 2;
    for (const b of BUILDINGS) this._makeBuilding(b[0], b[1], b[2], b[3], b[4], rng);
    this._buildMesh();
  }

  _piece(minX, minY, minZ, maxX, maxY, maxZ, color, panel, mat = 'plaster', collide = true, layer = 'main') {
    const L = this.layers[layer];
    const piece = { idx: this.pieces.length, layer, li: L.length, minX, minY, minZ, maxX, maxY, maxZ, color, panel, box: null, visible: true, rotY: 0 };
    if (collide) piece.box = this.world.addBox(minX, minY, minZ, maxX, maxY, maxZ, { panel, mat });
    this.pieces.push(piece);
    L.push(piece);
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

    const faces = [], roof = [];
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
          if (this.detail) faces.push({ panel, side, axis, a0, a1, c0, y, f, i, n, kind });
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
          if (f + 1 === floors) roof.push(panel);
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

    if (this.detail) this._dress(bld, faces, roof);

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

  // a decoration: drawn, never collides, fixed to a panel
  _deco(minX, minY, minZ, maxX, maxY, maxZ, color, panel, layer = 'trim', rotY = 0) {
    const p = this._piece(minX, minY, minZ, maxX, maxY, maxZ, color, panel, 'plaster', false, layer);
    p.rotY = rotY;
    return p;
  }

  // Dress a building: its wall faces (each with its panel, side, position and kind) and its roof panels
  _dress(bld, faces, roof) {
    const r = mulberry32(((Math.round(bld.cx * 10) * 73856093) ^ (Math.round(bld.cz * 10) * 19349663)) >>> 0);
    const full = this.detail > 1, { x0, z0, x1, z1, nx, nz, floors } = bld;
    const wall = new THREE.Color(bld.color), c = new THREE.Color();
    const trim = c.copy(wall).lerp(new THREE.Color(0xf3eee4), 0.45).getHex();
    const band = c.copy(wall).multiplyScalar(0.84).getHex();
    const plinth = c.copy(wall).multiplyScalar(0.6).lerp(new THREE.Color(0x76726a), 0.45).getHex();
    const frame = [0xe6e2d8, 0x6b4a32, 0x44503f, 0x34404c, 0xd4ccbb][Math.floor(r() * 5)];
    const shutter = [0x4f6e4b, 0x405f7c, 0x7c4c33, 0x8d7c58, 0x5c6a70][Math.floor(r() * 5)];
    const iron = 0x2e2f30, tin = 0x9a9c97;
    const quoins = full && r() < 0.45, shutters = full && r() < 0.5, balconies = full && floors >= 2 && r() < 0.6;
    const pipe = full && !quoins && r() < 0.6 ? (r() < 0.5 ? 0 : 1) : -1;
    for (const F of faces) {
      const { panel, side, axis, c0, y, f, i, n, kind } = F;
      const s = side === 0 || side === 2 ? -1 : 1, cf = s < 0 ? c0 : c0 + TH;
      // a box against this face: s0..s1 along it, o0..o1 out from it (negative: into the wall), y0..y1
      const box = (s0, s1, o0, o1, y0, y1, col, layer = 'trim') => {
        const q0 = cf + s * o0, q1 = cf + s * o1, lo = Math.min(q0, q1), hi = Math.max(q0, q1);
        if (axis === 'x') this._deco(s0, y0, lo, s1, y1, hi, col, panel, layer);
        else this._deco(lo, y0, s0, hi, y1, s1, col, panel, layer);
      };
      // the courses at the ends of a side reach round the corner
      const e0 = i === 0 ? (axis === 'x' ? x0 : z0) - 0.08 : F.a0, e1 = i === n - 1 ? (axis === 'x' ? x1 : z1) + 0.08 : F.a1;
      const m = (F.a0 + F.a1) / 2;
      if (kind === 'parapet') {
        // coping on the parapet, a cornice under it
        box(e0, e1, -TH - 0.05, 0.08, y + 0.9, y + 1.0, trim);
        box(e0, e1, -0.02, 0.17, y - 0.22, y + 0.02, trim);
        if (full) box(e0, e1, -0.02, 0.09, y - 0.36, y - 0.22, trim);
        continue;
      }
      if (f >= 1) box(e0, e1, -0.02, 0.07, y - 0.1, y + 0.08, band);
      if (kind === 'window') {
        const gw = Math.min(0.65, (F.a1 - F.a0) / 2 - 0.3);
        // the frame round the opening and the sill under it
        box(m - gw - 0.1, m - gw + 0.02, -0.02, 0.06, y + 1.0, y + 2.32, trim);
        box(m + gw - 0.02, m + gw + 0.1, -0.02, 0.06, y + 1.0, y + 2.32, trim);
        box(m - gw - 0.16, m + gw + 0.16, -0.02, 0.09, y + 2.3, y + 2.46, trim);
        box(m - gw - 0.18, m + gw + 0.18, -0.06, 0.17, y + 0.9, y + 1.02, trim);
        if (f === 0) box(e0, e1, -0.02, 0.06, y, y + 0.55, plinth);
        // about half of them still have their glass
        if (r() < (f === 0 ? 0.4 : 0.55)) {
          box(m - gw, m + gw, -0.17, -0.14, y + 1.0, y + 2.3, c.setHex(0x5b6c78).multiplyScalar(0.85 + r() * 0.3).getHex(), 'glass');
          box(m - 0.03, m + 0.03, -0.2, -0.11, y + 1.0, y + 2.3, frame);
          if (full) {
            box(m - gw, m + gw, -0.2, -0.11, y + 1.78, y + 1.84, frame);
            box(m - gw, m + gw, -0.21, -0.1, y + 1.0, y + 1.06, frame);
            box(m - gw, m + gw, -0.21, -0.1, y + 2.24, y + 2.3, frame);
            box(m - gw, m - gw + 0.06, -0.21, -0.1, y + 1.06, y + 2.24, frame);
            box(m + gw - 0.06, m + gw, -0.21, -0.1, y + 1.06, y + 2.24, frame);
          }
        }
        // shutters folded back against the wall
        if (shutters && i > 0 && i < n - 1 && r() < 0.75) {
          box(m - gw - 0.54, m - gw - 0.12, 0, 0.035, y + 1.02, y + 2.3, shutter);
          box(m + gw + 0.12, m + gw + 0.54, 0, 0.035, y + 1.02, y + 2.3, shutter);
        }
        // a balcony with an iron railing
        if (balconies && f >= 1 && r() < 0.22) {
          const b0 = m - gw - 0.35, b1 = m + gw + 0.35;
          box(b0, b1, -0.02, 0.95, y - 0.02, y + 0.12, trim);
          box(b0, b1, 0.86, 0.93, y + 0.95, y + 1.0, iron, 'metal');
          box(b0, b0 + 0.05, 0, 0.93, y + 0.95, y + 1.0, iron, 'metal');
          box(b1 - 0.05, b1, 0, 0.93, y + 0.95, y + 1.0, iron, 'metal');
          for (let k = 0, nb = Math.round((b1 - b0) / 0.15); k <= nb; k++) { const u = b0 + 0.02 + (k / nb) * (b1 - b0 - 0.04); box(u - 0.014, u + 0.014, 0.875, 0.905, y + 0.12, y + 0.96, iron, 'metal'); }
          for (let k = 1; k <= 5; k++) { const o = (k / 6) * 0.9; box(b0 + 0.01, b0 + 0.04, o - 0.014, o + 0.014, y + 0.12, y + 0.96, iron, 'metal'); box(b1 - 0.04, b1 - 0.01, o - 0.014, o + 0.014, y + 0.12, y + 0.96, iron, 'metal'); }
        }
      } else if (kind === 'door') {
        const gw = Math.min(0.65, (F.a1 - F.a0) / 2 - 0.25);
        box(m - gw - 0.12, m - gw + 0.02, -0.02, 0.07, y, y + 2.42, trim);
        box(m + gw - 0.02, m + gw + 0.12, -0.02, 0.07, y, y + 2.42, trim);
        box(m - gw - 0.18, m + gw + 0.18, -0.02, 0.1, y + 2.4, y + 2.58, trim);
        box(m - gw - 0.25, m + gw + 0.25, -TH, 0.45, y - 0.2, y + 0.03, plinth);
        box(e0, m - gw - 0.12, -0.02, 0.06, y, y + 0.55, plinth);
        box(m + gw + 0.12, e1, -0.02, 0.06, y, y + 0.55, plinth);
        if (r() < 0.45) box(m - gw - 0.4, m + gw + 0.4, 0, 0.8, y + 2.72, y + 2.82, r() < 0.5 ? trim : tin, r() < 0.5 ? 'trim' : 'metal');
      } else if (f === 0) box(e0, e1, -0.02, 0.06, y, y + 0.55, plinth);
      // a downpipe down one corner
      if (side === pipe && i === 0) box(F.a0 + 0.12, F.a0 + 0.22, 0.01, 0.11, y + (f ? 0 : 0.2), y + H, 0x6e6b65, 'metal');
    }
    // dressed stone at the corners, long and short in turn
    if (quoins) {
      for (let f = 0; f < floors; f++) {
        for (const [cx, sx, i] of [[x0, -1, 0], [x1, 1, nx - 1]]) {
          for (const [cz, sz, j] of [[z0, -1, 0], [z1, 1, nz - 1]]) {
            const pa = bld.walls[`${f}:${sz < 0 ? 0 : 1}:${i}`], pb = bld.walls[`${f}:${sx < 0 ? 2 : 3}:${j}`];
            for (let k = 0; k < 6; k++) {
              const y0 = bld.base + f * H + 0.06 + k * 0.53, la = k % 2 ? 0.26 : 0.45, lb = k % 2 ? 0.45 : 0.26;
              const ax0 = sx < 0 ? cx - 0.05 : cx - la, ax1 = sx < 0 ? cx + la : cx + 0.05, az0 = sz < 0 ? cz - 0.05 : cz - 0.02, az1 = sz < 0 ? cz + 0.02 : cz + 0.05;
              this._deco(ax0, y0, az0, ax1, y0 + 0.45, az1, trim, pa);
              const bx0 = sx < 0 ? cx - 0.05 : cx - 0.02, bx1 = sx < 0 ? cx + 0.02 : cx + 0.05, bz0 = sz < 0 ? cz - 0.05 : cz - lb, bz1 = sz < 0 ? cz + lb : cz + 0.05;
              this._deco(bx0, y0, bz0, bx1, y0 + 0.45, bz1, trim, pb);
            }
          }
        }
      }
    }
    // the roof: air conditioners, vents, a water tank, an aerial
    const top = bld.base + floors * H;
    let aerial = r() < 0.4;
    for (const p of roof) {
      const px = p.cx + (r() - 0.5) * 0.9, pz = p.cz + (r() - 0.5) * 0.9, k = r(), rot = Math.floor(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.2;
      if (k < 0.16) {
        this._deco(px - 0.45, top, pz - 0.3, px + 0.45, top + 0.62, pz + 0.3, tin, p, 'metal', rot);
        this._deco(px - 0.25, top + 0.62, pz - 0.2, px + 0.25, top + 0.64, pz + 0.2, 0x2a2a2a, p, 'metal', rot);
      } else if (k < 0.27) {
        this._deco(px - 0.17, top, pz - 0.17, px + 0.17, top + 1.1, pz + 0.17, trim, p, 'trim');
        this._deco(px - 0.26, top + 1.1, pz - 0.26, px + 0.26, top + 1.17, pz + 0.26, band, p, 'trim');
      } else if (full && k < 0.35) {
        for (const [lx, lz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) this._deco(px + lx - 0.04, top, pz + lz - 0.04, px + lx + 0.04, top + 0.85, pz + lz + 0.04, iron, p, 'metal');
        this._deco(px - 0.58, top + 0.85, pz - 0.58, px + 0.58, top + 1.9, pz + 0.58, [0xd9d6cc, 0xa9b1b5, 0x8c969c][Math.floor(r() * 3)], p, 'metal', rot);
      } else if (aerial && k > 0.85) {
        aerial = false;
        this._deco(px - 0.025, top, pz - 0.025, px + 0.025, top + 2.8, pz + 0.025, iron, p, 'metal');
        for (const h of [2.1, 2.5, 2.75]) this._deco(px - 0.5, top + h, pz - 0.015, px + 0.5, top + h + 0.03, pz + 0.015, iron, p, 'metal', rot);
      }
    }
  }

  _buildMesh() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = worldUVMaterial({ map: this.world.tex.plaster, normalMap: this.world.tex.plasterN, normalScale: 0.75, scale: 0.32 });
    const mats = {
      main: this.mat, trim: this.mat,
      // the glass reflects the sky and lets you see who is in the room
      glass: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.5, depthWrite: false }),
      metal: new THREE.MeshStandardMaterial({ map: this.world.tex.metal, color: 0xffffff, roughness: 0.6, metalness: 0.35 }),
    };
    const col = new THREE.Color();
    for (const k of Object.keys(this.layers)) {
      const L = this.layers[k];
      if (!L.length) continue;
      const mesh = new THREE.InstancedMesh(geo, mats[k], L.length);
      this.meshes[k] = mesh;
      for (const piece of L) {
        this._show(piece, piece.visible);
        mesh.setColorAt(piece.li, col.set(piece.color));
      }
      mesh.castShadow = k !== 'glass';
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      this.game.scene.add(mesh);
    }
    this.mesh = this.meshes.main;
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
    const mesh = this.meshes[piece.layer];
    if (mesh) mesh.setMatrixAt(piece.li, this._m);
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
    if (this.dirty) {
      for (const k in this.meshes) this.meshes[k].instanceMatrix.needsUpdate = true;
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
