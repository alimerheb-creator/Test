// Terrain, sky, lighting, vegetation, static props and the collision/raycast grid.
import * as THREE from 'three';
import { PLAY_HALF, WORLD_HALF, FLAGS, HQS, BUILDINGS, ROADS } from './config.js';
import { fbm2, smoothstep, lerp, clamp, mulberry32, segDist2, rayAABB } from './util.js';
import { makeTextures, worldUVMaterial } from './textures.js';

// Terrain grid: fine spacing in the battle zone, coarse spacing out to the horizon mountains.
const INNER = 280, FINE = 2.5, COARSE = 14;
const N_OUT = Math.round((WORLD_HALF - INNER) / COARSE);
const N_IN = Math.round((2 * INNER) / FINE);
const N = N_OUT * 2 + N_IN + 1;

function axisCoord(i) {
  if (i < N_OUT) return -WORLD_HALF + i * COARSE;
  if (i < N_OUT + N_IN) return -INNER + (i - N_OUT) * FINE;
  return INNER + (i - N_OUT - N_IN) * COARSE;
}
function axisU(v) {
  if (v < -INNER) return (v + WORLD_HALF) / COARSE;
  if (v < INNER) return N_OUT + (v + INNER) / FINE;
  return N_OUT + N_IN + (v - INNER) / COARSE;
}

// Collision grid
const CELL = 8;
const GRID_HALF = 320;
const GN = Math.ceil((GRID_HALF * 2) / CELL);

export const SUN_DIR = new THREE.Vector3(-0.78, 0.42, -0.36).normalize();

