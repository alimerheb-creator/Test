extends SceneTree
## Builds the Godot edition's bombers from the web game's Bombers mod: Vanguard's B-1B Lancer and Onyx's Tu-160
## Blackjack. The web game builds them in code, so tools/export_bombers.js runs that code in a browser and writes what
## it builds (every part's shape, material and place, and the moving parts) to a JSON file; this makes scenes of it.
## Saves res://models/b1b.scn and res://models/tu160.scn: body (the airframe, with its crew); the moving parts, each a
## node turned about its own axes: swing_L/swing_R (the outer wings: about y, meta "side" and "max", how far back they
## sweep), door0..3 (the bomb bay doors: about z, meta "side"), stab0/stab1 (the all-moving tailplanes: about x) and
## cs0.. (the flaps, ailerons and rudder: about x, meta "ch" the stick they follow, roll, pitch, yaw or flap, and "k"
## how far and which way). Its metadata: nozzles ([x, y, z, radius] each), bombs and cruise (where in the bay each
## bomb and cruise missile hangs), cam ([distance, height] of the view behind it).
## Run from godot/: godot --headless --path . --script res://tools/build_bombers.gd -- --json=<export_bombers.js output>

## The web game's nozzles for each: [x, y, z, radius, length]; the flame starts at the nozzle's end.
const NOZZLES := {"b1b": [[2.35, -1.06, 8.4, 0.46, 0.95], [3.45, -1.06, 8.4, 0.46, 0.95], [-2.35, -1.06, 8.4, 0.46, 0.95], [-3.45, -1.06, 8.4, 0.46, 0.95]],
	"tu160": [[2.95, -1.35, 11.8, 0.55, 1.0], [4.25, -1.35, 11.8, 0.55, 1.0], [-2.95, -1.35, 11.8, 0.55, 1.0], [-4.25, -1.35, 11.8, 0.55, 1.0]]}

var _mats := {}


func _initialize() -> void:
	var path := ""
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--json="):
			path = a.substr(7)
	var data = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not data is Dictionary:
		push_error("no export at '%s': run tools/export_bombers.js first" % path)
		quit(1)
		return
	for id in ["b1b", "tu160"]:
		_save(_build(id, data[id]))
	quit()


func _build(id: String, d: Dictionary) -> Node3D:
	var nodes: Array = d["nodes"]
	var n := nodes.size()
	# each part's frame: the moving part it rides on (or the airframe), and where it is in that part's frame
	var own := PackedInt32Array()
	var rel: Array[Transform3D] = []
	own.resize(n)
	rel.resize(n)
	var made := {-1: null}
	var root := Node3D.new()
	root.name = id
	var counts := {}
	var meshes := {}  # owner -> [[node, transform], ...]
	for i in n:
		var nd: Dictionary = nodes[i]
		var par: int = nd["parent"]
		var q: Array = nd["quat"]
		var L := Transform3D(Basis(Quaternion(q[0], q[1], q[2], q[3])).scaled(_v(nd["scale"])), _v(nd["pos"]))
		var up := Transform3D() if par < 0 else rel[par]
		var po: int = -1 if par < 0 else own[par]
		if nd["role"] != null:
			# a moving part: a node of its own, placed in its owner's frame
			own[i] = i
			rel[i] = Transform3D()
			var r: Array = nd["role"]
			var kind: String = r[0]
			var node := Node3D.new()
			var c: int = counts.get(kind, 0)
			counts[kind] = c + 1
			match kind:
				"swing":
					node.name = "swing_L" if float(r[1]) < 0.0 else "swing_R"
					node.set_meta("side", float(r[1]))
					node.set_meta("max", float(r[2]))
				"door":
					node.name = "door%d" % c
					node.set_meta("side", float(r[1]))
				"stab":
					node.name = "stab%d" % c
				"cs":
					node.name = "cs%d" % c
					node.set_meta("ch", String(r[1]))
					node.set_meta("k", float(r[2]))
			node.transform = up * L
			var parent: Node3D = root if made[po] == null else made[po]
			parent.add_child(node)
			node.owner = root
			made[i] = node
		else:
			own[i] = po
			rel[i] = up * L
		if nd.has("pos3"):
			if not meshes.has(own[i]):
				meshes[own[i]] = []
			meshes[own[i]].append([nd, rel[i]])
	for o in meshes:
		var mi := MeshInstance3D.new()
		mi.name = "body" if o == -1 else "mesh"
		mi.mesh = _mesh(meshes[o], o == -1)
		var parent: Node3D = root if made[o] == null else made[o]
		parent.add_child(mi)
		mi.owner = root
		if o != -1:
			mi.visibility_range_end = 900.0
			mi.visibility_range_end_margin = 50.0
	var noz := []
	for z in NOZZLES[id]:
		noz.append([z[0], z[1], z[2] + z[4] * 0.95, z[3] * 0.85])
	root.set_meta("nozzles", noz)
	for w in d["weapons"]:
		var pts := []
		for p in w["points"]:
			pts.append(_v(p))
		root.set_meta("bombs" if w["kind"] == "bomb" else "cruise", pts)
	root.set_meta("cam", [float(d["cam"]["dist"]), float(d["cam"]["height"])])
	return root


