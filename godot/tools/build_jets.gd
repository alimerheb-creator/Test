extends SceneTree
## Builds the Godot edition's jets from the web game's real models (mods/jets.sfmod.json):
## Vanguard's F-16C ("F16", a SolidWorks model on CGTrader uploaded by taylor-eudora, CGTrader's Royalty Free License),
## painted the F-16's greys over panel lines as in the web game, and Onyx's Su-35S ("SU35S" by sa893537, a free model
## on CGTrader, CGTrader's Royalty Free License) in its own textures. Each keeps the lighter close-up version (@1) up to
## FAR metres and the simple one (@2) beyond, with lighter versions of that made here for far off.
## Saves res://models/f16.scn and res://models/su35.scn: body (with the pilot) and far; the control surfaces, each on
## its hinge line (cs_<kind>_<side>, turning about its own x axis; its meta "sgn" is the way that turns it down, or to
## the right for a rudder); the landing gear (gear, hidden: for the jets parked at the airbases); the four missiles
## (aam0..3, the ones on the wingtips first). Its metadata: muzzle, nozzles ([x, y, z, radius] each), gear_h (how high
## the wheels hold the model's middle).
## The textures go to res://models/ on the first run (the Su-35S's atlas and numbers, and the panel lines), which then
## asks for `godot --headless --path . --import` before a second run.
## Run from godot/: godot --headless --path . --script res://tools/build_jets.gd

const FAR := 150.0
## The F-16's paint (the web game's): light grey underneath, darker on top with darker patches; the rest of it.
const F16C := {"top": Color8(0x80, 0x88, 0x8e), "bottom": Color8(0x9b, 0xa2, 0xa7), "camo": Color8(0x67, 0x6f, 0x75),
	"radome": Color8(0x5b, 0x61, 0x66), "dark": Color8(0x2a, 0x2c, 0x2f), "black": Color8(0x14, 0x15, 0x16),
	"metal": Color8(0x9a, 0x9d, 0xa2), "burnt": Color8(0x4d, 0x44, 0x40), "white": Color8(0xe6, 0xe6, 0xe2),
	"cockpit": Color8(0x3c, 0x41, 0x46), "red": Color8(0xa0, 0x22, 0x1a), "rubber": Color8(0x1a, 0x1a, 0x1a)}

var _paint: StandardMaterial3D
var _suit: StandardMaterial3D
var _helmet: StandardMaterial3D


func _initialize() -> void:
	var src := FileAccess.get_file_as_string(ProjectSettings.globalize_path("res://").path_join("../mods/jets.sfmod.json").simplify_path())
	var lines: Array = (JSON.parse_string(src) as Dictionary)["script"]
	var tex: Dictionary = _const(lines, "SU35_TEX")
	var fresh := _tex_file("res://models/su35_atlas.jpg", String(tex["atlas"]))
	fresh = _tex_file("res://models/su35_numbers.png", String(tex["numbers"])) or fresh
	fresh = _panel_file("res://models/panel.png") or fresh
	if fresh:
		print("wrote the textures: run godot --headless --path . --import, then this again")
		quit()
		return
	_paint = StandardMaterial3D.new()
	_paint.vertex_color_use_as_albedo = true
	_paint.vertex_color_is_srgb = true
	_paint.roughness = 0.6
	_paint.metallic = 0.15
	_suit = _flat(Color8(0x4a, 0x4c, 0x3c))
	_helmet = _flat(Color8(0x8e, 0x91, 0x8d))
	var f16 := _const(lines, "F16_MESH")
	var fp := _parts(f16)
	for p in fp:
		_colour(p, _f16_colour)
	var aim9 := fp.filter(func(p: Dictionary) -> bool: return p["n"] == "store:aim9:white@1")
	_f16(f16, fp, aim9)
	_su35(_const(lines, "SU35_MESH"), aim9)
	quit()


## The F-16: its skin (and the radome, a darker grey) painted in the vertex colours over the panel lines, the gold-
## tinted canopy, the rest in their own colours.
func _f16(d: Dictionary, parts: Array, aim9: Array) -> void:
	var skin := StandardMaterial3D.new()
	skin.albedo_texture = load("res://models/panel.png")
	skin.vertex_color_use_as_albedo = true
	skin.vertex_color_is_srgb = true
	skin.roughness = 0.58
	skin.metallic = 0.12
	var glass := _glass(Color8(0xc9, 0xab, 0x62, 92), 0.03, 0.45)
	var mats := {"skin": skin, "radome": skin, "glass": glass}
	var points := _points(d["stores"]["aim120"], d["stores"]["aim9"])
	_save(_build("f16", d, parts, mats, points, aim9, _v(d["gun"]), [d["nozzle"]], float(d["gearH"])))


