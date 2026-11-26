extends Node3D
## The airbases' installations (Aviation), after the web game's: two C-RAM sites guarding each airbase, and in a Ground
## Strike its radar site, fuel depot, two hangars and command bunker too (their shares of the side's tickets add up to
## all of them; with the last one gone, the side has lost). Here too what they share: the C-RAM guns' tracers (glowing
## streaks a few pixels wide however far off, flying at the rounds' 1,050 m/s; those that miss burst in the air in a
## spark and a puff), blasts reaching them, and the alarms you hear: an enemy C-RAM tracking your aircraft beeps slowly,
## fast while it shoots at you; your side's guns firing at something coming in near you sound the base's siren.

const D := preload("res://scripts/data.gd")
const T := preload("res://scripts/terrain.gd")
const Site := preload("res://scripts/site.gd")

## Where each installation stands at Vanguard's airbase (across from the middle of its runway: x, then z toward the
## map's middle), and which way it faces (the hangars toward the runway; the rest toward the enemy). Onyx's is the same
## turned round.
const LAYOUT := [["cram", -160.0, -60.0], ["cram", 160.0, 80.0], ["radar", -185.0, 140.0], ["fuel", 162.0, 280.0],
	["hangar", -175.0, -220.0], ["hangar", -175.0, -330.0], ["command", 165.0, -140.0]]
const TR_MAX := 400
const TR_SPEED := 1050.0
const TR_LEN := 34.0
const BURST_MAX := 120
## A tracer: a strip from its tail along its direction, turned to face you and kept at least about two and a half
## pixels wide (`pix`: the width of a pixel a metre off), orange, hotter down its middle, fading toward the tail.
const TRACER := """shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled, skip_vertex_transform;
uniform float pix = 0.002;
varying vec2 st;
void vertex() {
	vec3 tail = MODEL_MATRIX[3].xyz;
	vec3 along = MODEL_MATRIX[2].xyz;
	vec3 dir = normalize(along);
	vec3 p = tail + along * VERTEX.x;
	vec3 to_cam = INV_VIEW_MATRIX[3].xyz - p;
	float dist = length(to_cam);
	vec3 side = normalize(cross(dir, to_cam / max(dist, 0.001)));
	p += side * VERTEX.y * max(0.09, dist * pix);
	st = VERTEX.xy;
	VERTEX = (VIEW_MATRIX * vec4(p, 1.0)).xyz;
	NORMAL = vec3(0.0, 0.0, 1.0);
}
void fragment() {
	float across = 1.0 - st.y * st.y;
	float core = pow(across, 5.0);
	vec3 c = vec3(1.0, 0.3, 0.08) * across * 1.3 + vec3(1.0, 0.7, 0.35) * core * 0.9;
	ALBEDO = c * smoothstep(0.0, 0.9, st.x) * COLOR.a;
}
"""

var w: Node
var sites: Array = []
var strike := false
var alarm := ""  # what you hear: "fire", "track", "base" or nothing
var _mm: MultiMesh
var _mat: ShaderMaterial
var _streaks: Array = []  # [tail, direction, how far it's gone, how far it goes, bursts]
var _spark: MultiMesh
var _puff: MultiMesh
var _bursts: Array = []  # [where, age]
var _alarm: AudioStreamPlayer
var _low_t := 10.0


