extends RefCounted
## Sixth Front's battle data, carried over from the web game's js/config.js: the teams, the maps (flags,
## headquarters, buildings, roads, cover, ground and light), movement, guns, gadgets, classes, bot difficulty and match rules.

static var TEAMS := [
	{"name": "VANGUARD", "short": "VGD", "color": Color("3fa9f5"), "helmet": Color("4f5638"), "top": Color("6b6a4c"), "pants": Color("5a5a40"), "vest": Color("46492f")},
	{"name": "ONYX", "short": "ONX", "color": Color("ff4b3a"), "helmet": Color("2a2c30"), "top": Color("44474e"), "pants": Color("33363c"), "vest": Color("24262a")},
]

static var MAP_NAME := "KARSA VALLEY"
static var PLAY_HALF := 240.0

# Vanguard deploys from the south, Onyx from the north
static var HQS := [{"x": 0.0, "z": 212.0, "yaw": 0.0}, {"x": 0.0, "z": -212.0, "yaw": PI}]
## The helicopter pads (x, z) beside each headquarters: Vanguard's and Onyx's attack helicopters', then their
## transports'.
static var PADS := [[30.0, 204.0], [-30.0, -204.0], [60.0, 198.0], [-60.0, -198.0]]

static var FLAGS := [
	{"id": "A", "name": "QUARRY", "x": -135.0, "z": 110.0, "radius": 13.0, "flat": 46.0},
	{"id": "B", "name": "OLD MILL", "x": 120.0, "z": 95.0, "radius": 13.0, "flat": 46.0},
	{"id": "C", "name": "MARKET", "x": 0.0, "z": 0.0, "radius": 14.0, "flat": 70.0},
	{"id": "D", "name": "RELAY STATION", "x": -120.0, "z": -100.0, "radius": 13.0, "flat": 46.0},
	{"id": "E", "name": "CEMENT WORKS", "x": 135.0, "z": -105.0, "radius": 13.0, "flat": 46.0},
]

# [centre x, centre z, panels across x, panels across z, floors]; a panel is 3.2 m
static var BUILDINGS := [
	[-30, -30, 4, 4, 3], [0, -33, 4, 3, 2], [31, -31, 4, 4, 2], [-33, 0, 3, 4, 2],
	[33, 2, 3, 5, 3], [-31, 31, 4, 3, 2], [2, 33, 5, 3, 2], [31, 31, 4, 4, 3],
	[-58, -12, 3, 3, 1], [57, -24, 3, 3, 1], [-12, 60, 3, 3, 1], [14, -60, 3, 3, 2],
	[-56, 34, 3, 4, 1], [58, 40, 4, 3, 2],
	[-157, 122, 3, 3, 1], [-117, 94, 4, 3, 2],
	[140, 113, 3, 2, 4], [102, 80, 4, 3, 1], [138, 72, 3, 3, 1],
	[-141, -118, 3, 3, 2], [-100, -84, 3, 3, 1],
	[158, -120, 5, 4, 1], [115, -88, 3, 3, 2],
	[-70, 160, 3, 3, 1], [75, 165, 3, 3, 2], [-185, 20, 3, 3, 2], [185, 0, 3, 4, 1],
	[-70, -165, 3, 3, 2], [70, -160, 3, 3, 1], [-62, 78, 3, 3, 1], [62, -78, 3, 3, 1],
	[-192, -60, 3, 3, 1], [192, 62, 3, 3, 1],
]

static var ROADS := [
	[[0, 250], [0, 212], [25, 160], [120, 95], [70, 40], [0, 0], [-70, -40], [-120, -100], [-30, -160], [0, -212], [0, -250]],
	[[-135, 110], [-75, 60], [0, 0], [75, -55], [135, -105]],
	[[0, 212], [-60, 170], [-135, 110], [-200, 20], [-120, -100]],
	[[0, -212], [60, -170], [135, -105], [195, 10], [120, 95]],
]

