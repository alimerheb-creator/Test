extends CharacterBody3D
## You: a soldier of the class you picked, with its primary gun, the P-19 sidearm, frag grenades and the class
## gadget. Mouse and keyboard, or touch.

const D := preload("res://scripts/data.gd")
const Proj := preload("res://scripts/proj.gd")
const KnifeScene := preload("res://models/combat_knife.glb")
const VM := {
	"ar": {"hip": Vector3(0.17, -0.19, -0.5), "ads_y": 0.075, "muzzle": Vector3(0, 0.012, -0.66)},
	"smg": {"hip": Vector3(0.16, -0.18, -0.46), "ads_y": 0.062, "muzzle": Vector3(0, 0.01, -0.2)},
	"lmg": {"hip": Vector3(0.18, -0.21, -0.52), "ads_y": 0.08, "muzzle": Vector3(0, 0.015, -0.72)},
	"sniper": {"hip": Vector3(0.17, -0.19, -0.5), "ads_y": 0.078, "muzzle": Vector3(0, 0.01, -0.84)},
	"pistol": {"hip": Vector3(0.14, -0.15, -0.42), "ads_y": 0.045, "muzzle": Vector3(0, 0.02, -0.15)},
}

var w: Node
var team := 0
var tag := "YOU"
var kills := 0
var deaths := 0
var score := 0
var cls := "assault"
var slots := ["ar", "pistol"]
var cur := 0
var mag := [30, 15]
var spare := [150, 60]
var gadget_ammo := 0
var grenades := 0
var charges: Array = []
var head: Node3D
var camera: Camera3D
var vm: Node3D
var models := {}
var flashes := {}
var shape: CollisionShape3D
var yaw := 0.0
var pitch := 0.0
var ads := 0.0
var crouch := false
var health := 100.0
var dead := true
var shot_t := 99.0
var _mouse := Vector2.ZERO
var _fire_cd := 0.0
var _reload_t := 0.0
var _switch_t := 0.0
var _flash_t := 0.0
var _kick := 0.0
var _bloom := 0.0
var _vkick := Vector2.ZERO
var _bob := 0.0
var _step := 0.0
var _regen := 0.0
var _trig_was := false
var _sway := Vector2.ZERO
var _lower := 0.0
var _jump_q := false
var _protect := 0.0
var _melee_t := 0.0
var knife: Node3D


func _ready() -> void:
	w = get_parent()
	collision_layer = 0
	collision_mask = 5
	floor_max_angle = deg_to_rad(50)
	floor_snap_length = 0.5
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
	camera.fov = 75.0
	camera.near = 0.03
	camera.far = 2000.0
	head.add_child(camera)
	vm = Node3D.new()
	camera.add_child(vm)
	for id in VM:
		models[id] = _build_gun(id)
	_build_knife()


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


