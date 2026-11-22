extends CharacterBody3D
## An attack helicopter, as in the web game: the AH-64E Apache for Vanguard, the Mi-24V Hind for Onyx (their real
## models, made by tools/build_helis.gd). One pilot flies and fights. The mouse (or a drag) looks round and the nose
## follows; W/S fly forward and back, A/D sideways; Space/Shift climb, C/Ctrl come down (UP and DOWN on a phone); let
## go and it hovers, and it lifts itself over the ground ahead. Its weapons: the chin gun (it turns to your sight),
## rockets, and guided missiles that fly to wherever you keep the sight. Get in at its pad, out once it's down; land
## back on the pad to rearm and patch up. Bots take one left empty at their base and hunt tanks first, then whatever
## else they see. Bullets chip at it; rockets, missiles, shells and RPGs bring it down, and a new one comes to the pad.
## A transport (S has "seats": the UH-60 and the Mi-8) carries no weapons but a squad: bots climb aboard on its pad,
## and its bot pilot sets them down near a flag their side doesn't hold, then comes back for more. You can fly it
## (the soldiers aboard get out where you land) or ride in it, and get out once it's down.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")
const Proj := preload("res://scripts/proj.gd")

var air := true
var transport := false
var riders: Array = []
var crouch := false  # (what the bots' sights read off a target)
var reach := Vector2(5.0, 7.5)  # (how close you get in from, across and along)
var w: Node
var team := 0
var S: Dictionary
var driver: Node = null
var health := 600.0
var dead := false
var yaw := 0.0
var aim := Vector3.ZERO
var weapon := 0
var reload := 0.0
var ammo := [0, 0, 0]
var rpm := 0.0
var zoom := 0.0
var cam: Camera3D
var model: Node3D
var chin: Node3D
var barrel: Node3D
var muzzle: Node3D
var home: Transform3D
var _spin: Node3D
var _tspin: Node3D
var _blur: MeshInstance3D
var _blur_m: StandardMaterial3D
var _sound: AudioStreamPlayer3D
var _meshes: Array = []
var _stores: Array = []
var _rockets := PackedVector3Array()
var _atgms := PackedVector3Array()
var _rest := 1.3
var _tilt := Vector2.ZERO
var _turn := 0.0
var _gun_cd := 0.0
var _gun_n := 0
var _rk_cd := 0.0
var _rk_side := 0
var _cam_yaw := 0.0
var _cam_pitch := -0.15
var _shake := 0.0
var _empty := 0.0
var _svc := 0.0
var _wreck_t := 0.0
var _fall := false
var _killer: Node = null
var _what := ""
var _layers := Vector2i.ZERO
var _target: Node3D = null
var _goal := Vector3.ZERO
var _goal_t := 0.0
var _think := 0.0
var _circle := 1.0
var _circle_t := 0.0
var _burst := 0.0
var _err := Vector3.ZERO
var _rtb := false
var _state := "wait"
var _state_t := 0.0
var _lz := Vector3.ZERO
var _dropped := false
var _down_t := 0.0
var _ride_t := 0.0
static var _wreck_mat: StandardMaterial3D


func setup(world: Node, t: int, xf: Transform3D, spec: Dictionary) -> void:
	w = world
	team = t
	S = spec
	transport = S.has("seats")
	collision_layer = 1
	collision_mask = 1
	motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	for b in S["hit"]:
		var sh := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = Vector3(b[3], b[4], b[5]) * 2.0
		sh.shape = box
		sh.position = Vector3(b[0], b[1], b[2])
		add_child(sh)
	model = load("res://models/%s.scn" % S["model"]).instantiate()
	add_child(model)
	_spin = model.get_node("rotor/spin")
	_tspin = model.get_node("trotor/tspin")
	chin = model.get_node("chin")
	barrel = chin.get_node("barrel")
	muzzle = barrel.get_node("muzzle")
	_rest = model.get_meta("rest")
	_rockets = model.get_meta("rockets")
	_atgms = model.get_meta("atgms")
	for n in model.get_children():
		if String(n.name).begins_with("atgm"):
			_stores.append(n)
	for mi in model.find_children("*", "GeometryInstance3D", true, false):
		_meshes.append(mi)
	# the blur of the blades going round
	var disc := CylinderMesh.new()
	disc.top_radius = float(model.get_meta("r"))
	disc.bottom_radius = disc.top_radius
	disc.height = 0.02
	disc.radial_segments = 48
	disc.rings = 1
	_blur_m = StandardMaterial3D.new()
	_blur_m.albedo_color = Color(0.08, 0.08, 0.08, 0.0)
	_blur_m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_blur_m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_blur_m.cull_mode = BaseMaterial3D.CULL_DISABLED
	_blur = MeshInstance3D.new()
	_blur.mesh = disc
	_blur.material_override = _blur_m
	_blur.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	model.get_node("rotor").add_child(_blur)
	home = xf
	home.origin.y += _rest + 0.05
	cam = Camera3D.new()
	cam.top_level = true
	cam.near = 0.1
	cam.far = 2000.0
	add_child(cam)
	_sound = AudioStreamPlayer3D.new()
	_sound.stream = w.sounds["rotor"]
	_sound.unit_size = 22.0
	_sound.max_distance = 450.0
	add_child(_sound)
	_respawn()


