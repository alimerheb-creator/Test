# Modding Sixth Front

A mod is a single JSON text file. Import it from the main menu with **MODS → IMPORT MOD FILE**, or copy its
text and use **PASTE MOD TEXT**. On Android the import button opens your phone's file picker. Mods are saved
on the device and stay on until you turn them off or remove them.

Mods have full control of the game:

- **Data sections** change or add weapons (with their own 3D models and reload styles), gadgets, projectiles,
  classes, movement, rules, scoring, tanks, teams, bot skill, time of day and weather.
- **A map section** builds a whole new battlefield: flags, HQs, buildings, roads, props, terrain and vegetation,
  or no flags at all for Team Deathmatch.
- **Scripts** can hook into damage, firing, explosions, projectiles, movement, reloading and scoring to change
  or cancel them. They can also spawn explosions, projectiles and bots, move and heal soldiers, build 3D models
  with collision, add HUD elements, bind keys (with touch buttons on phones), run timers, slow down time and
  save data.

The example mods ship with the game (add them from the MODS screen in one tap) and are in [`mods/`](mods/):

| File | What it shows |
| --- | --- |
| `random-wheel.sfmod.json` | A wheel before every match that picks a map and a game mode: replaces DEPLOY through `api.game`, switches other mods on and off, and carries the mods it needs in a `_pack` field |
| `mode-capture-the-flag.sfmod.json` | Capture the Flag: flag models, carrying, returns and scoring, plus bot roles (attack, defend, hunt) by extending the bot code through `api.game` |
| `mode-king-of-the-hill.sfmod.json` | King of the Hill: a single central point that follows whatever map is loaded |
| `hd-weapons.sfmod.json` | Detailed custom models for every base gun (with moving mags, bolts, slides and a feed cover), plus a script for brass, barrel smoke and reflections |
| `aggressive-reloads.sfmod.json` | Changing every weapon from a script, extending the viewmodel animation through `api.game`, and undoing it with `api.onDisable` |
| `multiplayer.sfmod.json` | Online play: a lobby screen, a host whose game runs the bots and the match, compact snapshots with interpolation, damage, explosions and kills passed between pages, and vehicles that change hands. It patches the engine through `api.game` only while an online game is running, and talks through the claude.ai room capability (`window.claude.use('room')`) |
| `jets.sfmod.json` | Six flyable jets added as new vehicles: procedural three.js models, arcade flight physics, lock-on missiles, bombs, flares, ejecting with a parachute, bot pilots, deploy-screen spawn points and a flight HUD, all by extending the game through `api.game` |
| `bombers.sfmod.json` | Two heavy bombers on the same aircraft core as Jets (whichever loads first installs it, the last one off removes it): bomb bays, a bomb sight, AI gun turrets and a gunner seat |
| `armory.sfmod.json` | A currency and an upgrade shop: credits from game events, a new screen on the main menu, saving with `api.store`, per-player weapon stats, attachments on the viewmodel and a live 3D preview |
| `vehicle-interiors.sfmod.json` | Drawing a second scene over the world (like the gun in your hands) for tank and cockpit interiors, live canvas screens and a render-to-texture gun sight |
| `hd-knife.sfmod.json` | A first-person model built in a script with three.js (a gloved hand and a detailed knife), keyframed melee animations, a motion trail, and chaining a viewmodel patch so other mods can patch it too |
| `mode-gun-game.sfmod.json` | A new game mode: loadouts from a script, kill tracking, a HUD, ending the match |
| `mode-hardpoint.sfmod.json` | A new game mode: moving the single flag around the map |
| `mode-last-stand.sfmod.json` | A new game mode: waves of bots spawned and removed by the script |
| `map-dust-ridge.sfmod.json` | A desert map, including a script that repaints the ground |
| `map-iron-forest.sfmod.json` | A dense forest map with fog |
| `map-old-town.sfmod.json` | A city map with a street grid and 59 destructible buildings |
| `heavy-arsenal.sfmod.json` | New weapons, a custom 3D rifle model, a shell-by-shell shotgun reload, a new class |
| `call-ins.sfmod.json` | Key bindings, raycasts, timers, explosions, spawning and removing bots, HUD text |
| `jetpack.sfmod.json` | Held keys, velocity control, particle effects, a HUD bar, cancelling fall damage |
| `explosive-rounds.sfmod.json` | Reacting to bullet hits, changing damage per shot, saved settings |
| `bullet-time.sfmod.json` | Slow motion |
| `karsa-outskirts.sfmod.json` | A complete new map |
| `team-deathmatch.sfmod.json` | A map section with no flags, plus rules and scoring |
| `night-ops.sfmod.json` | Night lighting, tracer colours, team names and uniforms |
| `moon-gravity.sfmod.json` | Movement and rules |
| `hardcore.sfmod.json` | Rules and tank tuning |
| `vampire-rounds.sfmod.json` | A small event script |