func _build_gun(id: String) -> Node3D:
	var g := Node3D.new()
	vm.add_child(g)
	var M: Material = w.mat("gunmetal")
	var P: Material = w.mat("polymer")
	var parts := []
	match id:
		"ar":
			parts = [["b", Vector3(0.055, 0.075, 0.3), Vector3(0, 0, 0), 0.0, M], ["b", Vector3(0.062, 0.062, 0.26), Vector3(0, 0.002, -0.27), 0.0, P],
				["c", Vector3(0.011, 0.2, 0), Vector3(0, 0.01, -0.5), PI / 2, M], ["b", Vector3(0.022, 0.03, 0.05), Vector3(0, 0.012, -0.62), 0.0, M],
				["b", Vector3(0.045, 0.075, 0.2), Vector3(0, -0.012, 0.24), 0.0, P], ["b", Vector3(0.028, 0.13, 0.06), Vector3(0, -0.1, -0.06), 0.25, M],
				["b", Vector3(0.03, 0.09, 0.045), Vector3(0, -0.075, 0.08), -0.35, P], ["b", Vector3(0.025, 0.012, 0.42), Vector3(0, 0.044, -0.12), 0.0, M],
				["b", Vector3(0.034, 0.042, 0.08), Vector3(0, 0.072, -0.02), 0.0, M]]
		"smg":
			parts = [["b", Vector3(0.05, 0.075, 0.22), Vector3(0, 0, 0), 0.0, P], ["c", Vector3(0.01, 0.08, 0), Vector3(0, 0.01, -0.15), PI / 2, M],
				["b", Vector3(0.025, 0.08, 0.03), Vector3(0, -0.075, -0.08), 0.0, P], ["b", Vector3(0.028, 0.17, 0.035), Vector3(0, -0.1, 0.06), -0.2, M],
				["b", Vector3(0.008, 0.008, 0.18), Vector3(0.018, -0.005, 0.2), 0.0, M], ["b", Vector3(0.008, 0.008, 0.18), Vector3(-0.018, -0.005, 0.2), 0.0, M],
				["b", Vector3(0.04, 0.06, 0.012), Vector3(0, -0.01, 0.29), 0.0, P], ["b", Vector3(0.032, 0.036, 0.07), Vector3(0, 0.058, 0.0), 0.0, M]]
		"lmg":
			parts = [["b", Vector3(0.07, 0.09, 0.36), Vector3(0, 0, 0), 0.0, M], ["b", Vector3(0.072, 0.065, 0.26), Vector3(0, 0.005, -0.3), 0.0, P],
				["c", Vector3(0.014, 0.34, 0), Vector3(0, 0.012, -0.55), PI / 2, M], ["b", Vector3(0.1, 0.11, 0.13), Vector3(-0.02, -0.1, -0.03), 0.0, w.mat("olive")],
				["b", Vector3(0.05, 0.085, 0.22), Vector3(0, -0.012, 0.27), 0.0, P], ["b", Vector3(0.032, 0.09, 0.045), Vector3(0, -0.08, 0.1), -0.35, P],
				["b", Vector3(0.01, 0.01, 0.22), Vector3(0.015, -0.04, -0.45), 0.0, M], ["b", Vector3(0.01, 0.01, 0.22), Vector3(-0.015, -0.04, -0.45), 0.0, M],
				["b", Vector3(0.036, 0.044, 0.08), Vector3(0, 0.075, -0.04), 0.0, M]]
		"sniper":
			parts = [["b", Vector3(0.05, 0.07, 0.3), Vector3(0, 0, 0), 0.0, M], ["c", Vector3(0.011, 0.5, 0), Vector3(0, 0.012, -0.55), PI / 2, M],
				["b", Vector3(0.055, 0.1, 0.34), Vector3(0, -0.02, 0.26), 0.0, w.mat("tan")], ["b", Vector3(0.06, 0.05, 0.3), Vector3(0, -0.01, -0.22), 0.0, w.mat("tan")],
				["c", Vector3(0.022, 0.3, 0), Vector3(0, 0.078, -0.03), PI / 2, M], ["b", Vector3(0.012, 0.012, 0.03), Vector3(0.04, 0.01, 0.08), 0.0, M],
				["b", Vector3(0.03, 0.06, 0.05), Vector3(0, -0.06, 0.02), 0.0, M]]
		_:
			parts = [["b", Vector3(0.03, 0.033, 0.19), Vector3(0, 0.02, -0.05), 0.0, M], ["b", Vector3(0.028, 0.025, 0.16), Vector3(0, -0.005, -0.04), 0.0, P],
				["b", Vector3(0.03, 0.1, 0.05), Vector3(0, -0.06, 0.03), 0.25, P], ["b", Vector3(0.004, 0.01, 0.006), Vector3(0, 0.041, -0.135), 0.0, M],
				["b", Vector3(0.02, 0.01, 0.006), Vector3(0, 0.041, 0.035), 0.0, M]]
	for p in parts:
		_part(g, p[0], p[1], p[2], p[3], p[4])
	if id != "pistol" and id != "sniper":
		_part(g, "b", Vector3(0.004, 0.004, 0.002), Vector3(0, VM[id]["ads_y"], -0.06), 0.0, w.glow_mat(Color(1, 0.1, 0.05), 6.0))
	var front := Vector3(0, -0.1, -0.08) if id == "smg" else (Vector3(-0.012, -0.075, 0.03) if id == "pistol" else Vector3(-0.01, -0.05, -0.28))
	_part(g, "b", Vector3(0.05, 0.06, 0.09), Vector3(0.005, -0.065, 0.09), -0.3, w.mat("glove"))
	_part(g, "p", Vector3(0.042, 0.38, 0), Vector3(0.04, -0.13, 0.3), 0.35, w.mat("olive"))
	_part(g, "b", Vector3(0.05, 0.06, 0.09), front, 0.0, w.mat("glove"))
	var fa := MeshInstance3D.new()
	var fb := CapsuleMesh.new()
	fb.radius = 0.042
	fb.height = 0.4
	fa.mesh = fb
	fa.material_override = w.mat("olive")
	fa.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	g.add_child(fa)
	fa.position = front + Vector3(-0.1, -0.06, 0.16)
	fa.rotation = Vector3(0.3 + PI / 2, -0.55, 0)
	var f := Node3D.new()
	g.add_child(f)
	f.position = VM[id]["muzzle"]
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
	flashes[id] = f
	g.visible = false
	return g


