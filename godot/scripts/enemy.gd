extends CharacterBody3D
## An enemy soldier: a model built from parts, a walk cycle, and a simple patrol / fight brain.

var w: Node
var health := 100.0
var dead := false
var state := "patrol"
var target := Vector3.ZERO
var model: Node3D
var hips: Array[Node3D] = []
var arms: Node3D
var muzzle: Node3D
var _think := 0.0
var _seen := 0.0
var _burst := 0
var _shot_cd := 0.0
var _walk := 0.0
var _stuck := 0.0
var _last_pos := Vector3.ZERO
var _alert := 0.0


func _ready() -> void:
	w = get_parent()
	collision_layer = 4
	collision_mask = 7
	var cs := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.38
	cap.height = 1.8
	cs.shape = cap
	cs.position.y = 0.9
	add_child(cs)
	model = Node3D.new()
	add_child(model)
	_build()
	_new_target()


func _mesh(parent: Node3D, mesh: Mesh, pos: Vector3, m: String, scale := Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = w.mat(m)
	mi.position = pos
	mi.scale = scale
	parent.add_child(mi)
	return mi


func _box(s: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = s
	return b


func _cap(r: float, h: float) -> CapsuleMesh:
	var c := CapsuleMesh.new()
	c.radius = r
	c.height = h
	c.radial_segments = 12
	c.rings = 4
	return c


func _build() -> void:
	# legs swing from the hips
	for side in [-1.0, 1.0]:
		var hip := Node3D.new()
		hip.position = Vector3(0.11 * side, 0.95, 0)
		model.add_child(hip)
		_mesh(hip, _cap(0.085, 0.55), Vector3(0, -0.24, 0), "camo")
		_mesh(hip, _cap(0.075, 0.5), Vector3(0, -0.66, 0.0), "camo")
		_mesh(hip, _box(Vector3(0.11, 0.1, 0.27)), Vector3(0, -0.9, -0.05), "polymer")
		_mesh(hip, _box(Vector3(0.12, 0.12, 0.08)), Vector3(0, -0.47, -0.08), "polymer")
		hips.append(hip)
	# torso, vest, pouches
	_mesh(model, _cap(0.19, 0.7), Vector3(0, 1.28, 0), "camo", Vector3(1.0, 1.0, 0.75))
	_mesh(model, _box(Vector3(0.4, 0.42, 0.3)), Vector3(0, 1.3, -0.01), "olive")
	for x in [-0.12, 0.0, 0.12]:
		_mesh(model, _box(Vector3(0.09, 0.12, 0.07)), Vector3(x, 1.2, -0.18), "olive")
	_mesh(model, _box(Vector3(0.3, 0.32, 0.12)), Vector3(0, 1.32, 0.2), "olive")
	_mesh(model, _box(Vector3(0.38, 0.07, 0.3)), Vector3(0, 0.98, 0), "polymer")
	# head, helmet, goggles
	_mesh(model, _cap(0.1, 0.24), Vector3(0, 1.67, 0), "skin")
	var helm := SphereMesh.new()
	helm.radius = 0.135
	helm.height = 0.2
	helm.is_hemisphere = true
	_mesh(model, helm, Vector3(0, 1.72, 0.0), "tan")
	_mesh(model, _box(Vector3(0.15, 0.04, 0.05)), Vector3(0, 1.73, -0.11), "glass")
	_mesh(model, _box(Vector3(0.16, 0.05, 0.06)), Vector3(0, 1.58, -0.06), "olive")
	# arms holding the rifle
	arms = Node3D.new()
	arms.position = Vector3(0, 1.42, 0)
	model.add_child(arms)
	var r1 := _mesh(arms, _cap(0.065, 0.5), Vector3(0.2, -0.12, -0.12), "camo")
	r1.rotation = Vector3(-1.0, 0, 0.2)
	var l1 := _mesh(arms, _cap(0.065, 0.55), Vector3(-0.12, -0.1, -0.24), "camo")
	l1.rotation = Vector3(-1.2, -0.5, -0.2)
	var gun := Node3D.new()
	gun.position = Vector3(0.08, -0.12, -0.4)
	arms.add_child(gun)
	_mesh(gun, _box(Vector3(0.06, 0.09, 0.42)), Vector3.ZERO, "gunmetal")
	_mesh(gun, _box(Vector3(0.05, 0.08, 0.22)), Vector3(0, -0.01, 0.3), "polymer")
	_mesh(gun, _box(Vector3(0.03, 0.14, 0.06)), Vector3(0, -0.1, -0.05), "gunmetal")
	_mesh(gun, _box(Vector3(0.025, 0.025, 0.3)), Vector3(0, 0.015, -0.34), "gunmetal")
	_mesh(gun, _box(Vector3(0.05, 0.06, 0.06)), Vector3(0.1, -0.12, 0.25), "glove")
	_mesh(gun, _box(Vector3(0.05, 0.06, 0.06)), Vector3(-0.02, -0.06, -0.22), "glove")
	muzzle = Node3D.new()
	muzzle.position = Vector3(0, 0.015, -0.52)
	gun.add_child(muzzle)


func _new_target() -> void:
	target = Vector3(randf_range(-55, 55), 0, randf_range(-55, 40))
	_stuck = 0.0


func hit(amount: float, from: Vector3) -> bool:
	if dead:
		return false
	health -= amount
	_alert = 6.0
	state = "fight"
	model.rotation.x = -0.12
	if health > 0.0:
		return false
	dead = true
	collision_layer = 0
	velocity = Vector3.ZERO
	w.on_kill()
	var away := (global_position - from)
	var tw := create_tween()
	tw.tween_property(model, "rotation:x", 1.45 if away.dot(-global_transform.basis.z) > 0.0 else -1.45, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(model, "position:y", 0.12, 0.45)
	tw.tween_interval(8.0)
	tw.tween_callback(_respawn)
	return true


func _respawn() -> void:
	global_position = w.enemy_spawn_point()
	model.rotation = Vector3.ZERO
	model.position = Vector3.ZERO
	health = 100.0
	dead = false
	state = "patrol"
	collision_layer = 4
	_new_target()


func _can_see(p: Node3D) -> bool:
	var eye := global_position + Vector3(0, 1.6, 0)
	var at: Vector3 = p.global_position + Vector3(0, 1.3, 0)
	if eye.distance_to(at) > 90.0:
		return false
	var q := PhysicsRayQueryParameters3D.create(eye, at, 3, [get_rid()])
	var r := get_world_3d().direct_space_state.intersect_ray(q)
	return not r.is_empty() and r.collider == p


func _physics_process(dt: float) -> void:
	if dead:
		return
	var p: CharacterBody3D = w.player
	var to_p: Vector3 = p.global_position - global_position
	_think -= dt
	_alert -= dt
	if _think <= 0.0:
		_think = 0.2
		var facing := -global_transform.basis.z
		var sees: bool = not p.dead and _can_see(p)
		var noticed: bool = sees and (_alert > 0.0 or facing.dot(to_p.normalized()) > 0.2 or to_p.length() < 12.0)
		if sees and p.shot_t < 0.5 and to_p.length() < 70.0:
			noticed = true
		if noticed:
			state = "fight"
			_seen = minf(_seen + 0.2, 3.0)
		elif state == "fight":
			_seen -= 0.2
			if _seen <= -3.0:
				state = "patrol"
				_seen = 0.0
				_new_target()
	var move := Vector3.ZERO
	if state == "fight":
		var flat := Vector3(to_p.x, 0, to_p.z)
		_face(flat, dt * 6.0)
		if _seen > 0.0 and not p.dead:
			_shoot_at(p, dt, to_p.length())
		elif _seen <= 0.0:
			move = flat.normalized() * 2.8
		if flat.length() > 35.0:
			move = flat.normalized() * 2.5
	else:
		var d := target - global_position
		d.y = 0
		if d.length() < 1.5:
			_new_target()
		move = d.normalized() * 2.2
		_face(d, dt * 4.0)
	velocity.x = lerpf(velocity.x, move.x, 1.0 - exp(-8.0 * dt))
	velocity.z = lerpf(velocity.z, move.z, 1.0 - exp(-8.0 * dt))
	velocity.y = 0.0 if is_on_floor() else velocity.y - 19.0 * dt
	move_and_slide()
	# stuck against a wall: pick another goal
	if move.length() > 0.5:
		_stuck += dt
		if _stuck > 1.0:
			if global_position.distance_to(_last_pos) < 0.5:
				_new_target()
			_stuck = 0.0
			_last_pos = global_position
	# walk cycle and recoil recovery
	var hs := Vector2(velocity.x, velocity.z).length()
	_walk += hs * dt * 2.6
	var sw := sin(_walk) * clampf(hs / 2.5, 0.0, 1.0) * 0.55
	hips[0].rotation.x = sw
	hips[1].rotation.x = -sw
	model.rotation.x = lerpf(model.rotation.x, 0.0, 1.0 - exp(-8.0 * dt))
	arms.rotation.x = lerpf(arms.rotation.x, clampf(atan2(to_p.y - 0.3, Vector2(to_p.x, to_p.z).length()), -0.6, 0.6) if state == "fight" else -0.35, 1.0 - exp(-6.0 * dt))


func _face(d: Vector3, k: float) -> void:
	if d.length() < 0.01:
		return
	var want := atan2(-d.x, -d.z)
	rotation.y = lerp_angle(rotation.y, want, clampf(k, 0.0, 1.0))


func _shoot_at(p: CharacterBody3D, dt: float, dist: float) -> void:
	_shot_cd -= dt
	if _shot_cd > 0.0:
		return
	if _burst <= 0:
		_burst = randi_range(3, 5)
	_burst -= 1
	_shot_cd = 0.12 if _burst > 0 else randf_range(0.7, 1.5)
	var from := muzzle.global_position
	var aim: Vector3 = p.global_position + Vector3(0, randf_range(0.9, 1.6), 0)
	var moving := Vector2(p.velocity.x, p.velocity.z).length() > 2.0
	var chance := clampf(0.55 - dist * 0.006 + _seen * 0.08 - (0.15 if moving else 0.0) - (0.1 if p.crouch else 0.0), 0.08, 0.7)
	var hit := randf() < chance
	if not hit:
		aim += Vector3(randf_range(-1.2, 1.2), randf_range(-0.6, 0.9), randf_range(-1.2, 1.2))
	var q := PhysicsRayQueryParameters3D.create(from, from + (aim - from).normalized() * 150.0, 3, [get_rid()])
	var r := get_world_3d().direct_space_state.intersect_ray(q)
	var end := from + (aim - from).normalized() * 150.0
	if not r.is_empty():
		end = r.position
		if r.collider == p:
			p.damage(randf_range(8.0, 13.0), global_position)
		else:
			w.impact(r.position, r.normal)
	w.tracer(from, end)
	w.flash(from, 0.4)
	w.sound3d("enemy", from, 2.0)
	model.rotation.x = -0.04