## The Su-35S in its own textures: the atlas (the painted skin is in it too), the "07"s, the canopy glass.
func _su35(d: Dictionary, aim9: Array) -> void:
	var atlas := StandardMaterial3D.new()
	atlas.albedo_texture = load("res://models/su35_atlas.jpg")
	atlas.roughness = 0.55
	atlas.metallic = 0.12
	var numbers := StandardMaterial3D.new()
	numbers.albedo_texture = load("res://models/su35_numbers.png")
	numbers.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	numbers.alpha_scissor_threshold = 0.5
	numbers.roughness = 0.55
	numbers.metallic = 0.2
	var glass := _glass(Color8(0x1f, 0x2a, 0x30, 115), 0.05, 0.7)
	var mats := {"atlas": atlas, "paint": atlas, "numbers": numbers, "glass": glass}
	var parts := _parts(d)
	for p in parts:
		_colour(p, func(_m: String, _p: Vector3, _n: Vector3) -> Color: return Color8(0x1c, 0x1c, 0x1c))
		if p["m"] == "numbers":
			# (the numbers float a hair off the skin)
			var pos: PackedVector3Array = p["pos"]
			var nor: PackedVector3Array = p["nor"]
			for k in pos.size():
				pos[k] += nor[k] * 0.012
			p["pos"] = pos
	var points := _points(d["r73"], d["r77"])
	_save(_build("su35", d, parts, mats, points, aim9, Vector3(0.95, 0.3, -4.6), d["nozzles"], float(d["H0"])))


## Where the missiles hang: the outer pair (left, right), then the inner pair.
func _points(outer: Array, inner: Array) -> Array:
	var out := []
	for l in [outer, inner]:
		var pair: Array = l.duplicate()
		pair.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["c"][0]) < float(b["c"][0]))
		for s in pair:
			out.append(_v(s["c"]))
	return out


func _build(id: String, d: Dictionary, parts: Array, mats: Dictionary, points: Array, aim9: Array, muzzle: Vector3,
		nozzles: Array, gear_h: float) -> Node3D:
	var near := []
	var far := []
	var gear := []
	var cs := {}
	for p in parts:
		var n: String = p["n"]
		var base := n.get_slice("@", 0)
		if n.ends_with("@2"):
			far.append(p)
		elif not n.ends_with("@1") or base.begins_with("store:"):
			continue
		elif base.begins_with("gear:"):
			gear.append(p)
		elif base.begins_with("cs:"):
			cs[base] = p
		else:
			near.append(p)
	var root := Node3D.new()
	root.name = id
	var body := _mi("body", _mesh(near, mats, false), root)
	body.visibility_range_end = FAR
	body.visibility_range_end_margin = 10.0
	var fm := _mi("far", _mesh(far, mats, true), root)
	fm.visibility_range_begin = FAR
	fm.visibility_range_begin_margin = 10.0
	var g := _mi("gear", _mesh(gear, mats, false), root)
	g.visible = false
	g.visibility_range_end = 400.0
	# the control surfaces, each turned into its hinge's own frame
	for base in cs:
		var h: Dictionary = d["hinges"][base]
		var x := _v(h["dir"]).normalized()
		var ref := Vector3.RIGHT if absf(x.y) > 0.6 else Vector3.UP
		var y := (ref - x * ref.dot(x)).normalized()
		var b := Basis(x, y, x.cross(y))
		var o := _v(h["hinge"])
		var p: Dictionary = cs[base]
		var pos: PackedVector3Array = p["pos"]
		var nor: PackedVector3Array = p["nor"]
		var c := Vector3.ZERO
		for k in pos.size():
			pos[k] = b.transposed() * (pos[k] - o)
			nor[k] = b.transposed() * nor[k]
			c += pos[k]
		p["pos"] = pos
		p["nor"] = nor
		c /= maxf(1.0, pos.size())
		# which way a turn about the hinge moves it: down (or right, for a rudder) is "sgn"
		var move := b * Vector3(0.0, -c.z, c.y)
		var kind: String = base.get_slice(":", 1)
		var sgn := (1.0 if move.x > 0.0 else -1.0) if kind == "rud" else (1.0 if move.y < 0.0 else -1.0)
		var piv := Node3D.new()
		piv.name = "cs_%s_%s" % [kind, base.get_slice(":", 2)]
		piv.transform = Transform3D(b, o)
		piv.set_meta("kind", kind)
		piv.set_meta("side", base.get_slice(":", 2))
		piv.set_meta("sgn", sgn)
		root.add_child(piv)
		piv.owner = root
		var m := _mi("mesh", _mesh([p], mats, false), piv)
		m.visibility_range_end = FAR
		m.visibility_range_end_margin = 10.0
	# the missiles: the F-16's own Sidewinder, hung at each point
	var am := _mesh(aim9, {}, false)
	for i in points.size():
		var a := _mi("aam%d" % i, am, root)
		a.position = points[i]
		a.visibility_range_end = FAR
		a.visibility_range_end_margin = 10.0
	_crew(body, _v(d["head"]))
	root.set_meta("muzzle", muzzle)
	root.set_meta("nozzles", nozzles)
	root.set_meta("gear_h", gear_h)
	return root


