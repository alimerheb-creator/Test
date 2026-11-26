extends CharacterBody3D
## A fighter jet (Aviation), after the web game's Jets mod: Vanguard's F-16C Viper and Onyx's Su-35S Flanker-E, the
## web game's real 3D models (their control surfaces move with the stick). You fly it where you look: the mouse (or a drag on a phone) swings your view round and the
## jet banks and pulls to follow it (the circle is where you're steering, the small cross where its nose and gun
## point). W/S or Shift/Ctrl (THR + and THR - on a phone, or the left stick) set the throttle, and full throttle lights
## the afterburner; A/D roll. Left mouse (GUN) fires the cannon; right mouse (MISSILE) a heat seeker, which chases a
## jet you've held near the nose till it locked on (the box turns red and the tone goes steady), or flies straight
## without a lock. Space (FLARES) throws flares, which can pull a missile off you. The gun's rounds, the missiles and
## the flares come back slowly. Bots fly the rest: they pick a fight, chase, shoot and lock on, throw flares and break
## hard when a missile comes, and keep clear of the ground and inside the map. A jet shot down (or flown into the
## ground) comes back high over its own airbase a few seconds later, and costs its side a ticket (half one in a Ground
## Strike).
## The bombers (Ground Strike) fly the same way, heavier: Vanguard's B-1B Lancer and Onyx's Tu-160 Blackjack, their
## wings sweeping back as they speed up. Left mouse (BOMBS) lets bombs go from the bay (its doors open), held for a
## stick: they land on the circle on the ground ahead (steering onto an installation near it); right mouse
## (MISSILE) sends a cruise missile at the enemy installation the seeker has locked on to near the nose. Bomb by bomb
## and missile by missile the bay fills up again. Their bots run in over the enemy's airbase at bombing height (cruise
## missiles first, from a couple of kilometres off) and let a stick go when it would fall on their target.

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
var _cs: Array = []  # each control surface: [its hinge, how it rests, kind, side, which way is down, how far it's turned]
var _skins: Array = []
var _burn := 0.0
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
var bomber := false
var striker := false  # (a fighter bot that goes for the enemy's C-RAM guns when there's nobody to fight near it)
var _swing: Array = []  # the swing wings: [node, side, how far back]
var _doors: Array = []  # the bomb bay doors: [node, side]
var _stabs: Array = []
var _bcs: Array = []  # a bomber's flaps, ailerons and rudder: [node, the stick they follow, how far]
var _bay: Array = []
var _cruise_at: Array = []
var _bay_i := 0
var _door := 0.0
var _door_t := 0.0
var _drop_cd := 0.0
var _drop_t := 0.0
var _stick_n := 0
var _run = null  # a bot bomber's (or striker's) target: an enemy installation
var _egress := 0.0
var _cam_d := 24.0
var _cam_h := 5.0
static var _scenes := {}
static var _wreck: StandardMaterial3D
static var _fire := {}  # the afterburner's materials (plume, core, glow) and its meshes for each nozzle size
## The afterburner's plume and its core: see-through light added onto what's behind it, white-hot at the nozzle,
## turning orange and fading out toward the tail, faint toward its edges, flickering; the core with shock diamonds.
const FIRE := """shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;
uniform vec3 hot : source_color = vec3(1.0, 0.8, 0.55);
uniform vec3 cool : source_color = vec3(1.0, 0.35, 0.08);
uniform float bright = 2.4;
uniform float diamonds = 0.0;
uniform float half_h = 3.0;
instance uniform float power = 1.0;
varying float t;
void vertex() {
	t = clamp((VERTEX.y + half_h) / (2.0 * half_h), 0.0, 1.0);
}
void fragment() {
	float edge = smoothstep(0.0, 0.55, abs(dot(normalize(NORMAL), normalize(VIEW))));
	float fl = 0.86 + 0.14 * sin(TIME * 53.0 + t * 17.0) * sin(TIME * 29.0 + 1.3);
	float d = diamonds * pow(max(0.0, cos(t * 21.99)), 10.0) * (1.0 - t);
	vec3 c = mix(hot, cool, smoothstep(0.0, 0.75, t));
	ALBEDO = c * bright * power * (pow(1.0 - t, 1.7) * fl + d) * edge;
}
"""
## The glow in the nozzle, seen from behind.
const GLOW := """shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;
uniform vec3 col : source_color = vec3(1.0, 0.72, 0.42);
instance uniform float power = 1.0;
void fragment() {
	float a = pow(clamp(1.0 - length(UV - vec2(0.5)) * 2.0, 0.0, 1.0), 1.6);
	ALBEDO = col * a * 2.2 * (0.35 + 0.65 * power);
}
"""


