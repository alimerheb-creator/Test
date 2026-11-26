extends StaticBody3D
## An installation at an airbase (Aviation), after the web game's: a radar site (its dish turning), a fuel depot, an
## aircraft hangar, a command bunker, or a C-RAM site. Bombs, cruise missiles and the jets' cannon shells wear it down
## (the guns hurt the gun sites most and the bunker least); knocked out, it is left a burnt-out wreck that burns a
## while (a fuel depot goes up in a fireball). In a Ground Strike that costs its side its share of the tickets; outside
## one a C-RAM site is back a minute and a half later.
## The C-RAM: a radar-guided 20 mm six-barrel gatling on a trailer that nobody aims. It swings onto the most urgent
## threat by itself (bombs and missiles coming at the base, the soonest first; else an enemy aircraft flying under 700 m
## near it, which its radar only finds close in down in the ground clutter, taking a moment to lock on), leads it, and
## fires 4,500 rounds a minute in a stream of glowing tracers (the rounds that miss burst in the air): 1,550 rounds,
## then 14 s to reload. What's in the stream may be shot down; an aircraft in it takes hits, more close in and flying
## at it, fewer crossing fast or down low.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")
const Proj := preload("res://scripts/proj.gd")

## Each kind: its name, health, its share of its side's tickets in a Ground Strike, the points for knocking it out, its
## reach (radius, height: what blasts measure from) and how much a cannon's shells hurt it.
const KINDS := {
	"radar": {"name": "RADAR SITE", "hp": 2000.0, "tickets": 12.0, "score": 300, "r": 4.5, "top": 15.0, "gun": 0.5},
	"fuel": {"name": "FUEL DEPOT", "hp": 1800.0, "tickets": 12.0, "score": 300, "r": 10.0, "top": 7.0, "gun": 0.5},
	"hangar": {"name": "HANGAR", "hp": 3600.0, "tickets": 16.0, "score": 400, "r": 11.0, "top": 9.5, "gun": 0.25},
	"command": {"name": "COMMAND BUNKER", "hp": 5000.0, "tickets": 24.0, "score": 500, "r": 7.5, "top": 5.0, "gun": 0.15},
	"cram": {"name": "C-RAM SITE", "hp": 1500.0, "tickets": 10.0, "score": 250, "r": 4.0, "top": 3.2, "gun": 1.5},
}
const RPM := 4500.0
const ROUNDS := 1550.0
const RELOAD := 14.0
const MUZZLE := 1100.0  # the rounds' speed, to lead with
const RANGE := 1600.0
const LOW := 480.0  # how far it sees an aircraft down in the ground clutter
const DPS := 11.0  # what the stream does to an aircraft a second, close in and flying at it
const PK := 0.45  # bombs and missiles it shoots down a second, close in
const GUARD := 420.0  # what passes this close to it is coming for the base
const COLS := {"concrete": Color(0.56, 0.55, 0.51), "dark": Color(0.29, 0.3, 0.29), "steel": Color(0.49, 0.52, 0.54),
	"white": Color(0.87, 0.89, 0.89), "olive": Color(0.36, 0.38, 0.27), "tank": Color(0.77, 0.76, 0.72),
	"roof": Color(0.54, 0.56, 0.55), "sand": Color(0.66, 0.57, 0.42), "black": Color(0.1, 0.1, 0.1),
	"tan": Color(0.72, 0.64, 0.48), "gun": Color(0.23, 0.24, 0.26), "barrel": Color(0.17, 0.18, 0.19)}

var w: Node
var kind := ""
var K: Dictionary
var team := 0
var hp := 0.0
var dead := false
var counts := false  # (Ground Strike: knocking it out costs its side tickets)
var respawn := 0.0
var label := ""
var top := 0.0
var radius := 0.0
var velocity := Vector3.ZERO
var tag := "C-RAM"  # (who gets an aircraft the gun shoots down)
var kills := 0
var deaths := 0
var score := 0
var _vis: Node3D
var _meshes: Array = []
var _parts := {}
var _flag: Node3D
var _spin: Node3D
var _respawn_t := 0.0
var _burn_t := 0.0
var _fire: CPUParticles3D
var _smoke: CPUParticles3D
static var _wreck: StandardMaterial3D
# the gun
var _yaw_n: Node3D
var _pitch_n: Node3D
var _barrels: Node3D
var _glow: MeshInstance3D
var _sound: AudioStreamPlayer3D
var yaw := 0.0
var pitch := 0.1
var target = null  # an aircraft, or a bomb or missile
var target_air := false
var firing := false
var ammo := ROUNDS
var _lock_t := 0.0
var _scan_t := 0.0
var _reload_t := 0.0
var _tracer_t := 0.0
var _aim := Vector3.FORWARD


