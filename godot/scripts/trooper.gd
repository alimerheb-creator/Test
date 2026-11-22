extends Node3D
## A soldier's body: the web game's modern soldier (models/trooper.scn, made by tools/build_trooper.gd from "A soldier
## mercenary with helmet and yellow visor" by ShaderMussolini on Sloyd, CC BY 4.0), posed in code as in the web game.
## His legs walk, each knee folding as the leg swings through, the feet kept flat; his rifle rests in both hands, each
## arm reaching for it (worked out once for aiming and once for the low ready, and blended as he fights or not); his
## chest turns up and down with his aim. Close up he's the skinned version; further than NEAR, the far one, already
## aiming. Onyx's uniform is the same one greyed and tinted with their colour.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")
const NEAR := 45.0
const ARMS := ["upperArmR", "foreArmR", "handR", "upperArmL", "foreArmL", "handL"]
## The two carries (as the web game's): the rifle's place standing straight (feet at 0, facing -z) and turn, how far
## the shoulders turn, where the left hand holds it (rifle frame), which way the elbows point, how the hands turn on it.
const CARRY := {
	"aim": {"twist": -0.55, "at": Vector3(0.1, 1.5, -0.28), "rot": Vector3(0, 0, 0), "lh": Vector3(0, -0.005, -0.2),
		"poleR": Vector3(1, -1.2, 0.3), "poleL": Vector3(-0.3, -1, 0), "hR": Vector3(0.75, 0, 0), "hL": Vector3(1.4, 0, -0.5),
		"head": Vector3(-0.1, 0.44, -0.12)},
	"low": {"twist": -0.3, "at": Vector3(0.13, 1.22, -0.3), "rot": Vector3(-0.5, 0.85, 0.35), "lh": Vector3(0, -0.005, -0.2),
		"poleR": Vector3(1, -1, 0.4), "poleL": Vector3(-0.6, -1, -0.1), "hR": Vector3(0.4, 0.5, 0), "hL": Vector3(1.2, 0.6, -0.4),
		"head": Vector3(0, 0.24, 0)},
}
## The rifle: boxes (size, then centre) in its own frame, the right hand's grip at its origin.
const BOXES := [[0.042, 0.095, 0.2, 0, 0.035, 0.19], [0.04, 0.09, 0.3, 0, 0.06, -0.07], [0.03, 0.1, 0.045, 0, -0.03, 0.015],
	[0.03, 0.13, 0.06, 0, -0.04, -0.105], [0.05, 0.05, 0.27, 0, 0.075, -0.32]]
const SHADER := "shader_type spatial;
uniform sampler2D tex : source_color, filter_linear_mipmap_anisotropic;
uniform float recolor = 0.0;
uniform vec3 tint = vec3(1.0);
void fragment() {
	vec3 c = texture(tex, UV).rgb;
	// another army's colours: grey the uniform and tint it, keeping what's strongly coloured (the amber visor)
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	float mx = max(c.r, max(c.g, c.b));
	float sat = (mx - min(c.r, min(c.g, c.b))) / max(mx, 1e-4);
	float keep = smoothstep(0.45, 0.65, sat) * smoothstep(0.08, 0.2, mx);
	ALBEDO = mix(c, mix(vec3(l), c, 0.3) * tint, recolor * (1.0 - keep));
	ROUGHNESS = 0.82;
}
"
static var _scene: PackedScene
static var _carry := {}
static var _mats := []
static var _dead_arms := []

var skel: Skeleton3D
var gun: Node3D
var muzzle: Node3D
var _b := {}
var _hips0 := Vector3.ZERO
var _walk := randf() * 6.0
var _k := 1.0
var _seed := randf() * 10.0
var _dead := false