func gun() -> Dictionary:
	return D.WEAPONS[slots[cur]]


func deploy(xf: Transform3D, c: String) -> void:
	cls = c
	slots = [D.CLASSES[c]["primary"], "pistol"]
	for i in 2:
		mag[i] = D.WEAPONS[slots[i]]["mag"]
		spare[i] = D.WEAPONS[slots[i]]["reserve"]
	gadget_ammo = D.GADGETS[D.CLASSES[c]["gadget"]]["ammo"]
	grenades = D.CLASSES[c]["grenades"]
	charges.clear()
	global_transform = Transform3D(Basis.IDENTITY, xf.origin)
	yaw = xf.basis.get_euler().y
	pitch = 0.0
	health = D.RULES["health"]
	dead = false
	crouch = false
	ads = 0.0
	_protect = D.RULES["protect"]
	velocity = Vector3.ZERO
	head.position.y = 1.62
	head.rotation = Vector3.ZERO
	collision_layer = 2
	camera.current = true
	for id in models:
		models[id].visible = false
	cur = 0
	models[slots[0]].visible = true
	_reload_t = 0.0
	_switch_t = 0.35


func _select(i: int) -> void:
	if i == cur or dead:
		return
	models[slots[cur]].visible = false
	flashes[slots[cur]].visible = false
	cur = i
	models[slots[cur]].visible = true
	_reload_t = 0.0
	_switch_t = 0.35


func _input(e: InputEvent) -> void:
	if w.menu_open or w.hud.touch_ui:
		return
	if e is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		_mouse += e.screen_relative * w.sens
	elif e is InputEventMouseButton and e.pressed:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
			_trig_was = true
		elif e.button_index == MOUSE_BUTTON_WHEEL_UP or e.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_select(1 - cur)
	elif e is InputEventKey and e.pressed and not e.echo:
		match e.physical_keycode:
			KEY_ESCAPE:
				Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
			KEY_1:
				_select(0)
			KEY_2:
				_select(1)
			KEY_R:
				_reload()
			KEY_C, KEY_CTRL:
				crouch = not crouch
			KEY_SPACE:
				_jump_q = true
			KEY_G:
				_grenade()
			KEY_F:
				_gadget()
			KEY_V:
				_melee()


func _reload() -> void:
	if _reload_t > 0.0 or mag[cur] >= gun()["mag"] or spare[cur] <= 0 or dead:
		return
	_reload_t = gun()["reload"]
	w.sound("reload", -6.0)


func _grenade() -> void:
	if dead or grenades <= 0:
		return
	grenades -= 1
	var ct := camera.global_transform
	Proj.new().launch(w, "grenade", ct.origin - ct.basis.z * 0.6, (-ct.basis.z + Vector3.UP * 0.3).normalized(), self)
	_kick = 0.6


func _gadget() -> void:
	if dead:
		return
	var gid: String = D.CLASSES[cls]["gadget"]
	if gid == "c4" and gadget_ammo <= 0 and not charges.is_empty():
		for c in charges:
			if is_instance_valid(c):
				c.detonate()
		charges.clear()
		return
	if gadget_ammo <= 0:
		w.sound("empty", -8.0)
		return
	gadget_ammo -= 1
	var k: String = D.GADGETS[gid]["proj"]
	var ct := camera.global_transform
	var fwd := -ct.basis.z
	var dir := fwd if k == "ugl" or k == "rocket" else (fwd + Vector3.UP * 0.25).normalized()
	var pr := Proj.new()
	pr.launch(w, k, ct.origin + fwd * 0.7 - ct.basis.y * 0.1, dir, self)
	if k == "c4":
		charges.append(pr)
	if k == "ugl" or k == "rocket":
		w.sound("pistol", 2.0)
		pitch += 0.03
		_vkick.x += 0.04
	_kick = 1.0