Start your own from [`mods/TEMPLATE.sfmod.json`](mods/TEMPLATE.sfmod.json).

## How mods are applied

- Every section is optional. Only include what you want to change.
- Mods are applied top to bottom in the MODS list. If two mods change the same value, the lower one wins.
  Use the UP and DOWN buttons to reorder.
- Numbers are clamped to safe ranges, and anything invalid is skipped. The MODS screen shows a note for each
  adjusted or ignored setting, and for any script error, so a typo never breaks the game.
- Turning a mod off restores the original values exactly and removes everything its script created
  (hooks, timers, models, HUD elements, keys, slow motion).
- A mod with a `map` section rebuilds the battlefield, so the game restarts by itself when you switch it on or
  off (your mod list is kept).
- Keys starting with `_` are ignored, so you can use `"_comment"` fields for notes.

## File layout

```json
{
  "format": "sixthfront-mod",
  "id": "my-mod",
  "name": "My Mod",
  "version": "1.0",
  "author": "You",
  "description": "One or two sentences shown in the MODS screen.",
  "weapons": {}, "gadgets": {}, "projectiles": {}, "classes": {},
  "movement": {}, "rules": {}, "scoring": {}, "vehicles": {}, "teams": [],
  "difficulty": {}, "atmosphere": {}, "botNames": [], "map": {}, "script": []
}
```

Only `name` is required. `id` defaults to the name. Importing a file with the same id replaces the old
version and keeps its on/off state. Files can be up to 512 KB.

## Weapons, gadgets, projectiles and classes

These sections are keyed by id. Use an existing id to change it, or a new id (lowercase letters, digits and
`_`, up to 24 characters) together with `"base"` to create a copy of an existing entry and then change it.

```json
"weapons": {
  "ar": { "rpm": 800 },
  "shotgun": { "base": "smg", "name": "M870 BREACHER", "pellets": 9, "model": "shotgun", "reloadType": "shell" }
}
```

### Weapons

Base game ids: `ar`, `smg`, `lmg`, `sniper`, `pistol`, `coax` (the tank machine gun).

| Field | Range / values | Meaning |
| --- | --- | --- |
| `name` | text, 28 chars | Shown in the HUD and killfeed |
| `kind` | `auto`, `semi`, `bolt` | Fire mode. `bolt` works the bolt (or pump) after every shot |
| `rpm` | 1–3000 | Rounds per minute |
| `dmg` | `[near, far]`, 0–1000 | Damage per bullet at close and long range |
| `range` | `[start, end]` metres | Where damage falls from `near` to `far` |
| `pellets` | 1–20 | Bullets per shot (shotguns) |
| `mag`, `reserve` | 1–1000, 0–9999 | Magazine size and spare ammo |
| `reloadType` | `mag`, `box`, `shell` | How it reloads (see below) |
| `reload` | 0.1–20 s | Tactical reload: a round is still chambered |
| `reloadEmpty` | 0.1–20 s | Reload from empty, which also racks the bolt. If you change `reload` only, this scales with it |
| `shellTime` | 0.05–5 s | `shell` reloads: time per round |
| `shellStart` | 0–5 s | `shell` reloads: time to get ready before the first round |
| `openBolt` | true/false | Fires from an open bolt, so nothing is chambered (belt-fed guns) |
| `cycleDelay` | 0–3 s | For `bolt` guns: when the bolt/pump sound plays after a shot |
| `spreadHip`, `spreadAds` | 0–0.5 rad | Accuracy from the hip and aiming |
| `bloom`, `bloomMax` | 0–0.2, 0–0.5 | Extra spread per shot and its cap |
| `recoil` | `[vertical, horizontal]` 0–0.5 | Kick per shot |
| `adsFov`, `adsTime` | 5–90°, 0.03–2 s | Zoom and time to aim |
| `head` | 1–10 | Headshot multiplier |
| `scope` | true/false | Full-screen sniper scope when aiming |
| `sound` | `rifle`, `smg`, `lmg`, `sniper`, `pistol`, `shotgun`, `heavy` | Gunshot sound |
| `model` | `ar`, `smg`, `lmg`, `sniper`, `pistol`, `shotgun`, or a custom model | First-person model |
| `tracer` | colour, e.g. `"#6dff8a"` | Tracer colour |
| `botRange` | 5–400 m | How far away bots start shooting with it |

