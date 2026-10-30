// Sixth Front — skyscrapers.
// Every map gets clusters of towers where there's room for them: dry, fairly level ground clear of the objectives,
// the bases, the roads and the town, from a random stream of the map's own (so every player in a game has the same
// ones). Their lobbies stand on pillars, so soldiers and tanks go through underneath, and aircraft fly between them.
// Where they are hit, floors catch fire and burn, with smoke pouring up the facade. Enough explosives at the foot of
// one (a few C-4 charges, tank shells or a bomb) and it comes down: it shudders and leans, then sinks into a rolling
// cloud of its own dust with sparks, glass and slabs pouring off it, the ground shaking for hundreds of metres, and
// leaves a smoking heap of rubble.
import * as THREE from 'three';
import { PLAY_HALF, FLAGS, HQS, BUILDINGS, MAP, TERRAIN } from './config.js';
import { mulberry32, clamp, smoothstep, rand, mergeParts } from './util.js';

const FLOOR = 3.8;     // storey height
const LOBBY = 7.6;     // the lobby: two storeys open on pillars
const CHUNKS = 160;    // slabs of concrete and glass falling off a collapsing tower
const BURNS = 5;       // fires per tower

// the facades: blue-green curtain glass, a concrete block with deep windows, dark bronze office glass
const STYLES = [
  { name: 'glass', bay: 3.0, frame: '#2a3136', glass: ['#4f7287', '#587c8f', '#456a80', '#61879a', '#3f6175'], band: '#37414a', lit: 0.13, metal: 0.55, mat: 'metal' },
  { name: 'concrete', bay: 3.4, wall: '#b8b1a5', glass: ['#2c353b', '#323c43', '#28313a'], lit: 0.2, metal: 0.05, mat: 'concrete' },
  { name: 'dark', bay: 2.6, frame: '#1d2124', glass: ['#26313a', '#2d3438', '#33373a', '#2a2f33'], band: '#22272b', lit: 0.1, metal: 0.75, mat: 'metal' },
];

function facadeTextures(st, size) {
  const N = 8, c = size / N;
  const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = size; return cv; };
  const col = mk(), rough = mk(), emit = mk();
  const x = col.getContext('2d'), r = rough.getContext('2d'), e = emit.getContext('2d');
  const rng = mulberry32(31 + st.bay * 100);
  e.fillStyle = '#000'; e.fillRect(0, 0, size, size);
  if (st.wall) {
    // concrete: a mottled wall, a deep window in each bay with its frame and sill
    x.fillStyle = st.wall; x.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) { const v = 150 + rng() * 60 | 0; x.fillStyle = `rgba(${v},${v - 4},${v - 10},0.25)`; x.fillRect(rng() * size, rng() * size, 2 + rng() * 14, 2 + rng() * 14); }
    r.fillStyle = 'rgb(225,225,225)'; r.fillRect(0, 0, size, size);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const wx = i * c + c * 0.2, wy = j * c + c * 0.24, ww = c * 0.6, wh = c * 0.5;
      x.fillStyle = 'rgba(40,38,34,0.55)'; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 8);
      x.fillStyle = st.glass[(rng() * st.glass.length) | 0]; x.fillRect(wx, wy, ww, wh);
      // the sky caught in the top of the pane
      const gr = x.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, 'rgba(170,190,205,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(wx, wy, ww, wh * 0.6);
      x.fillStyle = '#5a5650'; x.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      x.fillStyle = '#d4cec2'; x.fillRect(wx - 4, wy + wh + 3, ww + 8, 4);
      r.fillStyle = 'rgb(30,30,30)'; r.fillRect(wx, wy, ww, wh);
      if (rng() < st.lit) { e.fillStyle = rng() < 0.7 ? '#ffd29a' : '#dfe8ff'; e.globalAlpha = 0.5 + rng() * 0.5; e.fillRect(wx, wy, ww, wh); e.globalAlpha = 1; }
    }
    // stains running down from the sills
    for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(70,64,56,0.12)'; x.fillRect(rng() * size, rng() * size, 2 + rng() * 3, 10 + rng() * 40); }
  } else {
    // curtain glass: a pane in each bay and floor, mullions between, an opaque spandrel band at each floor
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const g0 = st.glass[(rng() * st.glass.length) | 0];
      x.fillStyle = g0; x.fillRect(i * c, j * c, c, c);
      const gr = x.createLinearGradient(i * c, j * c, i * c + c, j * c + c);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
      x.fillStyle = gr; x.fillRect(i * c, j * c, c, c);
      if (rng() < st.lit) { e.fillStyle = rng() < 0.65 ? '#ffd8a4' : '#e6eeff'; e.globalAlpha = 0.45 + rng() * 0.5; e.fillRect(i * c + c * 0.04, j * c + c * 0.18, c * 0.92, c * 0.78); e.globalAlpha = 1; }
    }
    r.fillStyle = 'rgb(18,18,18)'; r.fillRect(0, 0, size, size);
    x.fillStyle = st.band; r.fillStyle = 'rgb(150,150,150)';
    for (let j = 0; j < N; j++) { x.fillRect(0, j * c, size, c * 0.16); r.fillRect(0, j * c, size, c * 0.16); }
    x.fillStyle = st.frame; r.fillStyle = 'rgb(120,120,120)';
    for (let i = 0; i <= N; i++) { x.fillRect(i * c - c * 0.03, 0, c * 0.06, size); r.fillRect(i * c - c * 0.03, 0, c * 0.06, size); }
    e.fillStyle = '#000';
    for (let j = 0; j < N; j++) e.fillRect(0, j * c, size, c * 0.16);
  }
  const tex = (cv, srgb, aniso = 1) => {
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(col, true, size > 512 ? 8 : 4), rough: tex(rough, false), emit: tex(emit, true), tileW: N * st.bay, tileH: N * FLOOR };
}

