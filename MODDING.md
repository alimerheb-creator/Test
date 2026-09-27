# Modding Sixth Front

A mod is a single JSON text file. Import it from the main menu with **MODS → IMPORT MOD FILE**, or copy its
text and use **PASTE MOD TEXT**. On Android the import button opens your phone's file picker. Mods are saved
on the device and stay on until you turn them off or remove them.

Five example mods ship with the game (they can be added from the MODS screen in one tap) and are in
[`mods/`](mods/):

| File | What it does |
| --- | --- |
| `heavy-arsenal.sfmod.json` | Adds a pump shotgun, a battle rifle and a new Breacher class |
| `night-ops.sfmod.json` | Night battle with stars, green tracers, renamed armies and new uniforms |
| `moon-gravity.sfmod.json` | Low gravity, huge jumps, bigger explosions |
| `hardcore.sfmod.json` | 60 health, no regeneration, deadlier headshots, tougher tanks |
| `vampire-rounds.sfmod.json` | Script example: kills heal you, kill streaks pay out |

Start your own from [`mods/TEMPLATE.sfmod.json`](mods/TEMPLATE.sfmod.json).

## How mods are applied

- Every section is optional. Only include what you want to change.
- Mods are applied top to bottom in the MODS list. If two mods change the same value, the lower one wins.
  Use the UP and DOWN buttons to reorder.
- Numbers are clamped to safe ranges, and anything invalid is skipped. The MODS screen shows a note for each
  adjusted or ignored setting, so a typo never breaks the game.
- Turning a mod off restores the original values exactly.
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
  "difficulty": {}, "atmosphere": {}, "botNames": [], "script": []
}
```

Only `name` is required. `id` defaults to the name. Importing a file with the same id replaces the old
version and keeps its on/off state.

## Weapons, gadgets, projectiles and classes

These sections are keyed by id. Use an existing id to change it, or a new id (lowercase letters, digits and
`_`, up to 24 characters) together with `"base"` to create a copy of an existing entry and then change it.

```json
"weapons": {
  "ar": { "rpm": 800 },
  "shotgun": { "base": "smg", "name": "M870 BREACHER", "pellets": 9, "model": "shotgun", "sound": "shotgun" }
}
```

### Weapons

Base game ids: `ar`, `smg`, `lmg`, `sniper`, `pistol`, `coax` (the tank machine gun).

| Field | Range / values | Meaning |
| --- | --- | --- |
| `name` | text, 28 chars | Shown in the HUD and killfeed |
| `kind` | `auto`, `semi`, `bolt` | Fire mode (`bolt` also suits pump shotguns) |
| `rpm` | 1–3000 | Rounds per minute |
| `dmg` | `[near, far]`, 0–1000 | Damage per bullet at close and long range |
| `range` | `[start, end]` metres | Where damage falls from `near` to `far` |
| `pellets` | 1–20 | Bullets per shot (shotguns) |
| `mag`, `reserve` | 1–1000, 0–9999 | Magazine size and spare ammo |
| `reload` | 0.1–20 s | Reload time |
| `spreadHip`, `spreadAds` | 0–0.5 rad | Accuracy from the hip and aiming |
| `bloom`, `bloomMax` | 0–0.2, 0–0.5 | Extra spread per shot and its cap |
| `recoil` | `[vertical, horizontal]` 0–0.5 | Kick per shot |
| `adsFov`, `adsTime` | 5–90°, 0.03–2 s | Zoom and time to aim |
| `head` | 1–10 | Headshot multiplier |
| `scope` | true/false | Full-screen sniper scope when aiming |
| `sound` | `rifle`, `smg`, `lmg`, `sniper`, `pistol`, `shotgun`, `heavy` | Gunshot sound |
| `model` | `ar`, `smg`, `lmg`, `sniper`, `pistol`, `shotgun` | First-person model |
| `tracer` | colour, e.g. `"#6dff8a"` | Tracer colour |
| `botRange` | 5–400 m | How far away bots start shooting with it |

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

## Scripts

`script` is JavaScript, written as one string or a list of lines, that runs when the mod is applied. It gets an
`api` object:

| Call | Does |
| --- | --- |
| `api.on(event, fn)` | Listen for a game event (listeners are removed when the mod is turned off) |
| `api.toast(text)`, `api.banner(text, colour)` | Show a message |
| `api.award(soldier, points, label)` | Give score (shows a popup for the player) |
| `api.player()`, `api.soldiers()`, `api.vehicles()` | Current soldiers and tanks |
| `api.flags()`, `api.tickets()` | Objective state and ticket counts |
| `api.rules`, `api.config` | The live rule and config tables |
| `api.game` | The whole game object, for advanced mods |
| `api.log(...)` | Write to the browser console |

Events:

| Event | Data |
| --- | --- |
| `matchStart` | the game |
| `tick` | seconds since the last frame |
| `spawn` | the soldier who spawned |
| `damage` | `{ victim, attacker, amount, info }` |
| `kill` | `{ victim, killer, weapon, headshot }` (the victim is downed or dead) |
| `revive` | `{ soldier, by }` |
| `flag` | `{ flag, team, type }` where `type` is `captured` or `neutralized` |
| `vehicleDestroyed` | `{ vehicle, attacker, weapon }` |
| `matchEnd` | `{ winner }` |

Soldiers have `name`, `team` (0 is yours), `health`, `maxHealth`, `state` (`alive`, `downed`, `dead`),
`classId`, `pos` (x, y, z), `stats` and `isPlayer`.

Script errors are caught. The mod shows an error in the MODS screen, and the game keeps running. Scripts run
with full access to the game, so only import script mods you trust. Some web hosts block scripts. There,
the data sections still apply, and the MODS screen says the script could not run.