func _build_knife() -> void:
	knife = Node3D.new()
	knife.rotation_order = EULER_ORDER_XYZ
	knife.visible = false
	camera.add_child(knife)
	var k: Node3D = KnifeScene.instantiate()
	var box := AABB()
	var first := true
	for mi in k.find_children("*", "MeshInstance3D", true, false):
		(mi as MeshInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var xf := Transform3D.IDENTITY
		var n: Node = mi
		while n != k:
			xf = (n as Node3D).transform * xf
			n = n.get_parent()
		var b: AABB = xf * (mi as MeshInstance3D).get_aabb()
		box = b if first else box.merge(b)
		first = false
	# The model lies along +X with the blade at the far end: turn it to point down -Z like the web game's knife,
	# 28 cm long and held at the grip.
	var s := 0.28 / maxf(box.size.x, 0.001)
	var grip := Vector3(box.position.x + box.size.x * 0.2, box.get_center().y, box.get_center().z)
	var r := Basis(Vector3.UP, PI / 2.0)
	k.transform = Transform3D(r.scaled(Vector3.ONE * s), -(r * grip) * s)
	knife.add_child(k)


## The combat knife, as in the web game: a quick stab at the enemy in reach in front of you, a kill from behind.
func _melee() -> void:
	if dead or _melee_t > 0.0:
		return
	_melee_t = 0.45
	w.sound("knife", -4.0)
	var eye := camera.global_position
	var f := -camera.global_basis.z
	var space := get_world_3d().direct_space_state
	var best = null
	var bd := 2.4
	for e in w.soldiers:
		if e == self or e.dead or e.team == team:
			continue
		var c: Vector3 = e.global_position + Vector3(0, 1.25, 0)
		var d := eye.distance_to(c)
		if d > bd or (c - eye).dot(f) / maxf(d, 0.01) < 0.6:
			continue
		if not space.intersect_ray(PhysicsRayQueryParameters3D.create(eye, c, 1)).is_empty():
			continue
		best = e
		bd = d
	if best == null:
		return
	var back := absf(wrapf(best.rotation.y - yaw, -PI, PI)) < 1.0
	var killed: bool = best.damage(250.0 if back else 60.0, global_position, self, false, "COMBAT KNIFE")
	w.impact(best.global_position + Vector3(0, 1.25, 0), -f, true)
	w.hud.hitmark(killed, false)


func resupply() -> void:
	for i in 2:
		var wd: Dictionary = D.WEAPONS[slots[i]]
		spare[i] = mini(spare[i] + int(wd["mag"]), int(wd["reserve"]))
	grenades = mini(grenades + 1, int(D.CLASSES[cls]["grenades"]))
	if D.CLASSES[cls]["gadget"] != "crate":
		gadget_ammo = mini(gadget_ammo + 1, int(D.GADGETS[D.CLASSES[cls]["gadget"]]["ammo"]))


func _physics_process(dt: float) -> void:
	shot_t += dt
	if dead or w.conquest.over:
		knife.visible = false
		return
	var hud = w.hud
	var g := gun()
	_protect -= dt
	if hud.take("jump"):
		_jump_q = true
	if hud.take("reload"):
		_reload()
	if hud.take("switch"):
		_select(1 - cur)
	if hud.take("crouch"):
		crouch = not crouch
	if hud.take("grenade"):
		_grenade()
	if hud.take("gadget"):
		_gadget()
	if hud.take("knife"):
		_melee()
	# look
	var tl: Vector2 = hud.take_look() * w.sens
	var sens := lerpf(1.0, 0.5 if not g.get("scope", false) else 0.2, ads)
	yaw -= (_mouse.x * 0.0022 + tl.x * 0.0055) * sens
	pitch = clampf(pitch - (_mouse.y * 0.0022 + tl.y * 0.0055) * sens, -1.45, 1.45)
	_sway = _sway.lerp(_mouse * 0.00025 + tl * 0.0004, 1.0 - exp(-10.0 * dt))
	_mouse = Vector2.ZERO
	_vkick = _vkick.lerp(Vector2.ZERO, 1.0 - exp(-12.0 * dt))
	rotation.y = yaw
	head.rotation = Vector3(pitch + _vkick.x, _vkick.y, 0)
	# move
	var mv := Vector2.ZERO
	if not hud.touch_ui:
		if Input.is_physical_key_pressed(KEY_W): mv.y -= 1.0
		if Input.is_physical_key_pressed(KEY_S): mv.y += 1.0
		if Input.is_physical_key_pressed(KEY_A): mv.x -= 1.0
		if Input.is_physical_key_pressed(KEY_D): mv.x += 1.0
	mv += hud.move
	if mv.length() > 1.0:
		mv = mv.normalized()
	var mouse_ok: bool = not hud.touch_ui and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	var want_ads: bool = (mouse_ok and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)) or hud.ads_on
	var sprint: bool = ((not hud.touch_ui and Input.is_physical_key_pressed(KEY_SHIFT)) or hud.move.length() > 0.97) and mv.y < -0.5 and not want_ads
	if sprint and crouch:
		crouch = false
	var speed: float = D.MOVE["sprint"] if sprint else (D.MOVE["crouch"] if crouch else D.MOVE["walk"])
	speed *= lerpf(1.0, D.MOVE["ads"], ads)
	var wish := (transform.basis * Vector3(mv.x, 0, mv.y)) * speed
	var k := 1.0 - exp(-(12.0 if is_on_floor() else 2.0) * dt)
	velocity.x = lerpf(velocity.x, wish.x, k)
	velocity.z = lerpf(velocity.z, wish.z, k)
	if is_on_floor():
		if _jump_q:
			velocity.y = D.MOVE["jump"]
			crouch = false
	else:
		velocity.y -= D.RULES["gravity"] * dt
	_jump_q = false
	move_and_slide()
	var lim: float = D.PLAY_HALF + 5.0
	if absf(global_position.x) > lim or absf(global_position.z) > lim:
		global_position.x = clampf(global_position.x, -lim, lim)
		global_position.z = clampf(global_position.z, -lim, lim)
		hud.toast("RETURN TO THE BATTLEFIELD")
	var hs := Vector2(velocity.x, velocity.z).length()
	head.position.y = lerpf(head.position.y, 1.0 if crouch else 1.62, 1.0 - exp(-12.0 * dt))
	(shape.shape as CapsuleShape3D).height = 1.2 if crouch else 1.8
	shape.position.y = 0.6 if crouch else 0.9
	if is_on_floor() and hs > 1.0:
		_bob += hs * dt * 1.7
		_step += hs * dt
		if _step > (2.6 if sprint else 2.0):
			_step = 0.0
			w.sound("step", -16.0 if crouch else -10.0)
	# aim, reload, switch, fire
	ads = move_toward(ads, 1.0 if want_ads and _reload_t <= 0.0 and not sprint else 0.0, dt * 6.0)
	var scoped: bool = g.get("scope", false) and ads > 0.85
	camera.fov = lerpf(w.fov, g["fov"], ads) if not scoped else g["fov"]
	vm.visible = not scoped
	_fire_cd -= dt
	_bloom = move_toward(_bloom, 0.0, dt * 0.08)
	_switch_t = maxf(0.0, _switch_t - dt)
	_melee_t = maxf(0.0, _melee_t - dt)
	if _reload_t > 0.0:
		_reload_t -= dt
		if _reload_t <= 0.0:
			var take: int = mini(int(g["mag"]) - mag[cur], spare[cur])
			mag[cur] += take
			spare[cur] -= take
	var trig: bool = (mouse_ok and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)) or hud.fire
	if trig and _fire_cd <= 0.0 and _reload_t <= 0.0 and _switch_t <= 0.0 and _melee_t <= 0.0 and not sprint and (g["kind"] == "auto" or not _trig_was):
		if mag[cur] > 0:
			_shoot(g)
			_fire_cd = 60.0 / float(g["rpm"])
		elif spare[cur] > 0:
			_reload()
		else:
			w.sound("empty", -8.0)
			_fire_cd = 0.3
	_trig_was = trig
	_regen -= dt
	if _regen <= 0.0:
		health = minf(D.RULES["health"], health + D.RULES["regen_rate"] * dt)
	_viewmodel(dt, hs, sprint)


