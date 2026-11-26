extends Control
## The menus: the main menu (battle, map, class, bot skill, battle size, graphics), the deploy screen after you fall
## (class and spawn point) and the end of the match.

const D := preload("res://scripts/data.gd")

var w: Node
var box: VBoxContainer
var sel_class := "assault"
var sel_spawn := 0
var mode := ""


func _ready() -> void:
	w = get_parent().get_parent()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var bg := ColorRect.new()
	bg.color = Color(0.02, 0.03, 0.03, 0.6)
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	box = VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	center.add_child(box)


func _clear() -> void:
	for c in box.get_children():
		box.remove_child(c)
		c.queue_free()


func _label(t: String, sz: int, col := Color(1, 1, 1, 0.9)) -> void:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", sz)
	l.add_theme_color_override("font_color", col)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.custom_minimum_size = Vector2(900, 0)
	box.add_child(l)


func _row(kind: String, items: Array, current) -> void:
	var h := HBoxContainer.new()
	h.alignment = BoxContainer.ALIGNMENT_CENTER
	h.add_theme_constant_override("separation", 8)
	for it in items:
		var b := Button.new()
		b.text = it[0]
		b.toggle_mode = true
		b.button_pressed = it[1] == current
		b.custom_minimum_size = Vector2(170, 50)
		b.add_theme_font_size_override("font_size", 17)
		b.pressed.connect(_pick.bind(kind, it[1]))
		h.add_child(b)
	box.add_child(h)


func _big(t: String, cb: Callable) -> void:
	var b := Button.new()
	b.text = t
	b.custom_minimum_size = Vector2(340, 66)
	b.add_theme_font_size_override("font_size", 28)
	b.pressed.connect(cb)
	var c := CenterContainer.new()
	c.add_child(b)
	box.add_child(c)


func _pick(kind: String, v) -> void:
	match kind:
		"class":
			sel_class = v
		"diff":
			w.difficulty = v
		"size":
			w.per_team = v
		"gfx":
			w.set_quality(v)
		"spawn":
			sel_spawn = v
		"mode":
			D.air_mode = "air" if v == 0 else "strike"
			if v > 0:
				D.air_plane = v - 1
			_save("air_mode", D.air_mode)
			_save("air_plane", D.air_plane)
		"map":
			var air := D.battle == "air"
			if v != (D.air_map if air else D.map):
				_save("air_map" if air else "map", v)
				w.reload(v, air)
				return
		"battle":
			if v != D.battle:
				_save("battle", v)
				var cf := ConfigFile.new()
				cf.load("user://settings.cfg")
				w.reload(cf.get_value("game", "air_map", 0) if v == "air" else D.map, v == "air")
				return
	if mode == "main":
		show_main()
	else:
		show_deploy()


## Keeps a choice for next time (the battle and the maps are opened on).
func _save(key: String, v) -> void:
	var cf := ConfigFile.new()
	cf.load("user://settings.cfg")
	cf.set_value("game", key, v)
	cf.save("user://settings.cfg")


func _classes() -> Array:
	var items := []
	for c in D.CLASS_ORDER:
		items.append([D.CLASSES[c]["name"], c])
	return items


