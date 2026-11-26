extends Control
## The battle HUD (tickets and flags, mini-map, flag and squad markers, kill feed, crosshair, health, ammo, scope)
## and the touch controls for phones and tablets.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")

var w: Node
var move := Vector2.ZERO
var fire := false
var ads_on := false
var hold := {}
var touch_ui := false
var _look := Vector2.ZERO
var _taps := {}
var _btn_touch := {}
var _stick_id := -1
var _stick_o := Vector2.ZERO
var _stick_p := Vector2.ZERO
var _look_id := -1
var _hit_t := 0.0
var _hit_kill := false
var _hurt_t := 0.0
var _toast := ""
var _toast_t := 0.0
var _font: Font
var _vig: ImageTexture


func _ready() -> void:
	w = get_parent().get_parent()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	touch_ui = OS.has_feature("mobile")
	_font = ThemeDB.fallback_font


func take(n: String) -> bool:
	var v: bool = _taps.get(n, false)
	_taps[n] = false
	return v


## A touch button held down (a helicopter's UP and DOWN).
func held(n: String) -> bool:
	return hold.get(n, false)


func take_look() -> Vector2:
	var v := _look
	_look = Vector2.ZERO
	return v


func hitmark(killed: bool, _head: bool) -> void:
	_hit_t = 0.18
	_hit_kill = killed


func hurt(_from: Vector3) -> void:
	_hurt_t = 1.0


func toast(t: String) -> void:
	_toast = t
	_toast_t = 2.0


func reset_touch() -> void:
	fire = false
	move = Vector2.ZERO
	hold.clear()
	_btn_touch.clear()
	_stick_id = -1
	_look_id = -1


func _buttons() -> Dictionary:
	var s := size
	var p = w.player
	if p and p.dead:
		return {"use": [Vector2(s.x * 0.5, s.y - 110), 54.0]} if p.downed else {}
	if p and p.vehicle and p.vehicle.get("jet"):
		return {"fire": [Vector2(s.x - 165, s.y - 175), 72.0], "aam": [Vector2(s.x - 330, s.y - 120), 50.0],
			"flare": [Vector2(s.x - 310, s.y - 285), 42.0], "up": [Vector2(s.x - 60, s.y - 305), 42.0],
			"down": [Vector2(s.x - 60, s.y - 72), 40.0], "gfx": [Vector2(s.x - 50, 150), 28.0]}
	if p and p.vehicle:
		var vb := {"fire": [Vector2(s.x - 165, s.y - 175), 72.0], "ads": [Vector2(s.x - 310, s.y - 95), 46.0],
			"switch": [Vector2(s.x - 185, s.y - 340), 40.0], "use": [Vector2(s.x - 70, s.y - 300), 42.0], "gfx": [Vector2(s.x - 50, 150), 28.0]}
		if p.vehicle.get("air"):
			if p.vehicle.driver != p:
				# riding: on a door gun, fire and zoom with it; change places (a gun, the other, a seat)
				var rb := {"use": [Vector2(s.x - 70, s.y - 300), 42.0], "gfx": [Vector2(s.x - 50, 150), 28.0]}
				if p.vehicle.transport and not p.vehicle.guns.is_empty():
					rb["switch"] = vb["switch"]
					if p.vehicle.seat_name(p) != "":
						rb["fire"] = vb["fire"]
						rb["ads"] = vb["ads"]
				return rb
			if p.vehicle.transport:
				for k in ["fire", "ads", "switch"]:
					vb.erase(k)
			vb["use"] = [Vector2(s.x - 70, s.y - 430), 40.0]
			vb["up"] = [Vector2(s.x - 60, s.y - 305), 42.0]
			vb["down"] = [Vector2(s.x - 60, s.y - 72), 40.0]
		return vb
	var b := {"fire": [Vector2(s.x - 165, s.y - 175), 72.0], "ads": [Vector2(s.x - 310, s.y - 95), 46.0],
		"jump": [Vector2(s.x - 70, s.y - 300), 42.0], "crouch": [Vector2(s.x - 70, s.y - 80), 40.0],
		"reload": [Vector2(s.x - 300, s.y - 250), 40.0], "switch": [Vector2(s.x - 185, s.y - 340), 40.0],
		"grenade": [Vector2(s.x - 425, s.y - 150), 38.0], "gadget": [Vector2(s.x - 410, s.y - 290), 38.0],
		"knife": [Vector2(s.x - 300, s.y - 395), 36.0],
		"gfx": [Vector2(s.x - 50, 150), 28.0]}
	if p and (p.near_vehicle or p.near_downed):
		b["use"] = [Vector2(s.x - 70, s.y - 420), 42.0]
	return b


func _button_at(pos: Vector2) -> String:
	var bs := _buttons()
	for k in bs:
		if pos.distance_to(bs[k][0]) < bs[k][1] * 1.15:
			return k
	return ""


func _input(e: InputEvent) -> void:
	if w.menu_open:
		return
	if e is InputEventScreenTouch:
		touch_ui = true
		if e.pressed:
			var b := _button_at(e.position)
			if b == "fire":
				fire = true
				_btn_touch[e.index] = b
			elif b == "up" or b == "down":
				hold[b] = true
				_btn_touch[e.index] = b
			elif b == "ads":
				ads_on = not ads_on
			elif b == "gfx":
				w.set_quality((w.quality + 1) % 4)
			elif b != "":
				_taps[b] = true
			elif e.position.x < size.x * 0.42:
				_stick_id = e.index
				_stick_o = e.position
				_stick_p = e.position
			else:
				_look_id = e.index
		else:
			if _btn_touch.has(e.index):
				if _btn_touch[e.index] == "fire":
					fire = false
				else:
					hold[_btn_touch[e.index]] = false
				_btn_touch.erase(e.index)
			if e.index == _stick_id:
				_stick_id = -1
				move = Vector2.ZERO
			if e.index == _look_id:
				_look_id = -1
	elif e is InputEventScreenDrag:
		if e.index == _stick_id:
			_stick_p = e.position
			var d: Vector2 = (_stick_p - _stick_o) / 70.0
			move = d.limit_length(1.0) * (1.0 if d.length() > 1.3 else 0.96)
		elif e.index == _look_id or _btn_touch.has(e.index):
			_look += e.relative


