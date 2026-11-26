extends Node3D
## A thrown or fired projectile: frag grenade (bounces, then goes off), 40mm grenade and RPG rocket (go off on
## impact), C-4 (sticks where it lands until detonated) and the support's supply crate (refills ammo nearby); a
## helicopter's rockets (hydra) and guided missiles (atgm: they fly to wherever their launcher's sight is); a jet's
## heat-seeking missiles (aam: they chase the jet they were locked on to, or a flare that pulls them off it, and go off
## as they pass close) and its flares; a bomber's bombs (they fall from its speed, losing it to the air as they go; a
## guided one steers onto an installation near where it would fall) and its cruise missiles (they fly to the installation they
## were locked on to). The airbases' C-RAM guns can shoot the bombs and missiles down.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")

var w: Node
var kind := "grenade"
var owner_soldier: Node
var vel := Vector3.ZERO
var p: Dictionary
var fuse := 0.0
var stuck := false
var life := 0.0
var label := ""
var ignore := RID()
var seek: Node = null
var target = null  # (a jet or a flare)
var dead := false
## The heat seekers in the air (a jet hears the warning when one is after it, and its flares can pull them off).
static var aams: Array = []
## What the C-RAM guns can shoot at: the heat seekers, bombs and cruise missiles in the air.
static var ordnance: Array = []
var team := -1
var blast: Array = []  # a bomb's or cruise missile's [radius, damage, what it does to a building]
var aim = null  # where a guided bomb steers to
var _trail: CPUParticles3D
var _gone := false
static var _smoke_mat: StandardMaterial3D


func launch(world: Node, k: String, from: Vector3, dir: Vector3, by: Node) -> void:
	w = world
	kind = k
	owner_soldier = by
	p = D.PROJECTILES[k]
	fuse = p.get("fuse", 99.0)
	vel = dir * float(p["speed"])
	if by and by.get("team") != null:
		team = by.team
	if kind in ["bomb", "cruise"]:
		blast = p.get("blast", [])
		_ordnance_looks()
		w.add_child(self)
		global_position = from
		return
	if kind == "aam" or kind == "flare":
		_air_looks()
		w.add_child(self)
		global_position = from
		return
	var mi := MeshInstance3D.new()
	if kind == "crate":
		var bm := BoxMesh.new()
		bm.size = Vector3(0.9, 0.5, 0.6)
		mi.mesh = bm
		mi.material_override = w.mat("container_green")
	else:
		var rk := kind in ["rocket", "hydra", "atgm"]
		var sm := SphereMesh.new()
		sm.radius = 0.06 if not rk else (0.08 if kind == "rocket" else 0.1)
		sm.height = sm.radius * (2.0 if not rk else 6.0 + (8.0 if kind == "atgm" else 0.0))
		mi.mesh = sm
		mi.material_override = w.mat("gunmetal") if kind != "shell" else w.glow_mat(Color(1, 0.75, 0.35), 4.0)
		if kind == "hydra" or kind == "atgm":
			# the motor burning at its tail
			var fl := MeshInstance3D.new()
			var fm := SphereMesh.new()
			fm.radius = 0.16
			fm.height = 0.7
			fl.mesh = fm
			fl.material_override = w.glow_mat(Color(1, 0.6, 0.25), 6.0)
			fl.rotation.x = PI / 2.0
			fl.position.z = sm.height * 0.5 + 0.3
			add_child(fl)
	add_child(mi)
	w.add_child(self)
	global_position = from