## Cover placed by hand: [kind, x, z, turned 90 degrees, container colour] (DUST RIDGE's; KARSA VALLEY has none).
static var PROPS := []
## The ground: the noise seed and how much of each landform (as the web game's map mods have it), how many trees,
## bushes and rocks, and whether it's sand (with green ground round an oasis at [x, z]).
static var LAND := {"seed": 0, "hills": 1.0, "bumps": 1.0, "mountains": 1.0, "valley": 1.0, "trees": 1.0, "bushes": 1.0,
	"rocks": 1.0, "desert": false, "oasis": []}
## The light: the sun (its angles in degrees, colour and strength), the sky's haze, the fog and the exposure.
static var LOOK := {"sun": Vector3(-23, -38, 0), "sun_color": Color(1.0, 0.85, 0.68), "sun_energy": 2.6, "turbidity": 5.0,
	"mie": 0.005, "ground": Color(0.32, 0.27, 0.21), "fog": Color(0.74, 0.68, 0.6), "fog_density": 0.0016,
	"vfog": Color(0.92, 0.86, 0.78), "exposure": 1.0}

## The maps to fight on: KARSA VALLEY (the data above) and DUST RIDGE, from the web game's map mod (a desert under a
## hard midday sun: the bazaar in the middle, walled compounds at the oasis and the outposts, dunes and rocky ridges).
## use_map(i) puts map i's data in place of the current map's; both share the headquarters and helicopter pads.
static var map := 0
static var MAPS := [
	{"name": MAP_NAME, "flags": FLAGS, "buildings": BUILDINGS, "roads": ROADS, "props": PROPS, "land": LAND, "look": LOOK},
	{"name": "DUST RIDGE",
		"flags": [
			{"id": "A", "name": "OASIS", "x": -125.0, "z": 95.0, "radius": 13.0, "flat": 46.0},
			{"id": "B", "name": "PUMP STATION", "x": 115.0, "z": 115.0, "radius": 13.0, "flat": 46.0},
			{"id": "C", "name": "BAZAAR", "x": 0.0, "z": 5.0, "radius": 15.0, "flat": 64.0},
			{"id": "D", "name": "RADAR DOME", "x": -110.0, "z": -115.0, "radius": 13.0, "flat": 46.0},
			{"id": "E", "name": "BORDER POST", "x": 130.0, "z": -85.0, "radius": 13.0, "flat": 46.0}],
		"buildings": [
			[-24.2, 51.0, 4, 4, 1], [33.9, -7.2, 3, 3, 3], [-17.2, -53.5, 2, 3, 1], [-7.0, -22.9, 4, 3, 1], [-31.5, 6.3, 3, 4, 3], [-23.9, -6.4, 2, 3, 2],
			[-55.6, 3.7, 3, 4, 2], [-32.0, -15.8, 2, 3, 3], [18.5, 57.0, 3, 3, 1], [40.8, 21.4, 3, 3, 2], [20.2, -24.0, 3, 2, 3], [-2.9, 52.6, 3, 3, 3],
			[-48.6, -20.9, 4, 4, 1], [-1.8, -37.8, 3, 2, 2], [-106.0, 114.0, 3, 3, 2], [-144.0, 76.0, 3, 3, 1], [134.0, 96.0, 3, 3, 2], [96.0, 134.0, 3, 3, 1],
			[-91.0, -134.0, 3, 3, 2], [-129.0, -96.0, 3, 3, 1], [149.0, -66.0, 3, 3, 2], [111.0, -104.0, 3, 3, 1], [-32.4, 145.5, 3, 3, 1], [49.7, 135.9, 2, 3, 2],
			[138.4, 19.4, 2, 3, 1], [-123.6, -23.4, 2, 3, 2], [-132.2, -42.2, 3, 4, 2], [-71.4, -29.7, 2, 3, 2], [108.0, -32.4, 2, 3, 1], [189.0, 105.7, 3, 4, 2]],
		"roads": [
			[[0.0, 250.0], [0.0, 212.0], [10.0, 150.0], [-20.0, 80.0], [0.0, 5.0], [20.0, -70.0], [0.0, -150.0], [0.0, -212.0], [0.0, -250.0]],
			[[-250.0, 40.0], [-180.0, 70.0], [-125.0, 95.0], [-60.0, 40.0], [0.0, 5.0]],
			[[250.0, -30.0], [190.0, -60.0], [130.0, -85.0], [60.0, -40.0], [0.0, 5.0]],
			[[0.0, 5.0], [60.0, 70.0], [115.0, 115.0], [160.0, 190.0]],
			[[0.0, 5.0], [-55.0, -60.0], [-110.0, -115.0], [-170.0, -180.0]]],
		"props": [
			["block", -102.0, 123.0, false], ["block", -102.0, 67.0, false], ["block", -148.0, 123.0, false], ["block", -148.0, 67.0, false], ["block", 138.0, 143.0, false],
			["block", 138.0, 87.0, false], ["block", 92.0, 143.0, false], ["block", 92.0, 87.0, false], ["block", -87.0, -87.0, false], ["block", -87.0, -143.0, false],
			["block", -133.0, -87.0, false], ["block", -133.0, -143.0, false], ["block", 153.0, -57.0, false], ["block", 153.0, -113.0, false], ["block", 107.0, -57.0, false],
			["block", 107.0, -113.0, false], ["sandbags", -132.8, 97.6, true], ["sandbags", -129.9, 102.3, false], ["sandbags", -120.4, 101.1, false], ["barrier", -115.4, 81.6, true],
			["barrier", -137.5, 103.0, false], ["barrier", -140.1, 107.9, true], ["crate", -136.0, 116.8, false], ["crate", -113.2, 97.0, false], ["crate", -113.8, 76.4, false],
			["crate", -113.3, 86.4, false], ["container", -134.9, 70.7, true, "grey"], ["container", -99.5, 107.4, true, "grey"], ["container", -130.1, 77.4, true, "orange"], ["sandbags", 116.8, 104.3, false],
			["sandbags", 124.7, 116.2, true], ["sandbags", 107.0, 115.3, true], ["barrier", 125.5, 122.3, true], ["barrier", 121.8, 130.0, true], ["barrier", 122.4, 121.0, false],
			["crate", 111.1, 137.9, false], ["crate", 103.9, 93.9, false], ["crate", 106.6, 108.9, false], ["crate", 110.3, 99.2, false], ["container", 123.5, 135.5, false, "red"],
			["container", 141.6, 118.8, true, "orange"], ["container", 103.9, 100.0, true, "red"], ["sandbags", -3.0, -3.5, false], ["sandbags", -7.4, 9.7, true], ["sandbags", 5.2, -2.5, false],
			["sandbags", 1.3, 15.7, false], ["sandbags", 8.4, 7.3, true], ["barrier", -9.2, -11.3, false], ["barrier", -2.8, 19.8, false], ["barrier", 12.7, 15.2, false],
			["barrier", -9.2, 22.6, true], ["barrier", -13.1, 18.9, false], ["crate", -1.0, -11.3, false], ["crate", 7.7, 12.1, false], ["crate", 2.6, -16.3, false],
			["crate", 12.0, 11.1, false], ["container", 20.9, -3.0, true, "red"], ["container", 0.8, 24.8, false, "red"], ["sandbags", -119.3, -116.3, true], ["sandbags", -117.9, -110.2, true],
			["sandbags", -104.8, -108.3, false], ["barrier", -124.9, -109.7, true], ["barrier", -119.3, -121.1, false], ["barrier", -114.3, -133.6, true], ["crate", -129.0, -118.0, false],
			["crate", -93.3, -97.6, false], ["crate", -108.9, -134.5, false], ["crate", -113.3, -90.1, false], ["container", -89.5, -111.9, true, "grey"], ["container", -124.1, -137.6, true, "blue"],
			["container", -98.3, -128.2, true, "red"], ["sandbags", 121.9, -77.9, true], ["sandbags", 129.7, -75.0, false], ["sandbags", 138.8, -89.7, true], ["barrier", 126.8, -102.0, false],
			["barrier", 140.2, -71.5, false], ["barrier", 139.1, -82.6, true], ["crate", 111.5, -88.0, false], ["crate", 151.4, -74.5, false], ["crate", 139.4, -68.1, false],
			["crate", 135.4, -69.9, false], ["container", 134.2, -102.0, false, "orange"], ["container", 119.3, -103.7, true, "orange"], ["container", 128.8, -62.4, false, "grey"], ["container", 111.4, 85.9, true, "grey"],
			["container", 127.7, 98.2, true, "blue"], ["container", 96.0, 125.0, true, "red"], ["container", 110.6, 134.2, false, "green"], ["barrier", 165.0, -68.0, false], ["barrier", 165.0, -56.0, false],
			["ruin", 50.0, 36.5, true], ["ruin", 51.4, 153.9, false], ["ruin", -156.6, 4.1, false], ["ruin", 29.9, -48.7, true], ["ruin", -196.6, 79.7, false],
			["ruin", 135.7, 32.5, true], ["ruin", -102.6, 31.8, true], ["ruin", 70.9, -102.0, true], ["ruin", 136.9, 4.9, false], ["ruin", 42.1, 30.4, false],
			["ruin", 135.1, -109.8, false], ["ruin", 204.2, 44.5, false], ["ruin", -44.8, -29.5, false], ["ruin", -77.7, -18.7, false], ["ruin", -107.8, -82.2, true],
			["ruin", 73.0, -184.5, true], ["ruin", -4.4, -44.7, true], ["ruin", 133.9, 162.0, true], ["ruin", 59.5, 157.1, true], ["ruin", 39.6, 27.9, false],
			["ruin", 13.2, -203.6, true], ["ruin", -94.0, -189.1, true], ["ruin", -206.3, 23.5, true], ["ruin", -21.1, -80.4, true], ["ruin", -124.1, 34.9, false],
			["ruin", 13.4, 117.0, false], ["wreck", -104.7, 77.4, true], ["wreck", 158.8, 185.5, true], ["wreck", -164.9, -176.2, true], ["wreck", -0.6, -153.3, true],
			["wreck", 190.7, -59.1, false], ["wreck", -113.6, -120.3, false],
			["dome", -142.0, -122.0, false]],
		"land": {"seed": 911, "hills": 1.7, "bumps": 0.55, "mountains": 1.3, "valley": 0.4, "trees": 0.06, "bushes": 0.35,
			"rocks": 1.9, "desert": true, "oasis": [-125.0, 95.0]},
		"look": {"sun": Vector3(-58, -38, 0), "sun_color": Color(1.0, 0.945, 0.84), "sun_energy": 2.6, "turbidity": 3.0,
			"mie": 0.004, "ground": Color(0.6, 0.5, 0.36), "fog": Color(0.86, 0.78, 0.64), "fog_density": 0.0012,
			"sky_fog": 0.08, "vfog": Color(0.96, 0.9, 0.78), "exposure": 0.95}},
]