func setup(world: Node, t: int, spec: Dictionary, who: String) -> void:
	w = world
	team = t
	S = spec
	tag = who
	diff = D.DIFFICULTY[w.difficulty]
	_skill = 0.55 + 0.07 * float(diff["turn"])
	bomber = S.get("bomber", false)
	collision_layer = 0
	collision_mask = 0
	model = build_model(S, team)
	add_child(model)
	for n in model.get_children():
		var nm := String(n.name)
		if nm.begins_with("ab"):
			_abs.append(n)
		elif nm.begins_with("aam"):
			_stores.append(n)
		elif nm.begins_with("cs_"):
			_cs.append([n, (n as Node3D).basis, n.get_meta("kind"), n.get_meta("side"), float(n.get_meta("sgn")), 0.0])
		elif nm.begins_with("swing"):
			_swing.append([n, float(n.get_meta("side")), float(n.get_meta("max"))])
		elif nm.begins_with("door"):
			_doors.append([n, float(n.get_meta("side"))])
		elif nm.begins_with("stab"):
			_stabs.append(n)
		elif nm.begins_with("cs"):
			_bcs.append([n, String(n.get_meta("ch")), float(n.get_meta("k"))])
	for m in model.find_children("*", "MeshInstance3D", true, false):
		if not String(m.name) in ["plume", "core", "glow"]:
			_skins.append(m)
	_muzzle = model.get_meta("muzzle", Vector3.ZERO)
	_bay = model.get_meta("bombs", [])
	_cruise_at = model.get_meta("cruise", [])
	if bomber:
		var cm: Array = model.get_meta("cam")
		_cam_d = float(cm[0]) * 0.8
		_cam_h = float(cm[1]) * 0.6
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
	ammo = [int(S["bombs"]), int(S["cruises"])] if bomber else [int(S["gun_ammo"]), int(S["aams"])]
	flares = int(S["flares"])
	_run = null
	_egress = 0.0
	_stick_n = 0
	_door = 0.0
	_door_t = 0.0
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


## All of it one material (burnt out), or (null) each part its own again.
func _paint(m: Material) -> void:
	for s in _skins:
		(s as MeshInstance3D).material_override = m


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
	_drop_cd -= dt
	_door_t -= dt
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
	if bomber:
		if _trig:
			_drop()
		if _shoot:
			_launch_cruise()
	else:
		if _trig:
			_gun()
		elif _gun_sound.playing:
			_gun_sound.stop()
		if _shoot:
			_missile()
	for m in Proj.aams:
		if is_instance_valid(m) and m.target == self:
			warn = 0.3
	# the afterburner lights (and goes out) over a moment; without it, only the glow in the nozzle and a faint heat
	_burn = move_toward(_burn, 1.0 if throttle > 0.98 else 0.0, 2.5 * dt)
	var k := lerpf(0.12 * throttle, 1.0, _burn)
	for a in _abs:
		a.visible = throttle > 0.3
		a.scale = Vector3(1.0, 1.0, lerpf(0.4, 1.0, _burn) * randf_range(0.95, 1.05))
		for f in a.get_children():
			(f as GeometryInstance3D).set_instance_shader_parameter("power", k)
	_surfaces(dt)
	_sound.pitch_scale = (0.6 if bomber else 0.75) + speed / float(S["ab"]) * 0.5
	if me:
		var ahead := global_position + velocity * 3.0
		danger = 1.0 if velocity.y < -8.0 and ahead.y < T.height(ahead.x, ahead.z) + 40.0 else 0.0
		_cues()
		_camera(dt)