func _respawn() -> void:
	dead = false
	_fall = false
	health = S["health"]
	global_transform = home
	yaw = home.basis.get_euler().y
	rotation = Vector3(0, yaw, 0)
	velocity = Vector3.ZERO
	model.rotation = Vector3.ZERO
	_tilt = Vector2.ZERO
	chin.rotation = Vector3.ZERO
	barrel.rotation = Vector3.ZERO
	_rearm()
	weapon = 0
	rpm = 0.0
	_empty = 0.0
	_rtb = false
	_paint(null)


func _rearm() -> void:
	ammo = [int(S.get("gun_ammo", 0)), int(S.get("rockets", 0)), _atgms.size()]
	reload = 0.0
	for s in _stores:
		s.visible = true


func _paint(m: Material) -> void:
	for mi in _meshes:
		(mi as GeometryInstance3D).material_override = m


func next_weapon() -> void:
	if transport:
		return
	weapon = (weapon + 1) % 3


func pick_weapon(i: int) -> void:
	if transport:
		return
	weapon = clampi(i, 0, 2)


## How high it is off the ground under it.
func agl() -> float:
	return global_position.y - _rest - T.height(global_position.x, global_position.z)


func _physics_process(dt: float) -> void:
	_turn_rotors(dt)
	if dead:
		if _fall:
			_crash(dt)
		else:
			_wreck_t -= dt
			if _wreck_t <= 0.0 and not w.conquest.over:
				_respawn()
		return
	reload = maxf(0.0, reload - dt)
	_gun_cd -= dt
	_rk_cd -= dt
	var c := [0.0, 0.0, 0.0, yaw, false]
	if driver == null:
		_empty += dt
		if fmod(_empty, 1.0) < dt:
			_find_crew()
		aim = global_position + Vector3(-sin(yaw), -0.3, -cos(yaw)) * 60.0
		c[2] = -0.5
	elif driver == w.player:
		c = _fly_player(dt)
	elif transport:
		c = _fly_transport(dt)
	else:
		c = _fly_bot(dt)
	if w.conquest.over:
		c = [0.0, 0.0, 0.0, yaw, false]
	rpm = move_toward(rpm, 1.0 if driver else 0.0, dt / 3.0)
	_move(dt, c[0], c[1], c[2], c[3])
	_aim_gun(dt)
	if c[4] and driver and not transport:
		if weapon == 0:
			_gun()
		elif weapon == 1:
			_rocket()
		else:
			_missile()
	_service(dt)
	if driver:
		driver.global_position = global_position + Vector3(0, 1.2, 0)
	for r in riders:
		r.global_position = global_position + Vector3(0, 1.0, 0)
	if transport:
		_ride_t -= dt
		if _ride_t <= 0.0:
			_ride_t = 1.0
			_find_riders()
		# flying it yourself: the soldiers aboard get out where you put it down (not on your own pad)
		_down_t = _down_t + dt if driver == w.player and _landed() and _flat(home.origin) > 30.0 else 0.0
		if _down_t > 1.5 and riders.any(func(r): return r != w.player):
			_drop()
			w.hud.toast("TROOPS OUT")
	if driver == w.player:
		_camera(dt)
	elif riders.has(w.player):
		_ride(dt)


