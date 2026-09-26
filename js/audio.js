// Synthesised battlefield audio (WebAudio, no sample files): weapons, explosions, UI, ambience.
import { clamp, rand, pick } from './util.js';

const SHOT = {
  rifle: { freq: 1700, dur: 0.14, body: 0.9, bodyFreq: 150, vol: 0.55, tail: 0.35 },
  smg: { freq: 2300, dur: 0.1, body: 0.6, bodyFreq: 190, vol: 0.45, tail: 0.25 },
  lmg: { freq: 1300, dur: 0.17, body: 1.1, bodyFreq: 120, vol: 0.6, tail: 0.4 },
  sniper: { freq: 1100, dur: 0.32, body: 1.4, bodyFreq: 95, vol: 0.85, tail: 0.8 },
  pistol: { freq: 2600, dur: 0.09, body: 0.5, bodyFreq: 210, vol: 0.4, tail: 0.2 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.lx = 0; this.ly = 0; this.lz = 0; this.lyaw = 0;
    this.voices = 0;
    this.engine = null;
    this.ambientOn = false;
    this.nextDistant = 2;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.25;
      this.master.connect(comp).connect(ctx.destination);
      // Shared white noise
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // Outdoor reverb tail
      this.reverb = ctx.createConvolver();
      const irLen = Math.floor(ctx.sampleRate * 2.4);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = ir.getChannelData(ch);
        for (let i = 0; i < irLen; i++) {
          const t = i / irLen;
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < 400 ? i / 400 : 1);
        }
      }
      this.reverb.buffer = ir;
      this.reverbGain = ctx.createGain();
      this.reverbGain.gain.value = 0.5;
      this.reverb.connect(this.reverbGain).connect(this.master);
      this._startWind();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(x, y, z, yaw) {
    this.lx = x; this.ly = y; this.lz = z; this.lyaw = yaw;
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  _spatial(x, y, z, maxDist) {
    const dx = x - this.lx, dy = y - this.ly, dz = z - this.lz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > maxDist) return null;
    const gain = 1 / (1 + dist * 0.045) * (1 - dist / maxDist);
    // listener right vector for yaw: (cos yaw, 0, -sin yaw)
    const rx = Math.cos(this.lyaw), rz = -Math.sin(this.lyaw);
    const pan = dist > 0.5 ? clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.85 : 0;
    return { gain, pan, dist };
  }

  _out(gain, pan, wet) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    let last = g;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      last = p;
    }
    last.connect(this.master);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      last.connect(w).connect(this.reverb);
    }
    return g;
  }

  _noise(t, dur) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.start(t, Math.random() * Math.max(0, 1.9 - dur), dur + 0.05);
    this._track(n);
    return n;
  }

  _track(node) {
    this.voices++;
    node.onended = () => { this.voices--; };
  }

  _env(t, peak, attack, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  shot(kind, x, y, z, own = false) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 700);
    if (!s) return;
    if (!own && this.voices > 60) return;
    const p = SHOT[kind] || SHOT.rifle;
    const ctx = this.ctx, t = ctx.currentTime;
    const far = clamp(s.dist / 260, 0, 1);
    const out = this._out(s.gain * p.vol * (own ? 1.1 : 1), s.pan, 0.15 + far * 0.9 + (own ? p.tail * 0.3 : 0));
    const n = this._noise(t, p.dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = p.freq * (1 - far * 0.55) * rand(0.9, 1.1); bp.Q.value = 0.8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 11000 - far * 9500;
    const env = this._env(t, 1.6, 0.002, p.dur * (1 + far));
    n.connect(bp).connect(lp).connect(env).connect(out);
    if (s.dist < 120) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(p.bodyFreq, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
      const og = this._env(t, p.body * (1 - s.dist / 120), 0.002, 0.16);
      o.connect(og).connect(out);
      o.start(t); o.stop(t + 0.2);
      this._track(o);
    }
  }

  explosion(x, y, z, size = 1) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 1200);
    if (!s) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const far = clamp(s.dist / 400, 0, 1);
    const out = this._out(clamp(s.gain * 1.6 * size, 0, 2.2), s.pan, 0.4 + far);
    const n = this._noise(t, 2.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200 * (1 - far * 0.7), t);
    lp.frequency.exponentialRampToValueAtTime(90, t + 1.8);
    const env = this._env(t, 1.8, 0.004, 1.9);
    n.connect(lp).connect(env).connect(out);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 0.8);
    const og = this._env(t, 1.8 * (1 - far * 0.6), 0.004, 0.9);
    o.connect(og).connect(out);
    o.start(t); o.stop(t + 1);
    this._track(o);
  }

  crumble(x, y, z, big = false) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 500);
    if (!s) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = big ? 3.2 : 1.1;
    const out = this._out(s.gain * (big ? 1.4 : 0.8), s.pan, 0.5);
    const n = this._noise(t, dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = big ? 500 : 900;
    const env = this._env(t, 1.2, 0.05, dur);
    n.connect(lp).connect(env).connect(out);
    // rattling debris
    for (let i = 0; i < (big ? 14 : 5); i++) {
      const tt = t + rand(0.05, dur * 0.8);
      const k = this._noise(tt, 0.08);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = rand(600, 2400); bp.Q.value = 3;
      const e = this._env(tt, rand(0.2, 0.6), 0.002, 0.08);
      k.connect(bp).connect(e).connect(out);
    }
  }

  cannon(x, y, z) {
    this.explosion(x, y, z, 0.8);
    this.shot('sniper', x, y, z);
  }

  launch(x, y, z) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 400);
    if (!s) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(s.gain * 0.9, s.pan, 0.3);
    const n = this._noise(t, 0.9);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
    const env = this._env(t, 1, 0.01, 0.8);
    n.connect(bp).connect(env).connect(out);
  }

  impact(x, y, z, metal) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 40);
    if (!s || this.voices > 50) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(s.gain * 0.35, s.pan, 0.05);
    const n = this._noise(t, 0.06);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = metal ? 3800 : 900; bp.Q.value = metal ? 6 : 1.2;
    const env = this._env(t, 1, 0.001, metal ? 0.12 : 0.05);
    n.connect(bp).connect(env).connect(out);
  }

  whiz(x, y, z) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 30);
    if (!s) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(0.5, s.pan, 0.05);
    const n = this._noise(t, 0.16);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(rand(2500, 4000), t);
    bp.frequency.exponentialRampToValueAtTime(rand(900, 1500), t + 0.15);
    const env = this._env(t, 0.9, 0.01, 0.13);
    n.connect(bp).connect(env).connect(out);
  }

  footstep(x, y, z, vol = 1) {
    if (!this.ready) return;
    const s = this._spatial(x, y, z, 30);
    if (!s || this.voices > 50) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = this._out(s.gain * 0.18 * vol, s.pan, 0);
    const n = this._noise(t, 0.07);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = rand(500, 900);
    const env = this._env(t, 1, 0.005, 0.06);
    n.connect(lp).connect(env).connect(out);
  }

  // Non-spatial UI cues
  _tone(freq, dur, type = 'square', vol = 0.15, delay = 0, freqEnd = null) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this._env(t, vol, 0.002, dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    this._track(o);
  }

  hit(head) {
    if (head) { this._tone(1900, 0.09, 'triangle', 0.22); this._tone(2600, 0.1, 'triangle', 0.16, 0.03); }
    else this._tone(1400, 0.04, 'square', 0.08);
  }
  kill() { this._tone(900, 0.06, 'triangle', 0.18); this._tone(1350, 0.09, 'triangle', 0.18, 0.06); }
  click() { this._tone(700, 0.03, 'square', 0.06); }
  empty() { this._tone(2400, 0.02, 'square', 0.05); }
  reload() {
    if (!this.ready) return;
    const ctx = this.ctx;
    [0, 0.35, 0.9].forEach((d, i) => {
      const t = ctx.currentTime + d;
      const n = this._noise(t, 0.05);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = i === 2 ? 2600 : 1800; bp.Q.value = 5;
      const e = this._env(t, 0.35, 0.001, 0.05);
      n.connect(bp).connect(e).connect(this.master);
    });
  }
  capture() { this._tone(660, 0.14, 'triangle', 0.14); this._tone(990, 0.22, 'triangle', 0.14, 0.14); }
  lost() { this._tone(520, 0.16, 'sawtooth', 0.08); this._tone(350, 0.3, 'sawtooth', 0.08, 0.16); }
  hurt() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const n = this._noise(t, 0.15);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300;
    const e = this._env(t, 0.9, 0.003, 0.14);
    n.connect(lp).connect(e).connect(this.master);
  }
  heartbeat() { this._tone(55, 0.12, 'sine', 0.35); this._tone(50, 0.14, 'sine', 0.28, 0.18); }

  _startWind() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf; n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.035;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    n.connect(bp).connect(g).connect(this.master);
    n.start(); lfo.start();
  }

  // Tank engine: one voice following the nearest tank
  setEngine(active, dist, throttle) {
    if (!this.ready) return;
    const ctx = this.ctx;
    if (!this.engine) {
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 36;
      const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 54;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const g = ctx.createGain(); g.gain.value = 0;
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      o1.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(this.master);
      o1.start(); o2.start();
      this.engine = { o1, o2, lp, g };
    }
    const e = this.engine, t = ctx.currentTime;
    const vol = active ? clamp(1 - dist / 90, 0, 1) * (0.18 + Math.abs(throttle) * 0.12) : 0;
    e.g.gain.setTargetAtTime(vol, t, 0.1);
    e.o1.frequency.setTargetAtTime(34 + Math.abs(throttle) * 22, t, 0.3);
    e.o2.frequency.setTargetAtTime(51 + Math.abs(throttle) * 30, t, 0.3);
    e.lp.frequency.setTargetAtTime(220 + Math.abs(throttle) * 260, t, 0.3);
  }

  // Distant battle ambience so the valley never feels empty
  ambient(dt) {
    if (!this.ready) return;
    this.nextDistant -= dt;
    if (this.nextDistant > 0) return;
    this.nextDistant = rand(0.6, 3.2);
    const a = Math.random() * Math.PI * 2, d = rand(350, 650);
    const x = this.lx + Math.cos(a) * d, z = this.lz + Math.sin(a) * d;
    if (Math.random() < 0.18) this.explosion(x, 0, z, 0.7);
    else {
      const kind = pick(['rifle', 'rifle', 'lmg', 'smg']);
      const n = Math.floor(rand(3, 9));
      for (let i = 0; i < n; i++) setTimeout(() => this.shot(kind, x, 0, z), i * rand(70, 110));
    }
  }
}
