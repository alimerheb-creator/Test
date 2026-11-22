extends SceneTree
## Builds the Godot edition's attack helicopters and Vanguard's transport from the web game's packed models
## (mods/helicopters.sfmod.json):
## Vanguard's AH-64E Apache ("Apache AH-64D" by SalamSadeq, CGTrader, Royalty Free License; its own two textures,
## tinted olive drab) and Onyx's Mi-24V Hind ("Mi-24" by Chris Kuhn, BlendSwap, CC BY 3.0; painted in code, olive
## and tan over a blue-grey belly). Each keeps the lighter close-up version (@1) up to FAR metres, the simple one (@2)
## beyond. And Vanguard's UH-60M Black Hawk ("UH-60 Blackhawk" from done3d.com), its textures and seats as in the
## web game (one version).
## Saves res://models/ah64.scn and res://models/mi24.scn: body (with its crew) and far; rotor > spin (the head and
## blades about the hub; it turns about y); trotor > tspin (the tail rotor; it turns about x); chin (turns) > barrel
## (elevates) > the gun and its muzzle; the Apache's Hellfires (atgm0..7) and rocket pods. Its metadata: the main
## rotor's radius (r), how high it stands on its gear (rest), and where its rockets and missiles leave from.
## The Apache's textures go to res://models/ah64_tex1.jpg and ah64_tex2.jpg on the first run, which then asks for
## `godot --headless --path . --import` before a second run.
## Run from godot/: godot --headless --path . --script res://tools/build_helis.gd

const FAR := 150.0
const TINT := Color8(0x7d, 0x84, 0x66)
const MI24 := {"black": Color8(0x17, 0x17, 0x16), "dark": Color8(0x2f, 0x32, 0x2b), "metal": Color8(0x6c, 0x6e, 0x6a),
	"rubber": Color8(0x1c, 0x1c, 0x1b), "red": Color8(0x9a, 0x1c, 0x16), "white": Color8(0xc4, 0xc6, 0xbc),
	"cockpit": Color8(0x2b, 0x2f, 0x30)}
const TOP := Color8(0x6b, 0x70, 0x4c)
const BELLY := Color8(0x9f, 0xb2, 0xbf)
const CAMO := Color8(0x8c, 0x7a, 0x52)

var _paint: StandardMaterial3D
var _glass: StandardMaterial3D
var _suit: StandardMaterial3D
var _helmet: StandardMaterial3D


func _initialize() -> void:
	var src := FileAccess.get_file_as_string(ProjectSettings.globalize_path("res://").path_join("../mods/helicopters.sfmod.json").simplify_path())
	var lines: Array = (JSON.parse_string(src) as Dictionary)["script"]
	_paint = StandardMaterial3D.new()
	_paint.vertex_color_use_as_albedo = true
	_paint.vertex_color_is_srgb = true
	_paint.roughness = 0.82
	_glass = StandardMaterial3D.new()
	_glass.albedo_color = Color(0.16, 0.22, 0.26, 0.55)
	_glass.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_glass.roughness = 0.05
	_glass.metallic = 0.6
	_suit = _flat(Color8(0x4a, 0x4f, 0x3c))
	_helmet = _flat(Color8(0x3b, 0x3f, 0x34))
	# the textures: written out once, then imported by Godot
	var tex: Dictionary = _const(lines, "AH64_TEX")
	var utex: Dictionary = _const(lines, "UH60_TEX")
	var fresh := false
	for k in ["tex1", "tex2"]:
		fresh = _tex_file("res://models/ah64_%s.jpg" % k, String(tex[k])) or fresh
	for k in utex:
		if (utex[k] as Dictionary).has("t"):
			fresh = _tex_file("res://models/uh60_%s.png" % k, String(utex[k]["t"])) or fresh
	if fresh:
		print("wrote the textures: run godot --headless --path . --import, then this again")
		quit()
		return
	var mats := {"glass": _glass}
	for k in ["tex1", "tex2"]:
		var m := StandardMaterial3D.new()
		m.albedo_texture = load("res://models/ah64_%s.jpg" % k)
		m.albedo_color = TINT
		m.roughness = 0.78
		m.metallic = 0.1
		mats[k] = m
	_apache(_const(lines, "AH64_MESH"), mats)
	_hind(_const(lines, "MI24_MESH"))
	_blackhawk(_const(lines, "UH60_MESH"), utex)
	quit()


