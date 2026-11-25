extends RefCounted
## The battlefield's ground: rolling hills, a shallow valley down the middle, mountains round the edge, level ground
## at the flags and headquarters, dirt roads, and woods, bushes and rocks; on DUST RIDGE sand, dry scrub and palms
## round the oasis. Shaped by the map's LAND settings (data.gd) and built in code when the battle loads. An Aviation
## map is five times bigger: valleys and ridges, crags and snow up high, pine woods, and mountains all round.

const D := preload("res://scripts/data.gd")
static var n1: FastNoiseLite
static var n2: FastNoiseLite
static var n3: FastNoiseLite
static var flats := []
static var segs := []
## Half the footprint (x, z) of each kind of hand-placed cover, to keep plants and soldiers out of it.
const PROP_HALF := {"block": Vector2(5.0, 0.3), "container": Vector2(3.05, 1.25), "barrier": Vector2(1.5, 0.3),
	"sandbags": Vector2(2.0, 2.0), "crate": Vector2(0.8, 0.8), "wreck": Vector2(2.2, 1.0), "ruin": Vector2(3.0, 0.25),
	"dome": Vector2(6.0, 6.0), "wagon": Vector2(7.0, 1.45)}
static var hills := 1.0
static var bumps := 1.0
static var mountains := 1.0
static var valley := 1.0
static var desert := false
static var has_oasis := false
static var oasis := Vector2.ZERO
static var air := false


static func setup() -> void:
	var L: Dictionary = D.LAND
	hills = L["hills"]
	bumps = L["bumps"]
	mountains = L["mountains"]
	valley = L["valley"]
	desert = L["desert"]
	has_oasis = not (L["oasis"] as Array).is_empty()
	if has_oasis:
		oasis = Vector2(L["oasis"][0], L["oasis"][1])
	var sd: int = L["seed"]
	air = D.battle == "air"
	n1 = FastNoiseLite.new()
	n1.seed = 7 + sd
	n1.frequency = 1.0 / 170.0
	n1.fractal_octaves = 3
	n2 = FastNoiseLite.new()
	n2.seed = 11 + sd
	n2.frequency = 1.0 / 35.0
	n2.fractal_octaves = 2
	n3 = FastNoiseLite.new()
	n3.seed = 23 + sd
	n3.frequency = 1.0 / 90.0
	flats.clear()
	segs.clear()
	if air:
		n1.frequency = 1.0 / 1100.0
		n1.fractal_octaves = 4
		n2.frequency = 1.0 / 170.0
		n2.fractal_octaves = 3
		n3.frequency = 1.0 / 750.0
		n3.fractal_octaves = 2
		# each airbase's ground levelled along its runway, all at the height of its middle
		for b in D.BASES:
			var y := _raw(b[0], b[1])
			for k in [-300.0, 0.0, 300.0]:
				flats.append([b[0] - 20.0, b[1] + k, 380.0, y])
		return
	for f in D.FLAGS:
		flats.append([f["x"], f["z"], f["flat"], _raw(f["x"], f["z"])])
	for h in D.HQS:
		flats.append([h["x"], h["z"], 45.0, _raw(h["x"], h["z"])])
	for p in D.PADS:
		flats.append([p[0], p[1], 20.0, height(p[0], p[1])])
	# level ground under every building (after the flags, so a town's houses sit on its levelled square)
	for b in D.BUILDINGS:
		flats.append([float(b[0]), float(b[1]), maxf(b[2], b[3]) * 3.2 * 0.8 + 6.0, height(b[0], b[1])])
	segs.clear()
	for r in D.ROADS:
		for i in r.size() - 1:
			segs.append([Vector2(r[i][0], r[i][1]), Vector2(r[i + 1][0], r[i + 1][1])])


static func _raw(x: float, z: float) -> float:
	if air:
		# broad green hills and valleys, ranges of sharp ridges across parts of it (where the third noise crosses
		# zero), a wide valley down the middle and a ring of high mountains round it all
		var a := n1.get_noise_2d(x, z) * 110.0 * hills + n2.get_noise_2d(x, z) * 12.0 * bumps
		var m := smoothstep(-0.15, 0.25, n1.get_noise_2d(x * 0.6 + 2000.0, z * 0.6 - 700.0))
		var r := 1.0 - absf(n3.get_noise_2d(x, z))
		a += r * r * r * 400.0 * m * mountains
		a -= exp(-(x * x) / (2.0 * 420.0 * 420.0)) * 70.0 * valley
		var e := maxf(absf(x), absf(z))
		return a + smoothstep(1500.0, 2700.0, e) * (480.0 + 300.0 * n1.get_noise_2d(x * 1.7 + 900.0, z * 1.7)) * mountains
	var h := n1.get_noise_2d(x, z) * 11.0 * hills + n2.get_noise_2d(x, z) * 1.3 * bumps
	h -= exp(-(x * x) / (2.0 * 110.0 * 110.0)) * 3.0 * valley
	var d := maxf(absf(x), absf(z))
	h += smoothstep(235.0, 520.0, d) * (55.0 + 45.0 * n1.get_noise_2d(x * 2.3 + 500.0, z * 2.3)) * mountains
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


