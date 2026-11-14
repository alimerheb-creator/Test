// The guns in your hands, built in code from the real guns' measurements (1.2 times life size, as the first-person
// guns always were): side profiles cut out and pushed out to their width with rounded edges, turned parts for
// barrels, muzzle devices and tubes, and the small parts (rails, pins, ports, sights, levers) that make each one
// read as the real thing.
// gunModel(kind, ctx) fills ctx.g (and the moving parts in ctx.parts) and returns the anchors the controller and
// the armory use: sightY (the sight line), muzzleY/muzzleZ, gripZ (the right hand), foreY/foreZ (the left hand),
// charge (where the left hand works the charging handle), port (a shotgun's loading port), eject (the ejection
// port), boltTravel, offset, adsZ (how far in front of the eye it sits when aiming) and coverOpen (which way a feed
// cover swings). It returns null for anything it doesn't build (the supply crate, the C-4).
import * as THREE from 'three';

// Built in real millimetres: u forward of the trigger, v up from the bore, x to the right
const S = 0.0012;             // a real millimetre in viewmodel metres
const Y0 = 0.005;             // the bore's height in the gun's frame
const UVS = 25 * S;           // the grain textures repeat every 40 mm of viewmodel: a fine grain
const P = (u, v, x = 0) => new THREE.Vector3(x * S, Y0 + v * S, -u * S);

// ---------------------------------------------------------------- shapes
// A closed outline [[u, v, r?], ...] with its corners rounded (r per corner, else R)
function fillet(pts, R = 0, segs = 3) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const r = p[2] ?? R;
    if (!(r > 0)) { out.push([p[0], p[1]]); continue; }
    const ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-6 || lb < 1e-6) { out.push([p[0], p[1]]); continue; }
    const ux = ax / la, uy = ay / la, vx = bx / lb, vy = by / lb;
    const ang = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
    if (ang > Math.PI - 1e-3) { out.push([p[0], p[1]]); continue; }
    const t = Math.min(r / Math.tan(ang / 2), la * 0.48, lb * 0.48);
    const p1 = [p[0] + ux * t, p[1] + uy * t], p2 = [p[0] + vx * t, p[1] + vy * t];
    for (let k = 0; k <= segs; k++) {
      const s = k / segs, q = 1 - s;
      out.push([q * q * p1[0] + 2 * q * s * p[0] + s * s * p2[0], q * q * p1[1] + 2 * q * s * p[1] + s * s * p2[1]]);
    }
  }
  return out;
}
const v2 = (pts) => pts.map(([a, b]) => new THREE.Vector2(a, b));
const uvScale = (geo) => { const uv = geo.attributes.uv; if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * UVS, uv.getY(i) * UVS); return geo; };

// A side profile (u, v in mm) pushed out across x, w mm wide (centred on x mm), its edges rounded off by b mm.
// holes: outlines cut right through (each may carry its own corner radius as .R)
function slab(pts, w, o = {}) {
  const { R = 1.2, b = 0.7, holes = [], x = 0, segs = 3, bs = 2 } = o;
  const sh = new THREE.Shape(v2(fillet(pts, R, segs)));
  for (const h of holes) sh.holes.push(new THREE.Path(v2(fillet(h, h.R ?? Math.min(R, 1.5), segs))));
  const bb = Math.min(b, w * 0.3), depth = Math.max(0.05, w - 2 * bb);
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bb > 0.01, bevelThickness: bb, bevelSize: bb, bevelOffset: -bb, bevelSegments: bs, curveSegments: 2, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);           // u forward (to -z), the extrusion across x
  uvScale(geo);
  geo.scale(S, S, S);
  geo.translate(x * S, Y0, 0);
  return geo;
}
// A front view (x, v in mm) pushed out along the bore from u0 to u1 (forward), edges rounded by b
function tube(pts, u0, u1, o = {}) {
  const { R = 1.2, b = 0.6, holes = [], segs = 3, bs = 2 } = o;
  const sh = new THREE.Shape(v2(fillet(pts, R, segs)));
  for (const h of holes) sh.holes.push(new THREE.Path(v2(fillet(h, h.R ?? Math.min(R, 1.5), segs))));
  const len = Math.abs(u1 - u0), bb = Math.min(b, len * 0.3), depth = Math.max(0.05, len - 2 * bb);
  const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bb > 0.01, bevelThickness: bb, bevelSize: bb, bevelOffset: -bb, bevelSegments: bs, curveSegments: 2, steps: 1 });
  // the extrusion runs along +z from -bb to len - bb: shift it to 0..len, then so it spans the front u down to the rear
  geo.translate(0, 0, bb);
  uvScale(geo);
  geo.scale(S, S, S);
  geo.translate(0, Y0, -Math.max(u0, u1) * S);
  return geo;
}
// A turned part about an axis along the bore at (x, v): profile [[r, u, smooth?], ...] in mm (corners are hard
// unless marked smooth)
function lathe(prof, o = {}) {
  const { x = 0, v = 0, seg = 24, phi0 = 0, phi = Math.PI * 2 } = o;
  const pts = [];
  for (const p of prof) { pts.push(new THREE.Vector2(p[0], p[1])); if (!p[2]) pts.push(new THREE.Vector2(p[0], p[1])); }
  const geo = new THREE.LatheGeometry(pts, seg, phi0, phi);
  // uvs in mm round and along, for the grain
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) { const px = pos.getX(i), pz = pos.getZ(i), r = Math.hypot(px, pz); uv.setXY(i, Math.atan2(pz, px) * Math.max(r, 1) * UVS, pos.getY(i) * UVS); }
  geo.rotateX(-Math.PI / 2);          // the lathe's axis (y = u) along the bore, forward to -z
  geo.scale(S, S, S);
  geo.translate(x * S, Y0 + v * S, 0);
  return geo;
}
// A rounded block: su long (along u), sv tall, sx wide, centred on (u, v, x)
function block(su, sv, sx, u, v, x = 0, o = {}) {
  const r = o.R ?? Math.min(1.2, su * 0.3, sv * 0.3);
  return slab([[u - su / 2, v - sv / 2], [u + su / 2, v - sv / 2], [u + su / 2, v + sv / 2], [u - su / 2, v + sv / 2]], sx, { R: r, b: o.b ?? Math.min(0.6, sx * 0.25), x, bs: 1, segs: 2 });
}
// A pin or button across the gun (along x): radius r, length len, centred on (u, v, x)
function pin(r, len, u, v, x = 0, seg = 12) {
  const geo = new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
  uvScale(geo);
  geo.scale(S, S, S);
  geo.translate(x * S, Y0 + v * S, -u * S);
  return geo;
}
// Into a moving part's own frame
function local(geo, part) {
  const b = part.userData.base;
  geo.translate(-b.x, -b.y, -b.z);
  if (part.userData.rx) geo.rotateX(-part.userData.rx);
  return geo;
}
// A part built upright about its base (the part's own tilt, rx, then leans it): only moved to the base
function upright(geo, part) {
  const b = part.userData.base;
  return geo.translate(-b.x, -b.y, -b.z);
}
// A cylinder standing up (along v) on its base at (u, v, x)
function post(r, h, u, v, x = 0, seg = 14, r1 = r) {
  const geo = new THREE.CylinderGeometry(r1, r, h, seg);
  uvScale(geo);
  geo.translate(0, h / 2, 0);
  geo.scale(S, S, S);
  geo.translate(x * S, Y0 + v * S, -u * S);
  return geo;
}