func _move(dt: float, fwd: float, side: float, up: float, want_yaw: float) -> void:
	var b := Basis(Vector3.UP, yaw)
	var pos := global_position
	var landed := _landed()
	if rpm < 0.9:
		fwd = 0.0
		side = 0.0
		up = minf(up, 0.0)
	if landed and up <= 0.0:
		fwd = 0.0
		side = 0.0
	var top: float = S["speed"] if fwd > 0.0 else S["back"]
	var want := b * Vector3(side * float(S["side"]), 0.0, -fwd * top)
	var hv := Vector3(velocity.x, 0.0, velocity.z).move_toward(want, float(S["accel"]) * dt)
	var vy := up * float(S["climb"])
	var ground := T.height(pos.x, pos.z)
	if not landed:
		# it lifts itself over the ground ahead (unless it's slow: then you can put it down)
		var floor_y := ground
		for k in [1.0, 2.0, 3.5]:
			var a: Vector3 = pos + hv * k
			floor_y = maxf(floor_y, T.height(a.x, a.z))
		var low := floor_y + _rest + (4.0 if hv.length() > 6.0 else 0.3)
		if pos.y < low:
			vy = maxf(vy, minf((low - pos.y) * 2.5, float(S["climb"]) * 1.5))
	if pos.y > ground + float(S["ceiling"]):
		vy = minf(vy, ground + float(S["ceiling"]) - pos.y)
	velocity = Vector3(hv.x, move_toward(velocity.y, vy, 16.0 * dt), hv.z)
	var turn := 0.0
	if not landed and rpm >= 0.9:
		var step: float = float(S["yaw_rate"]) * dt
		turn = clampf(wrapf(want_yaw - yaw, -PI, PI), -step, step)
		yaw += turn
	rotation = Vector3(0, yaw, 0)
	var before := velocity
	move_and_slide()
	# a hard knock (a wall, a hillside, a roof) hurts
	var knock := (before - velocity).length()
	if knock > 12.0:
		_hit((knock - 12.0) * 22.0, null, "CRASH")
		if dead:
			return
	var p := global_position
	var lim: float = D.PLAY_HALF - 6.0
	if absf(p.x) > lim or absf(p.z) > lim:
		global_position = Vector3(clampf(p.x, -lim, lim), p.y, clampf(p.z, -lim, lim))
	# it leans into the way it's going: nose down to speed up forward, banked into sideways moves and turns
	_turn = lerpf(_turn, turn / maxf(dt, 0.001), 1.0 - exp(-4.0 * dt))
	var lv := b.inverse() * velocity
	var gain := b.inverse() * (want - hv)
	var tp := clampf(lv.z / float(S["speed"]) * 0.2 + gain.z * 0.012, -0.32, 0.26)
	var tr := clampf(-lv.x / float(S["side"]) * 0.2 - gain.x * 0.01 + _turn * 0.18, -0.38, 0.38)
	if landed:
		tp = 0.0
		tr = 0.0
	_tilt = _tilt.lerp(Vector2(tp, tr), 1.0 - exp(-3.0 * dt))
	model.rotation = Vector3(_tilt.x, 0, _tilt.y)


## On its gear: on the ground, the pad or a roof.
func _landed() -> bool:
	var from := global_position + Vector3(0, 0.5 - _rest, 0)
	var q := PhysicsRayQueryParameters3D.create(from, from + Vector3(0, -0.9, 0), 1, [get_rid()])
	return not get_world_3d().direct_space_state.intersect_ray(q).is_empty()


func _turn_rotors(dt: float) -> void:
	if dead:
		rpm = move_toward(rpm, 0.0, dt * 0.25)
	_spin.rotation.y = fposmod(_spin.rotation.y + 15.0 * rpm * dt, TAU)
	_tspin.rotation.x = fposmod(_tspin.rotation.x + 24.0 * rpm * dt, TAU)
	_blur.visible = rpm > 0.4
	_blur_m.albedo_color.a = 0.07 * rpm
	if rpm > 0.02:
		_sound.pitch_scale = 0.55 + 0.45 * rpm
		_sound.volume_db = linear_to_db(rpm) + 3.0
		if not _sound.playing:
			_sound.play()
	elif _sound.playing:
		_sound.stop()


## The chin gun turns and elevates toward the sight, within its limits.
func _aim_gun(dt: float) -> void:
	var lh := model.to_local(aim) - chin.position
	chin.rotation.y = move_toward(chin.rotation.y, clampf(atan2(-lh.x, -lh.z), -1.9, 1.9), 2.6 * dt)
	var lb := chin.to_local(aim)
	barrel.rotation.x = move_toward(barrel.rotation.x, clampf(atan2(lb.y, Vector2(lb.x, lb.z).length()), -1.05, 0.18), 2.2 * dt)


