extends RefCounted
## Builds the test map: a walled compound at golden hour, with houses, a two-storey building, a container yard
## and cover. Everything is made from boxes in code, textured with the procedural materials in world.gd.

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


static func cyl(pos: Vector3, r: float, h: float, m: String, collide := true) -> void:
	var root: Node3D = Node3D.new()
	if collide:
		root = StaticBody3D.new()
		var cs := CollisionShape3D.new()
		var sh := CylinderShape3D.new()
		sh.radius = r
		sh.height = h
		cs.shape = sh
		root.add_child(cs)
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = r
	cm.bottom_radius = r
	cm.height = h
	mi.mesh = cm
	mi.material_override = W.mat(m)
	root.add_child(mi)
	W.add_child(root)
	root.position = pos


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
		return [[L / 2.0, 1.3, 0.0, 2.3]]
	if L > 9.0:
		return [[L * 0.28, 1.4, 1.0, 2.1], [L * 0.72, 1.4, 1.0, 2.1]]
	return [[L / 2.0, 1.4, 1.0, 2.1]]


## A one-room house with a flat roof and parapet. door: "n", "s", "e" or "w".
static func house(c: Vector2, w: float, d: float, h: float, m: String, door: String, lamp := false, y0 := 0.0, roof := true) -> void:
	var t := 0.3
	var x0 := c.x - w / 2.0
	var x1 := c.x + w / 2.0
	var z0 := c.y - d / 2.0
	var z1 := c.y + d / 2.0
	wall(Vector2(x0 - t / 2, z1), Vector2(x1 + t / 2, z1), y0, h, m, _opening(w + t, door == "s"))
	wall(Vector2(x0 - t / 2, z0), Vector2(x1 + t / 2, z0), y0, h, m, _opening(w + t, door == "n"))
	wall(Vector2(x1, z1 - t / 2), Vector2(x1, z0 + t / 2), y0, h, m, _opening(d - t, door == "e"))
	wall(Vector2(x0, z0 + t / 2), Vector2(x0, z1 - t / 2), y0, h, m, _opening(d - t, door == "w"))
	box(Vector3(c.x, y0 + 0.012, c.y), Vector3(w, 0.02, d), "concrete", 0.0, false)
	if roof:
		box(Vector3(c.x, y0 + h + 0.125, c.y), Vector3(w + t, 0.25, d + t), "concrete")
		for s in [[Vector3(c.x, 0, z0), Vector3(w + t, 0.5, 0.2)], [Vector3(c.x, 0, z1), Vector3(w + t, 0.5, 0.2)], [Vector3(x0, 0, c.y), Vector3(0.2, 0.5, d)], [Vector3(x1, 0, c.y), Vector3(0.2, 0.5, d)]]:
			box(s[0] + Vector3(0, y0 + h + 0.5, 0), s[1], m)
	if lamp:
		var l := OmniLight3D.new()
		l.light_color = Color(1.0, 0.72, 0.45)
		l.light_energy = 1.6
		l.omni_range = 9.0
		W.add_child(l)
		l.position = Vector3(c.x, y0 + h - 0.45, c.y)
		box(Vector3(c.x, y0 + h - 0.12, c.y), Vector3(0.5, 0.06, 0.5), "lamp", 0.0, false)


static func container(x: float, z: float, level: int, rot: float, col: String) -> void:
	box(Vector3(x, 1.295 + level * 2.59, z), Vector3(6.06, 2.59, 2.44), "container_" + col, rot)


static func sandbags(c: Vector3, length: float, rot: float) -> void:
	var sb := box(c + Vector3(0, 0.5, 0), Vector3(length, 1.0, 0.7), "sandbag", rot)
	sb.get_child(1).queue_free()
	var cm := CapsuleMesh.new()
	cm.radius = 0.17
	cm.height = 0.62
	var n := int(length / 0.58)
	for row in 4:
		for i in n:
			var mi := MeshInstance3D.new()
			mi.mesh = cm
			mi.material_override = W.mat("sandbag")
			sb.add_child(mi)
			var off := 0.29 if row % 2 == 1 else 0.0
			mi.position = Vector3(-length / 2.0 + 0.3 + i * 0.58 + off * (1 if i < n - 1 else 0), -0.38 + row * 0.24, randf_range(-0.04, 0.04))
			mi.rotation = Vector3(randf_range(-0.05, 0.05), randf_range(-0.12, 0.12), PI / 2)
			mi.scale = Vector3(0.75, 1.0, 1.0)