func setup(world: Node, k: String, t: int, x: float, z: float, yaw0: float, in_strike: bool) -> void:
	w = world
	kind = k
	K = KINDS[k]
	team = t
	hp = K["hp"]
	label = K["name"]
	top = K["top"]
	radius = K["r"]
	counts = in_strike
	respawn = 90.0 if k == "cram" and not in_strike else 0.0
	collision_layer = 1
	collision_mask = 0
	_scan_t = randf() * 0.2
	w.add_child(self)
	global_transform = Transform3D(Basis(Vector3.UP, yaw0), Vector3(x, T.height(x, z) - 0.15, z))
	_vis = Node3D.new()
	add_child(_vis)
	call("_" + k)
	if k != "command":
		_flag = _team_flag(radius + 1.5, radius * 0.5, 6.0)
	for n in _parts:
		var mi := MeshInstance3D.new()
		mi.mesh = _merge(_parts[n])
		mi.material_override = w.detail_mat()
		(n as Node3D).add_child(mi)
		_meshes.append(mi)
	_parts = {}


# ---------------------------------------------------------------- the models (as the web game's), merged per moving part

func _add(to: Node3D, mesh: Mesh, at: Vector3, col: String, rot := Vector3.ZERO, sc := Vector3.ONE) -> void:
	if not _parts.has(to):
		_parts[to] = []
	_parts[to].append([mesh, Transform3D(Basis.from_euler(rot).scaled(sc), at), COLS[col]])


func _box(to: Node3D, size: Vector3, at: Vector3, col: String, ry := 0.0) -> void:
	var m := BoxMesh.new()
	m.size = size
	_add(to, m, at, col, Vector3(0, ry, 0))


func _cyl(to: Node3D, rt: float, rb: float, h: float, at: Vector3, col: String, rot := Vector3.ZERO, seg := 14) -> void:
	var m := CylinderMesh.new()
	m.top_radius = rt
	m.bottom_radius = rb
	m.height = h
	m.radial_segments = seg
	m.rings = 1
	_add(to, m, at, col, rot)


func _solid(size: Vector3, at: Vector3) -> void:
	var cs := CollisionShape3D.new()
	var b := BoxShape3D.new()
	b.size = size
	cs.shape = b
	cs.position = at
	add_child(cs)


func _radar() -> void:
	_box(_vis, Vector3(4.5, 3, 4), Vector3(0, 1.5, 3.2), "concrete")
	for c in [Vector2(-1, -1), Vector2(1, -1), Vector2(-1, 1), Vector2(1, 1)]:
		_cyl(_vis, 0.12, 0.2, 12.0, Vector3(c.x * 0.98, 6, c.y * 0.98), "steel", Vector3(c.y * 0.06, 0, -c.x * 0.06), 6)
	for y in [2.0, 5.0, 8.0, 11.0]:
		_box(_vis, Vector3(2.2, 0.12, 2.2), Vector3(0, y, 0), "steel")
	_box(_vis, Vector3(2.4, 1.2, 2.4), Vector3(0, 12.4, 0), "dark")
	_spin = Node3D.new()
	_spin.position.y = 13.4
	_vis.add_child(_spin)
	_add(_spin, _dish(3.2, 0.9), Vector3(0, 1.2, 0.4), "white", Vector3(-1.25, 0, 0))
	_box(_spin, Vector3(0.3, 2.2, 0.3), Vector3(0, 0.6, 0), "steel")
	_solid(Vector3(4.5, 3, 4), Vector3(0, 1.5, 3.2))
	_solid(Vector3(2.6, 14.5, 2.6), Vector3(0, 7.25, 0))


