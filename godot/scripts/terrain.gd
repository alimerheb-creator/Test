extends RefCounted
## KARSA VALLEY's ground: rolling hills, a shallow valley down the middle, mountains round the edge, level ground
## at the flags and headquarters, dirt roads, and woods, bushes and rocks. Built in code when the battle loads.

const D := preload("res://scripts/data.gd")
static var n1: FastNoiseLite
static var n2: FastNoiseLite
static var n3: FastNoiseLite
static var flats := []
static var segs := []


static func setup() -> void:
	n1 = FastNoiseLite.new()
	n1.seed = 7
	n1.frequency = 1.0 / 170.0
	n1.fractal_octaves = 3
	n2 = FastNoiseLite.new()
	n2.seed = 11
	n2.frequency = 1.0 / 35.0
	n2.fractal_octaves = 2
	n3 = FastNoiseLite.new()
	n3.seed = 23
	n3.frequency = 1.0 / 90.0
	flats.clear()
	for f in D.FLAGS:
		flats.append([f["x"], f["z"], f["flat"], _raw(f["x"], f["z"])])
	for h in D.HQS:
		flats.append([h["x"], h["z"], 45.0, _raw(h["x"], h["z"])])
	# level ground under every building (after the flags, so a town's houses sit on its levelled square)
	for b in D.BUILDINGS:
		flats.append([float(b[0]), float(b[1]), maxf(b[2], b[3]) * 3.2 * 0.8 + 6.0, height(b[0], b[1])])
	segs.clear()
	for r in D.ROADS:
		for i in r.size() - 1:
			segs.append([Vector2(r[i][0], r[i][1]), Vector2(r[i + 1][0], r[i + 1][1])])


static func _raw(x: float, z: float) -> float:
	var h := n1.get_noise_2d(x, z) * 11.0 + n2.get_noise_2d(x, z) * 1.3
	h -= exp(-(x * x) / (2.0 * 110.0 * 110.0)) * 3.0
	var d := maxf(absf(x), absf(z))
	h += smoothstep(235.0, 520.0, d) * (55.0 + 45.0 * n1.get_noise_2d(x * 2.3 + 500.0, z * 2.3))
	return h


static func height(x: float, z: float) -> float:
	var h := _raw(x, z)
	for f in flats:
		var r: float = f[2]
		var dx: float = x - f[0]
		var dz: float = z - f[1]
		if absf(dx) > r or absf(dz) > r:
			continue
		var d := sqrt(dx * dx + dz * dz)
		if d < r:
			h = lerpf(h, f[3], 1.0 - smoothstep(r * 0.55, r, d))
	return h


static func near_road(x: float, z: float, r: float) -> bool:
	var p := Vector2(x, z)
	for s in segs:
		if p.distance_to(Geometry2D.get_closest_point_to_segment(p, s[0], s[1])) < r:
			return true
	return false


static func near_flat(x: float, z: float, pad: float) -> bool:
	for f in flats:
		if Vector2(x - f[0], z - f[1]).length() < f[2] * 0.7 + pad:
			return true
	return false


static func _color(x: float, z: float, h: float, ny: float) -> Color:
	var n := n2.get_noise_2d(x * 1.7, z * 1.7) * 0.5 + 0.5
	var c := Color(0.33, 0.37, 0.2).lerp(Color(0.46, 0.44, 0.27), n)
	c = c.lerp(Color(0.47, 0.4, 0.3), clampf(n3.get_noise_2d(x, z) * 1.5, 0.0, 1.0) * 0.6)
	var rock := Color(0.44, 0.42, 0.4).lerp(Color(0.56, 0.54, 0.5), n)
	c = c.lerp(rock, smoothstep(0.16, 0.3, 1.0 - ny))
	return c.lerp(rock, smoothstep(26.0, 45.0, h) * 0.8)