func show_main() -> void:
	mode = "main"
	visible = true
	_clear()
	var air := D.battle == "air"
	_label("SIXTH FRONT", 60, Color(1, 0.86, 0.58))
	# the battle, then its maps (no headings: the screen's full)
	_row("battle", [["CONQUEST", "infantry"], ["AVIATION", "air"]], D.battle)
	var list: Array = D.AIR_MAPS if air else D.MAPS
	var maps := []
	for i in list.size():
		maps.append([list[i]["name"], i])
	_row("map", maps, D.air_map if air else D.map)
	if air:
		# the mode, and in a Ground Strike what you fly, in one row
		var strike := D.air_mode == "strike"
		var fname: String = String(D.JETS[0]["name"]).get_slice(" ", 0)
		var bname: String = String(D.BOMBERS[0]["name"]).get_slice(" ", 0)
		_row("mode", [["AIR SUPERIORITY", 0], ["GROUND STRIKE · " + fname, 1], ["GROUND STRIKE · " + bname, 2]], (2 if D.air_plane == 1 else 1) if strike else 0)
		var them: String = D.TEAMS[1]["name"]
		if not strike:
			_label("Your %s against %s's %ss: each jet lost costs a ticket. C-RAM guns guard the airbases." % [fname, them, D.JETS[1]["name"]], 15, Color(1, 1, 1, 0.75))
		elif D.air_plane == 1:
			_label("Bomb %s's airbase, guard yours. Your %s: bombs land on the circle, cruise missiles on what you lock." % [them, bname], 15, Color(1, 1, 1, 0.75))
		else:
			_label("Bomb %s's airbase, guard yours. Your %s: guard your bombers, down theirs, strafe their C-RAM guns." % [them, fname], 15, Color(1, 1, 1, 0.75))
	else:
		_label("CLASS", 15, Color(1, 1, 1, 0.55))
		_row("class", _classes(), sel_class)
		_label(D.CLASSES[sel_class]["blurb"], 15, Color(1, 1, 1, 0.75))
	_label("BOTS", 15, Color(1, 1, 1, 0.55))
	_row("diff", [["RECRUIT", "easy"], ["REGULAR", "normal"], ["VETERAN", "hard"]], w.difficulty)
	if air:
		_row("size", [["4 A SIDE", 4], ["6 A SIDE", 6], ["8 A SIDE", 8]], w.per_team)
	else:
		_row("size", [["8 A SIDE", 8], ["12 A SIDE", 12], ["16 A SIDE", 16]], w.per_team)
	_label("GRAPHICS", 15, Color(1, 1, 1, 0.55))
	_row("gfx", [["LOW", 0], ["MEDIUM", 1], ["HIGH", 2], ["ULTRA", 3]], w.quality)
	_big("TAKE OFF" if air else "DEPLOY", func(): w.start_match(sel_class))
	_label("GODOT EDITION · Models: \"Combat Knife\" by Overlord (Sketchfab), CC BY 4.0 · M1 Abrams by Felipe · \"T-90 with moving turret and barrel\" by kuyongcreates (Printables), CC BY-NC 4.0 · \"Apache AH-64D\" by SalamSadeq (CGTrader) · \"Mi-24\" by Chris Kuhn (BlendSwap), CC BY 3.0 · \"Mil Mi-8AMTSh\" by 42manako (Sketchfab), CC BY 4.0 · \"UH-60 Blackhawk\" from done3d.com · the soldiers: \"A soldier mercenary with helmet and yellow visor\" by ShaderMussolini (Sloyd), CC BY 4.0 · \"F16\" (CGTrader, uploaded by taylor-eudora) · \"SU35S\" by sa893537 (CGTrader)", 12, Color(1, 1, 1, 0.4))


func show_deploy() -> void:
	mode = "deploy"
	visible = true
	_clear()
	var cq = w.conquest
	var t: int = w.player.team
	_label("DEPLOY", 46, Color(1, 0.86, 0.58))
	_label("%s  %d     ·     %s  %d" % [D.TEAMS[t]["short"], ceili(cq.tickets[t]), D.TEAMS[1 - t]["short"], ceili(cq.tickets[1 - t])], 18)
	_row("class", _classes(), sel_class)
	_label(D.CLASSES[sel_class]["blurb"], 15, Color(1, 1, 1, 0.75))
	_label("SPAWN POINT", 15, Color(1, 1, 1, 0.55))
	var pts: Array = cq.spawn_points(t)
	if sel_spawn >= pts.size():
		sel_spawn = 0
	var items := []
	for i in pts.size():
		items.append([pts[i][0], i])
	_row("spawn", items, sel_spawn)
	_big("DEPLOY", func(): w.deploy_player(sel_class, sel_spawn))


func show_end(win: int) -> void:
	mode = "end"
	visible = true
	_clear()
	var p = w.player
	_label("VICTORY" if win == p.team else "DEFEAT", 64, Color(0.5, 0.85, 1.0) if win == p.team else Color(1, 0.4, 0.3))
	_label("%s WIN THE BATTLE FOR %s" % [D.TEAMS[win]["name"], D.MAP_NAME], 20)
	var all: Array = w.pilots() if D.battle == "air" else w.soldiers.duplicate()
	all.sort_custom(func(a, b): return a.score > b.score)
	for i in mini(all.size(), 6):
		var s = all[i]
		_label("%d.  %s  (%s)   %d kills   %d deaths   %d points" % [i + 1, s.tag, D.TEAMS[s.team]["short"], s.kills, s.deaths, s.score], 17,
			Color(1, 0.9, 0.5) if s == p else Color(1, 1, 1, 0.85))
	_big("PLAY AGAIN", func(): w.reload(D.air_map if D.battle == "air" else D.map))


## While another map is built.
func loading() -> void:
	mode = "loading"
	_clear()
	_label("LOADING  %s" % D.MAP_NAME, 34, Color(1, 0.86, 0.58))