## The gun's rounds come back a while after it stops firing; a missile every 20 s, a flare salvo every 4 s. A bomber's
## bay fills again a bomb every 8 s from 10 s after the last went, and a cruise missile every 30 s.
func _resupply(dt: float) -> void:
	if bomber:
		_drop_t += dt
		if _drop_t > 10.0 and ammo[0] < int(S["bombs"]):
			_rounds += dt / 8.0
			if _rounds >= 1.0:
				_rounds -= 1.0
				ammo[0] += 1
		_aam_t += dt
		if ammo[1] >= int(S["cruises"]):
			_aam_t = 0.0
		elif _aam_t > 30.0:
			_aam_t = 0.0
			ammo[1] += 1
		_flare_t += dt
		if flares >= int(S["flares"]):
			_flare_t = 0.0
		elif _flare_t > 4.0:
			_flare_t = 0.0
			flares += 1
		return
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
	var pos := global_position - d * (_cam_d + speed * 0.012) + Vector3.UP * _cam_h
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
	# (a bomber's: the enemy's installations)
	for v in (w.ground.enemy_sites(team) if bomber and w.ground else w.vehicles):
		if v.dead or v.team == team or not (bomber or v.get("jet")):
			continue
		var rel: Vector3 = v.global_position - global_position
		var d := rel.length()
		if d > float(L[0]) or d < (300.0 if bomber else 120.0):
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
		# (a bomber's big airframe soaks up shells better)
		hit.hurt(float(S["gun_dmg"]) * (1.0 if me else float(diff["dmg"])) * (0.6 if hit.bomber else 1.0), pilot(), S["gun"])
		if _gun_n % 3 == 0:
			w.flash(end, 1.6)
	elif not r.is_empty():
		# (an installation at an airbase: its shells wear it down)
		var c: Object = r.collider
		if c and c.has_method("hit"):
			c.hit(float(S["gun_dmg"]) * float(c.K["gun"]) * (1.0 if me else float(diff["dmg"])), pilot(), S["gun"])
		if _gun_n % 4 == 0:
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


## A bomb from the bay (the next of its places in turn), falling from the bomber's speed; a guided one is sent onto the
## enemy installation nearest where it would fall, if there's one that close.
func _drop() -> void:
	if _drop_cd > 0.0 or ammo[0] <= 0:
		return
	_drop_cd = 0.25
	_drop_t = 0.0
	_door_t = maxf(_door_t, 2.0)
	ammo[0] -= 1
	var at: Vector3 = global_transform * (_bay[_bay_i % _bay.size()] if not _bay.is_empty() else Vector3(0, -1.5, 0))
	_bay_i += 1
	var pr := Proj.new()
	pr.label = S["bomb"]
	pr.launch(w, "bomb", at, Vector3.ZERO, pilot())
	pr.vel = velocity + Vector3.DOWN * 4.0
	pr.blast = S["blast"]
	if float(S["guided"]) > 0.0 and w.ground:
		var land := Proj.drop_point(at, pr.vel)
		var bd := float(S["guided"])
		for st in w.ground.enemy_sites(team):
			var d := Vector2(st.global_position.x - land.x, st.global_position.z - land.z).length()
			if d < bd:
				bd = d
				pr.aim = st.global_position
	if driver == w.player:
		w.sound("empty", -4.0)


## Where the next bomb would land (the circle on the ground you aim with).
func impact() -> Vector3:
	var at: Vector3 = global_transform * (_bay[_bay_i % _bay.size()] if not _bay.is_empty() else Vector3(0, -1.5, 0))
	return Proj.drop_point(at, velocity + Vector3.DOWN * 4.0)


## A cruise missile out of the bay at the installation the seeker has locked on to (or straight on without a lock).
func _launch_cruise() -> void:
	if _mcd > 0.0 or ammo[1] <= 0:
		return
	_mcd = 1.5 if driver == w.player else randf_range(3.0, 5.0)
	ammo[1] -= 1
	_door_t = maxf(_door_t, 1.5)
	var at: Vector3 = global_transform * (_cruise_at[ammo[1] % _cruise_at.size()] if not _cruise_at.is_empty() else Vector3(0, -1.6, 0))
	var pr := Proj.new()
	pr.label = S["cruise"]
	pr.target = lock
	pr.launch(w, "cruise", at, Vector3.ZERO, pilot())
	pr.vel = velocity + Vector3.DOWN * 6.0
	w.sound3d("missile", at, 4.0)