// ---------------------------------------------------------------- parts shared by several guns
// A length of Picatinny rail along the top at height v0 (its base), from u1 (front) back to u0: the base and the
// toothed top, slots every 10 mm
function picatinny(add, mat, u0, u1, v0, o = {}) {
  const w = o.w ?? 21, h = o.h ?? 9;
  add(block(u1 - u0, h * 0.55, w * 0.74, (u0 + u1) / 2, v0 + h * 0.28, o.x ?? 0), mat);
  const pts = [[u0, v0 + h * 0.45], [u1, v0 + h * 0.45]];
  const teeth = [];
  for (let u = u1 - 2.5; u > u0 + 2; u -= 10.0) teeth.push(u);
  pts.push([u1, v0 + h, 0.5]);
  for (const t of teeth) { pts.push([t, v0 + h, 0.4], [t, v0 + h * 0.66, 0.3], [t - 5.2, v0 + h * 0.66, 0.3], [t - 5.2, v0 + h, 0.4]); }
  pts.push([u0, v0 + h, 0.5]);
  add(slab(pts, w, { R: 0, b: 0.6, x: o.x ?? 0, bs: 1 }), mat);
}
// A cartridge lying along the bore with its base at u (case l mm, bullet bl mm, radius r)
function cartridge(add, M, u, v, x, r, l, bl) {
  add(lathe([[0, u], [r * 1.05, u], [r * 1.05, u + 1.2], [r * 0.85, u + 1.5], [r * 0.85, u + 2.6], [r, u + 3], [r, u + l * 0.82], [r * 0.62, u + l * 0.9], [r * 0.62, u + l]], { x, v, seg: 14 }), M.brass);
  add(lathe([[r * 0.6, u + l], [r * 0.6, u + l + bl * 0.45, true], [r * 0.38, u + l + bl * 0.8, true], [0, u + l + bl, true]], { x, v, seg: 14 }), M.copper);
}
// A red-dot sight (an Aimpoint): its tube from u0 (the eye's end) to u1 round the sight line at v, open at the back
// (the window you look through) with the glass inside the front, the adjuster caps on top and on the right, flip-up
// lens caps standing open, on a mount down to the rail's top at vr. r: the window's radius
function redDot(add, M, u0, u1, v, vr, r = 10) {
  const R = r + 3.6;
  add(lathe([[r, u0], [R - 0.8, u0], [R, u0 + 1.4, true], [R, u1 - 1.4, true], [R - 0.8, u1], [r, u1], [r, u0]], { v, seg: 30 }), M.poly);
  add(lathe([[R + 0.4, u0 + 3], [R + 0.4, u0 + 10]], { v, seg: 30 }), M.rubber);
  add(lathe([[0, u1 - 5], [r, u1 - 5]], { v, seg: 24 }), M.lens);
  const um = (u0 + u1) / 2;
  add(post(R * 0.42, R * 0.55, um, v + R * 0.78, 0, 14), M.poly);
  add(pin(R * 0.42, R * 0.55, um, v, R * 0.78 + R * 0.27, 14), M.poly);
  // the mount: a riser block from the rail up to the tube, its clamp and knob on the left
  const vb = v - R + 1;
  add(slab([[u0 + 6, vr], [u1 - 6, vr], [u1 - 9, vb, 2], [u0 + 9, vb, 2]], R * 1.3, { R: 2, b: 1.5 }), M.metal);
  add(block(u1 - u0 - 16, 7, 4, um, vr + 4, -R * 0.75), M.metal);
  add(pin(4, 6, um, vr + 4, -R * 0.75 - 4, 12), M.metal);
  // the front lens cap flipped up
  add(slab([[u1 + 2, v + R - 2], [u1 + 5, v + R - 2], [u1 + 5, v + R + 14], [u1 + 2, v + R + 14]], R * 1.6, { R: 2, b: 0.8 }), M.rubber);
}