func _fuel() -> void:
	for c in [Vector2(-4.5, -3), Vector2(4.5, -3), Vector2(0, 4.5)]:
		_cyl(_vis, 3.4, 3.4, 6.0, Vector3(c.x, 3, c.y), "tank", Vector3.ZERO, 20)
		_cyl(_vis, 3.5, 3.5, 0.3, Vector3(c.x, 6.1, c.y), "dark", Vector3.ZERO, 20)
		_box(_vis, Vector3(0.2, 6.4, 0.6), Vector3(c.x + 3.3, 3.2, c.y), "steel")
		_solid(Vector3(6.8, 6.2, 6.8), Vector3(c.x, 3.1, c.y))
	_box(_vis, Vector3(9, 0.35, 0.35), Vector3(0, 0.6, -3), "steel")
	_box(_vis, Vector3(0.35, 0.35, 7.5), Vector3(0, 0.6, 0.8), "steel")
	for s in [-1.0, 1.0]:
		_box(_vis, Vector3(22, 0.8, 0.5), Vector3(0, 0.4, s * 9.5), "concrete")
		_box(_vis, Vector3(0.5, 0.8, 19), Vector3(s * 11.0, 0.4, 0), "concrete")


func _hangar() -> void:
	_add(_vis, _arch(9.0, 24.0, 18), Vector3.ZERO, "roof")
	_box(_vis, Vector3(12, 6.5, 0.3), Vector3(0, 3.25, -12.1), "black")
	_box(_vis, Vector3(22, 0.25, 34), Vector3(0, 0.12, -4), "concrete")
	_solid(Vector3(18, 9, 24), Vector3(0, 4.5, 0))


func _command() -> void:
	_box(_vis, Vector3(12, 3.6, 10), Vector3(0, 1.8, 0), "concrete")
	_box(_vis, Vector3(13, 0.7, 11), Vector3(0, 3.95, 0), "concrete")
	_box(_vis, Vector3(3, 2, 0.3), Vector3(0, 1.2, -5.1), "black")
	_cyl(_vis, 0.1, 0.16, 11.0, Vector3(3.8, 9.3, 2.5), "steel", Vector3.ZERO, 6)
	for i in 3:
		_box(_vis, Vector3(1.6 - i * 0.4, 0.06, 0.06), Vector3(3.8, 6.0 + i * 2.5, 2.5), "steel")
	var dome := SphereMesh.new()
	dome.radius = 1.1
	dome.height = 1.1
	dome.is_hemisphere = true
	dome.radial_segments = 12
	dome.rings = 4
	_add(_vis, dome, Vector3(-3.5, 4.3, 2.5), "white")
	for i in range(-2, 3):
		_box(_vis, Vector3(2.2, 1, 1.1), Vector3(i * 2.3, 0.5, -7.2), "sand")
	_solid(Vector3(13, 4.3, 11), Vector3(0, 2.15, 0))
	_flag = _team_flag(-5.5, 6.5, 9.0)


