extends Node3D
## Sixth Front (Godot edition): the battle's root. Lighting, quality levels, materials and effects, and the match:
## the menus, deploying, both armies and the end.

static var I: Node3D

const D := preload("res://scripts/data.gd")
const PlayerScript := preload("res://scripts/player.gd")
const SoldierScript := preload("res://scripts/soldier.gd")
const HudScript := preload("res://scripts/hud.gd")
const MenuScript := preload("res://scripts/menu.gd")
const MapScript := preload("res://scripts/map.gd")
const TerrainScript := preload("res://scripts/terrain.gd")
const ConquestScript := preload("res://scripts/conquest.gd")
const QNAMES := ["LOW", "MEDIUM", "HIGH", "ULTRA"]

var fplus := true
var method := ""
var mobile := false
var quality := 2
var env: Environment
var sun: DirectionalLight3D
var mats := {}
var sounds := {}
var player: CharacterBody3D
var hud: Control
var menu: Control
var conquest: Node
var soldiers: Array = []
var menu_open := true
var difficulty := "normal"
var per_team := 12
var fov := 75.0
var sens := 1.0
var overview: Camera3D
var _decals: Array[Node3D] = []
var _hole_tex: GradientTexture2D
var _flash_mat: StandardMaterial3D
var _glow := {}
var _detail: StandardMaterial3D
var _soldier_mat: StandardMaterial3D


func _ready() -> void:
	I = self
	randomize()
	method = RenderingServer.get_current_rendering_method()
	fplus = method == "forward_plus"
	mobile = OS.has_feature("mobile")
	per_team = 8 if mobile else 12
	for n in ["rifle", "smg", "lmg", "sniper", "pistol", "reload", "empty", "step", "hit", "boom", "knife"]:
		sounds[n] = load("res://sounds/%s.wav" % n)
	_make_materials()
	_make_environment()
	TerrainScript.build(self)
	MapScript.build(self)
	conquest = ConquestScript.new()
	add_child(conquest)
	conquest.setup(self, D.RULES["tickets"])
	overview = Camera3D.new()
	add_child(overview)
	overview.position = Vector3(-70, 60, 250)
	overview.look_at(Vector3(0, 5, 0))
	overview.current = true
	player = PlayerScript.new()
	add_child(player)
	player.global_position = Vector3(0, -50, 0)
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = HudScript.new()
	layer.add_child(hud)
	var ml := CanvasLayer.new()
	ml.layer = 2
	add_child(ml)
	menu = MenuScript.new()
	ml.add_child(menu)
	set_quality(1 if mobile or not fplus else 2)
	menu.show_main()
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			_shots(a.substr(7))


## Test helper: `-- --shot=/path/prefix` starts a battle and saves screenshots from a few places, then quits.
func _shots(prefix: String) -> void:
	set_meta("shot", true)
	await get_tree().process_frame
	start_match("assault")
	var views := [[Vector3(0, 0, 200), 0.0, -0.05], [Vector3(-8, 0, 22), 0.2, -0.02], [Vector3(-118, 0, 130), -2.3, -0.05], [Vector3(30, 0, -20), PI, 0.0]]
	for i in views.size():
		var v: Vector3 = views[i][0]
		player.global_position = Vector3(v.x, TerrainScript.height(v.x, v.z) + 0.2, v.z)
		player.yaw = views[i][1]
		player.pitch = views[i][2]
		player._protect = 999.0
		for f in 150:
			await get_tree().process_frame
		get_viewport().get_texture().get_image().save_png("%s-%d.png" % [prefix, i])
	player._melee()
	while player._melee_t > 0.25:
		await get_tree().process_frame
	get_viewport().get_texture().get_image().save_png("%s-knife.png" % prefix)
	get_tree().quit()


func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo and e.physical_keycode == KEY_F2:
		set_quality((quality + 1) % 4)


func mat(n: String) -> Material:
	return mats[n]


