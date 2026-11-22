extends CharacterBody3D
## A tank, as in the web game: the M1A2 Abrams for Vanguard, the T-90A for Onyx (their real models, made by
## tools/build_tanks.gd). One crewman drives and shoots: the hull drives and turns, the turret and gun follow where he
## aims; the main gun fires shells, the coaxial machine gun bullets. You get in and out with E (or the touch button).
## Bots take a tank left empty at their base and drive it to the flags, fighting what they meet. Rockets, C-4 and
## shells wreck it (bullets don't); a new one comes at the base.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")
const Proj := preload("res://scripts/proj.gd")
const Marks := preload("res://scripts/track_marks.gd")

var w: Node
var team := 0
var S: Dictionary
var driver: Node = null
var health := 1000.0
var dead := false
var yaw := 0.0
var speed := 0.0
var aim := Vector3.ZERO
var weapon := 0
var reload := 0.0
var zoom := 0.0
var cam: Camera3D
var body: Node3D
var turret: Node3D
var barrel: Node3D
var muzzle: Node3D
var home: Transform3D
var _meshes: Array = []
var _tracks: MultiMeshInstance3D
var _path := {}
var _roll := 0.0
var _engine: AudioStreamPlayer3D
var _mg_cd := 0.0
var _cam_yaw := 0.0
var _cam_pitch := -0.08
var _shake := 0.0
var _empty := 0.0
var _wreck_t := 0.0
var _layers := Vector2i.ZERO
var _target: Node3D = null
var _goal := Vector3.ZERO
var _goal_t := 0.0
var _think := 0.0
var _avoid := 0.0
var _avoid_dir := 1.0
var _stuck := 0.0
var _back := 0.0
var _err := Vector3.ZERO
static var _wreck_mat: StandardMaterial3D


func setup(world: Node, t: int, xf: Transform3D) -> void:
	w = world
	team = t
	S = D.TANKS[t]
	home = xf
	collision_layer = 1
	collision_mask = 1
	floor_max_angle = deg_to_rad(42.0)
	floor_snap_length = 1.5
	var sh := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 1.6
	cap.height = 7.6
	sh.shape = cap
	sh.rotation.x = PI / 2.0
	sh.position = Vector3(0, 1.6, -0.2)
	add_child(sh)
	var m: Node3D = load("res://models/%s.scn" % S["model"]).instantiate()
	add_child(m)
	body = m.get_node("body")
	turret = body.get_node("turret")
	barrel = turret.get_node("barrel")
	muzzle = barrel.get_node("muzzle")
	for mi in m.find_children("*", "MeshInstance3D", true, false):
		_meshes.append(mi)
	_path = _track_path(m)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = (body.get_node("link") as MeshInstance3D).mesh
	mm.instance_count = int(_path["n"]) * 2
	_tracks = MultiMeshInstance3D.new()
	_tracks.multimesh = mm
	body.add_child(_tracks)
	_meshes.append(_tracks)
	_links()
	# the ruts the tracks leave behind
	var ruts: MeshInstance3D = Marks.new()
	ruts.xs = _path["x"]
	ruts.z0 = (_path["cen"] as Vector2).y
	ruts.wide = clampf((body.get_node("link") as MeshInstance3D).mesh.get_aabb().size.x, 0.4, 0.8)
	add_child(ruts)
	cam = Camera3D.new()
	cam.top_level = true
	cam.near = 0.1
	cam.far = 2000.0
	add_child(cam)
	_engine = AudioStreamPlayer3D.new()
	_engine.stream = w.sounds["engine"]
	_engine.volume_db = -4.0
	_engine.unit_size = 14.0
	_engine.max_distance = 260.0
	add_child(_engine)
	_respawn()


func _respawn() -> void:
	dead = false
	health = S["health"]
	global_transform = home
	yaw = home.basis.get_euler().y
	speed = 0.0
	velocity = Vector3.ZERO
	turret.rotation = Vector3.ZERO
	barrel.rotation = Vector3.ZERO
	reload = 0.0
	weapon = 0
	_empty = 0.0
	_paint(w.detail_mat())
	_engine.play()


func _paint(m: Material) -> void:
	for mi in _meshes:
		(mi as GeometryInstance3D).material_override = m


