extends CharacterBody3D
## The first-person soldier: movement, three guns, recoil and aiming down sights. Mouse and keyboard, or touch.

const GUNS := [
	{"name": "M4A1", "auto": true, "rpm": 780.0, "dmg": 30.0, "mag": 30, "spare": 150, "spread": 1.6, "ads_spread": 0.2, "kick": 1.0, "fov": 50.0, "reload": 2.2, "snd": "rifle", "range": 350.0, "hip": Vector3(0.17, -0.19, -0.5), "ads_y": 0.075, "muzzle": Vector3(0, 0.012, -0.66)},
	{"name": "MP7", "auto": true, "rpm": 950.0, "dmg": 22.0, "mag": 40, "spare": 200, "spread": 2.2, "ads_spread": 0.45, "kick": 0.65, "fov": 58.0, "reload": 1.9, "snd": "smg", "range": 180.0, "hip": Vector3(0.16, -0.18, -0.46), "ads_y": 0.062, "muzzle": Vector3(0, 0.01, -0.2)},
	{"name": "M17", "auto": false, "rpm": 420.0, "dmg": 38.0, "mag": 17, "spare": 85, "spread": 1.6, "ads_spread": 0.35, "kick": 1.7, "fov": 66.0, "reload": 1.5, "snd": "pistol", "range": 140.0, "hip": Vector3(0.14, -0.15, -0.42), "ads_y": 0.045, "muzzle": Vector3(0, 0.02, -0.15)},
]

var w: Node
var head: Node3D
var camera: Camera3D
var vm: Node3D
var guns: Array[Node3D] = []
var flashes: Array[Node3D] = []
var shape: CollisionShape3D
var cur := 0
var mag: Array[int] = []
var spare: Array[int] = []
var yaw := 0.0
var pitch := 0.0
var ads := 0.0
var crouch := false
var health := 100.0
var dead := false
var shot_t := 99.0
var _mouse := Vector2.ZERO
var _fire_cd := 0.0
var _reload_t := 0.0
var _switch_t := 0.0
var _flash_t := 0.0
var _kick := 0.0
var _vkick := Vector2.ZERO
var _bob := 0.0
var _step := 0.0
var _regen := 0.0
var _trig_was := false
var _sway := Vector2.ZERO
var _lower := 0.0
var _jump_q := false


func _ready() -> void:
	w = get_parent()
	collision_layer = 2
	collision_mask = 5
	floor_max_angle = deg_to_rad(50)
	shape = CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.35
	cap.height = 1.8
	shape.shape = cap
	shape.position.y = 0.9
	add_child(shape)
	head = Node3D.new()
	head.position.y = 1.62
	add_child(head)
	camera = Camera3D.new()
	camera.fov = 78.0
	camera.near = 0.03
	camera.far = 1500.0
	head.add_child(camera)
	camera.current = true
	vm = Node3D.new()
	camera.add_child(vm)
	for i in GUNS.size():
		guns.append(_build_gun(i))
		mag.append(GUNS[i]["mag"])
		spare.append(GUNS[i]["spare"])
	_select(0, false)


func _part(parent: Node3D, kind: String, size: Vector3, pos: Vector3, rx: float, m: Material) -> void:
	var mi := MeshInstance3D.new()
	if kind == "p":
		var pm := CapsuleMesh.new()
		pm.radius = size.x
		pm.height = size.y
		mi.mesh = pm
		rx += PI / 2
	elif kind == "c":
		var cm := CylinderMesh.new()
		cm.top_radius = size.x
		cm.bottom_radius = size.x
		cm.height = size.y
		cm.radial_segments = 12
		mi.mesh = cm
	else:
		var bm := BoxMesh.new()
		bm.size = size
		mi.mesh = bm
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.position = pos
	mi.rotation.x = rx
	parent.add_child(mi)


