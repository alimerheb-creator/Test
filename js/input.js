// Keyboard, mouse (pointer lock) and on-screen touch controls behind one action API.
const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft'],
  prone: ['KeyZ'],
  reload: ['KeyR'],
  use: ['KeyE'],
  grenade: ['KeyG'],
  melee: ['KeyV', 'KeyF'],
  spot: ['KeyQ'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  gadget: ['Digit3'],
  scoreboard: ['Tab'],
  map: ['KeyM'],
  pause: ['Escape', 'KeyP'],
};

// Touch buttons that latch on/off instead of acting while held
const TOGGLES = { ads: 'adsToggle', sprint: 'sprintToggle', map: 'mapToggle', scoreboard: 'scoreToggle' };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, wheel: 0 };
    this.locked = false;
    this.lockFailed = false;
    this.enabled = false;
    this.touchMode = false;
    this.touch = { mx: 0, my: 0, lookX: 0, lookY: 0, held: new Set(), pressed: new Set(), adsToggle: false, sprintToggle: false, mapToggle: false, scoreToggle: false };
    this.touchSens = 1;
    this.toggleButtons = {};
    this._bind();
  }

  _bind() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) {
        if (this.enabled) e.preventDefault();
      }
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this.lockFailed) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.lockFailed) { this.requestLock(); if (!this.locked) return; }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => { if (this.enabled) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
  }

  requestLock() {
    if (this.touchMode || this.locked) return;
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => { this.lockFailed = true; });
    } catch (e) {
      this.lockFailed = true;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ------------------------------------------------------------ touch
  setupTouch(root) {
    this.touchMode = true;
    root.hidden = false;
    document.body.classList.add('touch');
    const stick = root.querySelector('#stick');
    const knob = root.querySelector('#stick-knob');
    let stickId = null, sx = 0, sy = 0;
    const lookIds = new Map();
    const T = this.touch;

    stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      sx = r.left + r.width / 2; sy = r.top + r.height / 2;
      moveStick(t);
    }, { passive: false });
    const moveStick = (t) => {
      const max = 50;
      let dx = t.clientX - sx, dy = t.clientY - sy;
      const l = Math.hypot(dx, dy);
      if (l > max) { dx *= max / l; dy *= max / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      T.mx = dx / max; T.my = -dy / max;
    };
    const endStick = () => {
      stickId = null; T.mx = 0; T.my = 0; knob.style.transform = '';
      this.setToggle('sprint', false);
    };

    root.querySelectorAll('[data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      if (TOGGLES[act]) this.toggleButtons[act] = btn;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (TOGGLES[act]) this.setToggle(act, !T[TOGGLES[act]]);
        T.held.add(act); T.pressed.add(act);
        for (const t of e.changedTouches) lookIds.set(t.identifier, { x: t.clientX, y: t.clientY, btn: act });
      }, { passive: false });
    });

    const look = root.querySelector('#look-zone');
    look.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) lookIds.set(t.identifier, { x: t.clientX, y: t.clientY, btn: null });
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { moveStick(t); continue; }
        const l = lookIds.get(t.identifier);
        if (l) {
          T.lookX += (t.clientX - l.x) * 2.2 * this.touchSens;
          T.lookY += (t.clientY - l.y) * 2.2 * this.touchSens;
          l.x = t.clientX; l.y = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) endStick();
        const l = lookIds.get(t.identifier);
        if (l) {
          if (l.btn && !TOGGLES[l.btn]) T.held.delete(l.btn);
          lookIds.delete(t.identifier);
        }
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  }

  setToggle(act, on) {
    const key = TOGGLES[act];
    if (!key) return;
    this.touch[key] = on;
    const btn = this.toggleButtons[act];
    if (btn) btn.classList.toggle('on', on);
  }

  resetToggles() {
    for (const act of Object.keys(TOGGLES)) this.setToggle(act, false);
    this.touch.held.clear();
  }

  // ------------------------------------------------------------ queries
  down(action) {
    if (!this.enabled) return false;
    const T = this.touch;
    if (action === 'fire') return this.mouse.left || T.held.has('fire');
    if (action === 'ads') return this.mouse.right || T.adsToggle;
    if (action === 'sprint' && this.touchMode && (T.my > 0.92 || (T.sprintToggle && T.my > 0.3))) return true;
    if (action === 'map' && T.mapToggle) return true;
    if (action === 'scoreboard' && T.scoreToggle) return true;
    if (!TOGGLES[action] && T.held.has(action)) return true;
    const b = BINDINGS[action];
    if (!b) return false;
    for (const k of b) if (this.keys.has(k)) return true;
    return false;
  }

  pressed(action) {
    if (!this.enabled) return false;
    if (action === 'fire') return this.mouse.leftPressed || this.touch.pressed.has('fire');
    if (action === 'ads') return this.mouse.rightPressed || this.touch.pressed.has('ads');
    if (this.touch.pressed.has(action)) return true;
    const b = BINDINGS[action];
    if (!b) return false;
    for (const k of b) if (this.pressedKeys.has(k)) return true;
    return false;
  }

  // x = strafe right, y = forward
  moveAxes() {
    let x = 0, y = 0;
    if (this.down('forward')) y += 1;
    if (this.down('back')) y -= 1;
    if (this.down('right')) x += 1;
    if (this.down('left')) x -= 1;
    x += this.touch.mx; y += this.touch.my;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  lookDelta() {
    return { x: this.mouse.dx + this.touch.lookX, y: this.mouse.dy + this.touch.lookY };
  }

  wheel() { return this.mouse.wheel; }

  endFrame() {
    this.pressedKeys.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.touch.pressed.clear();
    this.touch.lookX = 0; this.touch.lookY = 0;
  }
}