#### How reloading works

Reloads are realistic and happen in stages, each with its own animation and sound. Nearby soldiers can hear you.

- **`mag`** (detachable magazine, the default). If a round is still chambered, you get a tactical reload:
  the magazine comes out, a fresh one goes in, and you have 30+1. From empty the old magazine drops to the
  ground and you rack the bolt, which is slower (`reloadEmpty`). Partly used magazines go back into your pouch.
  The fullest one is always loaded next, and the HUD shows each spare magazine as a pip. If you switch weapons
  after the magazine is out, it stays out, and the gun only has the chambered round until you reload.
- **`box`** (belt box, like the LMG). The feed cover opens, the box is swapped and the belt laid in. There is
  no chambered round, and the bolt is charged after running dry.
- **`shell`** (one round at a time, like a pump shotgun). Rounds go in one by one. Pull the trigger to stop
  reloading and fire. If the chamber is empty, the gun pumps a round in first.

Pistols lock their slide back when empty. Bolt-action rifles (`kind: "bolt"`) work the bolt after every shot.

#### Custom weapon models

`model` can be an object that builds the gun from simple shapes. Units are metres. The gun sits in your right
hand at the origin: `-z` points down the barrel, `+y` is up and `+x` is to the right.

```json
"model": {
  "sight": "reflex", "sightY": 0.092, "sightZ": -0.06,
  "muzzle": [0, 0.015, -0.68], "grip": [0, -0.075, 0.07], "fore": [0, -0.03, -0.32],
  "charge": [-0.05, 0.03, -0.2], "boltTravel": 0.08,
  "parts": [
    { "shape": "box", "size": [0.056, 0.05, 0.42], "pos": [0, 0.022, -0.1], "color": "#b39a6b" },
    { "shape": "cylinder", "size": [0.012, 0.26], "pos": [0, 0.015, -0.54], "color": "#303236", "metal": 0.6 },
    { "shape": "box", "size": [0.036, 0.13, 0.07], "pos": [0, -0.1, -0.1], "rot": [10, 0, 0], "role": "mag" },
    { "shape": "box", "size": [0.04, 0.012, 0.022], "pos": [-0.04, 0.03, -0.2], "role": "bolt" }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `parts` | Up to 80 shapes: `shape` (`box`, `cylinder`, `sphere`, `cone`), `size` (box `[w, h, length]`, cylinder `[radius, length]` or `[r1, r2, length]` along z, sphere `[radius]`, cone `[radius, length]` pointing forward), `pos` (centre), `rot` (degrees), `color`, `emissive`, `metal` (0–1), `rough` (0–1), `role` |
| `role` | `mag` (comes out and goes in when reloading), `bolt` (charging handle, pulled back), `slide` (pistol slide, locks back when empty), `pump` (slides with each pump), `cover` (LMG feed cover, opens) |
| `sight`, `sightY`, `sightZ` | `reflex` draws a red-dot sight at that height and depth, `none` draws nothing. Aiming lines your eye up with `sightY` |
| `muzzle` | Where the flash and bullets come from |
| `grip`, `fore` | Where your right and left hands hold it |
| `charge` | Where the left hand grabs to rack the bolt |
| `port` | Where shells are loaded (for `shell` reloads) |
| `boltTravel` | How far the bolt, slide or pump moves (metres) |
| `boltAction` | true makes the `bolt` part lift and turn like a bolt-action rifle |
| `pose` | `rifle` or `pistol`, the reload pose |
| `offset` | `[x, y, z]` shift of the whole gun when not aiming |

### Gadgets

Base ids: `ugl` (40mm launcher), `rpg`, `crate` (supply crate), `c4`. A new gadget keeps the behaviour of
its `base`.

Fields: `name`, `ammo` (0–99), `reload` (seconds between uses), `recharge` (seconds; the ammo refills after
it), `projectile` (a projectile id), `adsFov`.

### Projectiles

Base ids: `grenade`, `ugl`, `rocket`, `shell` (tank cannon), `c4`, `crate`. A new projectile behaves like its
`base` (a copy of `rocket` explodes on impact, a copy of `grenade` bounces and uses a fuse).

Fields: `name`, `speed`, `gravity`, `fuse` (grenades), `bounce` (0–1), `radius` (blast radius, metres),
`dmg` (damage to soldiers at the centre), `structural` (damage to walls), `veh` (damage to tanks),
`direct` (extra damage on a direct hit).

### Classes

Base ids: `assault`, `engineer`, `support`, `recon`. New classes appear on the deploy screen (up to 8), and
bots use them too.

Fields: `name` (16 chars), `primary` and `secondary` (weapon ids), `gadget` (gadget id), `grenades` (0–10),
`blurb` (description), `fastRevive` (revive twice as fast), `autoSpot` (spots whatever is in the scope),
`hidden` (removes the class from the deploy screen).

## Game settings

### `rules`

| Field | Default | Range | Meaning |
| --- | --- | --- | --- |
| `gravity` | 20 | 1–60 | Soldier gravity (m/s²) |
| `playerHealth` | 100 | 1–1000 | Max health for everyone |
| `regenDelay` | 5 | 0–60 | Seconds before health regenerates |
| `regenRate` | 14 | 0–500 | Health per second (0 turns regeneration off) |
| `damageScale` | 1 | 0–10 | Multiplies all damage |
| `headshotScale` | 1 | 0–10 | Multiplies headshot bonuses |
| `explosionScale` | 1 | 0.1–4 | Multiplies blast radius |
| `captureSpeed` | 1 | 0.1–10 | Flag capture speed |
| `bleedSpeed` | 1 | 0–10 | Ticket bleed speed |
| `reviveTime` | 2.4 | 0.2–20 | Seconds to revive (Support: half) |
| `downedTime` | 10 | 1–60 | Seconds a downed soldier can be revived |
| `respawnTime` | 5 | 0.5–60 | Bot redeploy delay |
| `spawnProtection` | 1.5 | 0–10 | Invulnerable seconds after spawning |
| `fallDamage` | true | | Fall damage on or off |
| `infiniteAmmo` | false | | Never run out or reload |
| `friendlyFire` | false | | Bullets and blasts hurt teammates |
| `startTickets` | 0 | 0–5000 | Tickets per side (0 uses the match settings) |

### `movement`

`walk` 4.6, `sprint` 7.3, `crouch` 2.5, `prone` 1.1 (m/s), `adsMul` 0.6 (speed while aiming), `jump` 6.2,
`accel` 55, `airAccel` 9, `slideSpeed` 10, `slideTime` 0.85.

### `scoring`

Points for `kill`, `headshot`, `assist`, `capture`, `neutralize`, `revive`, `resupply`, `vehicle`, `spotAssist`.

### `vehicles`

```json
"vehicles": { "tank": { "name": "MBT-6 ARBITER", "health": 1000, "speed": 11, "reverse": 5, "turnRate": 0.8,
  "turretSpeed": 1.15, "reload": 3.2, "botReload": 4.8, "respawn": 35, "perTeam": 2 } }