## The C-RAM site: a concrete pad ringed with sandbags, a generator, and the gun on its trailer.
func _cram() -> void:
	_box(_vis, Vector3(7, 0.25, 8), Vector3(0, 0.12, 0), "concrete")
	for i in 5:
		var a := i / 5.0 * TAU
		_box(_vis, Vector3(2.2, 0.9, 1), Vector3(cos(a) * 4.6, 0.45, sin(a) * 4.6), "sand", -a + PI / 2.0)
	_box(_vis, Vector3(1.6, 1.4, 2.2), Vector3(3.2, 0.7, 2.6), "olive")
	# the trailer: its bed, the generator, wheels, tow bar and legs
	var b := Vector3(0, 0.25, 0)
	_box(_vis, Vector3(2.6, 0.45, 4.2), b + Vector3(0, 0.75, 0.3), "tan")
	_box(_vis, Vector3(2.4, 0.9, 1.3), b + Vector3(0, 1.4, 1.7), "tan")
	for c in [Vector2(-1.25, 1.2), Vector2(1.25, 1.2), Vector2(-1.25, 2.1), Vector2(1.25, 2.1)]:
		_cyl(_vis, 0.42, 0.42, 0.3, b + Vector3(c.x, 0.42, c.y), "black", Vector3(0, 0, PI / 2.0), 12)
	_box(_vis, Vector3(0.2, 0.2, 1.6), b + Vector3(0, 0.55, -2.4), "dark")
	for x in [-1.1, 1.1]:
		_cyl(_vis, 0.08, 0.12, 0.8, b + Vector3(x, 0.35, -1.4), "dark", Vector3.ZERO, 8)
	# the mount, turning on its base; the radar's white dome over the gun, which elevates; the six barrels spin
	_cyl(_vis, 0.55, 0.65, 0.7, b + Vector3(0, 1.32, 0), "tan")
	_yaw_n = Node3D.new()
	_yaw_n.position = b + Vector3(0, 1.67, 0)
	_vis.add_child(_yaw_n)
	_box(_yaw_n, Vector3(1.35, 0.55, 1.1), Vector3(0, 0.28, 0.05), "tan")
	_box(_yaw_n, Vector3(0.42, 0.8, 0.95), Vector3(0.85, 0.55, 0.15), "gun")
	_pitch_n = Node3D.new()
	_pitch_n.position = Vector3(0, 0.95, 0)
	_yaw_n.add_child(_pitch_n)
	var dome := SphereMesh.new()
	dome.radius = 0.62
	dome.height = 1.24
	dome.radial_segments = 16
	dome.rings = 8
	_add(_pitch_n, dome, Vector3(0, 0.75, 0.25), "white", Vector3.ZERO, Vector3(1, 1.3, 1))
	_cyl(_pitch_n, 0.62, 0.62, 0.7, Vector3(0, 0.12, 0.25), "white", Vector3.ZERO, 16)
	_box(_pitch_n, Vector3(0.75, 0.5, 1.1), Vector3(0, -0.18, -0.2), "tan")
	_barrels = Node3D.new()
	_barrels.position = Vector3(0, -0.18, -0.75)
	_pitch_n.add_child(_barrels)
	for i in 6:
		var a := i / 6.0 * TAU
		_cyl(_barrels, 0.035, 0.035, 1.9, Vector3(cos(a) * 0.1, sin(a) * 0.1, -0.95), "barrel", Vector3(PI / 2.0, 0, 0), 6)
	_cyl(_barrels, 0.17, 0.17, 0.12, Vector3(0, 0, -1.7), "gun", Vector3(PI / 2.0, 0, 0), 12)
	_cyl(_barrels, 0.19, 0.19, 0.22, Vector3(0, 0, -0.1), "gun", Vector3(PI / 2.0, 0, 0), 12)
	# the flash at the muzzle while it fires
	_glow = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(1.6, 1.6)
	_glow.mesh = q
	_glow.material_override = w.flash_material()
	_glow.position = Vector3(0, 0, -2.2)
	_glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_glow.visible = false
	_barrels.add_child(_glow)
	_sound = AudioStreamPlayer3D.new()
	_sound.stream = w.sounds["cram"]
	_sound.unit_size = 60.0
	_sound.max_distance = 3000.0
	_sound.volume_db = 2.0
	_yaw_n.add_child(_sound)
	_solid(Vector3(7, 0.6, 8), Vector3(0, 0.3, 0))
	_solid(Vector3(2.6, 3.0, 4.2), Vector3(0, 1.75, 0.3))


## Its side's flag on a pole, waving.
func _team_flag(x: float, z: float, h: float) -> Node3D:
	_cyl(_vis, 0.07, 0.07, h, Vector3(x, h / 2.0, z), "steel", Vector3.ZERO, 6)
	var f := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.04, 0.9, 1.5)
	f.mesh = bm
	var m := StandardMaterial3D.new()
	m.albedo_color = D.TEAMS[team]["color"]
	m.roughness = 0.7
	f.material_override = m
	var piv := Node3D.new()
	piv.position = Vector3(x, h - 0.5, z)
	_vis.add_child(piv)
	f.position = Vector3(0, 0, 0.78)
	piv.add_child(f)
	return piv


