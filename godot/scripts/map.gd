extends RefCounted
## Builds the map's buildings, cover and headquarters on the terrain, from the web game's layouts (data.gd).
## Buildings are made of wall panels with doorways and windows; the ground floor can be entered.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")
static var W: Node3D
static var _parts := {}
static var _body: StaticBody3D
static var _bag: CapsuleMesh


static func box(pos: Vector3, size: Vector3, m: String, rot_y := 0.0, collide := true) -> Node3D:
	var root: Node3D = Node3D.new()
	if collide:
		root = StaticBody3D.new()
		var cs := CollisionShape3D.new()
		var sh := BoxShape3D.new()
		sh.size = size
		cs.shape = sh
		root.add_child(cs)
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = W.mat(m)
	root.add_child(mi)
	W.add_child(root)
	root.position = pos
	root.rotation.y = rot_y
	return root


## A wall from a to b (x, z) standing on y0, with openings [centre along the wall, width, bottom, top].
static func wall(a: Vector2, b: Vector2, y0: float, h: float, m: String, openings := [], t := 0.3) -> void:
	var L := a.distance_to(b)
	var dir := (b - a) / L
	var ang := atan2(-dir.y, dir.x)
	var segs := []
	var cur := 0.0
	for o in openings:
		var o0: float = o[0] - o[1] / 2.0
		var o1: float = o[0] + o[1] / 2.0
		if o0 > cur:
			segs.append([cur, o0, 0.0, h])
		if o[2] > 0.0:
			segs.append([o0, o1, 0.0, o[2]])
		if o[3] < h:
			segs.append([o0, o1, o[3], h])
		cur = o1
	if cur < L:
		segs.append([cur, L, 0.0, h])
	for s in segs:
		var p: Vector2 = a + dir * ((s[0] + s[1]) / 2.0)
		box(Vector3(p.x, y0 + (s[2] + s[3]) / 2.0, p.y), Vector3(s[1] - s[0], s[3] - s[2], t), m, ang)


static func _opening(L: float, door: bool) -> Array:
	if door:
		return [[L / 2.0, 1.4, 0.0, 2.3]]
	if L > 9.0:
		return [[L * 0.28, 1.4, 1.0, 2.1], [L * 0.72, 1.4, 1.0, 2.1]]
	return [[L / 2.0, 1.4, 1.0, 2.1]]


## One storey: four walls, a doorway on side door ("n", "s", "e", "w"; anything else: windows only).
static func storey(c: Vector2, w: float, d: float, h: float, m: String, door: String, y0: float, roof: bool, lamp: bool) -> void:
	var t := 0.3
	var x0 := c.x - w / 2.0
	var x1 := c.x + w / 2.0
	var z0 := c.y - d / 2.0
	var z1 := c.y + d / 2.0
	wall(Vector2(x0 - t / 2, z1), Vector2(x1 + t / 2, z1), y0, h, m, _opening(w + t, door == "s"))
	wall(Vector2(x0 - t / 2, z0), Vector2(x1 + t / 2, z0), y0, h, m, _opening(w + t, door == "n"))
	wall(Vector2(x1, z1 - t / 2), Vector2(x1, z0 + t / 2), y0, h, m, _opening(d - t, door == "e"))
	wall(Vector2(x0, z0 + t / 2), Vector2(x0, z1 - t / 2), y0, h, m, _opening(d - t, door == "w"))
	box(Vector3(c.x, y0 + h - 0.125, c.y), Vector3(w + t, 0.25, d + t), "concrete")
	if roof:
		for s in [[Vector3(c.x, 0, z0), Vector3(w + t, 0.6, 0.2)], [Vector3(c.x, 0, z1), Vector3(w + t, 0.6, 0.2)], [Vector3(x0, 0, c.y), Vector3(0.2, 0.6, d)], [Vector3(x1, 0, c.y), Vector3(0.2, 0.6, d)]]:
			box(s[0] + Vector3(0, y0 + h + 0.3, 0), s[1], m)
	if lamp:
		var l := OmniLight3D.new()
		l.light_color = Color(1.0, 0.72, 0.45)
		l.light_energy = 1.4
		l.omni_range = 8.0
		W.add_child(l)
		l.position = Vector3(c.x, y0 + h - 0.6, c.y)
		box(Vector3(c.x, y0 + h - 0.28, c.y), Vector3(0.5, 0.06, 0.5), "lamp", 0.0, false)


static func building(b: Array, idx: int) -> void:
	var c := Vector2(b[0], b[1])
	var w := float(b[2]) * 3.2
	var d := float(b[3]) * 3.2
	var floors: int = b[4]
	var y0 := T.height(c.x, c.y)
	# the doorway faces the nearest flag
	var best := Vector2.ZERO
	var bd := INF
	for f in D.FLAGS:
		var fp := Vector2(f["x"], f["z"])
		if fp.distance_to(c) < bd and fp.distance_to(c) > 1.0:
			bd = fp.distance_to(c)
			best = fp
	var to := best - c
	var door := ("e" if to.x > 0.0 else "w") if absf(to.x) > absf(to.y) else ("s" if to.y > 0.0 else "n")
	var m: String = (["adobe", "plaster", "adobe", "plaster2"] if T.desert else ["plaster", "plaster2", "blocks", "plaster"])[idx % 4]
	box(Vector3(c.x, y0 - 1.0, c.y), Vector3(w + 0.6, 2.0, d + 0.6), "concrete")
	box(Vector3(c.x, y0 + 0.012, c.y), Vector3(w, 0.02, d), "concrete", 0.0, false)
	for k in floors:
		storey(c, w, d, 3.2, m, door if k == 0 else "-", y0 + k * 3.2, k == floors - 1, k == 0 and idx % 5 == 0)