```

`perTeam` is 0–2 (0 removes tanks). Matches with fewer than 10 soldiers per side get at most one tank each.

### `teams`

A list of up to two teams: first yours, then the enemy. Fields: `name` (16 chars) and uniform colours
`helmet`, `top`, `pants`, `vest`, `tank`. The HUD always shows friendlies in blue and enemies in red.

### `difficulty`

Tune the bot skill levels `easy`, `normal` and `hard`: `reaction` (`[min, max]` seconds), `aimError`
(radians), `turn` (turn speed), `spreadMul`, `burst` (`[min, max]` rounds) and `dmgMul`.

### `atmosphere`

`preset`: `dusk` (default), `noon`, `overcast` or `night`. Any of these override the preset: colours
`skyTop`, `horizon`, `ground`, `sunColor`, `sunLight`, `hemiSky`, `hemiGround`, `cloudColor`, `cloudLit`;
numbers `sunIntensity`, `hemiIntensity`, `fogNear`, `fogFar`, `clouds` (0–1), `stars` (0–2),
`sunElevation` (degrees), `sunAzimuth` (degrees), `exposure`, `envIntensity`.

### `botNames`

A list of at least four names that replaces the bot name pool.

## Maps

The `map` section replaces the battlefield. The playable area is the square from -230 to 230 metres on both
axes (x is east, z is south). Anything you leave out keeps the Karsa Valley default.

```json
"map": {
  "name": "KARSA OUTSKIRTS",
  "hq": [ { "x": 205, "z": 0 }, { "x": -205, "z": 0 } ],
  "flags": [
    { "name": "RAIL DEPOT", "x": 90, "z": 70, "radius": 13 },
    { "name": "CHAPEL", "x": 0, "z": -20, "radius": 14, "town": true }
  ],
  "buildings": [ [-20, -40, 4, 3, 2], [18, -42, 3, 3, 2] ],
  "roads": [ [[250, 0], [90, 70], [0, -20], [-250, 0]] ],
  "props": [ { "type": "container", "x": 84, "z": 56, "color": "#8a3b2a" } ],
  "randomProps": true,
  "terrain": { "seed": 4242, "hills": 1.35, "mountains": 1.1 },
  "vegetation": { "trees": 1.6, "grass": 1.2 }
}
```

| Field | Meaning |
| --- | --- |
| `name` | Map name (24 chars), shown on the menu, scoreboard and end screen |
| `hq` | Exactly two HQs, yours first: `x`, `z` and optional `yaw` in degrees (they face the middle by default) |
| `flags` | 0–8 capture points: `name`, `x`, `z`, `radius` (5–40), `flat` (radius of flattened ground), `town` (paved square with more cover), `id` (defaults to A, B, C…). An empty list `[]` gives Team Deathmatch: no flags, tickets only drop when soldiers die, and bots hunt the enemy |
| `buildings` | Replaces all buildings. Each is `[x, z, width, depth, floors]`, with width and depth in 2.5 m wall panels (2–8) and 1–5 floors. Up to 80. Every building is destructible |
| `addBuildings` | Same format, added to the existing buildings |
| `roads` | Replaces the roads: a list of roads, each a list of `[x, z]` points |
| `props` | Hand-placed cover (up to 400): `type` (`container`, `barrier`, `sandbags`, `crate`, `wreck`, `ruin`, `block`), `x`, `z`, `rot` (0 or 90 degrees), `color`. A `block` also takes `size` `[w, h, d]` and `y` (height above the ground), for walls, towers and platforms |
| `randomProps` | `false` removes the automatic cover around flags, HQs and across the fields |
| `terrain` | `seed` (any number gives a different landscape), `hills` (0–4), `bumps` (0–4), `mountains` (0–3, the ring around the edge), `valley` (−5–5, a dip through the middle; negative makes a ridge) |
| `vegetation` | Multipliers for `trees`, `bushes`, `rocks` (0–3) and `grass` (0–2) |

Ground is flattened automatically around flags, HQs and buildings. The team with more flags makes the other
side's tickets drain once it holds more than half of them.

## Scripts

`script` is JavaScript, written as one string or a list of lines, that runs when the mod is applied. It gets an
`api` object (and `THREE`, the three.js library). Any error is caught and shown on the MODS screen, and the game
keeps running. Scripts run with full access to the game, so only import script mods you trust. Some web hosts
block scripts. There, the data sections still apply, and the MODS screen says the script could not run.

```js
// SCAR-H headshots do 50% more damage, and your kills knock nearby enemies into the air
api.filter('damage', (d) => {
  if (d.info.headshot && d.info.weapon === 'SCAR-H BATTLE RIFLE') d.amount *= 1.5;
});
api.on('kill', (e) => {
  if (e.killer !== api.player()) return;
  for (const s of api.alive(1 - e.killer.team)) {
    if (s.pos.distanceTo(e.victim.pos) < 6) api.push(s, 0, 7, 0);
  }
});
```

### Events: `api.on(event, fn)`

| Event | Data |
| --- | --- |
| `matchStart` | the game |
| `tick` | seconds since the last frame (game time, so slower in slow motion) |
| `spawn` | the soldier who spawned |
| `fire` | `{ soldier, gun, weapon }` after a shot |
| `bulletHit` | `{ shooter, weapon, x, y, z, victim, vehicle, headshot, material, normal }` |
| `damage` | `{ victim, attacker, amount, info }` |
| `kill` | `{ victim, killer, weapon, headshot, self }` (the victim is downed or dead) |
| `bleedout` | the soldier who bled out |
| `revive` | `{ soldier, by }` |
| `reload` | `{ soldier, gun, stage }` for each stage: `begin`, `out`, `in`, `charge`, `start`, `shell`, `end` |
| `projectile` | the projectile that was launched (`type`, `pos`, `vel`, `owner`) |
| `explosion` | `{ x, y, z, def, owner, radius }` |
| `crate` | a supply crate that landed |
| `flag` | `{ flag, team, type }` where `type` is `captured` or `neutralized` |
| `enterVehicle`, `exitVehicle` | `{ soldier, vehicle }` |
| `vehicleDamage` | `{ vehicle, amount, attacker }` |
| `vehicleDestroyed` | `{ vehicle, attacker, weapon }` |
| `collapse` | a building that collapsed |
| `score` | `{ pts, label }` when the player scores |
| `matchEnd` | `{ winner }` |

`api.off(event, fn)` removes a listener (`api.on` returns the function to pass).

### Hooks: `api.filter(hook, fn)`

A hook runs before something happens. Your function gets an object it can change, and it can return `false` to
cancel the action.

| Hook | Data you can change | Returning `false` |
| --- | --- | --- |
| `damage` | `amount` (also read `victim`, `attacker`, `info.weapon`, `info.headshot`, `info.explosive`, `info.melee`) | No damage |
| `vehicleDamage` | `amount` (also `vehicle`, `attacker`, `weapon`) | No damage |
| `fire` | `spread`, `dmgMul`, `pellets` (also `soldier`, `gun`, `weapon`, `dir`) | The shot doesn't fire |
| `projectile` | `type` (swap to another projectile id; also `owner`, `pos`, `dir`) | Nothing is launched |
| `explosion` | `x`, `y`, `z`, `radius`, `owner`, `def` | No explosion |
| `moveSpeed` | `speed`, `jump` (for each soldier, every frame) | The soldier can't move |
| `reload` | (read `soldier`, `gun`, `weapon`) | The reload doesn't start |
| `score` | `points`, `label` (also `soldier`) | No points |

### Actions

| Call | Does |
| --- | --- |
| `api.player()`, `api.soldiers()`, `api.alive(team?)`, `api.vehicles()` | The player, all soldiers, living soldiers (optionally of one team), tanks |
| `api.flags()`, `api.tickets()`, `api.time()`, `api.state()` | Objectives, ticket counts, game time, and `menu`/`deploy`/`playing`/`paused`/`ended` |
| `api.heightAt(x, z)` | Ground height |
| `api.raycast(from, dir, maxDist, { ignore })` | Returns `{ hit, x, y, z, distance, soldier, vehicle, terrain, normal }` |
| `api.vec(x, y, z)` | A `THREE.Vector3` |
| `api.teleport(soldier, x, y, z)` | Move a soldier (leave out `y` to land on the ground) |
| `api.push(soldier, vx, vy, vz)`, `api.setVelocity(...)` | Add to or set a soldier's velocity |
| `api.heal(soldier, n)`, `api.setHealth(soldier, n)` | Health |
| `api.damage(soldier, n, attacker, weapon)`, `api.kill(soldier, attacker, weapon, revivable)` | Hurt or kill |
| `api.revive(soldier)` | Revive a downed soldier |
| `api.setClass(soldier, id)`, `api.giveWeapon(soldier, slot, id)`, `api.setGadget(soldier, id)`, `api.refillAmmo(soldier)` | Loadouts (`slot` 0 is primary, 1 is sidearm) |
| `api.spawnBot(team, { classId, name, x, z })`, `api.removeBot(soldier)` | Add or remove bots (up to 96 soldiers) |
| `api.fire(soldier)` | Make a soldier fire their weapon |
| `api.explode(x, y, z, { radius, damage, structural, vehicle, owner, name, size })` | An explosion (`size` is the visual size) |
| `api.projectile(type, owner, pos, dir, speed)` | Launch a grenade, rocket, shell, C-4 or any modded projectile |
| `api.setTickets(team, n)`, `api.endMatch(winner)` | Match control |
| `api.setTimeScale(k)`, `api.timeScale()` | Slow motion or fast forward (0.05–4, resets each match) |
| `api.setAtmosphere({ preset, ... })` | Change lighting and weather during play |
| `api.addModel(parts, pos, { collide, rotY, scale, onGround, shadows })` | Build a 3D object from `box`/`cylinder`/`sphere`/`cone` parts (same part format as weapon models, sizes in metres, plus `opacity`). Leave out `pos.y` to stand it on the ground. With `collide: true`, soldiers, bullets and tanks hit it. Returns a handle with `object`, `move(x, y, z)`, `rotate(degrees)`, `setVisible(v)` and `remove()` |
| `api.effect(kind, x, y, z, { size, color, duration, to })` | `explosion`, `flash`, `smoke`, `fire`, `dust`, `blood`, `sparks`, `debris`, `tracer` (to `{x, y, z}`), `shake` |
| `api.sound(kind, x, y, z)` | `shot:rifle` (any gunshot sound), `explosion`, `foley:charge` (weapon handling: `out`, `in`, `charge`, `slide`, `bolt`, `pump`, `shell`, `drop`, `cover`, `belt`, `grab`, `release`), `whiz`, `hit`, `hit:head`, `kill`, `capture`, `click`. Leave out the position to play it on the player |
| `api.tone(freq, seconds, wave, volume)` | A synthesised beep |
| `api.vibrate(pattern)` | Phone vibration |
| `api.hud.text(id, text, { x, y, color, size, align })` | Text on screen (`x`, `y` in % of the screen) |
| `api.hud.bar(id, value, { label, color, x, y })` | A bar filled 0–1 |
| `api.hud.remove(id)` | Remove a HUD element |
| `api.bindKey(code, label, onPress, onRelease)` | A key (e.g. `"KeyH"`), plus a touch button with that label on phones. Up to 12 |
| `api.isDown(code)` | Whether a key (or its touch button) is held |
| `api.after(seconds, fn)`, `api.every(seconds, fn)`, `api.cancel(timer)` | Timers in game time |
| `api.onDisable(fn)` | Runs when your mod is switched off or the mod list is re-applied. Use it to undo anything you changed directly through `api.game` (everything made with the API is undone for you) |
| `api.store.get(key, fallback)`, `api.store.set(key, value)` | Data saved on the device for this mod |
| `api.toast(text)`, `api.banner(text, colour)`, `api.award(soldier, points, label)`, `api.log(...)` | Messages and score |
| `api.config`, `api.rules`, `api.game`, `THREE` | The live tables, the whole game object and three.js, for anything else |

Soldiers have `name`, `team` (0 is yours), `health`, `maxHealth`, `state` (`alive`, `downed`, `dead`),
`classId`, `pos` and `vel` (vectors), `yaw`, `pitch`, `onGround`, `vehicle`, `guns`, `gun` (in hand), `stats`
and `isPlayer`, plus `eye(v)` and `forward(v)` which fill a vector with the eye position and look direction.
Guns have `def` (the weapon table entry), `mag`, `chamber`, `rounds`, `reserve`, `reloading` and `stage`.