## A shallow dish (a cap of a sphere th radians round from its middle), drawn on both sides, its rim at y = 0.
static func _dish(r: float, th: float, seg := 18, rings := 4) -> ArrayMesh:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var idx := PackedInt32Array()
	var rim := r * cos(th)
	for side in 2:
		var base := v.size()
		for i in rings + 1:
			var a := th * i / rings
			for j in seg + 1:
				var b := TAU * j / seg
				var p := Vector3(sin(a) * cos(b), cos(a), sin(a) * sin(b))
				v.append(p * r - Vector3(0, rim, 0))
				n.append(p if side == 0 else -p)
		for i in rings:
			for j in seg:
				var a0 := base + i * (seg + 1) + j
				var a1 := a0 + seg + 1
				if side == 0:
					idx.append_array([a0, a1, a0 + 1, a0 + 1, a1, a1 + 1])
				else:
					idx.append_array([a0, a0 + 1, a1, a0 + 1, a1 + 1, a1])
	return _arrays(v, n, idx)


## A hangar's arched roof: half a tube of radius r, len long along z, open at the ends, drawn on both sides, with its
## two ends (half discs) closed.
static func _arch(r: float, len: float, seg := 18) -> ArrayMesh:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var idx := PackedInt32Array()
	for side in 2:
		var base := v.size()
		for j in seg + 1:
			var a := PI * j / seg
			var p := Vector3(cos(a), sin(a), 0)
			for z in [-len / 2.0, len / 2.0]:
				v.append(p * r + Vector3(0, 0, z))
				n.append(p if side == 0 else -p)
		for j in seg:
			var a0 := base + j * 2
			if side == 0:
				idx.append_array([a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2])
			else:
				idx.append_array([a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3])
	for e in [-1.0, 1.0]:
		var c := v.size()
		v.append(Vector3(0, 0, e * len / 2.0))
		n.append(Vector3(0, 0, e))
		for j in seg + 1:
			var a := PI * j / seg
			v.append(Vector3(cos(a) * r, sin(a) * r, e * len / 2.0))
			n.append(Vector3(0, 0, e))
		for j in seg:
			if e > 0.0:
				idx.append_array([c, c + 2 + j, c + 1 + j])
			else:
				idx.append_array([c, c + 1 + j, c + 2 + j])
	return _arrays(v, n, idx)