## Writes a texture from its data URL (and asks for it to be imported, compressed and with mipmaps) unless it's there.
func _tex_file(path: String, url: String) -> bool:
	if FileAccess.file_exists(path):
		return false
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_buffer(Marshalls.base64_to_raw(url.get_slice(",", 1)))
	f.close()
	f = FileAccess.open(path + ".import", FileAccess.WRITE)
	f.store_string("[remap]\n\nimporter=\"texture\"\ntype=\"CompressedTexture2D\"\n\n[deps]\n\nsource_file=\"%s\"\n\n[params]\n\ncompress/mode=2\nmipmaps/generate=true\n" % path)
	f.close()
	return true


## The Black Hawk: its hull, doors, engines and cabin seats (one seat model set at each place), the rotors about
## their hubs, the two pilots.
func _blackhawk(d: Dictionary, tex: Dictionary) -> void:
	var mats := {"06___Default": _glass}
	var rough := {"rotorhead": 0.45, "lamp": 0.4, "black": 0.6, "wheel": 0.92, "rotor": 0.7, "chair": 0.9}
	var metal := {"rotorhead": 0.6, "black": 0.2, "wheel": 0.0}
	for m in ["mainhull", "main", "door", "frontdoor", "tailwing", "engine", "rotor", "chair", "black", "wheel", "rotorhead", "lamp", "jammer"]:
		var key: String = "dif" if m == "main" else (m if m == "black" else m + "_dif")
		var e: Dictionary = tex[key]
		var sm := StandardMaterial3D.new()
		if e.has("t"):
			sm.albedo_texture = load("res://models/uh60_%s.png" % key)
		else:
			sm.albedo_color = Color.html(e["c"])
		sm.roughness = rough.get(m, 0.8)
		sm.metallic = metal.get(m, 0.08)
		mats[m] = sm
	var p := _parts(d, true, false)
	var hub := _v(d["hub"])
	var thub := _v(d["thub"])
	for k in ["head", "blade"]:
		p[k] = p[k].map(func(q): return _shift(q, -hub))
	for k in ["thead", "tblade"]:
		p[k] = p[k].map(func(q): return _shift(q, -thub))
	for q in p.get("seat", []):
		for o in q["off"]:
			p["body"].append(_shift(q, _v(o)))
	var root := _root("uh60", d, p, mats, Vector3(0, -0.6, -7.5))
	root.set_meta("r", 8.18)
	root.set_meta("rest", 1.55)
	root.set_meta("rockets", PackedVector3Array())
	root.set_meta("atgms", PackedVector3Array())
	_crew(root, [Vector3(0.67, 0.42, -3.85), Vector3(-0.67, 0.42, -3.85)])
	_save(root)


func _shift(q: Dictionary, by: Vector3) -> Dictionary:
	var pp: PackedVector3Array = (q["pos"] as PackedVector3Array).duplicate()
	for k in pp.size():
		pp[k] += by
	var c := q.duplicate()
	c["pos"] = pp
	return c


func _apache(d: Dictionary, mats: Dictionary) -> void:
	var p := _parts(d, true)
	var root := _root("ah64", d, p, mats, Vector3(0, -0.96, -4.6))
	root.set_meta("r", float(d["radius"]))
	root.set_meta("rest", 1.3)
	var st: Dictionary = d["stores"]
	var atgm := _mesh(p["atgm"], mats)
	var pod := _mesh(p["pod"], mats)
	var rk := PackedVector3Array()
	var mi := PackedVector3Array()
	for i in (st["atgm"] as Array).size():
		var n := _mi("atgm%d" % i, atgm, root)
		n.position = _v(st["atgm"][i])
		mi.append(n.position + Vector3(0, 0, -0.9))
	for i in (st["pod"] as Array).size():
		var n := _mi("pod%d" % i, pod, root)
		n.position = _v(st["pod"][i])
		rk.append(n.position + Vector3(0, 0, -1.0))
	root.set_meta("rockets", rk)
	root.set_meta("atgms", mi)
	_crew(root, [Vector3(0, 1.1, -3.0), Vector3(0, 1.42, -1.75)])
	_save(root)


func _hind(d: Dictionary) -> void:
	var p := _parts(d, false)
	var root := _root("mi24", d, p, {"glass": _glass}, _v(d["muzzle"]))
	root.set_meta("r", float(d["r"]))
	root.set_meta("rest", float(d["rest"]))
	(root.get_node("rotor") as Node3D).rotation = Vector3(-float(d["tilt"]), 0, -float(d["roll"]))
	var rk := PackedVector3Array()
	for q in d["pods"]:
		rk.append(_v(q) + Vector3(0, 0, -1.1))
	var mi := PackedVector3Array()
	for q in d["tubes"]:
		mi.append(_v(q) + Vector3(0, 0, -1.0))
	root.set_meta("rockets", rk)
	root.set_meta("atgms", mi)
	var crew := []
	for q in d["crew"]:
		crew.append(_v(q))
	_crew(root, crew)
	_save(root)


