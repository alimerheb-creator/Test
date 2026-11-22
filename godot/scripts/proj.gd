extends Node3D
## A thrown or fired projectile: frag grenade (bounces, then goes off), 40mm grenade and RPG rocket (go off on
## impact), C-4 (sticks where it lands until detonated) and the support's supply crate (refills ammo nearby); a
## helicopter's rockets (hydra) and guided missiles (atgm: they fly to wherever their launcher's sight is).

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


func launch(world: Node, k: String, from: Vector3, dir: Vector3, by: Node) -> void:
	w = world
	kind = k
	owner_soldier = by
	p = D.PROJECTILES[k]
	fuse = p.get("fuse", 99.0)
	vel = dir * float(p["speed"])
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


func _physics_process(dt: float) -> void:
	life += dt
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


func detonate() -> void:
	_boom()


func _boom() -> void:
	if not is_inside_tree():
		return
	w.explode(global_position, float(p["radius"]), float(p["dmg"]), owner_soldier, label if label != "" else {"grenade": "FRAG GRENADE", "ugl": "40MM LAUNCHER", "rocket": "RPG-7V", "c4": "C-4"}.get(kind, "EXPLOSION"))
	queue_free()
