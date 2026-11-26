// Runs the web game in headless Chromium, switches on the Bombers mod's aircraft core, builds the B-1B and the
// Tu-160 with the game's own code and writes their geometry, parts and moving pieces to a JSON file, which
// build_bombers.gd makes into the Godot edition's scenes.
// Needs Playwright (with its Chromium) and three.js 0.169.0 (npm install three@0.169.0), served in place of the page's
// CDN copy. usage: node export_bombers.js <repo> <node_modules/three/build/three.module.min.js> <out.json>
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const [repo, threeFile, outFile] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const server = http.createServer((req, res) => {
  const p = path.join(repo, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(repo) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(8127, r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('page:', m.text().slice(0, 300)); });
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ body: fs.readFileSync(threeFile), contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto('http://localhost:8127/index.html');
  await page.waitForFunction(() => window.__game && window.__game.mods && document.getElementById('loading').classList.contains('done'), null, { timeout: 120000 });
  const data = await page.evaluate(async () => {
    const g = window.__game;
    const mod = await (await fetch('mods/bombers.sfmod.json')).json();
    const entry = { id: 'bombers', name: 'Bombers', messages: [], status: 'ok', mod };
    g.mods._runScript(entry, mod.script.join('\n'));
    const A = g.__air;
    if (!A) return { error: entry.messages.join('; ') };
    const M = A.kit.M;
    const matName = (m) => {
      for (const k of Object.keys(M)) if (M[k] === m) return k;
      if (M.decal[0] === m) return 'decal0';
      if (M.decal[1] === m) return 'decal1';
      return 'other';
    };
    const r6 = (v) => Math.round(v * 1e5) / 1e5;
    const out = {};
    for (const id of ['b1b', 'tu160']) {
      const T = A.types.find((t) => t.id === id);
      const m = T.build(T.teams[0]);
      const role = new Map();
      for (const s of m.swing || []) role.set(s, ['swing', s.userData.side, s.userData.max]);
      for (const d of m.doors || []) role.set(d, ['door', d.userData.side]);
      for (const s of m.stab || []) role.set(s, ['stab']);
      for (const h of m.cs || []) role.set(h, ['cs', h.userData.ch, h.userData.k]);
      for (const b of m.burners || []) role.set(b, ['burner']);
      const nodes = [];
      const walk = (o, parent) => {
        if (role.has(o) && role.get(o)[0] === 'burner') return;
        const i = nodes.length;
        const n = { parent, name: o.name || '', role: role.get(o) || null, pos: o.position.toArray().map(r6), quat: o.quaternion.toArray().map(r6), scale: o.scale.toArray().map(r6) };
        nodes.push(n);
        if (o.isMesh) {
          const ga = o.geometry.attributes;
          n.mat = matName(o.material);
          n.color = o.material.color ? o.material.color.getHex() : 0xffffff;
          n.pos3 = Array.from(ga.position.array, r6);
          n.nor = Array.from(ga.normal.array, (v) => Math.round(v * 1000) / 1000);
          if (ga.uv) n.uv = Array.from(ga.uv.array, r6);
          if (ga.color) n.col = Array.from(ga.color.array, (v) => Math.round(v * 1000) / 1000);
          n.idx = o.geometry.index ? Array.from(o.geometry.index.array) : null;
        }
        for (const c of o.children) walk(c, i);
      };
      walk(m.root, -1);
      out[id] = { name: T.name, nodes, points: m.points, weapons: T.weapons.map((w) => ({ name: w.name, kind: w.kind, ammo: w.ammo, points: w.points })), flight: T.flight, health: T.health, gun: T.gun, head: T.head, cam: T.cam, hit: T.hit };
    }
    return out;
  });
  if (data.error) console.log('error:', data.error);
  fs.writeFileSync(outFile, JSON.stringify(data));
  for (const [id, d] of Object.entries(data)) {
    if (!d.nodes) continue;
    let v = 0, t = 0;
    for (const n of d.nodes) if (n.pos3) { v += n.pos3.length / 3; t += (n.idx ? n.idx.length : n.pos3.length / 3) / 3; }
    console.log(id, d.name, 'nodes', d.nodes.length, 'verts', v, 'tris', t, 'roles', d.nodes.filter((n) => n.role).map((n) => n.role.join(':')).join(' '));
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