func _gun() -> void:
	if _gun_cd > 0.0 or ammo[0] <= 0:
		return
	_gun_cd = float(S["gun_cd"])
	ammo[0] -= 1
	_gun_n += 1
	var me: bool = driver == w.player
	var from := muzzle.global_position
	var spread := 0.004 if me else 0.008 + float(driver.diff["aim"]) * 0.25
	var dir := (-barrel.global_basis.z + Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * spread).normalized()
	var end := from + dir * 600.0
	var r := get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from, end, 7, [get_rid()]))
	if not r.is_empty():
		end = r.position
		var c: Object = r.collider
		var dmg: float = float(S["gun_dmg"]) * float(D.RULES["bullet"]) * (1.0 if me else float(driver.diff["dmg"]))
		if c.get("S") != null and c.get("air") == null:
			c.hurt(float(S["gun_veh"]), driver, S["gun"])
			w.impact(r.position, r.normal)
		elif c.has_method("damage") and c != self:
			var killed: bool = c.damage(dmg, global_position, driver, false, S["gun"])
			if me and c.get("S") == null:
				w.hud.hitmark(killed, false)
			w.impact(r.position, r.normal, c.get("S") == null)
		else:
			w.impact(r.position, r.normal)
		if S["gun_he"]:
			_splash(r.position, c)
	w.tracer(from, end)
	if _gun_n % 2 == 0 or float(S["gun_cd"]) > 0.08:
		w.sound3d("lmg", from, 1.0)
	if me:
		_shake = maxf(_shake, 0.08)


## A 30 mm shell bursts: it wounds whoever stands close by.
func _splash(at: Vector3, hit: Object) -> void:
	for s in w.soldiers:
		if s == hit or s.dead or s.team == team or s.get("vehicle"):
			continue
		var d: float = s.global_position.distance_to(at)
		if d < 2.5:
			s.damage(30.0 * (1.0 - d / 2.5), at, driver, false, S["gun"])


func _rocket() -> void:
	if _rk_cd > 0.0 or ammo[1] <= 0:
		return
	_rk_cd = 0.16
	ammo[1] -= 1
	_rk_side = (_rk_side + 1) % _rockets.size()
	var from := model.global_transform * _rockets[_rk_side]
	var nose := -model.global_basis.z
	var dir := (aim - from).normalized()
	if dir.dot(nose) < 0.8:
		dir = nose
	var sp := 0.01 if driver == w.player else 0.02 + float(driver.diff["aim"]) * 0.2
	dir = (dir + Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * sp).normalized()
	var pr := Proj.new()
	pr.label = S["rocket"]
	pr.ignore = get_rid()
	pr.launch(w, "hydra", from, dir, driver)
	pr.vel += velocity
	w.flash(from, 0.9)
	w.sound3d("pistol", from, 1.0)


func _missile() -> void:
	if reload > 0.0 or ammo[2] <= 0:
		return
	reload = float(S["atgm_reload"]) * (1.0 if driver == w.player else 1.6)
	ammo[2] -= 1
	var i: int = ammo[2]
	if i < _stores.size():
		_stores[i].visible = false
	var from := model.global_transform * _atgms[i % _atgms.size()]
	var pr := Proj.new()
	pr.label = S["atgm"]
	pr.ignore = get_rid()
	pr.seek = self
	pr.launch(w, "atgm", from, (-model.global_basis.z * 2.0 + (aim - from).normalized()).normalized(), driver)
	pr.vel += velocity
	w.flash(from, 1.2)
	w.sound3d("boom", from, -8.0)


## Down on its own pad it rearms, and mends.
func _service(dt: float) -> void:
	if Vector2(global_position.x - home.origin.x, global_position.z - home.origin.z).length() > 16.0 or not _landed():
		_svc = 0.0
		return
	_svc += dt
	if _svc > 2.0 and _svc - dt <= 2.0:
		var full: bool = ammo[0] == int(S.get("gun_ammo", 0)) and ammo[1] == int(S.get("rockets", 0)) and ammo[2] == _atgms.size()
		_rearm()
		if driver == w.player and not full:
			w.hud.toast("REARMED")
	if _svc > 2.0:
		health = minf(float(S["health"]), health + 120.0 * dt)


## Bullets chip at it.
func damage(amount: float, _from: Vector3, attacker: Node, _head := false, weapon_name := "") -> bool:
	if dead or (attacker and attacker.get("team") == team):
		return false
	_hit(amount * 0.5, attacker, weapon_name)
	if attacker == w.player:
		w.hud.hitmark(dead, false)
	return dead


## Rockets, missiles, shells, RPGs and C-4 (world.explode).
func hurt(amount: float, by: Node, what: String) -> void:
	if dead or (by and by.get("team") == team):
		return
	_hit(amount, by, what)
	if by == w.player:
		w.hud.hitmark(dead, false)


func _hit(amount: float, by: Node, what: String) -> void:
	health -= amount
	if driver == w.player and by:
		w.hud.hurt(by.global_position)
	if health <= 0.0:
		_destroy(by, what)