## The parts (each [its data, its place]) in one mesh: a surface per material, faces turned to face out as Godot draws
## them, the texture coordinates upside down for Godot's, the roundels lifted a hair off the skin.
func _mesh(parts: Array, lods: bool) -> Mesh:
	var groups := {}
	for p in parts:
		var nd: Dictionary = p[0]
		var key := "%s#%06x" % [nd["mat"], int(nd["color"])] if nd["mat"] == "other" else String(nd["mat"])
		if not groups.has(key):
			groups[key] = []
		groups[key].append(p)
	var im := ImporterMesh.new()
	for key in groups:
		var pos := PackedVector3Array()
		var nor := PackedVector3Array()
		var uv := PackedVector2Array()
		var col := PackedColorArray()
		var idx := PackedInt32Array()
		var lift := 0.012 if String(key).begins_with("decal") else 0.0
		for p in groups[key]:
			var nd: Dictionary = p[0]
			var t: Transform3D = p[1]
			var nb := t.basis.inverse().transposed()
			var base := pos.size()
			var P: Array = nd["pos3"]
			var N: Array = nd["nor"]
			var cnt := P.size() / 3
			for k in cnt:
				var nn := (nb * Vector3(N[k * 3], N[k * 3 + 1], N[k * 3 + 2])).normalized()
				pos.append(t * Vector3(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]) + nn * lift)
				nor.append(nn)
			if nd.has("uv"):
				var U: Array = nd["uv"]
				for k in cnt:
					uv.append(Vector2(U[k * 2], 1.0 - U[k * 2 + 1]))
			else:
				for k in cnt:
					uv.append(Vector2.ZERO)
			if nd.has("col"):
				var C: Array = nd["col"]
				for k in cnt:
					col.append(Color(C[k * 3], C[k * 3 + 1], C[k * 3 + 2]))
			else:
				for k in cnt:
					col.append(Color.WHITE)
			var I = nd["idx"]
			if I == null:
				I = range(cnt)
			for k in range(0, I.size(), 3):
				idx.append(base + int(I[k]))
				idx.append(base + int(I[k + 2]))
				idx.append(base + int(I[k + 1]))
		var a := []
		a.resize(Mesh.ARRAY_MAX)
		a[Mesh.ARRAY_VERTEX] = pos
		a[Mesh.ARRAY_NORMAL] = nor
		a[Mesh.ARRAY_TEX_UV] = uv
		a[Mesh.ARRAY_INDEX] = idx
		var m := _mat(key)
		if m.vertex_color_use_as_albedo:
			a[Mesh.ARRAY_COLOR] = col
		im.add_surface(Mesh.PRIMITIVE_TRIANGLES, a, [], {}, m)
	if lods:
		im.generate_lods(25.0, 60.0, [])
	return im.get_mesh()


