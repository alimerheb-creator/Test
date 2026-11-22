extends RefCounted
## Sixth Front's battle data, carried over from the web game's js/config.js: the teams, KARSA VALLEY (flags,
## headquarters, buildings, roads), movement, guns, gadgets, classes, bot difficulty and match rules.

static var TEAMS := [
	{"name": "VANGUARD", "short": "VGD", "color": Color("3fa9f5"), "helmet": Color("4f5638"), "top": Color("6b6a4c"), "pants": Color("5a5a40"), "vest": Color("46492f")},
	{"name": "ONYX", "short": "ONX", "color": Color("ff4b3a"), "helmet": Color("2a2c30"), "top": Color("44474e"), "pants": Color("33363c"), "vest": Color("24262a")},
]

static var MAP_NAME := "KARSA VALLEY"
static var PLAY_HALF := 240.0

# Vanguard deploys from the south, Onyx from the north
static var HQS := [{"x": 0.0, "z": 212.0, "yaw": 0.0}, {"x": 0.0, "z": -212.0, "yaw": PI}]

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

static var MOVE := {"walk": 4.6, "sprint": 7.3, "crouch": 2.5, "ads": 0.6, "jump": 6.2}

static var RULES := {"gravity": 20.0, "health": 100.0, "regen_delay": 5.0, "regen_rate": 14.0, "bullet": 0.7,
	"respawn": 5.0, "protect": 1.5, "capture": 0.085, "tickets": 250}

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
## What an explosion does to a tank in its blast (by the weapon's name); bullets do nothing.
static var VEHICLE_DMG := {"RPG-7V": 340.0, "C-4": 560.0, "120MM CANNON": 360.0, "125MM CANNON": 360.0,
	"40MM LAUNCHER": 70.0, "FRAG GRENADE": 30.0}

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