// ---------------------------------------------------------------- the M4A1 carbine (M4K): Magpul-style furniture in
// flat dark earth (handguard, grip, stock, magazine), a front sight base with its post and ears, an A2 flash hider,
// a holographic sight on the flat-top's rail and a folded rear sight behind it
function carbine(ctx, o = {}) {
  const { M, parts, part } = ctx;
  const add = ctx.add;
  // a moving part (or, o.fixed, the same piece held still: the launcher's carbine has nothing to reload)
  const mk = (role, b, rx = 0) => {
    if (!o.fixed) return part(ctx.g, parts, role, b.x, b.y, b.z, rx);
    const grp = new THREE.Group(); grp.position.copy(b); grp.rotation.x = rx;
    grp.userData.base = b.clone(); grp.userData.rx = rx; ctx.g.add(grp);
    return grp;
  };
  // ---- upper receiver
  add(slab([[-114, -21], [117, -21], [120, -17, 1], [120, 18, 1], [-110, 18, 1], [-114, 12, 1]], 30, { R: 1.5, b: 1.6 }), M.metal);
  picatinny(add, M.metal, -112, 116, 18);
  // ejection port with the bolt carrier inside, the dust cover hanging open below it, the brass deflector behind it
  add(block(62, 21, 2, 43, 3, 14.4), M.dark);
  add(block(56, 12, 2, 43, 4, 13.8), M.metal);
  add(slab([[74, -12], [10, -12], [10, -14.5], [74, -14.5]], 1.4, { x: 16.5, R: 0.4, b: 0.3 }), M.metal);
  add(slab([[74, -14.5], [10, -14.5], [12, -30], [72, -30]], 1.2, { x: 18.5, R: 1, b: 0.3 }), M.metal);
  add(slab([[8, -4], [-24, -4], [-24, 15], [-6, 15], [8, 6]], 7, { x: 15.5, R: 2.5, b: 1.5 }), M.metal);
  // forward assist housing and plunger
  add(lathe([[7.2, -98], [7.2, -58], [5.5, -50]], { x: 15, v: 9, seg: 16 }), M.metal);
  add(lathe([[0, -110], [7.8, -110], [7.8, -98]], { x: 15, v: 9, seg: 16 }), M.metal);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(block(11, 1.3, 1.3, -104, 9 + Math.sin(a) * 7.7, 15 + Math.cos(a) * 7.7), M.metal); }
  // ---- lower receiver: the body, the flared magwell, the trigger guard, the buffer tower
  add(slab([[118, -20], [118, -40], [112, -48], [36, -48], [36, -46], [-20, -46], [-60, -46], [-104, -40], [-114, -26], [-116, -20]], 23, { R: 2, b: 1.5 }), M.metal);
  add(slab([[118, -32], [117, -70], [121, -76, 1.5], [116, -79, 1], [38, -79, 1], [33, -76, 1.5], [37, -70], [38, -32]], 29, { R: 1.5, b: 1.4 }), M.metal);
  add(slab([[36, -44], [36, -61], [31, -66, 3], [-19, -66, 3], [-25, -60], [-25, -44]], 11, { R: 1.5, b: 1.2, holes: [[[31, -47], [31, -59.5], [-19, -59.5], [-19, -47]]] }), M.metal);
  add(slab([[4, -45], [7, -53, 2], [4, -60, 2], [0, -61], [2, -55, 2], [-1, -48], [-1, -45]], 5.5, { R: 0.6, b: 0.6 }), M.dark);
  add(slab([[-104, -41], [-116, -27], [-120, 13], [-104, 13]], 25, { R: 2, b: 1.6 }), M.metal);
  // pins, the magazine catch and its fence, the bolt catch, the selector
  for (const [u, v] of [[112, -28], [-96, -30], [-2, -36], [-24, -38]]) add(pin(u > 100 || u < -90 ? 3.4 : 2.6, 25, u, v), M.dark);
  add(pin(5.2, 4, 44, -38, 13.5, 14), M.metal);
  add(slab([[54, -30], [34, -30], [34, -44], [54, -44]], 3, { x: 12.8, R: 3, b: 0.8 }), M.metal);
  add(slab([[72, -24], [52, -26], [50, -36], [70, -36]], 3, { x: -12.5, R: 2, b: 0.8 }), M.metal);
  add(slab([[-32, -33], [-50, -30], [-56, -36], [-34, -40]], 3.5, { x: -12.8, R: 2, b: 0.8 }), M.metal);
  add(pin(4.5, 3, -36, -36, -12.6, 14), M.metal);
  // ---- buffer tube, castle nut, end plate with its sling socket
  add(lathe([[14.6, -300], [14.6, -126]], { v: -1, seg: 22 }), M.metal);
  add(lathe([[17.5, -128], [17.5, -118]], { v: -1, seg: 10 }), M.metal);
  add(slab([[-117, -24], [-128, -24], [-128, 20], [-117, 20]], 27, { R: 3, b: 1 }), M.metal);
  // ---- stock (collapsible, its body around the tube, a sling slot, the rubber butt pad)
  add(slab([[-166, 17], [-282, 21, 4], [-286, -88, 4], [-276, -92, 3], [-246, -70], [-206, -40], [-168, -20, 6]], 38,
    { R: 5, b: 3, holes: [Object.assign([[-232, -16], [-268, -14], [-271, -62], [-254, -68], [-232, -40]], { R: 6 })] }), M.fde);
  add(slab([[-206, 18], [-262, 20], [-262, 25, 3], [-206, 23, 3]], 32, { R: 2, b: 2 }), M.fde);
  add(slab([[-282, 23], [-293, 24], [-296, -91], [-285, -94]], 42, { R: 3, b: 2.5 }), M.rubber);
  add(slab([[-172, -21], [-206, -42], [-210, -36], [-178, -15]], 14, { x: 0, R: 2, b: 1 }), M.fde);
  // ---- pistol grip (raked back, a finger bump, flat bottom with its storage cap)
  add(slab([[-16, -44], [-21, -64], [-25, -74, 5], [-22, -84, 4], [-30, -100], [-38, -122], [-45, -138, 4], [-56, -144, 3], [-78, -144, 3], [-82, -136, 4], [-74, -110], [-64, -78], [-60, -56], [-58, -44]], 30, { R: 3, b: 3.5 }), M.fde);
  // ---- handguard: delta ring and slip ring, the slotted carbine handguard, its cap at the front sight base
  add(lathe([[22, 116], [26.5, 117], [26.5, 124], [24, 128]], { seg: 28 }), M.metal);
  add(slab([[128, -26], [296, -24], [298, -22, 2], [298, 26, 2], [296, 28], [128, 30], [125, 27, 2], [125, -23, 2]], 50,
    { R: 3, b: 9, bs: 3, holes: [146, 189, 232].map((u) => Object.assign([[u, -5], [u + 32, -5], [u + 32, 9], [u, 9]], { R: 6.5 })) }), M.fde);
  add(lathe([[19, 296], [19, 302]], { seg: 22 }), M.metal);
  // ---- barrel, front sight base (the A-frame, the ears and the post), bayonet lug, sling swivel
  add(lathe([[8, 124], [8, 298], [9.5, 298], [9.5, 336], [7.4, 336], [7.4, 352], [6.6, 354], [6.6, 362], [7.4, 364], [7.4, 440]], { seg: 20 }), M.metal);
  add(slab([[300, -16], [336, -16], [336, 14], [328, 46, 2], [306, 46, 2], [300, 14]], 17, { R: 2.5, b: 2 }), M.metal);
  for (const sx of [-1, 1]) add(slab([[307, 40], [329, 40], [327, 58, 3], [313, 61, 3]], 3.4, { x: sx * 7.2, R: 1.5, b: 0.8 }), M.metal);
  add(slab([[319, 44], [322, 44], [321.8, 57.5], [319.2, 57.5]], 2.4, { R: 0.3, b: 0.3 }), M.dark);
  add(slab([[316, -15], [338, -15], [338, -25], [316, -25]], 9, { R: 2, b: 1 }), M.metal);
  add(slab([[302, -14], [314, -14], [314, -30], [302, -30]], 4, { R: 4, b: 0.8, holes: [[[305, -18], [311, -18], [311, -27], [305, -27]]] }), M.metal);
  // ---- A2 flash hider: collar, the prongs round the top and sides (closed underneath), the front ring
  add(lathe([[7.5, 438], [11, 440], [11, 452], [10, 452]], { seg: 20 }), M.metal);
  add(lathe([[10, 474], [11, 475], [11, 481], [8, 482], [6, 482]], { seg: 20 }), M.metal);
  add(lathe([[6, 450], [6, 482]], { seg: 14 }), M.dark);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6, r = 9.6;
    const g = block(23, 4.6, 3.6, 463, 0, 0, { R: 1 });
    g.translate(0, -Y0, 0); g.rotateZ(a - Math.PI / 2); g.translate(Math.cos(a) * r * S, Y0 + Math.sin(a) * r * S, 0);
    add(g, M.metal);
  }
  add(lathe([[10.2, 452], [10.2, 474]], { seg: 14, phi0: Math.PI * 1.15, phi: Math.PI * 0.7 }), M.metal);
  // ---- holographic sight at the back of the rail: its base and clamp, the hood round the window (thin walls, a
  // wide window), the glass, the buttons
  add(slab([[-8, 27], [-100, 27], [-100, 41, 3], [-8, 41, 3]], 34, { R: 2, b: 2 }), M.poly);
  add(tube([[-22, 41], [22, 41], [23, 84, 5], [-23, 84, 5]], -92, -26, { R: 3, b: 1.5, holes: [Object.assign([[-19, 50], [19, 50], [19, 80], [-19, 80]], { R: 2.5 })] }), M.poly);
  add(slab([[-14, 41], [-28, 41], [-28, 50], [-18, 50]], 34, { R: 2, b: 1.5 }), M.poly);
  add(block(30, 10, 3, -60, 35, -18), M.metal);
  add(pin(3.5, 6, -60, 35, -21.5, 10), M.metal);
  for (const sx of [-1, 1]) add(block(8, 5, 7, -96, 45, sx * 9), M.rubber);
  add(block(3, 31, 39, -28, 65, 0, { R: 1 }), M.lens);
  // ---- folded front flip-up sight's twin, the rear sight, in front of the holographic sight
  add(slab([[22, 27], [0, 27], [0, 36, 2], [18, 36, 2]], 22, { R: 1.5, b: 1.2 }), M.poly);
  add(slab([[16, 36], [2, 36], [2, 39, 1.5], [14, 39, 1.5]], 16, { R: 1, b: 0.8 }), M.metal);
  // ---- the magazine (a 30-round polymer magazine, curved, ribbed at the bottom, a round showing at the top)
  const mag = mk('mag', P(78, -72), 0.18);
  const am = (geo, mat) => { local(geo, mag); ctx.addTo(mag, geo, mat); };
  am(slab([[104, -30], [109, -96], [116, -150], [126, -186], [131, -196, 2], [133, -204, 2], [69, -206, 2], [67, -199, 2], [60, -186], [50, -150], [44, -96], [42, -30]], 24.5, { R: 2, b: 2.2 }), M.fde);
  for (let i = 0; i < 5; i++) {
    const v = -150 - i * 9, f = (v + 150) / -56;
    const uf = 116 + f * 13.5, ur = 50 + f * 13.5;
    am(slab([[uf + 1.4, v], [ur - 1.4, v], [ur - 1.4, v - 3.4], [uf + 1.4, v - 3.4]], 26, { R: 1.2, b: 0.8 }), M.fde);
  }
  am(slab([[126, -199], [70, -201], [68, -212, 2], [134, -210, 2]], 28, { R: 2, b: 2 }), M.fde);
  am(slab([[101, -32], [99, -28], [47, -28], [45, -32]], 20, { R: 1, b: 0.6 }), M.poly);
  cartridge(am, M, 50, -22, 0, 4.8, 44.7, 12.7);
  // ---- the charging handle at the rear of the upper (it is pulled back to charge)
  const ch = mk('bolt', P(-116, 16));
  const ac = (geo, mat) => { local(geo, ch); ctx.addTo(ch, geo, mat); };
  ac(slab([[-108, 13], [-122, 13], [-124, 20, 2], [-108, 20]], 46, { R: 2, b: 1.5 }), M.metal);
  ac(block(10, 5, 7, -121, 22, -20), M.metal);
  return {
    sightY: Y0 + 65 * S, muzzleY: Y0, muzzleZ: -482 * S, gripZ: 0.075, foreZ: -232 * S, foreY: -0.038,
    offset: new THREE.Vector3(0, 0, -0.02), adsZ: -0.26, charge: P(-121, 18, -22), boltTravel: 0.072, eject: [16 * S, Y0 + 4 * S, -40 * S],
  };
}

