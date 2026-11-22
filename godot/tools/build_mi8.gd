extends SceneTree
## Builds Onyx's transport helicopter from "Mil Mi-8AMTSh" by 42manako (Sketchfab, CC BY 4.0:
## https://sketchfab.com/3d-models/mil-mi-8amtsh-cde7d5bf30eb470688f268935561996f), changed for the game: scaled to
## its real size, turned to face -z, its main and tail rotors split off to spin, and slimmed from 610,000 triangles to
## a close-up version (about BODY triangles) and a far one, with its texture at 1024 px.
## The source file is godot-assets/mi-8amtsh_42manako.glb (or MI8=path). Saves res://models/mi8.scn (body, far,
## rotor > spin, trotor > tspin, an empty chin > barrel > muzzle at the nose) and res://models/mi8_tex.jpg; the first
## run writes the texture and asks for `godot --headless --path . --import` before a second.
## Run from godot/: godot --headless --path . --script res://tools/build_mi8.gd

const SCALE := 140.0
const HUB := Vector3(0.0061, 0.0, 0.0007)  # the main rotor's mast, in the source's units
const TAIL := Vector3(0.0112, -0.0096, -0.0879)  # the tail rotor's hub
const FLOOR := -0.0438  # the bottom of its wheels
const REST := 1.6  # how high its origin stands over the ground on its wheels
const MAIN := ["object_025", "object_024", "sub0292", "object_026", "object_022", "object_021", "object_027"]
const TAILR := ["object_020", "object_018", "object_017", "object_019"]
const BODY := 30000
const FAR := 4000
const FAR_AT := 160.0

var _o := Vector3.ZERO


func _initialize() -> void:
	var src := OS.get_environment("MI8")
	if src == "":
		src = ProjectSettings.globalize_path("res://").path_join("../godot-assets/mi-8amtsh_42manako.glb").simplify_path()
	var doc := GLTFDocument.new()
	var st := GLTFState.new()
	if doc.append_from_file(src, st) != OK:
		push_error("can't read " + src)
		quit()
		return
	var sc: Node3D = doc.generate_scene(st)
	# the texture, once
	var tex_path := "res://models/mi8_tex.jpg"
	if not FileAccess.file_exists(tex_path):
		var img: Image = st.get_images()[0].get_image()
		img.save_jpg(tex_path, 0.88)
		var f := FileAccess.open(tex_path + ".import", FileAccess.WRITE)
		f.store_string("[remap]\n\nimporter=\"texture\"\ntype=\"CompressedTexture2D\"\n\n[deps]\n\nsource_file=\"%s\"\n\n[params]\n\ncompress/mode=2\nmipmaps/generate=true\n" % tex_path)
		f.close()
		print("wrote the texture: run godot --headless --path . --import, then this again")
		quit()
		return
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = load(tex_path)
	mat.roughness = 0.75
	mat.metallic = 0.12
	# the source's frame to the game's: about the mast, its wheels REST under the origin, scaled, nose to -z
	_o = Vector3(HUB.x, FLOOR + REST / SCALE, HUB.z)
	var groups := {"body": [], "main": [], "tail": []}
	for mi in sc.find_children("*", "MeshInstance3D", true, false):
		var xf: Transform3D = mi.transform
		var n: Node = mi.get_parent()
		while n is Node3D:
			xf = (n as Node3D).transform * xf
			n = n.get_parent()
		var g := "body"
		for k in MAIN:
			if String(mi.name).begins_with(k):
				g = "main"
		for k in TAILR:
			if String(mi.name).begins_with(k):
				g = "tail"
		groups[g].append([(mi as MeshInstance3D).mesh, xf])
	var hub := _p(Vector3(HUB.x, -0.0125, HUB.z))
	var thub := _p(TAIL)
	var root := Node3D.new()
	root.name = "mi8"
	var body_m := _merge(groups["body"], Vector3.ZERO)
	_mi("body", _slim(body_m, BODY, mat), root).visibility_range_end = FAR_AT
	var far := _mi("far", _slim(body_m, FAR, mat), root)
	far.visibility_range_begin = FAR_AT
	var rotor := _node("rotor", root, hub)
	_mi("spin", _slim(_merge(groups["main"], hub), 5000, mat), rotor)
	var trotor := _node("trotor", root, thub)
	_mi("tspin", _slim(_merge(groups["tail"], thub), 1500, mat), trotor)
	var chin := _node("chin", root, Vector3(0, -0.4, -8.0))
	var barrel := _node("barrel", chin, Vector3.ZERO)
	_node("muzzle", barrel, Vector3(0, 0, -0.5))
	root.set_meta("r", 10.0)
	root.set_meta("rest", REST)
	# the B-8 rocket pods on the outer pylons
	root.set_meta("rockets", PackedVector3Array([Vector3(-2.9, -0.9, -1.2), Vector3(2.9, -0.9, -1.2)]))
	root.set_meta("atgms", PackedVector3Array())
	for c in root.get_children():
		_own(c, root)
	var ps := PackedScene.new()
	ps.pack(root)
	print("mi8: ", ResourceSaver.save(ps, "res://models/mi8.scn", ResourceSaver.FLAG_COMPRESS), " hub ", hub, " tail ", thub)
	quit()