func _track_path(m: Node3D) -> Dictionary:
	var pts: PackedVector2Array = m.get_meta("track_path")
	var cum := PackedFloat32Array()
	var length := 0.0
	var cen := Vector2.ZERO
	for i in pts.size():
		cum.append(length)
		length += pts[i].distance_to(pts[(i + 1) % pts.size()])
		cen += pts[i]
	cum.append(length)
	return {"pts": pts, "cum": cum, "len": length, "cen": cen / pts.size(), "n": int(m.get_meta("track_n")),
		"s0": float(m.get_meta("track_s0")), "x": m.get_meta("track_x")}


## The track links run round each track's path (a link's own frame: x across, y in toward the wheels, z along it).
func _links() -> void:
	var pts: PackedVector2Array = _path["pts"]
	var cum: PackedFloat32Array = _path["cum"]
	var length: float = _path["len"]
	var cen: Vector2 = _path["cen"]
	var n: int = _path["n"]
	var xs: PackedFloat32Array = _path["x"]
	var mm := _tracks.multimesh
	var m := pts.size()
	var seg := 0
	var start := fposmod(float(_path["s0"]) + _roll, length)
	for i in n:
		var s := fposmod(start + i * length / n, length)
		if s < cum[seg]:
			seg = 0
		while seg < m - 1 and cum[seg + 1] < s:
			seg += 1
		var a := pts[seg]
		var b := pts[(seg + 1) % m]
		var p := a.lerp(b, (s - cum[seg]) / maxf(cum[seg + 1] - cum[seg], 0.0001))
		var dv := (b - a).normalized()
		var inn := Vector2(-dv.y, dv.x)
		if inn.dot(cen - p) < 0.0:
			inn = -inn
		var zz := Vector3(0, dv.x, dv.y)
		var yy := Vector3(0, inn.x, inn.y)
		var bs := Basis(yy.cross(zz), yy, zz)
		mm.set_instance_transform(i, Transform3D(bs, Vector3(xs[0], p.x, p.y)))
		mm.set_instance_transform(i + n, Transform3D(bs, Vector3(xs[1], p.x, p.y)))


func _physics_process(dt: float) -> void:
	if dead:
		_wreck_t -= dt
		if _wreck_t <= 0.0 and not w.conquest.over:
			_respawn()
		return
	reload = maxf(0.0, reload - dt)
	_mg_cd -= dt
	var c := [0.0, 0.0, false]
	if driver == null:
		_empty += dt
		if fmod(_empty, 1.0) < dt:
			_find_crew()
		aim = global_position + Vector3(-sin(yaw), 0.0, -cos(yaw)) * 60.0 + Vector3(0, 2.4, 0)
	elif driver == w.player:
		c = _drive_player(dt)
	else:
		c = _drive_bot(dt)
	if w.conquest.over:
		c = [0.0, 0.0, false]
	_move(dt, c[0], c[1])
	_aim_gun(dt)
	if c[2] and driver:
		if weapon == 0:
			_cannon()
		else:
			_mg()
	if driver:
		driver.global_position = global_position + Vector3(0, 1.2, 0)
		_roadkill()
	_engine.pitch_scale = 0.75 + absf(speed) / float(S["speed"]) * 0.55
	if driver == w.player:
		_camera(dt)


func _move(dt: float, thr: float, steer: float) -> void:
	var top: float = S["speed"] if thr >= 0.0 else S["reverse"]
	speed = move_toward(speed, thr * top, float(S["accel"]) * (1.0 if absf(thr) > 0.05 else 1.6) * dt)
	yaw += steer * float(S["turn"]) * dt
	rotation = Vector3(0, yaw, 0)
	velocity.x = -sin(yaw) * speed
	velocity.z = -cos(yaw) * speed
	velocity.y = -2.0 if is_on_floor() else velocity.y - 20.0 * dt
	move_and_slide()
	if is_on_wall() and absf(speed) > 1.5:
		speed *= 0.5
	var p := global_position
	var lim: float = D.PLAY_HALF - 8.0
	if absf(p.x) > lim or absf(p.z) > lim:
		global_position = Vector3(clampf(p.x, -lim, lim), p.y, clampf(p.z, -lim, lim))
	# the hull sits on the slope; the tracks roll
	var x := global_position.x
	var z := global_position.z
	var n := Vector3((T.height(x - 2.0, z) - T.height(x + 2.0, z)) / 4.0, 1.0, (T.height(x, z - 3.0) - T.height(x, z + 3.0)) / 6.0)
	var up := (global_basis.inverse() * n).normalized()
	body.quaternion = body.quaternion.slerp(Quaternion(Vector3.UP, up), 1.0 - exp(-6.0 * dt))
	if absf(speed) > 0.05:
		_roll = fposmod(_roll + speed * dt, float(_path["len"]))
		_links()


