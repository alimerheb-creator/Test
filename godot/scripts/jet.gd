extends CharacterBody3D
## A fighter jet (Aviation), after the web game's Jets mod: Vanguard's F-16C Viper and Onyx's MiG-29 Fulcrum, built in
## code from simple shapes. You fly it where you look: the mouse (or a drag on a phone) swings your view round and the
## jet banks and pulls to follow it (the circle is where you're steering, the small cross where its nose and gun
## point). W/S or Shift/Ctrl (THR + and THR - on a phone, or the left stick) set the throttle, and full throttle lights
## the afterburner; A/D roll. Left mouse (GUN) fires the cannon; right mouse (MISSILE) a heat seeker, which chases a
## jet you've held near the nose till it locked on (the box turns red and the tone goes steady), or flies straight
## without a lock. Space (FLARES) throws flares, which can pull a missile off you. The gun's rounds, the missiles and
## the flares come back slowly. Bots fly the rest: they pick a fight, chase, shoot and lock on, throw flares and break
## hard when a missile comes, and keep clear of the ground and inside the map. A jet shot down (or flown into the
## ground) comes back high over its own airbase a few seconds later, and costs its side a ticket.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")
const Proj := preload("res://scripts/proj.gd")

var air := true
var jet := true
var transport := false
var w: Node
var team := 0
var S: Dictionary
var driver: Node = null  # you, flying it; otherwise its bot pilot flies it
var tag := ""
var kills := 0
var deaths := 0
var score := 0
var diff: Dictionary
var health := 100.0
var dead := false
var speed := 200.0
var throttle := 0.8
var ammo := [0, 0]
var flares := 0
var cam: Camera3D
var model: Node3D
var look := Vector3.FORWARD  # where its pilot is steering: your view, or the bot's goal
var seek = null  # the jet its missile's seeker is on: locking, then locked
var lock = null
var lock_t := 0.0
var warn := 0.0  # a missile is after it
var danger := 0.0  # about to fly into the ground
var reload := 0.0
var killer: Node = null  # who shot it down last, and with what
var cause := ""
var weapon := 0
var _ctl := Vector3.ZERO  # stick and rudder: pitch, roll, yaw
var _trig := false
var _shoot := false
var _cam_yaw := 0.0
var _cam_pitch := 0.0
var _gun_cd := 0.0
var _gun_n := 0
var _cool := 0.0
var _mcd := 0.0
var _fcd := 0.0
var _rounds := 0.0
var _aam_t := 0.0
var _flare_t := 0.0
var _wreck_t := 0.0
var _fall := false
var _spin := 0.0
var _by: Node = null
var _by_what := ""
var _by_t := 0.0
var _shake := 0.0
var _abs: Array = []
var _stores: Array = []
var _muzzle := Vector3.ZERO
var _sound: AudioStreamPlayer3D
var _gun_sound: AudioStreamPlayer3D
var _tone: AudioStreamPlayer
var _smoke: CPUParticles3D
var _was_rmb := false
var _was_space := false
var _target = null
var _think := 0.0
var _err := Vector3.ZERO
var _skill := 1.0
var _agile := 1.0  # how hard it can pull: you fully, a bot by its skill (and harder chasing a jet ahead of it)
var _goal := Vector3.ZERO
static var _mat: StandardMaterial3D
static var _wreck: StandardMaterial3D
static var _flame: StandardMaterial3D
static var _white: StandardMaterial3D


func setup(world: Node, t: int, spec: Dictionary, who: String) -> void:
	w = world
	team = t
	S = spec
	tag = who
	diff = D.DIFFICULTY[w.difficulty]
	_skill = 0.55 + 0.07 * float(diff["turn"])
	collision_layer = 0
	collision_mask = 0
	model = build_model(S, team)
	add_child(model)
	for n in model.get_children():
		if String(n.name).begins_with("ab"):
			_abs.append(n)
		elif String(n.name).begins_with("aam"):
			_stores.append(n)
	_muzzle = model.get_meta("muzzle")
	cam = Camera3D.new()
	cam.top_level = true
	cam.near = 0.5
	cam.far = 14000.0
	add_child(cam)
	_sound = AudioStreamPlayer3D.new()
	_sound.stream = w.sounds["jet"]
	_sound.unit_size = 45.0
	_sound.max_distance = 2500.0
	_sound.volume_db = -3.0
	add_child(_sound)
	_gun_sound = AudioStreamPlayer3D.new()
	_gun_sound.stream = w.sounds["cannon"]
	_gun_sound.unit_size = 40.0
	_gun_sound.max_distance = 1800.0
	add_child(_gun_sound)
	respawn()


## You fly this one: you're hidden away in it, and see from behind it.
func take(p: Node) -> void:
	driver = p
	p.vehicle = self
	p.dead = false
	p.collision_layer = 0
	p.collision_mask = 0
	p.vm.visible = false
	p.knife.visible = false
	_tone = AudioStreamPlayer.new()
	add_child(_tone)
	_camera(0.0)
	cam.current = true


