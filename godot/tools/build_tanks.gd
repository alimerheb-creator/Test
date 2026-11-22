extends SceneTree
## Builds the Godot edition's tanks from the web game's packed models (js/abrams.js, js/t90.js): the lighter close-up
## version (@1), painted for its side (the body in the team's tank colour, the rest in its own) with mud low down.
## Saves res://models/abrams.scn and res://models/t90.scn: body > hull (with the wheels), turret on its ring,
## barrel on its trunnion and the muzzle; one track link (hidden) that the game runs round each track's path.
## Run from godot/: godot --headless --path . --script res://tools/build_tanks.gd

const PAL := {"steel": Color8(0x5c, 0x5c, 0x58), "track": Color8(0x2a, 0x29, 0x27), "lamp": Color8(0x8a, 0x1a, 0x14),
	"gun": Color8(0x1d, 0x1d, 0x1c), "brass": Color8(0x8a, 0x6a, 0x20), "olive": Color8(0x3a, 0x3a, 0x26),
	"green": Color8(0x34, 0x45, 0x2a), "black": Color8(0x14, 0x14, 0x14), "scorch": Color8(0x12, 0x11, 0x10),
	"rust": Color8(0x5a, 0x3a, 0x1c)}
const MUD := Color(0.33, 0.27, 0.19)


func _initialize() -> void:
	var dir := ProjectSettings.globalize_path("res://").path_join("../js").simplify_path()
	_build("abrams", dir.path_join("abrams.js"), Color8(0x5d, 0x64, 0x43))
	_build("t90", dir.path_join("t90.js"), Color8(0x4f, 0x52, 0x57))
	quit()


func _build(id: String, path: String, body: Color) -> void:
	var s := FileAccess.get_file_as_string(path)
	var d: Dictionary = JSON.parse_string(s.substr(s.find("{"), s.rfind("}") - s.find("{") + 1))
	var bin := Marshalls.base64_to_raw(d["bin"])
	var cols := []
	for m in d["mats"]:
		cols.append(body if m == "body" else (body * 0.8 if m == "detail" else PAL.get(m, PAL["steel"])))
	var parts := {}
	for h in d["parts"]:
		parts[h["n"]] = h
	var tp := _v(d["turret"])
	var bp := _v(d["trunnion"])
	var root := Node3D.new()
	root.name = id
	var bodyn := Node3D.new()
	bodyn.name = "body"
	root.add_child(bodyn)
	var hull := _mi("hull", [_arrays(bin, d, parts["hull@1"], cols, 0.0), _arrays(bin, d, parts["gear@1"], cols, 0.0)])
	bodyn.add_child(hull)
	var tur := _mi("turret", [_arrays(bin, d, parts["turret@1"], cols, tp.y)])
	bodyn.add_child(tur)
	tur.position = tp
	var bar := _mi("barrel", [_arrays(bin, d, parts["barrel@1"], cols, tp.y + bp.y)])
	tur.add_child(bar)
	bar.position = bp
	var mz := Node3D.new()
	mz.name = "muzzle"
	bar.add_child(mz)
	mz.position = Vector3(0, 0, -float(d["muzzle"]))
	var link := _mi("link", [_arrays(bin, d, parts["link@1"], cols, 0.2)])
	link.visible = false
	bodyn.add_child(link)
	for n in [bodyn, hull, tur, bar, mz, link]:
		n.owner = root
	var tr: Dictionary = d["gear"]["track"]
	var pts := PackedVector2Array()
	for p in tr["path"]:
		pts.append(Vector2(p[0], p[1]))
	root.set_meta("track_x", PackedFloat32Array(tr["x"]))
	root.set_meta("track_path", pts)
	root.set_meta("track_n", int(tr["n"]))
	root.set_meta("track_s0", float(tr["s0"]))
	var ps := PackedScene.new()
	ps.pack(root)
	print(id, ": ", ResourceSaver.save(ps, "res://models/%s.scn" % id, ResourceSaver.FLAG_COMPRESS))


func _v(a: Array) -> Vector3:
	return Vector3(a[0], a[1], a[2])


func _mi(n: String, surfaces: Array) -> MeshInstance3D:
	var mesh := ArrayMesh.new()
	for a in surfaces:
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	var mi := MeshInstance3D.new()
	mi.name = n
	mi.mesh = mesh
	return mi


## One packed part: Int16 positions over the box lo..hi, Int8 normals, a material number per vertex, Uint16 (or
## Uint32) indices, wound the other way round for Godot. y0: how high its frame sits, for the mud.
func _arrays(bin: PackedByteArray, d: Dictionary, h: Dictionary, cols: Array, y0: float) -> Array:
	var n: int = h["v"]
	var po: int = h["po"]
	var no: int = h["no"]
	var mo: int = h["mo"]
	var io: int = h["io"]
	var lo: Array = d["lo"]
	var hi: Array = d["hi"]
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	var col := PackedColorArray()
	pos.resize(n)
	nor.resize(n)
	col.resize(n)
	for k in n:
		var q := Vector3.ZERO
		for j in 3:
			q[j] = float(lo[j]) + (bin.decode_s16(po + (k * 3 + j) * 2) + 32767) / 65534.0 * (float(hi[j]) - float(lo[j]))
		pos[k] = q
		nor[k] = Vector3(bin.decode_s8(no + k * 3), bin.decode_s8(no + k * 3 + 1), bin.decode_s8(no + k * 3 + 2)).normalized()
		var c: Color = cols[bin[mo + k]]
		var y := q.y + y0
		if y < 0.9:
			c = c.lerp(MUD, (1.0 - maxf(y, 0.0) / 0.9) * 0.45)
		col[k] = c
	var ni: int = h["i"]
	var idx := PackedInt32Array()
	idx.resize(ni)
	var big: bool = h.get("i32", false)
	for k in ni:
		idx[k] = bin.decode_u32(io + k * 4) if big else bin.decode_u16(io + k * 2)
	for k in range(0, ni, 3):
		var t := idx[k + 1]
		idx[k + 1] = idx[k + 2]
		idx[k + 2] = t
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = pos
	a[Mesh.ARRAY_NORMAL] = nor
	a[Mesh.ARRAY_COLOR] = col
	a[Mesh.ARRAY_INDEX] = idx
	return a