export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.tex = makeTextures();
    this.boxes = [];
    this.cells = new Array(GN * GN);
    this.stamp = 1;
    this.flatZones = [];
    this.trees = [];
    this.maxHeight = 0;
    this.hit = { hit: false, t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, box: null, terrain: false };
    this._tmp = [];
    this.rng = mulberry32(90210);
  }

  build() {
    this._setupZones();
    this._buildHeightfield();
    this._buildTerrainMesh();
    this._buildSky();
    this._buildLights();
    this._buildVegetation();
    this._buildProps();
  }

  // ---------------------------------------------------------------- terrain
  _raw(x, z) {
    let h = fbm2(x * 0.0055 + 13.1, z * 0.0055 - 7.7, 4) * 16;
    h += fbm2(x * 0.021, z * 0.021 + 31, 3) * 2.6;
    h -= Math.exp(-(x * x) / (2 * 110 * 110)) * 3;
    const e = Math.max(Math.abs(x), Math.abs(z));
    const m = smoothstep(PLAY_HALF - 5, PLAY_HALF + 160, e);
    h += m * (30 + (fbm2(x * 0.008 - 3, z * 0.008 + 9, 5) * 0.5 + 0.5) * 80);
    return h;
  }

  _setupZones() {
    for (const f of FLAGS) {
      this.flatZones.push({ x: f.x, z: f.z, r0: f.flat, r1: f.flat + 34, h: this._raw(f.x, f.z), town: f.id === 'C' ? 1 : 0.7 });
    }
    for (const q of HQS) this.flatZones.push({ x: q.x, z: q.z, r0: 36, r1: 70, h: this._raw(q.x, q.z), town: 0.8 });
    for (const b of BUILDINGS) {
      const inFlag = FLAGS.some((f) => Math.hypot(b[0] - f.x, b[1] - f.z) < f.flat - 8);
      if (inFlag) continue;
      const half = (Math.max(b[2], b[3]) * 2.5) / 2;
      this.flatZones.push({ x: b[0], z: b[1], r0: half + 7, r1: half + 26, h: this._raw(b[0], b[1]), town: 0.45 });
    }
  }

  _heightFn(x, z) {
    let h = this._raw(x, z);
    for (const f of this.flatZones) {
      const dx = x - f.x, dz = z - f.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > f.r1 * f.r1) continue;
      h = lerp(h, f.h, 1 - smoothstep(f.r0, f.r1, Math.sqrt(d2)));
    }
    return h;
  }

  _buildHeightfield() {
    this.heights = new Float32Array(N * N);
    let maxH = -Infinity;
    for (let j = 0; j < N; j++) {
      const z = axisCoord(j);
      for (let i = 0; i < N; i++) {
        const h = this._heightFn(axisCoord(i), z);
        this.heights[j * N + i] = h;
        if (h > maxH) maxH = h;
      }
    }
    this.maxHeight = maxH + 1;
  }

  heightAt(x, z) {
    let u = axisU(x), w = axisU(z);
    if (u < 0) u = 0; else if (u > N - 1.0001) u = N - 1.0001;
    if (w < 0) w = 0; else if (w > N - 1.0001) w = N - 1.0001;
    const i = u | 0, j = w | 0, fu = u - i, fw = w - j;
    const H = this.heights, k = j * N + i;
    const a = H[k], b = H[k + 1], c = H[k + N], d = H[k + N + 1];
    return a + (b - a) * fu + (c - a) * fw + (a - b - c + d) * fu * fw;
  }

  normalAt(x, z, out) {
    const e = 0.8;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }

  _buildTerrainMesh() {
    const count = N * N;
    const pos = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);
    for (let j = 0; j < N; j++) {
      const z = axisCoord(j);
      for (let i = 0; i < N; i++) {
        const k = j * N + i, x = axisCoord(i);
        pos[k * 3] = x; pos[k * 3 + 1] = this.heights[k]; pos[k * 3 + 2] = z;
        uv[k * 2] = x / 9; uv[k * 2 + 1] = z / 9;
      }
    }
    const idx = new Uint32Array((N - 1) * (N - 1) * 6);
    let p = 0;
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    const nor = geo.attributes.normal.array;
    const col = new Float32Array(count * 3);
    const grassA = new THREE.Color(0x7a7446), grassB = new THREE.Color(0x5b6538), dirt = new THREE.Color(0x8e7657);
    const rock = new THREE.Color(0x77706a), rockHi = new THREE.Color(0x9a948c), town = new THREE.Color(0x9b8b70);
    const road = new THREE.Color(0x5f574d);
    const c = new THREE.Color();
    const segs = [];
    for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) segs.push([r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]]);
    for (let k = 0; k < count; k++) {
      const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
      const slope = 1 - nor[k * 3 + 1];
      c.copy(grassA).lerp(grassB, clamp(0.5 + fbm2(x * 0.035, z * 0.035, 3), 0, 1));
      c.lerp(dirt, smoothstep(0.08, 0.4, fbm2(x * 0.011 + 40, z * 0.011 - 20, 3)) * 0.8);
      for (const f of this.flatZones) {
        const d = Math.hypot(x - f.x, z - f.z);
        if (d < f.r0 + 8) c.lerp(town, (1 - smoothstep(f.r0 * 0.6, f.r0 + 8, d)) * f.town * 0.85);
      }
      if (Math.abs(x) < PLAY_HALF + 40 && Math.abs(z) < PLAY_HALF + 40) {
        let dm = Infinity;
        for (const s of segs) { const d2 = segDist2(x, z, s[0], s[1], s[2], s[3]); if (d2 < dm) dm = d2; }
        c.lerp(road, (1 - smoothstep(2.4, 4.6, Math.sqrt(dm))) * 0.9);
      }
      c.lerp(rock, smoothstep(0.16, 0.38, slope));
      c.lerp(rockHi, smoothstep(50, 100, y) * 0.55);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: this.tex.ground, normalMap: this.tex.groundN, roughness: 0.96, metalness: 0 });
    mat.normalScale.set(0.9, 0.9);
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  // ---------------------------------------------------------------- sky & light
  _buildSky() {
    const horizon = new THREE.Color(0xd2bf9f);
    this.scene.fog = new THREE.Fog(horizon.clone(), 70, 720);
    this.scene.background = horizon.clone();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(0x587a9e) },
        horizon: { value: horizon },
        bottom: { value: new THREE.Color(0xa08f78) },
        sunDir: { value: SUN_DIR },
        sunColor: { value: new THREE.Color(0xffd29a) },
      },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
        varying vec3 vDir;
        float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hsh(i),hsh(i+vec2(1.0,0.0)),f.x), mix(hsh(i+vec2(0.0,1.0)),hsh(i+vec2(1.0,1.0)),f.x), f.y); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(horizon, top, smoothstep(0.0, 0.6, h));
          col = mix(col, bottom, smoothstep(0.0, -0.25, h));
          float s = max(dot(d, sunDir), 0.0);
          col += sunColor * (pow(s, 1200.0) * 8.0 + pow(s, 48.0) * 0.4 + pow(s, 5.0) * 0.14);
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.18) * 1.6;
            float c = vn(uv) * 0.55 + vn(uv * 2.3 + 4.0) * 0.3 + vn(uv * 5.1) * 0.15;
            c = smoothstep(0.52, 0.86, c) * smoothstep(0.0, 0.3, h);
            vec3 cloud = mix(vec3(0.78, 0.74, 0.7), vec3(1.0, 0.92, 0.82), s);
            col = mix(col, cloud, c * 0.55);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // Image-based lighting: bake the sky into a prefiltered environment map for reflections
    const renderer = this.game.renderer;
    if (renderer) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
      this.envMap = pmrem.fromScene(envScene, 0.02, 0.1, 200).texture;
      pmrem.dispose();
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = 0.55;
    }
  }

  setShadowQuality(size, extent) {
    const sun = this.sun;
    const sc = sun.shadow.camera;
    sc.left = -extent; sc.right = extent; sc.top = extent; sc.bottom = -extent;
    sc.updateProjectionMatrix();
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  }

  // 0..1 how much grass grows here (none on roads, in town squares, inside buildings or on rock)
  grassDensity(x, z) {
    let d = 1 - smoothstep(0.08, 0.4, fbm2(x * 0.011 + 40, z * 0.011 - 20, 3)) * 0.6;
    for (const f of this.flatZones) {
      const dist = Math.hypot(x - f.x, z - f.z);
      if (dist < f.r0 + 8) d -= (1 - smoothstep(f.r0 * 0.55, f.r0 + 8, dist)) * f.town * 1.25;
    }
    if (Math.abs(x) < PLAY_HALF + 40 && Math.abs(z) < PLAY_HALF + 40) d -= 1 - smoothstep(3, 6.5, this._roadDist(x, z));
    if (this._nearBuilding(x, z, 1.5)) return 0;
    d -= smoothstep(0.14, 0.32, 1 - this.normalAt(x, z, _n).y);
    d *= 0.55 + (fbm2(x * 0.09 + 7, z * 0.09, 2) * 0.5 + 0.5) * 0.9;
    return clamp(d, 0, 1);
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xc8d4e0, 0x6b5a45, 0.8);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffdcb0, 3.0);
    const q = this.game.settings.quality;
    sun.castShadow = q !== 'low';
    sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    const sc = sun.shadow.camera;
    sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 1; sc.far = 600;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.05;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
  }

  updateSky(camPos) {
    this.sky.position.copy(camPos);
  }

  updateShadow(focus) {
    const snap = 1;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    const fy = this.heightAt(fx, fz);
    this.sun.target.position.set(fx, fy, fz);
    this.sun.position.set(fx + SUN_DIR.x * 300, fy + SUN_DIR.y * 300, fz + SUN_DIR.z * 300);
    this.sun.target.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- placement helpers
  _nearBuilding(x, z, margin) {
    for (const b of BUILDINGS) {
      const hw = (b[2] * 2.5) / 2 + margin, hd = (b[3] * 2.5) / 2 + margin;
      if (Math.abs(x - b[0]) < hw && Math.abs(z - b[1]) < hd) return true;
    }
    return false;
  }

  _roadDist(x, z) {
    let dm = Infinity;
    for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
      const d2 = segDist2(x, z, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]);
      if (d2 < dm) dm = d2;
    }
    return Math.sqrt(dm);
  }

  _areaFree(minX, minZ, maxX, maxZ) {
    for (const b of BUILDINGS) {
      const hw = (b[2] * 2.5) / 2 + 2.5, hd = (b[3] * 2.5) / 2 + 2.5;
      if (maxX > b[0] - hw && minX < b[0] + hw && maxZ > b[1] - hd && minZ < b[1] + hd) return false;
    }
    for (const f of FLAGS) {
      if (Math.abs((minX + maxX) / 2 - f.x) < 6 && Math.abs((minZ + maxZ) / 2 - f.z) < 6) return false;
    }
    // Tank parking pads beside each HQ
    for (const q of HQS) {
      const pz = q.z + (q.z > 0 ? 4 : -4);
      for (const side of [-1, 1]) {
        const px = q.x + side * 16;
        if (maxX > px - 7 && minX < px + 7 && maxZ > pz - 8 && minZ < pz + 8) return false;
      }
    }
    this.queryBoxes(minX, -1e4, minZ, maxX, 1e4, maxZ, this._tmp);
    return this._tmp.length === 0;
  }

  // ---------------------------------------------------------------- vegetation
  _buildVegetation() {
    const rng = this.rng;
    const dummy = new THREE.Object3D();
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6);
    trunkGeo.translate(0, 0.5, 0);
    const pineGeo = new THREE.ConeGeometry(1, 1, 7);
    pineGeo.translate(0, 0.5, 0);
    const leafGeo = new THREE.IcosahedronGeometry(1, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 1, flatShading: true });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });

    const spots = [];
    let tries = 0;
    while (spots.length < 640 && tries < 20000) {
      tries++;
      const inside = spots.length < 360;
      const lim = inside ? PLAY_HALF - 4 : WORLD_HALF - 60;
      const x = (rng() * 2 - 1) * lim, z = (rng() * 2 - 1) * lim;
      if (!inside && Math.max(Math.abs(x), Math.abs(z)) < PLAY_HALF + 10) continue;
      const forest = fbm2(x * 0.01 + 5, z * 0.01 - 3, 3);
      if (rng() > smoothstep(-0.15, 0.3, forest) + 0.08) continue;
      if (this.flatZones.some((f) => Math.hypot(x - f.x, z - f.z) < f.r0 + 3)) continue;
      if (this._nearBuilding(x, z, 6)) continue;
      if (inside && this._roadDist(x, z) < 7) continue;
      const y = this.heightAt(x, z);
      if (y > 120) continue;
      spots.push({ x, z, y, pine: rng() < 0.6, h: 5 + rng() * 6.5, inside });
    }
    const pines = spots.filter((s) => s.pine), leafs = spots.filter((s) => !s.pine);
    this.trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    this.pineMesh = new THREE.InstancedMesh(pineGeo, crownMat, Math.max(1, pines.length));
    this.leafMesh = new THREE.InstancedMesh(leafGeo, crownMat, Math.max(1, leafs.length));
    const col = new THREE.Color();
    let pi = 0, li = 0;
    spots.forEach((s, i) => {
      dummy.position.set(s.x, s.y - 0.3, s.z);
      dummy.rotation.set(0, rng() * 6.28, 0);
      dummy.scale.set(1, s.h * (s.pine ? 0.35 : 0.55), 1);
      dummy.updateMatrix();
      this.trunkMesh.setMatrixAt(i, dummy.matrix);
      const t = { x: s.x, z: s.z, y: s.y, trunk: i, crown: null, crownIdx: 0, alive: true, box: null, trunkM: dummy.matrix.clone() };
      if (s.pine) {
        dummy.position.set(s.x, s.y + s.h * 0.2, s.z);
        dummy.scale.set(s.h * 0.24, s.h * 0.85, s.h * 0.24);
        dummy.updateMatrix();
        this.pineMesh.setMatrixAt(pi, dummy.matrix);
        col.setHSL(0.26 + rng() * 0.05, 0.28 + rng() * 0.12, 0.2 + rng() * 0.06);
        this.pineMesh.setColorAt(pi, col);
        t.crown = this.pineMesh; t.crownIdx = pi++;
      } else {
        dummy.position.set(s.x, s.y + s.h * 0.62, s.z);
        dummy.scale.set(s.h * 0.3, s.h * 0.26, s.h * 0.3);
        dummy.updateMatrix();
        this.leafMesh.setMatrixAt(li, dummy.matrix);
        col.setHSL(0.2 + rng() * 0.07, 0.3 + rng() * 0.15, 0.24 + rng() * 0.08);
        this.leafMesh.setColorAt(li, col);
        t.crown = this.leafMesh; t.crownIdx = li++;
      }
      t.crownM = dummy.matrix.clone();
      if (s.inside) t.box = this.addBox(s.x - 0.3, s.y - 1, s.z - 0.3, s.x + 0.3, s.y + s.h * 0.5, s.z + 0.3, { mat: 'wood', tree: this.trees.length });
      this.trees.push(t);
    });
    for (const m of [this.trunkMesh, this.pineMesh, this.leafMesh]) {
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.scene.add(m);
    }

    // Bushes (no collision)
    const bushGeo = new THREE.IcosahedronGeometry(1, 0);
    const bushCount = 520;
    this.bushMesh = new THREE.InstancedMesh(bushGeo, crownMat, bushCount);
    let placed = 0; tries = 0;
    while (placed < bushCount && tries < 12000) {
      tries++;
      const x = (rng() * 2 - 1) * (PLAY_HALF + 60), z = (rng() * 2 - 1) * (PLAY_HALF + 60);
      if (this._nearBuilding(x, z, 3)) continue;
      if (this._roadDist(x, z) < 4) continue;
      if (FLAGS.some((f) => Math.hypot(x - f.x, z - f.z) < f.radius + 2)) continue;
      const y = this.heightAt(x, z);
      const s = 0.6 + rng() * 1.1;
      dummy.position.set(x, y + s * 0.25, z);
      dummy.rotation.set(0, rng() * 6.28, 0);
      dummy.scale.set(s * (1 + rng() * 0.6), s * 0.65, s);
      dummy.updateMatrix();
      this.bushMesh.setMatrixAt(placed, dummy.matrix);
      col.setHSL(0.18 + rng() * 0.08, 0.25 + rng() * 0.15, 0.22 + rng() * 0.1);
      this.bushMesh.setColorAt(placed, col);
      placed++;
    }
    this.bushMesh.count = placed;
    this.bushMesh.receiveShadow = true;
    this.bushMesh.frustumCulled = false;
    this.scene.add(this.bushMesh);

    // Rocks
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
    const rockCount = 190;
    this.rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    placed = 0; tries = 0;
    while (placed < rockCount && tries < 8000) {
      tries++;
      const inside = placed < 140;
      const lim = inside ? PLAY_HALF - 5 : WORLD_HALF - 80;
      const x = (rng() * 2 - 1) * lim, z = (rng() * 2 - 1) * lim;
      if (!inside && Math.max(Math.abs(x), Math.abs(z)) < PLAY_HALF + 10) continue;
      if (this.flatZones.some((f) => Math.hypot(x - f.x, z - f.z) < f.r0)) continue;
      if (this._nearBuilding(x, z, 5)) continue;
      if (inside && this._roadDist(x, z) < 6) continue;
      const y = this.heightAt(x, z);
      const s = inside ? 0.7 + rng() * 1.8 : 2 + rng() * 6;
      const sy = s * (0.5 + rng() * 0.4);
      dummy.position.set(x, y + sy * 0.3, z);
      dummy.rotation.set(rng() * 0.5, rng() * 6.28, rng() * 0.5);
      dummy.scale.set(s, sy, s * (0.8 + rng() * 0.4));
      dummy.updateMatrix();
      this.rockMesh.setMatrixAt(placed, dummy.matrix);
      const g = 0.38 + rng() * 0.12;
      col.setRGB(g * 1.02, g, g * 0.95);
      this.rockMesh.setColorAt(placed, col);
      if (inside) {
        const r = s * 0.72;
        this.addBox(x - r, y - 1, z - r, x + r, y + sy * 1.05, z + r, { mat: 'rock' });
      }
      placed++;
    }
    this.rockMesh.count = placed;
    this.rockMesh.castShadow = true;
    this.rockMesh.receiveShadow = true;
    this.rockMesh.frustumCulled = false;
    this.scene.add(this.rockMesh);
  }

  destroyTree(i) {
    const t = this.trees[i];
    if (!t || !t.alive) return;
    t.alive = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.trunkMesh.setMatrixAt(t.trunk, zero);
    t.crown.setMatrixAt(t.crownIdx, zero);
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    t.crown.instanceMatrix.needsUpdate = true;
    if (t.box) this.disableBox(t.box);
    const fx = this.game.effects;
    if (fx) {
      fx.debris(t.x, t.y + 2, t.z, 0x4a3a2c, 5, 0.35);
      for (let k = 0; k < 18; k++) {
        fx.smoke.add(t.x + (Math.random() - 0.5) * 3, t.y + 3 + Math.random() * 4, t.z + (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4, 1.4 + Math.random(),
          0.5, 0.25, 0x3f5a2a, 0.9, 6, 1.5);
      }
    }
  }

  damageTrees(x, z, r) {
    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      if (!t.alive || !t.box) continue;
      if ((t.x - x) ** 2 + (t.z - z) ** 2 < r * r) this.destroyTree(i);
    }
  }

  resetTrees() {
    for (const t of this.trees) {
      if (t.alive) continue;
      t.alive = true;
      this.trunkMesh.setMatrixAt(t.trunk, t.trunkM);
      t.crown.setMatrixAt(t.crownIdx, t.crownM);
      if (t.box) this.enableBox(t.box);
    }
    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.pineMesh.instanceMatrix.needsUpdate = true;
    this.leafMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- props
  _prop(kind, cx, cy, cz, sx, sy, sz, color, mat, collide = true) {
    this._propList[kind].push({ cx, cy, cz, sx, sy, sz, color });
    if (collide) this.addBox(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, { mat });
  }

  _container(x, z, rot, color) {
    const y = this.heightAt(x, z) - 0.1;
    const sx = rot ? 2.44 : 6.06, sz = rot ? 6.06 : 2.44;
    this._prop('metal', x, y + 1.3, z, sx, 2.6, sz, color, 'metal');
    if (this.rng() < 0.3) {
      const c2 = [0x8a3b2a, 0x2f5d7c, 0x3f6b3a, 0xa0782d, 0x6b6f73][Math.floor(this.rng() * 5)];
      this._prop('metal', x, y + 3.9, z, sx, 2.6, sz, c2, 'metal');
    }
  }

  _barrier(x, z, rot) {
    const y = this.heightAt(x, z);
    this._prop('concrete', x, y + 0.45, z, rot ? 0.6 : 3, 0.9, rot ? 3 : 0.6, 0xb8b2a6, 'concrete');
  }

  _sandbags(x, z, a) {
    // Short L-shaped sandbag nest, facing outward along angle a
    const y = this.heightAt(x, z);
    const tang = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
    this._prop('sand', x, y + 0.45, z, tang ? 0.8 : 3.2, 0.95, tang ? 3.2 : 0.8, 0xffffff, 'sand');
    const ox = tang ? 0 : 1.6, oz = tang ? 1.6 : 0;
    this._prop('sand', x - ox + (tang ? -1 : 0), y + 0.45, z - oz + (tang ? 0 : -1), tang ? 2 : 0.8, 0.95, tang ? 0.8 : 2, 0xffffff, 'sand');
  }

  _crate(x, z) {
    const y = this.heightAt(x, z);
    const s = 1 + this.rng() * 0.3;
    this._prop('wood', x, y + s / 2, z, s, s, s, 0x7a5c3a, 'wood');
    if (this.rng() < 0.4) this._prop('wood', x + 0.1, y + s * 1.5, z - 0.1, s * 0.9, s * 0.9, s * 0.9, 0x6e5234, 'wood');
  }

  _wreck(x, z, rot) {
    const y = this.heightAt(x, z);
    const L = 4.3, W = 1.85;
    this._prop('metal', x, y + 0.6, z, rot ? W : L, 0.95, rot ? L : W, 0x3b3632, 'metal');
    this._prop('metal', x + (rot ? 0 : -0.3), y + 1.35, z + (rot ? -0.3 : 0), rot ? 1.6 : 2.2, 0.6, rot ? 2.2 : 1.6, 0x2a2724, 'metal');
  }

  _ruin(x, z, rot) {
    const y = this.heightAt(x, z);
    const L = 3 + this.rng() * 3, h = 1 + this.rng() * 1.4;
    this._prop('concrete', x, y + h / 2 - 0.1, z, rot ? 0.45 : L, h, rot ? L : 0.45, 0xa39a8a, 'concrete');
  }

  _placeAround(cx, cz, rMin, rMax, sx, sz, tries, fn) {
    for (let k = 0; k < tries; k++) {
      const a = this.rng() * Math.PI * 2, r = lerp(rMin, rMax, this.rng());
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const rot = this.rng() < 0.5;
      const hx = (rot ? sz : sx) / 2 + 1, hz = (rot ? sx : sz) / 2 + 1;
      if (Math.max(Math.abs(x), Math.abs(z)) > PLAY_HALF - 6) continue;
      if (!this._areaFree(x - hx, z - hz, x + hx, z + hz)) continue;
      fn(x, z, rot, a);
      return true;
    }
    return false;
  }

  _buildProps() {
    this._propList = { concrete: [], metal: [], sand: [], wood: [] };
    const rng = this.rng;
    const cColors = [0x8a3b2a, 0x2f5d7c, 0x3f6b3a, 0xa0782d, 0x6b6f73, 0x7b2f2f];
    for (const f of FLAGS) {
      const big = f.id === 'C';
      for (let k = 0; k < (big ? 5 : 3); k++) this._placeAround(f.x, f.z, 7, 11, 3.2, 3.2, 20, (x, z, rot, a) => this._sandbags(x, z, a));
      for (let k = 0; k < (big ? 6 : 4); k++) this._placeAround(f.x, f.z, 9, big ? 22 : 22, 3, 0.6, 20, (x, z, rot) => this._barrier(x, z, rot));
      for (let k = 0; k < (big ? 2 : 4); k++) this._placeAround(f.x, f.z, 14, big ? 22 : 32, 6.1, 2.5, 30, (x, z, rot) => this._container(x, z, rot, cColors[Math.floor(rng() * cColors.length)]));
      for (let k = 0; k < 4; k++) this._placeAround(f.x, f.z, 8, 26, 1.4, 1.4, 20, (x, z) => this._crate(x, z));
      this._placeAround(f.x, f.z, 12, 30, 4.4, 2, 20, (x, z, rot) => this._wreck(x, z, rot));
    }
    for (const q of HQS) {
      for (let k = 0; k < 5; k++) this._placeAround(q.x, q.z, 14, 28, 6.1, 2.5, 30, (x, z, rot) => this._container(x, z, rot, cColors[Math.floor(rng() * cColors.length)]));
      for (let k = 0; k < 6; k++) this._placeAround(q.x, q.z, 10, 24, 3.2, 3.2, 30, (x, z, rot, a) => this._sandbags(x, z, a));
      for (let k = 0; k < 6; k++) this._placeAround(q.x, q.z, 8, 26, 1.4, 1.4, 20, (x, z) => this._crate(x, z));
    }
    // Scattered cover across the fields
    let n = 0, tries = 0;
    while (n < 90 && tries < 3000) {
      tries++;
      const x = (rng() * 2 - 1) * (PLAY_HALF - 12), z = (rng() * 2 - 1) * (PLAY_HALF - 12);
      if (this.flatZones.some((f) => Math.hypot(x - f.x, z - f.z) < f.r0 * 0.5)) continue;
      const kind = rng();
      const rot = rng() < 0.5;
      const road = this._roadDist(x, z);
      if (kind < 0.18 && road < 5 && road > 1.5) {
        if (!this._areaFree(x - 3, z - 3, x + 3, z + 3)) continue;
        this._wreck(x, z, rot);
      } else if (road > 6) {
        if (!this._areaFree(x - 3.5, z - 3.5, x + 3.5, z + 3.5)) continue;
        if (kind < 0.55) this._ruin(x, z, rot);
        else if (kind < 0.8) this._sandbags(x, z, rng() * 6.28);
        else this._container(x, z, rot, cColors[Math.floor(rng() * cColors.length)]);
      } else continue;
      n++;
    }
    this._flushProps();
  }

  _flushProps() {
    const unit = new THREE.BoxGeometry(1, 1, 1);
    const mats = {
      concrete: worldUVMaterial({ map: this.tex.concrete, normalMap: this.tex.concreteN, normalScale: 0.8, scale: 0.35 }),
      metal: worldUVMaterial({ map: this.tex.metal, normalMap: this.tex.metalN, normalScale: 0.9, scale: 0.4, roughness: 0.62, metalness: 0.35 }),
      sand: worldUVMaterial({ map: this.tex.sandbag, scale: 0.9, roughness: 1 }),
      wood: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    };
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const kind of Object.keys(this._propList)) {
      const list = this._propList[kind];
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(unit, mats[kind], list.length);
      list.forEach((it, i) => {
        m4.compose(p.set(it.cx, it.cy, it.cz), q, s.set(it.sx, it.sy, it.sz));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.set(it.color));
      });
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
  }

  // ---------------------------------------------------------------- collision grid
  _ci(v) {
    const c = Math.floor((v + GRID_HALF) / CELL);
    return c < 0 ? 0 : c >= GN ? GN - 1 : c;
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ, data = null) {
    const b = { id: this.boxes.length, minX, minY, minZ, maxX, maxY, maxZ, data, active: false, stamp: 0 };
    this.boxes.push(b);
    this.enableBox(b);
    return b;
  }

  enableBox(b) {
    if (b.active) return;
    b.active = true;
    const x0 = this._ci(b.minX), x1 = this._ci(b.maxX), z0 = this._ci(b.minZ), z1 = this._ci(b.maxZ);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const k = cz * GN + cx;
      (this.cells[k] ||= []).push(b);
    }
  }

  disableBox(b) {
    if (!b.active) return;
    b.active = false;
    const x0 = this._ci(b.minX), x1 = this._ci(b.maxX), z0 = this._ci(b.minZ), z1 = this._ci(b.maxZ);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const arr = this.cells[cz * GN + cx];
      if (!arr) continue;
      const i = arr.indexOf(b);
      if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); }
    }
  }

  queryBoxes(minX, minY, minZ, maxX, maxY, maxZ, out) {
    out.length = 0;
    const st = ++this.stamp;
    const x0 = this._ci(minX), x1 = this._ci(maxX), z0 = this._ci(minZ), z1 = this._ci(maxZ);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const arr = this.cells[cz * GN + cx];
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const b = arr[i];
        if (b.stamp === st) continue;
        b.stamp = st;
        if (b.maxX <= minX || b.minX >= maxX || b.maxY <= minY || b.minY >= maxY || b.maxZ <= minZ || b.minZ >= maxZ) continue;
        out.push(b);
      }
    }
    return out;
  }

  // Ray against boxes (grid DDA) and terrain. Results land in this.hit (reused object).
  raycast(ox, oy, oz, dx, dy, dz, maxT, terrain = true) {
    const hit = this.hit;
    hit.hit = false; hit.box = null; hit.terrain = false;
    let best = maxT, bestBox = null;
    const st = ++this.stamp;
    let cx = Math.floor((ox + GRID_HALF) / CELL), cz = Math.floor((oz + GRID_HALF) / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    let tMaxX = adx < 1e-9 ? Infinity : ((cx + (dx > 0 ? 1 : 0)) * CELL - GRID_HALF - ox) / dx;
    let tMaxZ = adz < 1e-9 ? Infinity : ((cz + (dz > 0 ? 1 : 0)) * CELL - GRID_HALF - oz) / dz;
    const tDX = adx < 1e-9 ? Infinity : CELL / adx, tDZ = adz < 1e-9 ? Infinity : CELL / adz;
    for (let iter = 0; iter < 420; iter++) {
      if (cx >= 0 && cx < GN && cz >= 0 && cz < GN) {
        const arr = this.cells[cz * GN + cx];
        if (arr) {
          for (let i = 0; i < arr.length; i++) {
            const b = arr[i];
            if (b.stamp === st) continue;
            b.stamp = st;
            const t = rayAABB(ox, oy, oz, dx, dy, dz, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, best);
            if (t < best) { best = t; bestBox = b; }
          }
        }
      }
      const tExit = tMaxX < tMaxZ ? tMaxX : tMaxZ;
      if (best <= tExit || tExit > maxT || tExit === Infinity) break;
      if (tMaxX < tMaxZ) { cx += stepX; tMaxX += tDX; } else { cz += stepZ; tMaxZ += tDZ; }
    }
    let terrainHit = false;
    if (terrain) {
      const tt = this.raycastTerrain(ox, oy, oz, dx, dy, dz, best);
      if (tt < best) { best = tt; bestBox = null; terrainHit = true; }
    }
    if (!bestBox && !terrainHit) return hit;
    hit.hit = true;
    hit.t = best;
    hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    hit.box = bestBox;
    hit.terrain = terrainHit;
    if (bestBox) {
      const b = bestBox;
      let m = Math.abs(hit.x - b.minX), nx = -1, ny = 0, nz = 0, d;
      if ((d = Math.abs(hit.x - b.maxX)) < m) { m = d; nx = 1; ny = 0; nz = 0; }
      if ((d = Math.abs(hit.y - b.minY)) < m) { m = d; nx = 0; ny = -1; nz = 0; }
      if ((d = Math.abs(hit.y - b.maxY)) < m) { m = d; nx = 0; ny = 1; nz = 0; }
      if ((d = Math.abs(hit.z - b.minZ)) < m) { m = d; nx = 0; ny = 0; nz = -1; }
      if ((d = Math.abs(hit.z - b.maxZ)) < m) { m = d; nx = 0; ny = 0; nz = 1; }
      hit.nx = nx; hit.ny = ny; hit.nz = nz;
    } else {
      const n = this.normalAt(hit.x, hit.z, _n);
      hit.nx = n.x; hit.ny = n.y; hit.nz = n.z;
    }
    return hit;
  }

  raycastTerrain(ox, oy, oz, dx, dy, dz, maxT) {
    let h = this.heightAt(ox, oz);
    if (oy < h - 0.05) return 0;
    let t = 0, prevT = 0;
    while (t < maxT) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      h = this.heightAt(x, z);
      const gap = y - h;
      if (gap < 0) {
        let lo = prevT, hi = t;
        for (let i = 0; i < 10; i++) {
          const m = (lo + hi) * 0.5;
          if (oy + dy * m < this.heightAt(ox + dx * m, oz + dz * m)) hi = m; else lo = m;
        }
        return hi;
      }
      if (dy >= 0 && y > this.maxHeight) return Infinity;
      prevT = t;
      t += Math.max(0.35, gap * 0.6);
    }
    const x = ox + dx * maxT, z = oz + dz * maxT;
    if (oy + dy * maxT < this.heightAt(x, z)) {
      let lo = prevT, hi = maxT;
      for (let i = 0; i < 10; i++) {
        const m = (lo + hi) * 0.5;
        if (oy + dy * m < this.heightAt(ox + dx * m, oz + dz * m)) hi = m; else lo = m;
      }
      return hi;
    }
    return Infinity;
  }

  lineClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return true;
    return !this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.05, true).hit;
  }

  // Highest walkable surface at (x, z) that is not above yTop
  groundAt(x, z, yTop) {
    let g = this.heightAt(x, z);
    this.queryBoxes(x - 0.2, g - 0.5, z - 0.2, x + 0.2, yTop + 0.05, z + 0.2, this._tmp);
    for (const b of this._tmp) if (b.maxY <= yTop + 0.05 && b.maxY > g) g = b.maxY;
    return g;
  }

  isFree(x, y, z, r, h) {
    this.queryBoxes(x - r, y + 0.05, z - r, x + r, y + h, z + r, this._tmp);
    return this._tmp.length === 0;
  }

  reset() {
    this.resetTrees();
  }
}

const _n = new THREE.Vector3();