## Whoever's flying it, who gets its kills: you, or the jet itself for its bot pilot.
func pilot() -> Node:
	return driver if driver else self


## High over its own airbase, heading for the enemy's, armed again.
func respawn() -> void:
	dead = false
	_fall = false
	model.visible = true
	model.rotation = Vector3.ZERO
	health = float(S["health"])
	var b: Array = D.BASES[team]
	var s := 1.0 if team == 0 else -1.0
	var x: float = b[0] + randf_range(-450.0, 450.0)
	var z: float = b[1] + s * randf_range(0.0, 300.0)
	var y := maxf(float(D.AIR["alt"]), T.height(x, z) + 380.0) + randf_range(-80.0, 80.0)
	global_transform = Transform3D(Basis(Vector3.UP, (0.0 if team == 0 else PI) + randf_range(-0.25, 0.25)), Vector3(x, y, z))
	speed = float(S["corner"]) + 20.0
	throttle = 0.8
	velocity = -global_basis.z * speed
	ammo = [int(S["gun_ammo"]), int(S["aams"])]
	flares = int(S["flares"])
	for st in _stores:
		st.visible = true
	_paint(null)
	seek = null
	lock = null
	lock_t = 0.0
	warn = 0.0
	danger = 0.0
	_target = null
	_by = null
	_by_t = 0.0
	_ctl = Vector3.ZERO
	look = -global_basis.z
	_cam_yaw = atan2(-look.x, -look.z)
	_cam_pitch = 0.0
	if _smoke:
		_smoke.queue_free()
		_smoke = null
	_sound.play()


func _paint(m: Material) -> void:
	(model.get_node("body") as MeshInstance3D).material_override = m if m else _mat


func _physics_process(dt: float) -> void:
	if dead:
		if _fall:
			_crash(dt)
		_wreck_t -= dt
		if driver == w.player:
			_camera(dt)
		if _wreck_t <= 0.0 and not w.conquest.over:
			respawn()
		return
	_gun_cd -= dt
	_mcd -= dt
	_fcd -= dt
	warn -= dt
	_by_t -= dt
	_resupply(dt)
	_trig = false
	_shoot = false
	var me: bool = driver == w.player
	# (a test can have a bot fly yours: the world's meta "autopilot")
	if me and not w.has_meta("autopilot"):
		_fly_player(dt)
	else:
		_fly_bot(dt)
	if w.conquest.over:
		_ctl = _steer(Vector3(look.x, 0.0, look.z).normalized())
		_trig = false
		_shoot = false
	_fly(dt)
	if dead:
		return
	_seeker(dt)
	if _trig:
		_gun()
	elif _gun_sound.playing:
		_gun_sound.stop()
	if _shoot:
		_missile()
	for m in Proj.aams:
		if is_instance_valid(m) and m.target == self:
			warn = 0.3
	var ab := throttle > 0.98
	for a in _abs:
		a.visible = throttle > 0.55
		a.scale = Vector3.ONE * (0.4 + throttle * 0.6) * (1.35 if ab else 0.6)
	_sound.pitch_scale = 0.75 + speed / float(S["ab"]) * 0.5
	if me:
		var ahead := global_position + velocity * 3.0
		danger = 1.0 if velocity.y < -8.0 and ahead.y < T.height(ahead.x, ahead.z) + 40.0 else 0.0
		_cues()
		_camera(dt)


## The gun's rounds come back a while after it stops firing; a missile every 20 s, a flare salvo every 4 s.
func _resupply(dt: float) -> void:
	_cool += dt
	var n: int = S["gun_ammo"]
	if _cool > 3.0 and ammo[0] < n:
		_rounds += n * 0.08 * dt
		var k := int(_rounds)
		_rounds -= k
		ammo[0] = mini(n, ammo[0] + k)
	_aam_t += dt
	if ammo[1] >= int(S["aams"]):
		_aam_t = 0.0
	elif _aam_t > 20.0:
		_aam_t = 0.0
		_stores[ammo[1]].visible = true
		ammo[1] += 1
	_flare_t += dt
	if flares >= int(S["flares"]):
		_flare_t = 0.0
	elif _flare_t > 4.0:
		_flare_t = 0.0
		flares += 1


