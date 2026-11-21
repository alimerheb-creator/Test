extends RefCounted
## Builds KARSA VALLEY's buildings and headquarters on the terrain, from the web game's layout (data.gd).
## Buildings are made of wall panels with doorways and windows; the ground floor can be entered.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")
static var W: Node3D


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
	var m: String = ["plaster", "plaster2", "blocks", "plaster"][idx % 4]
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


static func build(w: Node3D) -> void:
	W = w
	for i in D.BUILDINGS.size():
		building(D.BUILDINGS[i], i)
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