func _aim_gun(dt: float) -> void:
	var lh := body.to_local(aim) - turret.position
	var want := atan2(-lh.x, -lh.z)
	var step: float = float(S["turret"]) * dt
	turret.rotation.y += clampf(wrapf(want - turret.rotation.y, -PI, PI), -step, step)
	var lb := turret.to_local(aim) - barrel.position
	var pitch := atan2(lb.y, Vector2(lb.x, lb.z).length())
	barrel.rotation.x = move_toward(barrel.rotation.x, clampf(pitch, -0.14, 0.36), 0.7 * dt)


func _cannon() -> void:
	if reload > 0.0:
		return
	reload = float(S["reload"]) if driver == w.player else float(S["bot_reload"])
	var from := muzzle.global_position
	var pr := Proj.new()
	pr.label = S["gun"]
	pr.ignore = get_rid()
	pr.launch(w, "shell", from, -barrel.global_basis.z, driver)
	w.flash(from, 2.2)
	w.sound3d("boom", from, 2.0)
	_shake = 0.35
	if driver != w.player:
		_err = Vector3(randf_range(-1, 1), randf_range(-0.4, 0.4), randf_range(-1, 1))


func _mg() -> void:
	if _mg_cd > 0.0:
		return
	_mg_cd = 0.1
	var from := barrel.global_transform * Vector3(0.42, 0.12, -1.6)
	var spread := 0.006 if driver == w.player else 0.012 + float(driver.diff["aim"]) * 0.4
	var dir := (-barrel.global_basis.z + Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * spread).normalized()
	var end := from + dir * 350.0
	var r := get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from, end, 7, [get_rid()]))
	if not r.is_empty():
		end = r.position
		var c: Object = r.collider
		if c.has_method("damage") and c != self:
			var head: bool = r.position.y > (c as Node3D).global_position.y + 1.45
			var killed: bool = c.damage(26.0 * float(D.RULES["bullet"]) * (2.0 if head else 1.0), global_position, driver, head, S["mg"])
			if driver == w.player and c.get("S") == null:
				w.hud.hitmark(killed, head)
		else:
			w.impact(r.position, r.normal)
	w.tracer(from, end)
	w.sound3d("lmg", from, -3.0)


## Bullets only scratch the armour.
func damage(_amount: float, _from: Vector3, _attacker: Node, _head := false, _weapon := "") -> bool:
	return false


## Rockets, C-4 and shells (world.explode).
func hurt(amount: float, by: Node, what: String) -> void:
	if dead or (by and by.get("team") == team):
		return
	health -= amount
	if by == w.player:
		w.hud.hitmark(health <= 0.0, false)
	if driver == w.player and by:
		w.hud.hurt(by.global_position)
	if health <= 0.0:
		_destroy(by, what)


func _destroy(by: Node, what: String) -> void:
	dead = true
	_wreck_t = float(S["respawn"])
	speed = 0.0
	_engine.stop()
	if not _wreck_mat:
		_wreck_mat = StandardMaterial3D.new()
		_wreck_mat.albedo_color = Color(0.07, 0.065, 0.06)
		_wreck_mat.roughness = 1.0
	_paint(_wreck_mat)
	var d := driver
	if d:
		if d == w.player:
			exit()
		else:
			_let_out(d)
		d._protect = 0.0
		d.damage(999.0, global_position, by, false, what)
	if by and by != d and by.get("score") != null:
		by.score += 300
	if by == w.player:
		w.hud.toast("+300  %s DESTROYED" % S["name"])
	w.conquest.note("%s DESTROYED" % S["name"], 1 - team)
	w.explode(global_position + Vector3(0, 1.4, 0), 7.0, 80.0, by, what)
	for i in 3:
		w.flash(global_position + Vector3(randf_range(-2, 2), 1.5 + i, randf_range(-3, 3)), 3.0)


func enter(s: Node) -> void:
	if dead or driver:
		return
	driver = s
	s.vehicle = self
	_target = null
	_goal_t = 0.0
	if s == w.player:
		_layers = Vector2i(s.collision_layer, s.collision_mask)
		s.collision_layer = 0
		s.collision_mask = 0
		s.velocity = Vector3.ZERO
		s.vm.visible = false
		s.knife.visible = false
		_cam_yaw = yaw + turret.rotation.y
		_cam_pitch = -0.08
		zoom = 0.0
		_camera(0.0)
		cam.current = true
		w.hud.toast(S["name"])
	else:
		s.visible = false
		s.process_mode = Node.PROCESS_MODE_DISABLED
	w.sound3d("reload", global_position, -2.0)


