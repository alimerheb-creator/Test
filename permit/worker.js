// Site Permit Register — server. D1 binding "DB", static files in ./public.
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const E = (m, s = 400) => J({ error: m }, s);
const now = () => new Date().toISOString();
const rid = () => crypto.randomUUID().replace(/-/g, "");
const norm = s => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
const dayKey = iso => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
const TYPES = ["Hot Work Permit", "Excavation Permit", "Work at Height Permit", "Cold Work Permit", "Confined Space Permit", "Lifting Permit"];
async function hash(pin, salt) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
const okPin = p => /^\d{4,6}$/.test(String(p || ""));
const bump = db => db.prepare("UPDATE meta SET v = v + 1 WHERE k = 'version'");
async function newSession(db, uid) { const t = rid() + rid(); await db.prepare("INSERT INTO sessions VALUES (?,?,?)").bind(t, uid, now()).run(); return t; }

export default {
  async fetch(req, env) {
    const db = env.DB, url = new URL(req.url), p = url.pathname, m = req.method;
    if (!db) return new Response("Database not connected: add a D1 binding named DB.", { status: 500 });
    try {
      if (!p.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
      const body = m === "POST" ? await req.json().catch(() => ({})) : {};
      // ---------- public ----------
      if (p === "/api/public") {
        const c = await db.prepare("SELECT id, name, type FROM companies WHERE active = 1 ORDER BY type = 'main' DESC, name").all();
        const n = await db.prepare("SELECT COUNT(*) n FROM users").first();
        return J({ companies: c.results, needsSetup: n.n === 0, types: TYPES });
      }
      if (p === "/api/version") return J({ v: (await db.prepare("SELECT v FROM meta WHERE k='version'").first()).v });
      if (p === "/api/setup" && m === "POST") {
        if ((await db.prepare("SELECT COUNT(*) n FROM users").first()).n) return E("Already set up");
        const name = String(body.name || "").trim(); if (name.length < 3 || !okPin(body.pin)) return E("Enter your name and a 4–6 digit PIN");
        const id = rid(), salt = rid();
        await db.batch([db.prepare("INSERT INTO users (id,name,name_key,company_id,salt,pin_hash,status,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, name, norm(name), "agc", salt, await hash(body.pin, salt), "approved", now()), bump(db)]);
        return J({ token: await newSession(db, id) });
      }
      if (p === "/api/login" && m === "POST") {
        const u = await db.prepare("SELECT * FROM users WHERE name_key = ?").bind(norm(body.name)).first();
        if (!u) return E("Name or PIN is not correct", 401);
        if (u.locked_until > Date.now()) return E("Too many wrong PINs. Try again in a few minutes.", 429);
        if (await hash(String(body.pin || ""), u.salt) !== u.pin_hash) {
          const f = u.fails + 1;
          await db.prepare("UPDATE users SET fails = ?, locked_until = ? WHERE id = ?").bind(f >= 5 ? 0 : f, f >= 5 ? Date.now() + 5 * 60000 : 0, u.id).run();
          return E("Name or PIN is not correct", 401);
        }
        await db.prepare("UPDATE users SET fails = 0 WHERE id = ?").bind(u.id).run();
        return J({ token: await newSession(db, u.id) });
      }
      if (p === "/api/signup" && m === "POST") {
        const name = String(body.name || "").trim().replace(/\s+/g, " ");
        if (name.length < 3) return E("Enter your full name");
        if (!okPin(body.pin)) return E("PIN must be 4–6 digits");
        const c = await db.prepare("SELECT * FROM companies WHERE id = ? AND active = 1").bind(body.companyId || "").first();
        if (!c) return E("Select your company");
        if (await db.prepare("SELECT 1 FROM users WHERE name_key = ?").bind(norm(name)).first()) return E("That name is already registered. Add your surname or employee number.");
        const id = rid(), salt = rid();
        await db.batch([db.prepare("INSERT INTO users (id,name,name_key,company_id,salt,pin_hash,status,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, name, norm(name), c.id, salt, await hash(body.pin, salt), "pending", now()), bump(db)]);
        return J({ token: await newSession(db, id) });
      }
      // ---------- signed in ----------
      const tok = (req.headers.get("authorization") || "").replace("Bearer ", "") || url.searchParams.get("t") || "";
      const me = tok && await db.prepare("SELECT u.*, c.type ctype, c.name cname FROM sessions s JOIN users u ON u.id = s.user_id JOIN companies c ON c.id = u.company_id WHERE s.token = ?").bind(tok).first();
      if (!me) return E("Please sign in again", 401);
      if (p === "/api/logout") { await db.prepare("DELETE FROM sessions WHERE token = ?").bind(tok).run(); return J({ ok: 1 }); }
      const meOut = { id: me.id, name: me.name, companyId: me.company_id, status: me.status };
      if (p === "/api/me") return J(meOut);
      if (me.status !== "approved") return E("Your account is not approved", 403);
      const agc = me.ctype === "main";
      if (p === "/api/data") {
        const since = Number(url.searchParams.get("since") || 0);
        const [v, comps, users, areas, permits] = await db.batch([
          db.prepare("SELECT v FROM meta WHERE k='version'"),
          db.prepare("SELECT id, name, type, parent_id parentId, active FROM companies"),
          db.prepare("SELECT id, name, company_id companyId, status, created_at createdAt FROM users"),
          db.prepare("SELECT id, code, name FROM areas"),
          db.prepare("SELECT serial id, serial, seq, area_id areaId, area_code areaCode, company_id companyId, company_name companyName, created_by createdBy, created_at createdAt, day, status, type, description, has_photo hasPhoto, photo_at photoAt, cancelled_by cancelledBy, cancelled_at cancelledAt, cancel_reason cancelReason, updated_at updatedAt FROM permits WHERE updated_at > ? ORDER BY updated_at").bind(since)]);
        return J({ v: v.results[0].v, me: meOut, isAGC: agc, companies: comps.results.map(c => ({ ...c, active: !!c.active })), users: users.results, areas: areas.results, permits: permits.results });
      }
      let mt;
      if (p === "/api/permits" && m === "POST") {
        const a = await db.prepare("SELECT * FROM areas WHERE id = ?").bind(body.areaId || "").first();
        if (!a) return E("Unknown area");
        if (!TYPES.includes(body.type)) return E("Select the permit type");
        const r = await db.prepare("INSERT INTO counters (area_id, count) VALUES (?, 1) ON CONFLICT(area_id) DO UPDATE SET count = count + 1 RETURNING count").bind(a.id).first();
        const serial = a.code + "-" + String(r.count).padStart(4, "0"), t = now();
        await db.batch([db.prepare("INSERT INTO permits (serial,seq,area_id,area_code,company_id,company_name,created_by,created_at,day,status,type,description,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
          .bind(serial, r.count, a.id, a.code, me.company_id, me.cname, me.id, t, dayKey(t), "awaiting_photo", body.type, String(body.description || "").slice(0, 500), Date.now()), bump(db)]);
        return J({ serial });
      }
      if ((mt = p.match(/^\/api\/permits\/([A-Za-z0-9-]+)\/(photo|cancel)$/)) && m === "POST") {
        const pr = await db.prepare("SELECT * FROM permits WHERE serial = ?").bind(mt[1]).first();
        if (!pr) return E("Permit not found", 404);
        if (!agc && pr.company_id !== me.company_id) return E("Only AGC or the issuing company can do this", 403);
        if (mt[2] === "photo") {
          const full = String(body.full || ""), thumb = String(body.thumb || "");
          if (!full.startsWith("data:image/jpeg;base64,") || !thumb.startsWith("data:image/jpeg;base64,") || full.length > 1900000) return E("Invalid photo");
          await db.batch([db.prepare("INSERT OR REPLACE INTO photos VALUES (?,?,?)").bind(pr.serial, full, thumb),
            db.prepare("UPDATE permits SET has_photo = 1, photo_at = ?, photo_by = ?, status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE 'issued' END, updated_at = ? WHERE serial = ?").bind(now(), me.id, Date.now(), pr.serial), bump(db)]);
        } else {
          const reason = String(body.reason || "").trim(); if (reason.length < 3) return E("Please enter a reason");
          if (pr.status === "cancelled") return E("Already cancelled");
          await db.batch([db.prepare("UPDATE permits SET status = 'cancelled', cancelled_by = ?, cancelled_at = ?, cancel_reason = ?, updated_at = ? WHERE serial = ?").bind(me.id, now(), reason.slice(0, 500), Date.now(), pr.serial), bump(db)]);
        }
        return J({ ok: 1 });
      }
      if ((mt = p.match(/^\/api\/photo\/([A-Za-z0-9-]+)$/))) {
        const ph = await db.prepare(url.searchParams.get("kind") === "full" ? "SELECT full d FROM photos WHERE serial = ?" : "SELECT thumb d FROM photos WHERE serial = ?").bind(mt[1]).first();
        if (!ph) return new Response("No photo", { status: 404 });
        return new Response(Uint8Array.from(atob(ph.d.split(",")[1]), c => c.charCodeAt(0)), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
      }
      if (p === "/api/account/name" && m === "POST") {
        const name = String(body.name || "").trim().replace(/\s+/g, " "); if (name.length < 3) return E("Enter your full name");
        if (await db.prepare("SELECT 1 FROM users WHERE name_key = ? AND id != ?").bind(norm(name), me.id).first()) return E("That name is already used by someone else");
        await db.batch([db.prepare("UPDATE users SET name = ?, name_key = ? WHERE id = ?").bind(name, norm(name), me.id), bump(db)]);
        return J({ ok: 1 });
      }
      if (p === "/api/account/pin" && m === "POST") {
        if (await hash(String(body.current || ""), me.salt) !== me.pin_hash) return E("Current PIN is not correct");
        if (!okPin(body.pin)) return E("New PIN must be 4–6 digits");
        const salt = rid(); await db.prepare("UPDATE users SET salt = ?, pin_hash = ? WHERE id = ?").bind(salt, await hash(body.pin, salt), me.id).run();
        return J({ ok: 1 });
      }
      // ---------- AGC only ----------
      if (!agc) return E("AGC only", 403);
      if ((mt = p.match(/^\/api\/users\/([a-z0-9]+)\/(status|pin)$/)) && m === "POST") {
        if (mt[2] === "status") {
          if (!["approved", "rejected", "suspended"].includes(body.status)) return E("Bad status");
          if (mt[1] === me.id) return E("You can't change your own status");
          await db.batch([db.prepare("UPDATE users SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?").bind(body.status, me.id, now(), mt[1]), bump(db)]);
          if (body.status !== "approved") await db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(mt[1]).run();
        } else {
          if (!okPin(body.pin)) return E("PIN must be 4–6 digits");
          const salt = rid(); await db.prepare("UPDATE users SET salt = ?, pin_hash = ?, fails = 0, locked_until = 0 WHERE id = ?").bind(salt, await hash(body.pin, salt), mt[1]).run();
        }
        return J({ ok: 1 });
      }
      if (p === "/api/companies" && m === "POST") {
        const name = String(body.name || "").trim(); if (name.length < 2) return E("Enter the company name");
        if (!["contractor", "subcontractor"].includes(body.type)) return E("Bad type");
        if (await db.prepare("SELECT 1 FROM companies WHERE lower(name) = ?").bind(norm(name)).first()) return E("That company already exists");
        await db.batch([db.prepare("INSERT INTO companies VALUES (?,?,?,?,1,?)").bind(rid(), name, body.type, body.type === "subcontractor" ? (body.parentId || null) : null, now()), bump(db)]);
        return J({ ok: 1 });
      }
      if ((mt = p.match(/^\/api\/companies\/([a-z0-9]+)\/active$/)) && m === "POST") {
        await db.batch([db.prepare("UPDATE companies SET active = ? WHERE id = ? AND type != 'main'").bind(body.active ? 1 : 0, mt[1]), bump(db)]);
        return J({ ok: 1 });
      }
      if (p === "/api/areas" && m === "POST") {
        const code = String(body.code || "").trim().toUpperCase().replace(/\s+/g, "");
        if (!/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(code)) return E("Use letters, numbers and dashes only");
        if (await db.prepare("SELECT 1 FROM areas WHERE code = ?").bind(code).first()) return E("That area code already exists");
        await db.batch([db.prepare("INSERT INTO areas VALUES (?,?,?,?)").bind(rid(), code, String(body.name || "").trim(), now()), bump(db)]);
        return J({ ok: 1 });
      }
      if ((mt = p.match(/^\/api\/areas\/([A-Za-z0-9]+)$/)) && m === "POST") {
        await db.batch([db.prepare("UPDATE areas SET name = ? WHERE id = ?").bind(String(body.name || "").trim(), mt[1]), bump(db)]);
        return J({ ok: 1 });
      }
      return E("Not found", 404);
    } catch (e) { return E("Server error: " + (e && e.message || e), 500); }
  }
};