## The pilot under the canopy: a helmet where the head is and the shoulders under it.
func _crew(body: MeshInstance3D, head: Vector3) -> void:
	var hm := SphereMesh.new()
	hm.radius = 0.16
	hm.height = 0.3
	hm.radial_segments = 12
	hm.rings = 6
	hm.material = _helmet
	var tm := BoxMesh.new()
	tm.size = Vector3(0.48, 0.55, 0.3)
	tm.material = _suit
	var h := _mi("helmet0", hm, body)
	h.position = head + Vector3(0, 0.02, 0.06)
	var t := _mi("pilot0", tm, body)
	t.position = head + Vector3(0, -0.4, 0.12)
	for n in [h, t]:
		n.visibility_range_end = FAR
		n.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## The F-16's skin: light grey underneath, darker grey on top with blotches of darker still; the radome its own grey;
## the rest in its own colour.
func _f16_colour(m: String, p: Vector3, n: Vector3) -> Color:
	if m != "skin":
		return F16C.get(m, F16C["dark"])
	var c: Color = (F16C["bottom"] as Color).lerp(F16C["top"], smoothstep(-0.35, 0.15, n.y))
	var q := p * 0.45
	var v := sin(q.x * 1.7 + sin(q.z * 0.9) * 1.8) + sin(q.z * 1.3 + sin(q.y * 2.1 + q.x) * 1.5) + sin((q.x + q.z) * 0.8 + q.y * 1.9)
	return c.lerp(F16C["camo"], smoothstep(0.85, 1.05, v) * smoothstep(-0.2, 0.2, n.y))


## Each vertex's colour (from where it is and which way it faces on the airframe, before any part is moved).
func _colour(p: Dictionary, f: Callable) -> void:
	var pos: PackedVector3Array = p["pos"]
	var nor: PackedVector3Array = p["nor"]
	var col := PackedColorArray()
	col.resize(pos.size())
	for k in pos.size():
		col[k] = f.call(p["m"], pos[k], nor[k])
	p["col"] = col


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