## The flight: stick and rudder turn it (best near corner speed, less when slow or very fast), the throttle and the
## afterburner push it on against the drag, climbing slows it and diving speeds it up, hard turns bleed speed, and
## below stall speed it sinks and its nose drops.
func _fly(dt: float) -> void:
	var b := global_basis
	var v := speed
	var stall: float = S["stall"]
	var corner: float = S["corner"]
	var auth := clampf((v - stall * 0.6) / (corner - stall * 0.6), 0.15, 1.0)
	if v > corner:
		auth = lerpf(1.0, 0.7, clampf((v - corner) / (float(S["ab"]) - corner), 0.0, 1.0))
	b = b * Basis(Vector3.RIGHT, _ctl.x * float(S["pitch"]) * auth * _agile * dt)
	b = b * Basis(Vector3.UP, -_ctl.z * float(S["yaw"]) * auth * dt)
	b = b * Basis(Vector3.BACK, -_ctl.y * float(S["roll"]) * clampf(v / corner, 0.35, 1.0) * dt)
	var fwd := -b.z
	if v < stall:
		var ax := fwd.cross(Vector3.DOWN)
		if ax.length() > 0.01:
			b = Basis(ax.normalized(), (1.0 - v / stall) * 1.2 * dt) * b
	b = b.orthonormalized()
	fwd = -b.z
	var top: float = S["top"]
	var k := float(S["accel"]) / (top * top)
	var thrust := throttle * float(S["accel"])
	if throttle > 0.98:
		thrust = k * float(S["ab"]) * float(S["ab"])
	speed = clampf(v + (thrust - k * v * v - fwd.y * 11.0 - absf(_ctl.x) * auth * v * 0.1) * dt, 35.0, float(S["ab"]) * 1.15)
	velocity = fwd * speed
	if speed < stall:
		velocity += Vector3.DOWN * (stall - speed) * 1.5
	var pos := global_position + velocity * dt
	global_transform = Transform3D(b, pos)
	if pos.y < T.height(pos.x, pos.z) + 1.0:
		# into the ground: whoever hit it last gets it
		if _by_t > 0.0 and is_instance_valid(_by):
			_destroy(_by, _by_what)
		else:
			_destroy(null, "CRASHED")


## Stick and rudder (pitch, roll, yaw: each -1 to 1) that swing the nose toward dir: well off the nose, bank toward it
## and pull; near it, keep banking toward it and nudge the nose on with stick and rudder, firmly (a jet that's turning
## keeps moving); right on it, bring the wings level.
func _steer(dir: Vector3) -> Vector3:
	var b := global_basis
	var l := b.transposed() * dir
	var ahead := -l.z
	var off := acos(clampf(ahead, -1.0, 1.0))
	var phi := atan2(l.x, l.y) if Vector2(l.x, l.y).length() > 0.0001 else 0.0
	var roll := lerpf(clampf(atan2(b.x.y, b.y.y) * 2.0, -1.0, 1.0), clampf(phi * 2.5, -1.0, 1.0), smoothstep(0.015, 0.08, off))
	var pull := clampf(off * 8.0, 0.0, 1.0) * clampf(1.0 - absf(phi) / 1.3, 0.0, 1.0)
	var k := smoothstep(0.08, 0.25, off)
	var pitch := clampf(atan2(l.y, ahead) * 14.0, -1.0, 1.0)
	var yaw := clampf(atan2(l.x, ahead) * 14.0, -1.0, 1.0)
	return Vector3(lerpf(pitch, pull, k), roll, yaw * (1.0 - k))


func _fly_player(dt: float) -> void:
	var hud = w.hud
	var p = w.player
	var lk: Vector2 = (p._mouse * 0.0022 + hud.take_look() * 0.004) * float(w.sens)
	p._mouse = Vector2.ZERO
	_cam_yaw -= lk.x
	_cam_pitch = clampf(_cam_pitch - lk.y, -1.4, 1.4)
	look = Vector3(-sin(_cam_yaw) * cos(_cam_pitch), sin(_cam_pitch), -cos(_cam_yaw) * cos(_cam_pitch))
	_ctl = _steer(look)
	var mv: Vector2 = hud.move
	var thr := -mv.y
	var roll := mv.x
	var mouse_ok: bool = not hud.touch_ui and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
	if not hud.touch_ui:
		if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_SHIFT):
			thr += 1.0
		if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_CTRL):
			thr -= 1.0
		if Input.is_physical_key_pressed(KEY_A):
			roll -= 1.0
		if Input.is_physical_key_pressed(KEY_D):
			roll += 1.0
	if hud.held("up"):
		thr += 1.0
	if hud.held("down"):
		thr -= 1.0
	throttle = clampf(throttle + clampf(thr, -1.0, 1.0) * 0.6 * dt, 0.0, 1.0)
	if absf(roll) > 0.05:
		_ctl.y = clampf(roll, -1.0, 1.0)
	_trig = (mouse_ok and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)) or hud.fire
	var rmb := mouse_ok and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)
	_shoot = (rmb and not _was_rmb) or hud.take("aam")
	_was_rmb = rmb
	var sp: bool = not hud.touch_ui and Input.is_physical_key_pressed(KEY_SPACE)
	if (sp and not _was_space) or hud.take("flare"):
		_flare()
	_was_space = sp