// ---------------------------------------------------------------- the MP7A1 (VX-9 PDW): the compact polymer receiver
// with a rail along its whole top, the magazine up in the pistol grip, the folding foregrip let down, the stock
// pulled out on its two rods, a small red dot
function pdw(ctx) {
  const { M, parts, part, add } = ctx;
  add(slab([[150, -16], [153, 4, 3], [147, 13, 3], [-158, 13, 3], [-167, 5, 3], [-167, -24, 4], [-86, -30], [34, -30], [116, -27], [146, -22, 3]], 46, { R: 3, b: 4.5, bs: 3 }), M.poly);
  picatinny(add, M.metal, -152, 142, 13);
  // the grooves along its sides, the short rail at the front right, the ejection port above the grip
  for (const sx of [-1, 1]) { add(block(96, 3, 1.4, 70, -4, sx * 23.2), M.dark); add(block(70, 3, 1.4, 64, -13, sx * 23.0), M.dark); }
  add(block(58, 9, 6, 96, -8, 24.5), M.metal);
  for (let u = 70; u < 124; u += 8) add(block(4, 9.5, 2, u, -8, 27.6), M.metal);
  add(block(44, 13, 2, -18, 2, 22.6), M.dark);
  add(block(38, 7, 2, -18, 2, 22.1), M.metal);
  // trigger guard, trigger, the selector levers on both sides
  add(slab([[36, -28], [36, -48, 6], [26, -60, 8], [-14, -60, 6], [-24, -48], [-24, -28]], 15, { R: 2, b: 2,
    holes: [[[29, -31], [28, -48, 6], [19, -54, 5], [-12, -54, 4], [-17, -46], [-17, -31]]] }), M.poly);
  add(slab([[6, -30], [9, -40, 3], [6, -48, 3], [2, -49], [3, -42, 2], [0, -32]], 6, { R: 0.5, b: 0.5 }), M.dark);
  for (const sx of [-1, 1]) add(slab([[-50, -12], [-68, -10], [-74, -20, 3], [-54, -22, 3]], 3, { x: sx * 24, R: 2, b: 0.8 }), M.metal);
  add(pin(4, 50, -60, -16, 0, 12), M.metal);
  // the pistol grip (raked, a palm swell: the magazine goes up inside it)
  add(slab([[-22, -28], [-25, -46, 4], [-31, -60, 6], [-29, -72, 5], [-38, -94], [-46, -116, 4], [-104, -112, 4], [-100, -90], [-90, -62], [-84, -40], [-82, -28]], 33, { R: 3, b: 4.5, bs: 3 }), M.poly);
  // the folding foregrip let down under the nose
  add(slab([[110, -24], [134, -24], [132, -40, 3], [137, -94, 6], [116, -100, 6], [111, -40, 3]], 23, { R: 3, b: 4, bs: 3 }), M.poly);
  add(pin(5, 30, 122, -28, 0, 12), M.metal);
  for (let i = 0; i < 5; i++) add(block(20, 1.6, 23.6, 124 + i * 0.8, -48 - i * 10, 0), M.rubber);
  // the barrel and its muzzle device
  add(lathe([[7, 140], [7, 172], [9.5, 172], [9.5, 194], [6.5, 194]], { seg: 18 }), M.metal);
  add(lathe([[4.5, 172], [4.5, 194.2]], { seg: 12 }), M.dark);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; add(block(12, 2, 2, 184, Math.sin(a) * 9.6, Math.cos(a) * 9.6), M.dark); }
  // flip-up sights folded down at both ends of the rail
  add(slab([[124, 22], [142, 22], [142, 29, 2], [128, 29, 2]], 18, { R: 1.5, b: 1 }), M.metal);
  add(slab([[-128, 22], [-150, 22], [-150, 30, 2], [-132, 30, 2]], 20, { R: 1.5, b: 1 }), M.metal);
  // the stock pulled out: its two rods, the butt plate and its pad
  for (const sx of [-1, 1]) add(lathe([[4.2, -392], [4.2, -160]], { x: sx * 15.5, v: -6, seg: 12 }), M.metal);
  add(slab([[-386, 14], [-400, 14], [-403, -72, 5], [-389, -74, 5]], 46, { R: 4, b: 3.5 }), M.poly);
  add(slab([[-400, 13], [-407, 13], [-410, -71, 3], [-403, -73, 3]], 43, { R: 3, b: 2.5 }), M.rubber);
  add(block(16, 22, 42, -392, 2, 0), M.poly);
  // a small red dot near the back of the rail
  redDot(add, M, -118, -58, 60, 22, 10);
  // the magazine up in the grip (a 40-round one: it shows below), its base plate, the top round
  const mag = part(ctx.g, parts, 'mag', P(-72, -114).x, P(-72, -114).y, P(-72, -114).z, -0.29);
  const am = (geo, mat) => { upright(geo, mag); ctx.addTo(mag, geo, mat); };
  am(slab([[-59, -34], [-59, -186], [-85, -186], [-85, -34]], 19, { R: 2, b: 1.6 }), M.poly);
  am(slab([[-56, -186], [-56, -194, 2], [-89, -194, 2], [-88, -186]], 24, { R: 2, b: 2 }), M.poly);
  for (let i = 0; i < 3; i++) am(block(28, 2, 20.5, -72, -150 - i * 10), M.poly);
  cartridge(am, M, -84, -30, 0, 4, 24, 8);
  // the charging handle's wings behind the rail
  const ch = part(ctx.g, parts, 'bolt', P(-166, 7).x, P(-166, 7).y, P(-166, 7).z);
  const ac = (geo, mat) => { local(geo, ch); ctx.addTo(ch, geo, mat); };
  ac(slab([[-160, 3], [-172, 3], [-174, 11, 2], [-160, 11]], 50, { R: 2, b: 1.5 }), M.metal);
  ac(block(9, 5, 7, -169, 13, -21), M.metal);
  return {
    sightY: Y0 + 60 * S, muzzleY: Y0, muzzleZ: -194 * S, gripZ: 0.072, foreZ: -124 * S, foreY: -0.05,
    offset: new THREE.Vector3(0, 0, 0.02), adsZ: -0.26, charge: P(-170, 9, -25), boltTravel: 0.055, eject: [24 * S, Y0 + 2 * S, 18 * S],
  };
}