## Shot down: it blows up and, if it was flying, falls spinning and blows up again where it hits.
func _destroy(by: Node, what: String) -> void:
	dead = true
	_killer = by
	_what = what
	_wreck_t = float(S["respawn"])
	_fall = not _landed()
	if not _wreck_mat:
		_wreck_mat = StandardMaterial3D.new()
		_wreck_mat.albedo_color = Color(0.07, 0.065, 0.06)
		_wreck_mat.roughness = 1.0
	_paint(_wreck_mat)
	var d := driver
	for x in [d] + riders.duplicate():
		if x == null:
			continue
		if x == w.player:
			exit(true)
		else:
			_let_out(x)
		x._protect = 0.0
		x.damage(999.0, global_position, by, false, what)
	if by and by != d and by.get("score") != null:
		by.score += 300
	if by == w.player:
		w.hud.toast("+300  %s DESTROYED" % S["name"])
	w.conquest.note("%s DESTROYED" % S["name"], 1 - team)
	w.explode(global_position, 6.0, 80.0, by, what)
	for i in 3:
		w.flash(global_position + Vector3(randf_range(-2, 2), 1.0 + i, randf_range(-3, 3)), 3.0)


func _crash(dt: float) -> void:
	velocity.y -= 18.0 * dt
	velocity.x = move_toward(velocity.x, 0.0, 4.0 * dt)
	velocity.z = move_toward(velocity.z, 0.0, 4.0 * dt)
	yaw += 2.4 * dt
	rotation = Vector3(0, yaw, 0)
	model.rotation.x = move_toward(model.rotation.x, -0.3, 0.4 * dt)
	model.rotation.z = move_toward(model.rotation.z, 0.35, 0.5 * dt)
	move_and_slide()
	if get_slide_collision_count() > 0 or _landed() or agl() < 0.2:
		_fall = false
		velocity = Vector3.ZERO
		w.explode(global_position, 7.0, 90.0, _killer if is_instance_valid(_killer) else null, _what)
		for i in 2:
			w.flash(global_position + Vector3(randf_range(-2, 2), 1.0 + i, randf_range(-2, 2)), 3.5)


## Whether there's a place for someone: the pilot's, or a seat in the back of a transport with a pilot.
func can_take(_s: Node) -> bool:
	return not dead and (driver == null or (transport and riders.size() < int(S["seats"])))


func enter(s: Node) -> void:
	if dead:
		return
	if driver and transport and riders.size() < int(S["seats"]):
		_board(s)
		return
	if driver:
		return
	driver = s
	s.vehicle = self
	_target = null
	_goal_t = 0.0
	_go("wait")
	_take(s)
	if s == w.player:
		w.hud.toast(S["name"])
	w.sound3d("reload", global_position, -2.0)


func _board(s: Node) -> void:
	riders.append(s)
	s.vehicle = self
	_take(s)
	if s == w.player:
		w.hud.toast("ABOARD THE %s" % S["name"])


## Someone gets in: you see from behind it; a bot is hidden away till he gets out.
func _take(s: Node) -> void:
	if s == w.player:
		_layers = Vector2i(s.collision_layer, s.collision_mask)
		s.collision_layer = 0
		s.collision_mask = 0
		s.velocity = Vector3.ZERO
		s.vm.visible = false
		s.knife.visible = false
		_cam_yaw = yaw
		_cam_pitch = -0.15
		zoom = 0.0
		_camera(0.0)
		cam.current = true
	else:
		s.visible = false
		s.process_mode = Node.PROCESS_MODE_DISABLED


## You get out once it's down (or as it's shot down): the pilot on the right, from the back on the left; a bot pilot
## only leaves a wreck.
func exit(force := false) -> void:
	var p = w.player
	var pilot: bool = driver == p
	if not pilot and not riders.has(p):
		return
	if not force and not _landed() and agl() > 3.0:
		w.hud.toast("LAND TO GET OUT" if pilot else "TOO HIGH TO JUMP")
		return
	if pilot:
		driver = null
		_empty = 0.0
	else:
		riders.erase(p)
	p.vehicle = null
	var spot := global_position + global_basis.x * float(S["exit"]) * (1.0 if pilot else -1.0)
	spot.y = maxf(T.height(spot.x, spot.z), global_position.y - _rest) + 0.4
	p.global_position = spot
	p.collision_layer = _layers.x
	p.collision_mask = _layers.y
	p.vm.visible = true
	p.yaw = _cam_yaw
	p.pitch = clampf(_cam_pitch, -1.2, 1.2)
	p.camera.current = true


func _let_out(d: Node, side := 1.0) -> void:
	if d == driver:
		driver = null
	riders.erase(d)
	d.vehicle = null
	d.process_mode = Node.PROCESS_MODE_INHERIT
	d.visible = true
	var spot := global_position + global_basis.x * float(S["exit"]) * side + global_basis.z * randf_range(-2.0, 2.0)
	d.global_position = Vector3(spot.x, maxf(T.height(spot.x, spot.z), global_position.y - _rest) + 0.5, spot.z)


