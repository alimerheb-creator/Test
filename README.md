# Sixth Front

A browser-based, Battlefield-style combined-arms shooter built with [three.js](https://threejs.org/).
Everything (terrain, buildings, soldiers, tanks, textures and sound) is generated in code, so there are
no asset files to download.

It is an original game inspired by large-scale Conquest shooters. It is not affiliated with EA or DICE
and uses none of their assets.

## Android app

A ready-to-install APK is in [`apk/SixthFront.apk`](apk/SixthFront.apk) (about 0.5 MB, works offline).

1. Download the APK on your phone.
2. Open it and allow "Install unknown apps" for your browser or file manager when Android asks.
3. Launch **Sixth Front**. It runs full-screen in landscape. The back button pauses, and from the main menu it exits.

Needs Android 7.0 or newer with OpenGL ES 3.0 (almost every phone from the last several years). It is
signed with the debug key in `android/debug.keystore` (password `android`), so future builds from this repo
install as updates. For a Play Store release, sign with your own key instead.

To rebuild it yourself (Ubuntu/Debian; no Android Studio or Gradle needed):

```bash
sudo apt-get install aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 default-jdk nodejs npm
npm install
npm run build:apk        # writes android/build/SixthFront.apk
```

`npm run build:web` alone produces the same offline web build (single bundled script, local fonts) in
`android/build/assets/www`, which you can host anywhere.

## Play it in a browser

ES modules need to be served over HTTP (opening `index.html` straight from disk won't work):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works (`npx serve`, GitHub Pages, etc.). three.js is loaded from the jsDelivr CDN.

To put the game online for anyone: in the repository on GitHub, open **Settings → Pages**, choose **Deploy from a
branch**, pick this branch and the **/ (root)** folder, and save. The game then plays at
`https://<user>.github.io/<repository>/` (the repository has to be public, or on a paid plan).

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
- **Realistic reloading**: magazines physically come out and go in, and every stage has its own sound. A
  tactical reload keeps the chambered round (30+1), while an empty reload drops the magazine on the ground and
  racks the bolt. Partly used magazines go back in your pouch (shown as pips on the HUD), and a magazine that
  came out stays out if you switch weapons. The LMG opens its feed cover to swap belt boxes, and shotguns load
  one shell at a time (fire to interrupt). Bolt-action rifles work the bolt after every shot, pistol slides
  lock back when empty, and you can hear enemies reloading nearby.
- **Battlefield staples**: downed state and revives, squads with squad spawning, spotting, suppression,
  bullet damage falloff, headshots, hitmarkers, killfeed, score popups, scoreboard, minimap, full map,
  sliding, prone, out-of-bounds timer.
- **Graphics**: HDR rendering with bloom, sun glare and lens ghosts, ACES tone mapping with colour grading,
  film grain and vignette, image-based reflections, normal-mapped walls and ground, wind-blown grass,
  textured smoke, MSAA and soft shadows. Presets: Auto, Low, Medium, High, Ultra (Auto picks Medium on
  phones and High on desktop).
- **Mobile controls**: virtual stick, drag-to-look, and a context button that appears when you can act
  (hold to **revive** a downed teammate with a progress ring, enter or exit a tank, detonate C-4). There are
  also buttons for prone, sprint (latches on), map and scoreboard, plus aim assist, optional auto-fire,
  vibration, and adjustable look sensitivity and button size. When you're down, a button lets you give up
  and redeploy.

## Multiplayer

Add the **Multiplayer** mod (MODS screen), then press **MULTIPLAYER** on the main menu. One player hosts a game and
gets a 4-letter code; anyone else joins with the code and picks a side. The host's game runs the bots, the flags,
the tickets and the buildings, everyone plays their own soldier, and tanks, jets and bombers are driven by whoever
gets in. Up to 8 players.

Games are public: anyone with the game and the code can join, from the Android app, a browser copy of the game
(for example on GitHub Pages) or the game's claude.ai page. Players find each other through the free public
PeerJS server (it only passes connection offers along) and then connect directly over WebRTC; every player connects
to the host. Some strict networks (certain mobile carriers and company networks) block direct connections, and
there is no relay server, so a player on such a network can't join. On the claude.ai page, if the PeerJS server
can't be reached, the game falls back to the page's own room, which only people the page is shared with can use.
To try it on one computer, open the page with `?mplocal` in two tabs of the same browser.

## Mods

Open **MODS** on the main menu to import a mod file, paste mod text, or add one of the bundled examples. Mods have
full control of the game:

- Change or add weapons (with their own 3D models and reload styles), gadgets, projectiles and classes, and
  change movement, rules, scoring, tanks, team names and uniforms, bot skill, time of day and weather.
- Build whole new maps: flags, HQs, destructible buildings, roads, props, terrain and vegetation, or no flags at
  all for Team Deathmatch.
- Run scripts that hook into damage, firing, explosions, projectiles, movement, reloading and scoring, and that
  can spawn explosions and bots, move soldiers, build 3D objects with collision, add HUD elements, bind keys
  (with touch buttons on phones), run timers, save data and slow down time.

Bundled examples: Multiplayer (online play with friends), Jets (F/A-18E, F-16C, A-10C, Su-27, MiG-29, Su-25), Bombers (B-17 and Lancaster), Armory (earn
credits from kills and upgrade your guns with suppressors and more), Vehicle Interiors (sit inside tanks and
cockpits), Random Wheel (a random map and game mode before every match), HD Weapons (detailed gun models),
HD Knife (a real hand holding a detailed knife), Aggressive Reloads, five game modes (Capture the Flag, King of the
Hill, Gun Game, Hardpoint, Last Stand) plus Team Deathmatch, four extra maps (Dust Ridge, Iron Forest, Old Town,
Karsa Outskirts), Heavy Arsenal, Commander Call-ins (airstrikes and reinforcements), Jetpack, Explosive Rounds,
Bullet Time, Night Ops, Moon Gravity, Hardcore and Vampire Rounds. The
format and the whole script API are documented in [MODDING.md](MODDING.md), and
[`mods/TEMPLATE.sfmod.json`](mods/TEMPLATE.sfmod.json) is a starting point for your own.

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
In a jet or bomber (Jets and Bombers mods): the mouse steers, W/S throttle, A/D roll, 1/2/3 weapons, Space flares,
E ejects. Set FLIGHT CONTROLS to JOYSTICK in the settings (main menu or pause) to fly with W/S/A/D or the on-screen
stick instead: Shift/Z or the mouse wheel for throttle (THR buttons on phones), the mouse or a drag to look around,
and INVERT PITCH if you prefer pulling back to climb. C switches between the outside view and the cockpit (Vehicle Interiors mod; in a tank it takes the
commander's seat).
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
| `post.js` | HDR post-processing: bloom, lens flare, tone mapping, grading, damage effects |
| `grass.js` | GPU-instanced grass that follows the camera |
| `mods.js` | Mod loader: validation, maps, custom weapon models, applying/undoing mods, script hooks and API |

The Android wrapper lives in `android/`: `MainActivity.java` hosts the game in a full-screen WebView and
serves the bundled files from inside the APK, `prepare-web.mjs` builds the offline bundle, and
`build-apk.sh` compiles, packages and signs the APK.

Fonts (Big Shoulders Stencil, Saira Semi Condensed, IBM Plex Mono) are under the SIL Open Font License;
the license texts are in `android/fonts/`.
