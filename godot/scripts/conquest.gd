extends Node
## Conquest, as in the web game's js/conquest.js: five flags to capture, tickets that drain for the side holding
## fewer flags and with every redeploy, spawn points, the kill feed and the end of the match.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")

var w: Node
var flags := []
var tickets := [250.0, 250.0]
var over := false
var winner := -1
var feed := []
var _banner := []
var _ring := []


func setup(world: Node, start_tickets: int) -> void:
	w = world
	tickets = [float(start_tickets), float(start_tickets)]
	for c in [Color(0.85, 0.85, 0.82), D.TEAMS[0]["color"], D.TEAMS[1]["color"]]:
		var bm := StandardMaterial3D.new()
		bm.albedo_color = c
		bm.emission_enabled = true
		bm.emission = c
		bm.emission_energy_multiplier = 0.4
		_banner.append(bm)
		var rm := StandardMaterial3D.new()
		rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		rm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		rm.albedo_color = Color(c.r, c.g, c.b, 0.45)
		_ring.append(rm)
	for f in D.FLAGS:
		var pos := Vector3(f["x"], T.height(f["x"], f["z"]), f["z"])
		var pole := MeshInstance3D.new()
		var pm := CylinderMesh.new()
		pm.top_radius = 0.06
		pm.bottom_radius = 0.08
		pm.height = 9.0
		pole.mesh = pm
		pole.material_override = w.mat("metal")
		w.add_child(pole)
		pole.position = pos + Vector3(0, 4.5, 0)
		var banner := MeshInstance3D.new()
		var bx := BoxMesh.new()
		bx.size = Vector3(2.2, 1.3, 0.04)
		banner.mesh = bx
		w.add_child(banner)
		var ring := MeshInstance3D.new()
		var tm := TorusMesh.new()
		tm.inner_radius = f["radius"] - 0.35
		tm.outer_radius = f["radius"]
		tm.rings = 64
		ring.mesh = tm
		ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		w.add_child(ring)
		ring.position = pos + Vector3(0, 0.3, 0)
		ring.scale = Vector3(1, 0.15, 1)
		var fl := {"id": f["id"], "name": f["name"], "pos": pos, "radius": f["radius"], "owner": -1, "progress": 0.0,
			"counts": [0, 0], "banner": banner, "ring": ring}
		flags.append(fl)
		_visual(fl)


func _visual(f: Dictionary) -> void:
	var o: int = f["owner"]
	var show := o
	if o == -1 and absf(f["progress"]) > 0.01:
		show = 0 if f["progress"] > 0.0 else 1
	(f["banner"] as MeshInstance3D).material_override = _banner[o + 1]
	(f["banner"] as MeshInstance3D).position = f["pos"] + Vector3(1.15, lerpf(2.0, 8.3, absf(f["progress"])), 0)
	(f["ring"] as MeshInstance3D).material_override = _ring[show + 1]