## Behind the jet, looking where you steer (it swings round as you look about), kept off the ground.
func _camera(dt: float) -> void:
	var d := look
	var pos := global_position - d * (24.0 + speed * 0.012) + Vector3.UP * 5.0
	pos.y = maxf(pos.y, T.height(pos.x, pos.z) + 3.0)
	_shake = move_toward(_shake, 0.0, dt * 1.5)
	if _shake > 0.0:
		pos += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * _shake * 0.4
	cam.global_transform = Transform3D(Basis.looking_at(d, Vector3.UP if absf(d.y) < 0.99 else Vector3.FORWARD), pos)
	cam.fov = w.fov + clampf((speed - 200.0) / 200.0, 0.0, 1.0) * 8.0


## Your seeker's tone (a warble while it's locking on, steady once locked) and the missile warning's beeps.
func _cues() -> void:
	var want: AudioStream = null
	if warn > 0.0:
		want = w.sounds["warn"]
	elif lock:
		want = w.sounds["lock"]
	elif seek:
		want = w.sounds["seek"]
	if want == null:
		if _tone.playing:
			_tone.stop()
	elif _tone.stream != want or not _tone.playing:
		_tone.stream = want
		_tone.volume_db = -10.0
		_tone.play()


## The seeker looks for the enemy jet nearest the nose (within its cone and range) and locks on after holding it a
## moment (a bot takes longer, the less skilled the longer).
func _seeker(dt: float) -> void:
	if ammo[1] <= 0:
		seek = null
		lock = null
		return
	var fwd := -global_basis.z
	var L: Array = S["lock"]
	var best = null
	var bs := INF
	for v in w.vehicles:
		if v.dead or v.team == team or not v.get("jet"):
			continue
		var rel: Vector3 = v.global_position - global_position
		var d := rel.length()
		if d > float(L[0]) or d < 120.0:
			continue
		var a := fwd.angle_to(rel / d)
		if a > float(L[1]):
			continue
		var sc := a + d / 6000.0 - (0.3 if v == seek else 0.0)
		if sc < bs:
			bs = sc
			best = v
	if best != seek:
		seek = best
		lock = null
		lock_t = 0.0
	if seek:
		lock_t += dt
		if lock_t >= float(L[2]) * (1.0 if driver == w.player else 2.1 - _skill):
			lock = seek


## The cannon: each round flies straight off the nose (a little spread), and hits the first enemy jet it passes
## close enough to, or the ground.
func _gun() -> void:
	if _gun_cd > 0.0 or ammo[0] <= 0:
		if ammo[0] <= 0 and _gun_sound.playing:
			_gun_sound.stop()
		return
	_gun_cd = float(S["gun_cd"])
	ammo[0] -= 1
	_gun_n += 1
	_cool = 0.0
	var me: bool = driver == w.player and not w.has_meta("autopilot")
	var from: Vector3 = global_transform * _muzzle
	var spread: float = 0.004 if me else 0.005 + float(diff["aim"]) * 0.08
	var dir := (-global_basis.z + Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * spread).normalized()
	var reach := 1300.0
	var end := from + dir * reach
	var r := get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from, end, 1))
	if not r.is_empty():
		end = r.position
		reach = from.distance_to(end)
	var hit = null
	for v in w.vehicles:
		if v == self or v.dead or v.team == team:
			continue
		var rel: Vector3 = v.global_position - from
		var t := rel.dot(dir)
		if t < 0.0 or t > reach:
			continue
		if (rel - dir * t).length() < float(v.S["size"]):
			hit = v
			reach = t
	if hit:
		end = from + dir * reach
		hit.hurt(float(S["gun_dmg"]) * (1.0 if me else float(diff["dmg"])), pilot(), S["gun"])
		if _gun_n % 3 == 0:
			w.flash(end, 1.6)
	elif not r.is_empty() and _gun_n % 4 == 0:
		w.impact(r.position, r.normal)
	if _gun_n % 3 == 0:
		w.tracer(from + velocity * 0.03, end)
	if me:
		_shake = maxf(_shake, 0.06)
	if not _gun_sound.playing:
		_gun_sound.play()


## A heat seeker off the rail: after the jet it's locked on to, or straight ahead without a lock.
func _missile() -> void:
	if _mcd > 0.0 or ammo[1] <= 0:
		return
	_mcd = 0.8 if driver == w.player else randf_range(5.0, 9.0)
	ammo[1] -= 1
	var st: Node3D = _stores[ammo[1]]
	st.visible = false
	var pr := Proj.new()
	pr.label = S["aam"]
	pr.target = lock
	pr.launch(w, "aam", st.global_position, Vector3.ZERO, pilot())
	pr.vel = -global_basis.z * (speed + 30.0)
	w.sound3d("missile", st.global_position, 4.0)


