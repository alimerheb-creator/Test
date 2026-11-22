extends CharacterBody3D
## A bot soldier on either side: a model in its team's uniform, a walk cycle, and a brain that takes and defends
## flags and fights with its class's gun, at the skill the battle's difficulty sets (data.gd DIFFICULTY).

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")
const Proj := preload("res://scripts/proj.gd")

var w: Node
var team := 0
var cls := "assault"
var wpn: Dictionary
var diff: Dictionary
var tag := ""
var kills := 0
var deaths := 0
var score := 0
var health := 100.0
var dead := false
var crouch := false
var model: Node3D
var hips: Array[Node3D] = []
var arms: Node3D
var muzzle: Node3D
var target: Node3D
var goal := Vector3.ZERO
var goal_flag := -1
var _think := 0.0
var _react := 0.0
var _err := 0.0
var _burst := 0
var _shot_cd := 0.0
var _walk := 0.0
var _stuck_t := 0.0
var _last := Vector3.ZERO
var _avoid := Vector3.ZERO
var _avoid_t := 0.0
var _hold := 0.0
var _protect := 0.0
var _respawn_t := 0.0
var _strafe := 1.0
var fired := 99.0
var vehicle: Node = null
var _rpg_t := 3.0


func setup(world: Node, t: int, c: String, name_tag: String) -> void:
	w = world
	team = t
	cls = c
	tag = name_tag
	wpn = D.WEAPONS[D.CLASSES[c]["primary"]]
	diff = D.DIFFICULTY[w.difficulty]


func _ready() -> void:
	collision_layer = 4
	collision_mask = 1
	floor_max_angle = deg_to_rad(50)
	floor_snap_length = 0.6
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
	_think = randf() * 0.3
	_strafe = 1.0 if randf() < 0.5 else -1.0


func _cap(r: float, h: float) -> CapsuleMesh:
	var c := CapsuleMesh.new()
	c.radius = r
	c.height = h
	c.radial_segments = 10
	c.rings = 3
	return c