func _build_gun(i: int) -> Node3D:
	var g := Node3D.new()
	vm.add_child(g)
	var M: Material = w.mat("gunmetal")
	var P: Material = w.mat("polymer")
	var parts := []
	if i == 0:
		parts = [["b", Vector3(0.055, 0.075, 0.3), Vector3(0, 0, 0), 0.0, M], ["b", Vector3(0.062, 0.062, 0.26), Vector3(0, 0.002, -0.27), 0.0, P],
			["c", Vector3(0.011, 0.2, 0), Vector3(0, 0.01, -0.5), PI / 2, M], ["b", Vector3(0.022, 0.03, 0.05), Vector3(0, 0.012, -0.62), 0.0, M],
			["b", Vector3(0.045, 0.075, 0.2), Vector3(0, -0.012, 0.24), 0.0, P], ["b", Vector3(0.028, 0.13, 0.06), Vector3(0, -0.1, -0.06), 0.25, M],
			["b", Vector3(0.03, 0.09, 0.045), Vector3(0, -0.075, 0.08), -0.35, P], ["b", Vector3(0.025, 0.012, 0.42), Vector3(0, 0.044, -0.12), 0.0, M],
			["b", Vector3(0.034, 0.042, 0.08), Vector3(0, 0.072, -0.02), 0.0, M]]
	elif i == 1:
		parts = [["b", Vector3(0.05, 0.075, 0.22), Vector3(0, 0, 0), 0.0, P], ["c", Vector3(0.01, 0.08, 0), Vector3(0, 0.01, -0.15), PI / 2, M],
			["b", Vector3(0.025, 0.08, 0.03), Vector3(0, -0.075, -0.08), 0.0, P], ["b", Vector3(0.028, 0.17, 0.035), Vector3(0, -0.1, 0.06), -0.2, M],
			["b", Vector3(0.008, 0.008, 0.18), Vector3(0.018, -0.005, 0.2), 0.0, M], ["b", Vector3(0.008, 0.008, 0.18), Vector3(-0.018, -0.005, 0.2), 0.0, M],
			["b", Vector3(0.04, 0.06, 0.012), Vector3(0, -0.01, 0.29), 0.0, P], ["b", Vector3(0.032, 0.036, 0.07), Vector3(0, 0.058, 0.0), 0.0, M]]
	else:
		parts = [["b", Vector3(0.03, 0.033, 0.19), Vector3(0, 0.02, -0.05), 0.0, M], ["b", Vector3(0.028, 0.025, 0.16), Vector3(0, -0.005, -0.04), 0.0, P],
			["b", Vector3(0.03, 0.1, 0.05), Vector3(0, -0.06, 0.03), 0.25, P], ["b", Vector3(0.004, 0.01, 0.006), Vector3(0, 0.041, -0.135), 0.0, M],
			["b", Vector3(0.02, 0.01, 0.006), Vector3(0, 0.041, 0.035), 0.0, M]]
	for p in parts:
		_part(g, p[0], p[1], p[2], p[3], p[4])
	if i < 2:
		_part(g, "b", Vector3(0.004, 0.004, 0.002), Vector3(0, GUNS[i]["ads_y"], -0.06), 0.0, w.glow_mat(Color(1, 0.1, 0.05), 6.0))
	# hands and sleeves
	var front := Vector3(-0.01, -0.05, -0.28) if i == 0 else (Vector3(0, -0.1, -0.08) if i == 1 else Vector3(-0.012, -0.075, 0.03))
	_part(g, "b", Vector3(0.05, 0.06, 0.09), Vector3(0.005, -0.065, 0.09), -0.3, w.mat("glove"))
	_part(g, "p", Vector3(0.042, 0.38, 0), Vector3(0.04, -0.13, 0.3), 0.35, w.mat("camo"))
	_part(g, "b", Vector3(0.05, 0.06, 0.09), front, 0.0, w.mat("glove"))
	var fa := MeshInstance3D.new()
	var fb := CapsuleMesh.new()
	fb.radius = 0.042
	fb.height = 0.4
	fa.mesh = fb
	fa.material_override = w.mat("camo")
	fa.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	g.add_child(fa)
	fa.position = front + Vector3(-0.1, -0.06, 0.16)
	fa.rotation = Vector3(0.3 + PI / 2, -0.55, 0)
	# muzzle flash
	var f := Node3D.new()
	g.add_child(f)
	f.position = GUNS[i]["muzzle"]
	var q := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(0.22, 0.22)
	q.mesh = qm
	q.material_override = w.flash_material()
	q.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	f.add_child(q)
	var l := OmniLight3D.new()
	l.light_color = Color(1.0, 0.7, 0.4)
	l.light_energy = 2.5
	l.omni_range = 6.0
	f.add_child(l)
	f.visible = false
	flashes.append(f)
	g.visible = false
	return g


func _select(i: int, anim := true) -> void:
	if i == cur and anim:
		return
	guns[cur].visible = false
	cur = i
	guns[cur].visible = true
	_reload_t = 0.0
	_switch_t = 0.35 if anim else 0.0


func _input(e: InputEvent) -> void:
	if e is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_mouse += e.screen_relative
	elif e is InputEventMouseButton and e.pressed:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
			_trig_was = true
		elif e.button_index == MOUSE_BUTTON_WHEEL_UP:
			_select((cur + GUNS.size() - 1) % GUNS.size())
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_select((cur + 1) % GUNS.size())
	elif e is InputEventKey and e.pressed and not e.echo:
		match e.physical_keycode:
			KEY_ESCAPE:
				Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
			KEY_1, KEY_2, KEY_3:
				_select(e.physical_keycode - KEY_1)
			KEY_R:
				_reload()
			KEY_C, KEY_CTRL:
				crouch = not crouch
			KEY_SPACE:
				_jump_q = true