// ---------------------------------------------------------------- the M249 SAW (KR-250 LMG): the steel receiver, the
// feed cover hinged at its front with a red dot on its rail, the belt rising from a pouch into it on the left, the
// carry handle and heat shield on the barrel, the polymer handguard with the bipod folded back under it
function saw(ctx) {
  const { M, parts, part, add } = ctx;
  add(slab([[250, -50], [250, 30, 3], [242, 34, 2], [-126, 34, 2], [-135, 26, 3], [-135, -40, 3], [-118, -56, 3], [36, -58], [200, -58], [244, -56, 3]], 62, { R: 3, b: 2.5 }), M.metal);
  for (const sx of [-1, 1]) for (const [u, v] of [[200, -40], [150, -40], [-60, -40], [-110, -40], [200, 10], [-110, 10]]) add(pin(2.6, 1.6, u, v, sx * 31.4, 10), M.dark);
  add(block(170, 6, 64, 70, 31), M.dark);
  // the magazine well on the left (its dust cover shut) and the belt rising from the pouch into the feed tray
  add(slab([[192, -6], [130, -6], [128, -46, 3], [194, -46, 3]], 20, { x: -40, R: 3, b: 2 }), M.metal);
  add(slab([[190, -48], [132, -48], [132, -52], [190, -52]], 22, { x: -42, R: 1, b: 0.6 }), M.metal);
  for (let i = 0; i < 6; i++) {
    const v = -52 + i * 12.5, x = -38 - Math.max(0, 3 - i) * 3.5;
    cartridge(add, M, 66, v, x, 4.8, 44.7, 12.7);
    add(block(14, 11, 11, 88, v, x), M.dark);
  }
  // trigger guard, trigger, pistol grip
  add(slab([[32, -55], [32, -80, 4], [24, -90, 6], [-24, -90, 5], [-32, -80], [-32, -55]], 16, { R: 2, b: 1.6, holes: [[[26, -58], [24, -80, 4], [17, -84, 4], [-20, -84, 4], [-26, -76], [-26, -58]]] }), M.metal);
  add(slab([[6, -56], [9, -66, 3], [6, -76, 3], [2, -77], [3, -70, 2], [0, -58]], 6, { R: 0.5, b: 0.5 }), M.dark);
  add(slab([[-26, -56], [-30, -78], [-34, -96, 6], [-44, -150, 5], [-82, -150, 5], [-76, -112], [-70, -80], [-68, -56]], 32, { R: 3, b: 4, bs: 3 }), M.poly);
  // the stock (hollow polymer with a sling slot), its butt pad, the latch where it meets the receiver
  add(slab([[-134, 28], [-396, 24], [-418, 30, 6], [-424, -108, 6], [-402, -112, 4], [-262, -76], [-150, -52], [-134, -44]], 46,
    { R: 4, b: 4, bs: 3, holes: [Object.assign([[-330, -30], [-388, -30], [-392, -80], [-344, -66]], { R: 8 })] }), M.poly);
  add(slab([[-418, 32], [-430, 32], [-434, -110, 5], [-422, -112, 5]], 50, { R: 3, b: 3 }), M.rubber);
  add(block(12, 60, 50, -138, -8, 0), M.metal);
  // the barrel (thicker at the chamber), the heat shield over it, the carry handle, the gas tube and block under it,
  // the polymer handguard, the bipod folded back under it, the front sight, the flash hider
  add(lathe([[15, 248], [15, 272], [11.5, 276], [11.5, 578]], { seg: 22 }), M.metal);
  add(lathe([[16.5, 282], [16.5, 468]], { seg: 16, phi0: Math.PI * 0.08, phi: Math.PI * 0.84 }), M.metal);
  for (let u = 300; u < 460; u += 22) add(block(12, 2, 30, u, 16.6), M.dark);
  add(lathe([[16, 352], [16, 398]], { seg: 20 }), M.poly);
  add(slab([[332, 14], [420, 14], [412, 60, 12], [340, 60, 12]], 18, { R: 4, b: 3, holes: [Object.assign([[350, 22], [404, 22], [398, 48], [356, 48]], { R: 8 })] }), M.poly);
  add(lathe([[7, 250], [7, 504]], { v: -27, seg: 12 }), M.metal);
  add(slab([[496, -12], [536, -12], [536, -42, 4], [496, -42, 4]], 26, { R: 4, b: 3 }), M.metal);
  add(slab([[252, -14], [446, -14], [452, -24, 4], [452, -50, 6], [440, -60, 6], [262, -60], [252, -52]], 58, { R: 4, b: 6, bs: 3 }), M.poly);
  for (let u = 280; u < 430; u += 26) for (const sx of [-1, 1]) add(block(16, 22, 1.2, u, -38, sx * 29.4), M.dark);
  for (const sx of [-1, 1]) { add(lathe([[5, 296], [5, 508]], { x: sx * 14, v: -66, seg: 10 }), M.metal); add(block(18, 9, 9, 290, -66, sx * 14), M.rubber); }
  add(block(30, 14, 40, 512, -56), M.metal);
  add(lathe([[13, 536], [13, 556]], { seg: 18 }), M.metal);
  add(slab([[540, 10], [552, 10], [550, 50, 1], [542, 50, 1]], 4, { R: 1, b: 0.8 }), M.metal);
  add(lathe([[8, 576], [12, 580], [12, 626], [7, 628]], { seg: 18 }), M.metal);
  add(lathe([[6, 586], [6, 628.2]], { seg: 12 }), M.dark);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(block(26, 2.4, 2.4, 606, Math.sin(a) * 12.2, Math.cos(a) * 12.2), M.dark); }
  // the feed cover (hinged at its front: it swings up to load), its rail and the red dot on it
  const cv = part(ctx.g, parts, 'cover', P(170, 34).x, P(170, 34).y, P(170, 34).z);
  const ac = (geo, mat) => { local(geo, cv); ctx.addTo(cv, geo, mat); };
  ac(slab([[170, 28], [170, 46, 4], [162, 52, 3], [-40, 52, 3], [-48, 44, 3], [-48, 28]], 66, { R: 3, b: 3 }), M.metal);
  picatinny(ac, M.metal, -40, 150, 52);
  ac(block(10, 10, 44, -52, 38), M.metal);
  redDot(ac, M, -30, 52, 98, 61, 15);
  // the charging handle on the right
  const bolt = part(ctx.g, parts, 'bolt', P(72, -20, 34).x, P(72, -20, 34).y, P(72, -20, 34).z);
  const abt = (geo, mat) => { local(geo, bolt); ctx.addTo(bolt, geo, mat); };
  abt(block(34, 9, 6, 72, -20, 34), M.metal);
  abt(slab([[58, -26], [66, -26], [66, -12], [58, -12]], 14, { x: 41, R: 2, b: 1 }), M.metal);
  // the belt pouch under the receiver (it comes off to reload)
  const mag = part(ctx.g, parts, 'mag', P(104, -58).x, P(104, -58).y, P(104, -58).z);
  const am = (geo, mat) => { local(geo, mag); ctx.addTo(mag, geo, mat); };
  am(slab([[40, -56], [168, -56], [172, -66, 8], [170, -176, 10], [42, -178, 10], [38, -66, 8]], 94, { R: 6, b: 9, bs: 3 }), M.olive);
  am(slab([[42, -58], [166, -58], [166, -84, 6], [42, -84, 6]], 97, { R: 5, b: 4 }), M.olive);
  for (const sx of [-1, 1]) for (const v of [-108, -132, -156]) am(block(110, 7, 1.6, 104, v, sx * 47.6), M.olive);
  am(block(60, 4, 4, 104, -84, -49), M.dark);
  return {
    sightY: Y0 + 98 * S, muzzleY: Y0, muzzleZ: -628 * S, gripZ: 0.066, foreZ: -350 * S, foreY: -0.05,
    offset: new THREE.Vector3(0.01, 0, -0.06), adsZ: -0.16, charge: P(62, -19, 48), boltTravel: 0.1,
    eject: [0, Y0 - 60 * S, -10 * S], coverOpen: -1.1,
  };
}