static func use_map(i: int) -> void:
	map = i
	var m: Dictionary = MAPS[i]
	MAP_NAME = m["name"]
	FLAGS = m["flags"]
	BUILDINGS = m["buildings"]
	ROADS = m["roads"]
	PROPS = m["props"]
	LAND = m["land"]
	LOOK = m["look"]

static var MOVE := {"walk": 4.6, "sprint": 7.3, "crouch": 2.5, "ads": 0.6, "jump": 6.2}

static var RULES := {"gravity": 20.0, "health": 100.0, "regen_delay": 5.0, "regen_rate": 14.0, "bullet": 0.7,
	"respawn": 5.0, "protect": 1.5, "capture": 0.085, "tickets": 250,
	# revive: how long a downed soldier lasts, the health he gets back, how long a revive takes (support's defibrillator
	# and anyone else's hands), how close you must be, and the damage that kills outright (a wreck, a knife from behind)
	"bleed": 15.0, "revive_hp": 50.0, "revive_fast": 2.0, "revive_slow": 4.5, "revive_reach": 2.2, "overkill": 200.0}

# Hitscan guns. dmg [near, far] across range [start, end] metres; spread and recoil in radians.
static var WEAPONS := {
	"ar": {"name": "M4K CARBINE", "kind": "auto", "rpm": 760.0, "dmg": [25.0, 17.0], "range": [25.0, 70.0], "mag": 30, "reserve": 150,
		"reload": 2.2, "spread": 0.032, "spread_ads": 0.0035, "bloom": 0.005, "bloom_max": 0.03, "recoil": [0.011, 0.005], "fov": 48.0, "head": 1.8, "sound": "rifle", "bot_range": 110.0},
	"smg": {"name": "VX-9 PDW", "kind": "auto", "rpm": 920.0, "dmg": [22.0, 12.0], "range": [12.0, 40.0], "mag": 40, "reserve": 200,
		"reload": 1.9, "spread": 0.024, "spread_ads": 0.006, "bloom": 0.004, "bloom_max": 0.028, "recoil": [0.008, 0.006], "fov": 56.0, "head": 1.6, "sound": "smg", "bot_range": 70.0},
	"lmg": {"name": "KR-250 LMG", "kind": "auto", "rpm": 680.0, "dmg": [27.0, 20.0], "range": [30.0, 80.0], "mag": 100, "reserve": 200,
		"reload": 4.8, "spread": 0.045, "spread_ads": 0.006, "bloom": 0.004, "bloom_max": 0.035, "recoil": [0.013, 0.008], "fov": 46.0, "head": 1.7, "sound": "lmg", "bot_range": 120.0},
	"sniper": {"name": "SR-338 BOLT", "kind": "bolt", "rpm": 46.0, "dmg": [96.0, 82.0], "range": [60.0, 250.0], "mag": 5, "reserve": 30,
		"reload": 2.6, "spread": 0.05, "spread_ads": 0.0, "bloom": 0.0, "bloom_max": 0.0, "recoil": [0.055, 0.01], "fov": 13.0, "head": 2.6, "sound": "sniper", "scope": true, "bot_range": 230.0},
	"pistol": {"name": "P-19 SIDEARM", "kind": "semi", "rpm": 420.0, "dmg": [30.0, 18.0], "range": [10.0, 35.0], "mag": 15, "reserve": 60,
		"reload": 1.5, "spread": 0.018, "spread_ads": 0.006, "bloom": 0.012, "bloom_max": 0.04, "recoil": [0.02, 0.006], "fov": 60.0, "head": 1.8, "sound": "pistol", "bot_range": 50.0},
}