func _camera(dt: float) -> void:
	var dir := Vector3(-sin(_cam_yaw) * cos(_cam_pitch), sin(_cam_pitch), -cos(_cam_yaw) * cos(_cam_pitch))
	var space := get_world_3d().direct_space_state
	var pivot := global_position + Vector3(0, 2.4, 0)
	var back := pivot - dir * float(S["cam"]) + Vector3(0, 2.5, 0)
	var r := space.intersect_ray(PhysicsRayQueryParameters3D.create(pivot, back, 1, [get_rid()]))
	if not r.is_empty():
		back = r.position + (pivot - back).normalized() * 0.5
	var pos := back.lerp(chin.global_transform * Vector3(0, 0.4, -0.6), zoom)
	_shake = move_toward(_shake, 0.0, dt * 1.5)
	if _shake > 0.0:
		pos += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * _shake * 0.15
	cam.global_transform = Transform3D(Basis.looking_at(dir, Vector3.UP), pos)
	cam.fov = lerpf(w.fov, 22.0, zoom)
	var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(pos, pos + dir * 1200.0, 5, [get_rid()]))
	aim = hit.position if not hit.is_empty() else pos + dir * 1200.0


func _fly_player(dt: float) -> Array:
	var hud = w.hud
	var p = w.player
	var mouse_ok: bool = not hud.touch_ui and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	var look: Vector2 = (p._mouse * 0.0022 + hud.take_look() * 0.0055) * float(w.sens) * lerpf(1.0, 0.3, zoom)
	p._mouse = Vector2.ZERO
	_cam_yaw -= look.x
	_cam_pitch = clampf(_cam_pitch - look.y, -1.25, 0.5)
	var mv: Vector2 = hud.move
	var up := 0.0
	if not hud.touch_ui:
		if Input.is_physical_key_pressed(KEY_W): mv.y -= 1.0
		if Input.is_physical_key_pressed(KEY_S): mv.y += 1.0
		if Input.is_physical_key_pressed(KEY_A): mv.x -= 1.0
		if Input.is_physical_key_pressed(KEY_D): mv.x += 1.0
		if Input.is_physical_key_pressed(KEY_SPACE) or Input.is_physical_key_pressed(KEY_SHIFT): up += 1.0
		if Input.is_physical_key_pressed(KEY_C) or Input.is_physical_key_pressed(KEY_CTRL): up -= 1.0
	if hud.held("up"): up += 1.0
	if hud.held("down"): up -= 1.0
	var want_zoom: bool = (mouse_ok and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)) or hud.ads_on
	zoom = move_toward(zoom, 1.0 if want_zoom else 0.0, dt * 5.0)
	if hud.take("switch"):
		next_weapon()
	if hud.take("use"):
		exit()
		if driver != p:
			return [0.0, 0.0, 0.0, yaw, false]
	var fire: bool = (mouse_ok and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)) or hud.fire
	return [clampf(-mv.y, -1.0, 1.0), clampf(mv.x, -1.0, 1.0), clampf(up, -1.0, 1.0), _cam_yaw, fire]