func _reload() -> void:
	if _reload_t > 0.0 or mag[cur] >= GUNS[cur]["mag"] or spare[cur] <= 0 or dead:
		return
	_reload_t = GUNS[cur]["reload"]
	w.sound("reload", -6.0)


func _physics_process(dt: float) -> void:
	shot_t += dt
	if dead:
		return
	var hud = w.hud
	var g: Dictionary = GUNS[cur]
	# buttons from the touch screen
	if hud.take("jump"):
		_jump_q = true
	if hud.take("reload"):
		_reload()
	if hud.take("switch"):
		_select((cur + 1) % GUNS.size())
	if hud.take("crouch"):
		crouch = not crouch
	# look
	var tl: Vector2 = hud.take_look()
	var sens := lerpf(1.0, 0.5, ads)
	yaw -= (_mouse.x * 0.0022 + tl.x * 0.0055) * sens
	pitch = clampf(pitch - (_mouse.y * 0.0022 + tl.y * 0.0055) * sens, -1.45, 1.45)
	_sway = _sway.lerp(_mouse * 0.00025 + tl * 0.0004, 1.0 - exp(-10.0 * dt))
	_mouse = Vector2.ZERO
	_vkick = _vkick.lerp(Vector2.ZERO, 1.0 - exp(-12.0 * dt))
	rotation.y = yaw
	head.rotation = Vector3(pitch + _vkick.x, _vkick.y, 0)
	# move
	var mv := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_W): mv.y -= 1.0
	if Input.is_physical_key_pressed(KEY_S): mv.y += 1.0
	if Input.is_physical_key_pressed(KEY_A): mv.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D): mv.x += 1.0
	mv += hud.move
	if mv.length() > 1.0:
		mv = mv.normalized()
	var want_ads: bool = Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT) or hud.ads_on
	var sprint: bool = (Input.is_physical_key_pressed(KEY_SHIFT) or hud.move.length() > 0.97) and mv.y < -0.5 and not want_ads
	if sprint and crouch:
		crouch = false
	var speed := 7.0 if sprint else (2.6 if crouch else 4.5)
	speed *= lerpf(1.0, 0.6, ads)
	var wish := (transform.basis * Vector3(mv.x, 0, mv.y)) * speed
	var k := 1.0 - exp(-(12.0 if is_on_floor() else 2.0) * dt)
	velocity.x = lerpf(velocity.x, wish.x, k)
	velocity.z = lerpf(velocity.z, wish.z, k)
	if is_on_floor():
		if _jump_q:
			velocity.y = 6.2
			crouch = false
	else:
		velocity.y -= 19.0 * dt
	_jump_q = false
	move_and_slide()
	var hs := Vector2(velocity.x, velocity.z).length()
	# crouch height
	var eye := 1.0 if crouch else 1.62
	head.position.y = lerpf(head.position.y, eye, 1.0 - exp(-12.0 * dt))
	(shape.shape as CapsuleShape3D).height = 1.2 if crouch else 1.8
	shape.position.y = 0.6 if crouch else 0.9
	# steps
	if is_on_floor() and hs > 1.0:
		_bob += hs * dt * 1.7
		_step += hs * dt
		if _step > (2.6 if sprint else 2.0):
			_step = 0.0
			w.sound("step", -16.0 if crouch else -10.0)
	# aim, reload, switch, fire
	ads = move_toward(ads, 1.0 if want_ads and _reload_t <= 0.0 and not sprint else 0.0, dt * 6.0)
	camera.fov = lerpf(78.0, g["fov"], ads)
	_fire_cd -= dt
	_switch_t = maxf(0.0, _switch_t - dt)
	if _reload_t > 0.0:
		_reload_t -= dt
		if _reload_t <= 0.0:
			var take: int = mini(GUNS[cur]["mag"] - mag[cur], spare[cur])
			mag[cur] += take
			spare[cur] -= take
	var trig: bool = (Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED) or hud.fire
	if trig and _fire_cd <= 0.0 and _reload_t <= 0.0 and _switch_t <= 0.0 and not sprint and (g["auto"] or not _trig_was):
		if mag[cur] > 0:
			_shoot(g)
			_fire_cd = 60.0 / g["rpm"]
		elif spare[cur] > 0:
			_reload()
		else:
			w.sound("empty", -8.0)
			_fire_cd = 0.3
	_trig_was = trig
	# health
	_regen -= dt
	if _regen <= 0.0:
		health = minf(100.0, health + 30.0 * dt)
	_viewmodel(dt, hs, sprint)