static var GADGETS := {
	"ugl": {"name": "40MM LAUNCHER", "ammo": 4, "proj": "ugl"},
	"rpg": {"name": "RPG-7V", "ammo": 5, "proj": "rocket"},
	"crate": {"name": "SUPPLY CRATE", "ammo": 1, "proj": "crate"},
	"c4": {"name": "C-4 CHARGES", "ammo": 3, "proj": "c4"},
}

static var PROJECTILES := {
	"grenade": {"speed": 18.0, "gravity": 20.0, "fuse": 2.4, "bounce": 0.35, "radius": 7.5, "dmg": 125.0},
	"ugl": {"speed": 62.0, "gravity": 12.0, "radius": 4.8, "dmg": 105.0},
	"rocket": {"speed": 72.0, "gravity": 3.0, "radius": 4.8, "dmg": 110.0},
	"shell": {"speed": 240.0, "gravity": 4.0, "radius": 5.0, "dmg": 130.0, "fuse": 6.0},
	"hydra": {"speed": 150.0, "gravity": 2.5, "radius": 5.0, "dmg": 115.0, "fuse": 5.0},
	"atgm": {"speed": 70.0, "max": 150.0, "gravity": 0.0, "radius": 4.0, "dmg": 140.0, "fuse": 9.0},
	"c4": {"speed": 11.0, "gravity": 20.0, "radius": 7.5, "dmg": 220.0, "sticky": true},
	"crate": {"speed": 9.0, "gravity": 20.0, "bounce": 0.2},
}