## You get out on the right-hand side; a bot only leaves a wreck.
func exit() -> void:
	var p := driver
	if p == null:
		return
	if p != w.player:
		_let_out(p)
		return
	driver = null
	p.vehicle = null
	_empty = 0.0
	var spot := global_position + global_basis.x * 3.4
	spot.y = T.height(spot.x, spot.z) + 0.4
	p.global_position = spot
	p.collision_layer = _layers.x
	p.collision_mask = _layers.y
	p.vm.visible = true
	p.yaw = _cam_yaw
	p.pitch = clampf(_cam_pitch, -1.2, 1.2)
	p.camera.current = true


func _let_out(d: Node) -> void:
	driver = null
	d.vehicle = null
	d.process_mode = Node.PROCESS_MODE_INHERIT
	d.visible = true
	d.global_position = global_position + global_basis.x * 3.4 + Vector3(0, 0.5, 0)


func _camera(dt: float) -> void:
	var dir := Vector3(-sin(_cam_yaw) * cos(_cam_pitch), sin(_cam_pitch), -cos(_cam_yaw) * cos(_cam_pitch))
	var space := get_world_3d().direct_space_state
	var pivot := global_position + Vector3(0, 3.6, 0)
	var back := pivot - dir * 10.5 + Vector3(0, 1.4, 0)
	var r := space.intersect_ray(PhysicsRayQueryParameters3D.create(pivot, back, 1, [get_rid()]))
	if not r.is_empty():
		back = r.position + (pivot - back).normalized() * 0.5
	var pos := back.lerp(turret.global_transform * Vector3(0.55, 1.15, -0.6), zoom)
	_shake = move_toward(_shake, 0.0, dt * 1.5)
	if _shake > 0.0:
		pos += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * _shake * 0.15
	cam.global_transform = Transform3D(Basis.looking_at(dir, Vector3.UP), pos)
	cam.fov = lerpf(w.fov, 20.0, zoom)
	var hit := space.intersect_ray(PhysicsRayQueryParameters3D.create(pos, pos + dir * 900.0, 5, [get_rid()]))
	aim = hit.position if not hit.is_empty() else pos + dir * 900.0


func _drive_player(dt: float) -> Array:
	var hud = w.hud
	var p = w.player
	var mouse_ok: bool = not hud.touch_ui and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	var look: Vector2 = (p._mouse * 0.0022 + hud.take_look() * 0.0055) * float(w.sens) * lerpf(1.0, 0.3, zoom)
	p._mouse = Vector2.ZERO
	_cam_yaw -= look.x
	_cam_pitch = clampf(_cam_pitch - look.y, -0.55, 0.4)
	var mv: Vector2 = hud.move
	if not hud.touch_ui:
		if Input.is_physical_key_pressed(KEY_W): mv.y -= 1.0
		if Input.is_physical_key_pressed(KEY_S): mv.y += 1.0
		if Input.is_physical_key_pressed(KEY_A): mv.x -= 1.0
		if Input.is_physical_key_pressed(KEY_D): mv.x += 1.0
	var want_zoom: bool = (mouse_ok and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)) or hud.ads_on
	zoom = move_toward(zoom, 1.0 if want_zoom else 0.0, dt * 5.0)
	if hud.take("switch"):
		weapon = 1 - weapon
	if hud.take("use"):
		exit()
		return [0.0, 0.0, false]
	var fire: bool = (mouse_ok and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)) or hud.fire
	return [clampf(-mv.y, -1.0, 1.0), clampf(-mv.x, -1.0, 1.0), fire]