# ---------------------------------------------------------------- lighting and quality

func _make_environment() -> void:
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-23, -38, 0)
	sun.light_color = Color(1.0, 0.85, 0.68)
	sun.light_energy = 2.6
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 130.0
	sun.directional_shadow_blend_splits = true
	add_child(sun)
	var sky_mat := PhysicalSkyMaterial.new()
	sky_mat.turbidity = 5.0
	sky_mat.mie_coefficient = 0.005
	sky_mat.ground_color = Color(0.32, 0.27, 0.21)
	var sky := Sky.new()
	sky.sky_material = sky_mat
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_white = 6.0
	env.glow_intensity = 0.45
	env.glow_bloom = 0.03
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.fog_enabled = true
	env.fog_light_color = Color(0.74, 0.68, 0.6)
	env.fog_density = 0.0016
	env.fog_sun_scatter = 0.3
	env.fog_aerial_perspective = 0.5
	env.fog_sky_affect = 0.25
	env.adjustment_enabled = true
	env.adjustment_contrast = 1.06
	env.adjustment_saturation = 1.1
	env.volumetric_fog_density = 0.005
	env.volumetric_fog_albedo = Color(0.92, 0.86, 0.78)
	env.volumetric_fog_anisotropy = 0.55
	env.volumetric_fog_length = 80.0
	env.volumetric_fog_sky_affect = 0.0
	env.ssao_radius = 1.2
	env.ssao_intensity = 1.8
	env.sdfgi_use_occlusion = true
	env.sdfgi_energy = 1.1
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)


func set_quality(q: int) -> void:
	quality = clampi(q, 0, 3)
	var vp := get_viewport()
	env.ssao_enabled = fplus and quality >= 1
	env.sdfgi_enabled = fplus and quality >= 2
	env.volumetric_fog_enabled = fplus and quality >= 2
	env.ssil_enabled = fplus and quality >= 3
	env.ssr_enabled = fplus and quality >= 3
	env.glow_enabled = quality >= 1
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS if quality >= 1 else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.light_angular_distance = 0.5 if quality >= 3 else 0.0
	RenderingServer.directional_shadow_atlas_set_size(4096 if quality >= 2 else 2048, true)
	vp.msaa_3d = Viewport.MSAA_2X if not fplus and quality >= 2 else Viewport.MSAA_DISABLED
	if method == "gl_compatibility":
		return
	vp.use_taa = fplus and quality >= 2
	vp.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA if not vp.use_taa else Viewport.SCREEN_SPACE_AA_DISABLED
	var scale: float = ([0.6, 0.8, 1.0, 1.0] if mobile else [0.67, 0.85, 1.0, 1.0])[quality]
	vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR if scale < 1.0 else Viewport.SCALING_3D_MODE_BILINEAR
	vp.scaling_3d_scale = scale


# ---------------------------------------------------------------- materials (made in code: no texture files)

func _noise_mat(cols: Array, freq: float, bump: float, rough: float, tile: float, cellular := false, metal := 0.0, world := true) -> StandardMaterial3D:
	var n := FastNoiseLite.new()
	n.noise_type = FastNoiseLite.TYPE_CELLULAR if cellular else FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = freq
	n.fractal_octaves = 5
	n.seed = randi() % 100000
	var g := Gradient.new()
	var offs := PackedFloat32Array()
	for i in cols.size():
		offs.append(i / float(cols.size() - 1))
	g.offsets = offs
	g.colors = PackedColorArray(cols)
	var sz := 256 if mobile else 512
	var alb := NoiseTexture2D.new()
	alb.width = sz
	alb.height = sz
	alb.seamless = true
	alb.noise = n
	alb.color_ramp = g
	var nor := NoiseTexture2D.new()
	nor.width = sz
	nor.height = sz
	nor.seamless = true
	nor.noise = n
	nor.as_normal_map = true
	nor.bump_strength = bump
	var m := StandardMaterial3D.new()
	m.albedo_texture = alb
	m.normal_enabled = true
	m.normal_texture = nor
	m.roughness = rough
	m.metallic = metal
	m.uv1_triplanar = true
	m.uv1_world_triplanar = world
	m.uv1_scale = Vector3.ONE / tile
	return m


