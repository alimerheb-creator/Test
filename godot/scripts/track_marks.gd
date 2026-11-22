extends MeshInstance3D
## The ruts a tank's tracks press into the ground. Each track lays a strip on the terrain's own 3 m triangles a
## metre at a time, with the bars of the tread in it. A rut lasts LIFE seconds and fades over the last third. The
## strips live in a ring of quads that the newest reuse, so a tank keeps at most SLOTS metres of each track.

const T := preload("res://scripts/terrain.gd")
const SLOTS := 480
const STEP := 1.0
const LIFE := 45.0
const SHADER := "shader_type spatial;
render_mode blend_mix, depth_draw_never, cull_disabled, specular_disabled, skip_vertex_transform;
uniform float now = 0.0;
uniform float life = 45.0;
varying float fade;

void vertex() {
	fade = clamp((1.0 - (now - UV2.x) / life) * 3.0, 0.0, 1.0);
	// a hair nearer the camera than the ground under it (the same spot on screen), so it never flickers into it
	VERTEX = (MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz * 0.998;
	NORMAL = normalize((MODELVIEW_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	float edge = smoothstep(0.0, 0.2, UV.x) * smoothstep(1.0, 0.8, UV.x);
	float bar = fract(UV.y / 0.34);
	ALBEDO = vec3(0.12, 0.1, 0.075);
	ROUGHNESS = 1.0;
	ALPHA = 0.62 * edge * mix(0.5, 1.0, smoothstep(0.3, 0.42, bar) * smoothstep(1.0, 0.88, bar)) * fade;
}
"

var xs := PackedFloat32Array()  ## each track's middle across the hull
var z0 := 0.0  ## and along it
var wide := 0.6  ## a track's width
var _pos := PackedVector3Array()
var _nor := PackedVector3Array()
var _uv := PackedVector2Array()
var _uv2 := PackedVector2Array()
var _arr := []
var _mat := ShaderMaterial.new()
var _slot := 0
var _t := 0.0
var _born := 0.0
var _have := false
# where each track's last strip ended: its middle, its two edges and their normals, and how far it has run
var _mid := PackedVector3Array()
var _left := PackedVector3Array()
var _right := PackedVector3Array()
var _nl := PackedVector3Array()
var _nr := PackedVector3Array()
var _along := PackedFloat32Array()


func _ready() -> void:
	top_level = true
	global_transform = Transform3D.IDENTITY
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var sh := Shader.new()
	sh.code = SHADER
	_mat.shader = sh
	_mat.set_shader_parameter("life", LIFE)
	material_override = _mat
	mesh = ArrayMesh.new()
	var n := SLOTS * xs.size() * 4
	_pos.resize(n)
	_nor.resize(n)
	_uv.resize(n)
	_uv2.resize(n)
	_uv2.fill(Vector2(-1e6, 0.0))
	var idx := PackedInt32Array()
	for q in n / 4:
		idx.append_array([q * 4, q * 4 + 1, q * 4 + 2, q * 4 + 2, q * 4 + 1, q * 4 + 3])
	_arr.resize(Mesh.ARRAY_MAX)
	_arr[Mesh.ARRAY_INDEX] = idx
	_mid.resize(xs.size())
	_left.resize(xs.size())
	_right.resize(xs.size())
	_nl.resize(xs.size())
	_nr.resize(xs.size())
	_along.resize(xs.size())


func _physics_process(dt: float) -> void:
	_t += dt
	_mat.set_shader_parameter("now", _t)
	var b := (get_parent() as Node3D).global_basis
	var right := Vector3(b.x.x, 0.0, b.x.z).normalized()
	var o := (get_parent() as Node3D).global_position + Vector3(b.z.x, 0.0, b.z.z).normalized() * z0
	# a strip each time either track has moved a metre (so turning on the spot lays them too)
	var moved := 0.0
	for k in xs.size():
		var c := o + right * xs[k]
		moved = maxf(moved, Vector2(c.x - _mid[k].x, c.z - _mid[k].z).length())
	if _have and moved < STEP:
		return
	var lay := _have and moved < STEP * 6.0  # a longer jump is a respawn: start afresh
	var hw := right * wide * 0.5
	for k in xs.size():
		var c := o + right * xs[k]
		var l := _ground(c.x - hw.x, c.z - hw.z)
		var r := _ground(c.x + hw.x, c.z + hw.z)
		if lay:
			var d := Vector2(c.x - _mid[k].x, c.z - _mid[k].z).length()
			var v := (_slot * xs.size() + k) * 4
			_put(v, _left[k], _nl[k], 0.0, _along[k], _born)
			_put(v + 1, _right[k], _nr[k], 1.0, _along[k], _born)
			_along[k] += d
			_put(v + 2, l[0], l[1], 0.0, _along[k], _t)
			_put(v + 3, r[0], r[1], 1.0, _along[k], _t)
		_mid[k] = c
		_left[k] = l[0]
		_right[k] = r[0]
		_nl[k] = l[1]
		_nr[k] = r[1]
	_born = _t
	_have = true
	if lay:
		_slot = (_slot + 1) % SLOTS
		_arr[Mesh.ARRAY_VERTEX] = _pos
		_arr[Mesh.ARRAY_NORMAL] = _nor
		_arr[Mesh.ARRAY_TEX_UV] = _uv
		_arr[Mesh.ARRAY_TEX_UV2] = _uv2
		var m := mesh as ArrayMesh
		m.clear_surfaces()
		m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, _arr)


func _put(i: int, p: Vector3, n: Vector3, u: float, v: float, born: float) -> void:
	_pos[i] = p
	_nor[i] = n
	_uv[i] = Vector2(u, v)
	_uv2[i] = Vector2(born, 0.0)


## A spot a hair above the ground exactly where the terrain mesh draws it (its 3 m triangles), and that triangle's
## normal.
static func _ground(x: float, z: float) -> Array:
	var gx := floorf((x + 300.0) / 3.0) * 3.0 - 300.0
	var gz := floorf((z + 300.0) / 3.0) * 3.0 - 300.0
	var fx := (x - gx) / 3.0
	var fz := (z - gz) / 3.0
	var hb := T.height(gx + 3.0, gz)
	var hc := T.height(gx, gz + 3.0)
	if fx + fz <= 1.0:
		var ha := T.height(gx, gz)
		return [Vector3(x, ha + (hb - ha) * fx + (hc - ha) * fz + 0.03, z), Vector3(ha - hb, 3.0, ha - hc).normalized()]
	var hd := T.height(gx + 3.0, gz + 3.0)
	return [Vector3(x, hd + (hc - hd) * (1.0 - fx) + (hb - hd) * (1.0 - fz) + 0.03, z),
		Vector3(hc - hd, 3.0, hb - hd).normalized()]
