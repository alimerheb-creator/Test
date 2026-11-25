extends Node3D
## A thrown or fired projectile: frag grenade (bounces, then goes off), 40mm grenade and RPG rocket (go off on
## impact), C-4 (sticks where it lands until detonated) and the support's supply crate (refills ammo nearby); a
## helicopter's rockets (hydra) and guided missiles (atgm: they fly to wherever their launcher's sight is); a jet's
## heat-seeking missiles (aam: they chase the jet they were locked on to, or a flare that pulls them off it, and go off
## as they pass close) and its flares.

const D := preload("res://scripts/data.gd")

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


## Gone (burnt out or burst): its smoke stays behind a while.
func _fade() -> void:
	aams.erase(self)
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