static func _mesh(x0: float, step: float, n: int, hts: PackedFloat32Array, hole: float, roads: bool) -> ArrayMesh:
	var v := PackedVector3Array()
	var nm := PackedVector3Array()
	var c := PackedColorArray()
	v.resize(n * n)
	nm.resize(n * n)
	c.resize(n * n)
	for j in n:
		for i in n:
			var k := j * n + i
			var x := x0 + i * step
			var z := x0 + j * step
			var h := hts[k]
			var nrm := Vector3((hts[k - 1] if i > 0 else h) - (hts[k + 1] if i < n - 1 else h), 2.0 * step,
				(hts[k - n] if j > 0 else h) - (hts[k + n] if j < n - 1 else h)).normalized()
			v[k] = Vector3(x, h, z)
			nm[k] = nrm
			c[k] = _color(x, z, h, nrm.y)
	if roads:
		# paint the dirt roads along each segment
		for s in segs:
			var a: Vector2 = s[0]
			var b: Vector2 = s[1]
			var L := a.distance_to(b)
			for t in int(L / 1.5) + 1:
				var p := a.lerp(b, t * 1.5 / L)
				var ci := int(round((p.x - x0) / step))
				var cj := int(round((p.y - x0) / step))
				for dj in range(-2, 3):
					for di in range(-2, 3):
						var ii := ci + di
						var jj := cj + dj
						if ii < 0 or jj < 0 or ii >= n or jj >= n:
							continue
						var k := jj * n + ii
						var d := Vector2(x0 + ii * step, x0 + jj * step).distance_to(p)
						c[k] = c[k].lerp(Color(0.4, 0.33, 0.25), (1.0 - smoothstep(2.0, 4.5, d)) * 0.85)
	var idx := PackedInt32Array()
	for j in n - 1:
		for i in n - 1:
			if hole > 0.0 and absf(x0 + (i + 0.5) * step) < hole and absf(x0 + (j + 0.5) * step) < hole:
				continue
			var a := j * n + i
			idx.append_array([a, a + 1, a + n, a + 1, a + n + 1, a + n])
	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = v
	arr[Mesh.ARRAY_NORMAL] = nm
	arr[Mesh.ARRAY_COLOR] = c
	arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m


## Joins primitive meshes into one mesh with a colour per part: [[mesh, transform, colour], ...]
static func merge(parts: Array) -> ArrayMesh:
	var v := PackedVector3Array()
	var nm := PackedVector3Array()
	var c := PackedColorArray()
	var idx := PackedInt32Array()
	for p in parts:
		var a: Array = (p[0] as PrimitiveMesh).get_mesh_arrays()
		var t: Transform3D = p[1]
		var col: Color = p[2]
		var base := v.size()
		var pv: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
		var pn: PackedVector3Array = a[Mesh.ARRAY_NORMAL]
		var nb := t.basis.inverse().transposed()
		for i in pv.size():
			v.append(t * pv[i])
			nm.append((nb * pn[i]).normalized())
			c.append(col)
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


static func _cyl(top: float, bottom: float, h: float, seg := 7) -> CylinderMesh:
	var m := CylinderMesh.new()
	m.top_radius = top
	m.bottom_radius = bottom
	m.height = h
	m.radial_segments = seg
	m.rings = 1
	return m


static func _sphere(r: float, seg := 8, rings := 5) -> SphereMesh:
	var m := SphereMesh.new()
	m.radius = r
	m.height = r * 2.0
	m.radial_segments = seg
	m.rings = rings
	return m


static func _at(y: float, s := Vector3.ONE) -> Transform3D:
	return Transform3D(Basis.from_scale(s), Vector3(0, y, 0))


static func build(w: Node3D) -> void:
	setup()
	var mat: StandardMaterial3D = w.detail_mat()
	# the battlefield: 600 m across at 3 m spacing, with collision
	var N := 201
	var hts := PackedFloat32Array()
	hts.resize(N * N)
	for j in N:
		for i in N:
			hts[j * N + i] = height(-300.0 + i * 3.0, -300.0 + j * 3.0)
	var inner := MeshInstance3D.new()
	inner.mesh = _mesh(-300.0, 3.0, N, hts, 0.0, true)
	inner.material_override = mat
	w.add_child(inner)
	var sb := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var hs := HeightMapShape3D.new()
	hs.map_width = N
	hs.map_depth = N
	hs.map_data = hts
	cs.shape = hs
	cs.scale = Vector3(3, 1, 3)
	sb.add_child(cs)
	w.add_child(sb)
	# the land round it out to the horizon, coarser
	var M := 111
	var ho := PackedFloat32Array()
	ho.resize(M * M)
	for j in M:
		for i in M:
			var x := -660.0 + i * 12.0
			var z := -660.0 + j * 12.0
			ho[j * M + i] = height(x, z) - (1.5 if maxf(absf(x), absf(z)) < 306.0 else 0.0)
	var outer := MeshInstance3D.new()
	outer.mesh = _mesh(-660.0, 12.0, M, ho, 294.0, false)
	outer.material_override = mat
	w.add_child(outer)
	_vegetation(w)