static func sandbags(c: Vector3, length: float, rot: float) -> void:
	var sb := box(c + Vector3(0, 0.5, 0), Vector3(length, 1.0, 0.7), "sandbag", rot)
	sb.get_child(1).queue_free()
	var cm := CapsuleMesh.new()
	cm.radius = 0.17
	cm.height = 0.62
	var n := int(length / 0.58)
	for row in 3:
		for i in n:
			var mi := MeshInstance3D.new()
			mi.mesh = cm
			mi.material_override = W.mat("sandbag")
			sb.add_child(mi)
			mi.position = Vector3(-length / 2.0 + 0.3 + i * 0.58 + (0.29 if row % 2 == 1 and i < n - 1 else 0.0), -0.38 + row * 0.24, 0)
			mi.rotation = Vector3(0, randf_range(-0.12, 0.12), PI / 2)
			mi.scale = Vector3(0.75, 1.0, 1.0)


## A part of the cover in material m: merged with the rest of that material's into one mesh at the end of props().
static func _add(m: String, mesh: PrimitiveMesh, t: Transform3D) -> void:
	if not _parts.has(m):
		_parts[m] = []
	_parts[m].append([mesh, t, Color.WHITE])


static func _solid(sh: Shape3D, t: Transform3D) -> void:
	var cs := CollisionShape3D.new()
	cs.shape = sh
	cs.transform = t
	_body.add_child(cs)


## A solid box of cover.
static func _piece(m: String, pos: Vector3, size: Vector3, yaw: float, collide := true) -> void:
	var t := Transform3D(Basis(Vector3.UP, yaw), pos)
	var bm := BoxMesh.new()
	bm.size = size
	_add(m, bm, t)
	if collide:
		var sh := BoxShape3D.new()
		sh.size = size
		_solid(sh, t)


## The lowest ground under a footprint (half sizes hx, hz, turned by yaw) round (x, z).
static func _low(x: float, z: float, hx: float, hz: float, yaw: float) -> float:
	var lo := T.height(x, z)
	var b := Basis(Vector3.UP, yaw)
	for c in [Vector3(-hx, 0, -hz), Vector3(hx, 0, -hz), Vector3(-hx, 0, hz), Vector3(hx, 0, hz)]:
		var q: Vector3 = b * c
		lo = minf(lo, T.height(x + q.x, z + q.z))
	return lo


## A box from below the lowest ground under it up to top metres over the ground at its middle.
static func _footed(m: String, x: float, z: float, size_x: float, top: float, size_z: float, yaw: float) -> void:
	var y := T.height(x, z)
	var lo := _low(x, z, size_x / 2.0, size_z / 2.0, yaw) - 0.3
	_piece(m, Vector3(x, (lo + y + top) / 2.0, z), Vector3(size_x, y + top - lo, size_z), yaw)


## A wall of sandbags `length` long along yaw, three staggered rows high, standing on base.
static func _bags(base: Vector3, length: float, yaw: float, rng: RandomNumberGenerator) -> void:
	if not _bag:
		_bag = CapsuleMesh.new()
		_bag.radius = 0.17
		_bag.height = 0.62
		_bag.radial_segments = 8
		_bag.rings = 1
	var b := Basis(Vector3.UP, yaw)
	var n := maxi(2, int(length / 0.58))
	for row in 3:
		for i in n - row % 2:
			var lx := -length / 2.0 + 0.3 + i * 0.58 + (0.29 if row % 2 == 1 else 0.0)
			_add("sandbag", _bag, Transform3D(b * Basis.from_euler(Vector3(0, rng.randf_range(-0.12, 0.12), PI / 2.0)) * Basis.from_scale(Vector3(0.75, 1, 1)),
				base + b * Vector3(lx, 0.12 + row * 0.24, 0)))
	var sh := BoxShape3D.new()
	sh.size = Vector3(length, 0.8, 0.7)
	_solid(sh, Transform3D(b, base + Vector3(0, 0.38, 0)))