func _glass(c: Color, rough: float, metal: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.roughness = rough
	m.metallic = metal
	return m


func _mi(n: String, mesh: Mesh, parent: Node) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = n
	mi.mesh = mesh
	parent.add_child(mi)
	mi.owner = parent if parent.owner == null else parent.owner
	return mi


## Writes a texture from its data URL (and asks for it to be imported, compressed and with mipmaps) unless it's there.
func _tex_file(path: String, url: String) -> bool:
	if FileAccess.file_exists(path):
		return false
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_buffer(Marshalls.base64_to_raw(url.get_slice(",", 1)))
	f.close()
	_import_file(path)
	return true


func _import_file(path: String) -> void:
	var f := FileAccess.open(path + ".import", FileAccess.WRITE)
	f.store_string("[remap]\n\nimporter=\"texture\"\ntype=\"CompressedTexture2D\"\n\n[deps]\n\nsource_file=\"%s\"\n\n[params]\n\ncompress/mode=2\nmipmaps/generate=true\n" % path)
	f.close()


## The web game's panel lines for aircraft skins, drawn the same way (grey, for the vertex colours to tint; it tiles):
## faint patches, streaks running aft, the panel seams in columns with their rows of rivets, access hatches.
func _panel_file(path: String) -> bool:
	if FileAccess.file_exists(path):
		return false
	var img := Image.create(512, 512, false, Image.FORMAT_RGB8)
	img.fill(Color8(0xd4, 0xd4, 0xd4))
	var r := RandomNumberGenerator.new()
	r.seed = 16
	for i in 900:
		var v := (190.0 + r.randf() * 50.0) / 255.0
		_rect(img, r.randi_range(0, 511), r.randi_range(0, 511), r.randi_range(10, 70), r.randi_range(6, 36), Color(v, v, v), 0.1)
	for i in 120:
		_rect(img, r.randi_range(0, 511), r.randi_range(0, 511), r.randi_range(2, 5), r.randi_range(30, 120), Color8(60, 60, 60), 0.02 + r.randf() * 0.03)
	var line := Color8(30, 30, 30)
	var cols := [0, 64, 150, 224, 300, 372, 448]
	for c in cols.size():
		var x0: int = cols[c]
		var x1: int = cols[c + 1] if c + 1 < cols.size() else 512
		_rect(img, x0, 0, 1, 512, line, 0.2)
		var y := r.randf() * 60.0
		while y < 512.0:
			_rect(img, x0, int(y), x1 - x0, 1, line, 0.2)
			y += 50.0 + r.randf() * 90.0
		for ry in range(4, 512, 9):
			_rect(img, x0 + 3, ry, 2, 2, Color8(40, 40, 40), 0.12)
			_rect(img, x0 - 4, ry + 4, 2, 2, Color8(40, 40, 40), 0.12)
	for i in 26:
		var x := r.randi_range(0, 511)
		var y := r.randi_range(0, 511)
		var w := r.randi_range(14, 44)
		var h := r.randi_range(10, 30)
		for e in [[x, y, w, 1], [x, y + h, w, 1], [x, y, 1, h], [x + w, y, 1, h + 1]]:
			_rect(img, e[0], e[1], e[2], e[3], line, 0.18)
	img.save_png(path)
	_import_file(path)
	return true


## Blends a rectangle in, wrapping round the edges so the texture still tiles.
func _rect(img: Image, x: int, y: int, w: int, h: int, c: Color, a: float) -> void:
	for j in h:
		for i in w:
			var px := posmod(x + i, 512)
			var py := posmod(y + j, 512)
			img.set_pixel(px, py, img.get_pixel(px, py).lerp(c, a))


## The packed parts of the lighter close-up version (@1) and the far one (@2), unpacked, each with its name.
func _parts(d: Dictionary) -> Array:
	var bin := Marshalls.base64_to_raw(d["bin"])
	var out := []
	for h in d["parts"]:
		if not (String(h["n"]).ends_with("@1") or String(h["n"]).ends_with("@2")):
			continue
		var p := _part(bin, d, h)
		p["n"] = h["n"]
		out.append(p)
	return out


## One packed part: Int16 positions over the box lo..hi, Int8 normals, Uint16 texture coordinates over u0..u1 (flipped
## for Godot, whose images start at the top), Uint16 (or Uint32) indices, wound the other way round for Godot.
func _part(bin: PackedByteArray, d: Dictionary, h: Dictionary) -> Dictionary:
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
	if h.has("uo"):
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
	return {"m": h["m"], "pos": pos, "nor": nor, "uv": uv, "idx": idx}


## A mesh of the parts, a surface per material: those in mats keep their own (with their texture coordinates, and the
## vertex colours when it uses them); the rest are painted into the vertex colours of one surface. With lods, lighter
## versions for far off too.
func _mesh(parts: Array, mats: Dictionary, lods: bool) -> Mesh:
	var groups := {}
	for p in parts:
		var m: Material = mats.get(p["m"], _paint)
		if not groups.has(m):
			groups[m] = []
		groups[m].append(p)
	var im := ImporterMesh.new()
	for m: StandardMaterial3D in groups:
		var pos := PackedVector3Array()
		var nor := PackedVector3Array()
		var uv := PackedVector2Array()
		var col := PackedColorArray()
		var idx := PackedInt32Array()
		for p in groups[m]:
			var base := pos.size()
			pos.append_array(p["pos"])
			nor.append_array(p["nor"])
			if m.vertex_color_use_as_albedo:
				col.append_array(p["col"])
			if m.albedo_texture:
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
		if col.size() == pos.size():
			a[Mesh.ARRAY_COLOR] = col
		im.add_surface(Mesh.PRIMITIVE_TRIANGLES, a, [], {}, m)
	if lods:
		im.generate_lods(25.0, 60.0, [])
	return im.get_mesh()