static func _vegetation(w: Node3D) -> void:
	var leaf := Color(0.16, 0.24, 0.12)
	var bark := Color(0.28, 0.21, 0.15)
	var conifer := merge([[_cyl(0.12, 0.2, 3.0), _at(1.5), bark], [_cyl(0.0, 1.7, 3.2), _at(3.4), leaf],
		[_cyl(0.0, 1.3, 2.6), _at(4.8), leaf.lightened(0.05)], [_cyl(0.0, 0.85, 2.0), _at(6.0), leaf.lightened(0.1)]])
	var leafy := merge([[_cyl(0.14, 0.22, 3.4), _at(1.7), bark], [_sphere(1.9), _at(4.2, Vector3(1, 0.85, 1)), Color(0.24, 0.3, 0.14)],
		[_sphere(1.3), _at(5.4, Vector3(1, 0.9, 1)), Color(0.27, 0.33, 0.16)]])
	var bush := merge([[_sphere(0.8, 7, 4), _at(0.3, Vector3(1, 0.6, 1)), Color(0.25, 0.3, 0.15)]])
	var rock := merge([[_sphere(1.0, 6, 4), _at(0.0, Vector3(1, 0.6, 1)), Color(0.45, 0.43, 0.4)]])
	var sets := {"conifer": [], "leafy": [], "bush": [], "rock": []}
	var rng := RandomNumberGenerator.new()
	rng.seed = 99
	var tries := 3200 if w.mobile else 6000
	var trunks := StaticBody3D.new()
	w.add_child(trunks)
	for i in tries:
		var x := rng.randf_range(-600.0, 600.0)
		var z := rng.randf_range(-600.0, 600.0)
		var inside := absf(x) < 250.0 and absf(z) < 250.0
		if near_flat(x, z, 8.0) or (inside and near_road(x, z, 6.0)):
			continue
		var forest := n3.get_noise_2d(x * 1.3, z * 1.3)
		var y := height(x, z)
		var t := Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * rng.randf_range(0.8, 1.35)), Vector3(x, y - 0.15, z))
		var kind := ""
		if forest > (0.12 if inside else -0.05):
			kind = "conifer" if (forest > 0.3 or y > 20.0) else "leafy"
		elif inside and rng.randf() < 0.25:
			kind = "bush"
		elif rng.randf() < 0.06:
			kind = "rock"
			t = t.scaled_local(Vector3(rng.randf_range(0.6, 2.2), rng.randf_range(0.5, 1.6), rng.randf_range(0.6, 2.2)))
		if kind == "":
			continue
		sets[kind].append(t)
		if inside and (kind == "conifer" or kind == "leafy"):
			var c := CollisionShape3D.new()
			var sh := CylinderShape3D.new()
			sh.radius = 0.3
			sh.height = 6.0
			c.shape = sh
			c.position = Vector3(x, y + 3.0, z)
			trunks.add_child(c)
	var vmat := StandardMaterial3D.new()
	vmat.vertex_color_use_as_albedo = true
	vmat.vertex_color_is_srgb = true
	vmat.roughness = 0.95
	for kind in sets:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = {"conifer": conifer, "leafy": leafy, "bush": bush, "rock": rock}[kind]
		var list: Array = sets[kind]
		mm.instance_count = list.size()
		for i in list.size():
			mm.set_instance_transform(i, list[i])
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		mi.material_override = vmat
		w.add_child(mi)