## Three flares fall away behind; each missile after this jet may go for one instead.
func _flare() -> void:
	if flares <= 0 or _fcd > 0.0:
		return
	flares -= 1
	_fcd = 0.8
	var made := []
	for i in 3:
		var f := Proj.new()
		f.launch(w, "flare", global_position + global_basis.z * 5.0, Vector3.ZERO, pilot())
		f.vel = velocity * 0.55 + global_basis.x * randf_range(-30.0, 30.0) + Vector3.DOWN * randf_range(10.0, 25.0)
		made.append(f)
	for m in Proj.aams:
		if is_instance_valid(m) and m.target == self and randf() < float(m.p["decoy"]):
			m.target = made[randi() % made.size()]
	w.sound3d("pistol", global_position, -6.0)


## A bot pilot. A missile coming: it throws flares and breaks hard across the missile's path. With a target (the
## nearest enemy, those ahead first), it chases it, leading it from far off and pointing straight at it in gun range,
## fires when its nose is on, and sends a missile once locked. With none, it heads for the middle. It keeps off the
## ground and inside the map all the while.
func _fly_bot(dt: float) -> void:
	var pos := global_position
	var fwd := -global_basis.z
	_think -= dt
	if _think <= 0.0:
		_think = randf_range(0.7, 1.3)
		_target = _pick_target()
		_err = Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * float(diff["aim"]) * 0.15
		_goal = Vector3(randf_range(-700.0, 700.0), 0.0, randf_range(-700.0, 700.0))
	var want := fwd
	var thr := 0.85
	_agile = _skill
	var m = _incoming()
	if m:
		if pos.distance_to(m.global_position) < 1300.0 and randf() < (0.5 + 0.8 * _skill) * dt:
			_flare()
		var side: Vector3 = (pos - m.global_position).cross(Vector3.UP)
		side = side.normalized() if side.length() > 0.1 else global_basis.x
		if side.dot(fwd) < 0.0:
			side = -side
		want = (side + Vector3.DOWN * 0.2).normalized()
		thr = 1.0
	elif _target and is_instance_valid(_target) and not _target.dead:
		var tp: Vector3 = _target.global_position
		var rel := tp - pos
		var dist := rel.length()
		if dist < 1000.0:
			want = (rel / dist + _err).normalized()
		else:
			want = (tp + _target.velocity * minf(dist / 400.0, 4.0) - pos).normalized()
		var off := fwd.angle_to(rel / dist)
		# far off, full afterburner; close, near corner speed (where it turns best), easing off not to overshoot
		thr = 1.0 if dist > 1400.0 or speed < float(S["corner"]) - 10.0 else 0.75
		if dist < 300.0 and off < 0.5:
			thr = 0.5
		# chasing one ahead of it, it pulls harder: so a chase ends, and isn't a circle for ever
		if off < 1.2 and dist < 1500.0:
			_agile = _skill * 1.2
		_trig = dist < 950.0 and off < 0.03 + float(diff["aim"]) * 0.3
		_shoot = lock == _target and _mcd <= 0.0 and dist > 350.0 and dist < 2200.0 and randf() < 1.2 * dt * (0.5 + _skill)
	else:
		want = (Vector3(_goal.x, maxf(800.0, T.height(_goal.x, _goal.z) + 400.0), _goal.z) - pos).normalized()
	want = _safe(want)
	throttle = move_toward(throttle, thr, dt * 0.6)
	_ctl = _steer(want)
	look = want


func _incoming():
	var best = null
	var bd := 2500.0
	for m in Proj.aams:
		if is_instance_valid(m) and m.target == self:
			var d: float = global_position.distance_to(m.global_position)
			if d < bd:
				bd = d
				best = m
	return best


func _pick_target():
	var fwd := -global_basis.z
	var best = null
	var bs := INF
	for v in w.vehicles:
		if v.dead or v.team == team:
			continue
		var rel: Vector3 = v.global_position - global_position
		var d := rel.length()
		var s := d * (1.7 - fwd.dot(rel / maxf(d, 1.0)) * 0.7) * (0.75 if v == _target else 1.0) * randf_range(0.85, 1.15)
		if s < bs:
			bs = s
			best = v
	return best


## Keeps a bot off the ground (looking a few seconds ahead) and inside the map.
func _safe(want: Vector3) -> Vector3:
	var pos := global_position
	var dz := 0.0
	for t in [1.0, 2.5, 4.0]:
		var p: Vector3 = pos + velocity * t
		dz = maxf(dz, (T.height(p.x, p.z) + 130.0 - p.y) / 130.0)
	dz = maxf(dz, (160.0 - (pos.y - T.height(pos.x, pos.z))) / 160.0)
	if dz > 0.0:
		var flat := Vector3(want.x, 0.0, want.z)
		if flat.length() < 0.05:
			flat = Vector3(-global_basis.z.x, 0.0, -global_basis.z.z)
		want = want.lerp((flat.normalized() + Vector3.UP * 1.3).normalized(), clampf(dz, 0.0, 1.0))
	var e := maxf(absf(pos.x), absf(pos.z))
	var edge: float = D.AIR["edge"]
	if e > edge:
		want = want.lerp(Vector3(-pos.x, 0.0, -pos.z).normalized(), clampf((e - edge) / 350.0, 0.0, 0.9))
	if pos.y > 2200.0:
		want += Vector3.DOWN * 0.6
	return want.normalized()