## The tanks, from the web game's (one a side): Vanguard's M1A2 Abrams, Onyx's T-90A.
static var TANKS := [
	{"model": "abrams", "name": "M1A2 ABRAMS", "gun": "120MM CANNON", "mg": "M240 COAX", "health": 1000.0, "speed": 11.0,
		"reverse": 5.0, "accel": 4.0, "turn": 0.8, "turret": 1.15, "reload": 3.2, "bot_reload": 4.8, "respawn": 35.0},
	{"model": "t90", "name": "T-90A", "gun": "125MM CANNON", "mg": "PKT COAX", "health": 1000.0, "speed": 11.0,
		"reverse": 5.0, "accel": 4.0, "turn": 0.8, "turret": 1.15, "reload": 3.2, "bot_reload": 4.8, "respawn": 35.0},
]
## The attack helicopters, from the web game's (one a side): Vanguard's AH-64E Apache, Onyx's Mi-24V Hind. Speeds in
## m/s; hit: the boxes it's hit in (centre, half size), the first reaching down to its gear.
static var HELIS := [
	{"model": "ah64", "name": "AH-64E APACHE", "health": 620.0, "speed": 40.0, "back": 12.0, "side": 15.0, "accel": 9.0,
		"climb": 9.0, "yaw_rate": 1.15, "ceiling": 120.0, "cruise": 32.0, "cam": 19.0, "exit": 3.8, "respawn": 45.0,
		"gun": "M230 30MM CHAIN GUN", "gun_cd": 0.1, "gun_dmg": 46.0, "gun_veh": 12.0, "gun_he": true, "gun_ammo": 1200,
		"rocket": "HYDRA 70 ROCKETS", "rockets": 38, "atgm": "AGM-114 HELLFIRE", "atgm_reload": 2.5,
		"hit": [[0, 0.3, -0.65, 0.85, 1.6, 4.25], [0, 0.45, 6.8, 0.35, 0.45, 3.2], [0, -0.1, 0.25, 2.7, 0.35, 0.65]]},
	{"model": "mi24", "name": "MI-24V HIND", "health": 680.0, "speed": 42.0, "back": 11.0, "side": 14.0, "accel": 8.5,
		"climb": 8.5, "yaw_rate": 1.0, "ceiling": 120.0, "cruise": 32.0, "cam": 21.0, "exit": 4.6, "respawn": 45.0,
		"gun": "YAKB-12.7 GATLING", "gun_cd": 0.06, "gun_dmg": 30.0, "gun_veh": 5.0, "gun_he": false, "gun_ammo": 1470,
		"rocket": "S-8 ROCKETS", "rockets": 40, "atgm": "9M114 SHTURM", "atgm_reload": 2.8,
		"hit": [[0, -0.15, -1.7, 0.95, 1.7, 4.7], [0, 0.9, 7.3, 0.35, 1.0, 4.0], [0, -0.5, 1.0, 3.4, 0.4, 1.1]]},
]
## The transport helicopters (one a side): Vanguard's UH-60M Black Hawk (from the web game), Onyx's Mi-8AMTSh ("Mil
## Mi-8AMTSh" by 42manako, CC BY 4.0). A pilot, `seats` soldiers in the back and a gunner at each door's machine gun
## (`dg`): `guns` where the guns' posts stand (right door, left door), `dg_floor` the floor the gunners sit on. The
## Mi-8's `door`s are cut open (between heights y0, y1 and lengths z0, z1, both sides), with a dark `cabin` behind them
## (its half width, floor, roof, front and back).
static var TRANSPORTS := [
	{"model": "uh60", "name": "UH-60M BLACK HAWK", "health": 720.0, "speed": 38.0, "back": 10.0, "side": 13.0, "accel": 8.0,
		"climb": 8.0, "yaw_rate": 0.95, "ceiling": 120.0, "cruise": 28.0, "cam": 22.0, "exit": 2.6, "respawn": 45.0, "seats": 6,
		"hit": [[0, -0.18, -1.6, 1.32, 1.37, 4.1], [0, 0.9, 6.5, 0.38, 0.6, 4.0], [0, 2.0, 10.0, 0.15, 1.1, 0.9]],
		"dg": "M240H", "guns": [Vector3(1.22, 0.12, -2.85), Vector3(-1.22, 0.12, -2.85)], "dg_floor": -0.83},
	{"model": "mi8", "name": "MI-8AMTSH", "health": 780.0, "speed": 36.0, "back": 9.0, "side": 12.0, "accel": 7.5,
		"climb": 7.5, "yaw_rate": 0.9, "ceiling": 120.0, "cruise": 28.0, "cam": 24.0, "exit": 2.4, "respawn": 45.0, "seats": 8,
		"hit": [[0, 0.3, -2.0, 1.3, 1.9, 4.6], [0, 1.6, 7.4, 0.45, 0.6, 4.6], [0, -0.85, -0.6, 3.2, 0.3, 0.9]],
		"dg": "PKT", "guns": [Vector3(1.08, 0.3, -2.52), Vector3(-1.08, 0.3, -2.52)], "dg_floor": -0.6,
		"door": [-0.55, 0.8, -2.95, -2.1], "cabin": [0.98, -0.6, 0.88, -3.05, 1.4]},
]
## What an explosion does to a tank or helicopter in its blast (by the weapon's name); bullets do nothing to a tank.
static var VEHICLE_DMG := {"RPG-7V": 340.0, "C-4": 560.0, "120MM CANNON": 360.0, "125MM CANNON": 360.0,
	"40MM LAUNCHER": 70.0, "FRAG GRENADE": 30.0, "HYDRA 70 ROCKETS": 170.0, "S-8 ROCKETS": 170.0,
	"AGM-114 HELLFIRE": 720.0, "9M114 SHTURM": 720.0}