func _air_looks() -> void:
	var fl := MeshInstance3D.new()
	var fm := SphereMesh.new()
	fl.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if kind == "flare":
		fm.radius = 0.6
		fm.height = 1.2
		fl.mesh = fm
		fl.material_override = w.glow_mat(Color(1.0, 0.85, 0.55), 16.0)
		add_child(fl)
		_trail = trail(self, 1.6, 1.6, Color(0.92, 0.92, 0.9, 0.5))
		return
	var body := MeshInstance3D.new()
	var bm := CylinderMesh.new()
	bm.top_radius = 0.07
	bm.bottom_radius = 0.07
	bm.height = 2.9
	bm.radial_segments = 6
	bm.rings = 1
	body.mesh = bm
	body.rotation.x = PI / 2.0
	body.material_override = w.mat("metal")
	add_child(body)
	fm.radius = 0.3
	fm.height = 1.8
	fl.mesh = fm
	fl.material_override = w.glow_mat(Color(1.0, 0.65, 0.3), 10.0)
	fl.rotation.x = PI / 2.0
	fl.position.z = 2.2
	add_child(fl)
	_trail = trail(self, 2.4, 2.4, Color(0.88, 0.88, 0.86, 0.55))
	aams.append(self)
	ordnance.append(self)


## A bomb (a dark green body, its nose and four fins), or a cruise missile (a long grey body, its motor burning, a trail
## of smoke behind).
func _ordnance_looks() -> void:
	var body := MeshInstance3D.new()
	var bm := CylinderMesh.new()
	var cruise := kind == "cruise"
	bm.top_radius = 0.3 if cruise else 0.24
	bm.bottom_radius = bm.top_radius
	bm.height = 4.2 if cruise else 2.3
	bm.radial_segments = 8
	bm.rings = 1
	body.mesh = bm
	body.rotation.x = PI / 2.0
	body.material_override = w.mat("metal") if cruise else w.mat("olive")
	add_child(body)
	var nose := MeshInstance3D.new()
	var nm := SphereMesh.new()
	nm.radius = bm.top_radius
	nm.height = bm.top_radius * 3.0
	nm.radial_segments = 8
	nm.rings = 4
	nose.mesh = nm
	nose.position.z = -bm.height / 2.0
	nose.material_override = body.material_override
	add_child(nose)
	for i in 4:
		var f := MeshInstance3D.new()
		var fb := BoxMesh.new()
		fb.size = Vector3(0.03, 0.9 if cruise else 0.7, 0.5)
		f.mesh = fb
		f.material_override = body.material_override
		f.rotation.z = i * PI / 2.0 + (PI / 4.0 if cruise else 0.0)
		f.position.z = bm.height / 2.0 - 0.3
		add_child(f)
	for c in get_children():
		(c as GeometryInstance3D).cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if cruise:
		var fl := MeshInstance3D.new()
		var fm := SphereMesh.new()
		fm.radius = 0.35
		fm.height = 1.8
		fl.mesh = fm
		fl.material_override = w.glow_mat(Color(1.0, 0.65, 0.3), 10.0)
		fl.rotation.x = PI / 2.0
		fl.position.z = bm.height / 2.0 + 0.8
		add_child(fl)
		_trail = trail(self, 2.6, 2.8, Color(0.85, 0.85, 0.83, 0.55))
	ordnance.append(self)


## A trail of smoke puffs left behind in the world by whatever it's added to.
static func trail(to: Node3D, life: float, size: float, col: Color) -> CPUParticles3D:
	if not _smoke_mat:
		var tex := GradientTexture2D.new()
		tex.fill = GradientTexture2D.FILL_RADIAL
		tex.fill_from = Vector2(0.5, 0.5)
		tex.fill_to = Vector2(1.0, 0.5)
		var g := Gradient.new()
		g.set_color(0, Color.WHITE)
		g.set_color(1, Color(1, 1, 1, 0))
		tex.gradient = g
		_smoke_mat = StandardMaterial3D.new()
		_smoke_mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		_smoke_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_smoke_mat.vertex_color_use_as_albedo = true
		_smoke_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_smoke_mat.albedo_texture = tex
	var t := CPUParticles3D.new()
	t.amount = 120
	t.lifetime = life
	t.local_coords = false
	t.gravity = Vector3(0, 0.8, 0)
	t.direction = Vector3.UP
	t.spread = 180.0
	t.initial_velocity_min = 0.2
	t.initial_velocity_max = 1.5
	t.scale_amount_min = size
	t.scale_amount_max = size * 1.5
	var c := Curve.new()
	c.add_point(Vector2(0.0, 0.35))
	c.add_point(Vector2(1.0, 1.0))
	t.scale_amount_curve = c
	var ramp := Gradient.new()
	ramp.set_color(0, col)
	ramp.set_color(1, Color(col.r, col.g, col.b, 0.0))
	t.color_ramp = ramp
	var q := QuadMesh.new()
	q.material = _smoke_mat
	t.mesh = q
	t.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	to.add_child(t)
	return t