func _physics_process(dt: float) -> void:
	if over or w.soldiers.is_empty():
		return
	for f in flags:
		var counts := [0, 0]
		var fp: Vector3 = f["pos"]
		var r: float = f["radius"]
		for s in w.soldiers:
			if s.dead:
				continue
			var p: Vector3 = s.global_position
			if absf(p.y - fp.y) > 12.0 or Vector2(p.x - fp.x, p.z - fp.z).length() > r:
				continue
			counts[s.team] += 1
		f["counts"] = counts
		var diff: int = counts[0] - counts[1]
		if diff != 0:
			f["progress"] = clampf(f["progress"] + signf(diff) * D.RULES["capture"] * minf(absi(diff), 4) * dt, -1.0, 1.0)
		elif counts[0] == 0 and f["owner"] != -1:
			var full := 1.0 if f["owner"] == 0 else -1.0
			f["progress"] += clampf(full - f["progress"], -0.05 * dt, 0.05 * dt)
		var o: int = f["owner"]
		if o == 0 and f["progress"] <= 0.0:
			_owner(f, -1, 1)
		elif o == 1 and f["progress"] >= 0.0:
			_owner(f, -1, 0)
		if f["owner"] == -1 and f["progress"] >= 1.0:
			_owner(f, 0, 0)
		elif f["owner"] == -1 and f["progress"] <= -1.0:
			_owner(f, 1, 1)
		_visual(f)
	var own := [0, 0]
	for f in flags:
		if f["owner"] >= 0:
			own[f["owner"]] += 1
	for t in 2:
		var o := 1 - t
		if own[o] > own[t] and own[o] > flags.size() / 2.0:
			tickets[t] = maxf(0.0, tickets[t] - (0.12 + 0.1 * (own[o] - own[t])) * dt)
			if tickets[t] <= 0.0:
				end(o)
	for t in 2:
		if tickets[t] <= 0.0:
			end(1 - t)
	for e in feed:
		e[5] -= dt
	while not feed.is_empty() and feed[-1][5] <= 0.0:
		feed.pop_back()


func _owner(f: Dictionary, owner: int, by: int) -> void:
	f["owner"] = owner
	var tn: String = D.TEAMS[by]["name"]
	note("%s %s %s %s" % [tn, "CAPTURED" if owner >= 0 else "NEUTRALIZED", f["id"], f["name"]], by)
	var p = w.player
	if p and not p.dead and p.team == by:
		var fp: Vector3 = f["pos"]
		if p.global_position.distance_to(fp) < f["radius"] + 2.0:
			p.score += 250 if owner >= 0 else 100
			w.hud.toast("+%d  %s" % [250 if owner >= 0 else 100, "FLAG CAPTURED" if owner >= 0 else "FLAG NEUTRALIZED"])


func note(text: String, team: int) -> void:
	feed.push_front(["", text, "", team, team, 6.0])
	if feed.size() > 6:
		feed.pop_back()


func on_kill(victim: Node, attacker: Node, weapon: String, head: bool) -> void:
	victim.deaths += 1
	if attacker and attacker != victim:
		attacker.kills += 1
		attacker.score += 100 + (25 if head else 0)
	feed.push_front([attacker.tag if attacker else "", weapon + ("  HEADSHOT" if head else ""), victim.tag,
		attacker.team if attacker else victim.team, victim.team, 6.0])
	if feed.size() > 6:
		feed.pop_back()


## Where a side can deploy: its headquarters and every flag it holds that the enemy isn't standing on.
func spawn_points(team: int) -> Array:
	var hq: Dictionary = D.HQS[team]
	var pts := [["HQ", Vector3(hq["x"], T.height(hq["x"], hq["z"]), hq["z"])]]
	for f in flags:
		if f["owner"] == team and f["counts"][1 - team] == 0:
			pts.append([f["id"] + "  " + f["name"], f["pos"]])
	return pts


func spawn_at(team: int, point: Array) -> Transform3D:
	var c: Vector3 = point[1]
	var r := 10.0 if point[0] == "HQ" else 6.0
	var a := randf() * TAU
	var d := randf_range(1.5, r)
	var x := c.x + cos(a) * d
	var z := c.z + sin(a) * d
	var enemy: Dictionary = D.HQS[1 - team]
	var yaw := atan2(-(enemy["x"] - x), -(enemy["z"] - z))
	return Transform3D(Basis(Vector3.UP, yaw), Vector3(x, T.height(x, z) + 0.3, z))


## A redeploy costs the side a ticket; at none left it can't redeploy.
func use_ticket(team: int) -> bool:
	if over or tickets[team] < 1.0:
		return false
	tickets[team] -= 1.0
	if tickets[team] < 1.0:
		tickets[team] = 0.0
	return true


func end(win: int) -> void:
	if over:
		return
	over = true
	winner = win
	w.on_match_end(win)