## Three flares fall away behind (a bomber lays a fan of six); each missile after this one may go for one instead.
func _flare() -> void:
	if flares <= 0 or _fcd > 0.0:
		return
	flares -= 1
	_fcd = 0.8
	var made := []
	for i in (6 if bomber else 3):
		var f := Proj.new()
		f.launch(w, "flare", global_position + global_basis.z * (12.0 if bomber else 5.0), Vector3.ZERO, pilot())
		f.vel = velocity * 0.55 + global_basis.x * randf_range(-30.0, 30.0) * (2.0 if bomber else 1.0) + Vector3.DOWN * randf_range(10.0, 25.0)
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
	if bomber:
		_fly_bomber_bot(dt)
		return
	var pos := global_position
	var fwd := -global_basis.z
	_think -= dt
	if _think <= 0.0:
		_think = randf_range(0.7, 1.3)
		_target = _pick_target()
		_err = Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * float(diff["aim"]) * 0.15
		_goal = Vector3(randf_range(-700.0, 700.0), 0.0, randf_range(-700.0, 700.0))
		# a striker with nobody to fight near it goes for the enemy's C-RAM guns (or what's left standing)
		if striker and w.ground and (_target == null or pos.distance_to(_target.global_position) > 2500.0):
			if _run == null or not is_instance_valid(_run) or _run.dead:
				_run = _pick_site(true)
		else:
			_run = null
	var want := fwd
	var thr := 0.85
	_agile = _skill
	var low := false
	var m = _incoming()
	_egress -= dt
	if m:
		_break(m, dt)
		want = look
		thr = 1.0
	elif _run and is_instance_valid(_run) and not _run.dead:
		# a strafing run: in low toward it, the gun on it from a kilometre, and away before it's too close
		var tp: Vector3 = _run.global_position + Vector3(0, 2.0, 0)
		var rel := tp - pos
		var dist := rel.length()
		low = true
		if _egress > 0.0:
			want = Vector3(fwd.x, 0.0, fwd.z).normalized() + Vector3.UP * 0.5
		elif dist > 1400.0:
			want = (Vector3(tp.x, tp.y + 260.0, tp.z) - pos).normalized()
		else:
			want = (rel / dist + _err * 0.3).normalized()
			_trig = dist < 1000.0 and fwd.angle_to(rel / dist) < 0.04 + float(diff["aim"]) * 0.2
			if dist < 320.0 or pos.y - T.height(pos.x, pos.z) < 90.0:
				_egress = 4.0
		thr = 0.7
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
	want = _safe(want, low)
	throttle = move_toward(throttle, thr, dt * 0.6)
	_ctl = _steer(want)
	look = want


## A missile coming: flares, and a hard turn across its path (and down a little): where it looks to go (look).
func _break(m: Node, dt: float) -> void:
	var pos := global_position
	var fwd := -global_basis.z
	if pos.distance_to(m.global_position) < 1300.0 and randf() < (0.5 + 0.8 * _skill) * dt:
		_flare()
	var side: Vector3 = (pos - m.global_position).cross(Vector3.UP)
	side = side.normalized() if side.length() > 0.1 else global_basis.x
	if side.dot(fwd) < 0.0:
		side = -side
	look = (side + Vector3.DOWN * 0.2).normalized()


## A bot's target installation at the enemy's airbase: a striker's, the C-RAM guns first; a bomber's, the big ones
## (hangars, the bunker, the fuel depot) first; the nearer the likelier, with some chance in it.
func _pick_site(guns: bool):
	var best = null
	var bs := -INF
	for st in w.ground.enemy_sites(team):
		var big: bool = st.kind in ["hangar", "command", "fuel"]
		var sc := (25.0 if guns and st.kind == "cram" else 0.0) + (30.0 if not guns and big else 0.0) \
			- Vector2(st.global_position.x - global_position.x, st.global_position.z - global_position.z).length() / 40.0 + randf_range(0.0, 25.0)
		if sc > bs:
			bs = sc
			best = st
	return best