## Whether (x, z) is at least pad metres clear of every building and every piece of hand-placed cover.
static func clear(x: float, z: float, pad: float) -> bool:
	for b in D.BUILDINGS:
		if absf(x - b[0]) < b[2] * 1.6 + 0.3 + pad and absf(z - b[1]) < b[3] * 1.6 + 0.3 + pad:
			return false
	for p in D.PROPS:
		if p[0] == "track":
			continue  # you can stand on the rails
		var e: Vector2 = PROP_HALF[p[0]]
		if p[3]:
			e = Vector2(e.y, e.x)
		if absf(x - p[1]) < e.x + pad and absf(z - p[2]) < e.y + pad:
			return false
	return true


static func near_flat(x: float, z: float, pad: float) -> bool:
	for f in flats:
		if Vector2(x - f[0], z - f[1]).length() < f[2] * 0.7 + pad:
			return true
	return false


static func _color(x: float, z: float, h: float, ny: float) -> Color:
	var n := n2.get_noise_2d(x * 1.7, z * 1.7) * 0.5 + 0.5
	if air:
		# meadows in the valleys, dark pine woods (where _forest plants them), bare crags on the steep faces and up
		# high, and snow on the tops
		var g := Color(0.3, 0.38, 0.18).lerp(Color(0.42, 0.44, 0.24), n)
		g = g.lerp(Color(0.13, 0.2, 0.1), woods(x, z) * (1.0 - smoothstep(280.0, 340.0, h)))
		var cr := Color(0.3, 0.29, 0.26).lerp(Color(0.4, 0.38, 0.34), n)
		g = g.lerp(cr, maxf(smoothstep(0.3, 0.5, 1.0 - ny), smoothstep(330.0, 420.0, h)))
		return g.lerp(Color(0.88, 0.9, 0.93), smoothstep(520.0, 580.0, h + n * 40.0) * smoothstep(0.35, 0.15, 1.0 - ny))
	if desert:
		# sand, darker in the hollows between the dunes, greener round the oasis, sandstone on the steep faces and
		# up the heights
		var s := Color(0.72, 0.6, 0.42).lerp(Color(0.64, 0.52, 0.36), n)
		s = s.lerp(Color(0.56, 0.45, 0.32), clampf(n3.get_noise_2d(x, z) * 1.5, 0.0, 1.0) * 0.5)
		if has_oasis:
			var od := Vector2(x, z).distance_to(oasis)
			if od < 70.0:
				var g := Color(0.36, 0.38, 0.2).lerp(Color(0.45, 0.44, 0.26), n)
				s = s.lerp(g, (1.0 - smoothstep(25.0, 70.0, od)) * clampf(0.55 + n3.get_noise_2d(x * 2.0, z * 2.0), 0.0, 1.0))
		var sr := Color(0.55, 0.46, 0.36).lerp(Color(0.66, 0.57, 0.45), n)
		s = s.lerp(sr, smoothstep(0.16, 0.3, 1.0 - ny))
		return s.lerp(sr, smoothstep(26.0, 45.0, h) * 0.7)
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
		# paint the roads along each segment: dirt, or a town's asphalt
		var rc := Color(0.5, 0.42, 0.32) if desert else Color(0.4, 0.33, 0.25)
		if D.LAND.get("paved", false):
			rc = Color(0.25, 0.25, 0.26)
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
						c[k] = c[k].lerp(rc, (1.0 - smoothstep(2.0, 4.5, d)) * 0.85)
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


## How thick the pine woods grow at (x, z) on an Aviation map, from 0 to 1.
static func woods(x: float, z: float) -> float:
	return smoothstep(0.02, 0.22, n2.get_noise_2d(x * 0.45 + 300.0, z * 0.45))


static func build(w: Node3D) -> void:
	setup()
	if air:
		_build_air(w)
		return
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


