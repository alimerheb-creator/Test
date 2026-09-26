# Sixth Front

A browser-based, Battlefield-style combined-arms shooter built with [three.js](https://threejs.org/).
Everything (terrain, buildings, soldiers, tanks, textures and sound) is generated in code, so there are
no asset files to download.

It is an original game inspired by large-scale Conquest shooters. It is not affiliated with EA or DICE
and uses none of their assets.

## Play it

ES modules need to be served over HTTP (opening `index.html` straight from disk won't work):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works (`npx serve`, GitHub Pages, etc.). three.js is loaded from the jsDelivr CDN.

## What's in it

- **Conquest on Karsa Valley**: 5 capture points (A–E), two team HQs, tickets that drain on deaths and
  bleed faster for the side holding fewer flags.
- **Destruction**: every building is made of wall, floor and stair panels with hit points. Rockets,
  40mm grenades, C-4 and tank shells blow holes in walls, upper floors lose their support, and when
  enough of the ground floor is gone the whole building collapses on anyone inside.
- **Four classes**
  - Assault: M4K carbine, underbarrel 40mm launcher, 2 frags
  - Engineer: VX-9 PDW, RPG-7V (wrecks tanks and walls)
  - Support: KR-250 LMG, supply crates (health and ammo), revives twice as fast
  - Recon: SR-338 bolt-action with a scope that auto-spots, C-4 charges
- **Tanks**: drivable MBT with a stabilised turret, 120mm cannon, coaxial MG, third-person and gunner
  zoom views. Tanks crush walls, trees and soldiers. Bots drive them too.
- **AI squads**: up to 20 v 20 bots with reaction time, aim error, burst fire, strafing, grenades,
  anti-tank rockets, reviving downed teammates and dropping supply crates. Three skill levels.
- **Battlefield staples**: downed state and revives, squads with squad spawning, spotting, suppression,
  bullet damage falloff, headshots, hitmarkers, killfeed, score popups, scoreboard, minimap, full map,
  sliding, prone, out-of-bounds timer.
- **Touch controls** on phones and tablets (virtual stick, fire/aim buttons, drag to look).

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint |
| C / Ctrl | Crouch (while sprinting: slide) |
| Z | Prone |
| Space | Jump |
| Left / right mouse | Fire / aim down sights |
| R | Reload |
| 1 / 2 / 3, mouse wheel | Primary / sidearm / gadget |
| G | Frag grenade |
| V or F | Knife (from behind: takedown) |
| Q | Spot enemy |
| E | Enter / exit tank, hold to revive |
| Tab / M | Scoreboard / full map |
| Esc or P | Pause |

In a tank: W/S throttle, A/D steer, mouse aims the turret, 1 cannon, 2 coax MG, right mouse to zoom.
With C-4 selected, right mouse detonates.

## Code layout

The game is split into small ES modules under `js/`:

| File | What it does |
| --- | --- |
| `main.js` | Entry point and loading screen |
| `game.js` | Renderer, match lifecycle, main loop, camera modes |
| `config.js` | Teams, map layout, weapons, classes, scoring, AI difficulty |
| `world.js` | Heightmap terrain, sky, lighting, trees/rocks/props, collision grid and raycasts |
| `buildings.js` | Destructible buildings, collapse logic, rubble |
| `soldier.js` | Soldier movement physics, health/downed state, animated model |
| `weapons.js` | Guns, hitscan bullets, projectiles, explosions, crates, melee, spotting |
| `vehicles.js` | Tank driving, turret, cannon, roadkill and wall crushing |
| `ai.js` | Bot brains for infantry and tank crews |
| `player.js` | First-person controller, viewmodels, tank camera, death camera |
| `conquest.js` | Flags, capture, tickets, scoring, spawns, revives |
| `hud.js` | HUD, minimap, markers, crosshair, scoreboard, full map |
| `ui.js` | Main menu, deploy screen, pause and after-action report |
| `input.js` | Keyboard, mouse (pointer lock) and touch |
| `audio.js` | Synthesised WebAudio sound effects and ambience |
| `effects.js` | Particles, tracers, debris, flashes, camera shake |
| `textures.js` | Procedural textures and the world-space UV material |
| `util.js` | Math, noise and geometry helpers |