func _pattern_mat(kind: String, base: Color, rough: float, tile: float, metal := 0.0) -> StandardMaterial3D:
	var S := 256
	var nz := FastNoiseLite.new()
	nz.frequency = 0.03
	nz.fractal_octaves = 4
	nz.seed = randi() % 100000
	var ni := nz.get_seamless_image(S, S)
	var h := Image.create(S, S, false, Image.FORMAT_RGBA8)
	var a := Image.create(S, S, false, Image.FORMAT_RGBA8)
	for y in S:
		for x in S:
			var n := ni.get_pixel(x, y).r
			var hv := 0.0
			var c := base
			if kind == "corrugated":
				hv = 0.5 + 0.5 * sin(x / float(S) * TAU * 8.0)
				c = base * (0.8 + 0.35 * n)
			elif kind == "planks":
				var gap := fmod(float(y), 64.0) < 3.0
				hv = 0.0 if gap else 0.75 + 0.25 * n
				c = base * (0.45 if gap else 0.75 + 0.45 * n)
			else:
				var bx := fmod(float(x) + (32.0 if (y / 32) % 2 == 1 else 0.0), 64.0)
				var mortar := bx < 3.0 or fmod(float(y), 32.0) < 3.0
				hv = 0.0 if mortar else 0.8 + 0.2 * n
				c = base * (0.7 if mortar else 0.82 + 0.3 * n)
			c.a = 1.0
			h.set_pixel(x, y, Color(hv, hv, hv))
			a.set_pixel(x, y, c)
	h.bump_map_to_normal_map(6.0 if kind == "corrugated" else 3.0)
	h.generate_mipmaps()
	a.generate_mipmaps()
	var m := StandardMaterial3D.new()
	m.albedo_texture = ImageTexture.create_from_image(a)
	m.normal_enabled = true
	m.normal_texture = ImageTexture.create_from_image(h)
	m.roughness = rough
	m.metallic = metal
	m.uv1_triplanar = true
	m.uv1_world_triplanar = true
	m.uv1_scale = Vector3.ONE / tile
	return m