static func _arrays(v: PackedVector3Array, n: PackedVector3Array, idx: PackedInt32Array) -> ArrayMesh:
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = v
	a[Mesh.ARRAY_NORMAL] = n
	a[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	return m


## The parts ([mesh, place, colour] each) in one mesh, coloured in its vertices.
static func _merge(parts: Array) -> ArrayMesh:
	var v := PackedVector3Array()
	var nm := PackedVector3Array()
	var c := PackedColorArray()
	var idx := PackedInt32Array()
	for p in parts:
		var a: Array = (p[0] as Mesh).surface_get_arrays(0)
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


# ---------------------------------------------------------------- damage

## Hurt by a blast or shells (not by its own side's).
func hit(amount: float, by: Node, what: String) -> void:
	if dead or amount <= 0.0 or (by and by.get("team") == team):
		return
	hp -= amount
	if by == w.player:
		w.hud.hitmark(false, false)
	if hp <= 0.0:
		destroy(by, what)


func destroy(by: Node, what: String) -> void:
	if dead:
		return
	dead = true
	hp = 0.0
	_burn_t = 50.0
	_respawn_t = respawn
	_stop_gun()
	target = null
	if not _wreck:
		_wreck = StandardMaterial3D.new()
		_wreck.albedo_color = Color(0.12, 0.11, 0.1)
		_wreck.roughness = 1.0
	for m in _meshes:
		(m as MeshInstance3D).material_override = _wreck
	_vis.scale.y = 0.55
	_vis.rotation.z = randf_range(-0.06, 0.06)
	if _spin:
		_spin.rotation.x = 0.9
	var c := global_position
	var big := 3.2 if kind == "fuel" else (2.4 if kind == "command" or kind == "hangar" else 1.6)
	for i in 3:
		Proj.fireball(w, c + Vector3(randf_range(-radius, radius) * 0.6, top * 0.4, randf_range(-radius, radius) * 0.6), 6.0 * big * randf_range(0.7, 1.0))
	if kind == "fuel":
		for i in 4:
			Proj.fireball(w, c + Vector3(randf_range(-6, 6), randf_range(6, 16), randf_range(-6, 6)), randf_range(14.0, 22.0))
	w.sound3d("boom", c, 12.0, 3000.0)
	_burning(true)
	w.ground.destroyed(self, by, what)


func revive() -> void:
	dead = false
	hp = K["hp"]
	ammo = ROUNDS
	_reload_t = 0.0
	for m in _meshes:
		(m as MeshInstance3D).material_override = w.detail_mat()
	_vis.scale.y = 1.0
	_vis.rotation.z = 0.0
	if _spin:
		_spin.rotation.x = 0.0
	_burning(false)


## Flames and a column of black smoke over the wreck.
func _burning(on: bool) -> void:
	if not on:
		for p in [_fire, _smoke]:
			if p:
				p.queue_free()
		_fire = null
		_smoke = null
		return
	_smoke = Proj.trail(self, 9.0, 6.0, Color(0.1, 0.09, 0.08, 0.7))
	_smoke.amount = 40
	_smoke.gravity = Vector3(0, 2.5, 0)
	_smoke.initial_velocity_min = 2.0
	_smoke.initial_velocity_max = 5.0
	_smoke.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	_smoke.emission_sphere_radius = radius * 0.5
	_smoke.position = Vector3(0, top * 0.4, 0)
	_fire = CPUParticles3D.new()
	_fire.amount = 24
	_fire.lifetime = 0.9
	_fire.local_coords = false
	_fire.direction = Vector3.UP
	_fire.spread = 20.0
	_fire.gravity = Vector3(0, 3.0, 0)
	_fire.initial_velocity_min = 2.0
	_fire.initial_velocity_max = 5.0
	_fire.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	_fire.emission_sphere_radius = radius * 0.5
	_fire.scale_amount_min = 1.5
	_fire.scale_amount_max = 3.5
	var q := QuadMesh.new()
	q.size = Vector2(1.5, 1.5)
	q.material = w.flash_material()
	_fire.mesh = q
	_fire.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_fire.position = Vector3(0, 1.0, 0)
	add_child(_fire)


func _physics_process(dt: float) -> void:
	if _flag:
		_flag.rotation.y = sin(Time.get_ticks_msec() / 1000.0 * 2.6 + float(get_index())) * 0.25
	if dead:
		if _burn_t > 0.0:
			_burn_t -= dt
			if _burn_t <= 0.0:
				if _fire:
					_fire.emitting = false
				if _smoke:
					_smoke.emitting = false
		if respawn > 0.0:
			_respawn_t -= dt
			if _respawn_t <= 0.0:
				revive()
		return
	if _spin:
		_spin.rotation.y += dt * 1.6
	if kind == "cram":
		_gun(dt)


# ---------------------------------------------------------------- the C-RAM's gun

## How well its radar sees an aircraft for its height over the ground: 1 up in the open sky, down to 0 in the clutter
## of the ground below about 30 m.
static func low(p: Vector3) -> float:
	return smoothstep(30.0, 120.0, p.y - T.height(p.x, p.z))


func _clear(a: Vector3, b: Vector3) -> bool:
	var q := PhysicsRayQueryParameters3D.create(a, b, 1, [get_rid()])
	return get_world_3d().direct_space_state.intersect_ray(q).is_empty()


func _gun(dt: float) -> void:
	if _reload_t > 0.0:
		_reload_t -= dt
		if _reload_t <= 0.0:
			ammo = ROUNDS
	var base := global_position + Vector3(0, 2.9, 0)
	_scan_t -= dt
	if _scan_t <= 0.0:
		_scan_t = 0.15
		_scan(base)
	elif target and (not is_instance_valid(target) or target.dead):
		target = null
	var want_yaw := 0.0
	var want_pitch := 0.05
	if target:
		var tp: Vector3 = target.global_position
		var tv: Vector3 = target.velocity if target_air else target.vel
		_aim = (tp + tv * (tp.distance_to(base) / MUZZLE) - base).normalized()
		var l := global_basis.inverse() * _aim
		want_yaw = atan2(-l.x, -l.z)
		want_pitch = atan2(l.y, Vector2(l.x, l.z).length())
	want_pitch = clampf(want_pitch, -0.25, 1.4)
	var ey := wrapf(want_yaw - yaw, -PI, PI)
	var ep := want_pitch - pitch
	yaw = wrapf(yaw + clampf(ey, -2.6 * dt, 2.6 * dt), -PI, PI)
	pitch += clampf(ep, -2.0 * dt, 2.0 * dt)
	_yaw_n.rotation.y = yaw
	_pitch_n.rotation.x = pitch
	if _lock_t > 0.0:
		_lock_t -= dt
	var was := firing
	firing = target != null and absf(ey) < 0.07 and absf(ep) < 0.07 and ammo > 0.0 and _reload_t <= 0.0 and not (target_air and _lock_t > 0.0)
	if not firing:
		if was:
			_stop_gun()
		return
	ammo -= RPM / 60.0 * dt
	if ammo <= 0.0:
		ammo = 0.0
		_reload_t = RELOAD
	_barrels.rotation.z += dt * 75.0
	var tip: Vector3 = _barrels.global_transform * Vector3(0, 0, -2.0)
	var tp: Vector3 = target.global_position
	var dist := tp.distance_to(tip)
	_tracer_t -= dt
	while _tracer_t <= 0.0:
		_tracer_t += 1.0 / 32.0
		var s := 0.007
		var dir := (_aim + Vector3(randf_range(-s, s), randf_range(-s, s), randf_range(-s, s))).normalized()
		w.ground.streak(tip, dir, minf(RANGE * 1.3, dist + randf_range(-40.0, 90.0)), randf() < 0.45)
	_glow.visible = randf() < 0.7
	_glow.scale = Vector3.ONE * randf_range(0.7, 1.2)
	if not _sound.playing:
		_sound.play()
	var k := maxf(0.0, 1.25 - dist / RANGE)
	if target_air:
		# hits: fewer far off, on one crossing its sights fast, or one down in the ground clutter
		var rel := tp - tip
		var dd := maxf(rel.length(), 1.0)
		var tv: Vector3 = target.velocity
		var vr := tv.dot(rel / dd)
		var wv := sqrt(maxf(0.0, tv.length_squared() - vr * vr)) / dd
		var ka := maxf(0.0, 1.1 - dist / RANGE) * clampf(0.3 / maxf(0.3, wv), 0.4, 1.0) * (0.7 + 0.3 * low(tp))
		target.hurt(DPS * 0.8 * ka * dt, self, "20MM C-RAM")
		if randf() < dt * 6.0 and is_instance_valid(target):
			w.flash(tp + Vector3(randf_range(-2, 2), randf_range(-1, 1), randf_range(-2, 2)), 2.0)
	elif randf() < 1.0 - exp(-PK * (0.75 if target.kind == "bomb" else 1.0) * k * dt):
		target.intercept()
		target = null


func _stop_gun() -> void:
	firing = false
	if _sound and _sound.playing:
		_sound.stop()
	if _glow:
		_glow.visible = false


## Looks for the most urgent threat in reach that it can see: what's coming at the base, the soonest first (going
## away, or passing well clear, it leaves alone); then the nearest enemy aircraft flying low enough for it.
func _scan(base: Vector3) -> void:
	var best = null
	var bs := INF
	var air := false
	for o in Proj.ordnance:
		if not is_instance_valid(o) or o.dead or o.team == team:
			continue
		var rel: Vector3 = o.global_position - base
		if rel.length() > RANGE:
			continue
		var vel: Vector3 = o.vel
		var vv := vel.length_squared()
		var tc := -rel.dot(vel) / vv if vv > 1.0 else -1.0
		if tc < 0.0:
			continue
		if sqrt(maxf(0.0, rel.length_squared() - tc * tc * vv)) > GUARD:
			continue
		if tc + 0.5 < bs and _clear(base, o.global_position):
			bs = tc + 0.5
			best = o
	if best == null:
		for v in w.vehicles:
			if v.dead or v.team == team or not v.get("jet"):
				continue
			var p: Vector3 = v.global_position
			if p.y - T.height(p.x, p.z) > 700.0:
				continue
			var d := p.distance_to(base)
			if d > LOW + (RANGE * 0.85 - LOW) * low(p):
				continue
			var sc := 60.0 + d / 30.0 - (5.0 if v == target else 0.0)
			if sc < bs and _clear(base, p):
				bs = sc
				best = v
				air = true
	# a new aircraft: the fire-control radar takes a moment to lock on before the gun opens up
	if best and air and best != target:
		_lock_t = 0.8
	target = best
	target_air = air