func _shoot(g: Dictionary) -> void:
	mag[cur] -= 1
	shot_t = 0.0
	var spread := lerpf(g["spread"], g["spread_ads"], ads) + _bloom
	spread *= (1.5 if Vector2(velocity.x, velocity.z).length() > 3.0 else 1.0) * (0.75 if crouch else 1.0)
	_bloom = minf(_bloom + float(g["bloom"]), float(g["bloom_max"]))
	var ct := camera.global_transform
	var dir := (-ct.basis.z).rotated(ct.basis.x, randf_range(-spread, spread) * 0.7).rotated(ct.basis.y, randf_range(-spread, spread) * 0.7)
	var to: Vector3 = ct.origin + dir * 400.0
	var hit := get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(ct.origin, to, 5, [get_rid()]))
	if hit:
		to = hit.position
		var col: Object = hit.collider
		if col.has_method("damage"):
			if col.team != team:
				var hd: bool = hit.position.y > (col as Node3D).global_position.y + 1.45
				var dmg := D.damage_at(g, ct.origin.distance_to(to)) * float(D.RULES["bullet"]) * (float(g["head"]) if hd else 1.0)
				var killed: bool = col.damage(dmg, global_position, self, hd, g["name"])
				w.impact(hit.position, hit.normal, true)
				w.hud.hitmark(killed, hd)
				w.sound("hit", -8.0)
		else:
			w.impact(hit.position, hit.normal)
	w.tracer(flashes[slots[cur]].global_position, to)
	w.sound(g["sound"], -3.0)
	_flash_t = 0.045
	var f: Node3D = flashes[slots[cur]]
	f.visible = true
	f.rotation.z = randf() * TAU
	f.scale = Vector3.ONE * randf_range(0.8, 1.25)
	var rc: Array = g["recoil"]
	pitch += float(rc[0]) * (0.6 if ads > 0.5 else 1.0)
	yaw += randf_range(-1.0, 1.0) * float(rc[1])
	_vkick += Vector2(float(rc[0]) * 0.6, randf_range(-0.3, 0.3) * float(rc[1]))
	_kick = minf(_kick + 0.6, 1.0)