func _plain(c: Color, rough: float, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	return m


func _make_materials() -> void:
	mats["ground"] = _noise_mat([Color(0.40, 0.34, 0.26), Color(0.54, 0.46, 0.35), Color(0.61, 0.54, 0.42), Color(0.46, 0.39, 0.30)], 0.03, 7.0, 0.95, 3.0)
	mats["road"] = _noise_mat([Color(0.11, 0.11, 0.11), Color(0.2, 0.19, 0.18), Color(0.15, 0.15, 0.15)], 0.08, 5.0, 0.85, 2.0)
	mats["concrete"] = _noise_mat([Color(0.42, 0.41, 0.39), Color(0.58, 0.57, 0.54), Color(0.5, 0.49, 0.46)], 0.04, 3.0, 0.9, 2.0)
	mats["plaster"] = _noise_mat([Color(0.52, 0.46, 0.37), Color(0.64, 0.58, 0.47), Color(0.59, 0.52, 0.42)], 0.02, 2.5, 0.92, 3.0)
	mats["plaster2"] = _noise_mat([Color(0.48, 0.44, 0.4), Color(0.6, 0.57, 0.52), Color(0.54, 0.5, 0.45)], 0.02, 2.5, 0.92, 3.0)
	mats["sandbag"] = _noise_mat([Color(0.42, 0.38, 0.28), Color(0.56, 0.5, 0.38)], 0.1, 6.0, 1.0, 1.0)
	mats["blocks"] = _pattern_mat("blocks", Color(0.62, 0.6, 0.56), 0.9, 1.6)
	mats["wood"] = _pattern_mat("planks", Color(0.56, 0.41, 0.26), 0.8, 1.2)
	var corr := _pattern_mat("corrugated", Color(1, 1, 1), 0.55, 2.4, 0.5)
	for c in [["red", Color(0.5, 0.16, 0.1)], ["blue", Color(0.12, 0.24, 0.42)], ["green", Color(0.2, 0.33, 0.2)], ["orange", Color(0.7, 0.38, 0.12)], ["grey", Color(0.45, 0.46, 0.46)]]:
		var m: StandardMaterial3D = corr.duplicate()
		m.albedo_color = c[1]
		mats["container_" + c[0]] = m
	mats["camo"] = _noise_mat([Color(0.3, 0.31, 0.21), Color(0.5, 0.46, 0.34), Color(0.34, 0.27, 0.19), Color(0.2, 0.2, 0.15)], 0.025, 2.0, 0.95, 0.5, true, 0.0, false)
	mats["olive"] = _noise_mat([Color(0.2, 0.22, 0.15), Color(0.27, 0.29, 0.2)], 0.1, 2.0, 0.9, 0.4, false, 0.0, false)
	mats["gunmetal"] = _noise_mat([Color(0.14, 0.14, 0.15), Color(0.21, 0.21, 0.22)], 0.15, 1.0, 0.5, 0.25, false, 0.45, false)
	mats["polymer"] = _noise_mat([Color(0.15, 0.14, 0.13), Color(0.22, 0.21, 0.19)], 0.2, 1.5, 0.75, 0.2, false, 0.0, false)
	mats["tan"] = _noise_mat([Color(0.5, 0.44, 0.33), Color(0.6, 0.54, 0.41)], 0.1, 1.5, 0.8, 0.3, false, 0.0, false)
	mats["skin"] = _plain(Color(0.62, 0.45, 0.35), 0.6)
	mats["glove"] = _plain(Color(0.12, 0.11, 0.1), 0.8)
	mats["glass"] = _plain(Color(0.04, 0.05, 0.06), 0.06, 0.3)
	mats["metal"] = _plain(Color(0.42, 0.43, 0.44), 0.4, 0.85)
	mats["barrel_red"] = _plain(Color(0.45, 0.1, 0.07), 0.5, 0.6)
	mats["barrel_blue"] = _plain(Color(0.1, 0.2, 0.4), 0.5, 0.6)
	mats["lamp"] = glow_mat(Color(1.0, 0.8, 0.55), 3.0)
	_hole_tex = GradientTexture2D.new()
	_hole_tex.fill = GradientTexture2D.FILL_RADIAL
	_hole_tex.fill_from = Vector2(0.5, 0.5)
	_hole_tex.fill_to = Vector2(0.5, 0.0)
	var hg := Gradient.new()
	hg.offsets = PackedFloat32Array([0.0, 0.35, 0.6, 1.0])
	hg.colors = PackedColorArray([Color(0.02, 0.02, 0.02, 1), Color(0.05, 0.04, 0.04, 0.95), Color(0.2, 0.18, 0.15, 0.5), Color(0.3, 0.27, 0.22, 0)])
	_hole_tex.gradient = hg
	var ft := GradientTexture2D.new()
	ft.fill = GradientTexture2D.FILL_RADIAL
	ft.fill_from = Vector2(0.5, 0.5)
	ft.fill_to = Vector2(0.5, 0.0)
	var fg := Gradient.new()
	fg.colors = PackedColorArray([Color(1, 0.9, 0.6, 1), Color(1, 0.5, 0.1, 0)])
	ft.gradient = fg
	_flash_mat = StandardMaterial3D.new()
	_flash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_flash_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_flash_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_flash_mat.albedo_texture = ft
	_flash_mat.albedo_color = Color(4, 3, 2)
	_flash_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	_flash_mat.no_depth_test = false


func glow_mat(c: Color, energy: float) -> StandardMaterial3D:
	var key := "%s/%s" % [c, energy]
	if not _glow.has(key):
		var m := StandardMaterial3D.new()
		m.albedo_color = Color.BLACK
		m.emission_enabled = true
		m.emission = c
		m.emission_energy_multiplier = energy
		_glow[key] = m
	return _glow[key]


func flash_material() -> StandardMaterial3D:
	return _flash_mat


# ---------------------------------------------------------------- effects

func tracer(a: Vector3, b: Vector3) -> void:
	var d := a.distance_to(b)
	if d < 2.0:
		return
	var m := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.02, 0.02, minf(d * 0.5, 5.0))
	m.mesh = bm
	m.material_override = glow_mat(Color(1.0, 0.75, 0.4), 9.0)
	m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(m)
	var dir := (b - a) / d
	m.look_at_from_position(a, b, Vector3.RIGHT if absf(dir.y) > 0.98 else Vector3.UP)
	var tw := m.create_tween()
	tw.tween_property(m, "global_position", b, d / 450.0)
	tw.tween_callback(m.queue_free)