## A bot bomber. A missile coming: flares and a hard turn. Else its target (an installation at the enemy's airbase):
## from far off it heads for it at bombing height, sends its cruise missiles once the seeker has locked on to it, and
## lets its stick of bombs go when they'd land on it (the bay doors open as it runs in); then it turns for home and
## climbs till its bay has filled again, and goes for the next one.
func _fly_bomber_bot(dt: float) -> void:
	var pos := global_position
	var fwd := -global_basis.z
	_think -= dt
	if _think <= 0.0:
		_think = randf_range(0.8, 1.4)
		if _run == null or not is_instance_valid(_run) or _run.dead:
			_run = _pick_site(false) if w.ground else null
			_stick_n = 0
	var want := fwd
	var thr := 0.85
	_agile = _skill
	_egress -= dt
	var m = _incoming()
	if m:
		_break(m, dt)
		want = look
		thr = 1.0
	elif _run == null or _egress > 0.0 or (ammo[0] < int(S["stick"]) and _stick_n == 0):
		# home: back over its own airbase and up, till it can go again
		var b: Array = D.BASES[team]
		var home := Vector3(b[0], maxf(900.0, T.height(b[0], b[1]) + 650.0), b[1])
		if Vector2(home.x - pos.x, home.z - pos.z).length() < 600.0:
			home = Vector3(pos.x + fwd.z * 800.0, home.y, pos.z - fwd.x * 800.0)
		want = (home - pos).normalized()
	else:
		var tp: Vector3 = _run.global_position
		var flat := Vector2(tp.x - pos.x, tp.z - pos.z)
		var dist := flat.length()
		var alt := T.height(tp.x, tp.z) + 380.0
		var dir := flat / maxf(dist, 1.0)
		want = Vector3(dir.x, clampf((alt - pos.y) / maxf(dist * 0.35, 300.0), -0.35, 0.35), dir.y).normalized()
		thr = 0.62 if speed > 200.0 else 0.85
		_shoot = lock == _run and ammo[1] > 0 and dist > 900.0
		if dist < 3500.0:
			_door_t = 0.5
		# the bombs: once the place they'd land comes up to it (a little short, so the stick straddles it)
		var hit := impact()
		var past := Vector2(hit.x - tp.x, hit.z - tp.z).dot(dir)
		var aside := absf(Vector2(hit.x - tp.x, hit.z - tp.z).dot(Vector2(-dir.y, dir.x)))
		if _stick_n > 0 or (dist < 2500.0 and past > -20.0 and past < 60.0 and aside < 25.0 + float(_run.radius)):
			if _stick_n == 0:
				_stick_n = mini(int(S["stick"]), ammo[0])
			if _drop_cd <= 0.0 and ammo[0] > 0:
				_trig = true
				_stick_n -= 1
				if _stick_n <= 0:
					_egress = randf_range(7.0, 11.0)
					_run = null
		elif past > 60.0 and dist < 400.0:
			# passed it without a solution: round again
			_egress = 5.0
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
		var s := d * (1.7 - fwd.dot(rel / maxf(d, 1.0)) * 0.7) * (0.75 if v == _target else 1.0) * (0.75 if v.bomber else 1.0) * randf_range(0.85, 1.15)
		if s < bs:
			bs = s
			best = v
	return best


## Keeps a bot off the ground (looking a few seconds ahead) and inside the map; on a strafing run (low) it lets it
## down closer.
func _safe(want: Vector3, low := false) -> Vector3:
	var pos := global_position
	var dz := 0.0
	var gap := 45.0 if low else 130.0
	for t in ([0.8, 1.6] if low else [1.0, 2.5, 4.0]):
		var p: Vector3 = pos + velocity * t
		dz = maxf(dz, (T.height(p.x, p.z) + gap - p.y) / gap)
	var floor_h := 60.0 if low else 160.0
	dz = maxf(dz, (floor_h - (pos.y - T.height(pos.x, pos.z))) / floor_h)
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
	_wreck_t = float(S.get("respawn", D.AIR["respawn"]))
	_spin = randf_range(-2.5, 2.5)
	seek = null
	lock = null
	_gun_sound.stop()
	if _tone:
		_tone.stop()
	var cq = w.conquest
	cq.on_kill(pilot(), by, what, false)
	cq.tickets[team] = maxf(0.0, cq.tickets[team] - (0.5 if D.air_mode == "strike" else 1.0))
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


## The control surfaces follow the stick: the ailerons (and a little of the tailplanes) roll it, the tailplanes pitch
## it, the rudders yaw it, and the leading-edge flaps droop as it pulls.
func _surfaces(dt: float) -> void:
	if bomber:
		# the swing wings: spread out for slow flight, swept back at speed; the bay doors open while it bombs; the
		# all-moving tailplanes pitch it; the flaps droop when it's slow
		var k := smoothstep(float(S["stall"]) * 1.4, float(S["top"]) * 0.9, speed)
		for sw in _swing:
			var n: Node3D = sw[0]
			n.rotation.y += (-float(sw[1]) * float(sw[2]) * k - n.rotation.y) * minf(1.0, dt * 0.8)
		_door = move_toward(_door, 1.0 if _door_t > 0.0 and ammo[0] + ammo[1] > 0 else 0.0, dt * 1.2)
		for d in _doors:
			(d[0] as Node3D).rotation.z = float(d[1]) * 1.35 * _door
		for st in _stabs:
			(st as Node3D).rotation.x = -_ctl.x * 0.35
		var flap := clampf((float(S["corner"]) - speed) / (float(S["corner"]) - float(S["stall"])), 0.0, 1.0)
		for c in _bcs:
			var v: float = {"roll": _ctl.y, "pitch": _ctl.x, "yaw": _ctl.z}.get(c[1], flap)
			(c[0] as Node3D).rotation.x = float(c[2]) * clampf(v, -1.0, 1.0)
		return
	for c in _cs:
		var side := -1.0 if c[3] == "R" else 1.0
		var want := 0.0
		match String(c[2]):
			"ail":
				want = _ctl.y * 0.4 * side
			"stab":
				want = -_ctl.x * 0.3 + _ctl.y * 0.12 * side
			"rud":
				want = _ctl.z * 0.45
			_:
				want = clampf(_ctl.x, 0.0, 1.0) * 0.35
		c[5] = move_toward(float(c[5]), want, 2.5 * dt)
		(c[0] as Node3D).basis = (c[1] as Basis) * Basis(Vector3.RIGHT, float(c[4]) * float(c[5]))