## A burst of fire in the air that swells and dies away, and a cloud of dark smoke where it was.
static func fireball(w: Node, at: Vector3, size: float) -> void:
	var b := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = 12
	sm.rings = 6
	b.mesh = sm
	b.material_override = w.glow_mat(Color(1.0, 0.55, 0.2), 7.0)
	b.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	w.add_child(b)
	b.global_position = at
	b.scale = Vector3.ONE * size * 0.3
	var tw := b.create_tween()
	tw.tween_property(b, "scale", Vector3.ONE * size, 0.15)
	tw.tween_property(b, "scale", Vector3.ONE * 0.05, 0.5)
	tw.tween_callback(b.queue_free)
	var s := Node3D.new()
	w.add_child(s)
	s.global_position = at
	var t := trail(s, 3.5, size * 0.8, Color(0.16, 0.15, 0.14, 0.7))
	t.one_shot = true
	t.amount = 24
	t.explosiveness = 0.9
	t.initial_velocity_min = size * 0.3
	t.initial_velocity_max = size * 0.9
	t.emitting = true
	w.get_tree().create_timer(4.0).timeout.connect(s.queue_free)


func _physics_process(dt: float) -> void:
	if _gone:
		return
	life += dt
	if kind == "aam":
		_aam(dt)
		return
	if kind == "bomb":
		_bomb(dt)
		return
	if kind == "cruise":
		_cruise(dt)
		return
	if kind == "flare":
		fuse -= dt
		vel = vel * (1.0 - 1.1 * dt) + Vector3.DOWN * float(p["gravity"]) * dt
		global_position += vel * dt
		if fuse <= 0.0:
			_fade()
		return
	if kind == "crate":
		_crate(dt)
	if stuck:
		return
	fuse -= dt
	if fuse <= 0.0:
		_boom()
		return
	if seek and is_instance_valid(seek) and not seek.dead:
		# turn toward the launcher's sight, at most so fast, speeding up to its top speed
		var d := vel.normalized()
		var to: Vector3 = (seek.aim - global_position).normalized()
		var ang := d.angle_to(to)
		if ang > 0.001:
			d = d.slerp(to, minf(1.0, 2.4 * dt / ang))
		vel = d * minf(vel.length() + 90.0 * dt, float(p["max"]))
	vel.y -= float(p["gravity"]) * dt
	var to := global_position + vel * dt
	var ex := [owner_soldier.get_rid()] if owner_soldier and life < 0.3 else []
	if ignore.is_valid():
		ex.append(ignore)
	var r := get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(global_position, to, 7, ex))
	if r.is_empty():
		global_position = to
		if vel.length() > 1.0 and kind in ["rocket", "hydra", "atgm"]:
			look_at(global_position + vel, Vector3.UP if absf(vel.normalized().y) < 0.98 else Vector3.RIGHT)
		return
	var n: Vector3 = r.normal
	global_position = r.position + n * 0.05
	if kind == "grenade" or kind == "crate":
		vel = vel.bounce(n) * float(p["bounce"])
		if vel.length() < 0.6 and n.y > 0.6:
			vel = Vector3.ZERO
			if kind == "crate":
				stuck = true
	elif kind == "c4":
		stuck = true
	else:
		_boom()