## A bot pilot: lift off, fly to a flag at its cruise height and hunt there: tanks first (with missiles), helicopters,
## then soldiers (gun and rockets), standing off and sliding round its target. Low on everything, or badly hit, it
## goes back to its pad, and stays there till it's rearmed and mended.
func _fly_bot(dt: float) -> Array:
	_think -= dt
	if _think <= 0.0:
		_think = 0.5
		_target = _pick_target()
		if _goal_t <= 0.0 or _flat(_goal) < 30.0:
			_new_goal()
	_goal_t -= dt
	var pos := global_position
	var fwd := 0.0
	var side := 0.0
	var face := yaw
	var fire := false
	if (ammo[1] <= 0 and ammo[2] <= 0 and ammo[0] < 150) or health < float(S["health"]) * 0.3:
		_rtb = true
	elif _rtb and _svc > 2.0 and health >= float(S["health"]) - 1.0:
		_rtb = false
	var low := _rtb
	if is_instance_valid(_target) and not low:
		var tp := _target.global_position + Vector3(0, 1.3, 0)
		var to := tp - pos
		var flat := Vector2(to.x, to.z).length()
		face = atan2(-to.x, -to.z)
		fwd = 1.0 if flat > 190.0 else (-0.6 if flat < 70.0 else 0.0)
		_circle_t -= dt
		if _circle_t <= 0.0:
			_circle_t = randf_range(4.0, 8.0)
			_circle = -_circle
		side = 0.5 * _circle
		aim = tp + _err * float(driver.diff["aim"]) * to.length() * 0.6
		var armour: bool = _target.get("S") != null
		if absf(wrapf(face - yaw, -PI, PI)) < 0.2 and flat < 400.0:
			if armour and _target.get("air") == null and ammo[2] > 0:
				weapon = 2
				fire = reload <= 0.0
			elif flat < 240.0:
				_burst -= dt
				if _burst < -1.0:
					_burst = randf_range(0.8, 1.6)
				weapon = 1 if ammo[1] > 0 and (armour or flat > 120.0) else 0
				fire = _burst > 0.0 and ammo[weapon] > 0
	else:
		var dest := home.origin if low else _goal
		var to := dest - pos
		var flat := Vector2(to.x, to.z).length()
		if flat > 3.0:
			face = atan2(-to.x, -to.z)
		fwd = clampf(flat / 45.0, 0.0, 1.0) * (1.0 if absf(wrapf(face - yaw, -PI, PI)) < 0.5 else 0.25)
		aim = pos + Vector3(-sin(yaw), -0.3, -cos(yaw)) * 60.0
	var up := 0.0
	if low and _flat(home.origin) < 8.0:
		# down onto the pad
		up = -0.6
		fwd = 0.0
		side = 0.0
	else:
		var g := T.height(pos.x, pos.z)
		var want_y := g + float(S["cruise"])
		if is_instance_valid(_target):
			# level with a helicopter it's after; well over anything on the ground (a crest, a roof)
			if _target.get("air"):
				want_y = clampf(_target.global_position.y, g + 15.0, g + 60.0)
			else:
				want_y = maxf(want_y, _target.global_position.y + 18.0)
		up = clampf((want_y - pos.y) / 6.0, -1.0, 1.0)
		if _landed():
			fwd = 0.0
			side = 0.0
			up = 1.0
	return [fwd, side, up, face, fire]


func _flat(p: Vector3) -> float:
	return Vector2(global_position.x - p.x, global_position.z - p.z).length()


func _pick_target() -> Node3D:
	var best: Node3D = null
	var bd := 380.0
	var eye := global_position + Vector3(0, -1.0, 0)
	for v in w.vehicles:
		if v == self or v.dead or v.team == team or v.driver == null:
			continue
		var d: float = global_position.distance_to(v.global_position) - (140.0 if v.get("air") == null else 80.0)
		if d < bd and _clear(eye, v.global_position + Vector3(0, 1.5, 0), v):
			best = v
			bd = d
	for s in w.soldiers:
		if s.dead or s.team == team or s.get("vehicle"):
			continue
		var d: float = global_position.distance_to(s.global_position)
		if d < minf(bd, 260.0) and _clear(eye, s.global_position + Vector3(0, 1.2, 0), null):
			best = s
			bd = d
	if best != _target:
		_err = Vector3(randf_range(-1, 1), randf_range(-0.4, 0.4), randf_range(-1, 1))
	return best


func _clear(a: Vector3, b: Vector3, other: Node) -> bool:
	var ex := [get_rid()]
	if other:
		ex.append(other.get_rid())
	return get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(a, b, 1, ex)).is_empty()


func _new_goal() -> void:
	var best := global_position
	var bd := INF
	for f in w.conquest.flags:
		var d: float = global_position.distance_to(f["pos"]) * (1.0 if f["owner"] != team else 2.5) + randf() * 90.0
		if d < bd:
			bd = d
			best = f["pos"]
	var a := randf() * TAU
	_goal = best + Vector3(cos(a), 0, sin(a)) * randf_range(20.0, 50.0)
	_goal_t = 40.0


## A bot climbs into a helicopter standing empty at its base (on your side only after a while, so you can take it);
## after longer, one just deployed anywhere can deploy straight into it.
func _find_crew() -> void:
	if _empty < (12.0 if team == w.player.team else 2.0):
		return
	var best: Node = null
	var bd := 60.0
	for s in w.soldiers:
		if s == w.player or s.dead or s.team != team or s.get("vehicle"):
			continue
		var d: float = s.global_position.distance_to(global_position)
		if _empty > 15.0 and s._protect > 0.0:
			d = minf(d, 59.0)
		if d < bd:
			best = s
			bd = d
	if best:
		enter(best)

## Riding in the back: look round, and get out (E) once it's down.
func _ride(dt: float) -> void:
	var hud = w.hud
	var p = w.player
	var look: Vector2 = (p._mouse * 0.0022 + hud.take_look() * 0.0055) * float(w.sens)
	p._mouse = Vector2.ZERO
	_cam_yaw -= look.x
	_cam_pitch = clampf(_cam_pitch - look.y, -1.25, 0.5)
	zoom = 0.0
	if hud.take("use"):
		exit()
		if not riders.has(p):
			return
	_camera(dt)