func build(world: Node, in_strike: bool) -> void:
	w = world
	strike = in_strike
	world.add_child(self)
	for t in 2:
		var b: Array = D.BASES[t]
		var s := 1.0 if t == 0 else -1.0
		for e in LAYOUT:
			if not in_strike and e[0] != "cram":
				continue
			var site: StaticBody3D = Site.new()
			var yaw0 := -PI / 2.0 if e[0] == "hangar" else (0.0 if t == 0 else PI)
			site.setup(w, e[0], t, float(b[0]) + e[1], float(b[1]) - s * float(e[2]), yaw0, in_strike)
			sites.append(site)
	# the tracers, and the bursts of the rounds that miss (a spark and a puff of smoke), drawn all at once
	var q := ArrayMesh.new()
	var a := []
	a.resize(Mesh.ARRAY_MAX)
	a[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(0, -1, 0), Vector3(1, -1, 0), Vector3(1, 1, 0), Vector3(0, 1, 0)])
	a[Mesh.ARRAY_INDEX] = PackedInt32Array([0, 1, 2, 0, 2, 3])
	q.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	var sh := Shader.new()
	sh.code = TRACER
	_mat = ShaderMaterial.new()
	_mat.shader = sh
	q.surface_set_material(0, _mat)
	_mm = _multi(q, TR_MAX)
	var sp := QuadMesh.new()
	sp.size = Vector2(1, 1)
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	sm.billboard_keep_scale = true
	sm.vertex_color_use_as_albedo = true
	sm.albedo_texture = w.flash_material().albedo_texture
	sm.albedo_color = Color(3, 2.4, 1.6)
	sp.material = sm
	_spark = _multi(sp, BURST_MAX)
	var pp := QuadMesh.new()
	pp.size = Vector2(1, 1)
	var pm: StandardMaterial3D = sm.duplicate()
	pm.blend_mode = BaseMaterial3D.BLEND_MODE_MIX
	pm.albedo_color = Color(0.55, 0.54, 0.52)
	pp.material = pm
	_puff = _multi(pp, BURST_MAX)
	_alarm = AudioStreamPlayer.new()
	_alarm.volume_db = -8.0
	add_child(_alarm)


func _multi(mesh: Mesh, n: int) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = mesh
	mm.instance_count = n
	mm.visible_instance_count = 0
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.custom_aabb = AABB(Vector3(-8000, -2000, -8000), Vector3(16000, 8000, 16000))
	add_child(mi)
	return mm


## A round fired from `from` along dir, flying `reach` metres (bursting there if it's one of those that burst).
func streak(from: Vector3, dir: Vector3, reach: float, burst: bool) -> void:
	if _streaks.size() >= TR_MAX:
		_streaks.pop_front()
	_streaks.append([from, dir, 0.0, reach, burst])


func _process(dt: float) -> void:
	var n := 0
	var i := _streaks.size() - 1
	while i >= 0:
		var s: Array = _streaks[i]
		s[2] += TR_SPEED * dt
		var d: float = s[2]
		var reach: float = s[3]
		if d - TR_LEN > reach:
			if s[4] and _bursts.size() < BURST_MAX:
				_bursts.append([s[0] + s[1] * reach + Vector3(randf_range(-3, 3), randf_range(-3, 3), randf_range(-3, 3)), 0.0])
			_streaks.remove_at(i)
			i -= 1
			continue
		var head := minf(d, reach)
		var tail := maxf(0.0, d - TR_LEN)
		var dir: Vector3 = s[1]
		var side := dir.cross(Vector3.UP if absf(dir.y) < 0.95 else Vector3.RIGHT).normalized()
		_mm.set_instance_transform(n, Transform3D(Basis(side, dir.cross(side), dir * maxf(0.5, head - tail)), s[0] + dir * tail))
		_mm.set_instance_color(n, Color(1, 1, 1, 1.0 - maxf(0.0, (d - reach * 0.8) / (reach * 0.4)) * 0.6))
		n += 1
		i -= 1
	_mm.visible_instance_count = n
	var cam := get_viewport().get_camera_3d()
	if cam:
		_mat.set_shader_parameter("pix", 2.6 * 2.0 * tan(deg_to_rad(cam.fov) / 2.0) / maxf(1.0, get_viewport().get_visible_rect().size.y))
	# the bursts: a spark that flashes and goes, a puff that swells and fades
	var k := 0
	var j := _bursts.size() - 1
	while j >= 0:
		var b: Array = _bursts[j]
		b[1] += dt
		var age: float = b[1]
		if age > 1.6:
			_bursts.remove_at(j)
			j -= 1
			continue
		var p: Vector3 = b[0]
		var sk := maxf(0.0, 1.0 - age / 0.18)
		_spark.set_instance_transform(k, Transform3D(Basis.from_scale(Vector3.ONE * (2.5 + age * 6.0)), p))
		_spark.set_instance_color(k, Color(1, 1, 1, sk))
		_puff.set_instance_transform(k, Transform3D(Basis.from_scale(Vector3.ONE * (1.5 + age * 2.2)), p + Vector3(0, age * 0.6, 0)))
		_puff.set_instance_color(k, Color(1, 1, 1, 0.5 * minf(1.0, age * 8.0) * (1.0 - age / 1.6)))
		k += 1
		j -= 1
	_spark.visible_instance_count = k
	_puff.visible_instance_count = k
	_alarms(dt)