func setup(world: Node, team: int, cls: String) -> void:
	if _scene == null:
		_scene = load("res://models/trooper.scn")
	var m: Node3D = _scene.instantiate()
	add_child(m)
	skel = m.get_node("skel")
	for i in skel.get_bone_count():
		_b[skel.get_bone_name(i)] = i
	_hips0 = skel.get_bone_rest(_b["hips"]).origin
	if _carry.is_empty():
		_carry = {"aim": _carry_pose(CARRY["aim"]), "low": _carry_pose(CARRY["low"])}
		_dead_arms = [_qe(Vector3(0.25, 0, 1.15)), _qe(Vector3(0.55, 0, 0)), Quaternion(), _qe(Vector3(0.25, 0, -1.0)),
			_qe(Vector3(0.4, 0, 0)), Quaternion()]
	var body: MeshInstance3D = skel.get_node("body")
	var far: MeshInstance3D = m.get_node("far")
	body.material_override = _mat(team)
	far.material_override = _mat(team)
	body.visibility_range_end = NEAR
	far.visibility_range_begin = NEAR
	# the rifle, on his chest where his hands hold it (a longer barrel for the marksman)
	var att := BoneAttachment3D.new()
	att.bone_name = "chest"
	skel.add_child(att)
	gun = Node3D.new()
	att.add_child(gun)
	var long := 0.18 if cls == "recon" else (0.0 if cls != "engineer" else -0.06)
	var dark := Color(0.13, 0.13, 0.14)
	var parts := []
	for b in BOXES:
		var bm := BoxMesh.new()
		bm.size = Vector3(b[0], b[1], b[2])
		parts.append([bm, Transform3D(Basis(), Vector3(b[3], b[4], b[5])), dark])
	var barrel := BoxMesh.new()
	barrel.size = Vector3(0.02, 0.02, 0.26 + long)
	parts.append([barrel, Transform3D(Basis(), Vector3(0, 0.075, -0.58 - long * 0.5)), dark])
	if cls == "support":
		var box := BoxMesh.new()
		box.size = Vector3(0.09, 0.1, 0.1)
		parts.append([box, Transform3D(Basis(), Vector3(-0.04, -0.03, -0.11)), Color(0.22, 0.23, 0.18)])
	var rifle := MeshInstance3D.new()
	rifle.mesh = T.merge(parts)
	rifle.material_override = world.soldier_mat()
	rifle.visibility_range_end = NEAR
	gun.add_child(rifle)
	muzzle = Node3D.new()
	muzzle.position = Vector3(0, 0.075, -0.72 - long)
	gun.add_child(muzzle)
	pose(0.0, Vector3.ZERO, 0.0, false)


## Each frame: walking at `vel`, aiming `pitch` up (or down), fighting (aiming) or not (the low ready).
func pose(dt: float, vel: Vector3, pitch: float, fighting: bool) -> void:
	if _dead:
		return
	var sp := Vector2(vel.x, vel.z).length()
	_walk += sp * dt * 2.1
	_k = move_toward(_k, 0.0 if fighting else 1.0, dt * 4.0)
	var cam := get_viewport().get_camera_3d() if is_inside_tree() else null
	if dt > 0.0 and cam and cam.global_position.distance_squared_to(global_position) > (NEAR + 5.0) * (NEAR + 5.0):
		return
	var amp := minf(1.0, sp / 4.0) * 0.55
	var sw := sin(_walk) * amp
	var cw := cos(_walk)
	skel.set_bone_pose_position(_b["hips"], _hips0 + Vector3(0, -amp * 0.035 + absf(cw) * amp * 0.05, 0))
	_rot("hips", Vector3(0, sw * 0.14, 0))
	# the knee folds while the leg swings forward and is nearly straight while it carries the weight; feet flat
	var kl := -maxf(0.0, cw) * amp * 1.5 - amp * 0.12
	var kr := -maxf(0.0, -cw) * amp * 1.5 - amp * 0.12
	_rot("thighL", Vector3(sw, 0, 0))
	_rot("thighR", Vector3(-sw, 0, 0))
	_rot("shinL", Vector3(kl, 0, 0))
	_rot("shinR", Vector3(kr, 0, 0))
	_rot("footL", Vector3(-(sw + kl), 0, 0))
	_rot("footR", Vector3(sw - kr, 0, 0))
	var p := pitch * 0.7 - amp * 0.06 + sin(Time.get_ticks_msec() * 0.0016 + _seed) * 0.014
	var k := smoothstep(0.0, 1.0, _k)
	var A: Dictionary = _carry["aim"]
	var L: Dictionary = _carry["low"]
	var tw := lerpf(A["twist"], L["twist"], k)
	_rot("spine", Vector3(p * 0.5, tw * 0.4 - sw * 0.12, 0))
	_rot("chest", Vector3(p * 0.5, tw * 0.6 - sw * 0.12, 0))
	for i in 6:
		skel.set_bone_pose_rotation(_b[ARMS[i]], (A["arms"][i] as Quaternion).slerp(L["arms"][i], k))
	skel.set_bone_pose_rotation(_b["head"], (A["head"] as Quaternion).slerp(L["head"], k))
	gun.position = (A["gun_pos"] as Vector3).lerp(L["gun_pos"], k)
	gun.quaternion = (A["gun_quat"] as Quaternion).slerp(L["gun_quat"], k)