## DUST RIDGE's cover, built as the web game builds it: compound walls, sandbag nests, concrete barriers, crates,
## shipping containers, broken walls, burnt-out cars and the radar dome, drawn in one mesh per material.
static func props() -> void:
	_parts = {}
	_body = StaticBody3D.new()
	W.add_child(_body)
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	for p in D.PROPS:
		var x: float = p[1]
		var z: float = p[2]
		var yaw := PI / 2.0 if p[3] else 0.0
		var y := T.height(x, z)
		var b := Basis(Vector3.UP, yaw)
		match p[0]:
			"block":
				# a compound wall with a concrete coping
				_footed("plaster", x, z, 10.0, 2.2, 0.6, yaw)
				_piece("concrete", Vector3(x, y + 2.26, z), Vector3(10.2, 0.12, 0.76), yaw, false)
			"container":
				var lo := _low(x, z, 3.03, 1.22, yaw)
				_piece("container_" + p[4], Vector3(x, lo + 1.2, z), Vector3(6.06, 2.6, 2.44), yaw)
				if rng.randf() < 0.3:
					_piece("container_" + ["red", "blue", "green", "orange", "grey"][rng.randi() % 5], Vector3(x, lo + 3.8, z), Vector3(6.06, 2.6, 2.44), yaw)
			"barrier":
				# a jersey barrier: a wide foot and a narrower top
				_piece("concrete", Vector3(x, y + 0.1, z), Vector3(3.0, 0.6, 0.62), yaw)
				_piece("concrete", Vector3(x, y + 0.64, z), Vector3(3.0, 0.5, 0.3), yaw)
			"sandbags":
				# an L: the long side, and the short one off its end
				if p[3]:
					_bags(Vector3(x, y, z), 3.2, 0.0, rng)
					_bags(Vector3(x - 1.6, T.height(x - 1.6, z - 1.0), z - 1.0), 2.0, PI / 2.0, rng)
				else:
					_bags(Vector3(x, y, z), 3.2, PI / 2.0, rng)
					_bags(Vector3(x - 1.0, T.height(x - 1.0, z - 1.6), z - 1.6), 2.0, 0.0, rng)
			"crate":
				var sz := 1.0 + rng.randf() * 0.3
				var a := rng.randf() * 0.5
				_piece("wood", Vector3(x, y + sz / 2.0 - 0.03, z), Vector3.ONE * sz, a)
				if rng.randf() < 0.4:
					_piece("wood", Vector3(x + 0.1, y + sz * 1.42, z - 0.1), Vector3.ONE * sz * 0.9, a + rng.randf_range(-0.3, 0.3))
			"wreck":
				# a burnt-out car: blackened body and cabin on four bare wheels
				_piece("gunmetal", Vector3(x, y + 0.65, z), Vector3(4.3, 0.75, 1.85), yaw)
				_piece("gunmetal", Vector3(x, y + 1.3, z) + b * Vector3(-0.3, 0, 0), Vector3(2.2, 0.6, 1.6), yaw)
				for wx in [-1.35, 1.35]:
					for wz in [-0.82, 0.82]:
						_add("polymer", T._cyl(0.33, 0.33, 0.26, 10), Transform3D(b * Basis(Vector3.RIGHT, PI / 2.0), Vector3(x, y + 0.31, z) + b * Vector3(wx, 0, wz)))
			"ruin":
				# a broken wall: a low stretch with a taller stub at one end
				var L := 3.0 + rng.randf() * 3.0
				var h := 1.0 + rng.randf() * 1.4
				_footed("blocks", x, z, L, h, 0.45, yaw)
				_piece("blocks", Vector3(x, y + h + 0.3, z) + b * Vector3(L / 2.0 - 0.6, 0, 0), Vector3(1.2, 0.6, 0.45), yaw)
			"dome":
				# the radar dome: a white ball on a concrete drum
				var lo := _low(x, z, 5.4, 5.4, 0.0) - 0.3
				var top := y + 4.0
				_add("concrete", T._cyl(5.2, 5.4, top - lo, 20), Transform3D(Basis(), Vector3(x, (lo + top) / 2.0, z)))
				var cy := CylinderShape3D.new()
				cy.radius = 5.3
				cy.height = top - lo
				_solid(cy, Transform3D(Basis(), Vector3(x, (lo + top) / 2.0, z)))
				_add("dome", T._sphere(5.7, 24, 12), Transform3D(Basis(), Vector3(x, top + 2.6, z)))
				var sp := SphereShape3D.new()
				sp.radius = 5.7
				_solid(sp, Transform3D(Basis(), Vector3(x, top + 2.6, z)))
	for m in _parts:
		var mi := MeshInstance3D.new()
		mi.mesh = T.merge(_parts[m])
		mi.material_override = W.mat(m)
		W.add_child(mi)
	_parts = {}


static func build(w: Node3D) -> void:
	W = w
	for i in D.BUILDINGS.size():
		building(D.BUILDINGS[i], i)
	if not D.PROPS.is_empty():
		props()
	# headquarters: sandbag walls and supply crates
	for t in 2:
		var hq: Dictionary = D.HQS[t]
		var s := 1.0 if t == 0 else -1.0
		for k in [-1.0, 1.0]:
			var x: float = hq["x"] + k * 9.0
			var z: float = hq["z"] - s * 10.0
			sandbags(Vector3(x, T.height(x, z), z), 5.0, 0.0)
		for k in 3:
			var x: float = hq["x"] + 12.0 + k * 1.2
			var z: float = hq["z"] + s * 4.0
			box(Vector3(x, T.height(x, z) + 0.5, z), Vector3(1.0, 1.0, 1.0), "wood", randf() * 0.3)