// a box whose sides are mapped onto the facade in metres: whole bays across, whole floors up from `y0`
function facadeBox(w, h, d, tileW, tileH, y0, uOff) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // faces: +x, -x, +y, -y, +z, -z (four vertices each)
  const across = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++) {
    if (f === 2 || f === 3) continue;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uOff + f * 3 + (uv.getX(i) * across[f]) / tileW, (y0 + uv.getY(i) * h) / tileH);
    }
  }
  uv.needsUpdate = true;
  return g;
}

// the colours of the dust of a building coming down: concrete, plaster, soot
const DUST = [0x6f675d, 0x7f766a, 0x8e8577, 0x5f5850, 0x857c70];
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();

export class Towers {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.list = [];
    this.on = true;
    this.chunks = [];
    this.lightT = 0;
    this.toastT = 0;
  }

  generate() {
    const g = this.game, W = this.world;
    const q = g.qualityName ? g.qualityName() : 'high', hi = q === 'high' || q === 'ultra', low = q === 'low';
    const size = hi ? 1024 : 512;
    this.styles = STYLES.map((st) => {
      const T = facadeTextures(st, size);
      // (LOW graphics: one texture, no glossy glass or lit windows)
      const facade = low
        ? new THREE.MeshStandardMaterial({ map: T.map, roughness: st.wall ? 0.85 : 0.3, metalness: st.metal * 0.6 })
        : new THREE.MeshStandardMaterial({ map: T.map, roughnessMap: T.rough, roughness: 1, metalness: st.metal, emissiveMap: T.emit, emissive: 0xffffff, emissiveIntensity: 0.15, envMapIntensity: 1.2 });
      return { ...st, T, facade };
    });
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x6d6a64, roughness: 0.9, metalness: 0.1 });
    this.soffitMat = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.8, metalness: 0.2 });
    this.partMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.35 });
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0x1d2328, roughness: 0.08, metalness: 0.85, emissive: 0xffd9a8, emissiveIntensity: 0.12 });
    this.rubbleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.05 });
    this.redMat = new THREE.MeshBasicMaterial({ color: 0xff2a14 });
    // the fires' scorch marks on the facades
    const sc = document.createElement('canvas'); sc.width = sc.height = 128;
    const sx = sc.getContext('2d'), sg = sx.createRadialGradient(64, 64, 4, 64, 64, 64);
    sg.addColorStop(0, 'rgba(8,6,5,0.95)'); sg.addColorStop(0.55, 'rgba(20,16,12,0.7)'); sg.addColorStop(1, 'rgba(30,24,18,0)');
    sx.fillStyle = sg; sx.fillRect(0, 0, 128, 128);
    const scT = new THREE.CanvasTexture(sc); scT.colorSpace = THREE.SRGBColorSpace;
    this.scorchMat = new THREE.MeshBasicMaterial({ map: scT, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.scorchGeo = new THREE.PlaneGeometry(1, 1);
    // the slabs falling off a collapsing tower
    this.chunkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.1 }), CHUNKS);
    this.chunkMesh.count = 0; this.chunkMesh.frustumCulled = false; this.chunkMesh.castShadow = true;
    g.scene.add(this.chunkMesh);
    // their own dust (a collapse would swamp the battle's smoke), in the battle's smoke texture
    const S = g.effects.smoke;
    this.dust = new S.constructor(g.scene, 2400, false, S.uniforms.map.value);

    const T = TERRAIN.towers;
    const specs = Array.isArray(T) ? T.map((t) => ({ x: t[0], z: t[1], w: t[2], d: t[3], h: t[4], style: t[5] >= 0 ? t[5] : -1 })) : this._place(T === null || T === undefined ? null : T);
    const rng = mulberry32(this._seed() + 7);
    for (const s of specs) this._build(s, rng);
    // obstacles for aircraft: the tops of the standing towers
    W.topAt = (x, z) => Math.max(W.heightAt(x, z), this.topAt(x, z));
  }

  _seed() {
    let h = 2166136261;
    for (const ch of String(MAP.name || 'map') + PLAY_HALF) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // where they go: a few clusters, the tallest in the middle of each, on dry ground that's level enough
  _place(count) {
    const W = this.world, sea = W.water, big = PLAY_HALF >= 600;
    const want = count === null ? (big ? 16 : 8) : count;
    if (!want) return [];
    const rng = mulberry32(this._seed());
    const gridHalf = Math.max(320, PLAY_HALF + 80);
    const R = Math.min(PLAY_HALF + (big ? 140 : 40), gridHalf - 40);
    const out = [];
    const fits = (x, z, w, d) => {
      const hw = w / 2, hd = d / 2, half = Math.max(hw, hd);
      if (Math.abs(x) + hw > R || Math.abs(z) + hd > R) return false;
      let lo = Infinity, hiH = -Infinity;
      for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const y = W.heightAt(x + a * (hw + 2), z + b * (hd + 2));
        lo = Math.min(lo, y); hiH = Math.max(hiH, y);
      }
      if (sea !== null && lo < sea + 2) return false;
      if (hiH - lo > (big ? 9 : 2.6)) return false;
      for (const f of FLAGS) if (Math.hypot(f.x - x, f.z - z) < (f.radius || 20) + half + 22) return false;
      for (const q of HQS) if (Math.hypot(q.x - x, q.z - z) < (big ? 280 : 80) + half) return false;
      for (const b of BUILDINGS) if (Math.abs(b[0] - x) < (b[2] * 2.5) / 2 + hw + 10 && Math.abs(b[1] - z) < (b[3] * 2.5) / 2 + hd + 10) return false;
      if (W._roadDist && W._roadDist(x, z) < half + 9) return false;
      const gap = big ? 26 : 14;
      for (const t of out) if (Math.abs(t.x - x) < (t.w + w) / 2 + gap && Math.abs(t.z - z) < (t.d + d) / 2 + gap) return false;
      return true;
    };
    const centres = [];
    for (let i = 0; i < 600 && centres.length < (big ? 3 : 2); i++) {
      const x = (rng() * 2 - 1) * R, z = (rng() * 2 - 1) * R;
      if (!fits(x, z, 26, 26)) continue;
      if (centres.some((c) => Math.hypot(c.x - x, c.z - z) < R * 0.55)) continue;
      centres.push({ x, z, n: 0 });
    }
    if (!centres.length) return out;
    for (let i = 0; i < 2500 && out.length < want; i++) {
      const c = centres[i % centres.length];
      const spread = (big ? 230 : 75) * Math.sqrt(rng());
      const a = rng() * Math.PI * 2, x = c.x + Math.cos(a) * spread * (c.n ? 1 : 0.15), z = c.z + Math.sin(a) * spread * (c.n ? 1 : 0.15);
      const w0 = big ? 24 : 15, wr = big ? 20 : 15;
      const w = Math.round((w0 + rng() * wr) / 1.5) * 1.5, d = Math.round((w0 + rng() * wr) / 1.5) * 1.5;
      if (!fits(x, z, w, d)) continue;
      // the tallest at the heart of the cluster, lower ones round it
      const k = c.n ? 0.25 + rng() * 0.6 : 1;
      const h = big ? 70 + k * (150 + rng() * 60) : 42 + k * (55 + rng() * 25);
      out.push({ x, z, w, d, h: Math.round(h / FLOOR) * FLOOR + LOBBY, style: -1 });
      c.n++;
    }
    return out;
  }

  _build(s, rng) {
    const W = this.world, g = this.game;
    const style = s.style >= 0 ? s.style : rng() < 0.45 ? 0 : rng() < 0.55 ? 1 : 2;
    const st = this.styles[style];
    const hw = s.w / 2, hd = s.d / 2;
    let lo = Infinity, top0 = -Infinity;
    for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) { const y = W.heightAt(s.x + a * hw, s.z + b * hd); lo = Math.min(lo, y); top0 = Math.max(top0, y); }
    const floorY = top0 + 0.1, H = s.h, topY = floorY + H;
    const t = {
      cx: s.x, cz: s.z, w: s.w, d: s.d, h: H, style, floorY, lo, topY, state: 'up',
      maxHp: 2000 + H * 10, hp: 0, burns: [], boxes: [], lean: new THREE.Vector2(), lastBy: null,
      leanOff: new THREE.Vector2(), setback: H > 110 && rng() < 0.55, antenna: rng() < 0.5, preburn: rng() < 0.3 ? 1 + ((rng() * 2.5) | 0) : 0, uOff: (rng() * 8) | 0,
    };
    t.hp = t.maxHp;
    const root = new THREE.Group(); root.position.set(s.x, floorY, s.z);
    const pivot = new THREE.Group(); root.add(pivot);
    t.root = root; t.pivot = pivot;
    const mats = [st.facade, st.facade, this.roofMat, this.soffitMat, st.facade, st.facade];
    const addBody = (w, d, y0, y1) => {
      const m = new THREE.Mesh(facadeBox(w, y1 - y0, d, st.T.tileW, st.T.tileH, y0 - LOBBY, t.uOff), mats);
      m.position.y = (y0 + y1) / 2; m.castShadow = m.receiveShadow = true;
      pivot.add(m);
      t.boxes.push({ dx0: -w / 2, dx1: w / 2, dz0: -d / 2, dz1: d / 2, y0, y1, mat: st.mat });
    };
    // the shaft (stepping in two thirds of the way up on a set-back tower)
    let roofW = s.w, roofD = s.d;
    if (t.setback) {
      const y1 = LOBBY + Math.round((H - LOBBY) * 0.62 / FLOOR) * FLOOR;
      addBody(s.w, s.d, LOBBY, y1);
      roofW = Math.round(s.w * 0.72); roofD = Math.round(s.d * 0.72);
      addBody(roofW, roofD, y1, H);
      // the ledge round the step
      t.ledge = y1;
    } else addBody(s.w, s.d, LOBBY, H);
    // the lobby: pillars all round, and the glass core with the lifts in the middle
    const parts = [], pc = style === 1 ? 0x9a958c : 0x50565b, ph = LOBBY + floorY - lo + 2;
    const nx = Math.max(2, Math.round(s.w / 8) + 1), nz = Math.max(2, Math.round(s.d / 8) + 1);
    const pillar = (x, z) => {
      parts.push({ s: [1.1, ph, 1.1], p: [x, LOBBY - ph / 2, z], c: pc });
      t.boxes.push({ dx0: x - 0.55, dx1: x + 0.55, dz0: z - 0.55, dz1: z + 0.55, y0: LOBBY - ph, y1: LOBBY, mat: 'concrete' });
    };
    for (let i = 0; i < nx; i++) { const x = -hw + 0.6 + (i * (s.w - 1.2)) / (nx - 1); pillar(x, -hd + 0.6); pillar(x, hd - 0.6); }
    for (let j = 1; j < nz - 1; j++) { const z = -hd + 0.6 + (j * (s.d - 1.2)) / (nz - 1); pillar(-hw + 0.6, z); pillar(hw - 0.6, z); }
    const cw = Math.max(5, s.w * 0.3), cd = Math.max(5, s.d * 0.3);
    const core = new THREE.Mesh(new THREE.BoxGeometry(cw, ph, cd), this.coreMat);
    core.position.y = LOBBY - ph / 2; core.castShadow = true;
    pivot.add(core);
    t.boxes.push({ dx0: -cw / 2, dx1: cw / 2, dz0: -cd / 2, dz1: cd / 2, y0: LOBBY - ph, y1: LOBBY, mat: 'metal' });
    // the crown: a parapet, the plant room, maybe a mast; red lights on the corners for the aircraft
    const lights = [];
    parts.push({ s: [roofW + 0.4, 1.2, 0.5], p: [0, H + 0.6, roofD / 2], c: 0x55585b }, { s: [roofW + 0.4, 1.2, 0.5], p: [0, H + 0.6, -roofD / 2], c: 0x55585b });
    parts.push({ s: [0.5, 1.2, roofD], p: [roofW / 2, H + 0.6, 0], c: 0x55585b }, { s: [0.5, 1.2, roofD], p: [-roofW / 2, H + 0.6, 0], c: 0x55585b });
    const pw = roofW * 0.42, pd = roofD * 0.42;
    parts.push({ s: [pw, 5, pd], p: [roofW * 0.12, H + 2.5, -roofD * 0.1], c: 0x6b6d6f });
    for (let i = 0; i < 4; i++) parts.push({ s: [1.6, 1.4, 1.6], p: [-roofW * 0.3 + (i % 2) * 2.4, H + 0.7, roofD * 0.25 + ((i / 2) | 0) * 2.4], c: 0x8a8d90 });
    t.boxes.push({ dx0: roofW * 0.12 - pw / 2, dx1: roofW * 0.12 + pw / 2, dz0: -roofD * 0.1 - pd / 2, dz1: -roofD * 0.1 + pd / 2, y0: H, y1: H + 5, mat: 'metal' });
    let crownTop = H + 5;
    if (t.antenna) {
      const ah = 14 + rng() * 22;
      parts.push({ s: [0.5, ah, 0.5], p: [roofW * 0.12, H + 5 + ah / 2, -roofD * 0.1], c: 0xb8bcc0 });
      for (let k = 1; k < 4; k++) parts.push({ s: [2.2 - k * 0.4, 0.2, 0.2], p: [roofW * 0.12, H + 5 + (ah * k) / 4, -roofD * 0.1], c: 0xb8bcc0 });
      lights.push([roofW * 0.12, H + 5 + ah + 0.3, -roofD * 0.1]);
      crownTop = H + 5 + ah;
    }
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lights.push([(a * roofW) / 2, H + 1.4, (b * roofD) / 2]);
    const pm = new THREE.Mesh(mergeParts(parts), this.partMat);
    pm.castShadow = pm.receiveShadow = true;
    pivot.add(pm);
    const lm = new THREE.Mesh(mergeParts(lights.map((p) => ({ geo: new THREE.SphereGeometry(0.45, 8, 6), p, c: 0xffffff }))), this.redMat);
    pivot.add(lm);
    t.crownTop = floorY + crownTop;
    // the rubble it leaves: a low heap of slabs, steel and dust (hidden until then)
    const rub = [], rc = style === 1 ? 0x9d978c : 0x7c7c78;
    const mh = Math.min(16, 4 + H * 0.06);
    for (let i = 0; i < 46; i++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * Math.max(hw, hd) * 1.25, k = 1 - rr / (Math.max(hw, hd) * 1.3);
      rub.push({ s: [3 + rng() * 6, 0.6 + rng() * 1.4, 2 + rng() * 5], p: [Math.cos(a) * rr, lo - floorY + k * mh * (0.5 + rng() * 0.5), Math.sin(a) * rr], c: i % 7 ? rc : 0x3a3430, r: [rng() - 0.5, rng() * 3, rng() - 0.5] });
    }
    for (let i = 0; i < 8; i++) rub.push({ s: [0.35, 0.35, 6 + rng() * 8], p: [(rng() - 0.5) * s.w, lo - floorY + mh * (0.3 + rng() * 0.5), (rng() - 0.5) * s.d], c: 0x3c3a38, r: [rng() - 0.5, rng() * 3, rng() * 0.9 - 0.45] });
    rub.push({ geo: new THREE.ConeGeometry(Math.max(hw, hd) * 1.35, mh, 9), p: [0, lo - floorY + mh / 2 - 0.5, 0], c: rc });
    const rm = new THREE.Mesh(mergeParts(rub), this.rubbleMat);
    rm.visible = false; rm.castShadow = rm.receiveShadow = true;
    root.add(rm);
    t.rubble = rm; t.rubbleH = mh;
    g.scene.add(root);
    // collision: the shaft, the pillars, the core, the plant room (all in the world's grid)
    for (const b of t.boxes) b.box = W.addBox(s.x + b.dx0, floorY + b.y0, s.z + b.dz0, s.x + b.dx1, floorY + b.y1, s.z + b.dz1, { tower: t, mat: b.mat });
    t.rubbleBox = null;
    this.list.push(t);
    this._preburn(t, rng);
  }

  // some of them already burning when the battle starts
  _preburn(t, rng) {
    for (let i = 0; i < t.preburn; i++) {
      const side = (rng() * 4) | 0, y = t.floorY + LOBBY + 6 + rng() * (t.h - LOBBY - 14) * (t.setback ? 0.55 : 0.9);
      const a = (rng() - 0.5) * 0.8;
      const p = side === 0 ? [t.cx + t.w / 2, t.cz + a * t.d] : side === 1 ? [t.cx - t.w / 2, t.cz + a * t.d] : side === 2 ? [t.cx + a * t.w, t.cz + t.d / 2] : [t.cx + a * t.w, t.cz - t.d / 2];
      this._burn(t, p[0], y, p[1], true);
    }
  }

  // the top of whatever stands at (x, z): a tower's crown, or nothing
  topAt(x, z) {
    let top = -Infinity;
    if (!this.on) return top;
    for (const t of this.list) {
      if (t.state === 'down') continue;
      if (Math.abs(x - t.cx) < t.w / 2 + 8 && Math.abs(z - t.cz) < t.d / 2 + 8) top = Math.max(top, t.state === 'up' ? t.crownTop : t.floorY + t.rubbleH);
    }
    return top;
  }

  // an explosion: the towers within its reach take it, far harder at their foot (what holds them up) than higher up,
  // where it sets the floors on fire
  blast(x, y, z, r, def, owner) {
    if (!this.on || !this.list.length) return;
    const str = def.structural || (def.veh || 0) * 0.6 || (def.dmg || 0) * 0.3;
    if (str < 25) return;
    const reach = r * 1.2 + 4;
    for (const t of this.list) {
      if (t.state !== 'up') continue;
      const dx = Math.max(t.cx - t.w / 2 - x, 0, x - t.cx - t.w / 2), dz = Math.max(t.cz - t.d / 2 - z, 0, z - t.cz - t.d / 2);
      const dy = Math.max(t.lo - y, 0, y - t.topY);
      const d = Math.hypot(dx, dy, dz);
      if (d > reach) continue;
      const low = y < t.floorY + LOBBY + 5;
      const dmg = str * (1 - (d / reach) * 0.7) * (low ? 2.6 : 0.45);
      t.hp -= dmg;
      if (owner) t.lastBy = owner;
      // it leans toward where it's been hurt most
      t.lean.x += (x - t.cx) * dmg; t.lean.y += (z - t.cz) * dmg;
      if (!low && dmg > 40) this._burn(t, x, y, z);
      const P = this.game.player;
      if (owner === P && P && this.toastT <= 0 && t.hp > 0) { this.toastT = 1.2; this.game.hud.toast(`SKYSCRAPER ${Math.max(1, Math.round((t.hp / t.maxHp) * 100))}% · ${low ? 'HIT IT AT ITS FOOT' : 'HIT IT LOW: AT ITS FOOT'}`); }
      if (t.hp <= 0) this._fall(t);
    }
  }

  _burn(t, x, y, z, quiet = false) {
    if (t.burns.length >= BURNS) return;
    if (t.burns.some((b) => Math.hypot(b.x - x, b.y - y, b.z - z) < 10)) return;
    // onto the nearest face
    const fx = (x - t.cx) / (t.w / 2), fz = (z - t.cz) / (t.d / 2);
    let nx = 0, nz = 0;
    if (Math.abs(fx) > Math.abs(fz)) nx = Math.sign(fx) || 1; else nz = Math.sign(fz) || 1;
    const hx = nx ? t.w / 2 : clamp(x - t.cx, -t.w / 2 + 2, t.w / 2 - 2), hz = nz ? t.d / 2 : clamp(z - t.cz, -t.d / 2 + 2, t.d / 2 - 2);
    // (above the step of a set-back tower the face is further in)
    let k = 1;
    if (t.ledge && y - t.floorY > t.ledge) k = 0.72;
    const px = nx ? hx * k : hx * k, pz = nz ? hz * k : hz * k;
    const ly = clamp(y - t.floorY, LOBBY + 3, t.h - 3);
    const m = new THREE.Mesh(this.scorchGeo, this.scorchMat);
    const sz = rand(9, 15);
    m.scale.set(sz, sz * 1.5, 1);
    m.position.set(px + nx * 0.08, ly + sz * 0.3, pz + nz * 0.08);
    m.rotation.y = nx ? (nx > 0 ? Math.PI / 2 : -Math.PI / 2) : nz > 0 ? 0 : Math.PI;
    t.pivot.add(m);
    t.burns.push({ x: t.cx + px, y: t.floorY + ly, z: t.cz + pz, nx, nz, lx: px, ly, lz: pz, mesh: m, t: 0, k: rand(0.7, 1.2) });
    if (!quiet) this.game.audio.crumble(x, y, z, false);
  }

  _fall(t) {
    if (t.state !== 'up') return;
    t.state = 'falling';
    t.ft = 0; t.drop = 0; t.boxT = 0; t.crushed = false; t.fxT = 0; t.boomT = 0;
    t.hang = 1.5 + t.h / 200;
    t.accel = clamp(2 + t.h / 90, 2.6, 4.5);
    const L = t.lean.length() > 1 ? t.lean.clone().normalize() : new THREE.Vector2(Math.cos(t.cx), Math.sin(t.cz));
    t.leanDir = L; t.leanMax = rand(0.08, 0.18);
    const g = this.game, fx = g.effects, A = g.audio;
    // the charges and the columns going: blasts round its foot, one after another
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = t.cx + Math.cos(a) * t.w * 0.45, z = t.cz + Math.sin(a) * t.d * 0.45;
      setTimeout(() => { if (t.state === 'falling') { fx.explosion(x, t.floorY + 2 + Math.random() * 4, z, 1.6); } }, i * 120);
    }
    A.explosion(t.cx, t.floorY + 4, t.cz, 2.2);
    if (A.collapse) A.collapse(t.cx, t.floorY + 10, t.cz, t.hang + Math.sqrt((2 * t.h) / t.accel) + 4);
    const cam = g.camera.position, dist = Math.hypot(cam.x - t.cx, cam.z - t.cz);
    fx.addShake(clamp(1.6 - dist / (300 + t.h * 2), 0, 1.6));
    if (dist < 400) g.vibrate(dist < 150 ? 400 : 160);
    const P = g.player;
    if (dist < 1800 && g.hud) {
      if (t.lastBy === P) { g.hud.banner('YOU BROUGHT DOWN A SKYSCRAPER', '#f2b33d'); if (P.stats) P.stats.score += 500; }
      else g.hud.banner('A SKYSCRAPER IS COMING DOWN', '#f2b33d');
    }
    g.emit('towerFall', t);
  }

  update(dt) {
    if (!this.list.length) return;
    const g = this.game, fx = g.effects, cam = g.camera.position;
    this.toastT -= dt;
    // night: the lit windows and the red lights
    this.lightT += dt;
    const night = clamp(1.4 - (g.world.sun ? g.world.sun.intensity : 2) * 0.5, 0.12, 1.25);
    for (const st of this.styles) st.facade.emissiveIntensity = night;
    this.coreMat.emissiveIntensity = night * 0.6;
    this.redMat.color.setHex(Math.sin(this.lightT * 3.2) > 0.2 ? 0xff2a14 : 0x3a0804);
    if (!this.on) return;
    for (const t of this.list) {
      const dist = Math.hypot(cam.x - t.cx, cam.z - t.cz);
      if (t.state === 'up' || t.state === 'falling') this._burnFx(t, dt, dist);
      if (t.state === 'falling') this._collapseStep(t, dt, dist);
      else if (t.state === 'down') {
        // the heap smoulders
        t.ft += dt;
        if (dist < 1600 && Math.random() < dt * (t.ft < 60 ? 3 : 0.8)) {
          fx.smoke.add(t.cx + rand(-t.w, t.w) * 0.5, t.floorY + t.rubbleH * 0.6, t.cz + rand(-t.d, t.d) * 0.5, rand(-0.5, 0.5), rand(1.5, 3), rand(-0.5, 0.5), rand(10, 16), 3, 14, 0x4d4842, 0.45, -0.05, 0.1);
        }
      }
    }
    this._chunkStep(dt);
    if (this.dust.count) { this.dust.uniforms.scale.value = fx.smoke.uniforms.scale.value; this.dust.update(dt); }
  }

  // the fires: flames licking out of the windows, black smoke rolling up the face and drifting off
  _burnFx(t, dt, dist) {
    if (!t.burns.length || dist > 2200) return;
    const fx = this.game.effects, lod = dist < 500 ? 1 : dist < 1200 ? 0.5 : 0.25;
    for (const b of t.burns) {
      b.t += dt;
      // (on a falling tower they go with it)
      const x = t.state === 'falling' ? b.x + t.leanOff.x * (b.ly / t.h) : b.x, z = t.state === 'falling' ? b.z + t.leanOff.y * (b.ly / t.h) : b.z;
      const y = t.state === 'falling' ? b.y - t.drop : b.y;
      if (y < t.floorY) continue;
      if (Math.random() < dt * 9 * lod * b.k) {
        fx.fire.add(x + b.nx * rand(0.5, 1.5) + (b.nz ? rand(-4, 4) : 0), y + rand(-1.5, 1), z + b.nz * rand(0.5, 1.5) + (b.nx ? rand(-4, 4) : 0), b.nx * rand(0.5, 1.5), rand(2, 4), b.nz * rand(0.5, 1.5), rand(0.6, 1.1), rand(2.5, 4), rand(1, 2), Math.random() < 0.5 ? 0xff8a30 : 0xffb850, 0.9, -2, 0.5);
      }
      if (Math.random() < dt * 2.6 * lod * b.k) {
        fx.smoke.add(x + b.nx * 2, y + 2, z + b.nz * 2, b.nx * rand(0.5, 1.5) + 1.2, rand(3, 5), b.nz * rand(0.5, 1.5) + 0.6, rand(12, 18), rand(4, 6), rand(18, 30), Math.random() < 0.5 ? 0x26221f : 0x34302c, 0.7, -0.12, 0.06);
      }
    }
  }

  _collapseStep(t, dt, dist) {
    const g = this.game, fx = g.effects, W = this.world, A = g.audio;
    t.ft += dt;
    const tt = t.ft - t.hang;
    // shuddering and leaning before it goes, then down into its own dust, faster and faster
    t.drop = tt > 0 ? 0.5 * t.accel * tt * tt : 0;
    const prog = clamp(t.drop / t.h, 0, 1);
    const lean = (tt > 0 ? t.leanMax * smoothstep(0, 1, prog * 1.4) : t.leanMax * 0.08 * (t.ft / t.hang));
    const jit = tt < 0.6 ? 0.12 : 0.04;
    t.root.position.set(t.cx + rand(-jit, jit), t.floorY - t.drop, t.cz + rand(-jit, jit));
    t.pivot.rotation.set(t.leanDir.y * lean, 0, -t.leanDir.x * lean);
    t.leanOff.set(t.leanDir.x * Math.sin(lean) * t.h * 0.6, t.leanDir.y * Math.sin(lean) * t.h * 0.6);
    const lod = dist < 600 ? 1 : dist < 1400 ? 0.5 : 0.25;
    const hw = t.w / 2, hd = t.d / 2, front = t.floorY;
    // the ground shakes the whole time
    fx.shake = Math.max(fx.shake, (tt > 0 ? 0.6 : 0.3) * clamp(1 - dist / (500 + t.h * 3), 0, 1));
    t.boomT -= dt;
    if (t.boomT <= 0 && t.drop < t.h) { t.boomT = rand(0.9, 1.6); A.crumble(t.cx, front + 6, t.cz, true); if (Math.random() < 0.5) A.explosion(t.cx + rand(-hw, hw), front + 4, t.cz + rand(-hd, hd), 0.8); }
    const perim = () => {
      const s = Math.random() * 4 | 0, u = Math.random() * 2 - 1;
      return s === 0 ? [t.cx + hw, t.cz + u * hd, 1, 0] : s === 1 ? [t.cx - hw, t.cz + u * hd, -1, 0] : s === 2 ? [t.cx + u * hw, t.cz + hd, 0, 1] : [t.cx + u * hw, t.cz - hd, 0, -1];
    };
    if (tt < 0) {
      // sparks and glass from the floors giving way at its foot
      if (Math.random() < dt * 30 * lod) {
        const [x, z, nx, nz] = perim();
        for (let i = 0; i < 4; i++) fx.fire.add(x, front + rand(1, LOBBY + 4), z, nx * rand(2, 8) + rand(-3, 3), rand(-1, 6), nz * rand(2, 8) + rand(-3, 3), rand(0.4, 1), 0.12, 0.05, Math.random() < 0.5 ? 0xffd27a : 0xfff4d8, 1, 14, 0.4);
      }
      if (Math.random() < dt * 6 * lod) { const [x, z, nx, nz] = perim(); fx.dust(x + nx * 2, front + 2, z + nz * 2, 4, 6, 0x9e9585); }
    } else if (t.drop < t.h + t.rubbleH) {
      // the dust: a wall of it rolling out along the ground, a cloud swallowing its foot as it sinks into it, and a
      // column climbing up its sides
      const D = this.dust, dcol = () => DUST[(Math.random() * DUST.length) | 0];
      for (let i = 0, n = Math.ceil(dt * 55 * lod); i < n; i++) {
        const [x, z, nx, nz] = perim(), sp = rand(10, 26);
        const ax = nx + rand(-0.6, 0.6), az = nz + rand(-0.6, 0.6);
        D.add(x, W.heightAt(x, z) + rand(2, 8), z, ax * sp, rand(0.5, 3), az * sp, rand(10, 18), rand(8, 12), rand(30, 55), dcol(), 0.95, -0.1, 0.3);
      }
      for (let i = 0, n = Math.ceil(dt * 50 * lod); i < n; i++) {
        const [x, z, nx, nz] = perim();
        D.add(x + nx * rand(2, 8), front + rand(2, 50), z + nz * rand(2, 8), nx * rand(1, 4), rand(1, 5), nz * rand(1, 4), rand(16, 26), rand(18, 26), rand(55, 90), dcol(), 0.95, -0.06, 0.12);
      }
      for (let i = 0, n = Math.ceil(dt * 20 * lod); i < n; i++) {
        const [x, z, nx, nz] = perim();
        D.add(x + nx * 4, front + rand(20, 60), z + nz * 4, nx * rand(1, 3), rand(5, 12), nz * rand(1, 3), rand(14, 22), rand(16, 24), rand(50, 80), dcol(), 0.9, -0.15, 0.06);
      }
      // sparks spraying out where the floors are crushing into each other, glass glittering down the face
      for (let i = 0, n = Math.ceil(dt * 50 * lod); i < n; i++) {
        const [x, z, nx, nz] = perim();
        fx.fire.add(x, front + rand(0, 6), z, nx * rand(4, 16) + rand(-4, 4), rand(2, 12), nz * rand(4, 16) + rand(-4, 4), rand(0.5, 1.4), rand(0.12, 0.3), 0.05, Math.random() < 0.6 ? 0xffc060 : 0xfff2d0, 1, 12, 0.3);
      }
      const vis = t.h - t.drop;
      for (let i = 0, n = Math.ceil(dt * 16 * lod); i < n && vis > 4; i++) {
        const [x, z, nx, nz] = perim();
        fx.fire.add(x + nx * 0.5, front + rand(4, vis), z + nz * 0.5, nx * rand(0.5, 3), rand(-2, 1), nz * rand(0.5, 3), rand(1.5, 3), 0.1, 0.06, 0xd8ecff, 0.9, 9.8, 0.1);
      }
      // electrical flashes deep in the dust
      if (Math.random() < dt * 2.5 * lod) { const [x, z] = perim(); fx.flash(x, front + rand(2, 10), z, 18, 40, 0.1, Math.random() < 0.5 ? 0x9fc8ff : 0xffc070); }
      // slabs breaking off the face and tumbling down, and out of the crush at the bottom
      if (Math.random() < dt * 14 * lod) {
        const [x, z, nx, nz] = perim();
        const y = front + rand(2, Math.max(4, vis * 0.9));
        this._chunk(x + nx * 0.5, y, z + nz * 0.5, nx * rand(1, 6), rand(-1, 3), nz * rand(1, 6), t.style);
      }
      if (Math.random() < dt * 10 * lod) {
        const [x, z, nx, nz] = perim();
        this._chunk(x + nx, front + 1, z + nz, nx * rand(6, 14) + rand(-3, 3), rand(3, 9), nz * rand(6, 14) + rand(-3, 3), t.style);
      }
      // what was under it is crushed; the debris rains on anyone close
      if (!t.crushed && t.drop > 1) {
        t.crushed = true;
        for (const s of g.soldiers) {
          if (s.state !== 'alive' || s.vehicle) continue;
          const ox = Math.abs(s.pos.x - t.cx) - hw, oz = Math.abs(s.pos.z - t.cz) - hd;
          if (ox < 4 && oz < 4) s.takeDamage(999, t.lastBy, { weapon: 'SKYSCRAPER COLLAPSE', explosive: true, noRevive: true });
          else if (ox < 26 && oz < 26 && Math.random() < 0.6) s.takeDamage(rand(25, 70), t.lastBy, { weapon: 'FALLING DEBRIS', explosive: true });
        }
        for (const v of g.vehicles) {
          if (!v.alive || !v.damage) continue;
          const ox = Math.abs(v.pos.x - t.cx) - hw, oz = Math.abs(v.pos.z - t.cz) - hd;
          if (ox < 5 && oz < 5 && v.pos.y < t.topY) v.damage(9999, t.lastBy, 'SKYSCRAPER COLLAPSE');
        }
      }
    } else {
      // down: the heap it left, and the dust settling
      t.state = 'down';
      t.ft = 0;
      t.pivot.visible = false;
      t.root.position.set(t.cx, t.floorY, t.cz);
      t.pivot.rotation.set(0, 0, 0);
      t.rubble.visible = true;
      for (const b of t.boxes) this.world.disableBox(b.box);
      if (!t.rubbleBox) t.rubbleBox = this.world.addBox(t.cx - hw, t.lo - 1, t.cz - hd, t.cx + hw, t.floorY + t.rubbleH * 0.55, t.cz + hd, { mat: 'concrete', rubble: true });
      else this.world.enableBox(t.rubbleBox);
      for (const b of t.burns) b.mesh.visible = false;
      t.burns.length = 0;
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.max(hw, hd) * rand(0.5, 2.6);
        this.dust.add(t.cx + Math.cos(a) * rr, t.floorY + rand(1, 30), t.cz + Math.sin(a) * rr, Math.cos(a) * rand(2, 10), rand(1, 5), Math.sin(a) * rand(2, 10), rand(18, 30), rand(16, 24), rand(50, 80), DUST[i % DUST.length], 0.95, -0.05, 0.05);
      }
      A.crumble(t.cx, t.floorY + 3, t.cz, true);
      fx.addShake(clamp(1 - dist / (400 + t.h * 2), 0, 1));
      return;
    }
    // the collision boxes go down with it
    t.boxT -= dt;
    if (t.boxT <= 0) {
      t.boxT = 0.2;
      for (const b of t.boxes) {
        const y1 = t.floorY + b.y1 - t.drop, y0 = Math.max(t.lo - 2, t.floorY + b.y0 - t.drop);
        this.world.disableBox(b.box);
        if (y1 > t.lo + 1) { b.box.minY = y0; b.box.maxY = y1; this.world.enableBox(b.box); }
      }
    }
  }

  // ---------------------------------------------------------------- falling slabs
  _chunk(x, y, z, vx, vy, vz, style) {
    if (this.chunks.length >= CHUNKS) this.chunks.shift();
    const glass = style !== 1 && Math.random() < 0.4;
    this.chunks.push({
      x, y, z, vx, vy, vz, rx: rand(0, 6), ry: rand(0, 6), rz: rand(0, 6), wx: rand(-3, 3), wy: rand(-3, 3), wz: rand(-3, 3),
      sx: rand(1.2, 4), sy: rand(0.3, 0.9), sz: rand(1, 3.2), life: rand(14, 22), rest: false,
      color: glass ? 0x4a6878 : style === 1 ? 0xa8a296 : Math.random() < 0.5 ? 0x7d7f80 : 0x5a5c5e,
    });
  }

  _chunkStep(dt) {
    const L = this.chunks, mesh = this.chunkMesh, W = this.world, col = new THREE.Color();
    if (!L.length) { if (mesh.count) { mesh.count = 0; } return; }
    for (let i = L.length - 1; i >= 0; i--) {
      const c = L[i];
      c.life -= dt;
      if (c.life <= 0) { L.splice(i, 1); continue; }
      if (!c.rest) {
        c.vy -= 9.8 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
        const gy = W.heightAt(c.x, c.z) + c.sy * 0.4;
        if (c.y < gy) {
          c.y = gy;
          if (c.vy < -6) { c.vy *= -0.2; c.vx *= 0.5; c.vz *= 0.5; c.wx *= 0.5; c.wy *= 0.5; this.game.effects.dust(c.x, gy, c.z, 1.5, 3, 0xa39a8b); }
          else { c.rest = true; c.rx = rand(-0.2, 0.2); c.rz = rand(-0.2, 0.2); }
        }
      }
    }
    mesh.count = L.length;
    for (let i = 0; i < L.length; i++) {
      const c = L[i], sink = c.life < 2 ? (2 - c.life) * 0.5 : 0;
      _q.setFromEuler(_e.set(c.rx, c.ry, c.rz));
      _m.compose(_v.set(c.x, c.y - sink, c.z), _q, _s.set(c.sx, c.sy, c.sz));
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, col.setHex(c.color));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- a new match: every tower stands again
  reset() {
    this.chunks.length = 0;
    this.chunkMesh.count = 0;
    this.dust.clear();
    const rng = mulberry32(this._seed() + 11);
    for (const t of this.list) {
      t.state = 'up'; t.hp = t.maxHp; t.lean.set(0, 0); t.lastBy = null; t.drop = 0;
      t.root.position.set(t.cx, t.floorY, t.cz);
      t.pivot.rotation.set(0, 0, 0);
      t.pivot.visible = true;
      t.rubble.visible = false;
      for (const b of t.burns) t.pivot.remove(b.mesh);
      t.burns.length = 0;
      for (const b of t.boxes) {
        this.world.disableBox(b.box);
        b.box.minY = t.floorY + b.y0; b.box.maxY = t.floorY + b.y1;
        if (this.on) this.world.enableBox(b.box);
      }
      if (t.rubbleBox) this.world.disableBox(t.rubbleBox);
      this._preburn(t, rng);
    }
  }

  // Career Mode's period battlefields have no skyscrapers: they go while a mission runs
  setEnabled(on) {
    if (this.on === on) return;
    this.on = on;
    for (const t of this.list) {
      t.root.visible = on;
      for (const b of t.boxes) { if (on && t.state !== 'down') this.world.enableBox(b.box); else this.world.disableBox(b.box); }
      if (t.rubbleBox) { if (on && t.state === 'down') this.world.enableBox(t.rubbleBox); else this.world.disableBox(t.rubbleBox); }
    }
    this.chunks.length = 0;
    this.chunkMesh.count = 0;
  }
}