## Shot: the arms fling loose, the legs fold a little and the rifle falls (the body itself falls as the soldier does).
func die() -> void:
	_dead = true
	for i in 6:
		skel.set_bone_pose_rotation(_b[ARMS[i]], _dead_arms[i])
	_rot("thighL", Vector3(randf() * 0.6, 0, -0.12))
	_rot("thighR", Vector3(randf() * 0.4, 0, 0.12))
	_rot("shinL", Vector3(-randf() * 0.9, 0, 0))
	_rot("shinR", Vector3(-randf() * 0.6, 0, 0))
	gun.visible = false


func revive() -> void:
	_dead = false
	gun.visible = true
	pose(0.0, Vector3.ZERO, 0.0, false)


func _rot(bone: String, e: Vector3) -> void:
	skel.set_bone_pose_rotation(_b[bone], _qe(e))


## Euler angles to a turn, in three.js's orders: "XYZ" (x, then y, then z, about the turned axes) or "YXZ".
static func _qe(e: Vector3, order := "XYZ") -> Quaternion:
	var qx := Quaternion(Vector3.RIGHT, e.x)
	var qy := Quaternion(Vector3.UP, e.y)
	var qz := Quaternion(Vector3.BACK, e.z)
	return qx * qy * qz if order == "XYZ" else qy * qx * qz


## A carry worked out once: the rifle's place on the chest, and each arm's three turns reaching for it.
func _carry_pose(c: Dictionary) -> Dictionary:
	var rest := {}
	for n in _b:
		rest[n] = skel.get_bone_rest(_b[n]).origin
	var spine := Transform3D(Basis(), rest["hips"]) * Transform3D(Basis(_qe(Vector3(0, c["twist"] * 0.4, 0))), rest["spine"])
	var chest := spine * Transform3D(Basis(_qe(Vector3(0, c["twist"] * 0.6, 0))), rest["chest"])
	var gun_t := chest.affine_inverse() * Transform3D(Basis(_qe(c["rot"], "YXZ")), c["at"])
	var gq := gun_t.basis.get_rotation_quaternion()
	var arms := []
	for s in ["R", "L"]:
		var grip: Vector3 = gun_t * (Vector3.ZERO if s == "R" else c["lh"])
		var H := gq * _qe(c["h" + s], "YXZ")
		# (the palm's middle, from the wrist, in the hand's own frame)
		var wrist := grip - H * Vector3(0.016 if s == "R" else -0.016, -0.09, -0.03)
		arms.append_array(_reach(rest["upperArm" + s], rest["foreArm" + s], rest["hand" + s], wrist, c["pole" + s], H))
	return {"twist": c["twist"], "gun_pos": gun_t.origin, "gun_quat": gq, "arms": arms, "head": _qe(c["head"], "YXZ")}


## Two-bone reach: the arm's three turns that put the wrist at W with the elbow toward the pole and the hand turned to H
## (all in the chest's frame; S the shoulder, fore and hand the bones' offsets).
static func _reach(S: Vector3, fore: Vector3, hand: Vector3, W: Vector3, pole: Vector3, H: Quaternion) -> Array:
	var l1 := fore.length()
	var l2 := hand.length()
	var d := W - S
	var ln := minf(d.length(), l1 + l2 - 1e-4)
	d = d.normalized()
	var a := (l1 * l1 - l2 * l2 + ln * ln) / (2.0 * ln)
	var h := sqrt(maxf(0.0, l1 * l1 - a * a))
	var p := (pole - d * pole.dot(d)).normalized()
	var elbow := S + d * a + p * h
	var wrist := S + d * ln
	var q1 := Quaternion(fore.normalized(), (elbow - S).normalized())
	var q2 := Quaternion(hand.normalized(), q1.inverse() * (wrist - elbow).normalized())
	return [q1, q2, (q1 * q2).inverse() * H]


static func _mat(team: int) -> ShaderMaterial:
	if _mats.is_empty():
		var sh := Shader.new()
		sh.code = SHADER
		var tex: Texture2D = load("res://models/trooper_tex.jpg")
		var v := Color("6b6a4c").srgb_to_linear()
		var lv := 0.2126 * v.r + 0.7152 * v.g + 0.0722 * v.b
		for t in 2:
			var m := ShaderMaterial.new()
			m.shader = sh
			m.set_shader_parameter("tex", tex)
			var top: Color = (D.TEAMS[t]["top"] as Color).srgb_to_linear()
			m.set_shader_parameter("recolor", 0.0 if top.is_equal_approx(v) else 1.0)
			m.set_shader_parameter("tint", Vector3(top.r, top.g, top.b) / lv)
			_mats.append(m)
	return _mats[team]