## The web game's aircraft materials, as Godot's: the skin in its vertex colours over the panel lines; engine parts
## and the like drawn from both sides as there (an open end or a duct shows its inside wall); glass see-through;
## the navigation lights lit; the roundels (Vanguard's rings, Onyx's red star) cut out of their pictures.
func _mat(key: String) -> StandardMaterial3D:
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	var spec := {"skin": [0xffffff, 0.58, 0.12], "dark": [0x2a2c2f, 0.62, 0.2], "black": [0x141516, 0.7, 0.15],
		"hole": [0x141516, 0.7, 0.15], "metal": [0x9a9da2, 0.32, 0.6], "burnt": [0x4d4440, 0.45, 0.5],
		"glass": [0x23323d, 0.04, 0.4], "frame": [0x3a3c3f, 0.5, 0.3], "white": [0xe6e6e2, 0.55, 0.1],
		"olive": [0x5b5d3e, 0.7, 0.0], "rubber": [0x1a1a1a, 0.9, 0.0], "yellow": [0xd8b42a, 0.6, 0.0],
		"red": [0xa0221a, 0.6, 0.0], "pilot": [0x4a4c3c, 0.8, 0.0], "visor": [0x15130f, 0.08, 0.6],
		"helmet": [0x8e918d, 0.45, 0.1], "mask": [0x26282a, 0.75, 0.0], "seat": [0x33363a, 0.8, 0.1],
		"handle": [0xd8b42a, 0.55, 0.0], "cockpit": [0x3c4146, 0.9, 0.0], "canopy": [0x9cb7c9, 0.03, 0.25],
		"canopyGold": [0xc9ab62, 0.03, 0.45], "hud": [0xa8ffc8, 0.05, 0.2]}
	var k := key.get_slice("#", 0)
	if spec.has(k):
		var s: Array = spec[k]
		m.albedo_color = Color.hex(int(s[0]) << 8 | 0xff)
		m.roughness = s[1]
		m.metallic = s[2]
	elif k.begins_with("nav"):
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.albedo_color = {"navR": Color(1, 0.19, 0.13), "navG": Color(0.19, 1, 0.38), "navW": Color(1, 0.96, 0.88)}.get(k, Color.WHITE)
	elif k.begins_with("decal"):
		m.albedo_texture = _roundel(int(k.substr(5)))
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
		m.alpha_scissor_threshold = 0.5
		m.roughness = 0.6
	else:
		m.albedo_color = Color.hex(key.get_slice("#", 1).hex_to_int() << 8 | 0xff)
		m.roughness = 0.7
	if k == "skin":
		m.albedo_texture = load("res://models/panel.png")
		m.vertex_color_use_as_albedo = true
	if k in ["skin", "dark", "black", "hole", "metal", "burnt"]:
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
	if k in ["glass", "canopy", "canopyGold", "hud"]:
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.albedo_color.a = 0.6 if k == "glass" else 0.32
	_mats[key] = m
	return m


## The national marking, drawn as the web game draws it: Vanguard's roundel in rings, Onyx's red star edged in white.
func _roundel(team: int) -> ImageTexture:
	var img := Image.create(128, 128, false, Image.FORMAT_RGBA8)
	for y in 128:
		for x in 128:
			var p := Vector2(x + 0.5, y + 0.5)
			var c := Color(0, 0, 0, 0)
			if team == 1:
				for s in [[63.0, Color("9e1119")], [57.0, Color("f1eee6")], [46.0, Color("c8102e")]]:
					if _in_star(p, s[0]):
						c = s[1]
			else:
				var r := p.distance_to(Vector2(64, 64))
				for s in [[62.0, Color("e9e6dc")], [54.0, Color("3fa9f5")], [36.0, Color("e9e6dc")], [20.0, Color("1d3d66")]]:
					if r < s[0]:
						c = s[1]
			img.set_pixel(x, y, c)
	img.generate_mipmaps()
	return ImageTexture.create_from_image(img)


func _in_star(p: Vector2, r: float) -> bool:
	var pts := PackedVector2Array()
	for i in 10:
		var a := -PI / 2.0 + i * PI / 5.0
		var rr := r * 0.4 if i % 2 == 1 else r
		pts.append(Vector2(64.0 + cos(a) * rr, 68.0 + sin(a) * rr))
	return Geometry2D.is_point_in_polygon(p, pts)


func _save(root: Node3D) -> void:
	var ps := PackedScene.new()
	ps.pack(root)
	print(root.name, ": ", ResourceSaver.save(ps, "res://models/%s.scn" % root.name, ResourceSaver.FLAG_COMPRESS))


func _v(a: Array) -> Vector3:
	return Vector3(a[0], a[1], a[2])