static var CLASSES := {
	"assault": {"name": "ASSAULT", "primary": "ar", "gadget": "ugl", "grenades": 2, "blurb": "Frontline rifleman. Carries a 40mm launcher to crack defenders out of cover."},
	"engineer": {"name": "ENGINEER", "primary": "smg", "gadget": "rpg", "grenades": 1, "blurb": "Anti-armor. RPG rockets wreck tanks and punch through cover."},
	"support": {"name": "SUPPORT", "primary": "lmg", "gadget": "crate", "grenades": 1, "blurb": "Suppressive LMG fire. Drops supply crates that refill everyone's ammo."},
	"recon": {"name": "RECON", "primary": "sniper", "gadget": "c4", "grenades": 1, "blurb": "Long-range marksman with a scoped bolt-action rifle. Carries C-4."},
}
static var CLASS_ORDER := ["assault", "engineer", "support", "recon"]

static var DIFFICULTY := {
	"easy": {"name": "RECRUIT", "reaction": [0.6, 1.0], "aim": 0.1, "turn": 3.0, "spread": 3.2, "burst": [2, 4], "dmg": 0.6},
	"normal": {"name": "REGULAR", "reaction": [0.35, 0.65], "aim": 0.055, "turn": 4.5, "spread": 2.2, "burst": [3, 6], "dmg": 0.8},
	"hard": {"name": "VETERAN", "reaction": [0.18, 0.38], "aim": 0.028, "turn": 6.5, "spread": 1.4, "burst": [4, 8], "dmg": 1.0},
}

static var BOT_NAMES := ["Hale", "Reyes", "Novak", "Kade", "Brennan", "Voss", "Marek", "Ortiz", "Sato", "Lindqvist", "Okafor",
	"Drago", "Petrov", "Kowal", "Haas", "Mercer", "Rourke", "Vance", "Ilyin", "Dunn", "Falk", "Grieve", "Moss", "Tate",
	"Quill", "Rask", "Wren", "Yates", "Zane", "Bishop", "Crane", "Holt", "Ivers", "Juno"]


static func damage_at(wpn: Dictionary, dist: float) -> float:
	var r: Array = wpn["range"]
	var d: Array = wpn["dmg"]
	return lerpf(d[0], d[1], clampf((dist - r[0]) / (r[1] - r[0]), 0.0, 1.0))