func _crate(dt: float) -> void:
	if life > 30.0:
		queue_free()
		return
	if int(life) != int(life - dt):
		for s in w.soldiers:
			if not s.dead and owner_soldier and s.team == owner_soldier.team and s.global_position.distance_to(global_position) < 5.0 and s.has_method("resupply"):
				s.resupply()


## A heat seeker: speeding up, it turns toward where its target will be (as fast as it can), goes off as it passes
## within reach of it (checked along the whole step, so it can't slip through), or into the ground, or at the end of
## its fuel; it loses a target that gets behind its seeker.
func _aam(dt: float) -> void:
	fuse -= dt
	if fuse <= 0.0:
		_air_boom()
		return
	var spd := minf(vel.length() + float(p["accel"]) * dt, float(p["max"]))
	var d := vel.normalized()
	if target and is_instance_valid(target) and not target.dead:
		var tp: Vector3 = target.global_position
		var tv: Vector3 = target.velocity if target.get("velocity") != null else target.vel
		var rel := tp - global_position
		var dist := rel.length()
		var step := (vel - tv) * dt
		var u := clampf(rel.dot(step) / maxf(step.length_squared(), 0.001), 0.0, 1.0)
		if (rel - step * u).length() < float(p["radius"]) * 0.75:
			global_position += vel * dt * u
			_air_boom()
			return
		if d.angle_to(rel / dist) > 1.45:
			target = null
		else:
			var closing := maxf(spd - tv.dot(rel / dist), 120.0)
			var to := (tp + tv * minf(dist / closing, 5.0) - global_position).normalized()
			var ang := d.angle_to(to)
			if ang > 0.0001:
				d = d.slerp(to, minf(1.0, float(p["turn"]) * dt / ang))
	vel = d * spd
	var nxt := global_position + vel * dt
	var r := get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(global_position, nxt, 1))
	if not r.is_empty():
		global_position = r.position
		_air_boom()
		return
	global_position = nxt
	look_at(global_position + vel, Vector3.UP if absf(d.y) < 0.98 else Vector3.RIGHT)


## The heat seeker goes off: the jets in reach are hit (hard close in).
func _air_boom() -> void:
	fireball(w, global_position, 7.0)
	w.sound3d("boom", global_position, 6.0)
	var r: float = p["radius"]
	for v in w.vehicles:
		if v.dead or not v.get("jet"):
			continue
		var dd: float = v.global_position.distance_to(global_position)
		if dd < r:
			v.hurt(float(p["dmg"]) * (1.0 if dd < r * 0.55 else 0.7), owner_soldier, label)
	_fade()


## Where a bomb let go at `from` with velocity v would land (it falls ever faster, and loses its speed over the ground
## to the air: the same sums as its fall).
static func drop_point(from: Vector3, v: Vector3) -> Vector3:
	var g: float = D.PROJECTILES["bomb"]["gravity"]
	var k: float = D.PROJECTILES["bomb"]["drag"]
	var h := T.height(from.x, from.z)
	var p := from
	for i in 3:
		var t := (v.y + sqrt(maxf(0.0, v.y * v.y + 2.0 * g * maxf(from.y - h, 0.0)))) / g
		var f := (1.0 - exp(-k * t)) / k
		p = Vector3(from.x + v.x * f, 0.0, from.z + v.z * f)
		h = T.height(p.x, p.z)
	return Vector3(p.x, h, p.z)