func _viewmodel(dt: float, hs: float, sprint: bool) -> void:
	var id: String = slots[cur]
	var g := gun()
	_flash_t -= dt
	if _flash_t <= 0.0:
		flashes[id].visible = false
	_kick = move_toward(_kick, 0.0, dt * 7.0)
	var ct := camera.global_transform
	var near_wall := not get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(ct.origin, ct.origin - ct.basis.z * 0.75, 1)).is_empty()
	_lower = move_toward(_lower, 1.0 if (near_wall or sprint) and ads < 0.5 else 0.0, dt * 5.0)
	var hip: Vector3 = VM[id]["hip"]
	var pos := hip.lerp(Vector3(0, -float(VM[id]["ads_y"]), -0.3), ads)
	var bobk := (0.25 if ads > 0.5 else 1.0) * clampf(hs / 4.5, 0.0, 1.5)
	pos += Vector3(sin(_bob) * 0.008, -absf(cos(_bob)) * 0.01, 0) * bobk
	pos += Vector3(-_sway.x, _sway.y, 0) * (0.3 if ads > 0.5 else 1.0)
	pos.z += _kick * 0.045
	var rot := Vector3(_kick * 0.06, 0, 0) + Vector3(-0.5, 0.6, 0.2) * _lower
	pos += Vector3(0.0, -0.06, 0.04) * _lower
	if _reload_t > 0.0:
		var dip := sin((1.0 - _reload_t / float(g["reload"])) * PI)
		rot += Vector3(-0.7 * dip, 0.3 * dip, 0.5 * dip)
		pos.y -= 0.08 * dip
	if _switch_t > 0.0:
		pos.y -= _switch_t * 0.5
	if _melee_t > 0.0:
		var mt := 1.0 - _melee_t / 0.45
		pos.y -= sin(mt * PI) * 0.12
		knife.visible = true
		knife.position = Vector3(lerpf(0.25, -0.2, mt), -0.12 + sin(mt * PI) * 0.05, -0.35)
		knife.rotation = Vector3(-0.2, lerpf(0.9, -0.6, mt), -0.6)
	else:
		knife.visible = false
	vm.position = vm.position.lerp(pos, 1.0 - exp(-25.0 * dt))
	vm.rotation = vm.rotation.lerp(rot, 1.0 - exp(-18.0 * dt))


func damage(amount: float, from: Vector3, attacker: Node, hd := false, weapon := "") -> bool:
	if dead or _protect > 0.0 or (attacker and attacker != self and attacker.team == team):
		return false
	health -= amount
	_regen = D.RULES["regen_delay"]
	w.hud.hurt(from)
	if health > 0.0:
		return false
	dead = true
	collision_layer = 0
	velocity = Vector3.ZERO
	w.conquest.on_kill(self, attacker, weapon, hd)
	var tw := create_tween()
	tw.tween_property(head, "position:y", 0.35, 0.6)
	tw.parallel().tween_property(head, "rotation:z", 0.6, 0.6)
	tw.tween_interval(2.2)
	tw.tween_callback(w.on_player_dead)
	return true