# ---------------------------------------------------------------- the model

## The jet's model: the web game's (Vanguard's F-16C, Onyx's Su-35S), made into a scene by tools/build_jets.gd: the
## hull with its pilot (body; far, a lighter one for far off), the control surfaces on their hinges (cs_*), the landing
## gear (gear, hidden), the missiles (aam*), and the afterburner flames, put in its nozzles here (ab*). Its meta
## "muzzle": where the gun fires from; "gear_h": how high it stands on its wheels. Also parked at the airbases.
static func build_model(spec: Dictionary, _t: int) -> Node3D:
	if _fire.is_empty():
		var sh := Shader.new()
		sh.code = FIRE
		var plume := ShaderMaterial.new()
		plume.shader = sh
		var core := ShaderMaterial.new()
		core.shader = sh
		for kv in [["hot", Color(0.9, 0.92, 1.0)], ["cool", Color(1.0, 0.66, 0.32)], ["bright", 3.4], ["diamonds", 2.6], ["half_h", 1.4]]:
			core.set_shader_parameter(kv[0], kv[1])
		var gs := Shader.new()
		gs.code = GLOW
		var glow := ShaderMaterial.new()
		glow.shader = gs
		_fire = {"plume": plume, "core": core, "glow": glow}
	var kind: String = spec["kind"]
	if not _scenes.has(kind):
		_scenes[kind] = load("res://models/%s.scn" % kind)
	var root: Node3D = (_scenes[kind] as PackedScene).instantiate()
	# (on layer 2 too, for the light thrown up off the land)
	for m in root.find_children("*", "MeshInstance3D", true, false):
		(m as MeshInstance3D).layers = 3
	var noz: Array = root.get_meta("nozzles")
	for i in noz.size():
		var n: Array = noz[i]
		var holder := Node3D.new()
		holder.name = "ab%d" % i
		holder.position = Vector3(n[0], n[1], n[2])
		var r := float(n[3])
		if not _fire.has(r):
			# (each a cone along z without its ends: the plume 6 m long, the core 2.8 m, the glow a disc facing aft)
			var pm := CylinderMesh.new()
			pm.top_radius = r * 0.45
			pm.bottom_radius = r * 0.95
			pm.height = 6.0
			pm.radial_segments = 12
			pm.rings = 6
			pm.cap_top = false
			pm.cap_bottom = false
			pm.material = _fire["plume"]
			var cm := CylinderMesh.new()
			cm.top_radius = r * 0.12
			cm.bottom_radius = r * 0.75
			cm.height = 2.8
			cm.radial_segments = 12
			cm.rings = 8
			cm.cap_top = false
			cm.cap_bottom = false
			cm.material = _fire["core"]
			var gm := QuadMesh.new()
			gm.size = Vector2(r * 2.6, r * 2.6)
			gm.material = _fire["glow"]
			_fire[r] = [pm, cm, gm]
		var along := Basis(Vector3.RIGHT, PI / 2.0)
		for part in [["plume", 0, Transform3D(along, Vector3(0, 0, 3.0))], ["core", 1, Transform3D(along, Vector3(0, 0, 1.4))],
				["glow", 2, Transform3D(Basis(), Vector3(0, 0, 0.05))]]:
			var f := MeshInstance3D.new()
			f.name = part[0]
			f.mesh = _fire[r][part[1]]
			f.transform = part[2]
			f.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			holder.add_child(f)
		root.add_child(holder)
	return root