## The soldiers aboard get out (both sides) and make for a flag.
func _drop() -> void:
	var i := 0
	for r in riders.duplicate():
		if r == w.player:
			continue
		_let_out(r, -1.0 if i % 2 == 0 else 1.0)
		r._pick_goal()
		i += 1


## Bots climb aboard a transport with a pilot, waiting on its pad: those nearby, and some just deployed (into it).
func _find_riders() -> void:
	var room: int = int(S["seats"]) - riders.size()
	if room <= 0 or driver == null or dead or _flat(home.origin) > 16.0 or not _landed():
		return
	for s in w.soldiers:
		if room <= 0:
			break
		if s == w.player or s.dead or s.team != team or s.get("vehicle"):
			continue
		if s.global_position.distance_to(global_position) < 60.0 or (s._protect > 0.0 and randf() < 0.7):
			_board(s)
			room -= 1


func _go(st: String) -> void:
	_state = st
	_state_t = 0.0
	_dropped = false


## A bot flying a transport: it waits on its pad till it has a squad aboard (or you), takes them to land on open
## ground short of the nearest flag its side doesn't hold, lets them out and comes back. Badly hit, it turns home.
func _fly_transport(dt: float) -> Array:
	_state_t += dt
	var pos := global_position
	var face := yaw
	var fwd := 0.0
	var up := 0.0
	var g := T.height(pos.x, pos.z)
	if _state == "go" and health < float(S["health"]) * 0.35:
		_go("back")
	match _state:
		"wait":
			if not _landed() or _flat(home.origin) > 16.0:
				_go("back")
			elif riders.size() >= int(S["seats"]) or (riders.size() >= 3 and _state_t > 10.0) or (riders.has(w.player) and _state_t > 4.0) or (not riders.is_empty() and _state_t > 25.0):
				_lz = _pick_lz()
				_go("go")
		"go", "back":
			var dest := _lz if _state == "go" else home.origin
			var to := dest - pos
			var flat := Vector2(to.x, to.z).length()
			if flat > 2.0:
				face = atan2(-to.x, -to.z)
			var lined := absf(wrapf(face - yaw, -PI, PI)) < 0.5
			if flat > 45.0:
				fwd = 1.0 if lined else 0.25
				up = clampf((g + float(S["cruise"]) - pos.y) / 6.0, -1.0, 1.0)
			else:
				# slowing over the spot, then down onto it
				fwd = clampf(flat / 45.0, 0.0, 0.6) * (1.0 if lined else 0.3)
				up = -0.8 if flat < 10.0 else clampf((g + 12.0 - pos.y) / 6.0, -1.0, 1.0)
			if _landed() and flat < 25.0 and _state_t > 3.0:
				_go("drop" if _state == "go" else "wait")
		"drop":
			if _state_t > 0.8 and not _dropped:
				_drop()
				_dropped = true
			if _state_t > (8.0 if riders.has(w.player) else 3.5):
				_go("back")
	return [fwd, 0.0, up, face, false]


## Where to set the soldiers down: open ground (no roof, tree or wall under the rotor) 28-45 m short of the nearest
## flag its side doesn't hold, on the side it comes from.
func _pick_lz() -> Vector3:
	var best: Dictionary = {}
	var bd := INF
	for f in w.conquest.flags:
		var d := _flat(f["pos"]) * (1.0 if f["owner"] != team else 3.0)
		if d < bd:
			bd = d
			best = f
	var fp: Vector3 = best["pos"]
	var back := Vector3(home.origin.x - fp.x, 0.0, home.origin.z - fp.z).normalized()
	var space := get_world_3d().direct_space_state
	for i in 10:
		var c := fp + back.rotated(Vector3.UP, randf_range(-1.0, 1.0)) * randf_range(28.0, 45.0)
		var clear := true
		for o in [Vector3.ZERO, Vector3(8, 0, 0), Vector3(-8, 0, 0), Vector3(0, 0, 8), Vector3(0, 0, -8)]:
			var q: Vector3 = c + o
			var h := T.height(q.x, q.z)
			var r := space.intersect_ray(PhysicsRayQueryParameters3D.create(Vector3(q.x, h + 40.0, q.z), Vector3(q.x, h - 1.0, q.z), 1, [get_rid()]))
			if r.is_empty() or (r.position as Vector3).y > h + 0.6:
				clear = false
				break
		if clear:
			return Vector3(c.x, T.height(c.x, c.z), c.z)
	return fp + back * 45.0