func flash(pos: Vector3, size := 0.5) -> void:
	var l := OmniLight3D.new()
	l.light_color = Color(1.0, 0.7, 0.4)
	l.light_energy = 3.0
	l.omni_range = 5.0
	add_child(l)
	l.global_position = pos
	var q := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(size, size)
	q.mesh = qm
	q.material_override = _flash_mat
	q.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(q)
	q.global_position = pos
	get_tree().create_timer(0.05).timeout.connect(func(): l.queue_free(); q.queue_free())


func impact(pos: Vector3, normal: Vector3, flesh := false) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.explosiveness = 1.0
	p.amount = 10
	p.lifetime = 0.7
	p.direction = normal
	p.spread = 40.0
	p.initial_velocity_min = 1.5
	p.initial_velocity_max = 5.0
	p.gravity = Vector3(0, -9.8, 0)
	var pm := BoxMesh.new()
	pm.size = Vector3.ONE * (0.035 if flesh else 0.03)
	pm.material = _plain(Color(0.35, 0.03, 0.02) if flesh else Color(0.3, 0.27, 0.22), 1.0)
	p.mesh = pm
	add_child(p)
	p.global_position = pos + normal * 0.02
	p.emitting = true
	var puff := CPUParticles3D.new()
	puff.one_shot = true
	puff.explosiveness = 0.9
	puff.amount = 6
	puff.lifetime = 0.9
	puff.direction = normal
	puff.spread = 25.0
	puff.initial_velocity_min = 0.4
	puff.initial_velocity_max = 1.4
	puff.gravity = Vector3(0, 0.3, 0)
	puff.scale_amount_min = 0.6
	puff.scale_amount_max = 1.4
	var qm := QuadMesh.new()
	qm.size = Vector2(0.35, 0.35)
	var dm := StandardMaterial3D.new()
	dm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dm.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	dm.vertex_color_use_as_albedo = true
	dm.albedo_texture = _hole_tex
	qm.material = dm
	puff.mesh = qm
	var cr := Gradient.new()
	cr.colors = PackedColorArray([Color(0.5, 0.05, 0.03, 0.8), Color(0.4, 0.03, 0.02, 0)] if flesh else [Color(0.62, 0.57, 0.5, 0.55), Color(0.62, 0.57, 0.5, 0)])
	puff.color_ramp = cr
	add_child(puff)
	puff.global_position = pos + normal * 0.05
	puff.emitting = true
	get_tree().create_timer(1.5).timeout.connect(func(): p.queue_free(); puff.queue_free())
	if flesh:
		return
	var dcl := Decal.new()
	dcl.size = Vector3(0.14, 0.1, 0.14)
	dcl.texture_albedo = _hole_tex
	dcl.cull_mask = 1
	add_child(dcl)
	var y := normal.normalized()
	var x := y.cross(Vector3.UP if absf(y.y) < 0.95 else Vector3.RIGHT).normalized()
	dcl.global_transform = Transform3D(Basis(x, y, x.cross(y)), pos)
	_decals.append(dcl)
	if _decals.size() > 60:
		_decals.pop_front().queue_free()