## The airframe, its far version, both rotors and the chin gun, from the parts sorted by kind.
func _root(id: String, d: Dictionary, p: Dictionary, mats: Dictionary, muzzle: Vector3) -> Node3D:
	var root := Node3D.new()
	root.name = id
	var body := _mi("body", _mesh(p["body"] + p.get("gear", []), mats), root)
	var far := _mi("far", _mesh(p["far"], mats), root)
	if not p["far"].is_empty():
		body.visibility_range_end = FAR
		body.visibility_range_end_margin = 10.0
		far.visibility_range_begin = FAR
		far.visibility_range_begin_margin = 10.0
	var rotor := Node3D.new()
	rotor.name = "rotor"
	root.add_child(rotor)
	rotor.owner = root
	rotor.position = _v(d["hub"])
	_mi("spin", _mesh(p["head"] + p["blade"], mats), rotor)
	var trotor := Node3D.new()
	trotor.name = "trotor"
	root.add_child(trotor)
	trotor.owner = root
	trotor.position = _v(d["thub"])
	_mi("tspin", _mesh(p["thead"] + p["tblade"], mats), trotor)
	var chin := Node3D.new()
	chin.name = "chin"
	root.add_child(chin)
	chin.owner = root
	chin.position = _v(d.get("gunPivot", [0, -0.6, -7.0]))
	if p.has("turret"):
		_mi("turret", _mesh(p["turret"], mats), chin)
	var barrel := Node3D.new()
	barrel.name = "barrel"
	chin.add_child(barrel)
	barrel.owner = root
	_mi("gun", _mesh(p.get("gun", []), mats), barrel)
	var mz := Node3D.new()
	mz.name = "muzzle"
	barrel.add_child(mz)
	mz.owner = root
	mz.position = muzzle - chin.position
	return root


## The pilots under the canopy: a helmet where each head is and the shoulders under it.
func _crew(root: Node3D, heads: Array) -> void:
	var body: MeshInstance3D = root.get_node("body")
	var hm := SphereMesh.new()
	hm.radius = 0.16
	hm.height = 0.3
	hm.radial_segments = 12
	hm.rings = 6
	hm.material = _helmet
	var tm := BoxMesh.new()
	tm.size = Vector3(0.48, 0.55, 0.3)
	tm.material = _suit
	for i in heads.size():
		var h := _mi("helmet%d" % i, hm, body)
		h.position = heads[i]
		var t := _mi("pilot%d" % i, tm, body)
		t.position = heads[i] + Vector3(0, -0.42, 0.06)
		for n in [h, t]:
			n.visibility_range_end = body.visibility_range_end
			n.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func _save(root: Node3D) -> void:
	var ps := PackedScene.new()
	ps.pack(root)
	print(root.name, ": ", ResourceSaver.save(ps, "res://models/%s.scn" % root.name, ResourceSaver.FLAG_COMPRESS))


func _const(lines: Array, name: String) -> Dictionary:
	var pre := "const %s = " % name
	for l in lines:
		if String(l).begins_with(pre):
			return JSON.parse_string(String(l).substr(pre.length()).strip_edges().trim_suffix(";"))
	push_error("no " + name)
	return {}


func _v(a: Array) -> Vector3:
	return Vector3(a[0], a[1], a[2])


