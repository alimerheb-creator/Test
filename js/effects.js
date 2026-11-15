// Particles, tracers, debris chunks, flash lights and camera shake.
import * as THREE from 'three';
import { rand, clamp } from './util.js';
import { EXPLOSION, FIRE } from './explosion.js';

const _c = new THREE.Color(), _up = new THREE.Vector3(0, 1, 0), _qa = new THREE.Quaternion();
const _fwdZ = new THREE.Vector3(0, 0, 1), _hv = new THREE.Vector3(), _hc = new THREE.Color();
const _hash = (x, y, z) => { const v = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return v - Math.floor(v); };

// A broken lump of masonry or earth: a box with its corners and faces knocked about (a corner moves the same way on
// every face that shares it, so the lump stays closed)
function chunkGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = _hash(Math.round(x * 8) + 3, Math.round(y * 8) + 5, Math.round(z * 8) + 7);
    const k = 0.7 + h * 0.45 - (Math.abs(x) + Math.abs(y) + Math.abs(z) > 1.2 ? 0.18 : 0);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// A bullet hole: a dark hole, a ring of chipped, paler material round it and a few cracks running out (alpha fades
// at the edge). The instance colour tints it for what was hit
function holeTexture() {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const g1 = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g1.addColorStop(0, 'rgba(200,196,188,0.95)'); g1.addColorStop(0.45, 'rgba(176,170,160,0.75)'); g1.addColorStop(1, 'rgba(150,146,138,0)');
  x.fillStyle = g1;
  x.beginPath();
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2, r = 17 + Math.random() * 11; x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  x.fill();
  x.strokeStyle = 'rgba(40,36,32,0.55)'; x.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    let a = Math.random() * Math.PI * 2, r = 7, px = 32 + Math.cos(a) * r, py = 32 + Math.sin(a) * r;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 4; k++) { a += (Math.random() - 0.5) * 0.8; r += 4 + Math.random() * 4; px = 32 + Math.cos(a) * r; py = 32 + Math.sin(a) * r; x.lineTo(px, py); }
    x.stroke();
  }
  const g2 = x.createRadialGradient(32, 32, 0, 32, 32, 9);
  g2.addColorStop(0, 'rgba(8,7,6,1)'); g2.addColorStop(0.55, 'rgba(22,20,18,1)'); g2.addColorStop(1, 'rgba(60,55,50,0)');
  x.fillStyle = g2; x.beginPath(); x.arc(32, 32, 9, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A tank track's print: the pads pressed into the dirt, darker grousers across it, soft at the edges
function trackTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const x = c.getContext('2d');
  const g1 = x.createLinearGradient(0, 0, 32, 0);
  g1.addColorStop(0, 'rgba(48,38,28,0)'); g1.addColorStop(0.18, 'rgba(48,38,28,0.55)'); g1.addColorStop(0.82, 'rgba(48,38,28,0.55)'); g1.addColorStop(1, 'rgba(48,38,28,0)');
  x.fillStyle = g1; x.fillRect(0, 0, 32, 64);
  x.fillStyle = 'rgba(26,20,14,0.45)';
  for (let y = 2; y < 64; y += 8) x.fillRect(4, y, 24, 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Foam for a ship's wake: bright, broken lines along both edges (the arms of the V a ship's wake spreads in),
// churned streaks down the middle, gaps of dark water between
function wakeTexture() {
  const W = 64, H = 256, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  const hsh = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const nz = (u, v) => { const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv; const a = hsh(iu, iv), b = hsh(iu + 1, iv), c2 = hsh(iu, iv + 1), e = hsh(iu + 1, iv + 1); return a + (b - a) * fu + (c2 - a) * fv + (a - b - c2 + e) * fu * fv; };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / (W - 1), v = j / H;
    const edge = Math.exp(-((Math.min(u, 1 - u) - 0.06) ** 2) / 0.0035);
    const mid = Math.exp(-((u - 0.5) ** 2) / 0.04);
    const n = nz(u * 9, v * 40) * 0.6 + nz(u * 23, v * 90) * 0.4, n2 = nz(u * 5 + 3, v * 14);
    const brk = Math.min(1, Math.max(0, (n * 0.7 + n2 * 0.5 - 0.32) * 1.6));
    const a = Math.min(1, edge * brk * 0.8 + mid * Math.max(0, n - 0.38) * 1.2);
    const o = (j * W + i) * 4;
    d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

// A soft round shadow for things beyond the reach of the sun's shadow map
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), g1 = x.createRadialGradient(32, 32, 4, 32, 32, 31);
  g1.addColorStop(0, 'rgba(0,0,0,0.62)'); g1.addColorStop(0.6, 'rgba(0,0,0,0.38)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g1; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// A scorch mark: soot darkest in the middle, ragged at the edge, with spatters thrown out
function scorchTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 4, 64, 64, 60);
  gr.addColorStop(0, 'rgba(14,11,9,0.92)'); gr.addColorStop(0.45, 'rgba(22,18,14,0.78)'); gr.addColorStop(0.8, 'rgba(40,32,24,0.3)'); gr.addColorStop(1, 'rgba(40,32,24,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  let seed = 9;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  x.filter = 'blur(1px)';
  // streaks blown out from the middle
  for (let i = 0; i < 26; i++) {
    const a = r() * 6.283, w = 0.04 + r() * 0.08, d = 34 + r() * 26;
    x.fillStyle = `rgba(20,16,12,${0.18 + r() * 0.25})`;
    x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a - w) * d, 64 + Math.sin(a - w) * d); x.lineTo(64 + Math.cos(a + w) * d, 64 + Math.sin(a + w) * d); x.fill();
  }
  // spatters of soot and earth
  for (let i = 0; i < 140; i++) {
    const a = r() * 6.283, d = 14 + r() * 48, s = 0.5 + r() * (d < 36 ? 2.6 : 1.4);
    x.fillStyle = `rgba(18,14,11,${0.2 + r() * 0.45})`;
    x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, s, 0, 6.283); x.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ParticleSystem {
  constructor(scene, max, additive, map) {
    this.max = max;
    this.count = 0;
    this.px = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.rgb = new Float32Array(max * 3);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.ang0 = new Float32Array(max);
    this.spin = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.angAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('angle', this.angAttr);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('pcolor', this.colAttr);
    geo.setAttribute('size', this.sizeAttr);
    geo.setDrawRange(0, 0);
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { scale: { value: 600 } }]);
    this.uniforms.map = { value: map };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `attribute float size; attribute float angle; attribute vec4 pcolor; varying vec4 vColor; varying float vAngle; uniform float scale;
        #include <fog_pars_vertex>
        void main(){
          vColor = pcolor;
          vAngle = angle;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec4 vColor; varying float vAngle; uniform sampler2D map;
        #include <fog_pars_fragment>
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float cs = cos(vAngle), sn = sin(vAngle);
          vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) + 0.5;
          vec4 t = texture2D(map, clamp(r, 0.0, 1.0));
          gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
          if (gl_FragColor.a < 0.003) discard;
          #include <fog_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }

  add(x, y, z, vx, vy, vz, life, s0, s1, color, alpha, gravity = 0, drag = 0) {
    let i = this.count;
    if (i >= this.max) i = Math.floor(Math.random() * this.max);
    else this.count++;
    this.px[i * 3] = x; this.px[i * 3 + 1] = y; this.px[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = 0; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    _c.set(color);
    this.rgb[i * 3] = _c.r; this.rgb[i * 3 + 1] = _c.g; this.rgb[i * 3 + 2] = _c.b;
    this.a0[i] = alpha; this.grav[i] = gravity; this.drag[i] = drag;
    this.ang0[i] = Math.random() * 6.283;
    this.spin[i] = (Math.random() - 0.5) * 1.6;
  }

  update(dt) {
    const pos = this.posAttr.array, col = this.colAttr.array, size = this.sizeAttr.array, ang = this.angAttr.array;
    let i = 0;
    while (i < this.count) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        const last = --this.count;
        if (i !== last) this._move(last, i);
        continue;
      }
      const t = this.life[i] / this.maxLife[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.v[i * 3] *= dr; this.v[i * 3 + 1] = this.v[i * 3 + 1] * dr - this.grav[i] * dt; this.v[i * 3 + 2] *= dr;
      this.px[i * 3] += this.v[i * 3] * dt;
      this.px[i * 3 + 1] += this.v[i * 3 + 1] * dt;
      this.px[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      pos[i * 3] = this.px[i * 3]; pos[i * 3 + 1] = this.px[i * 3 + 1]; pos[i * 3 + 2] = this.px[i * 3 + 2];
      col[i * 4] = this.rgb[i * 3]; col[i * 4 + 1] = this.rgb[i * 3 + 1]; col[i * 4 + 2] = this.rgb[i * 3 + 2];
      const fadeIn = Math.min(1, this.life[i] / 0.05 + 0.3);
      col[i * 4 + 3] = this.a0[i] * (1 - t) * (1 - t * 0.3) * fadeIn;
      size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      ang[i] = this.ang0[i] + this.spin[i] * this.life[i];
      i++;
    }
    this.points.geometry.setDrawRange(0, this.count);
    // only the live particles go up to the graphics card (nothing at all when there are none)
    if (!this.count && !this._sent) return;
    this._sent = this.count;
    const n = Math.max(1, this.count);
    for (const [at, k] of [[this.posAttr, 3], [this.colAttr, 4], [this.sizeAttr, 1], [this.angAttr, 1]]) {
      at.clearUpdateRanges(); at.addUpdateRange(0, n * k); at.needsUpdate = true;
    }
  }

  _move(from, to) {
    for (let k = 0; k < 3; k++) {
      this.px[to * 3 + k] = this.px[from * 3 + k];
      this.v[to * 3 + k] = this.v[from * 3 + k];
      this.rgb[to * 3 + k] = this.rgb[from * 3 + k];
    }
    this.life[to] = this.life[from]; this.maxLife[to] = this.maxLife[from];
    this.s0[to] = this.s0[from]; this.s1[to] = this.s1[from];
    this.a0[to] = this.a0[from]; this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from];
    this.ang0[to] = this.ang0[from]; this.spin[to] = this.spin[from];
  }

  clear() { this.count = 0; this.points.geometry.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------- explosions: the rendered fireball
// Each explosion plays the rendered film on a quad that faces you with the world's up kept up (straight up the
// screen when you look down on it), drawn a little toward you so the ground cuts less of it; consecutive frames are
// blended so it runs smoothly. How big and how long follow the blast: scale 1 is about 10 m across and plays for
// 3 seconds, a 2,000 lb bomb three times the size. All of them in one draw.
const BOOM_VS = `attribute vec3 iPos; attribute vec2 iSize; attribute vec2 iFrame;
  uniform vec2 uQuad; uniform vec2 uOrigin; uniform vec4 uCell; uniform vec2 uAtlas; uniform float uCols;
  varying vec2 vUv0; varying vec2 vUv1; varying float vMix; varying float vAlpha;
  #include <fog_pars_vertex>
  vec2 cellUv(float f, vec2 uv) {
    vec2 c = vec2(mod(f, uCols), floor(f / uCols));
    vec2 px = c * uCell.xy + uCell.z + vec2(uv.x, 1.0 - uv.y) * uCell.zw;
    return vec2(px.x / uAtlas.x, 1.0 - px.y / uAtlas.y);
  }
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    vec2 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xy;
    float l = length(up);
    up = normalize(mix(vec2(0.0, 1.0), up / max(l, 1e-4), smoothstep(0.08, 0.35, l)));
    vec2 right = vec2(up.y, -up.x);
    vec2 c = (uv - uOrigin) * uQuad * iSize.x;
    mvPosition.xy += right * c.x + up * c.y;
    mvPosition.z += 0.3 * uQuad.x * iSize.x;
    gl_Position = projectionMatrix * mvPosition;
    float f0 = floor(iFrame.x);
    vMix = iFrame.x - f0;
    vUv0 = cellUv(f0, uv); vUv1 = cellUv(f0 + 1.0, uv);
    vAlpha = iSize.y;
    #include <fog_vertex>
  }`;
const BOOM_FS = `uniform sampler2D map; varying vec2 vUv0; varying vec2 vUv1; varying float vMix; varying float vAlpha;
  #include <fog_pars_fragment>
  void main() {
    vec4 t = mix(texture2D(map, vUv0), texture2D(map, vUv1), vMix);
    // (the hottest of the fire glows a little brighter than the picture)
    float lum = dot(t.rgb, vec3(0.3, 0.55, 0.15));
    gl_FragColor = vec4(t.rgb * (1.0 + 0.9 * smoothstep(0.45, 0.95, lum)), t.a * vAlpha);
    if (gl_FragColor.a < 0.004) discard;
    #include <fog_fragment>
    #include <colorspace_fragment>
  }`;
class Booms {
  constructor(scene) {
    const E = EXPLOSION, max = 24;
    this.max = max; this.list = [];
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.iFrame = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.iPos); geo.setAttribute('iSize', this.iSize); geo.setAttribute('iFrame', this.iFrame);
    geo.instanceCount = 0;
    const map = new THREE.TextureLoader().load(E.tex);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 2;
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uQuad: { value: new THREE.Vector2(...E.size) }, uOrigin: { value: new THREE.Vector2(...E.origin) },
      uCell: { value: new THREE.Vector4(E.cell[0], E.cell[1], E.pad, 0) }, uAtlas: { value: new THREE.Vector2(...E.atlas) }, uCols: { value: E.cols },
    }]);
    uniforms.uCell.value.w = E.content[1];
    uniforms.uCell.value.z = E.pad;
    // (uCell: the cell's width and height, its margin, the frame's height; the frame's width is the cell less both margins)
    uniforms.map = { value: map };
    this.mat = new THREE.ShaderMaterial({ uniforms, vertexShader: BOOM_VS.replace('uCell.zw', 'vec2(uCell.x - 2.0 * uCell.z, uCell.w)'), fragmentShader: BOOM_FS,
      transparent: true, depthWrite: false, fog: true });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    // the film's own time for each cell, and the frame to show at a time t (seconds into the 120-frame film)
    this.frames = E.frames.map((f) => (f - 1) / E.fps);
    this.end = this.frames[this.frames.length - 1];
  }

  add(x, y, z, scale) {
    if (this.list.length >= this.max) this.list.shift();
    const s = Math.max(0.15, scale);
    // (bigger blasts burn a little longer; the whole film is 5 s, played faster)
    this.list.push({ x, y, z, s, t: 0, dur: 3 * (0.85 + 0.15 * Math.min(s, 3)) });
  }

  update(dt) {
    const L = this.list, F = this.frames;
    for (let i = L.length - 1; i >= 0; i--) if ((L[i].t += dt) >= L[i].dur) L.splice(i, 1);
    const P = this.iPos.array, S = this.iSize.array, R = this.iFrame.array;
    for (let i = 0; i < L.length; i++) {
      const b = L[i], u = b.t / b.dur, ft = u * this.end;
      let k = 0;
      while (k < F.length - 2 && F[k + 1] <= ft) k++;
      const f = k + clamp((ft - F[k]) / (F[k + 1] - F[k]), 0, 1);
      P[i * 3] = b.x; P[i * 3 + 1] = b.y; P[i * 3 + 2] = b.z;
      S[i * 2] = b.s; S[i * 2 + 1] = Math.min(1, b.t / 0.03) * (1 - Math.max(0, (u - 0.8) / 0.2));
      R[i * 2] = Math.min(f, F.length - 1.001);
    }
    const g = this.mesh.geometry;
    if (!L.length && !g.instanceCount) return;
    g.instanceCount = L.length;
    this.iPos.needsUpdate = true; this.iSize.needsUpdate = true; this.iFrame.needsUpdate = true;
  }

  clear() { this.list.length = 0; this.mesh.geometry.instanceCount = 0; }
}

// ---------------------------------------------------------------- fires: the burning flame
// A flame 6 m tall (scale 1) that sways and licks upward, hot white-yellow at its root, orange up its body and dull red
// at the tips, flickering as the fire runs up through it; seen side-on its edges fade, so it has no hard outline. A
// fire is three of them round each other, each turned its own way and the others smaller (one on Low). Fires burn on wrecks (as long as the wreck does) and where a big
// blast hit the ground, smoke rising off them; their size follows what's burning or how big the blast was.
const FIRE_VS = `uniform float uTime; attribute float aPhase; attribute float aFade;
  varying float vH; varying vec3 vP; varying vec3 vN; varying vec3 vV; varying float vFade; varying float vPh;
  #include <fog_pars_vertex>
  void main() {
    vec3 p = position;
    float h = clamp(p.y / 6.0, 0.0, 1.0), t = uTime + aPhase, sway = h * h;
    p.x += (sin(t * 2.9 + p.y * 1.4) * 0.22 + sin(t * 7.7 + p.y * 3.3) * 0.06) * sway;
    p.z += (cos(t * 2.3 + p.y * 1.2) * 0.2 + cos(t * 6.4 + p.y * 2.9) * 0.06) * sway;
    p.y *= 1.0 + (0.09 * sin(t * 3.7) + 0.05 * sin(t * 9.1)) * h;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vV = -mvPosition.xyz;
    vH = h; vP = position; vFade = aFade; vPh = aPhase;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const FIRE_FS = `uniform float uTime;
  varying float vH; varying vec3 vP; varying vec3 vN; varying vec3 vV; varying float vFade; varying float vPh;
  #include <fog_pars_fragment>
  float fh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float fn(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(fh(i), fh(i + vec3(1, 0, 0)), f.x), mix(fh(i + vec3(0, 1, 0)), fh(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(fh(i + vec3(0, 0, 1)), fh(i + vec3(1, 0, 1)), f.x), mix(fh(i + vec3(0, 1, 1)), fh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  void main() {
    float t = uTime + vPh;
    vec3 q = vP * vec3(1.7, 0.9, 1.7) + vec3(0.0, -t * 2.4, 0.0);
    float n = fn(q) * 0.65 + fn(q * 2.3 + 7.1) * 0.35;
    float facing = abs(dot(normalize(vN), normalize(vV)));
    float h = vH + (n - 0.5) * 0.35;
    vec3 col = mix(vec3(1.0, 0.7, 0.34) * 1.3, vec3(1.0, 0.4, 0.07) * 1.3, smoothstep(0.0, 0.3, h));
    col = mix(col, vec3(0.7, 0.13, 0.02) * 1.0, smoothstep(0.38, 0.85, h));
    float a = smoothstep(0.05, 0.6, facing) * (1.0 - smoothstep(0.55, 1.0, h)) * (0.4 + 0.6 * n) * smoothstep(0.0, 0.05, vH) * 0.78;
    gl_FragColor = vec4(col * a * vFade, 1.0);
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      // (it glows: the fog takes the light away rather than painting its own colour in)
      gl_FragColor.rgb *= 1.0 - fogFactor;
    #endif
    #include <colorspace_fragment>
  }`;
class Flames {
  constructor(scene, fx) {
    this.fx = fx; this.list = [];
    const D = FIRE, raw = atob(D.bin), buf = new ArrayBuffer(raw.length), u8 = new Uint8Array(buf);
    for (let i = 0; i < raw.length; i++) u8[i] = raw.charCodeAt(i);
    const Q = new Int16Array(buf, 0, D.v * 3), N = new Int8Array(buf, D.no, D.v * 3), pos = new Float32Array(D.v * 3), nor = new Float32Array(D.v * 3);
    for (let i = 0; i < D.v * 3; i++) { const j = i % 3; pos[i] = D.lo[j] + ((Q[i] + 32767) / 65534) * (D.hi[j] - D.lo[j]) - (j === 1 ? D.lo[1] : 0); nor[i] = N[i] / 127; }
    // (stood on its own base, and centred over the middle of it)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(buf.slice(D.io, D.io + D.i * 2)), 1));
    let bx = 0, bz = 0, nb = 0;
    for (let i = 0; i < D.v; i++) if (pos[i * 3 + 1] < 0.5) { bx += pos[i * 3]; bz += pos[i * 3 + 2]; nb++; }
    geo.translate(-bx / Math.max(1, nb), 0, -bz / Math.max(1, nb));
    this.max = 36;
    this.aPhase = new THREE.InstancedBufferAttribute(new Float32Array(this.max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aFade = new THREE.InstancedBufferAttribute(new Float32Array(this.max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPhase', this.aPhase); geo.setAttribute('aFade', this.aFade);
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]);
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: FIRE_VS, fragmentShader: FIRE_FS, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  // a fire at x, y (its base), z: scale 1 is a 6 m flame; it burns for life seconds, or while its owner is a wreck
  // (it dies down when the owner is gone or alive again); smoke: whether it puts up its own smoke
  add(x, y, z, scale, life, owner = null, smoke = true) {
    const low = this.fx.game.qualityName && this.fx.game.qualityName() === 'low';
    const most = low ? 5 : 12;
    while (this.list.length >= most) this.list.shift();
    this.list.push({ x, y, z, s: scale, life, owner, smoke, t: 0, out: 0, yaw: rand(0, 6.283), ph: rand(0, 50), pair: !low, st: 0 });
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
    const L = this.list, fx = this.fx;
    let n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const f = L[i];
      f.t += dt;
      const o = f.owner, gone = o && (o.exists === false || o.alive === true);
      if ((f.t > f.life || gone) && !f.out) f.out = f.t;
      if (f.out && f.t - f.out > 1.5) { L.splice(i, 1); continue; }
      f.fade = Math.min(1, f.t / 0.5) * (f.out ? Math.max(0, 1 - (f.t - f.out) / 1.5) : 1);
      if (f.smoke && f.fade > 0.3 && (f.st -= dt) <= 0) {
        f.st = 0.16 / Math.max(0.4, f.s);
        fx.smoke.add(f.x + rand(-0.6, 0.6) * f.s, f.y + 4.8 * f.s, f.z + rand(-0.6, 0.6) * f.s, rand(-0.4, 0.4), rand(1.5, 3) * Math.sqrt(f.s), rand(-0.4, 0.4),
          rand(3, 5), 1.6 * f.s, 7 * f.s, 0x2a2622, 0.5 * f.fade, -0.3, 0.3);
      }
    }
    for (const f of L) {
      for (let k = 0; k < (f.pair ? 3 : 1); k++) {
        const s = f.s * (k === 0 ? 1 : k === 1 ? 0.74 : 0.6), a = f.yaw + k * 2.3, r = k ? 0.58 * f.s : 0;
        this._p.set(f.x + Math.cos(a) * r, f.y, f.z + Math.sin(a) * r);
        this._q.setFromAxisAngle(_up, f.yaw + k * 2.2);
        this._s.set(s * 1.3, s * (0.95 + 0.08 * Math.sin(time * 2.1 + f.ph + k)), s * 1.3);
        this._m.compose(this._p, this._q, this._s);
        this.mesh.setMatrixAt(n, this._m);
        this.aPhase.array[n] = f.ph + k * 13.7;
        this.aFade.array[n] = f.fade;
        n++;
      }
    }
    if (!n && !this.mesh.count) return;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.aPhase.needsUpdate = true; this.aFade.needsUpdate = true;
  }

  clear() { this.list.length = 0; this.mesh.count = 0; }
}

export class Effects {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    const tex = game.world.tex;
    this.smoke = new ParticleSystem(scene, 2600, false, tex.smoke);
    this.fire = new ParticleSystem(scene, 1400, true, tex.glow);
    // billowing flame: the puff shape, glowing
    this.blaze = new ParticleSystem(scene, 900, true, tex.smoke);
    // the rendered explosion, and the fires
    this.booms = new Booms(scene);
    this.flames = new Flames(scene, this);

    // Debris chunks
    this.debrisMax = 320;
    this.debrisMesh = new THREE.InstancedMesh(chunkGeo(),
      new THREE.MeshStandardMaterial({ map: tex.plaster, color: 0xffffff, roughness: 0.95, flatShading: true }), this.debrisMax);
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.count = 0;
    scene.add(this.debrisMesh);
    this.debrisList = [];

    // Scorch marks left on the ground (the oldest gives way to the newest)
    this.scorchMax = 48;
    this.scorchMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
      map: scorchTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }), this.scorchMax);
    this.scorchMesh.count = 0;
    this.scorchMesh.receiveShadow = true;
    this.scorchMesh.frustumCulled = false;
    this.scorchMesh.renderOrder = 1;
    scene.add(this.scorchMesh);
    this.scorchN = 0;
    // Bullet holes in walls, rocks, metal and the ground (the oldest give way to the newest)
    this.holeMax = 220;
    this.holeMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({
      map: holeTexture(), transparent: true, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }), this.holeMax);
    this.holeMesh.count = 0;
    this.holeMesh.receiveShadow = true;
    this.holeMesh.frustumCulled = false;
    this.holeMesh.renderOrder = 1;
    scene.add(this.holeMesh);
    this.holeN = 0;
    // Track marks left by tanks (the oldest give way to the newest)
    this.trackMax = 600;
    this.trackMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
      map: trackTexture(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }), this.trackMax);
    this.trackMesh.count = 0;
    this.trackMesh.receiveShadow = true;
    this.trackMesh.frustumCulled = false;
    this.trackMesh.renderOrder = 1;
    scene.add(this.trackMesh);
    this.trackN = 0;
    // Ships' wakes: a strip of foam along each ship's track that spreads and fades behind it
    this.wakes = new Map();
    // Heat haze: sources for this frame (jet exhausts, ...) and short-lived ones (explosions); the post pass shimmers
    // the picture round them
    this.heatList = []; this.heatTimed = [];
    // Contact shadows under soldiers and tanks too far away for the shadow map
    this.blobMax = 160;
    this.blobMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true,
    }), this.blobMax);
    this.blobMesh.count = 0;
    this.blobMesh.frustumCulled = false;
    this.blobMesh.renderOrder = 1;
    scene.add(this.blobMesh);
    this.wakeMat = new THREE.MeshBasicMaterial({ map: wakeTexture(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler();
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3();

    // Tracers
    this.tracerMax = 160;
    const tg = new THREE.BufferGeometry();
    this.tracerPos = new THREE.BufferAttribute(new Float32Array(this.tracerMax * 6), 3).setUsage(THREE.DynamicDrawUsage);
    this.tracerCol = new THREE.BufferAttribute(new Float32Array(this.tracerMax * 6), 3).setUsage(THREE.DynamicDrawUsage);
    tg.setAttribute('position', this.tracerPos);
    tg.setAttribute('color', this.tracerCol);
    tg.setDrawRange(0, 0);
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.tracerLines.frustumCulled = false;
    this.tracerLines.renderOrder = 4;
    scene.add(this.tracerLines);
    this.tracers = [];

    // Flash lights (fixed pool so shaders never recompile)
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffa850, 0, 30, 2);
      l.userData.t = 0; l.userData.dur = 0.1; l.userData.peak = 0;
      scene.add(l);
      this.lights.push(l);
    }
    this.lightIdx = 0;
    this.shake = 0;
  }

  setScale(viewportHeight, fovDeg) {
    const s = viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.smoke.uniforms.scale.value = s;
    this.fire.uniforms.scale.value = s;
    this.blaze.uniforms.scale.value = s;
  }

  addShake(a) { this.shake = clamp(this.shake + a, 0, 1.6); }

  flash(x, y, z, intensity, range, dur, color = 0xffa850) {
    const l = this.lights[this.lightIdx];
    this.lightIdx = (this.lightIdx + 1) % this.lights.length;
    l.position.set(x, y, z);
    l.color.set(color);
    l.distance = range;
    l.userData.peak = intensity;
    l.userData.t = dur;
    l.userData.dur = dur;
    l.intensity = intensity;
  }

  muzzle(x, y, z, dx, dy, dz, big = false) {
    const n = big ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const s = rand(0.3, 0.55) * (big ? 1.6 : 1);
      this.fire.add(x + dx * 0.1 * i, y + dy * 0.1 * i, z + dz * 0.1 * i, dx * 3, dy * 3, dz * 3, 0.05, s, s * 0.5, 0xffc070, 1);
    }
    this.smoke.add(x, y, z, dx * 1.5 + rand(-0.3, 0.3), dy * 1.5 + 0.4, dz * 1.5 + rand(-0.3, 0.3), 0.6, 0.2, 0.9, 0x9a948a, 0.25);
  }

  // Soft shadows under the soldiers and tanks between near (where the sun's own shadows end) and far
  updateBlobs(near, far) {
    const g = this.game, c = g.camera.position, W = g.world, m = this.blobMesh;
    let n = 0;
    const put = (x, z, yaw, sx, sz, a) => {
      if (n >= this.blobMax) return;
      const y = W.heightAt(x, z) + 0.05;
      if (W.water !== null && W.water !== undefined && y < W.water) return;
      _qa.setFromAxisAngle(_up, yaw);
      this._s.set(sx * a, 1, sz * a);
      this._m.compose(_hv.set(x, y, z), _qa, this._s);
      m.setMatrixAt(n++, this._m);
    };
    const band = (x, z) => { const d = Math.hypot(x - c.x, z - c.z); return d < near * 0.85 || d > far ? 0 : Math.min(1, (d - near * 0.85) / (near * 0.25)); };
    for (const s of g.soldiers) {
      if (s.state !== 'alive' || s.vehicle) continue;
      const p = s.position || s.pos;
      const a = band(p.x, p.z);
      if (a > 0) put(p.x, p.z, 0, 1.1, 1.1, 0.6 + a * 0.4);
    }
    for (const v of g.vehicles) {
      if (!v.alive || v.isAircraft || v.isShip || !v.pos || !v.hull || !v.hull.visible) continue;
      const a = band(v.pos.x, v.pos.z);
      if (a > 0) put(v.pos.x, v.pos.z, v.yaw || 0, 4.4, 7.6, 0.6 + a * 0.4);
    }
    m.count = n;
    if (n) m.instanceMatrix.needsUpdate = true;
  }

  // Hot air at (x, y, z), radius r metres, strength k (about 0..1.5), for this frame only
  heat(x, y, z, r, k) {
    const c = this.game.camera.position;
    if ((x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2 > 160000 || this.heatList.length >= 48) return;
    this.heatList.push({ x, y, z, r, k });
  }

  // A ship's wake: call every frame with its stern (x, z), heading, half its beam and how fast it goes (0..1 of its
  // top speed). key is the ship
  wake(key, x, z, yaw, half, speed) {
    let w = this.wakes.get(key);
    if (!w) {
      const geo = new THREE.BufferGeometry();
      const N = 48;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 2 * 2), 2).setUsage(THREE.DynamicDrawUsage));
      const idx = [];
      for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, this.wakeMat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.game.scene.add(mesh);
      w = { pts: [], mesh, N, dist: 0, seen: 0 };
      this.wakes.set(key, w);
    }
    const now = (w.seen = this.time || 0);
    // the first point rides on the stern; behind it one is laid every few metres
    const head = w.pts[0];
    if (!head) { w.pts.push({ x, z, t: now, half, s: speed, v: 0 }); return; }
    w.dist += Math.hypot(x - head.x, z - head.z);
    head.x = x; head.z = z; head.t = now; head.s = speed; head.half = half; head.v = w.dist;
    const fixed = w.pts[1];
    if (!fixed || (x - fixed.x) ** 2 + (z - fixed.z) ** 2 > 9) w.pts.splice(1, 0, { x, z, t: now, half, s: speed, v: w.dist });
    if (w.pts.length > w.N) w.pts.length = w.N;
  }

  _updateWakes() {
    const now = this.time || 0, W = this.game.world, y = (W.water ?? 0) + 0.06, LIFE = 16;
    for (const [key, w] of this.wakes) {
      while (w.pts.length && now - w.pts[w.pts.length - 1].t > LIFE) w.pts.pop();
      if (!w.pts.length && now - w.seen > 1) { this.game.scene.remove(w.mesh); w.mesh.geometry.dispose(); this.wakes.delete(key); continue; }
      const P = w.mesh.geometry.attributes.position.array, C = w.mesh.geometry.attributes.color.array, U = w.mesh.geometry.attributes.uv.array;
      const n = w.pts.length;
      w.mesh.visible = n > 1;
      if (n < 2) continue;
      for (let i = 0; i < w.N; i++) {
        const p = w.pts[Math.min(i, n - 1)], q = w.pts[Math.min(i + 1, n - 1)] || p, o = w.pts[Math.min(Math.max(i - 1, 0), n - 1)];
        let dx = o.x - q.x, dz = o.z - q.z;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const age = now - p.t, hw = p.half * (1 + age * 0.55);
        const a = i >= n ? 0 : Math.max(0, 1 - age / LIFE) * Math.min(1, p.s * 1.6) * (i === 0 ? 0 : 1);
        const k = i * 6;
        P[k] = p.x - dz * hw; P[k + 1] = y; P[k + 2] = p.z + dx * hw;
        P[k + 3] = p.x + dz * hw; P[k + 4] = y; P[k + 5] = p.z - dx * hw;
        for (let j = 0; j < 2; j++) { const c = i * 8 + j * 4; C[c] = C[c + 1] = C[c + 2] = 1; C[c + 3] = a * 0.7; }
        const v = p.v * 0.04;
        U[i * 4] = 0; U[i * 4 + 1] = v; U[i * 4 + 2] = 1; U[i * 4 + 3] = v;
      }
      w.mesh.geometry.attributes.position.needsUpdate = true;
      w.mesh.geometry.attributes.color.needsUpdate = true;
      w.mesh.geometry.attributes.uv.needsUpdate = true;
    }
  }

  // The two tracks' prints under a tank at (x, z) heading yaw, its tracks off metres either side of the middle
  trackMark(x, z, yaw, off, w = 0.62, len = 1.0) {
    const W = this.game.world, e = 0.8;
    if (W.water !== null && W.water !== undefined && W.heightAt(x, z) < W.water + 0.2) return;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const side of [-1, 1]) {
      const px = x + rx * off * side, pz = z + rz * off * side, py = W.heightAt(px, pz);
      const nx = W.heightAt(px - e, pz) - W.heightAt(px + e, pz), nz = W.heightAt(px, pz - e) - W.heightAt(px, pz + e);
      this._p.set(nx, 2 * e, nz).normalize();
      this._q.setFromUnitVectors(_up, this._p);
      _qa.setFromAxisAngle(_up, yaw);
      this._q.multiply(_qa);
      this._s.set(w, 1, len);
      this._m.compose(_hv.set(px, py + 0.04, pz), this._q, this._s);
      this.trackMesh.setMatrixAt(this.trackN % this.trackMax, this._m);
      this.trackN++;
    }
    this.trackMesh.count = Math.min(this.trackN, this.trackMax);
    this.trackMesh.instanceMatrix.needsUpdate = true;
  }

  // A bullet hole where a round struck something that stays put
  hole(x, y, z, nx, ny, nz, mat) {
    const H = { concrete: [0.13, 0xc8c2b6], plaster: [0.12, 0xe0d6c4], metal: [0.06, 0xb8bcc0], wood: [0.08, 0x9a7a52], rock: [0.11, 0xa8a29a], sand: [0.16, 0x6e5c44], dirt: [0.16, 0x5a4a38] }[mat];
    if (!H) return;
    this._p.set(nx, ny, nz);
    if (this._p.lengthSq() < 1e-6) return;
    this._p.normalize();
    this._q.setFromUnitVectors(_fwdZ, this._p);
    _qa.setFromAxisAngle(_fwdZ, rand(0, 6.283));
    this._q.multiply(_qa);
    const s = H[0] * rand(0.8, 1.25);
    this._s.set(s, s, 1);
    this._m.compose(this._p.multiplyScalar(0.012).add(_hv.set(x, y, z)), this._q, this._s);
    const i = this.holeN % this.holeMax;
    this.holeMesh.setMatrixAt(i, this._m);
    this.holeMesh.setColorAt(i, _hc.set(H[1]));
    this.holeN++;
    this.holeMesh.count = Math.min(this.holeN, this.holeMax);
    this.holeMesh.instanceMatrix.needsUpdate = true;
    if (this.holeMesh.instanceColor) this.holeMesh.instanceColor.needsUpdate = true;
  }

  impact(x, y, z, nx, ny, nz, mat, hole = false) {
    if (hole) this.hole(x, y, z, nx, ny, nz, mat);
    if (mat === 'water') {
      for (let i = 0; i < 5; i++) {
        this.smoke.add(x, y + 0.05, z, rand(-0.6, 0.6), rand(2.5, 5), rand(-0.6, 0.6), rand(0.4, 0.7), rand(0.1, 0.2), rand(0.4, 0.7), 0xe4edf0, 0.85, 9, 1);
      }
      return;
    }
    let color = 0x8a7358, spark = false, n = 5;
    if (mat === 'plaster') color = 0xd8cdb8;
    else if (mat === 'concrete') color = 0xaaa59b;
    else if (mat === 'metal') { color = 0x6b6b6b; spark = true; n = 2; }
    else if (mat === 'wood') color = 0x6e5234;
    else if (mat === 'rock') color = 0x8c8680;
    else if (mat === 'sand') color = 0xc2ad85;
    for (let i = 0; i < n; i++) {
      this.smoke.add(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05,
        nx * rand(1, 3) + rand(-1, 1), ny * rand(1, 3) + rand(0, 1.5), nz * rand(1, 3) + rand(-1, 1),
        rand(0.35, 0.8), rand(0.12, 0.25), rand(0.5, 0.9), color, 0.8, 3, 2);
    }
    if (spark) {
      for (let i = 0; i < 6; i++) {
        this.fire.add(x, y, z, nx * rand(2, 6) + rand(-3, 3), ny * rand(2, 6) + rand(-1, 4), nz * rand(2, 6) + rand(-3, 3),
          rand(0.15, 0.35), 0.08, 0.03, 0xffc877, 1, 12, 0);
      }
    }
  }

  blood(x, y, z, dx, dy, dz) {
    for (let i = 0; i < 6; i++) {
      this.smoke.add(x, y, z, dx * rand(0.5, 2) + rand(-0.8, 0.8), dy * rand(0.5, 2) + rand(-0.3, 1), dz * rand(0.5, 2) + rand(-0.8, 0.8),
        rand(0.25, 0.5), rand(0.1, 0.2), rand(0.35, 0.6), 0x7a0f0a, 0.85, 6, 1);
    }
  }

  dust(x, y, z, radius, n, color = 0xb9ad98) {
    for (let i = 0; i < n; i++) {
      this.smoke.add(x + rand(-radius, radius) * 0.5, y + rand(-radius, radius) * 0.4, z + rand(-radius, radius) * 0.5,
        rand(-1.5, 1.5), rand(0, 1.5), rand(-1.5, 1.5), rand(1.5, 3), rand(1, 2), rand(3, 5), color, 0.55, -0.1, 0.8);
    }
  }

  // A shell or bomb landing in the sea: a tall column of white water
  splash(x, y, z, scale = 1) {
    const s = scale;
    for (let i = 0; i < 30 * s + 8; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0, 1.6) * s;
      this.smoke.add(x + Math.cos(a) * r, y + 0.2, z + Math.sin(a) * r, Math.cos(a) * rand(0.5, 3) * s, rand(8, 22) * s, Math.sin(a) * rand(0.5, 3) * s,
        rand(1.2, 2.4), rand(0.6, 1.2) * s, rand(1.6, 3.2) * s, i % 3 ? 0xe9f1f3 : 0xc9d8dc, 0.9, 11, 0.6);
    }
    for (let i = 0; i < 14 * s; i++) {
      this.smoke.add(x + rand(-2, 2) * s, y + 0.3, z + rand(-2, 2) * s, rand(-4, 4) * s, rand(0.5, 2), rand(-4, 4) * s, rand(2, 4), rand(1, 2) * s, rand(4, 7) * s, 0xdfe8ea, 0.5, -0.1, 0.8);
    }
  }

  // A shell, grenade or bomb going off: the white flash, a fireball of rolling flame, sparks and embers, dark smoke
  // boiling up out of it and a column that hangs over the spot; on the ground also the blast ring of dust, earth and
  // clods thrown up trailing dirt, and a scorch mark
  explosion(x, y, z, scale = 1) {
    if (this.heatTimed.length < 12) this.heatTimed.push({ x, y: y + 2 * scale, z, r: 7 * scale, k: 1.4, t: 0.8, d: 0.8 });
    const world = this.game.world, sea = world.water;
    if (sea !== null && y < sea + 1.2) { this.splash(x, sea, z, scale); this.flash(x, sea + 1, z, 30 * scale, 20 * scale, 0.12); return; }
    this.flash(x, y + 1, z, 60 * scale, 30 * scale, 0.22);
    const s = scale, k = Math.min(s, 2.5), gy = world.heightAt(x, z), ground = y - gy < 1.5 + s;
    // (on the ground the fireball rolls up off it: its middle a little above where it hit)
    this.booms.add(x, ground ? Math.max(y, gy + 1.8 * s) : y, z, s);
    this.fire.add(x, y + 0.5, z, 0, 0, 0, 0.1, 5 * s, 9 * s, 0xfff0c8, 1);
    for (let i = 0, n = Math.round(4 * k + 2); i < n; i++) {
      const a = rand(0, 6.283), u = rand(ground ? 0.1 : -0.9, 1), h = Math.sqrt(1 - u * u), sp = rand(3, 9) * s;
      const dx = Math.cos(a) * h, dz = Math.sin(a) * h;
      this.blaze.add(x + dx * 0.5 * s, y + 0.4 + u * 0.5 * s, z + dz * 0.5 * s, dx * sp, u * sp + 1.5 * s, dz * sp,
        rand(0.3, 0.7) * (0.8 + 0.2 * s), rand(1.6, 2.6) * s, rand(3.5, 5.5) * s, i % 3 === 0 ? 0xffd890 : i % 3 === 1 ? 0xff9238 : 0xd9501a, 0.85, -2, 3.5);
    }
    for (let i = 0; i < 16 * s + 6; i++) {
      this.fire.add(x, y + 0.3, z, rand(-8, 8) * s, rand(1, 10) * s, rand(-8, 8) * s,
        rand(0.15, 0.35), rand(1.6, 2.8) * s, rand(0.5, 1.2) * s, i % 3 ? 0xffa040 : 0xffe0a0, 1, 0, 4);
    }
    for (let i = 0; i < 26 * s; i++) {
      this.fire.add(x, y + 0.3, z, rand(-22, 22), rand(4, 26), rand(-22, 22), rand(0.4, 1.1), 0.12, 0.05, 0xffd080, 1, 20, 0.5);
    }
    for (let i = 0; i < 8 * k; i++) {
      this.fire.add(x, y + 0.5, z, rand(-6, 6), rand(3, 12), rand(-6, 6), rand(1.2, 2.6), 0.1, 0.06, 0xff8a3a, 1, 5, 0.8);
    }
    for (let i = 0; i < 12 * s + 2; i++) {
      this.smoke.add(x + rand(-1, 1), y + rand(0, 1.5), z + rand(-1, 1), rand(-3, 3) * s, rand(1, 5) * s, rand(-3, 3) * s,
        rand(2.5, 5), rand(2, 3.5) * s, rand(6, 10) * s, i % 2 ? 0x3a3530 : 0x57504a, 0.7, -0.4, 0.9);
    }
    for (let i = 0; i < 5 * k + 2; i++) {
      this.smoke.add(x + rand(-1.5, 1.5) * s, y + rand(0.5, 3) * s, z + rand(-1.5, 1.5) * s, rand(-0.6, 0.6), rand(0.8, 2.2), rand(-0.6, 0.6),
        rand(8, 14), rand(3, 5) * s, rand(9, 15) * s, i % 2 ? 0x4f4943 : 0x6e665e, 0.55, -0.15, 0.25);
    }
    if (!ground) { this.debris(x, y + 0.5, z, 0x3a3632, Math.round(3 * s), 0.25, { burn: s > 1.2 }); return; }
    const dust = 0x9c8f7a;
    for (let i = 0, n = Math.round(14 + 8 * k); i < n; i++) {
      const a = (i / n) * 6.283 + rand(-0.12, 0.12), sp = rand(12, 20) * Math.sqrt(s), ca = Math.cos(a), sa = Math.sin(a);
      this.smoke.add(x + ca * 0.8, gy + 0.4, z + sa * 0.8, ca * sp, rand(0.3, 1.2), sa * sp, rand(1.4, 2.4), s, rand(3.5, 5) * s, dust, 0.5, -0.2, 3.2);
    }
    for (let i = 0; i < 22 * s; i++) {
      this.smoke.add(x, y + 0.3, z, rand(-7, 7), rand(6, 15), rand(-7, 7), rand(0.8, 1.6), rand(0.25, 0.5), rand(0.6, 1.2), 0x6e5a42, 0.9, 16, 0.3);
    }
    this.debris(x, y + 0.5, z, 0x4a3d2e, Math.round(5 * k), 0.3, { trail: 0x7a6a55, speed: 1.3 });
    if (this.scorchOn !== false) this.scorch(x, gy, z, 1.4 + 1.5 * s);
    // a big blast (a bomb) leaves the ground burning for a while, the fire as big as the blast
    if (s >= 2) this.fireAt(x + rand(-1, 1), gy, z + rand(-1, 1), Math.min(1.1, 0.24 * s), 6 + 3 * s);
  }

  // A fire at x, y (its base), z: scale 1 is a 6 m flame (a burning tank about 0.4, a bomber's wreck about 1); it
  // burns for life seconds, or while owner is a wreck (it dies down when the owner is gone or back in action); smoke:
  // whether it puts up its own smoke (an owner that smokes already says false)
  fireAt(x, y, z, scale = 0.5, life = 10, owner = null, smoke = true) { this.flames.add(x, y, z, scale, life, owner, smoke); }

  scorch(x, y, z, r) {
    const W = this.game.world, e = 0.8;
    const nx = W.heightAt(x - e, z) - W.heightAt(x + e, z), nz = W.heightAt(x, z - e) - W.heightAt(x, z + e);
    this._p.set(nx, 2 * e, nz).normalize();
    this._q.setFromUnitVectors(_up, this._p);
    _qa.setFromAxisAngle(_up, rand(0, 6.283));
    this._q.multiply(_qa);
    this._s.set(r * 2, 1, r * 2 * rand(0.8, 1.2));
    this._m.compose(this._p.set(x, y + 0.06, z), this._q, this._s);
    this.scorchMesh.setMatrixAt(this.scorchN % this.scorchMax, this._m);
    this.scorchN++;
    this.scorchMesh.count = Math.min(this.scorchN, this.scorchMax);
    this.scorchMesh.instanceMatrix.needsUpdate = true;
  }

  // Lumps flying off: o.trail leaves a smoke trail of that colour behind each, o.burn sets them alight, o.speed throws
  // them harder
  debris(x, y, z, color, n, size = 0.4, o = null) {
    const sp = (o && o.speed) || 1;
    for (let i = 0; i < n; i++) {
      if (this.debrisList.length >= this.debrisMax) this.debrisList.shift();
      const s = size * rand(0.5, 1.3);
      this.debrisList.push({
        x: x + rand(-0.6, 0.6), y: y + rand(-0.6, 0.6), z: z + rand(-0.6, 0.6),
        vx: rand(-5, 5) * sp, vy: rand(2, 8) * sp, vz: rand(-5, 5) * sp,
        rx: rand(0, 6), ry: rand(0, 6), rz: 0, wx: rand(-8, 8), wy: rand(-8, 8),
        sx: s * rand(0.7, 1.5), sy: s * rand(0.4, 1), sz: s * rand(0.7, 1.5),
        life: rand(5, 9), color: _c.set(color).multiplyScalar(rand(0.62, 0.95)).getHex(), rest: false,
        trail: o && o.trail, burn: o && o.burn && Math.random() < 0.6, tt: 0,
      });
    }
  }

  // An empty magazine falling out of a gun and lying on the ground for a while
  dropMag(x, y, z, vx = 0, vz = 0, size = 1) {
    if (this.debrisList.length >= this.debrisMax) this.debrisList.shift();
    this.debrisList.push({
      x, y, z, vx: vx * 0.8 + rand(-0.4, 0.4), vy: rand(-1, 0.3), vz: vz * 0.8 + rand(-0.4, 0.4),
      rx: rand(0, 6), ry: rand(0, 6), rz: 0, wx: rand(-7, 7), wy: rand(-4, 4),
      sx: 0.07 * size, sy: 0.034 * size, sz: 0.15 * size,
      life: 14, color: 0x2c2e31, rest: false,
    });
  }

  tracer(x0, y0, z0, x1, y1, z1, color = 0xffc46b) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 2) return;
    if (this.tracers.length >= this.tracerMax) this.tracers.shift();
    _c.set(color);
    this.tracers.push({ x0, y0, z0, dx: dx / len, dy: dy / len, dz: dz / len, len, d: 0, r: _c.r, g: _c.g, b: _c.b });
  }

  rocketTrail(x, y, z) {
    this.smoke.add(x, y, z, rand(-0.3, 0.3), rand(0, 0.6), rand(-0.3, 0.3), rand(1.2, 2), 0.4, 2.2, 0xcfc8bd, 0.55, -0.3, 0.5);
    this.fire.add(x, y, z, 0, 0, 0, 0.06, 0.5, 0.2, 0xffb050, 1);
  }

  update(dt) {
    this.time = (this.time || 0) + dt;
    for (let i = this.heatTimed.length - 1; i >= 0; i--) if ((this.heatTimed[i].t -= dt) <= 0) this.heatTimed.splice(i, 1);
    if (this.wakes.size) this._updateWakes();
    this.smoke.update(dt);
    this.fire.update(dt);
    this.blaze.update(dt);
    this.booms.update(dt);
    this.flames.update(dt, this.time);
    this.shake = Math.max(0, this.shake - dt * 2.2);

    for (const l of this.lights) {
      if (l.userData.t > 0) {
        l.userData.t -= dt;
        l.intensity = Math.max(0, l.userData.peak * (l.userData.t / l.userData.dur));
      } else l.intensity = 0;
    }

    // Debris physics
    const world = this.game.world;
    const list = this.debrisList;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      d.life -= dt;
      if (d.life <= 0) { list.splice(i, 1); continue; }
      if (!d.rest) {
        d.vy -= 20 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        d.rx += d.wx * dt; d.ry += d.wy * dt;
        if (d.trail || d.burn) {
          d.tt += dt;
          if (d.tt > 0.045) {
            d.tt = 0;
            if (d.burn) this.fire.add(d.x, d.y, d.z, 0, 0.5, 0, rand(0.15, 0.3), rand(0.5, 0.9), 0.2, 0xff9a40, 1);
            this.smoke.add(d.x, d.y, d.z, rand(-0.2, 0.2), rand(0.2, 0.6), rand(-0.2, 0.2), rand(0.8, 1.5), 0.3, rand(1, 1.6), d.burn ? 0x2e2b28 : d.trail, 0.45, -0.1, 0.8);
          }
        }
        const g = world.heightAt(d.x, d.z) + d.sy * 0.5;
        if (d.y < g) {
          d.y = g;
          d.vy *= -0.3; d.vx *= 0.5; d.vz *= 0.5; d.wx *= 0.5; d.wy *= 0.5;
          if (Math.abs(d.vy) < 1) { d.rest = true; d.rx = Math.round(d.rx / Math.PI) * Math.PI; }
        }
      }
    }
    const mesh = this.debrisMesh;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const shrink = Math.min(1, d.life / 0.8);
      this._p.set(d.x, d.y - (1 - shrink) * d.sy, d.z);
      this._q.setFromEuler(this._e.set(d.rx, d.ry, d.rz));
      this._s.set(d.sx * shrink, d.sy * shrink, d.sz * shrink);
      this._m.compose(this._p, this._q, this._s);
      mesh.setMatrixAt(i, this._m);
      mesh.setColorAt(i, _c.set(d.color));
    }
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // Tracers
    const tp = this.tracerPos.array, tc = this.tracerCol.array;
    let n = 0;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.d += 520 * dt;
      if (t.d - 9 > t.len) { this.tracers.splice(i, 1); continue; }
      const head = Math.min(t.d, t.len), tail = Math.max(0, t.d - 9);
      const k = n * 6;
      tp[k] = t.x0 + t.dx * tail; tp[k + 1] = t.y0 + t.dy * tail; tp[k + 2] = t.z0 + t.dz * tail;
      tp[k + 3] = t.x0 + t.dx * head; tp[k + 4] = t.y0 + t.dy * head; tp[k + 5] = t.z0 + t.dz * head;
      tc[k] = t.r * 0.2; tc[k + 1] = t.g * 0.2; tc[k + 2] = t.b * 0.2;
      tc[k + 3] = t.r * 1.4; tc[k + 4] = t.g * 1.4; tc[k + 5] = t.b * 1.4;
      n++;
    }
    this.tracerLines.geometry.setDrawRange(0, n * 2);
    this.tracerPos.needsUpdate = true;
    this.tracerCol.needsUpdate = true;
  }

  clear() {
    this.smoke.clear();
    this.fire.clear();
    this.blaze.clear();
    this.booms.clear();
    this.flames.clear();
    this.scorchN = 0;
    this.scorchMesh.count = 0;
    this.holeN = 0;
    this.holeMesh.count = 0;
    this.trackN = 0;
    this.trackMesh.count = 0;
    for (const w of this.wakes.values()) { this.game.scene.remove(w.mesh); w.mesh.geometry.dispose(); }
    this.wakes.clear();
    this.debrisList.length = 0;
    this.tracers.length = 0;
    this.shake = 0;
  }
}