// ---------------------------------------------------------------- the AWM (SR-338 bolt): the green thumbhole stock
// with its raised cheek piece, the steel action on top, the bolt with its big knob, the 5-round magazine, the long
// fluted barrel with its muzzle brake, a big scope in two rings, the bipod folded under the fore-end
function awm(ctx) {
  const { M, parts, part, add } = ctx;
  add(slab([[340, -14], [342, -40, 6], [336, -62, 8], [120, -64], [44, -64], [36, -70], [28, -92, 6], [16, -98, 6], [-22, -98, 5], [-28, -86],
    [-34, -100], [-46, -146, 6], [-58, -154, 6], [-92, -150, 6], [-96, -136], [-86, -104], [-110, -100], [-300, -104], [-420, -128, 8],
    [-440, -128, 6], [-444, 26, 8], [-430, 28, 6], [-210, 22, 6], [-110, 14], [-90, -12], [120, -14]], 56,
    { R: 3, b: 4, bs: 3, holes: [
      Object.assign([[-104, -28], [-196, -24], [-206, -60], [-196, -88], [-112, -90], [-100, -66]], { R: 10 }),
      Object.assign([[24, -68], [20, -90], [-18, -90], [-22, -72]], { R: 4 }),
    ] }), M.olive);
  // the trigger, the raised cheek piece on its posts, the butt pad and its spacers, the monopod folded under the butt
  add(slab([[4, -66], [7, -76, 3], [4, -86, 3], [0, -87], [1, -80, 2], [-2, -68]], 6, { R: 0.5, b: 0.5 }), M.dark);
  add(slab([[-218, 24], [-404, 28], [-406, 38, 6], [-226, 36, 6]], 40, { R: 4, b: 4 }), M.olive);
  for (const u of [-250, -380]) add(post(4, 8, u, 19, 0, 10), M.metal);
  add(slab([[-444, 28], [-454, 28], [-458, -130, 6], [-448, -132, 6]], 58, { R: 3, b: 3 }), M.rubber);
  add(block(8, 150, 54, -440, -50, 0), M.metal);
  add(lathe([[7, -400], [7, -330]], { v: -128, seg: 10 }), M.metal);
  // the action: the receiver round the bolt, its rail, the bolt shroud at the back, the magazine release, the port
  add(lathe([[19, -96], [19, 178], [16, 186]], { seg: 26 }), M.metal);
  add(block(272, 12, 30, 44, -12, 0), M.metal);
  picatinny(add, M.metal, -86, 174, 18);
  add(lathe([[14, -122], [16, -112], [16, -96]], { seg: 20 }), M.metal);
  add(block(26, 14, 8, 74, -66, -24), M.metal);
  add(block(60, 30, 2, 40, 6, 18.4), M.dark);
  // the barrel (fluted), the muzzle brake with its ports
  add(lathe([[16, 186], [16, 240], [13.5, 300], [11, 700]], { seg: 22 }), M.metal);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; add(block(280, 2, 2, 470, Math.sin(a) * 11.6, Math.cos(a) * 11.6), M.dark); }
  add(lathe([[12, 700], [16, 704], [16, 788], [14, 792], [8, 792]], { seg: 22 }), M.metal);
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) add(block(12, 9, 3, 718 + i * 22, 0, sx * 15), M.dark);
  add(lathe([[5.5, 760], [5.5, 792.2]], { seg: 12 }), M.dark);
  // the scope: eyepiece, magnification ring, the tube with the turrets' saddle, the objective bell, the lenses; its
  // two rings and their bases on the rail
  const sv = 63;
  add(lathe([[19, -168], [23, -164], [23, -138, true], [20, -128], [18.5, -106], [21, -100], [21, -84], [17, -78], [17, 18], [17, 98],
    [32, 152, true], [33.5, 160], [33.5, 182], [31, 186]], { v: sv, seg: 36 }), M.poly);
  for (let i = 0; i < 10; i++) add(block(14, 2, 2, -92, sv + Math.sin((i / 10) * Math.PI * 2) * 21.5, Math.cos((i / 10) * Math.PI * 2) * 21.5), M.rubber);
  add(lathe([[0, -166], [20, -166]], { v: sv, seg: 24 }), M.optic);
  add(lathe([[0, 184], [31, 184]], { v: sv, seg: 30 }), M.optic);
  add(slab([[-14, sv - 20], [58, sv - 20], [58, sv + 20, 6], [-14, sv + 20, 6]], 40, { R: 6, b: 5 }), M.poly);
  add(post(17, 26, 22, sv + 19, 0, 24), M.metal);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; add(block(1.6, 22, 1.6, 22 + Math.sin(a) * 17.2, sv + 32, Math.cos(a) * 17.2), M.dark); }
  add(pin(15, 22, 22, sv, 30, 22), M.metal);
  add(pin(15, 20, 22, sv, -29, 22), M.metal);
  for (const u of [-48, 84]) {
    add(lathe([[20, u - 9], [20, u + 9]], { v: sv, seg: 28 }), M.metal);
    add(slab([[u - 12, 27], [u + 12, 27], [u + 9, sv - 16, 3], [u - 9, sv - 16, 3]], 26, { R: 2, b: 2 }), M.metal);
    add(pin(4, 8, u, 34, -16, 10), M.metal);
  }
  // the bipod folded forward under the fore-end
  for (const sx of [-1, 1]) add(lathe([[5, 304], [5, 470]], { x: sx * 16, v: -70, seg: 10 }), M.metal);
  add(block(24, 14, 46, 296, -68), M.metal);
  for (const sx of [-1, 1]) add(block(14, 10, 10, 472, -70, sx * 16), M.rubber);
  // the magazine (5 rounds of .338) in front of the trigger guard
  const mag = part(ctx.g, parts, 'mag', P(78, -64).x, P(78, -64).y, P(78, -64).z);
  const am = (geo, mat) => { local(geo, mag); ctx.addTo(mag, geo, mat); };
  am(slab([[42, -20], [114, -20], [114, -96, 4], [42, -96, 4]], 30, { R: 3, b: 2 }), M.metal);
  am(block(76, 6, 33, 78, -98), M.poly);
  cartridge(am, M, 45, -12, 0, 7.4, 69, 22);
  // the bolt: its body in the action, the handle out to the right, the big knob (it lifts, comes back, goes home)
  const bolt = part(ctx.g, parts, 'bolt', P(-50, 0).x, P(-50, 0).y, P(-50, 0).z);
  const ab = (geo, mat) => { local(geo, bolt); ctx.addTo(bolt, geo, mat); };
  ab(lathe([[13.5, -96], [13.5, 30]], { seg: 18 }), M.metal);
  ab(slab([[-42, -4], [-58, -4], [-58, 4], [-42, 4]], 46, { x: 23, R: 2, b: 1.5 }), M.metal);
  const knob = new THREE.SphereGeometry(13, 16, 12);
  uvScale(knob); knob.scale(S, S * 1.05, S * 1.25); knob.translate(52 * S, Y0 - 8 * S, 50 * S);
  ab(knob, M.metal);
  bolt.userData.rotary = true;
  return {
    sightY: Y0 + sv * S, muzzleY: Y0, muzzleZ: -792 * S, gripZ: 0.078, foreZ: -232 * S, foreY: -0.052,
    offset: new THREE.Vector3(0.02, -0.01, -0.15), adsZ: -0.3, charge: P(-50, -8, 54), boltTravel: 0.11,
  };
}