func damage(amount: float, _from: Vector3, attacker: Node, _head := false, weapon_name := "") -> bool:
	hurt(amount, attacker, weapon_name)
	return dead


func hurt(amount: float, by: Node, what: String) -> void:
	if dead or (by and by.get("team") == team):
		return
	health -= amount
	if by:
		_by = by
		_by_what = what
		_by_t = 8.0
	if driver == w.player:
		w.hud.hurt(Vector3.ZERO)
		_shake = maxf(_shake, 0.35)
	if health <= 0.0:
		_destroy(by, what)
	if by == w.player:
		w.hud.hitmark(dead, false)


## Shot down: a fireball, then it falls trailing smoke and blows up again where it hits; its side loses a ticket.
func _destroy(by: Node, what: String) -> void:
	dead = true
	_fall = true
	killer = by
	cause = what
	_wreck_t = float(D.AIR["respawn"])
	_spin = randf_range(-2.5, 2.5)
	seek = null
	lock = null
	_gun_sound.stop()
	if _tone:
		_tone.stop()
	var cq = w.conquest
	cq.on_kill(pilot(), by, what, false)
	cq.tickets[team] = maxf(0.0, cq.tickets[team] - 1.0)
	if by and by.get("score") != null:
		by.score += 100
	if by == w.player:
		w.hud.toast("+200  %s DOWN" % S["name"])
	if not _wreck:
		_wreck = StandardMaterial3D.new()
		_wreck.albedo_color = Color(0.07, 0.065, 0.06)
		_wreck.roughness = 1.0
	_paint(_wreck)
	for a in _abs:
		a.visible = false
	Proj.fireball(w, global_position, 12.0)
	w.sound3d("boom", global_position, 10.0)
	_smoke = Proj.trail(self, 3.0, 4.0, Color(0.1, 0.09, 0.08, 0.75))
	_sound.stop()


func _crash(dt: float) -> void:
	velocity.y -= 12.0 * dt
	velocity *= 1.0 - 0.25 * dt
	global_position += velocity * dt
	model.rotate_object_local(Vector3.BACK, _spin * dt)
	if global_position.y < T.height(global_position.x, global_position.z) + 1.0:
		_fall = false
		global_position.y = T.height(global_position.x, global_position.z) + 1.0
		model.visible = false
		Proj.fireball(w, global_position, 16.0)
		w.sound3d("boom", global_position, 10.0)


## (A jet is never left for anyone to take, nor got out of.)
func can_take(_s: Node) -> bool:
	return false


func exit(_force := false) -> void:
	pass


func next_weapon() -> void:
	pass


func pick_weapon(_i: int) -> void:
	pass


# ---------------------------------------------------------------- the model