## A bomb falling: a guided one steers its fall onto where it was sent; it goes off on whatever it hits.
func _bomb(dt: float) -> void:
	fuse -= dt
	var e := exp(-float(p["drag"]) * dt)
	vel.x *= e
	vel.z *= e
	vel.y -= float(p["gravity"]) * dt
	if aim != null and life > 0.4:
		var land := drop_point(global_position, vel)
		var g: float = p["gravity"]
		var t := maxf(0.6, (vel.y + sqrt(maxf(0.0, vel.y * vel.y + 2.0 * g * maxf(global_position.y - land.y, 0.0)))) / g)
		var fix := Vector2(aim.x - land.x, aim.z - land.z) / t
		fix = fix.limit_length(25.0 * dt)
		vel.x += fix.x
		vel.z += fix.y
	_fly_into(dt)


## A cruise missile: speeding up, it turns toward the installation it was locked on to (harder close in) and goes off
## on it; without one (or with it gone) it flies on till its fuel runs out.
func _cruise(dt: float) -> void:
	fuse -= dt
	if fuse <= 0.0:
		_ground_boom()
		return
	var spd := minf(vel.length() + float(p["accel"]) * dt, float(p["max"]))
	var d := vel.normalized()
	if target and is_instance_valid(target) and not target.dead:
		var tp: Vector3 = target.global_position + Vector3(0, float(target.top) * 0.5, 0)
		var rel := tp - global_position
		var dist := rel.length()
		if dist < 6.0:
			_ground_boom()
			return
		var to := rel / dist
		var ang := d.angle_to(to)
		if ang > 0.0001:
			d = d.slerp(to, minf(1.0, float(p["turn"]) * (1.0 + 400.0 / maxf(dist, 100.0)) * dt / ang))
	vel = d * spd
	_fly_into(dt)


## Moves it on, going off on the ground or a building in its way (or on running out of time).
func _fly_into(dt: float) -> void:
	var nxt := global_position + vel * dt
	var r := get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(global_position, nxt, 1))
	if not r.is_empty():
		global_position = r.position
		_ground_boom()
		return
	if nxt.y < T.height(nxt.x, nxt.z) or fuse <= 0.0:
		global_position = Vector3(nxt.x, maxf(nxt.y, T.height(nxt.x, nxt.z)), nxt.z)
		_ground_boom()
		return
	global_position = nxt
	if vel.length() > 1.0:
		look_at(global_position + vel, Vector3.UP if absf(vel.normalized().y) < 0.98 else Vector3.RIGHT)


## A bomb or cruise missile goes off: a fireball, the blast for anyone near and for the installations in reach.
func _ground_boom() -> void:
	if _gone:
		return
	var at := global_position
	var r: float = blast[0]
	fireball(w, at + Vector3(0, 2.0, 0), r * 0.9)
	fireball(w, at + Vector3(randf_range(-3, 3), 5.0, randf_range(-3, 3)), r * 0.6)
	w.sound3d("boom", at, 12.0, 3000.0)
	w.explode(at, r, float(blast[1]), owner_soldier, label)
	if w.ground:
		w.ground.blast(at, r, float(blast[2]), owner_soldier, label)
	_fade()


## Shot down in the air by a C-RAM: it bursts where it is.
func intercept() -> void:
	if _gone:
		return
	fireball(w, global_position, 4.0 if kind != "bomb" else 6.0)
	w.sound3d("boom", global_position, 4.0, 2000.0)
	_fade()


## Gone (burnt out or burst): its smoke stays behind a while.
func _fade() -> void:
	aams.erase(self)
	ordnance.erase(self)
	_gone = true
	dead = true
	for c in get_children():
		if c != _trail:
			c.queue_free()
	if _trail:
		_trail.emitting = false
		get_tree().create_timer(_trail.lifetime).timeout.connect(queue_free)
	else:
		queue_free()


func detonate() -> void:
	_boom()


func _boom() -> void:
	if not is_inside_tree():
		return
	w.explode(global_position, float(p["radius"]), float(p["dmg"]), owner_soldier, label if label != "" else {"grenade": "FRAG GRENADE", "ugl": "40MM LAUNCHER", "rocket": "RPG-7V", "c4": "C-4"}.get(kind, "EXPLOSION"))
	queue_free()