## A date palm: a trunk that leans out near the top and a crown of drooping fronds.
static func _palm() -> Array:
	var bark := Color(0.4, 0.32, 0.23)
	var parts := [[_cyl(0.17, 0.22, 4.0, 7), _at(2.0), bark],
		[_cyl(0.15, 0.17, 3.4, 7), Transform3D(Basis(Vector3.RIGHT, 0.12), Vector3(0, 5.69, 0.2)), bark.darkened(0.08)],
		[_sphere(0.4, 6, 4), Transform3D(Basis(), Vector3(0, 7.3, 0.4)), Color(0.38, 0.27, 0.14)]]
	var top := Vector3(0, 7.4, 0.41)
	for i in 10:
		var b := Basis(Vector3.UP, i * TAU / 10.0 + 0.3) * Basis(Vector3.RIGHT, [0.3, 0.55, 0.8, -0.35][i % 4])
		parts.append([_sphere(1.0, 6, 3), Transform3D(b * Basis.from_scale(Vector3(0.34, 0.06, 1.6)), top + b * Vector3(0, 0, 1.45)),
			Color(0.3, 0.37, 0.16).lightened(0.05 * (i % 3))])
	return parts


static func _vegetation(w: Node3D) -> void:
	var L: Dictionary = D.LAND
	var trees: float = L["trees"]
	var bushes: float = L["bushes"]
	var rocks: float = L["rocks"]
	var leaf := Color(0.16, 0.24, 0.12)
	var bark := Color(0.28, 0.21, 0.15)
	# in the desert, dusty olive scrub and sandstone, as the web game paints them
	var crown := [Color(0.42, 0.4, 0.24), Color(0.46, 0.43, 0.26)] if desert else [Color(0.24, 0.3, 0.14), Color(0.27, 0.33, 0.16)]
	var shrub := Color(0.47, 0.42, 0.26) if desert else Color(0.25, 0.3, 0.15)
	var stone := Color(0.6, 0.5, 0.39) if desert else Color(0.45, 0.43, 0.4)
	var conifer := merge([[_cyl(0.12, 0.2, 3.0), _at(1.5), bark], [_cyl(0.0, 1.7, 3.2), _at(3.4), leaf],
		[_cyl(0.0, 1.3, 2.6), _at(4.8), leaf.lightened(0.05)], [_cyl(0.0, 0.85, 2.0), _at(6.0), leaf.lightened(0.1)]])
	var leafy := merge([[_cyl(0.14, 0.22, 3.4), _at(1.7), bark], [_sphere(1.9), _at(4.2, Vector3(1, 0.85, 1)), crown[0]],
		[_sphere(1.3), _at(5.4, Vector3(1, 0.9, 1)), crown[1]]])
	var bush := merge([[_sphere(0.8, 7, 4), _at(0.3, Vector3(1, 0.6, 1)), shrub]])
	var rock := merge([[_sphere(1.0, 6, 4), _at(0.0, Vector3(1, 0.6, 1)), stone]])
	var sets := {"conifer": [], "leafy": [], "bush": [], "rock": [], "palm": []}
	var rng := RandomNumberGenerator.new()
	rng.seed = 99
	var tries := 3200 if w.mobile else 6000
	var trunks := StaticBody3D.new()
	w.add_child(trunks)
	for i in tries:
		var x := rng.randf_range(-600.0, 600.0)
		var z := rng.randf_range(-600.0, 600.0)
		var inside := absf(x) < 250.0 and absf(z) < 250.0
		if near_flat(x, z, 8.0) or (inside and (near_road(x, z, 6.0) or not clear(x, z, 1.5))):
			continue
		var forest := n3.get_noise_2d(x * 1.3, z * 1.3)
		var y := height(x, z)
		var t := Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * rng.randf_range(0.8, 1.35)), Vector3(x, y - 0.15, z))
		var kind := ""
		if forest > (0.12 if inside else -0.05) and (trees >= 1.0 or rng.randf() < trees):
			kind = "leafy" if desert else ("conifer" if (forest > 0.3 or y > 20.0) else "leafy")
		elif inside and rng.randf() < 0.25 * bushes:
			kind = "bush"
		elif rng.randf() < 0.06 * rocks:
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
	# palms round the oasis, in among its compound (so not kept off its level ground like the rest)
	var n := 0
	for i in (600 if has_oasis else 0):
		if n >= 36:
			break
		var a := rng.randf() * TAU
		var r := rng.randf_range(9.0, 62.0)
		var x := oasis.x + cos(a) * r
		var z := oasis.y + sin(a) * r
		if near_road(x, z, 5.0) or not clear(x, z, 2.0):
			continue
		var y := height(x, z)
		sets["palm"].append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * rng.randf_range(0.85, 1.2)), Vector3(x, y - 0.15, z)))
		var c := CollisionShape3D.new()
		var sh := CylinderShape3D.new()
		sh.radius = 0.3
		sh.height = 7.0
		c.shape = sh
		c.position = Vector3(x, y + 3.5, z)
		trunks.add_child(c)
		n += 1
	var vmat := StandardMaterial3D.new()
	vmat.vertex_color_use_as_albedo = true
	vmat.vertex_color_is_srgb = true
	vmat.roughness = 0.95
	var meshes := {"conifer": conifer, "leafy": leafy, "bush": bush, "rock": rock}
	if has_oasis:
		meshes["palm"] = merge(_palm())
	for kind in sets:
		if sets[kind].is_empty():
			continue
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = meshes[kind]
		var list: Array = sets[kind]
		mm.instance_count = list.size()
		for i in list.size():
			mm.set_instance_transform(i, list[i])
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		mi.material_override = vmat
		w.add_child(mi)


