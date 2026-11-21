extends Control
## HUD (crosshair, hit markers, health, ammo) and the touch controls for phones and tablets.

var w: Node
var move := Vector2.ZERO
var fire := false
var ads_on := false
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
var _kill_t := 0.0
var _font: Font


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


func take_look() -> Vector2:
	var v := _look
	_look = Vector2.ZERO
	return v


func hitmark(killed: bool, _head: bool) -> void:
	_hit_t = 0.18
	_hit_kill = killed


func hurt() -> void:
	_hurt_t = 1.0


func kill() -> void:
	_kill_t = 1.5


func _buttons() -> Dictionary:
	var s := size
	return {"fire": [Vector2(s.x - 165, s.y - 175), 72.0], "ads": [Vector2(s.x - 310, s.y - 95), 46.0],
		"jump": [Vector2(s.x - 70, s.y - 300), 42.0], "crouch": [Vector2(s.x - 70, s.y - 80), 40.0],
		"reload": [Vector2(s.x - 300, s.y - 250), 40.0], "switch": [Vector2(s.x - 185, s.y - 340), 40.0],
		"gfx": [Vector2(s.x - 50, 115), 30.0]}


func _button_at(pos: Vector2) -> String:
	var bs := _buttons()
	for k in bs:
		if pos.distance_to(bs[k][0]) < bs[k][1] * 1.15:
			return k
	return ""


func _input(e: InputEvent) -> void:
	if e is InputEventScreenTouch:
		touch_ui = true
		if e.pressed:
			var b := _button_at(e.position)
			if b == "fire":
				fire = true
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
				fire = false
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
	_kill_t -= dt
	queue_redraw()


func _text(pos: Vector2, t: String, sz: int, c := Color(1, 1, 1, 0.9), align := HORIZONTAL_ALIGNMENT_LEFT, width := -1.0) -> void:
	draw_string(_font, pos + Vector2(1.5, 1.5), t, align, width, sz, Color(0, 0, 0, 0.6))
	draw_string(_font, pos, t, align, width, sz, c)