## The alarms for you: an enemy C-RAM tracking your aircraft (a slow beep; fast while it fires at you), or your side's
## guns near you firing at something coming in (the base's siren). Flying low near an enemy one it can't see you yet:
## a word about that now and then.
func _alarms(dt: float) -> void:
	var want := ""
	var v = w.player.vehicle if w.player else null
	if v and is_instance_valid(v) and not v.dead and v.get("jet"):
		var near := false
		for s in sites:
			if s.dead or s.kind != "cram":
				continue
			if s.team != v.team:
				if s.target == v:
					want = "fire" if s.firing else ("track" if want != "fire" else want)
				elif s.global_position.distance_to(v.global_position) < 1500.0:
					near = true
			elif want == "" and s.firing and not s.target_air and s.global_position.distance_to(v.global_position) < 1300.0:
				want = "base"
		_low_t -= dt
		if near and want == "" and _low_t <= 0.0 and Site.low(v.global_position) < 0.3:
			_low_t = 25.0
			w.hud.toast("UNDER THE RADAR · THE C-RAM CAN'T SEE YOU THIS LOW TILL YOU'RE CLOSE")
	if w.conquest.over:
		want = ""
	if want != alarm:
		alarm = want
		if want == "":
			_alarm.stop()
		else:
			_alarm.stream = w.sounds[{"fire": "beepfast", "track": "beep", "base": "siren"}[want]]
			_alarm.volume_db = -14.0 if want == "base" else -10.0
			_alarm.play()


## A blast at pos reaching the installations near it (measured from their sides and top): `power` close in, less out
## to the edge of radius.
func blast(pos: Vector3, rad: float, power: float, by: Node, what: String) -> void:
	var r := rad + 1.5
	for s in sites:
		if s.dead:
			continue
		var c: Vector3 = s.global_position
		var dh := maxf(0.0, Vector2(pos.x - c.x, pos.z - c.z).length() - float(s.radius))
		var dv := maxf(0.0, maxf(pos.y - (c.y + float(s.top)), c.y - 3.0 - pos.y))
		var d := sqrt(dh * dh + dv * dv)
		if d < r:
			s.hit(power * (1.0 - d / r * 0.85), by, what)


## One knocked out: the points to whoever did it, a word to you, a line in the feed, and (in a Ground Strike) its side's
## tickets; with its side's last one gone, its side has lost.
func destroyed(s: Node, by: Node, what: String) -> void:
	var cq = w.conquest
	var sc: int = s.K["score"]
	if by and by.get("score") != null:
		by.score += sc
	if by == w.player:
		w.hud.toast("+%d  %s DESTROYED" % [sc, s.label])
	elif s.team == w.player.team:
		w.hud.toast("OUR %s WAS DESTROYED" % s.label)
	else:
		w.hud.toast("ENEMY %s DESTROYED" % s.label)
	cq.feed.push_front([by.tag if by else "", what, s.label, by.team if by else 1 - s.team, s.team, 6.0])
	if cq.feed.size() > 6:
		cq.feed.pop_back()
	if s.counts and not cq.over:
		cq.tickets[s.team] = maxf(0.0, cq.tickets[s.team] - float(s.K["tickets"]))
		var left := false
		for o in sites:
			if o.team == s.team and o.counts and not o.dead:
				left = true
		if not left:
			cq.tickets[s.team] = 0.0


## The installations an aircraft of `team` could go for: the other side's still standing.
func enemy_sites(team: int) -> Array:
	return sites.filter(func(s) -> bool: return s.team != team and not s.dead)
