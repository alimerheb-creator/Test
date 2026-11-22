extends SceneTree
## Builds the Godot edition's soldier from the web game's (js/trooper.js): "A soldier mercenary with helmet and yellow
## visor" by ShaderMussolini on Sloyd (CC BY 4.0), with the skeleton and skin weights the web game gave it (17 bones)
## and slimmed. Saves res://models/trooper.scn: skel (a Skeleton3D, each bone standing straight where it is) > body
## (the lighter version, skinned to it), and far (the far version, already posed aiming, with its rifle); and the
## uniform's texture, res://models/trooper_tex.jpg (the first run writes it and asks for an import, then run again).
## Run from godot/: godot --headless --path . --script res://tools/build_trooper.gd

## The far figure's rifle: boxes (size, then centre) where it holds it.
const BOXES := [[0.042, 0.095, 0.2, 0, 0.035, 0.19], [0.04, 0.09, 0.3, 0, 0.06, -0.07], [0.03, 0.1, 0.045, 0, -0.03, 0.015],
	[0.03, 0.13, 0.06, 0, -0.04, -0.105], [0.05, 0.05, 0.27, 0, 0.075, -0.32], [0.02, 0.02, 0.26, 0, 0.075, -0.58]]


func _initialize() -> void:
	var s := FileAccess.get_file_as_string(ProjectSettings.globalize_path("res://").path_join("../js/trooper.js").simplify_path())
	var i := s.find("export const TROOPER = ")
	var d: Dictionary = JSON.parse_string(s.substr(s.find("{", i), s.rfind("}") - s.find("{", i) + 1))
	var tex_path := "res://models/trooper_tex.jpg"
	if not FileAccess.file_exists(tex_path):
		var f := FileAccess.open(tex_path, FileAccess.WRITE)
		f.store_buffer(Marshalls.base64_to_raw(String(d["tex"]).get_slice(",", 1)))
		f.close()
		f = FileAccess.open(tex_path + ".import", FileAccess.WRITE)
		f.store_string("[remap]\n\nimporter=\"texture\"\ntype=\"CompressedTexture2D\"\n\n[deps]\n\nsource_file=\"%s\"\n\n[params]\n\ncompress/mode=2\nmipmaps/generate=true\n" % tex_path)
		f.close()
		print("wrote the texture: run godot --headless --path . --import, then this again")
		quit()
		return
	var bin := Marshalls.base64_to_raw(d["bin"])
	var root := Node3D.new()
	root.name = "trooper"
	var skel := Skeleton3D.new()
	skel.name = "skel"
	root.add_child(skel)
	var bones: Array = d["bones"]
	for b in bones:
		var k := skel.add_bone(b["n"])
		var at := _v(b["at"])
		if int(b["p"]) >= 0:
			skel.set_bone_parent(k, int(b["p"]))
			at -= _v(bones[int(b["p"])]["at"])
		skel.set_bone_rest(k, Transform3D(Basis(), at))
	skel.reset_bone_poses()
	var tiers := {}
	for t in d["tiers"]:
		tiers[t["n"]] = t
	var body := MeshInstance3D.new()
	body.name = "body"
	body.mesh = _tier(bin, tiers["mid"], [])
	skel.add_child(body)
	body.skeleton = NodePath("..")
	# the far one, its rifle in its hands (the boxes painted from a dark spot of the texture)
	var g: Array = tiers["far"]["gun"]
	var gun := Transform3D(Basis(Vector3(g[0], g[1], g[2]), Vector3(g[4], g[5], g[6]), Vector3(g[8], g[9], g[10])), Vector3(g[12], g[13], g[14]))
	var far := MeshInstance3D.new()
	far.name = "far"
	far.mesh = _tier(bin, tiers["far"], [gun, Vector2(d["dark"][0], d["dark"][1])])
	root.add_child(far)
	for n in [skel, body, far]:
		n.owner = root
	var ps := PackedScene.new()
	ps.pack(root)
	print("trooper: ", ResourceSaver.save(ps, "res://models/trooper.scn", ResourceSaver.FLAG_COMPRESS), " ", skel.get_bone_count(), " bones")
	quit()


func _v(a: Array) -> Vector3:
	return Vector3(a[0], a[1], a[2])


## One version: Int16 positions over its box lo..hi, Int8 normals, Uint16 texture coordinates (already top-down),
## Uint8 bones and weights (out of 255) when it has them, Uint16 indices, wound the other way round for Godot. `rifle`:
## the far one's rifle frame and the texture spot to paint it from.
func _tier(bin: PackedByteArray, t: Dictionary, rifle: Array) -> ArrayMesh:
	var n: int = t["v"]
	var po: int = t["po"]
	var no: int = t["no"]
	var uo: int = t["uo"]
	var lo: Array = t["lo"]
	var hi: Array = t["hi"]
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var uv := PackedVector2Array()
	for k in n:
		var q := Vector3.ZERO
		for j in 3:
			q[j] = float(lo[j]) + (bin.decode_s16(po + (k * 3 + j) * 2) + 32767) / 65534.0 * (float(hi[j]) - float(lo[j]))
		pos.append(q)
		nor.append(Vector3(bin.decode_s8(no + k * 3), bin.decode_s8(no + k * 3 + 1), bin.decode_s8(no + k * 3 + 2)).normalized())
		uv.append(Vector2(bin.decode_u16(uo + k * 4), bin.decode_u16(uo + k * 4 + 2)) / 65535.0)
	var idx := PackedInt32Array()
	var io: int = t["io"]
	for k in range(0, int(t["i"]), 3):
		idx.append_array([bin.decode_u16(io + k * 2), bin.decode_u16(io + (k + 2) * 2), bin.decode_u16(io + (k + 1) * 2)])
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	if t.has("so"):
		var so: int = t["so"]
		var wo: int = t["wo"]
		var bo := PackedInt32Array()
		var we := PackedFloat32Array()
		for k in n:
			var sum := 0.0
			for j in 4:
				sum += bin[wo + k * 4 + j]
			for j in 4:
				bo.append(bin[so + k * 4 + j])
				we.append(bin[wo + k * 4 + j] / maxf(sum, 1.0))
		a[Mesh.ARRAY_BONES] = bo
		a[Mesh.ARRAY_WEIGHTS] = we
	if not rifle.is_empty():
		var gun: Transform3D = rifle[0]
		for b in BOXES:
			var bm := BoxMesh.new()
			bm.size = Vector3(b[0], b[1], b[2])
			var ba := bm.get_mesh_arrays()
			var base := pos.size()
			for p in (ba[Mesh.ARRAY_VERTEX] as PackedVector3Array):
				pos.append(gun * (p + Vector3(b[3], b[4], b[5])))
			for q in (ba[Mesh.ARRAY_NORMAL] as PackedVector3Array):
				nor.append(gun.basis * q)
				uv.append(rifle[1])
			for k in (ba[Mesh.ARRAY_INDEX] as PackedInt32Array):
				idx.append(base + k)
	a[Mesh.ARRAY_VERTEX] = pos
	a[Mesh.ARRAY_NORMAL] = nor
	a[Mesh.ARRAY_TEX_UV] = uv
	a[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	print("  ", t["n"], ": ", pos.size(), " corners, ", idx.size() / 3, " triangles")
	return mesh