func _flat(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.9
	return m


func _mi(n: String, mesh: Mesh, parent: Node) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = n
	mi.mesh = mesh
	parent.add_child(mi)
	mi.owner = parent if parent.owner == null else parent.owner
	return mi


## The close-up (@1) and far (@2) parts, unpacked and sorted by kind (the far ones all under "far").
func _parts(d: Dictionary, uvs: bool, tiers := true) -> Dictionary:
	var bin := Marshalls.base64_to_raw(d["bin"])
	var out := {"far": []}
	for h in d["parts"]:
		var n: String = h["n"]
		if tiers and not (n.ends_with("@1") or n.ends_with("@2")):
			continue
		var k: String = "far" if n.ends_with("@2") else h["k"]
		if not out.has(k):
			out[k] = []
		out[k].append(_part(bin, d, h, uvs))
	return out


## One packed part: Int16 positions over the box lo..hi, Int8 normals, Uint16 texture coordinates over u0..u1 (flipped
## for Godot, whose images start at the top), Uint16 (or Uint32) indices, wound the other way round for Godot.
func _part(bin: PackedByteArray, d: Dictionary, h: Dictionary, uvs: bool) -> Dictionary:
	var n: int = h["v"]
	var po: int = h["po"]
	var no: int = h["no"]
	var lo: Array = d["lo"]
	var hi: Array = d["hi"]
	var pos := PackedVector3Array()
	var nor := PackedVector3Array()
	pos.resize(n)
	nor.resize(n)
	for k in n:
		var q := Vector3.ZERO
		for j in 3:
			q[j] = float(lo[j]) + (bin.decode_s16(po + (k * 3 + j) * 2) + 32767) / 65534.0 * (float(hi[j]) - float(lo[j]))
		pos[k] = q
		nor[k] = Vector3(bin.decode_s8(no + k * 3), bin.decode_s8(no + k * 3 + 1), bin.decode_s8(no + k * 3 + 2)).normalized()
	var uv := PackedVector2Array()
	if uvs and h.has("uo"):
		var uo: int = h["uo"]
		var u0: Array = h["u0"]
		var u1: Array = h["u1"]
		uv.resize(n)
		for k in n:
			var u := float(u0[0]) + bin.decode_u16(uo + k * 4) / 65535.0 * (float(u1[0]) - float(u0[0]))
			var v := float(u0[1]) + bin.decode_u16(uo + k * 4 + 2) / 65535.0 * (float(u1[1]) - float(u0[1]))
			uv[k] = Vector2(u, 1.0 - v)
	var ni: int = h["i"]
	var io: int = h["io"]
	var idx := PackedInt32Array()
	idx.resize(ni)
	var big: bool = h.get("i32", false)
	for k in ni:
		idx[k] = bin.decode_u32(io + k * 4) if big else bin.decode_u16(io + k * 2)
	for k in range(0, ni, 3):
		var t := idx[k + 1]
		idx[k + 1] = idx[k + 2]
		idx[k + 2] = t
	return {"m": h["m"], "pos": pos, "nor": nor, "uv": uv, "idx": idx, "off": h.get("off", [])}


## A mesh of the parts, a surface per material: the textured and glass ones keep theirs; the rest are painted into
## the vertex colours of one surface.
func _mesh(parts: Array, mats: Dictionary) -> ArrayMesh:
	var groups := {}
	for p in parts:
		var key: String = p["m"] if mats.has(p["m"]) else "paint"
		if not groups.has(key):
			groups[key] = []
		groups[key].append(p)
	var mesh := ArrayMesh.new()
	for key in groups:
		var pos := PackedVector3Array()
		var nor := PackedVector3Array()
		var uv := PackedVector2Array()
		var col := PackedColorArray()
		var idx := PackedInt32Array()
		for p in groups[key]:
			var base := pos.size()
			var pp: PackedVector3Array = p["pos"]
			var pn: PackedVector3Array = p["nor"]
			pos.append_array(pp)
			nor.append_array(pn)
			if key == "paint":
				for k in pp.size():
					col.append(_colour(p["m"], pp[k], pn[k]))
			else:
				uv.append_array(p["uv"])
			for i in p["idx"]:
				idx.append(base + i)
		var a := []
		a.resize(Mesh.ARRAY_MAX)
		a[Mesh.ARRAY_VERTEX] = pos
		a[Mesh.ARRAY_NORMAL] = nor
		a[Mesh.ARRAY_INDEX] = idx
		if uv.size() == pos.size():
			a[Mesh.ARRAY_TEX_UV] = uv
		if key == "paint":
			a[Mesh.ARRAY_COLOR] = col
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
		mesh.surface_set_material(mesh.get_surface_count() - 1, mats.get(key, _paint))
	return mesh


## The Hind's paint: its skin olive on top and blue-grey underneath with tan blotches over the top and sides; the
## rest in their own colours.
func _colour(m: String, p: Vector3, n: Vector3) -> Color:
	if m != "skin":
		return MI24.get(m, MI24["dark"])
	var c := BELLY.lerp(TOP, smoothstep(-0.5, 0.05, n.y))
	var q := p * 0.45
	var v := sin(q.x * 1.7 + sin(q.z * 0.9) * 1.8) + sin(q.z * 1.3 + sin(q.y * 2.1 + q.x) * 1.5) + sin((q.x + q.z) * 0.8 + q.y * 1.9)
	return c.lerp(CAMO, smoothstep(0.7, 1.0, v) * smoothstep(-0.45, 0.0, n.y))