## The jet's model, from cylinders, boxes and flat plates (wings, tails), in its side's colours: one mesh ("body"),
## plus the afterburner flames (ab*) and the missiles under the wings (aam*). Its meta "muzzle": where the gun fires
## from. Also parked at the airbases.
static func build_model(spec: Dictionary, t: int) -> Node3D:
	if not _mat:
		_mat = StandardMaterial3D.new()
		_mat.vertex_color_use_as_albedo = true
		_mat.vertex_color_is_srgb = true
		_mat.roughness = 0.5
		_mat.metallic = 0.3
		_flame = StandardMaterial3D.new()
		_flame.albedo_color = Color.BLACK
		_flame.emission_enabled = true
		_flame.emission = Color(1.0, 0.55, 0.25)
		_flame.emission_energy_multiplier = 7.0
		_white = StandardMaterial3D.new()
		_white.albedo_color = Color(0.85, 0.86, 0.84)
		_white.roughness = 0.6
	var f16: bool = spec["kind"] == "f16"
	var body := Color(0.55, 0.58, 0.61) if f16 else Color(0.38, 0.43, 0.47)
	var dark := Color(0.1, 0.1, 0.11)
	var glass := Color(0.09, 0.12, 0.15)
	var mark: Color = D.TEAMS[t]["color"]
	var Z := Basis(Vector3.RIGHT, PI / 2.0)  # a cylinder lying along z, its top toward the tail
	var NZ := Basis(Vector3.RIGHT, -PI / 2.0)  # its top toward the nose
	var flat := Vector3(1.0, 0.88, 1.0)
	var parts := []
	var nozzles := []
	var rails := []
	var muzzle := Vector3.ZERO
	if f16:
		parts.append_array([[T._cyl(0.78, 0.78, 10.0, 14), Transform3D(Z.scaled(flat), Vector3(0, 0, 0.5)), body],
			[T._cyl(0.05, 0.78, 4.2, 14), Transform3D(NZ.scaled(flat), Vector3(0, 0, -6.6)), body],
			[_box(Vector3(1.0, 0.55, 6.5)), Transform3D(Basis(), Vector3(0, 0.5, 1.8)), body],
			[_box(Vector3(1.4, 1.0, 3.4)), Transform3D(Basis(), Vector3(0, -0.8, -1.4)), body],
			[_box(Vector3(1.15, 0.8, 0.12)), Transform3D(Basis(), Vector3(0, -0.8, -3.12)), dark],
			[T._sphere(1.0, 14, 8), Transform3D(Basis.from_scale(Vector3(0.5, 0.46, 1.75)), Vector3(0, 0.66, -4.3)), glass],
			[T._cyl(0.62, 0.52, 1.3, 14), Transform3D(Z, Vector3(0, 0, 6.1)), dark]])
		_pair(parts, [Vector2(0.7, -1.4), Vector2(4.9, 2.3), Vector2(4.9, 3.3), Vector2(0.7, 3.6)], 0.14, -0.1, body)
		_pair(parts, [Vector2(0.5, -4.6), Vector2(1.0, -1.2), Vector2(0.5, -1.2)], 0.12, -0.02, body)
		_pair(parts, [Vector2(0.7, 4.3), Vector2(3.2, 5.9), Vector2(3.2, 6.6), Vector2(0.7, 6.7)], 0.1, -0.15, body)
		_fin(parts, [Vector2(0.5, 2.6), Vector2(4.3, 5.3), Vector2(4.3, 6.1), Vector2(0.5, 6.3)], Vector3(0, 0.3, 0), 0.0, body, mark)
		nozzles = [Vector3(0, 0, 6.75)]
		rails = [Vector3(4.95, -0.1, 2.7), Vector3(-4.95, -0.1, 2.7), Vector3(3.3, -0.42, 1.8), Vector3(-3.3, -0.42, 1.8)]
		muzzle = Vector3(-0.8, 0.5, -3.5)
	else:
		parts.append_array([[T._cyl(0.72, 0.72, 6.0, 14), Transform3D(Z.scaled(flat), Vector3(0, 0.1, -3.4)), body],
			[T._cyl(0.05, 0.72, 3.6, 14), Transform3D(NZ.scaled(flat), Vector3(0, 0.1, -8.2)), body],
			[_box(Vector3(2.3, 0.5, 7.5)), Transform3D(Basis(), Vector3(0, 0.1, 2.4)), body],
			[T._sphere(1.0, 14, 8), Transform3D(Basis.from_scale(Vector3(0.48, 0.5, 1.6)), Vector3(0, 0.75, -4.6)), glass]])
		for s in [-1.0, 1.0]:
			parts.append_array([[T._cyl(0.62, 0.62, 8.6, 14), Transform3D(Z, Vector3(s * 1.05, -0.2, 2.9)), body],
				[_box(Vector3(0.95, 0.95, 2.4)), Transform3D(Basis(), Vector3(s * 1.1, -0.6, -2.3)), body],
				[_box(Vector3(0.8, 0.8, 0.12)), Transform3D(Basis(), Vector3(s * 1.1, -0.6, -3.52)), dark],
				[T._cyl(0.6, 0.5, 1.2, 14), Transform3D(Z, Vector3(s * 1.05, -0.2, 7.6)), dark]])
			_fin(parts, [Vector2(0.4, 3.0), Vector2(3.7, 5.6), Vector2(3.7, 6.3), Vector2(0.4, 6.6)], Vector3(s * 1.25, 0.35, 0), -s * 0.15, body, mark)
		_pair(parts, [Vector2(0.6, -6.6), Vector2(2.2, -0.6), Vector2(0.6, -0.6)], 0.12, 0.15, body)
		_pair(parts, [Vector2(1.9, -0.6), Vector2(5.8, 3.4), Vector2(5.8, 4.3), Vector2(1.9, 4.6)], 0.14, 0.05, body)
		_pair(parts, [Vector2(1.9, 5.2), Vector2(4.3, 6.8), Vector2(4.3, 7.5), Vector2(1.9, 7.4)], 0.1, -0.1, body)
		nozzles = [Vector3(1.05, -0.2, 8.2), Vector3(-1.05, -0.2, 8.2)]
		rails = [Vector3(5.0, -0.25, 2.9), Vector3(-5.0, -0.25, 2.9), Vector3(3.6, -0.35, 2.2), Vector3(-3.6, -0.35, 2.2)]
		muzzle = Vector3(-1.5, 0.35, -2.8)
	var mi := MeshInstance3D.new()
	mi.name = "body"
	mi.mesh = _merge(parts)
	mi.material_override = _mat
	var root := Node3D.new()
	root.add_child(mi)
	for i in nozzles.size():
		var a := MeshInstance3D.new()
		a.name = "ab%d" % i
		a.mesh = T._cyl(0.0, 0.46, 3.0, 10)
		a.material_override = _flame
		a.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var holder := Node3D.new()
		holder.name = "ab%d" % i
		a.name = "flame"
		a.transform = Transform3D(Z, Vector3(0, 0, 1.5))
		holder.add_child(a)
		holder.position = nozzles[i]
		root.add_child(holder)
	for i in rails.size():
		var m := MeshInstance3D.new()
		m.name = "aam%d" % i
		m.mesh = T._cyl(0.07, 0.07, 2.9, 6)
		m.material_override = _white
		m.transform = Transform3D(Z, rails[i])
		root.add_child(m)
	root.set_meta("muzzle", muzzle)
	return root