func sound3d(n: String, pos: Vector3, db := 0.0) -> void:
	var s := AudioStreamPlayer3D.new()
	s.stream = sounds[n]
	s.volume_db = db
	s.pitch_scale = randf_range(0.94, 1.06)
	s.unit_size = 14.0
	s.max_distance = 250.0
	add_child(s)
	s.global_position = pos
	s.play()
	s.finished.connect(s.queue_free)


func sound(n: String, db := 0.0) -> void:
	var s := AudioStreamPlayer.new()
	s.stream = sounds[n]
	s.volume_db = db
	s.pitch_scale = randf_range(0.96, 1.04)
	add_child(s)
	s.play()
	s.finished.connect(s.queue_free)


func start_match(cls: String) -> void:
	var names: Array = D.BOT_NAMES.duplicate()
	names.shuffle()
	var k := 0
	for t in 2:
		var n: int = per_team - (1 if t == player.team else 0)
		for i in n:
			var s: CharacterBody3D = SoldierScript.new()
			s.setup(self, t, D.CLASS_ORDER[i % 4], names[k % names.size()])
			k += 1
			add_child(s)
			soldiers.append(s)
			s.deploy(conquest.spawn_at(t, conquest.spawn_points(t)[0]))
	soldiers.append(player)
	deploy_player(cls, 0)


func deploy_player(cls: String, idx: int) -> void:
	if not conquest.use_ticket(player.team):
		return
	var pts: Array = conquest.spawn_points(player.team)
	player.deploy(conquest.spawn_at(player.team, pts[clampi(idx, 0, pts.size() - 1)]), cls)
	menu.visible = false
	menu_open = false
	hud.reset_touch()
	if not hud.touch_ui:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func on_player_dead() -> void:
	if conquest.over:
		return
	menu_open = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	menu.show_deploy()


func on_match_end(win: int) -> void:
	await get_tree().create_timer(2.5).timeout
	menu_open = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	menu.show_end(win)


func explode(pos: Vector3, radius: float, dmg: float, by: Node, what: String) -> void:
	flash(pos + Vector3(0, 0.5, 0), 3.0)
	for i in 3:
		impact(pos, Vector3(randf_range(-0.5, 0.5), 1, randf_range(-0.5, 0.5)).normalized())
	sound3d("boom", pos, 6.0)
	var space := get_world_3d().direct_space_state
	for s in soldiers:
		if s.dead:
			continue
		var d: float = s.global_position.distance_to(pos)
		if d > radius:
			continue
		var chest: Vector3 = s.global_position + Vector3(0, 1.0, 0)
		var blocked := not space.intersect_ray(PhysicsRayQueryParameters3D.create(pos + Vector3(0, 0.3, 0), chest, 1)).is_empty()
		s.damage(dmg * (1.0 - d / radius) * (0.35 if blocked else 1.0), pos, by, false, what)


func detail_mat() -> StandardMaterial3D:
	if not _detail:
		_detail = _noise_mat([Color(0.78, 0.78, 0.78), Color(1, 1, 1), Color(0.88, 0.88, 0.88)], 0.05, 4.0, 0.95, 4.0)
		_detail.vertex_color_use_as_albedo = true
		_detail.vertex_color_is_srgb = true
	return _detail


func soldier_mat() -> StandardMaterial3D:
	if not _soldier_mat:
		_soldier_mat = _noise_mat([Color(0.8, 0.8, 0.8), Color(1, 1, 1)], 0.2, 2.0, 0.85, 0.3, false, 0.0, false)
		_soldier_mat.vertex_color_use_as_albedo = true
		_soldier_mat.vertex_color_is_srgb = true
	return _soldier_mat