func _draw() -> void:
	var p = w.player
	if p == null:
		return
	var s := size
	var c := s / 2.0
	# damage: red edges
	if _hurt_t > 0.0 or p.health < 60.0:
		var a := maxf(_hurt_t * 0.45, (60.0 - p.health) / 60.0 * 0.4)
		for i in 6:
			var m := 18.0 * i
			draw_rect(Rect2(m, m, s.x - 2 * m, s.y - 2 * m), Color(0.6, 0.0, 0.0, a * (1.0 - i / 6.0)), false, 18.0)
	# crosshair
	if p.ads < 0.6 and not p.dead:
		var gap: float = 9.0 + Vector2(p.velocity.x, p.velocity.z).length() * 2.0 + (0.0 if p.crouch else 3.0)
		for d in [Vector2.RIGHT, Vector2.LEFT, Vector2.UP, Vector2.DOWN]:
			draw_line(c + d * gap, c + d * (gap + 9.0), Color(0, 0, 0, 0.5), 3.5)
			draw_line(c + d * gap, c + d * (gap + 9.0), Color(1, 1, 1, 0.9), 1.6)
	if _hit_t > 0.0:
		var col := Color(1, 0.25, 0.2) if _hit_kill else Color(1, 1, 1)
		for d in [Vector2(1, 1), Vector2(-1, 1), Vector2(1, -1), Vector2(-1, -1)]:
			draw_line(c + d * 7.0, c + d * 15.0, col, 2.5)
	# health, ammo, kills, frame rate
	draw_rect(Rect2(28, s.y - 46, 220, 12), Color(0, 0, 0, 0.45))
	draw_rect(Rect2(28, s.y - 46, 220 * maxf(p.health, 0.0) / 100.0, 12), Color(0.85, 0.9, 0.85, 0.9) if p.health > 35.0 else Color(0.9, 0.25, 0.2, 0.95))
	_text(Vector2(28, s.y - 56), "HEALTH", 15)
	var g: Dictionary = p.GUNS[p.cur]
	var ammo_x := s.x - 30.0 - (330.0 if touch_ui else 0.0)
	var ammo_y := 60.0 if touch_ui else s.y - 30.0
	_text(Vector2(ammo_x - 300, ammo_y), "%d  /  %d" % [p.mag[p.cur], p.spare[p.cur]], 34, Color(1, 1, 1, 0.95), HORIZONTAL_ALIGNMENT_RIGHT, 300)
	_text(Vector2(ammo_x - 300, ammo_y - 40), String(g["name"]) + ("   RELOADING" if p._reload_t > 0.0 else ""), 17, Color(1, 0.9, 0.7, 0.9), HORIZONTAL_ALIGNMENT_RIGHT, 300)
	_text(Vector2(s.x - 330, 40), "KILLS  %d" % w.kills, 22, Color(1, 0.85, 0.5) if _kill_t > 0.0 else Color(1, 1, 1, 0.9), HORIZONTAL_ALIGNMENT_RIGHT, 300 if not touch_ui else 230)
	_text(Vector2(24, 34), "%d FPS   GRAPHICS: %s%s" % [Engine.get_frames_per_second(), w.QNAMES[w.quality], "" if touch_ui else " (G)"], 16, Color(1, 1, 1, 0.75))
	_text(Vector2(24, 56), "Godot %s  %s" % [Engine.get_version_info()["string"], w.method], 13, Color(1, 1, 1, 0.5))
	if p.dead:
		_text(Vector2(0, c.y - 20), "YOU WERE KILLED", 40, Color(1, 0.3, 0.25), HORIZONTAL_ALIGNMENT_CENTER, s.x)
	if not touch_ui:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED and not w.has_meta("shot"):
			draw_rect(Rect2(0, c.y - 70, s.x, 120), Color(0, 0, 0, 0.5))
			_text(Vector2(0, c.y - 15), "CLICK TO PLAY", 40, Color(1, 1, 1), HORIZONTAL_ALIGNMENT_CENTER, s.x)
			_text(Vector2(0, c.y + 25), "WASD move · Shift sprint · Space jump · C crouch · Right mouse aim · R reload · 1 2 3 / wheel guns · G graphics · Esc mouse", 16, Color(1, 1, 1, 0.8), HORIZONTAL_ALIGNMENT_CENTER, s.x)
		return
	# touch controls
	if _stick_id >= 0:
		draw_circle(_stick_o, 70.0, Color(1, 1, 1, 0.12))
		draw_arc(_stick_o, 70.0, 0, TAU, 48, Color(1, 1, 1, 0.35), 2.0, true)
		draw_circle(_stick_o + (_stick_p - _stick_o).limit_length(70.0), 30.0, Color(1, 1, 1, 0.4))
	else:
		draw_arc(Vector2(150, s.y - 170), 70.0, 0, TAU, 48, Color(1, 1, 1, 0.18), 2.0, true)
		_text(Vector2(80, s.y - 165), "MOVE", 14, Color(1, 1, 1, 0.4), HORIZONTAL_ALIGNMENT_CENTER, 140)
	var bs := _buttons()
	var names := {"fire": "FIRE", "ads": "AIM", "jump": "JUMP", "crouch": "CROUCH", "reload": "RELOAD", "switch": "GUN", "gfx": "GFX"}
	for k in bs:
		var on: bool = (k == "fire" and fire) or (k == "ads" and ads_on) or (k == "crouch" and p.crouch)
		draw_circle(bs[k][0], bs[k][1], Color(1, 0.55, 0.3, 0.35) if on else Color(0, 0, 0, 0.28))
		draw_arc(bs[k][0], bs[k][1], 0, TAU, 40, Color(1, 1, 1, 0.5), 2.0, true)
		_text(bs[k][0] + Vector2(-60, 6), names[k], 15 if k != "fire" else 20, Color(1, 1, 1, 0.85), HORIZONTAL_ALIGNMENT_CENTER, 120)
