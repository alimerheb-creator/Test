// Rain and storms: streaks of rain falling round the camera (slanted by the wind, and stretched past you when you
// move fast), splashes on the ground and the sea, the ground going dark and glossy with puddles, a greyer, heavier
// sky (see rainSky in world.js), and in a storm lightning and thunder. The rain is heard, muffled under a roof.
import * as THREE from 'three';
import { ATMOSPHERE } from './config.js';
import { ParticleSystem } from './effects.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const BOX = new THREE.Vector3(48, 30, 48);
// how often each sky rains by itself when WEATHER is AUTO: [rain, storm]
const CHANCE = { overcast: [0.45, 0.2], night: [0.14, 0.06], dusk: [0.1, 0.04], noon: [0.07, 0.02] };
const FLASH = new THREE.Color('#d8e0ff');
const _c = new THREE.Color(), _v = new THREE.Vector3();

export class Weather {
  constructor(game) {
    this.game = game;
    this.kind = 0;      // 0 clear, 1 rain, 2 storm
    this.amt = 0;       // how hard it is raining now, 0..1 (eases in and out)
    this.cover = 0;     // 1 under a roof
    this.coverAt = 0;
    this.flash = 0; this.flashT = 0; this.nextBolt = 8; this.flashOn = false;
    this.wind = new THREE.Vector3(1, 0, 0.5);
    this.camVel = new THREE.Vector3();
    this.lastCam = new THREE.Vector3();
    this.time = 0;
    this.max = game.isTouch ? 4200 : 8000;

    // one drop: a quad from its head (y = 0) back along its fall (y = 1); every drop drawn at once
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    const off = new Float32Array(this.max * 4);
    for (let i = 0; i < this.max; i++) { off[i * 4] = Math.random(); off[i * 4 + 1] = Math.random(); off[i * 4 + 2] = Math.random(); off[i * 4 + 3] = rand(0.82, 1.22); }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    geo.instanceCount = 0;
    this.u = {
      uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: BOX.clone() },
      uFall: { value: new THREE.Vector3(1, -9.5, 0.5) }, uDir: { value: new THREE.Vector3(0, -1, 0) }, uLen: { value: 0.7 },
      uColor: { value: new THREE.Color(0.7, 0.72, 0.76) }, uAlpha: { value: 0.3 }, uPx: { value: 0.0015 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: `attribute vec4 aOff;
        uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uFall; uniform vec3 uDir; uniform float uLen; uniform float uPx;
        varying float vA; varying float vX; varying float vY;
        void main(){
          // each drop falls for ever through a box that follows the camera: where it leaves the box it comes back in
          vec3 p = aOff.xyz * uBox + uFall * (uTime * aOff.w);
          p = mod(p - uCam + 0.5 * uBox, uBox) - 0.5 * uBox + uCam;
          vec3 toCam = cameraPosition - p;
          float d = length(toCam);
          vec3 side = normalize(cross(uDir, toCam / max(d, 0.001)));
          // never thinner than about a pixel: further drops are wider and fainter instead
          float w = max(0.007, d * uPx);
          vec3 wp = p - uDir * (uLen * aOff.w * position.y) + side * (position.x * w);
          vX = position.x * 2.0; vY = position.y;
          vec3 q = abs(p - uCam) / (0.5 * uBox);
          vA = (1.0 - smoothstep(0.65, 1.0, max(max(q.x, q.y), q.z))) * smoothstep(0.5, 2.2, d) * min(1.0, 0.007 / w + 0.2);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `uniform vec3 uColor; uniform float uAlpha; varying float vA; varying float vX; varying float vY;
        void main(){
          float a = uAlpha * vA * (1.0 - vX * vX) * (0.3 + 0.7 * (1.0 - vY));
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    game.scene.add(this.mesh);
    // splashes where the drops land
    this.splash = new ParticleSystem(game.scene, game.isTouch ? 360 : 700, false, game.world.tex.smoke);
  }

  // a new battle: WEATHER in the settings, or (AUTO) what the map asks for, or now and then rain by itself
  pick() {
    const g = this.game, s = g.settings.weather || 'auto';
    let k = 0;
    if (s === 'rain') k = 1;
    else if (s === 'storm') k = 2;
    else if (s === 'auto') {
      if (ATMOSPHERE.rain !== undefined) k = Math.round(+ATMOSPHERE.rain) || 0;
      else if (!(g.mods && g.mods.battle === 'campaign')) {
        const c = CHANCE[ATMOSPHERE.preset] || CHANCE.dusk, r = Math.random();
        k = r < c[1] ? 2 : r < c[0] + c[1] ? 1 : 0;
      }
    }
    this.set(k);
  }

  set(k) {
    k = clamp(k | 0, 0, 2);
    const a = rand(0, Math.PI * 2), w = k === 2 ? rand(2.5, 4.5) : rand(0.6, 1.8);
    this.wind.set(Math.cos(a) * w, 0, Math.sin(a) * w);
    this.nextBolt = rand(4, 10);
    if (k === this.kind) return;
    this.kind = k;
    const W = this.game.world;
    W.weatherKind = k;
    if (W.atmosphereIn) {
      const atm = W.applyAtmosphere(W.atmosphereIn);
      const g = this.game;
      g.exposure = atm.exposure;
      g.renderer.toneMappingExposure = atm.exposure;
      if (g.post) g.post.setExposure(atm.exposure);
    }
    this.amt = k ? 0.6 : 0;
  }

  update(dt) {
    const g = this.game, W = g.world, cam = g.camera, A = g.audio;
    this.time = (this.time + dt) % 2000;
    const want = this.kind === 2 ? 1 : this.kind === 1 ? 0.62 : 0;
    this.amt += clamp(want - this.amt, -dt * 0.25, dt * 0.25);
    // under a roof (a building, a bridge, a skyscraper): no rain on you, and it sounds further off
    if (this.amt > 0 && g.time - this.coverAt > 0.25) {
      this.coverAt = g.time;
      const h = W.raycast(cam.position.x, cam.position.y + 0.2, cam.position.z, 0, 1, 0, 45, false);
      this.coverT = h.hit ? 1 : 0;
    }
    this.cover += ((this.coverT || 0) - this.cover) * Math.min(1, dt * 5);
    const under = W.water !== null && cam.position.y < W.water;
    // your own speed in a vehicle: the drops stream past a fast plane in long lines
    const ride = (g.state === 'playing' || g.state === 'paused') && g.player && g.player.vehicle;
    if (!ride) this.camVel.set(0, 0, 0);
    else if (dt > 0) {
      _v.copy(cam.position).sub(this.lastCam).divideScalar(dt);
      if (_v.lengthSq() > 250000) _v.set(0, 0, 0); // a jump (respawn), not a speed
      this.camVel.lerp(_v, Math.min(1, dt * 6));
    }
    this.lastCam.copy(cam.position);
    const on = this.amt > 0.01 && !under;
    this.mesh.visible = on;
    W.lightU().wet.value = this.amt;
    if (A.setRain) A.setRain(under ? 0 : this.amt, this.cover);
    if (!on) { this._bolt(dt, false); this.splash.update(dt); return; }

    const u = this.u;
    u.uTime.value = this.time;
    u.uCam.value.copy(cam.position);
    u.uFall.value.set(this.wind.x, -9.5, this.wind.z);
    _v.copy(u.uFall.value).sub(this.camVel);
    const rel = _v.length();
    u.uDir.value.copy(_v).divideScalar(Math.max(rel, 0.001));
    u.uLen.value = clamp(rel * 0.07, 0.55, 7);
    u.uPx.value = 1.6 / Math.max(300, g.renderer.domElement.height) * Math.tan((cam.fov * Math.PI) / 360) * 2;
    const q = g.qualityPreset ? g.qualityPreset() : null;
    const share = q && !q.post ? 0.45 : 1;
    this.mesh.geometry.instanceCount = Math.round(this.max * share * clamp(this.amt * 1.05, 0, 1) * (1 - this.cover * 0.97));
    // lit like the air round it, brighter in a lightning flash
    _c.copy(g.scene.fog.color).multiplyScalar(1.25).lerp(FLASH, this.flash * 0.6);
    u.uColor.value.copy(_c);
    u.uAlpha.value = (0.22 + 0.16 * this.amt) * (1 - this.cover);

    // splashes round you on the ground and the water (not when you fly high above it)
    const sp = this.splash;
    sp.uniforms.scale.value = g.renderer.domElement.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const gy0 = W.heightAt(cam.position.x, cam.position.z);
    if (cam.position.y - Math.max(gy0, W.water ?? -1e9) < 60) {
      let n = this.amt * (g.isTouch ? 380 : 760) * dt * (1 - this.cover * 0.6) * share;
      for (; n > 0; n--) {
        if (n < 1 && Math.random() > n) break;
        const a = Math.random() * 6.283, r = 1.2 + 15 * Math.sqrt(Math.random());
        const x = cam.position.x + Math.cos(a) * r, z = cam.position.z + Math.sin(a) * r;
        let y = W.heightAt(x, z);
        const sea = W.water !== null && W.water > y;
        if (sea) y = W.water;
        sp.add(x, y + 0.03, z, rand(-0.3, 0.3), rand(0.6, 1.4), rand(-0.3, 0.3), rand(0.14, 0.24), 0.04, sea ? 0.26 : 0.16, sea ? 0xdfe8ec : 0xc9cdd0, sea ? 0.42 : 0.32, 6, 1);
      }
    }
    sp.update(dt);
    this._bolt(dt, this.kind === 2);
  }

  // lightning: the whole sky lights up in two or three flickers, and the thunder comes after, later the further off
  _bolt(dt, storm) {
    const W = this.game.world;
    if (storm) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = rand(6, 18);
        this.flashT = 0;
        this.flashSeq = [[0, 0.07, rand(0.7, 1)], [rand(0.1, 0.16), 0.06, rand(0.3, 0.7)], [rand(0.26, 0.4), 0.09, rand(0.2, 0.6)]];
        const far = Math.random();
        const A = this.game.audio;
        if (A.thunder) setTimeout(() => { if (this.kind === 2) A.thunder(far); }, 500 + far * 4500);
      }
    }
    let f = 0;
    if (this.flashSeq) {
      this.flashT += dt;
      for (const [t0, d, k] of this.flashSeq) if (this.flashT >= t0 && this.flashT < t0 + d) f = Math.max(f, k * (1 - (this.flashT - t0) / d * 0.5));
      if (this.flashT > 0.6) this.flashSeq = null;
    }
    this.flash = f;
    const p = W.atmosphere;
    if (!p) return;
    if (f > 0) {
      this.flashOn = true;
      W.hemi.intensity = +p.hemiIntensity * (1 + 4 * f);
      const u = W.skyMat.uniforms;
      u.top.value.set(p.skyTop).lerp(FLASH, f * 0.45);
      u.horizon.value.set(p.horizon).lerp(FLASH, f * 0.5);
      if (!(W._uw && W._uw.under)) W.scene.fog.color.set(p.horizon).lerp(FLASH, f * 0.35);
    } else if (this.flashOn) {
      this.flashOn = false;
      W.hemi.intensity = +p.hemiIntensity;
      W.skyMat.uniforms.top.value.set(p.skyTop);
      W.skyMat.uniforms.horizon.value.set(p.horizon);
      if (!(W._uw && W._uw.under)) W.scene.fog.color.set(p.horizon);
    }
  }

  clear() { this.splash.clear(); }
}