static func _box(size: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = size
	return b


## A wing or tail plane each side: the right one's outline (x out from the middle, z back), at height y.
static func _pair(parts: Array, pts: Array, th: float, y: float, col: Color) -> void:
	parts.append([_plate(pts, th), Transform3D(Basis(), Vector3(0, y, 0)), col])
	var left := []
	for p in pts:
		left.append(Vector2(-p.x, p.y))
	parts.append([_plate(left, th), Transform3D(Basis(), Vector3(0, y, 0)), col])


## A fin standing up from at (its outline: x up, z back), leaning out by lean, its tip in the side's colour.
static func _fin(parts: Array, pts: Array, at: Vector3, lean: float, col: Color, mark: Color) -> void:
	var b := Basis(Vector3.BACK, PI / 2.0 + lean)
	parts.append([_plate(pts, 0.12), Transform3D(b, at), col])
	var top: float = pts[1].x
	var tip := [Vector2(top - 0.7, lerpf(pts[0].y, pts[1].y, (top - 0.7 - pts[0].x) / (pts[1].x - pts[0].x))), pts[1], pts[2],
		Vector2(top - 0.7, lerpf(pts[3].y, pts[2].y, (top - 0.7 - pts[3].x) / (pts[2].x - pts[3].x)))]
	parts.append([_plate(tip, 0.14), Transform3D(b, at), mark])


## A flat plate with this outline (x, z) and thickness: its top, its bottom and its edges, as mesh arrays.
static func _plate(pts: Array, th: float) -> Array:
	var poly := PackedVector2Array(pts)
	var tri := Geometry2D.triangulate_polygon(poly)
	var v := PackedVector3Array()
	var nm := PackedVector3Array()
	var idx := PackedInt32Array()
	var n := poly.size()
	for side in [1.0, -1.0]:
		var base := v.size()
		for p in poly:
			v.append(Vector3(p.x, th * 0.5 * side, p.y))
			nm.append(Vector3(0, side, 0))
		for i in range(0, tri.size(), 3):
			_tri(idx, v, base + tri[i], base + tri[i + 1], base + tri[i + 2], Vector3(0, side, 0))
	var c := Vector2.ZERO
	for p in poly:
		c += p / n
	for i in n:
		var a := poly[i]
		var b := poly[(i + 1) % n]
		var e := b - a
		var out := Vector2(e.y, -e.x).normalized()
		if out.dot((a + b) * 0.5 - c) < 0.0:
			out = -out
		var o := Vector3(out.x, 0, out.y)
		var base := v.size()
		for q in [Vector3(a.x, th * 0.5, a.y), Vector3(b.x, th * 0.5, b.y), Vector3(b.x, -th * 0.5, b.y), Vector3(a.x, -th * 0.5, a.y)]:
			v.append(q)
			nm.append(o)
		_tri(idx, v, base, base + 1, base + 2, o)
		_tri(idx, v, base, base + 2, base + 3, o)
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_NORMAL] = nm
	arr[Mesh.ARRAY_INDEX] = idx
	return arr


## A triangle facing the way of n (Godot's front faces wind clockwise).
static func _tri(idx: PackedInt32Array, v: PackedVector3Array, a: int, b: int, c: int, n: Vector3) -> void:
	if (v[b] - v[a]).cross(v[c] - v[a]).dot(n) > 0.0:
		idx.append_array([a, c, b])
	else:
		idx.append_array([a, b, c])


## Parts [mesh (or mesh arrays), transform, colour] as one mesh, coloured by vertex.
static func _merge(parts: Array) -> ArrayMesh:
	var v := PackedVector3Array()
	var nm := PackedVector3Array()
	var c := PackedColorArray()
	var idx := PackedInt32Array()
	for p in parts:
		var a: Array = p[0].get_mesh_arrays() if p[0] is PrimitiveMesh else p[0]
		var t: Transform3D = p[1]
		var nb := t.basis.inverse().transposed()
		var base := v.size()
		var pv: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
		var pn: PackedVector3Array = a[Mesh.ARRAY_NORMAL]
		for i in pv.size():
			v.append(t * pv[i])
			nm.append((nb * pn[i]).normalized())
			c.append(p[2])
		for i in (a[Mesh.ARRAY_INDEX] as PackedInt32Array):
			idx.append(base + i)
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_NORMAL] = nm
	arr[Mesh.ARRAY_COLOR] = c
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m