static func crates(c: Vector2) -> void:
	box(Vector3(c.x, 0.55, c.y), Vector3(1.1, 1.1, 1.1), "wood", randf() * 0.4)
	box(Vector3(c.x + 1.25, 0.55, c.y + 0.2), Vector3(1.1, 1.1, 1.1), "wood", randf() * 0.4)
	box(Vector3(c.x + 0.6, 1.65, c.y + 0.1), Vector3(1.1, 1.1, 1.1), "wood", randf() * 0.6)


static func barrels(c: Vector2) -> void:
	cyl(Vector3(c.x, 0.45, c.y), 0.3, 0.9, "barrel_red")
	cyl(Vector3(c.x + 0.65, 0.45, c.y + 0.2), 0.3, 0.9, "barrel_blue")
	cyl(Vector3(c.x + 0.2, 0.45, c.y + 0.75), 0.3, 0.9, "barrel_red")


static func car(c: Vector2, rot: float) -> void:
	var body := box(Vector3(c.x, 0.75, c.y), Vector3(4.3, 0.75, 1.85), "metal", rot)
	var top := box(Vector3(c.x, 1.4, c.y), Vector3(2.3, 0.6, 1.6), "glass", rot)
	top.position += Vector3(-0.3 * cos(rot), 0, 0.3 * sin(rot))
	body.get_child(1).material_override = W.mat("container_grey")
	for p in [Vector2(1.35, 0.85), Vector2(-1.35, 0.85), Vector2(1.35, -0.85), Vector2(-1.35, -0.85)]:
		var wp := Vector2(p.x * cos(rot) + p.y * sin(rot), -p.x * sin(rot) + p.y * cos(rot)) + c
		var wh := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.36
		cm.bottom_radius = 0.36
		cm.height = 0.25
		wh.mesh = cm
		wh.material_override = W.mat("polymer")
		W.add_child(wh)
		wh.position = Vector3(wp.x, 0.36, wp.y)
		wh.rotation = Vector3(PI / 2, rot + PI / 2, 0)


static func pole(x: float, z: float) -> void:
	cyl(Vector3(x, 3.5, z), 0.1, 7.0, "metal")
	box(Vector3(x, 6.9, z + 0.9), Vector3(0.12, 0.12, 1.8), "metal", 0.0, false)
	box(Vector3(x, 6.82, z + 1.7), Vector3(0.35, 0.08, 0.5), "lamp", 0.0, false)