## A bot crew: drive to a flag, slow down to fight what it sees (tanks first), swerve round walls, back off when stuck.
func _drive_bot(dt: float) -> Array:
	_think -= dt
	if _think <= 0.0:
		_think = 0.4
		_target = _pick_target()
		if _goal_t <= 0.0 or Vector2(global_position.x - _goal.x, global_position.z - _goal.z).length() < 14.0:
			_new_goal()
	_goal_t -= dt
	var to := _goal - global_position
	var dist := Vector2(to.x, to.z).length()
	var turn := wrapf(atan2(-to.x, -to.z) - yaw, -PI, PI)
	var thr := 1.0 if dist > 14.0 else 0.0
	if absf(turn) > 1.2:
		thr = 0.25
	var steer := clampf(turn * 1.8, -1.0, 1.0)
	var fire := false
	if is_instance_valid(_target):
		var tank: bool = _target.get("S") != null
		var tp := _target.global_position + Vector3(0, 1.8 if tank else 1.3, 0)
		var td := global_position.distance_to(tp)
		if td < 120.0:
			thr = minf(thr, 0.15)
		aim = tp + _err * float(driver.diff["aim"]) * td * 0.8
		if (-barrel.global_basis.z).dot((aim - muzzle.global_position).normalized()) > 0.997:
			weapon = 0 if tank or td > 70.0 else 1
			fire = weapon == 1 or reload <= 0.0
	else:
		aim = global_position + Vector3(-sin(yaw), 0.0, -cos(yaw)) * 60.0 + Vector3(0, 2.4, 0)
	if _back > 0.0:
		_back -= dt
		return [-0.8, _avoid_dir, fire]
	if _avoid > 0.0:
		_avoid -= dt
		steer = _avoid_dir
		thr = minf(thr, 0.55)
	elif thr > 0.2:
		var eye := global_position + Vector3(0, 1.5, 0)
		if _blocked(eye, yaw, 12.0):
			if not _blocked(eye, yaw + 0.7, 12.0):
				_avoid_dir = 1.0
			elif not _blocked(eye, yaw - 0.7, 12.0):
				_avoid_dir = -1.0
			else:
				_avoid_dir = 1.0 if randf() < 0.5 else -1.0
			_avoid = 1.3
	if thr > 0.4 and absf(speed) < 0.6:
		_stuck += dt
		if _stuck > 2.2:
			_stuck = 0.0
			_back = 1.8
			_avoid_dir = 1.0 if randf() < 0.5 else -1.0
	else:
		_stuck = 0.0
	return [thr, steer, fire]


func _blocked(from: Vector3, a: float, d: float) -> bool:
	var q := PhysicsRayQueryParameters3D.create(from, from + Vector3(-sin(a), 0, -cos(a)) * d, 1, [get_rid()])
	var r := get_world_3d().direct_space_state.intersect_ray(q)
	return not r.is_empty() and (r.normal as Vector3).y < 0.7


func _pick_target() -> Node3D:
	var best: Node3D = null
	var bd := 150.0
	var eye := turret.global_position + Vector3(0, 1.3, 0)
	var space := get_world_3d().direct_space_state
	for v in w.vehicles:
		if v == self or v.dead or v.team == team or v.driver == null:
			continue
		var d: float = global_position.distance_to(v.global_position) - 50.0
		if d < bd and space.intersect_ray(PhysicsRayQueryParameters3D.create(eye, v.global_position + Vector3(0, 1.8, 0), 1, [get_rid(), v.get_rid()])).is_empty():
			best = v
			bd = d
	for s in w.soldiers:
		if s.dead or s.team == team or s.get("vehicle"):
			continue
		var d: float = global_position.distance_to(s.global_position)
		if d < bd and space.intersect_ray(PhysicsRayQueryParameters3D.create(eye, s.global_position + Vector3(0, 1.2, 0), 1, [get_rid()])).is_empty():
			best = s
			bd = d
	if best != _target:
		_err = Vector3(randf_range(-1, 1), randf_range(-0.4, 0.4), randf_range(-1, 1))
	return best


func _new_goal() -> void:
	var best := global_position
	var bd := INF
	for f in w.conquest.flags:
		var d: float = global_position.distance_to(f["pos"]) * (1.0 if f["owner"] != team else 2.5) + randf() * 60.0
		if d < bd:
			bd = d
			best = f["pos"]
	var a := randf() * TAU
	_goal = best + Vector3(cos(a), 0, sin(a)) * randf_range(4.0, 11.0)
	_goal_t = 50.0


## A bot climbs into a tank standing empty at its base (on your side only after a while, so you can take it first).
func _find_crew() -> void:
	if _empty < (12.0 if team == w.player.team else 2.0):
		return
	var best: Node = null
	var bd := 35.0
	for s in w.soldiers:
		if s == w.player or s.dead or s.team != team or s.get("vehicle"):
			continue
		var d: float = s.global_position.distance_to(global_position)
		if d < bd:
			best = s
			bd = d
	if best:
		enter(best)


func _roadkill() -> void:
	if absf(speed) < 2.5:
		return
	for s in w.soldiers:
		if s.dead or s.team == team or s.get("vehicle"):
			continue
		var l := to_local(s.global_position)
		if absf(l.x) < 2.1 and absf(l.z) < 4.3 and l.y > -1.0 and l.y < 2.5:
			s.damage(999.0, global_position, driver, false, "ROADKILL")