## An Aviation map: 4 km across at 16 m spacing (with collision, for bullets and missiles), the mountains round it out
## to 6.4 km at 80 m, and the pine woods.
static func _build_air(w: Node3D) -> void:
	var mat: StandardMaterial3D = w.detail_mat()
	var N := 257
	var hts := PackedFloat32Array()
	hts.resize(N * N)
	for j in N:
		for i in N:
			hts[j * N + i] = height(-2048.0 + i * 16.0, -2048.0 + j * 16.0)
	var inner := MeshInstance3D.new()
	inner.mesh = _mesh(-2048.0, 16.0, N, hts, 0.0, false)
	inner.material_override = mat
	w.add_child(inner)
	var sb := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var hs := HeightMapShape3D.new()
	hs.map_width = N
	hs.map_depth = N
	hs.map_data = hts
	cs.shape = hs
	cs.scale = Vector3(16, 1, 16)
	sb.add_child(cs)
	w.add_child(sb)
	var M := 161
	var ho := PackedFloat32Array()
	ho.resize(M * M)
	for j in M:
		for i in M:
			var x := -6400.0 + i * 80.0
			var z := -6400.0 + j * 80.0
			ho[j * M + i] = height(x, z) - (6.0 if maxf(absf(x), absf(z)) < 2060.0 else 0.0)
	var outer := MeshInstance3D.new()
	outer.mesh = _mesh(-6400.0, 80.0, M, ho, 2040.0, false)
	outer.material_override = mat
	w.add_child(outer)
	_forest(w)


## Pines in the woods' patches, off the crags and below the tree line, kept off the airbases; seen out to 2.5 km.
static func _forest(w: Node3D) -> void:
	var bark := Color(0.26, 0.2, 0.15)
	var leaf := Color(0.12, 0.19, 0.1)
	var pine := merge([[_cyl(0.25, 0.4, 4.0, 5), _at(2.0), bark], [_cyl(0.0, 3.0, 7.0, 6), _at(6.5), leaf],
		[_cyl(0.0, 2.2, 5.0, 6), _at(9.6), leaf.lightened(0.06)]])
	var rng := RandomNumberGenerator.new()
	rng.seed = 99
	var want := 2500 if w.mobile else 6000
	var list := []
	for i in want * 6:
		if list.size() >= want:
			break
		var x := rng.randf_range(-2000.0, 2000.0)
		var z := rng.randf_range(-2000.0, 2000.0)
		if rng.randf() > woods(x, z):
			continue
		var y := height(x, z)
		if y > 320.0 or near_flat(x, z, 30.0) or absf(height(x + 6.0, z) - height(x - 6.0, z)) > 7.0:
			continue
		list.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * rng.randf_range(0.9, 1.6)), Vector3(x, y - 0.3, z)))
	var vmat := StandardMaterial3D.new()
	vmat.vertex_color_use_as_albedo = true
	vmat.vertex_color_is_srgb = true
	vmat.roughness = 0.95
	# in 500 m squares, each drawn (and left out beyond its range or out of sight) on its own
	var cells := {}
	for t in list:
		var k := Vector2i(floori((t.origin.x + 2000.0) / 500.0), floori((t.origin.z + 2000.0) / 500.0))
		if not cells.has(k):
			cells[k] = []
		cells[k].append(t)
	for k in cells:
		var at := Vector3(-1750.0 + k.x * 500.0, 0.0, -1750.0 + k.y * 500.0)
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = pine
		mm.instance_count = cells[k].size()
		for i in cells[k].size():
			var t: Transform3D = cells[k][i]
			mm.set_instance_transform(i, Transform3D(t.basis, t.origin - at))
		var mi := MultiMeshInstance3D.new()
		mi.multimesh = mm
		mi.material_override = vmat
		mi.visibility_range_end = 1600.0 if w.mobile else 2600.0
		mi.visibility_range_end_margin = 200.0
		mi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
		w.add_child(mi)
		mi.position = at