func _boxm(s: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = s
	return b


func _x(pos: Vector3, rot := Vector3.ZERO, s := Vector3.ONE) -> Transform3D:
	return Transform3D(Basis.from_euler(rot).scaled(s), pos)


func _part(parent: Node3D, parts: Array) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = T.merge(parts)
	mi.material_override = w.soldier_mat()
	parent.add_child(mi)
	return mi


func _build() -> void:
	var C: Dictionary = D.TEAMS[team]
	var top: Color = C["top"]
	var pants: Color = C["pants"]
	var vest: Color = C["vest"]
	var dark := Color(0.12, 0.11, 0.1)
	var skin := Color(0.62, 0.46, 0.36) if randf() < 0.6 else Color(0.42, 0.3, 0.22)
	for side in [-1.0, 1.0]:
		var hip := Node3D.new()
		hip.position = Vector3(0.11 * side, 0.95, 0)
		model.add_child(hip)
		_part(hip, [[_cap(0.085, 0.55), _x(Vector3(0, -0.24, 0)), pants], [_cap(0.075, 0.5), _x(Vector3(0, -0.66, 0)), pants],
			[_boxm(Vector3(0.11, 0.1, 0.27)), _x(Vector3(0, -0.9, -0.05)), Color(0.2, 0.16, 0.12)],
			[_boxm(Vector3(0.12, 0.12, 0.08)), _x(Vector3(0, -0.47, -0.08)), vest]])
		hips.append(hip)
	var helm := SphereMesh.new()
	helm.radius = 0.135
	helm.height = 0.2
	helm.is_hemisphere = true
	helm.radial_segments = 12
	helm.rings = 4
	var body := [[_cap(0.19, 0.7), _x(Vector3(0, 1.28, 0), Vector3.ZERO, Vector3(1, 1, 0.75)), top],
		[_boxm(Vector3(0.4, 0.42, 0.3)), _x(Vector3(0, 1.3, -0.01)), vest],
		[_boxm(Vector3(0.3, 0.32, 0.12)), _x(Vector3(0, 1.32, 0.2)), vest.darkened(0.15)],
		[_boxm(Vector3(0.38, 0.07, 0.3)), _x(Vector3(0, 0.98, 0)), dark],
		[_cap(0.1, 0.24), _x(Vector3(0, 1.67, 0)), skin], [helm, _x(Vector3(0, 1.72, 0)), C["helmet"]],
		[_boxm(Vector3(0.15, 0.04, 0.05)), _x(Vector3(0, 1.73, -0.11)), Color(0.05, 0.06, 0.07)],
		[_boxm(Vector3(0.16, 0.05, 0.06)), _x(Vector3(0, 1.58, -0.06)), vest]]
	for x in [-0.12, 0.0, 0.12]:
		body.append([_boxm(Vector3(0.09, 0.12, 0.07)), _x(Vector3(x, 1.2, -0.18)), vest.darkened(0.1)])
	_part(model, body)
	arms = Node3D.new()
	arms.position = Vector3(0, 1.42, 0)
	model.add_child(arms)
	var g := Vector3(0.08, -0.12, -0.4)
	var gun := Color(0.13, 0.13, 0.14)
	var long := 0.2 if cls == "recon" else (0.0 if cls != "engineer" else -0.08)
	_part(arms, [[_cap(0.065, 0.5), _x(Vector3(0.2, -0.12, -0.12), Vector3(-1.0, 0, 0.2)), top],
		[_cap(0.065, 0.55), _x(Vector3(-0.12, -0.1, -0.24), Vector3(-1.2, -0.5, -0.2)), top],
		[_boxm(Vector3(0.06, 0.09, 0.42)), _x(g), gun], [_boxm(Vector3(0.05, 0.08, 0.22)), _x(g + Vector3(0, -0.01, 0.3)), gun],
		[_boxm(Vector3(0.03, 0.14 if cls != "support" else 0.1, 0.06 if cls != "support" else 0.14)), _x(g + Vector3(0, -0.1, -0.05)), gun],
		[_boxm(Vector3(0.025, 0.025, 0.3 + long)), _x(g + Vector3(0, 0.015, -0.34 - long / 2.0)), gun],
		[_boxm(Vector3(0.05, 0.06, 0.06)), _x(g + Vector3(0.1, -0.12, 0.25)), dark],
		[_boxm(Vector3(0.05, 0.06, 0.06)), _x(g + Vector3(-0.02, -0.06, -0.22)), dark]])
	muzzle = Node3D.new()
	muzzle.position = g + Vector3(0, 0.015, -0.52 - long)
	arms.add_child(muzzle)


func damage(amount: float, from: Vector3, attacker: Node, head := false, weapon := "") -> bool:
	if dead or _protect > 0.0 or (attacker and attacker != self and attacker.team == team):
		return false
	health -= amount
	if attacker and attacker != self and not target:
		target = attacker
		_react = randf_range(diff["reaction"][0], diff["reaction"][1]) * 0.6
		_err = diff["aim"] * 2.0
	model.rotation.x = -0.12
	if health > 0.0:
		return false
	dead = true
	collision_layer = 0
	velocity = Vector3.ZERO
	target = null
	w.conquest.on_kill(self, attacker, weapon, head)
	_respawn_t = D.RULES["respawn"]
	var tw := create_tween()
	var back := (global_position - from).dot(-global_transform.basis.z) > 0.0
	tw.tween_property(model, "rotation:x", 1.45 if back else -1.45, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(model, "position:y", 0.12, 0.45)
	return true


func deploy(xf: Transform3D) -> void:
	global_transform = xf
	model.rotation = Vector3.ZERO
	model.position = Vector3.ZERO
	velocity = Vector3.ZERO
	health = D.RULES["health"]
	dead = false
	collision_layer = 4
	target = null
	goal_flag = -1
	_protect = D.RULES["protect"]
	_pick_goal()


func _respawn() -> void:
	var cq = w.conquest
	if not cq.use_ticket(team):
		return
	var pts: Array = cq.spawn_points(team)
	# usually the point nearest a flag it doesn't hold
	var best: Array = pts[randi() % pts.size()]
	if randf() < 0.7:
		var bd := INF
		for p in pts:
			for f in cq.flags:
				if f["owner"] != team:
					var d: float = (p[1] as Vector3).distance_to(f["pos"])
					if d < bd:
						bd = d
						best = p
	deploy(cq.spawn_at(team, best))


func _pick_goal() -> void:
	var cq = w.conquest
	var total := 0.0
	var ws := []
	for i in cq.flags.size():
		var f: Dictionary = cq.flags[i]
		var wt := 1.0 if f["owner"] == team else (3.5 if f["owner"] == -1 else 3.0)
		wt *= 140.0 / (global_position.distance_to(f["pos"]) + 60.0)
		ws.append(wt)
		total += wt
	var r := randf() * total
	goal_flag = 0
	for i in ws.size():
		r -= ws[i]
		if r <= 0.0:
			goal_flag = i
			break
	var f: Dictionary = cq.flags[goal_flag]
	var a := randf() * TAU
	var d: float = randf() * f["radius"] * 0.7
	goal = f["pos"] + Vector3(cos(a) * d, 0, sin(a) * d)
	_hold = randf_range(8.0, 20.0)


func _sees(s: Node3D) -> bool:
	var eye := global_position + Vector3(0, 1.6, 0)
	var at: Vector3 = s.global_position + Vector3(0, 1.2 if not s.crouch else 0.8, 0)
	var q := PhysicsRayQueryParameters3D.create(eye, at, 1, [(s as CollisionObject3D).get_rid()])
	return get_world_3d().direct_space_state.intersect_ray(q).is_empty()


func _scan() -> void:
	var rng: float = wpn["bot_range"] * 1.15
	var cands := []
	for s in w.soldiers:
		if s.dead or s.team == team or s.get("vehicle"):
			continue
		var d := global_position.distance_to(s.global_position)
		if d < rng:
			cands.append([d, s])
	# and helicopters flying in range (a bot shoots at one only when no soldier is closer)
	for v in w.vehicles:
		if v.get("air") and not v.dead and v.team != team and v.driver:
			var d := global_position.distance_to(v.global_position)
			if d < rng:
				cands.append([d + 25.0, v])
	cands.sort_custom(func(a, b): return a[0] < b[0])
	if target and (target.dead or target.get("vehicle") != null or global_position.distance_to(target.global_position) > rng or not _sees(target)):
		target = null
	if target:
		return
	for i in mini(cands.size(), 3):
		var s: Node3D = cands[i][1]
		var facing := -global_transform.basis.z
		var to: Vector3 = (s.global_position - global_position).normalized()
		# notices what's in front, close by, or shooting
		if (facing.dot(to) > -0.2 or cands[i][0] < 15.0 or s.get("shot_t") != null and s.shot_t < 0.6) and _sees(s):
			target = s
			_react = randf_range(diff["reaction"][0], diff["reaction"][1])
			_err = diff["aim"] * 2.0
			_burst = 0
			return


func _physics_process(dt: float) -> void:
	fired += dt
	if dead:
		_respawn_t -= dt
		if _respawn_t <= 0.0 and not w.conquest.over:
			_respawn_t = 1.0
			_respawn()
		return
	if w.conquest.over:
		velocity = Vector3.ZERO
		return
	_protect -= dt
	_think -= dt
	if cls == "engineer":
		_anti_tank(dt)
	if _think <= 0.0:
		_think = 0.3
		_scan()
	var move := Vector3.ZERO
	var speed: float = D.MOVE["walk"]
	if target:
		var to := target.global_position - global_position
		var flat := Vector3(to.x, 0, to.z)
		_face(flat, dt * float(diff["turn"]))
		_react -= dt
		_err = lerpf(_err, diff["aim"] * 0.4, 1.0 - exp(-dt))
		if _react <= 0.0:
			_fire(dt, to.length())
		if flat.length() > wpn["bot_range"] * 0.8:
			move = flat.normalized()
		else:
			move = global_transform.basis.x * _strafe * 0.5
			if randf() < dt * 0.4:
				_strafe = -_strafe
	else:
		var d := goal - global_position
		d.y = 0.0
		var cq = w.conquest
		if d.length() < 2.5:
			_hold -= dt
			var f: Dictionary = cq.flags[goal_flag]
			if f["owner"] == team and _hold <= 0.0:
				_pick_goal()
		else:
			move = d.normalized()
			if d.length() > 40.0:
				speed = D.MOVE["sprint"]
			_face(d, dt * 5.0)
		if goal_flag >= 0 and cq.flags[goal_flag]["owner"] == team and d.length() < 2.5 and randf() < dt * 0.05:
			_pick_goal()
	# steer round walls and trees
	if move.length() > 0.1:
		_avoid_t -= dt
		if _avoid_t <= 0.0:
			_avoid = Vector3.ZERO
			var from := global_position + Vector3(0, 0.6, 0)
			var space := get_world_3d().direct_space_state
			if not space.intersect_ray(PhysicsRayQueryParameters3D.create(from, from + move * 2.5, 1)).is_empty():
				for ang in [0.9, -0.9, 1.6, -1.6]:
					var dir := move.rotated(Vector3.UP, ang)
					if space.intersect_ray(PhysicsRayQueryParameters3D.create(from, from + dir * 3.0, 1)).is_empty():
						_avoid = dir
						break
			_avoid_t = 0.6 if _avoid != Vector3.ZERO else 0.25
		if _avoid != Vector3.ZERO:
			move = _avoid
	var h := D.PLAY_HALF + 5.0
	if absf(global_position.x) > h or absf(global_position.z) > h:
		move = -Vector3(global_position.x, 0, global_position.z).normalized()
	velocity.x = lerpf(velocity.x, move.x * speed, 1.0 - exp(-8.0 * dt))
	velocity.z = lerpf(velocity.z, move.z * speed, 1.0 - exp(-8.0 * dt))
	velocity.y = -1.0 if is_on_floor() else velocity.y - D.RULES["gravity"] * dt
	move_and_slide()
	if move.length() > 0.5:
		_stuck_t += dt
		if _stuck_t > 1.5:
			if global_position.distance_to(_last) < 0.8:
				_avoid = move.rotated(Vector3.UP, randf_range(1.2, 2.2) * (1 if randf() < 0.5 else -1))
				_avoid_t = 1.5
				if not target and randf() < 0.3:
					_pick_goal()
			_stuck_t = 0.0
			_last = global_position
	var hs := Vector2(velocity.x, velocity.z).length()
	_walk += hs * dt * 2.4
	var sw := sin(_walk) * clampf(hs / 3.0, 0.0, 1.0) * 0.6
	hips[0].rotation.x = sw
	hips[1].rotation.x = -sw
	model.rotation.x = lerpf(model.rotation.x, 0.0, 1.0 - exp(-8.0 * dt))
	var pitch := -0.35
	if target:
		var to := target.global_position - global_position
		pitch = clampf(atan2(to.y, Vector2(to.x, to.z).length()), -0.6, 0.6)
	arms.rotation.x = lerpf(arms.rotation.x, pitch, 1.0 - exp(-6.0 * dt))


func _face(d: Vector3, k: float) -> void:
	if d.length() < 0.01:
		return
	rotation.y = lerp_angle(rotation.y, atan2(-d.x, -d.z), clampf(k, 0.0, 1.0))


## Engineers fire their RPG at enemy tanks in range that they can see.
func _anti_tank(dt: float) -> void:
	_rpg_t -= dt
	if _rpg_t > 0.0:
		return
	_rpg_t = 1.0
	var eye := global_position + Vector3(0, 1.6, 0)
	for v in w.vehicles:
		if v.dead or v.team == team or v.driver == null:
			continue
		var to: Vector3 = v.global_position + Vector3(0, 1.4, 0) - eye
		var d := to.length()
		if d > 110.0:
			continue
		var q := PhysicsRayQueryParameters3D.create(eye, eye + to, 1, [v.get_rid()])
		if not get_world_3d().direct_space_state.intersect_ray(q).is_empty():
			continue
		rotation.y = atan2(-to.x, -to.z)
		var err := Vector3(randf_range(-1, 1), randf_range(-0.4, 0.4), randf_range(-1, 1)) * float(diff["aim"]) * d * 0.5
		var lift := Vector3(0, 1.5 * pow(d / 72.0, 2.0), 0)
		Proj.new().launch(w, "rocket", eye + to.normalized() * 0.8, (to + err + lift).normalized(), self)
		w.sound3d("pistol", eye, 2.0)
		fired = 0.0
		_rpg_t = randf_range(7.0, 11.0)
		return


func _fire(dt: float, dist: float) -> void:
	_shot_cd -= dt
	if _shot_cd > 0.0:
		return
	var b: Array = diff["burst"]
	if _burst <= 0:
		_burst = randi_range(b[0], b[1]) if wpn["kind"] == "auto" else 1
	_burst -= 1
	var gap := 60.0 / float(wpn["rpm"])
	_shot_cd = gap if _burst > 0 else randf_range(0.45, 1.1) + (gap if wpn["kind"] != "auto" else 0.0)
	var from := muzzle.global_position
	var aim := target.global_position + Vector3(0, (0.8 if target.crouch else 1.25) + randf_range(-0.2, 0.35), 0)
	var err := _err * (1.5 if Vector2(target.velocity.x, target.velocity.z).length() > 3.0 else 1.0)
	err += float(wpn["spread"]) * 0.5 * float(diff["spread"]) * 0.35
	aim += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)).normalized() * dist * err * randf()
	var dir := (aim - from).normalized()
	var end := from + dir * 300.0
	var r := get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from, end, 7, [get_rid()]))
	if not r.is_empty():
		end = r.position
		var c: Object = r.collider
		if c.has_method("damage"):
			var head: bool = r.position.y > (c as Node3D).global_position.y + 1.45
			var dmg := D.damage_at(wpn, dist) * float(D.RULES["bullet"]) * float(diff["dmg"]) * (float(wpn["head"]) if head else 1.0)
			c.damage(dmg, global_position, self, head, wpn["name"])
		else:
			w.impact(r.position, r.normal)
	w.tracer(from, end)
	w.flash(from, 0.4)
	fired = 0.0
	w.sound3d(wpn["sound"], from, 0.0)
	model.rotation.x = -0.03