func _process(dt: float) -> void:
	_hit_t -= dt
	_hurt_t = maxf(0.0, _hurt_t - dt * 1.5)
	_toast_t -= dt
	queue_redraw()


func _text(pos: Vector2, t: String, sz: int, c := Color(1, 1, 1, 0.9), align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0) -> void:
	draw_string(_font, pos + Vector2(1.5, 1.5), t, align, width, sz, Color(0, 0, 0, 0.6))
	draw_string(_font, pos, t, align, width, sz, c)


func _team_col(t: int) -> Color:
	return Color(0.9, 0.9, 0.88) if t < 0 else D.TEAMS[t]["color"]


func _draw() -> void:
	var p = w.player
	if p == null or w.menu_open:
		return
	var cq = w.conquest
	var s := size
	var c := s / 2.0
	if D.battle == "air":
		if p.vehicle:
			_air_hud(p, p.vehicle, s, c, cq)
		return
	var cam: Camera3D = p.vehicle.cam if p.vehicle else p.camera
	# sniper scope
	var g: Dictionary = p.gun()
	if not p.dead and g.get("scope", false) and p.ads > 0.85:
		var R := s.y * 0.45
		draw_arc(c, R + 200.0, 0, TAU, 96, Color.BLACK, 400.0)
		draw_rect(Rect2(0, 0, c.x - R - 390.0, s.y), Color.BLACK)
		draw_rect(Rect2(c.x + R + 390.0, 0, s.x, s.y), Color.BLACK)
		draw_line(Vector2(c.x - R, c.y), Vector2(c.x + R, c.y), Color(0, 0, 0, 0.9), 1.5)
		draw_line(Vector2(c.x, c.y - R), Vector2(c.x, c.y + R), Color(0, 0, 0, 0.9), 1.5)
	# damage
	if _hurt_t > 0.0 or p.health < 60.0:
		_damage(s, maxf(_hurt_t * 0.45, (60.0 - p.health) / 60.0 * 0.4) * 1.3)
	# flag markers and teammates
	for f in cq.flags:
		var fp: Vector3 = f["pos"] + Vector3(0, 7, 0)
		if cam.is_position_behind(fp):
			continue
		var sp := cam.unproject_position(fp)
		var col := _team_col(f["owner"])
		draw_circle(sp, 13.0, Color(0, 0, 0, 0.4))
		draw_arc(sp, 13.0, 0, TAU, 24, col, 2.0, true)
		_text(sp + Vector2(-20, 6), f["id"], 16, col, HORIZONTAL_ALIGNMENT_CENTER, 40)
		_text(sp + Vector2(-30, 30), "%dm" % int(p.global_position.distance_to(f["pos"])), 12, Color(1, 1, 1, 0.7), HORIZONTAL_ALIGNMENT_CENTER, 60)
	for o in w.soldiers:
		if o == p or o.dead or o.team != p.team:
			continue
		var hp: Vector3 = o.global_position + Vector3(0, 2.2, 0)
		if cam.is_position_behind(hp) or p.global_position.distance_to(hp) > 90.0:
			continue
		var sp := cam.unproject_position(hp)
		if not Rect2(-s, s * 3.0).has_point(sp):
			continue
		draw_colored_polygon(PackedVector2Array([sp + Vector2(-6, -8), sp + Vector2(6, -8), sp + Vector2(0, 2)]), D.TEAMS[p.team]["color"])
	# teammates down: a cross with the time they have left round it
	if not p.dead and p.vehicle == null:
		for o in w.soldiers:
			if o == p or not o.downed or o.team != p.team:
				continue
			var hp: Vector3 = o.chest() + Vector3(0, 0.9, 0)
			var dist: float = p.global_position.distance_to(hp)
			if cam.is_position_behind(hp) or dist > 70.0:
				continue
			var sp := cam.unproject_position(hp)
			draw_circle(sp, 13.0, Color(0, 0, 0, 0.45))
			draw_arc(sp, 13.0, -PI / 2.0, -PI / 2.0 + TAU * clampf(o._bleed / D.RULES["bleed"], 0.0, 1.0), 28, Color(1, 0.3, 0.25), 2.5, true)
			draw_rect(Rect2(sp + Vector2(-2, -7), Vector2(4, 14)), Color.WHITE)
			draw_rect(Rect2(sp + Vector2(-7, -2), Vector2(14, 4)), Color.WHITE)
			_text(sp + Vector2(-30, 30), "%dm" % int(dist), 12, Color(1, 1, 1, 0.75), HORIZONTAL_ALIGNMENT_CENTER, 60)
	# tickets and flags
	var cx := c.x
	_text(Vector2(cx - 260, 36), "%s  %d" % [D.TEAMS[p.team]["short"], ceili(cq.tickets[p.team])], 22, D.TEAMS[p.team]["color"], HORIZONTAL_ALIGNMENT_RIGHT, 150)
	_text(Vector2(cx + 110, 36), "%d  %s" % [ceili(cq.tickets[1 - p.team]), D.TEAMS[1 - p.team]["short"]], 22, D.TEAMS[1 - p.team]["color"], HORIZONTAL_ALIGNMENT_LEFT, 150)
	for i in cq.flags.size():
		var f: Dictionary = cq.flags[i]
		var x: float = cx - 98.0 + i * 40.0
		draw_rect(Rect2(x, 12, 34, 30), Color(0, 0, 0, 0.45))
		draw_rect(Rect2(x, 12, 34, 30), _team_col(f["owner"]), false, 2.0)
		var pr: float = f["progress"]
		draw_rect(Rect2(x, 38, 34 * absf(pr), 4), _team_col(0 if pr > 0.0 else 1))
		_text(Vector2(x, 34), f["id"], 18, _team_col(f["owner"]), HORIZONTAL_ALIGNMENT_CENTER, 34)
	# mini-map: north is wherever you face
	var mc := Vector2(100, 125)
	var mr := 80.0
	draw_circle(mc, mr, Color(0, 0, 0, 0.4))
	draw_arc(mc, mr, 0, TAU, 48, Color(1, 1, 1, 0.3), 1.5, true)
	var k := mr / 110.0
	var pp: Vector3 = p.global_position
	var rot: float = p.yaw
	for f in cq.flags:
		var d: Vector3 = f["pos"] - pp
		var v := Vector2(d.x, d.z).rotated(rot) * k
		if v.length() < mr - 8.0:
			_text(mc + v + Vector2(-10, 6), f["id"], 14, _team_col(f["owner"]), HORIZONTAL_ALIGNMENT_CENTER, 20)
	for o in w.soldiers:
		if o == p:
			continue
		if o.dead:
			if o.downed and o.team == p.team:
				var dd: Vector3 = o.global_position - pp
				var vv := Vector2(dd.x, dd.z).rotated(rot) * k
				if vv.length() < mr - 4.0:
					draw_rect(Rect2(mc + vv + Vector2(-1.5, -4.5), Vector2(3, 9)), Color(1, 0.35, 0.3))
					draw_rect(Rect2(mc + vv + Vector2(-4.5, -1.5), Vector2(9, 3)), Color(1, 0.35, 0.3))
			continue
		var mine: bool = o.team == p.team
		if not mine and o.fired > 2.0:
			continue
		var d: Vector3 = o.global_position - pp
		var v := Vector2(d.x, d.z).rotated(rot) * k
		if v.length() < mr - 3.0:
			draw_circle(mc + v, 3.0, D.TEAMS[o.team]["color"])
	draw_colored_polygon(PackedVector2Array([mc + Vector2(0, -7), mc + Vector2(5, 5), mc + Vector2(-5, 5)]), Color.WHITE)
	_feed(s, cq)
	if p.dead:
		if p.downed:
			_downed_hud(p, s, c)
		else:
			_text(Vector2(0, c.y - 20), "YOU WERE KILLED", 40, Color(1, 0.3, 0.25), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		return
	# crosshair and hit marker
	if p.ads < 0.6:
		var gap: float = 9.0 + Vector2(p.velocity.x, p.velocity.z).length() * 2.0 + (0.0 if p.crouch else 3.0) + p._bloom * 300.0
		for d in [Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN]:
			draw_line(c + d * gap, c + d * (gap + 9.0), Color(0, 0, 0, 0.5), 3.5)
			draw_line(c + d * gap, c + d * (gap + 9.0), Color(1, 1, 1, 0.9), 1.6)
	if _hit_t > 0.0:
		var col := Color(1, 0.25, 0.2) if _hit_kill else Color(1, 1, 1)
		for d in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
			draw_line(c + d * 7.0, c + d * 15.0, col, 2.5)
	if _toast_t > 0.0:
		_text(Vector2(0, c.y + 90), _toast, 22, Color(1, 0.9, 0.6, clampf(_toast_t, 0.0, 1.0)), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	# health, ammo, grenades, gadget (or the tank's)
	if p.vehicle and p.vehicle.get("air"):
		_heli_hud(p.vehicle, s, c)
	elif p.vehicle:
		_vehicle_hud(p.vehicle, s, c)
	else:
		_infantry_hud(p, s, c)
	var gname: String = D.GADGETS[D.CLASSES[p.cls]["gadget"]]["name"]
	if not touch_ui:
		if p.vehicle and p.vehicle.get("air") and p.vehicle.driver != p and not w.has_meta("shot"):
			var gunning: bool = p.vehicle.transport and p.vehicle.seat_name(p) != ""
			var tip := "Mouse aim · Left mouse fire · Right mouse zoom · " if gunning else "Mouse look · "
			if p.vehicle.transport and not p.vehicle.guns.is_empty():
				tip += "Wheel or 1 2 3 change place · "
			_text(Vector2(0, s.y - 16), tip + "E get out (on the ground)", 13, Color(1, 1, 1, 0.5), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		elif p.vehicle and p.vehicle.get("air") and not w.has_meta("shot"):
			_text(Vector2(0, s.y - 16), "W S A D fly · Space / Shift up · C / Ctrl down · Mouse look · Left mouse fire · Right mouse zoom · 1 2 3 weapons · E get out (on the ground)", 13, Color(1, 1, 1, 0.5), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and not w.has_meta("shot"):
			draw_rect(Rect2(0, c.y - 70, s.x, 120), Color(0, 0, 0, 0.5))
			_text(Vector2(0, c.y - 15), "CLICK TO PLAY", 40, Color(1, 1, 1), HORIZONTAL_ALIGNMENT_CENTER, s.x)
			_text(Vector2(0, c.y + 25), "WASD move · Shift sprint · Space jump · C crouch · Right mouse aim · R reload · 1 2 guns · G grenade · F gadget · V knife · E vehicle or revive · F2 graphics · Esc mouse", 15, Color(1, 1, 1, 0.8), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		return
	_touch(p, s)

func _feed(s: Vector2, cq) -> void:
	var y := 200.0 if touch_ui else 70.0
	for e in cq.feed:
		var a := clampf(e[5], 0.0, 1.0)
		if e[0] == "" and e[2] == "":
			_text(Vector2(s.x - 520, y), e[1], 15, Color(_team_col(e[3]), a), HORIZONTAL_ALIGNMENT_RIGHT, 500)
		else:
			_text(Vector2(s.x - 520, y), "%s   [%s]   %s" % [e[0], e[1], e[2]], 15, Color(1, 1, 1, a), HORIZONTAL_ALIGNMENT_RIGHT, 500)
		y += 22.0


## The phone controls: the stick (or where it goes) and the buttons.
func _touch(p, s: Vector2) -> void:
	var flying: bool = p.vehicle != null and p.vehicle.get("jet") != null
	var gname: String = D.GADGETS[D.CLASSES[p.cls]["gadget"]]["name"]
	if _stick_id >= 0:
		draw_circle(_stick_o, 70.0, Color(1, 1, 1, 0.12))
		draw_arc(_stick_o, 70.0, 0, TAU, 48, Color(1, 1, 1, 0.35), 2.0, true)
		draw_circle(_stick_o + (_stick_p - _stick_o).limit_length(70.0), 30.0, Color(1, 1, 1, 0.4))
	else:
		draw_arc(Vector2(150, s.y - 170), 70.0, 0, TAU, 48, Color(1, 1, 1, 0.18), 2.0, true)
		_text(Vector2(80, s.y - 165), "THROTTLE · ROLL" if flying else "MOVE", 14, Color(1, 1, 1, 0.4), HORIZONTAL_ALIGNMENT_CENTER, 140)
	var bs := _buttons()
	var names := {"fire": "FIRE", "ads": "AIM", "jump": "JUMP", "crouch": "CROUCH", "reload": "RELOAD", "switch": "GUN" if not p.vehicle else ("SEAT" if p.vehicle.get("air") and p.vehicle.driver != p else ["ROCKETS", "MISSILE", "GUN"][p.vehicle.weapon] if p.vehicle.get("air") else ("MG" if p.vehicle.weapon == 0 else "CANNON")), "up": "UP", "down": "DOWN", "use": "EXIT" if p.vehicle else ("REVIVE" if p.near_downed else "ENTER"), "grenade": "GRENADE",
		"gadget": "DETONATE" if p.cls == "recon" and p.gadget_ammo == 0 and not p.charges.is_empty() else gname.split(" ")[0], "knife": "KNIFE", "gfx": "GFX"}
	if flying:
		names.merge({"fire": "BOMBS" if p.vehicle.bomber else "GUN", "aam": "MISSILE", "flare": "FLARES", "up": "THR +", "down": "THR -"}, true)
	for kk in bs:
		var on: bool = (kk == "fire" and fire) or (kk == "ads" and ads_on) or (kk == "crouch" and p.crouch) or held(kk)
		draw_circle(bs[kk][0], bs[kk][1], Color(1, 0.55, 0.3, 0.35) if on else Color(0, 0, 0, 0.28))
		draw_arc(bs[kk][0], bs[kk][1], 0, TAU, 40, Color(1, 1, 1, 0.5), 2.0, true)
		_text(bs[kk][0] + Vector2(-60, 6), names[kk], 15 if kk != "fire" else 20, Color(1, 1, 1, 0.85), HORIZONTAL_ALIGNMENT_CENTER, 120)


func _infantry_hud(p, s: Vector2, c: Vector2) -> void:
	var g: Dictionary = p.gun()
	var hx := 28.0 if not touch_ui else 230.0
	draw_rect(Rect2(hx, s.y - 46, 220, 12), Color(0, 0, 0, 0.45))
	draw_rect(Rect2(hx, s.y - 46, 220 * maxf(p.health, 0.0) / 100.0, 12), Color(0.85, 0.9, 0.85, 0.9) if p.health > 35.0 else Color(0.9, 0.25, 0.2, 0.95))
	var fps := "" if w.has_meta("shot") else "%d FPS   " % Engine.get_frames_per_second()  # not in test films
	_text(Vector2(hx, s.y - 56), "%s   %s%s" % [D.CLASSES[p.cls]["name"], fps, w.QNAMES[w.quality]], 15)
	var ax := s.x - 30.0 - (470.0 if touch_ui else 0.0)
	var ay := s.y - 30.0 if not touch_ui else s.y - 20.0
	_text(Vector2(ax - 300, ay), "%d  /  %d" % [p.mag[p.cur], p.spare[p.cur]], 34, Color(1, 1, 1, 0.95), HORIZONTAL_ALIGNMENT_RIGHT, 300)
	_text(Vector2(ax - 300, ay - 40), String(g["name"]) + ("   RELOADING" if p._reload_t > 0.0 else ""), 17, Color(1, 0.9, 0.7, 0.9), HORIZONTAL_ALIGNMENT_RIGHT, 300)
	var gname: String = D.GADGETS[D.CLASSES[p.cls]["gadget"]]["name"]
	var gtxt := "%s x%d" % [gname, p.gadget_ammo]
	if p.cls == "recon" and p.gadget_ammo == 0 and not p.charges.is_empty():
		gtxt = "DETONATE C-4"
	_text(Vector2(ax - 400, ay - 64), ("" if touch_ui else "G ") + "GRENADE x%d     " % p.grenades + ("" if touch_ui else "F ") + gtxt, 14, Color(1, 1, 1, 0.75), HORIZONTAL_ALIGNMENT_RIGHT, 400)
	if p.reviving:
		var rt: float = D.RULES["revive_fast" if p.cls == "support" else "revive_slow"]
		_text(Vector2(0, c.y + 70), "REVIVING " + String(p.reviving.tag), 20, Color(0.6, 1, 0.7, 0.95), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		draw_rect(Rect2(c.x - 100, c.y + 80, 200, 8), Color(0, 0, 0, 0.5))
		draw_rect(Rect2(c.x - 100, c.y + 80, 200 * clampf(p._rev / rt, 0.0, 1.0), 8), Color(0.5, 1, 0.6, 0.95))
	elif p.near_downed:
		_text(Vector2(0, c.y + 70), ("" if touch_ui else "E  ") + "REVIVE " + String(p.near_downed.tag), 20, Color(0.6, 1, 0.7, 0.95), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	elif p.near_vehicle:
		_text(Vector2(0, c.y + 70), ("" if touch_ui else "E  ") + ("BOARD " if p.near_vehicle.get("transport") and p.near_vehicle.driver else "ENTER ") + String(p.near_vehicle.S["name"]), 20, Color(1, 0.9, 0.6, 0.95), HORIZONTAL_ALIGNMENT_CENTER, s.x)


## Down: the time you have left, who's coming for you, and the way out (redeploy).
func _downed_hud(p, s: Vector2, c: Vector2) -> void:
	_text(Vector2(0, c.y - 60), "YOU'RE DOWN", 40, Color(1, 0.3, 0.25), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	draw_rect(Rect2(c.x - 160, c.y - 34, 320, 10), Color(0, 0, 0, 0.5))
	draw_rect(Rect2(c.x - 160, c.y - 34, 320 * clampf(p._bleed / D.RULES["bleed"], 0.0, 1.0), 10), Color(0.9, 0.25, 0.2, 0.95))
	var msg := "WAITING FOR A TEAMMATE"
	if p.medic:
		msg = "%s IS REVIVING YOU" % p.medic.tag if p.medic._rev > 0.0 else "%s IS COMING  ·  %dm" % [p.medic.tag, int(p.medic.global_position.distance_to(p.global_position))]
	_text(Vector2(0, c.y + 6), msg, 18, Color(1, 1, 1, 0.9), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	if touch_ui:
		var b: Array = _buttons()["use"]
		draw_circle(b[0], b[1], Color(0, 0, 0, 0.35))
		draw_arc(b[0], b[1], 0, TAU, 40, Color(1, 1, 1, 0.5), 2.0, true)
		_text(b[0] + Vector2(-60, 6), "REDEPLOY", 15, Color(1, 1, 1, 0.85), HORIZONTAL_ALIGNMENT_CENTER, 120)
	else:
		_text(Vector2(0, c.y + 40), "E  REDEPLOY", 16, Color(1, 0.9, 0.6, 0.9), HORIZONTAL_ALIGNMENT_CENTER, s.x)


## In a tank: its armour, the gun's state, a ring round the crosshair while the cannon reloads, and a circle where
## the shell would land now (the gun turns slower than you look, and trees or a crest can be in its way).
func _vehicle_hud(v, s: Vector2, c: Vector2) -> void:
	var hx := 28.0 if not touch_ui else 230.0
	var hp: float = maxf(v.health, 0.0) / float(v.S["health"])
	draw_rect(Rect2(hx, s.y - 46, 220, 12), Color(0, 0, 0, 0.45))
	draw_rect(Rect2(hx, s.y - 46, 220 * hp, 12), Color(0.85, 0.9, 0.85, 0.9) if hp > 0.35 else Color(0.9, 0.25, 0.2, 0.95))
	_text(Vector2(hx, s.y - 56), "%s   %d%%" % [v.S["name"], roundi(hp * 100.0)], 15)
	var ax := s.x - 30.0 - (470.0 if touch_ui else 0.0)
	var ay := s.y - 30.0 if not touch_ui else s.y - 20.0
	var st := "MG" if v.weapon == 1 else ("READY" if v.reload <= 0.0 else "RELOADING")
	_text(Vector2(ax - 400, ay), st, 30, Color(1, 1, 1, 0.95), HORIZONTAL_ALIGNMENT_RIGHT, 400)
	_text(Vector2(ax - 400, ay - 40), String(v.S["gun"] if v.weapon == 0 else v.S["mg"]), 17, Color(1, 0.9, 0.7, 0.9), HORIZONTAL_ALIGNMENT_RIGHT, 400)
	if v.weapon == 0 and v.reload > 0.0:
		draw_arc(c, 24.0, -PI / 2.0, -PI / 2.0 + TAU * (1.0 - v.reload / float(v.S["reload"])), 32, Color(1, 1, 1, 0.6), 2.0)
	var m0: Vector3 = v.muzzle.global_position
	var gp: Vector3 = m0 - v.barrel.global_basis.z * 400.0
	var gr: Dictionary = v.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(m0, gp, 5, [v.get_rid()]))
	if not gr.is_empty():
		gp = gr.position
	if not v.cam.is_position_behind(gp):
		draw_arc(v.cam.unproject_position(gp), 11.0, 0, TAU, 24, Color(1, 0.85, 0.4, 0.9), 2.0, true)


## In a helicopter: its armour, height and speed, the weapon and what's left of it, and a circle where the chin gun
## points (it turns slower than you look).
func _heli_hud(v, s: Vector2, c: Vector2) -> void:
	var hx := 28.0 if not touch_ui else 230.0
	var hp: float = maxf(v.health, 0.0) / float(v.S["health"])
	draw_rect(Rect2(hx, s.y - 46, 220, 12), Color(0, 0, 0, 0.45))
	draw_rect(Rect2(hx, s.y - 46, 220 * hp, 12), Color(0.85, 0.9, 0.85, 0.9) if hp > 0.35 else Color(0.9, 0.25, 0.2, 0.95))
	_text(Vector2(hx, s.y - 56), "%s   %d%%" % [v.S["name"], roundi(hp * 100.0)], 15)
	var kmh := Vector2(v.velocity.x, v.velocity.z).length() * 3.6
	var info := "ALT %d M   %d KM/H" % [maxi(roundi(v.agl()), 0), roundi(kmh)]
	if v.rpm < 0.9 and v.driver == w.player:
		info = "ROTOR %d%%   HOLD UP TO TAKE OFF" % roundi(v.rpm * 100.0)
	_text(Vector2(hx, s.y - 82), info, 15, Color(1, 1, 1, 0.85))
	var ax := s.x - 30.0 - (470.0 if touch_ui else 0.0)
	var ay := s.y - 30.0 if not touch_ui else s.y - 20.0
	if v.transport:
		var line := "TROOPS %d / %d" % [v.squad(), int(v.S["seats"])]
		if v.driver != w.player:
			line = v.seat_name(w.player)
			if line == "":
				line = "RIDING IN THE BACK" if not touch_ui else "RIDING · EXIT ON THE GROUND"
		_text(Vector2(ax - 500, ay), line, 24, Color(1, 1, 1, 0.95), HORIZONTAL_ALIGNMENT_RIGHT, 500)
		return
	var n: int = v.ammo[v.weapon]
	var st := "%d" % n if n > 0 else "EMPTY"
	if v.weapon == 2 and n > 0 and v.reload > 0.0:
		st = "RELOADING"
	_text(Vector2(ax - 400, ay), st, 30, Color(1, 1, 1, 0.95), HORIZONTAL_ALIGNMENT_RIGHT, 400)
	_text(Vector2(ax - 400, ay - 40), String([v.S["gun"], v.S["rocket"], v.S["atgm"]][v.weapon]), 17, Color(1, 0.9, 0.7, 0.9), HORIZONTAL_ALIGNMENT_RIGHT, 400)
	if v.weapon == 2 and v.reload > 0.0:
		draw_arc(c, 24.0, -PI / 2.0, -PI / 2.0 + TAU * (1.0 - v.reload / float(v.S["atgm_reload"])), 32, Color(1, 1, 1, 0.6), 2.0)
	if v.weapon == 0:
		var m0: Vector3 = v.muzzle.global_position
		var gp: Vector3 = m0 - v.barrel.global_basis.z * 500.0
		var gr: Dictionary = v.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(m0, gp, 5, [v.get_rid()]))
		if not gr.is_empty():
			gp = gr.position
		if not v.cam.is_position_behind(gp):
			draw_arc(v.cam.unproject_position(gp), 11.0, 0, TAU, 24, Color(1, 0.85, 0.4, 0.9), 2.0, true)


## Flying a jet: the other jets (a red diamond on each enemy with how far off it is, a blue mark on each friend), the
## seeker's box (yellow while it locks on, red once locked), the circle you steer by and the cross where the nose and
## gun point, speed, height and throttle, the missile and ground warnings, the radar, the gun, missiles and flares.
## Red round the edges of the screen when you're hurt: a smooth fade, strongest in the corners.
func _damage(s: Vector2, a: float) -> void:
	if not _vig:
		var img := Image.create(128, 128, false, Image.FORMAT_LA8)
		for y in 128:
			for x in 128:
				var d := Vector2((x + 0.5) / 64.0 - 1.0, (y + 0.5) / 64.0 - 1.0).length()
				img.set_pixel(x, y, Color(1, 1, 1, smoothstep(0.7, 1.4, d)))
		_vig = ImageTexture.create_from_image(img)
	draw_texture_rect(_vig, Rect2(Vector2.ZERO, s), false, Color(0.4, 0.0, 0.0, minf(a, 0.65)))


func _air_hud(p, v, s: Vector2, c: Vector2, cq) -> void:
	var cam: Camera3D = v.cam
	if _hurt_t > 0.0 or v.health < 40.0:
		_damage(s, maxf(_hurt_t * 0.45, (40.0 - v.health) / 40.0 * 0.35) * 1.3)
	var cx := c.x
	_text(Vector2(cx - 260, 36), "%s  %d" % [D.TEAMS[p.team]["short"], ceili(cq.tickets[p.team])], 22, D.TEAMS[p.team]["color"], HORIZONTAL_ALIGNMENT_RIGHT, 150)
	_text(Vector2(cx + 110, 36), "%d  %s" % [ceili(cq.tickets[1 - p.team]), D.TEAMS[1 - p.team]["short"]], 22, D.TEAMS[1 - p.team]["color"], HORIZONTAL_ALIGNMENT_LEFT, 150)
	_text(Vector2(cx - 100, 36), "GROUND STRIKE" if D.air_mode == "strike" else "AIR SUPERIORITY", 13, Color(1, 1, 1, 0.6), HORIZONTAL_ALIGNMENT_CENTER, 200)
	if w.ground:
		_sites(v, cam, s)
	for o in w.vehicles:
		if o == v or o.dead:
			continue
		var op: Vector3 = o.global_position
		if cam.is_position_behind(op):
			continue
		var sp := cam.unproject_position(op)
		if not Rect2(Vector2.ZERO, s).has_point(sp):
			continue
		var col: Color = D.TEAMS[o.team]["color"]
		if o.team != p.team:
			var d: float = v.global_position.distance_to(op)
			var k := 9.0
			draw_polyline(PackedVector2Array([sp + Vector2(0, -k), sp + Vector2(k, 0), sp + Vector2(0, k), sp + Vector2(-k, 0), sp + Vector2(0, -k)]), col, 2.0, true)
			_text(sp + Vector2(-40, 26), "%.1f KM" % (d / 1000.0) if d >= 1000.0 else "%d M" % int(d), 12, Color(col, 0.9), HORIZONTAL_ALIGNMENT_CENTER, 80)
		else:
			draw_colored_polygon(PackedVector2Array([sp + Vector2(-6, -14), sp + Vector2(6, -14), sp + Vector2(0, -6)]), col)
	if v.dead:
		_text(Vector2(0, c.y - 40), "SHOT DOWN", 44, Color(1, 0.3, 0.25), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		var by := "YOU CRASHED" if v.killer == null else "BY %s  ·  %s" % [v.killer.tag, v.cause]
		_text(Vector2(0, c.y - 85), by, 18, Color(1, 1, 1, 0.8), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		if not cq.over:
			_text(Vector2(0, c.y + 10), "BACK IN THE AIR IN %d" % maxi(1, ceili(v._wreck_t)), 20, Color(1, 1, 1, 0.85), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		_feed(s, cq)
		return
	# the seeker on a jet: a box round it, blinking yellow as it locks, red once locked
	if v.seek and is_instance_valid(v.seek) and not cam.is_position_behind(v.seek.global_position):
		var bp := cam.unproject_position(v.seek.global_position)
		var locked: bool = v.lock == v.seek
		if locked or fmod(Time.get_ticks_msec() / 1000.0, 0.3) < 0.2:
			var col := Color(1, 0.2, 0.15) if locked else Color(1, 0.9, 0.3)
			draw_rect(Rect2(bp - Vector2(20, 20), Vector2(40, 40)), col, false, 2.0)
			if locked:
				_text(bp + Vector2(-40, -28), "LOCK", 14, col, HORIZONTAL_ALIGNMENT_CENTER, 80)
	# a bomber's bomb sight: the circle on the ground where the next bomb would land (red on an enemy installation)
	if v.bomber and v.ammo[0] > 0:
		var ip: Vector3 = v.impact()
		if not cam.is_position_behind(ip):
			var on := false
			for st in w.ground.enemy_sites(v.team):
				if Vector2(st.global_position.x - ip.x, st.global_position.z - ip.z).length() < float(st.radius) + 12.0:
					on = true
			var q := cam.unproject_position(ip)
			var col := Color(1, 0.3, 0.2) if on else Color(0.6, 1.0, 0.6, 0.9)
			draw_arc(q, 16.0, 0, TAU, 32, col, 2.0, true)
			for d in [Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN]:
				draw_line(q + d * 16.0, q + d * 26.0, col, 2.0)
			draw_circle(q, 2.5, col)
			if on:
				_text(q + Vector2(-60, 30), "ON TARGET", 14, col, HORIZONTAL_ALIGNMENT_CENTER, 120)
	# where you steer, and where the nose points
	var ap: Vector3 = v.global_position + v.look * 1500.0
	if not cam.is_position_behind(ap):
		draw_arc(cam.unproject_position(ap), 14.0, 0, TAU, 32, Color(1, 1, 1, 0.75), 1.5, true)
	var np: Vector3 = v.global_position - v.global_basis.z * 1000.0
	if not cam.is_position_behind(np):
		var q := cam.unproject_position(np)
		for d in [Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN]:
			draw_line(q + d * 4.0, q + d * 12.0, Color(0.6, 1.0, 0.6, 0.9), 2.0)
	if _hit_t > 0.0:
		var col := Color(1, 0.25, 0.2) if _hit_kill else Color(1, 1, 1)
		for d in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
			draw_line(c + d * 7.0, c + d * 15.0, col, 2.5)
	# warnings
	var blink := fmod(Time.get_ticks_msec() / 1000.0, 0.5) < 0.3
	if v.warn > 0.0 and blink:
		_text(Vector2(0, 110), "MISSILE", 34, Color(1, 0.25, 0.2), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	elif w.ground and w.ground.alarm != "" and (blink or w.ground.alarm == "track"):
		var al: String = w.ground.alarm
		_text(Vector2(0, 110), {"fire": "C-RAM FIRING", "track": "C-RAM LOCK", "base": "INCOMING · C-RAM ENGAGING"}[al], 26 if al != "base" else 20,
			Color(1, 0.3, 0.2) if al == "fire" else Color(1, 0.75, 0.3), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	if v.danger > 0.0 and blink:
		_text(Vector2(0, c.y + 70), "PULL UP", 30, Color(1, 0.35, 0.25), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	elif v.speed < float(v.S["stall"]) * 1.1 and blink:
		_text(Vector2(0, c.y + 70), "STALL", 30, Color(1, 0.6, 0.25), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	if _toast_t > 0.0:
		_text(Vector2(0, c.y + 110), _toast, 22, Color(1, 0.9, 0.6, clampf(_toast_t, 0.0, 1.0)), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	# speed, height, throttle
	var hx := 28.0 if not touch_ui else 230.0
	var hp: float = maxf(v.health, 0.0) / float(v.S["health"])
	draw_rect(Rect2(hx, s.y - 46, 220, 12), Color(0, 0, 0, 0.45))
	draw_rect(Rect2(hx, s.y - 46, 220 * hp, 12), Color(0.85, 0.9, 0.85, 0.9) if hp > 0.35 else Color(0.9, 0.25, 0.2, 0.95))
	_text(Vector2(hx, s.y - 56), "%s   %d%%" % [v.S["name"], roundi(hp * 100.0)], 15)
	var gp: Vector3 = v.global_position
	var agl: float = gp.y - T.height(gp.x, gp.z)
	_text(Vector2(hx, s.y - 82), "%d KM/H   ALT %d M" % [roundi(v.speed * 3.6), roundi(agl)], 15, Color(1, 1, 1, 0.85))
	draw_rect(Rect2(hx, s.y - 112, 220, 8), Color(0, 0, 0, 0.45))
	draw_rect(Rect2(hx, s.y - 112, 220 * v.throttle, 8), Color(1, 0.6, 0.3, 0.9) if v.throttle > 0.98 else Color(1, 1, 1, 0.7))
	_text(Vector2(hx, s.y - 118), "THROTTLE %d%%%s" % [roundi(v.throttle * 100.0), "  AFTERBURNER" if v.throttle > 0.98 else ""], 13, Color(1, 1, 1, 0.75))
	# weapons
	var ax := s.x - 30.0 - (470.0 if touch_ui else 0.0)
	var ay := s.y - 30.0 if not touch_ui else s.y - 20.0
	_text(Vector2(ax - 400, ay), "%d" % v.ammo[0] if v.ammo[0] > 0 else "EMPTY", 30, Color(1, 1, 1, 0.95), HORIZONTAL_ALIGNMENT_RIGHT, 400)
	_text(Vector2(ax - 400, ay - 40), String(v.S["bomb" if v.bomber else "gun"]), 17, Color(1, 0.9, 0.7, 0.9), HORIZONTAL_ALIGNMENT_RIGHT, 400)
	_text(Vector2(ax - 400, ay - 66), "%s  x%d     FLARES  x%d" % [v.S["cruise" if v.bomber else "aam"], v.ammo[1], v.flares], 15, Color(1, 1, 1, 0.8), HORIZONTAL_ALIGNMENT_RIGHT, 400)
	_radar(p, v)
	_feed(s, cq)
	if not touch_ui:
		if not w.has_meta("shot"):
			_text(Vector2(0, s.y - 16), "Mouse steer · W S throttle (full: afterburner) · A D roll · %s · Space flares · F2 graphics · Esc mouse" % ("Left mouse bombs (on the circle) · Right mouse cruise missile (lock on an installation first)" if v.bomber else "Left mouse gun · Right mouse missile (lock on first)"), 13, Color(1, 1, 1, 0.5), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and not w.has_meta("shot"):
			draw_rect(Rect2(0, c.y - 70, s.x, 120), Color(0, 0, 0, 0.5))
			_text(Vector2(0, c.y - 15), "CLICK TO FLY", 40, Color(1, 1, 1), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		return
	_touch(p, s)


## The airbases' installations: a diamond over each (an outline on the enemy's, filled on yours, grey once knocked
## out), its name and how far off for the enemy's within 1.6 km (yours within 600 m, or whichever you look at), and
## its health once hurt.
func _sites(v, cam: Camera3D, s: Vector2) -> void:
	var c := s / 2.0
	for st in w.ground.sites:
		var at: Vector3 = st.global_position + Vector3(0, float(st.top) + 6.0, 0)
		var d: float = v.global_position.distance_to(at)
		if (st.dead and d > 1500.0) or cam.is_position_behind(at):
			continue
		var sp := cam.unproject_position(at)
		if not Rect2(Vector2.ZERO, s).has_point(sp):
			continue
		var enemy: bool = st.team != v.team
		var col: Color = Color(0.63, 0.63, 0.63, 0.7) if st.dead else D.TEAMS[st.team]["color"]
		var k := 6.0
		var pts := PackedVector2Array([sp + Vector2(0, -k), sp + Vector2(k, 0), sp + Vector2(0, k), sp + Vector2(-k, 0), sp + Vector2(0, -k)])
		if enemy and not st.dead:
			draw_polyline(pts, col, 2.0, true)
		else:
			draw_colored_polygon(pts, col)
		if st.dead:
			continue
		if (enemy and d < 1600.0) or d < 600.0 or sp.distance_to(c) < 70.0:
			_text(sp + Vector2(-90, -24), "%s %s" % [st.label, "%.1fKM" % (d / 1000.0) if d >= 1000.0 else "%dM" % int(d)], 11, Color(col, 0.9), HORIZONTAL_ALIGNMENT_CENTER, 180)
		if st.hp < float(st.K["hp"]):
			draw_rect(Rect2(sp + Vector2(-14, 9), Vector2(28, 3)), Color(0, 0, 0, 0.5))
			draw_rect(Rect2(sp + Vector2(-14, 9), Vector2(28.0 * maxf(0.0, st.hp / float(st.K["hp"])), 3)), col)


## The radar: the jets within 4 km round you, turned so that ahead is up (red: enemies, blue: friends), and the two
## airbases.
func _radar(p, v) -> void:
	var mc := Vector2(100, 125)
	var mr := 80.0
	draw_circle(mc, mr, Color(0, 0, 0, 0.4))
	draw_arc(mc, mr, 0, TAU, 48, Color(1, 1, 1, 0.3), 1.5, true)
	draw_arc(mc, mr * 0.5, 0, TAU, 40, Color(1, 1, 1, 0.12), 1.0, true)
	var k := mr / 4000.0
	var pp: Vector3 = v.global_position
	var f: Vector3 = -v.global_basis.z
	var rot := atan2(f.x, -f.z)
	for t in 2:
		var b: Array = D.BASES[t]
		var bv := Vector2(b[0] - pp.x, b[1] - pp.z).rotated(-rot) * k
		if bv.length() < mr - 6.0:
			draw_rect(Rect2(mc + bv - Vector2(4, 4), Vector2(8, 8)), Color(D.TEAMS[t]["color"], 0.8), false, 1.5)
	for o in w.vehicles:
		if o == v or o.dead:
			continue
		var d: Vector3 = o.global_position - pp
		var q := Vector2(d.x, d.z).rotated(-rot) * k
		if q.length() < mr - 3.0:
			draw_circle(mc + q, 3.0 if not o.bomber else 4.5, D.TEAMS[o.team]["color"])
	if w.ground:
		for st in w.ground.sites:
			var q := Vector2(st.global_position.x - pp.x, st.global_position.z - pp.z).rotated(-rot) * k
			if q.length() < mr - 3.0:
				draw_rect(Rect2(mc + q - Vector2(2, 2), Vector2(4, 4)), Color(0.5, 0.5, 0.5) if st.dead else D.TEAMS[st.team]["color"])
	draw_colored_polygon(PackedVector2Array([mc + Vector2(0, -7), mc + Vector2(5, 5), mc + Vector2(-5, 5)]), Color.WHITE)