static func build(w: Node3D) -> void:
	W = w
	# ground, road and the far hills
	var g := box(Vector3(0, -0.5, 0), Vector3(600, 1, 600), "ground")
	g.get_child(1).mesh.size = Vector3(600, 1, 600)
	box(Vector3(0, 0.01, 10), Vector3(124, 0.02, 9), "road", 0.0, false)
	for i in 14:
		var a := i / 14.0 * TAU + randf() * 0.2
		var r := randf_range(115, 170)
		var hill := MeshInstance3D.new()
		var sm := SphereMesh.new()
		hill.mesh = sm
		hill.material_override = W.mat("ground")
		W.add_child(hill)
		hill.position = Vector3(cos(a) * r, -4, sin(a) * r)
		hill.scale = Vector3(randf_range(35, 60), randf_range(12, 26), randf_range(35, 60))
	# perimeter wall
	for s in [[Vector3(0, 1.6, -62), 0.0], [Vector3(0, 1.6, 62), 0.0], [Vector3(-62, 1.6, 0), PI / 2], [Vector3(62, 1.6, 0), PI / 2]]:
		box(s[0], Vector3(124.5, 3.2, 0.5), "blocks", s[1])
	# houses
	house(Vector2(-32, 34), 10, 8, 3.4, "plaster", "e", true)
	house(Vector2(30, 36), 9, 8, 3.4, "plaster2", "w")
	house(Vector2(-34, -22), 12, 9, 3.6, "plaster", "s", true)
	house(Vector2(-14, -42), 10, 8, 3.4, "plaster2", "e")
	house(Vector2(16, -46), 9, 8, 3.4, "plaster", "n", true)
	# the two-storey building with stairs up its east side
	house(Vector2(0, -12), 12, 8, 3.2, "plaster2", "s", true, 0.0, false)
	box(Vector3(0, 3.325, -12), Vector3(12.3, 0.25, 8.3), "concrete")
	wall(Vector2(-6.15, -8), Vector2(6.15, -8), 3.45, 2.95, "plaster2", [[3.0, 1.4, 1.0, 2.1], [9.0, 1.4, 1.0, 2.1]])
	wall(Vector2(-6.15, -16), Vector2(6.15, -16), 3.45, 2.95, "plaster2", [[3.0, 1.4, 1.0, 2.1], [9.0, 1.4, 1.0, 2.1]])
	wall(Vector2(6, -8.15), Vector2(6, -15.85), 3.45, 2.95, "plaster2", [[5.65, 1.2, 0.0, 2.2]])
	wall(Vector2(-6, -15.85), Vector2(-6, -8.15), 3.45, 2.95, "plaster2", [[3.85, 1.4, 1.0, 2.1]])
	box(Vector3(0, 6.525, -12), Vector3(12.3, 0.25, 8.3), "concrete")
	var ramp := box(Vector3(6.9, 1.6, -8.6), Vector3(1.2, 0.2, 8.71), "concrete")
	ramp.rotation.x = atan2(3.45, 8.0)
	ramp.get_child(1).visible = false
	for i in 16:
		var y := (i + 0.5) * 3.45 / 16.0
		box(Vector3(6.9, y / 2.0, -4.6 - (i + 0.5) * 0.5), Vector3(1.2, y, 0.5), "concrete", 0.0, false)
	box(Vector3(6.9, 3.325, -13.8), Vector3(1.2, 0.25, 2.4), "concrete")
	box(Vector3(7.55, 4.0, -9.4), Vector3(0.06, 0.06, 11.0), "metal", 0.0, false)
	# container yard
	container(28, -6, 0, 0.0, "red")
	container(28, -6, 1, 0.0, "blue")
	container(36, -6, 0, 0.0, "green")
	container(28, -12, 0, 0.0, "orange")
	container(44, -10, 0, PI / 2, "grey")
	container(44, -10, 1, PI / 2, "red")
	container(32, -22, 0, 0.0, "blue")
	container(40, -24, 0, 0.0, "green")
	container(50, -20, 0, PI / 2, "orange")
	container(24, -27, 0, 0.5, "grey")
	# cover
	for b in [[-20, 6, 0.0], [-12, 15, 0.2], [6, 4, -0.1], [18, 16, 0.0], [-40, 12, PI / 2], [-2, 16, 0.1]]:
		box(Vector3(b[0], 0.45, b[1]), Vector3(3.0, 0.9, 0.55), "concrete", b[2])
	sandbags(Vector3(0, 0, 28), 5.0, 0.0)
	sandbags(Vector3(-8, 0, -30), 4.0, 0.0)
	sandbags(Vector3(12, 0, -28), 4.0, 0.4)
	sandbags(Vector3(-45, 0, 20), 4.0, 1.2)
	sandbags(Vector3(45, 0, 24), 5.0, -0.3)
	for c in [Vector2(-8, 36), Vector2(14, 26), Vector2(-26, 0), Vector2(10, -34), Vector2(-48, -30), Vector2(53, 0)]:
		crates(c)
	for c in [Vector2(-5, 39), Vector2(17, 23), Vector2(-23, 2), Vector2(40, -31)]:
		barrels(c)
	car(Vector2(-30, 9), 0.3)
	car(Vector2(24, 12), -0.2)
	for x in [-40.0, -10.0, 20.0, 50.0]:
		pole(x, 4.0)
	# guard tower
	for p in [Vector2(-51.5, 50.5), Vector2(-48.5, 50.5), Vector2(-51.5, 53.5), Vector2(-48.5, 53.5)]:
		box(Vector3(p.x, 2.0, p.y), Vector3(0.25, 4.0, 0.25), "wood")
		box(Vector3(p.x, 5.2, p.y), Vector3(0.15, 2.2, 0.15), "wood")
	box(Vector3(-50, 4.1, 52), Vector3(3.6, 0.2, 3.6), "wood")
	box(Vector3(-50, 6.4, 52), Vector3(4.0, 0.2, 4.0), "wood")
	# spawns
	w.player_spawns.assign([Vector3(0, 0.6, 50), Vector3(-20, 0.6, 52), Vector3(20, 0.6, 52)])
	w.enemy_spawns.assign([Vector3(-45, 0.6, -45), Vector3(0, 0.6, -52), Vector3(40, 0.6, -48), Vector3(-22, 0.6, -30),
		Vector3(25, 0.6, -38), Vector3(-50, 0.6, -5), Vector3(52, 0.6, -40), Vector3(0, 0.6, -28)])
