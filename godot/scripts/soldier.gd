extends CharacterBody3D
## A bot soldier on either side: a model in its team's uniform, a walk cycle, and a brain that takes and defends
## flags and fights with its class's gun, at the skill the battle's difficulty sets (data.gd DIFFICULTY).

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")
const Proj := preload("res://scripts/proj.gd")
const TrooperScript := preload("res://scripts/trooper.gd")

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
var rig: Node3D
var _pitch := 0.0
var _rpg_t := 3.0
## Revive: down and waiting for a teammate (`medic`, whoever is on his way), or on his way to one (`patient`).
var downed := false
var medic: Node = null
var patient: Node = null
var _bleed := 0.0
var _down_t := 0.0
var _wait := 0.0
var _rev := 0.0
var _kneel := false


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


## His body: the web game's modern soldier (scripts/trooper.gd), his rifle's muzzle where the shots leave from.
func _build() -> void:
	rig = TrooperScript.new()
	model.add_child(rig)
	rig.setup(w, team, cls)
	muzzle = rig.muzzle


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
	_drop_patient()
	w.conquest.on_kill(self, attacker, weapon, head)
	_respawn_t = D.RULES["respawn"]
	# down, not out (unless it was a wreck or a knife from behind): a teammate can bring him back for a while
	downed = amount < D.RULES["overkill"]
	_bleed = D.RULES["bleed"]
	_down_t = 0.0
	_wait = randf_range(4.0, 8.0)
	medic = null
	rig.die()
	var tw := create_tween()
	var back := (global_position - from).dot(-global_transform.basis.z) > 0.0
	tw.tween_property(model, "rotation:x", 1.45 if back else -1.45, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.parallel().tween_property(model, "position:y", 0.12, 0.45)
	return true


## Brought back by a teammate (`by`): up on his feet with half his health, his kit as it was.
func revive_by(by: Node) -> void:
	if not downed:
		return
	dead = false
	downed = false
	medic = null
	health = D.RULES["revive_hp"]
	collision_layer = 4
	_protect = 1.0
	target = null
	var tw := create_tween()
	tw.tween_property(model, "rotation:x", 0.0, 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(model, "position:y", 0.0, 0.5)
	rig.revive()
	w.on_revive(self, by)


## Where a teammate kneels to revive him: his chest, lying on the ground.
func chest() -> Vector3:
	return model.to_global(Vector3(0, 1.2, 0)) if downed else global_position


## Bleeding out: he gives up (and waits to redeploy) when no one is coming for him after a few seconds, or when it's
## too late. You count as coming while you're on foot near him.
func _down(dt: float) -> void:
	_down_t += dt
	_bleed -= dt
	if medic and (medic.dead or medic.get("vehicle") or medic.get("patient") != self):
		medic = null
	var p = w.player
	var hope: bool = medic != null or (p.team == team and not p.dead and p.vehicle == null and p.global_position.distance_to(global_position) < 35.0)
	if _bleed <= 0.0 or (not hope and _down_t > _wait):
		downed = false
		medic = null
		_respawn_t = maxf(1.0, D.RULES["respawn"] - _down_t)


func _drop_patient() -> void:
	if patient and patient.medic == self:
		patient.medic = null
	patient = null
	_rev = 0.0
	_kneel = false


## A teammate down nearby: a support (with his defibrillator) goes to anyone within 40 m, fighting or not; anyone
## else to one within 12 m when he isn't fighting. One at a time each, and one helper each.
func _medic() -> void:
	if patient and (not patient.downed or patient.medic != self):
		_drop_patient()
	if patient or (target and cls != "support"):
		return
	var r := 40.0 if cls == "support" else 12.0
	var best: Node = null
	for s in w.soldiers:
		if s == self or not s.downed or s.team != team or (s.medic != null and s.medic != self):
			continue
		var d := global_position.distance_to(s.global_position)
		if d < r:
			r = d
			best = s
	if best:
		patient = best
		best.medic = self
		_rev = 0.0


func deploy(xf: Transform3D) -> void:
	global_transform = xf
	model.rotation = Vector3.ZERO
	model.position = Vector3.ZERO
	rig.revive()
	velocity = Vector3.ZERO
	health = D.RULES["health"]
	dead = false
	collision_layer = 4
	target = null
	downed = false
	medic = null
	_drop_patient()
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
		if downed:
			_down(dt)
			return
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
		_medic()
	var move := Vector3.ZERO
	_kneel = false
	var speed: float = D.MOVE["walk"]
	# (a teammate down within 20 m comes before the fight)
	var going: bool = patient != null and (target == null or global_position.distance_to(patient.global_position) < 20.0)
	if target and not going:
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
	elif patient:
		# run to him, kneel at his chest and bring him back
		var to: Vector3 = patient.chest() - global_position
		to.y = 0.0
		_face(to, dt * 6.0)
		if to.length() > 0.8:
			move = to.normalized()
			if to.length() > 10.0:
				speed = D.MOVE["sprint"]
			_rev = 0.0
		else:
			_kneel = true
			_rev += dt
			if _rev >= D.RULES["revive_fast" if cls == "support" else "revive_slow"]:
				var pt := patient
				_drop_patient()
				pt.revive_by(self)
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
	model.rotation.x = lerpf(model.rotation.x, 0.0, 1.0 - exp(-8.0 * dt))
	var pitch := 0.0
	if target:
		var to := target.global_position - global_position
		pitch = clampf(atan2(to.y, Vector2(to.x, to.z).length()), -0.6, 0.6)
	_pitch = lerpf(_pitch, pitch, 1.0 - exp(-6.0 * dt))
	if _kneel:
		rig.kneel(dt)
	else:
		rig.pose(dt, velocity, _pitch, target != null or fired < 2.5)


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