func _shoot(g: Dictionary) -> void:
	mag[cur] -= 1
	shot_t = 0.0
	var spread := deg_to_rad(lerpf(g["spread"], g["ads_spread"], ads)) * (1.5 if Vector2(velocity.x, velocity.z).length() > 3.0 else 1.0) * (0.75 if crouch else 1.0)
	var ct := camera.global_transform
	var dir := (-ct.basis.z).rotated(ct.basis.x, randf_range(-spread, spread)).rotated(ct.basis.y, randf_range(-spread, spread))
	var to: Vector3 = ct.origin + dir * float(g["range"])
	var q := PhysicsRayQueryParameters3D.create(ct.origin, to, 5, [get_rid()])
	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	if hit:
		to = hit.position
		var col: Object = hit.collider
		if col.has_method("hit"):
			var headshot: bool = hit.position.y > col.global_position.y + 1.42
			var killed: bool = col.hit(g["dmg"] * (2.2 if headshot else 1.0), global_position)
			w.impact(hit.position, hit.normal, true)
			w.hud.hitmark(killed, headshot)
			w.sound("hit", -8.0)
		else:
			w.impact(hit.position, hit.normal)
	w.tracer(flashes[cur].global_position, to)
	w.sound(g["snd"], -3.0)
	_flash_t = 0.045
	flashes[cur].visible = true
	flashes[cur].rotation.z = randf() * TAU
	flashes[cur].scale = Vector3.ONE * randf_range(0.8, 1.25)
	var kick: float = g["kick"]
	pitch += deg_to_rad(kick) * (0.45 if ads > 0.5 else 0.7)
	yaw += deg_to_rad(randf_range(-0.4, 0.4) * kick)
	_vkick += Vector2(deg_to_rad(kick * 0.6), deg_to_rad(randf_range(-0.3, 0.3)))
	_kick = minf(_kick + 0.6, 1.0)


func _viewmodel(dt: float, hs: float, sprint: bool) -> void:
	var g: Dictionary = GUNS[cur]
	_flash_t -= dt
	if _flash_t <= 0.0:
		flashes[cur].visible = false
	_kick = move_toward(_kick, 0.0, dt * 7.0)
	# lower the gun when it would poke into a wall
	var ct := camera.global_transform
	var q := PhysicsRayQueryParameters3D.create(ct.origin, ct.origin - ct.basis.z * 0.75, 1)
	var near_wall := not get_world_3d().direct_space_state.intersect_ray(q).is_empty()
	_lower = move_toward(_lower, 1.0 if (near_wall or sprint) and ads < 0.5 else 0.0, dt * 5.0)
	var hip: Vector3 = g["hip"]
	var aim := Vector3(0, -float(g["ads_y"]), -0.3)
	var pos := hip.lerp(aim, ads)
	var bobk := (0.25 if ads > 0.5 else 1.0) * clampf(hs / 4.5, 0.0, 1.5)
	pos += Vector3(sin(_bob) * 0.008, -absf(cos(_bob)) * 0.01, 0) * bobk
	pos += Vector3(-_sway.x, _sway.y, 0) * (0.3 if ads > 0.5 else 1.0)
	pos.z += _kick * 0.045
	var rot := Vector3(_kick * 0.06, 0, 0)
	rot += Vector3(-0.5, 0.6, 0.2) * _lower
	pos += Vector3(0.0, -0.06, 0.04) * _lower
	if _reload_t > 0.0:
		var t: float = 1.0 - _reload_t / float(g["reload"])
		var dip := sin(t * PI)
		rot += Vector3(-0.7 * dip, 0.3 * dip, 0.5 * dip)
		pos.y -= 0.08 * dip
	if _switch_t > 0.0:
		pos.y -= _switch_t * 0.5
	vm.position = vm.position.lerp(pos, 1.0 - exp(-25.0 * dt))
	vm.rotation = vm.rotation.lerp(rot, 1.0 - exp(-18.0 * dt))


func damage(amount: float, _from: Vector3) -> void:
	if dead:
		return
	health -= amount
	_regen = 4.0
	w.hud.hurt()
	if health <= 0.0:
		dead = true
		var tw := create_tween()
		tw.tween_property(head, "position:y", 0.35, 0.6)
		tw.parallel().tween_property(head, "rotation:z", 0.6, 0.6)
		tw.tween_interval(2.5)
		tw.tween_callback(_respawn)


func _respawn() -> void:
	global_position = w.player_spawns[randi() % w.player_spawns.size()]
	velocity = Vector3.ZERO
	health = 100.0
	dead = false
	yaw = 0.0
	pitch = 0.0
	head.rotation = Vector3.ZERO
	for i in GUNS.size():
		mag[i] = GUNS[i]["mag"]
		spare[i] = GUNS[i]["spare"]