// ---------------------------------------------------------------- the Glock 19 (P-19 sidearm): the slide with its
// serrations front and back, its sights and ejection port, the polymer frame with its rail, the trigger with its
// safety blade, the textured grip, the magazine's base plate
function glock(ctx) {
  const { M, parts, part, add } = ctx;
  add(slab([[86, -8], [86, -20, 2], [40, -22], [36, -24], [-12, -24], [-24, -22], [-30, -30], [-48, -86], [-52, -102, 4], [-92, -102, 4], [-88, -86],
    [-76, -36], [-78, -22, 4], [-90, -14, 6], [-86, -8]], 30, { R: 2, b: 2.8, bs: 3 }), M.poly);
  add(slab([[44, -20], [46, -42, 3], [40, -46, 2], [-6, -46, 6], [-20, -40], [-24, -24]], 11, { R: 2, b: 1.5, holes: [Object.assign([[38, -24], [38, -40], [-2, -40], [-14, -34], [-16, -24]], { R: 2 })] }), M.poly);
  for (const u of [72, 60]) add(block(5, 4, 22, u, -22.5), M.poly);
  for (const sx of [-1, 1]) add(slab([[-34, -40], [-46, -84], [-82, -84], [-74, -40]], 1.2, { x: sx * 15.2, R: 4, b: 0.4 }), M.rubber);
  add(slab([[4, -24], [7, -32, 3], [5, -38, 2], [1, -39], [2, -33, 2], [0, -26]], 6.5, { R: 0.5, b: 0.5 }), M.poly);
  add(block(2.4, 10, 2.2, 3, -30, 0), M.dark);
  // the slide stop on the left, the take-down lever, the magazine release behind the trigger guard
  add(slab([[22, -6], [-2, -6], [-2, -11], [20, -11]], 2, { x: -15.6, R: 1, b: 0.4 }), M.metal);
  for (const sx of [-1, 1]) add(block(9, 4, 2, 32, -12, sx * 15.4), M.metal);
  add(block(8, 9, 3, -24, -28, -15.6), M.poly);
  // the barrel's crown at the muzzle
  add(lathe([[7.5, 96], [7.5, 104.5]], { seg: 18 }), M.metal);
  add(lathe([[4.5, 96], [4.5, 104.7]], { seg: 12 }), M.dark);
  // the slide (it comes back as the pistol fires, and locks back when empty)
  const slide = part(ctx.g, parts, 'slide', P(0, 6).x, P(0, 6).y, P(0, 6).z);
  const as = (geo, mat) => { local(geo, slide); ctx.addTo(slide, geo, mat); };
  as(slab([[104, -8], [104, 12, 3], [98, 18, 2], [-76, 18, 2], [-80, 12, 2], [-80, -8]], 25.5, { R: 2, b: 2.2, bs: 3 }), M.metal);
  for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) as(block(1.6, 22, 1, -40 - i * 5, 4, sx * 12.9), M.dark);
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) as(block(1.6, 18, 1, 66 + i * 5, 6, sx * 12.9), M.dark);
  as(block(36, 9, 6, 22, 14, 7.2), M.dark);
  as(block(30, 3, 6, 22, 15, 7), M.metal);
  as(slab([[88, 18], [96, 18], [95, 24, 1], [89, 24, 1]], 3.4, { R: 0.6, b: 0.5 }), M.metal);
  as(post(0.9, 0.4, 92, 23.8, 0, 8), M.white);
  as(slab([[-58, 18], [-70, 18], [-70, 25, 1], [-60, 25, 1]], 20, { R: 0.8, b: 0.6, holes: [[[-61, 21.5], [-69, 21.5], [-69, 26], [-61, 26]]] }), M.metal);
  for (const sx of [-1, 1]) as(post(0.9, 0.4, -64, 24.4, sx * 6.5, 8), M.white);
  // the magazine up in the grip, its base plate below it
  const mag = part(ctx.g, parts, 'mag', P(-72, -102).x, P(-72, -102).y, P(-72, -102).z, -0.27);
  const am = (geo, mat) => { upright(geo, mag); ctx.addTo(mag, geo, mat); };
  am(slab([[-58, -10], [-58, -100], [-86, -100], [-86, -10]], 22, { R: 2, b: 1 }), M.poly);
  am(slab([[-54, -100], [-54, -108, 2], [-90, -108, 2], [-89, -100]], 30, { R: 2.5, b: 2 }), M.poly);
  cartridge(am, M, -84, -6, 0, 4.9, 19.2, 10);
  return {
    sightY: Y0 + 23 * S, muzzleY: Y0, muzzleZ: -104 * S, gripZ: 0.072, foreZ: 0.06, foreY: -0.085,
    offset: new THREE.Vector3(-0.03, 0.03, 0.04), adsZ: -0.4, charge: P(-55, 10, -15), boltTravel: 0.036, eject: [14 * S, Y0 + 15 * S, -22 * S],
  };
}

// ---------------------------------------------------------------- a pump shotgun: the steel receiver with its
// ejection port, the magazine tube under the barrel with the pump on it, a ghost-ring rear sight and a front blade,
// a pistol-grip stock
function pump(ctx) {
  const { M, parts, part, add } = ctx;
  add(slab([[122, -32], [122, 16, 3], [114, 22, 3], [-70, 22, 3], [-80, 14, 3], [-82, -24, 3], [-60, -32]], 33, { R: 3, b: 2.5 }), M.metal);
  add(block(66, 22, 2, 58, 2, 16.2), M.dark);
  add(block(60, 12, 2, 58, 3, 15.6), M.metal);
  add(block(70, 6, 30, 50, -33, 0), M.dark);
  // trigger guard group, trigger, the cross-bolt safety
  add(slab([[22, -30], [22, -52, 5], [14, -60, 6], [-30, -60, 5], [-36, -48], [-36, -30]], 14, { R: 2, b: 1.5, holes: [[[16, -34], [14, -52, 4], [8, -55, 4], [-26, -55, 4], [-30, -46], [-30, -34]]] }), M.metal);
  add(slab([[4, -32], [7, -42, 3], [4, -50, 3], [0, -51], [1, -44, 2], [-2, -34]], 6, { R: 0.5, b: 0.5 }), M.dark);
  add(pin(3.4, 36, -14, -36, 0, 12), M.rubber);
  // the pistol-grip stock: the grip, the comb back to the butt, the pad
  add(slab([[-34, -30], [-40, -56], [-44, -70, 6], [-52, -130, 5], [-90, -130, 5], [-82, -86], [-112, -56], [-360, -96], [-372, -108, 6], [-376, 10, 6],
    [-362, 14, 6], [-80, 16, 4]], 40, { R: 3, b: 4, bs: 3, holes: [Object.assign([[-124, -6], [-300, 0], [-312, -50], [-140, -40]], { R: 10 })] }), M.poly);
  add(slab([[-372, 12], [-386, 12], [-390, -108, 6], [-376, -110, 6]], 46, { R: 3, b: 3 }), M.rubber);
  // the barrel and the magazine tube under it, the tube's cap and the clamp joining them, the ghost ring and the
  // front blade with its bead
  add(lathe([[13, 120], [13, 136], [10.5, 140], [10.5, 590], [9.5, 592]], { seg: 22 }), M.metal);
  add(lathe([[7, 560], [7, 592.2]], { seg: 12 }), M.dark);
  add(lathe([[12.5, 120], [12.5, 470]], { v: -26, seg: 18 }), M.metal);
  add(lathe([[14, 470], [14, 498], [12, 504], [7, 506]], { v: -26, seg: 18 }), M.metal);
  add(slab([[452, 8], [468, 8], [468, -40, 4], [452, -40, 4]], 20, { R: 4, b: 2 }), M.metal);
  add(slab([[566, 10], [582, 10], [580, 35, 2], [570, 35, 2]], 3, { R: 1, b: 0.6 }), M.metal);
  add(lathe([[1.6, 582], [1.6, 584]], { v: 33, seg: 8 }), M.copper);
  add(slab([[-28, 22], [-62, 22], [-62, 30, 2], [-30, 30, 2]], 20, { R: 2, b: 1.2 }), M.metal);
  add(lathe([[7.5, -50], [9.5, -48], [9.5, -42], [7.5, -40]], { v: 37, seg: 18 }), M.metal);
  for (const sx of [-1, 1]) add(slab([[-34, 28], [-56, 28], [-50, 36], [-40, 36]], 2.5, { x: sx * 8.6, R: 1, b: 0.5 }), M.metal);
  // the pump (it slides back to load and forward to close)
  const pm = part(ctx.g, parts, 'pump', P(266, -26).x, P(266, -26).y, P(266, -26).z);
  const ap = (geo, mat) => { local(geo, pm); ctx.addTo(pm, geo, mat); };
  ap(slab([[196, -6], [336, -6], [340, -14, 4], [340, -44, 6], [332, -50, 4], [200, -50, 4], [192, -42, 6], [192, -14, 4]], 48, { R: 4, b: 6, bs: 3 }), M.poly);
  for (let u = 210; u < 330; u += 13) ap(block(4, 30, 49.6, u, -28), M.dark);
  return {
    sightY: Y0 + 37 * S, muzzleY: Y0, muzzleZ: -592 * S, gripZ: 0.078, foreZ: -266 * S, foreY: -0.042,
    offset: new THREE.Vector3(0, 0, -0.04), adsZ: -0.28, port: P(50, -38), boltTravel: 0.1, eject: [17 * S, Y0 + 3 * S, -58 * S],
  };
}

