// HDR post-processing: MSAA scene target, ambient occlusion, mip-chain bloom, sun shafts, lens flare, speed blur, ACES tone mapping,
// colour grading, vignette, film grain and damage effects. Self-contained (no three/addons).
import * as THREE from 'three';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const DOWN = `uniform sampler2D tSrc; uniform vec2 texel; uniform float threshold; uniform float knee; uniform bool prefilter;
  varying vec2 vUv;
  vec3 s(vec2 o){ return texture2D(tSrc, vUv + o * texel).rgb; }
  void main(){
    vec3 a=s(vec2(-2.,2.)), b=s(vec2(0.,2.)), c=s(vec2(2.,2.)), d=s(vec2(-2.,0.)), e=s(vec2(0.,0.)), f=s(vec2(2.,0.));
    vec3 g=s(vec2(-2.,-2.)), h=s(vec2(0.,-2.)), i=s(vec2(2.,-2.)), j=s(vec2(-1.,1.)), k=s(vec2(1.,1.)), l=s(vec2(-1.,-1.)), m=s(vec2(1.,-1.));
    vec3 col = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
    if (prefilter) {
      col = min(col, vec3(30.0));
      float br = max(col.r, max(col.g, col.b));
      float rq = clamp(br - threshold + knee, 0.0, 2.0 * knee);
      rq = rq * rq / (4.0 * knee + 1e-4);
      col *= max(rq, br - threshold) / max(br, 1e-4);
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

const UP = `uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 texel; uniform float scatter;
  varying vec2 vUv;
  vec3 s(vec2 o){ return texture2D(tLow, vUv + o * texel).rgb; }
  void main(){
    vec3 t = s(vec2(0.,0.))*4.0 + (s(vec2(-1.,0.))+s(vec2(1.,0.))+s(vec2(0.,1.))+s(vec2(0.,-1.)))*2.0
      + s(vec2(-1.,-1.))+s(vec2(1.,-1.))+s(vec2(-1.,1.))+s(vec2(1.,1.));
    gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + t / 16.0 * scatter, 1.0);
  }`;

// Sun shafts: the bright parts of the picture near the sun smeared out from it, so whatever stands in front of the
// sun (a cliff, a wing, a cloud) casts beams of shadow through the light (quarter resolution). Only the white light
// of the sky makes beams: a strongly coloured bright thing near the sun (a fireball) doesn't
const RAYS = `uniform sampler2D tSrc; uniform vec2 sunPos; uniform float aspect;
  varying vec2 vUv;
  void main(){
    vec2 uv = vUv, d = (sunPos - vUv) * (0.92 / 32.0);
    float w = 1.0; vec3 acc = vec3(0.0);
    for (int i = 0; i < 32; i++) {
      vec2 q = uv - sunPos; q.x *= aspect;
      vec3 c = min(texture2D(tSrc, uv).rgb, vec3(6.0));
      float hi = max(c.r, max(c.g, c.b)), sat = (hi - min(c.r, min(c.g, c.b))) / max(hi, 1e-4);
      acc += c * w * smoothstep(0.55, 0.04, length(q)) * (1.0 - smoothstep(0.18, 0.45, sat));
      w *= 0.955; uv += d;
    }
    gl_FragColor = vec4(acc * (1.0 / 16.0), 1.0);
  }`;

// Ambient occlusion (half resolution): from the depth buffer, how much of the half-sphere above each point is shut in
// by what's around it, so corners, the foot of a wall, the ground under a tank or a crate and the gaps between
// sandbags go dark the way they do in daylight. Fades out with distance; the sky isn't touched
const AO = `uniform sampler2D tDepth; uniform mat4 projInv; uniform float proj11; uniform float aspect; uniform float radius;
  uniform vec2 texel; uniform float fadeFar; uniform float intensity; uniform float hazeDist;
  varying vec2 vUv;
  vec3 vpos(vec2 uv){ float d = texture2D(tDepth, uv).r; vec4 p = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
  void main(){
    float d0 = texture2D(tDepth, vUv).r;
    if (d0 >= 0.99999) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); return; }
    vec3 P = vpos(vUv);
    float dist = length(P);
    // (green: how much air lies between the eye and this point, for the sunlit haze)
    float hz = 1.0 - exp(-dist / hazeDist);
    if (-P.z > fadeFar) { gl_FragColor = vec4(1.0, hz, 0.0, 1.0); return; }
    dist = -P.z;
    vec3 px1 = vpos(vUv + vec2(texel.x, 0.0)), px0 = vpos(vUv - vec2(texel.x, 0.0));
    vec3 py1 = vpos(vUv + vec2(0.0, texel.y)), py0 = vpos(vUv - vec2(0.0, texel.y));
    vec3 dx = abs(px1.z - P.z) < abs(P.z - px0.z) ? px1 - P : P - px0;
    vec3 dy = abs(py1.z - P.z) < abs(P.z - py0.z) ? py1 - P : P - py0;
    vec3 N = normalize(cross(dx, dy));
    float rUV = min(radius * proj11 * 0.5 / dist, 0.12);
    float ang = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;
    float occ = 0.0;
    for (int i = 0; i < SAMPLES; i++) {
      float t = (float(i) + 0.5) / float(SAMPLES);
      float a = ang + float(i) * 2.39996323;
      vec3 v = vpos(vUv + vec2(cos(a) / aspect, sin(a)) * rUV * t) - P;
      float l = length(v);
      occ += max(0.0, dot(N, v) / max(l, 1e-4) - 0.12) * (1.0 - smoothstep(radius, radius * 2.2, l));
    }
    float ao = clamp(1.0 - intensity * occ / float(SAMPLES), 0.0, 1.0);
    gl_FragColor = vec4(mix(ao, 1.0, smoothstep(fadeFar * 0.55, fadeFar, dist)), hz, 0.0, 1.0);
  }`;

// the AO's noise smoothed out without bleeding across edges (a 4x4 box weighted by how close each depth is)
const AOBLUR = `uniform sampler2D tAO; uniform sampler2D tDepth; uniform vec2 aoTexel; uniform float near; uniform float far;
  varying vec2 vUv;
  float lin(float d){ return near * far / (far - d * (far - near)); }
  void main(){
    float z0 = lin(texture2D(tDepth, vUv).r), sum = 0.0, wsum = 0.0;
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
      vec2 uv = vUv + (vec2(float(x), float(y)) - 1.5) * aoTexel;
      float w = max(0.0, 1.0 - abs(lin(texture2D(tDepth, uv).r) - z0) / (z0 * 0.06 + 0.05));
      sum += texture2D(tAO, uv).r * w; wsum += w;
    }
    gl_FragColor = vec4(wsum > 0.0 ? sum / wsum : 1.0, texture2D(tAO, vUv).g, 0.0, 1.0);
  }`;

const COMPOSITE = `uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tRays; uniform float rays; uniform float blur;
  uniform float bloomStrength; uniform float exposure; uniform float vignette; uniform float grain; uniform float time;
  uniform float saturation; uniform float hurt; uniform float lowHp; uniform float aspect;
  uniform vec2 sunPos; uniform float sunVis; uniform bool useBloom;
  uniform sampler2D tAO; uniform bool useAO; uniform float aoStrength; uniform sampler2D tDepth; uniform bool vmMask;
  uniform vec3 hazeCol; uniform vec3 sunDirW; uniform mat3 camRot; uniform mat4 projInvC;
  uniform vec4 heat[8]; uniform int heatN;
  varying vec2 vUv;
  vec3 sfRRTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
  vec3 sfAces(vec3 c){
    const mat3 IN = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 OUT = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    c = IN * (c / 0.6);
    c = sfRRTFit(c);
    return clamp(OUT * c, 0.0, 1.0);
  }
  float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main(){
    vec2 uv = vUv;
    // heat haze: the picture shimmers in the hot air round jet exhausts and explosions
    vec2 hOff = vec2(0.0);
    for (int i = 0; i < 8; i++) {
      if (i >= heatN) break;
      vec4 h = heat[i];
      vec2 d = uv - h.xy; d.x *= aspect;
      float f = 1.0 - smoothstep(h.z * 0.25, h.z, length(d));
      if (f > 0.0) hOff += vec2(sin(uv.y * 170.0 + time * 13.0 + float(i) * 1.7), cos(uv.x * 150.0 - time * 11.0 + float(i))) * f * h.w;
    }
    uv += hOff * 0.0032;
    vec3 col;
    float ca = hurt * 0.006 + 0.0006;
    vec2 dir = (uv - 0.5) * ca;
    if (blur > 0.002) {
      // speed: the edges of the picture streak outward, the middle stays sharp
      vec2 c2 = uv - 0.5; c2.x *= aspect;
      vec2 st = (uv - 0.5) * blur * 0.045 * smoothstep(0.18, 0.75, length(c2));
      col = vec3(0.0);
      for (int i = 0; i < 6; i++) col += texture2D(tScene, uv - st * (float(i) / 5.0)).rgb;
      col /= 6.0;
    } else {
      col.r = texture2D(tScene, uv + dir).r;
      col.g = texture2D(tScene, uv).g;
      col.b = texture2D(tScene, uv - dir).b;
    }
    // (after the weapon in your hands is drawn the depth buffer holds only the weapon: it keeps its own shading)
    if (useAO && !(vmMask && texture2D(tDepth, uv).r < 1.0)) {
      vec2 ah = texture2D(tAO, uv).rg;
      col *= mix(1.0, ah.r, aoStrength);
      // sunlit haze: the air between you and distant ground glows toward the sun (forward scattering), a little
      // everywhere else
      vec4 vd = projInvC * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
      float mu = max(dot(normalize(camRot * (vd.xyz / vd.w)), sunDirW), 0.0);
      col += hazeCol * ah.g * (0.22 + pow(mu, 6.0) * 1.4 + pow(mu, 40.0) * 2.2);
    }
    if (useBloom) col += texture2D(tBloom, uv).rgb * bloomStrength;
    if (rays > 0.001) col += texture2D(tRays, uv).rgb * rays * vec3(1.0, 0.86, 0.66);
    // Sun glare and lens ghosts
    if (sunVis > 0.001) {
      vec2 d = uv - sunPos; d.x *= aspect;
      float r = length(d);
      col += vec3(1.0, 0.82, 0.58) * (exp(-r * 7.0) * 0.35 + exp(-r * 32.0) * 0.9) * sunVis;
      vec2 axis = vec2(0.5) - sunPos;
      for (int i = 1; i <= 4; i++) {
        float fi = float(i);
        vec2 gp = sunPos + axis * (fi * 0.48);
        vec2 gd = uv - gp; gd.x *= aspect;
        float gr = 0.018 + fi * 0.014;
        float ring = smoothstep(gr, gr * 0.55, length(gd));
        col += mix(vec3(0.35, 0.55, 1.0), vec3(1.0, 0.6, 0.3), fract(fi * 0.37)) * ring * 0.045 * sunVis;
      }
    }
    col *= exposure;
    col = sfAces(col);
    // grade: saturation, split toning, gentle contrast curve
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, saturation * (1.0 - lowHp * 0.75));
    col *= mix(vec3(0.94, 1.0, 1.05), vec3(1.05, 1.0, 0.93), smoothstep(0.05, 0.75, l));
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
    col = mix(col, col * vec3(1.35, 0.55, 0.5), lowHp * 0.35);
    vec2 q = uv - 0.5; q.x *= aspect;
    col *= 1.0 - vignette * dot(q, q) * 1.5;
    col += (rnd(uv * 913.0 + time) - 0.5) * grain;
    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <colorspace_fragment>
  }`;

function mat(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.downMat = mat(DOWN, { tSrc: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1.0 }, knee: { value: 0.6 }, prefilter: { value: false } });
    this.upMat = mat(UP, { tLow: { value: null }, tHigh: { value: null }, texel: { value: new THREE.Vector2() }, scatter: { value: 0.85 } });
    this.raysMat = mat(RAYS, { tSrc: { value: null }, sunPos: { value: new THREE.Vector2() }, aspect: { value: 1 } });
    this.compMat = mat(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, useBloom: { value: true }, tRays: { value: null }, rays: { value: 0 }, blur: { value: 0 },
      bloomStrength: { value: 0.55 }, exposure: { value: 1.05 }, vignette: { value: 0.32 }, grain: { value: 0.018 },
      time: { value: 0 }, saturation: { value: 1.08 }, hurt: { value: 0 }, lowHp: { value: 0 }, aspect: { value: 1 },
      sunPos: { value: new THREE.Vector2(-1, -1) }, sunVis: { value: 0 },
      tAO: { value: null }, useAO: { value: false }, aoStrength: { value: 0.85 }, tDepth: { value: null }, vmMask: { value: false },
      heat: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) }, heatN: { value: 0 },
      hazeCol: { value: new THREE.Vector3() }, sunDirW: { value: new THREE.Vector3(0, 1, 0) }, camRot: { value: new THREE.Matrix3() }, projInvC: { value: new THREE.Matrix4() },
    });
    this.aoBlurMat = mat(AOBLUR, { tAO: { value: null }, tDepth: { value: null }, aoTexel: { value: new THREE.Vector2() }, near: { value: 0.1 }, far: { value: 1500 } });
    this.aoMats = {};
    const gl = renderer.getContext();
    this.hdr = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'));
    this.maxSamples = renderer.capabilities.isWebGL2 ? Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0) : 0;
    this.rtScene = null;
    this.mips = [];
    this.ups = [];
    this.w = 0; this.h = 0;
    this.samples = 0;
    this.bloom = true;
    this.ao = 0;
  }

  _aoMat(n) {
    return this.aoMats[n] || (this.aoMats[n] = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: AO, defines: { SAMPLES: n }, depthTest: false, depthWrite: false,
      uniforms: { tDepth: { value: null }, projInv: { value: new THREE.Matrix4() }, proj11: { value: 1 }, aspect: { value: 1 }, radius: { value: 1.6 }, texel: { value: new THREE.Vector2() }, fadeFar: { value: 150 }, intensity: { value: 2.0 }, hazeDist: { value: 900 } },
    }));
  }

  setExposure(e) {
    this.exposureValue = e;
    this.compMat.uniforms.exposure.value = this.hdr ? e : 1.0;
  }

  configure({ samples, bloom, ao }) {
    this.samples = Math.min(samples, this.maxSamples);
    this.bloom = bloom;
    this.ao = this.renderer.capabilities.isWebGL2 ? ao || 0 : 0;
    this.w = 0; // force rebuild on next setSize
  }

  setSize(w, h) {
    if (w === this.w && h === this.h && this.rtScene) return;
    this.w = w; this.h = h;
    this.dispose();
    const type = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { type, samples: this.samples, depthBuffer: true });
    if (this.ao) {
      this.rtScene.depthTexture = new THREE.DepthTexture(w, h);
      const o = { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      this.rtAO = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), o);
      this.rtAO2 = new THREE.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1), o);
    }
    let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
    const levels = 6;
    for (let i = 0; i < levels; i++) {
      const o = { type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
      this.mips.push(new THREE.WebGLRenderTarget(mw, mh, o));
      this.ups.push(new THREE.WebGLRenderTarget(mw, mh, o));
      mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1);
      if (mw < 4 || mh < 4) break;
    }
    if (this.mips.length > 1) this.rtRays = new THREE.WebGLRenderTarget(this.mips[1].width, this.mips[1].height, { type, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.compMat.uniforms.exposure.value = this.hdr ? (this.exposureValue || 1.05) : 1.0;
    this.downMat.uniforms.threshold.value = this.hdr ? 1.0 : 0.82;
  }

  dispose() {
    if (this.rtScene) { if (this.rtScene.depthTexture) this.rtScene.depthTexture.dispose(); this.rtScene.dispose(); }
    if (this.rtAO) { this.rtAO.dispose(); this.rtAO2.dispose(); }
    this.rtAO = this.rtAO2 = null;
    if (this.rtRays) this.rtRays.dispose();
    this.rtRays = null;
    for (const t of this.mips) t.dispose();
    for (const t of this.ups) t.dispose();
    this.rtScene = null;
    this.mips = [];
    this.ups = [];
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  render(scene, camera, vm, fx) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    const cu = this.compMat.uniforms;
    cu.useAO.value = false;
    if (this.rtAO && fx.ao !== false) {
      const am = this._aoMat(this.ao), au = am.uniforms, dt = this.rtScene.depthTexture;
      au.tDepth.value = dt;
      au.projInv.value.copy(camera.projectionMatrixInverse);
      au.proj11.value = camera.projectionMatrix.elements[5];
      au.aspect.value = this.w / this.h;
      au.texel.value.set(1 / this.w, 1 / this.h);
      au.hazeDist.value = fx.hazeDist || 900;
      cu.projInvC.value.copy(camera.projectionMatrixInverse);
      cu.camRot.value.setFromMatrix4(camera.matrixWorld);
      if (fx.sunDir) cu.sunDirW.value.copy(fx.sunDir);
      if (fx.hazeCol) cu.hazeCol.value.copy(fx.hazeCol); else cu.hazeCol.value.set(0, 0, 0);
      this._pass(am, this.rtAO);
      const bu = this.aoBlurMat.uniforms;
      bu.tAO.value = this.rtAO.texture; bu.tDepth.value = dt;
      bu.aoTexel.value.set(1 / this.rtAO.width, 1 / this.rtAO.height);
      bu.near.value = camera.near; bu.far.value = camera.far;
      this._pass(this.aoBlurMat, this.rtAO2);
      cu.tAO.value = this.rtAO2.texture; cu.tDepth.value = dt; cu.useAO.value = true; cu.vmMask.value = !!vm;
    }
    if (vm) { r.setRenderTarget(this.rtScene); r.clearDepth(); r.render(vm.scene, vm.cam); }

    if (this.bloom && this.mips.length) {
      const d = this.downMat.uniforms;
      let src = this.rtScene.texture, sw = this.w, sh = this.h;
      for (let i = 0; i < this.mips.length; i++) {
        d.tSrc.value = src;
        d.texel.value.set(1 / sw, 1 / sh);
        d.prefilter.value = i === 0;
        this._pass(this.downMat, this.mips[i]);
        src = this.mips[i].texture; sw = this.mips[i].width; sh = this.mips[i].height;
      }
      const u = this.upMat.uniforms;
      let low = this.mips[this.mips.length - 1];
      for (let i = this.mips.length - 2; i >= 0; i--) {
        u.tLow.value = low.texture;
        u.tHigh.value = this.mips[i].texture;
        u.texel.value.set(1 / low.width, 1 / low.height);
        this._pass(this.upMat, this.ups[i]);
        low = this.ups[i];
      }
      cu.tBloom.value = low.texture;
      cu.useBloom.value = true;
      // sun shafts while the sun is in front of you
      const rays = fx.rays || 0;
      if (rays > 0.01 && this.rtRays) {
        const ru = this.raysMat.uniforms;
        ru.tSrc.value = this.mips[1].texture;
        ru.sunPos.value.copy(fx.sunPos);
        ru.aspect.value = this.w / this.h;
        this._pass(this.raysMat, this.rtRays);
        cu.tRays.value = this.rtRays.texture;
      }
      cu.rays.value = this.rtRays ? rays : 0;
    } else { cu.useBloom.value = false; cu.rays.value = 0; }
    cu.blur.value = fx.blur || 0;
    cu.heatN.value = fx.heatN || 0;
    if (fx.heat) for (let i = 0; i < cu.heatN.value; i++) cu.heat.value[i].copy(fx.heat[i]);

    cu.tScene.value = this.rtScene.texture;
    cu.time.value = (fx.time % 100);
    cu.hurt.value = fx.hurt;
    cu.lowHp.value = fx.lowHp;
    cu.aspect.value = this.w / this.h;
    cu.sunPos.value.copy(fx.sunPos);
    cu.sunVis.value = fx.sunVis;
    this._pass(this.compMat, null);
  }
}