## A point of the source in the game's frame.
func _p(v: Vector3) -> Vector3:
	var q := (v - _o) * SCALE
	return Vector3(-q.x, q.y, -q.z)


## One surface of all these meshes, in the game's frame, about `at`.
func _merge(list: Array, at: Vector3) -> Array:
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var uv := PackedVector2Array()
	var idx := PackedInt32Array()
	for e in list:
		var m: Mesh = e[0]
		var xf: Transform3D = e[1]
		var nb := xf.basis.inverse().transposed()
		for s in m.get_surface_count():
			var a := m.surface_get_arrays(s)
			var base := pos.size()
			var vp: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
			var vn: PackedVector3Array = a[Mesh.ARRAY_NORMAL]
			var vu = a[Mesh.ARRAY_TEX_UV]
			for k in vp.size():
				pos.append(_p(xf * vp[k]) - at)
				var nn := (nb * vn[k]).normalized()
				nor.append(Vector3(-nn.x, nn.y, -nn.z))
				uv.append(vu[k] if vu != null else Vector2.ZERO)
			var ix = a[Mesh.ARRAY_INDEX]
			if ix == null:
				for k in vp.size():
					idx.append(base + k)
			else:
				for k in (ix as PackedInt32Array):
					idx.append(base + k)
	var out := []
	out.resize(Mesh.ARRAY_MAX)
	out[Mesh.ARRAY_VERTEX] = pos
	out[Mesh.ARRAY_NORMAL] = nor
	out[Mesh.ARRAY_TEX_UV] = uv
	out[Mesh.ARRAY_INDEX] = idx
	return out


## The arrays cut down to about `tris` triangles (Godot's own simplifier, through its level-of-detail maker), keeping
## only the corners still used.
func _slim(a: Array, tris: int, mat: Material) -> ArrayMesh:
	var im := ImporterMesh.new()
	im.add_surface(Mesh.PRIMITIVE_TRIANGLES, a)
	var idx: PackedInt32Array = a[Mesh.ARRAY_INDEX]
	if idx.size() / 3 > tris:
		im.generate_lods(60.0, 25.0, [])
		var best := idx
		for l in im.get_surface_lod_count(0):
			var li := im.get_surface_lod_indices(0, l)
			best = li
			if li.size() / 3 <= tris:
				break
		idx = best
	# keep the corners still in use, numbered afresh
	var pos: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
	var nor: PackedVector3Array = a[Mesh.ARRAY_NORMAL]
	var uv: PackedVector2Array = a[Mesh.ARRAY_TEX_UV]
	var remap := {}
	var np := PackedVector3Array()
	var nn := PackedVector3Array()
	var nu := PackedVector2Array()
	var ni := PackedInt32Array()
	ni.resize(idx.size())
	for k in idx.size():
		var v: int = idx[k]
		if not remap.has(v):
			remap[v] = np.size()
			np.append(pos[v])
			nn.append(nor[v])
			nu.append(uv[v])
		ni[k] = remap[v]
	var out := []
	out.resize(Mesh.ARRAY_MAX)
	out[Mesh.ARRAY_VERTEX] = np
	out[Mesh.ARRAY_NORMAL] = nn
	out[Mesh.ARRAY_TEX_UV] = nu
	out[Mesh.ARRAY_INDEX] = ni
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, out)
	mesh.surface_set_material(0, mat)
	print("  ", (a[Mesh.ARRAY_INDEX] as PackedInt32Array).size() / 3, " -> ", ni.size() / 3, " triangles, ", np.size(), " corners")
	return mesh


func _mi(n: String, mesh: Mesh, parent: Node) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = n
	mi.mesh = mesh
	parent.add_child(mi)
	return mi


func _node(n: String, parent: Node, at: Vector3) -> Node3D:
	var o := Node3D.new()
	o.name = n
	o.position = at
	parent.add_child(o)
	return o


func _own(n: Node, root: Node) -> void:
	n.owner = root
	for c in n.get_children():
		_own(c, root)