// ---------------------------------------------------------------- the RPG-7V: the steel tube with its flared blast
// cone at the back, the two wooden heat guards, the pistol grip and trigger, the optical sight on the left, the
// folding iron sights on top, and a PG-7V rocket in the muzzle
function rpg7(ctx) {
  const { M, add } = ctx;
  add(lathe([[45, -560], [42, -548, true], [33, -500, true], [26, -440, true], [24.5, -420], [24, -416], [24, 496], [26, 500], [26, 508], [21, 508]], { seg: 28 }), M.metal);
  add(lathe([[20, -560], [20, 508.2]], { seg: 18 }), M.dark);
  add(lathe([[34, -330], [35, -320, true], [35, -90, true], [34, -80]], { seg: 24 }), M.wood);
  add(lathe([[32, 64], [33, 72, true], [33, 226, true], [32, 234]], { seg: 24 }), M.wood);
  for (const u of [-334, -76, 60, 238]) add(lathe([[36, u - 4], [36, u + 4]], { seg: 24 }), M.metal);
  // the pistol grip, its trigger guard and trigger
  add(slab([[20, -18], [24, -40], [18, -48], [-20, -48], [-26, -38], [-24, -18]], 18, { R: 2, b: 1.5 }), M.metal);
  add(slab([[-12, -40], [-18, -64, 6], [-26, -130, 6], [-62, -130, 6], [-50, -64], [-46, -40]], 30, { R: 3, b: 4, bs: 3 }), M.wood);
  add(slab([[40, -40], [40, -62, 6], [30, -70, 6], [-12, -70, 4], [-14, -60], [-14, -40]], 9, { R: 2, b: 1, holes: [[[34, -44], [32, -60, 4], [26, -64, 4], [-8, -64, 3], [-8, -46]]] }), M.metal);
  add(slab([[12, -40], [15, -52, 3], [12, -60, 3], [8, -61], [9, -54, 2], [6, -42]], 6, { R: 0.5, b: 0.5 }), M.dark);
  // the optical sight on its bracket on the left: body, eyepiece with the rubber eyecup, objective, adjusters
  add(slab([[-30, 4], [40, 4], [40, 18, 2], [-30, 18, 2]], 14, { x: -30, R: 2, b: 1.5 }), M.metal);
  add(lathe([[16, -70], [16, 70]], { x: -52, v: 34, seg: 22 }), M.poly);
  add(slab([[-60, 18], [56, 18], [56, 46, 6], [-60, 46, 6]], 30, { x: -52, R: 6, b: 5 }), M.poly);
  add(lathe([[14, -112], [19, -104, true], [18, -84], [16, -70]], { x: -52, v: 34, seg: 22 }), M.rubber);
  add(lathe([[0, 70], [12, 70]], { x: -52, v: 34, seg: 18 }), M.optic);
  add(post(7, 10, 0, 46, -52, 14), M.poly);
  add(pin(7, 10, -10, 34, -72, 14), M.poly);
  // the folding iron sights on top: the rear leaf above the grip, the front post near the muzzle
  add(slab([[46, 24], [74, 24], [72, 64, 3], [52, 64, 3]], 12, { R: 2, b: 1, holes: [Object.assign([[58, 54], [66, 54], [66, 66], [58, 66]], { R: 0.5 })] }), M.metal);
  add(slab([[386, 24], [404, 24], [398, 61, 2], [392, 61, 2]], 6, { R: 1, b: 0.6 }), M.metal);
  // the PG-7V rocket: its motor out of the muzzle, the warhead's body, the cone and the fuze
  add(lathe([[19.5, 500], [19.5, 566]], { seg: 22 }), M.olive);
  add(lathe([[19.5, 566], [42.5, 574], [42.5, 646], [41, 650], [12, 870, true], [8, 884], [7, 904], [4, 912], [0, 914]], { seg: 32 }), M.olive);
  add(lathe([[42.8, 600], [42.8, 606]], { seg: 32 }), M.dark);
  add(lathe([[8.2, 878], [8.2, 896]], { seg: 16 }), M.metal);
  return {
    sightY: Y0 + 61 * S, muzzleY: Y0, muzzleZ: -914 * S, gripZ: 0.044, foreZ: -150 * S, foreY: -0.03,
    offset: new THREE.Vector3(0.1, -0.02, -0.25), adsZ: -0.4,
  };
}

// ---------------------------------------------------------------- the 40 mm launcher: the carbine with an M203 under
// its handguard (the left hand on the launcher's barrel, its trigger just ahead of the magazine)
function launcher(ctx) {
  const a = carbine(ctx, { fixed: true });
  const { M, add } = ctx;
  const lv = -60;
  add(lathe([[25, 132], [26, 136], [26, 430], [24.5, 434]], { v: lv, seg: 30 }), M.metal);
  add(lathe([[20, 200], [20, 434.2]], { v: lv, seg: 24 }), M.dark);
  for (let u = 232; u < 420; u += 22) add(lathe([[26.6, u], [26.6, u + 8]], { v: lv, seg: 30 }), M.metal);
  add(slab([[132, -30], [272, -30], [272, -36], [132, -36]], 30, { R: 2, b: 1 }), M.metal);
  add(slab([[122, -36], [150, -36], [150, -88, 4], [132, -96, 6], [122, -84]], 30, { R: 3, b: 3 }), M.metal);
  add(slab([[126, -88], [150, -88], [146, -112, 4], [122, -112, 4]], 13, { R: 2, b: 1.5, holes: [[[130, -92], [143, -92], [141, -108, 3], [126, -108, 3]]] }), M.metal);
  add(slab([[137, -88], [139, -96, 2], [136, -104, 2], [133, -104], [134, -97], [132, -90]], 5, { R: 0.5, b: 0.5 }), M.dark);
  add(slab([[300, -10], [330, -10], [330, -4, 2], [300, -4, 2]], 14, { x: -27, R: 1.5, b: 1 }), M.metal);
  return { ...a, muzzleY: Y0 + lv * S, muzzleZ: -434 * S, foreZ: -300 * S, foreY: -0.089, charge: null, eject: null };
}

const BUILDERS = { ar: carbine, smg: pdw, lmg: saw, sniper: awm, pistol: glock, shotgun: pump, rpg: rpg7, ugl: launcher };

// ctx: { g, parts, M, part } (the viewmodel group, its moving parts, the materials and the part maker)
export function gunModel(kind, ctx) {
  const build = BUILDERS[kind];
  if (!build) return null;
  ctx.add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); ctx.g.add(m); return m; };
  ctx.addTo = (grp, geo, mat) => { const m = new THREE.Mesh(geo, mat); grp.add(m); return m; };
  return build(ctx);
}
