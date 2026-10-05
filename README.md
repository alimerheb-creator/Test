# Sixth Front

A browser-based, Battlefield-style combined-arms shooter built with [three.js](https://threejs.org/).
Everything (terrain, buildings, soldiers, tanks, textures and sound) is generated in code, so there are
no asset files to download.

It is an original game inspired by large-scale Conquest shooters. It is not affiliated with EA or DICE
and uses none of their assets.

## Android app

A ready-to-install APK is in [`apk/SixthFront.apk`](apk/SixthFront.apk) (about 0.8 MB, works offline).

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

## Battle types

The **BATTLE** picker on the main menu chooses what kind of battle you fight. Each one is a mod with its own map;
picking a card installs and switches it on for you and restarts on its map. Aviation and Naval also offer a
**MAP** and a **MODE** row under the cards.

- **NORMAL**: the base game, infantry and tanks on Karsa Valley (or a map mod you switched on).
- **TANKS** (Tank Warfare): everyone commands a tank, up to 10 a side, on Iron Steppe, a wide open map of farms,
  a rail depot and the crossroads town of Karsk. Deploy at your HQ or a flag you hold and you start in a tank.
- **AVIATION**: an air war on 3 km maps (about six times the normal one): **Highlands** (mountains and green
  valleys), **Dune Sea** (desert dunes and mesas) and **Fjordland** (fjords, glaciers and snowy peaks). Everyone
  flies the jets and bombers (the Jets and Bombers mods only run here), up to 10 aircraft a side. Modes:
  **Conquest** (sky zones: fly through one to take it, bomb one the enemy holds to knock it back), **Air
  Superiority** (no zones, shoot down their air force) and **Ground Strike** (bomb the enemy airbase's radar,
  fuel depot, hangars, command bunker and C-RAM sites; every one lost costs tickets). Every airbase is guarded by
  **C-RAM** guns. Nobody aims them: they open up by themselves on air attacks only (enemy jets flying low, and
  the bombs, rockets and missiles they release) and on the **drone strikes** each side sends at the other's
  airbase about once a minute. When your side's guns engage something incoming near you, or a strike comes for
  you, the base alarm sounds like the real one over a base's loudspeakers: a wailing siren with an echo, then
  "INCOMING, INCOMING, INCOMING". A slow beep means an enemy C-RAM is tracking you, a fast one that it's firing.
  To hear the real recording instead, use **LOAD REAL SOUND** next to C-RAM ALARM in the main menu's settings
  (MP3 or WAV under 2.5 MB; **BUILT-IN** goes back, **TEST** plays it).
- **NAVAL**: cruisers (Ticonderoga / Slava), destroyers (Arleigh Burke / Sovremenny), frigates (Constellation /
  Grigorovich), corvettes (Freedom LCS / Buyan-M) and patrol boats, eight ships a side. Maps: **Sapphire Strait**
  (rocky islands), **Iron Harbor** (a grey port between two coasts) and **Arctic Passage** (pack ice and
  icebergs). Modes: **Conquest** (buoys), **Fleet Battle** (no flags, sink the enemy fleet) and **Strike** (shell
  the enemy's shore installations while their coastal batteries shoot back). Pick your ship on the deploy
  screen. W/S set the engine telegraph and A/D the rudder, you aim with the mouse (or a drag) and the guns
  elevate themselves to land where you aim. 1/2/3 switch between guns, torpedoes (a dashed line shows where they
  will run) and anti-ship missiles (hold the sight on a ship or shore target to lock). **G** (NADE) switches HE
  and AP shells, right mouse (AIM) gives binoculars. Hits start **fires**, **flood** compartments (the ship
  settles and lists) and knock out the **engine**, **rudder** or **guns** for a while; **R** (RELOAD) calls the
  damage control party. About once a minute each side sends a **drone strike** (a swarm of one-way attack
  drones that dive onto a ship) or an **air strike** (two strike jets that release missiles and bombs) at the
  other. The bigger ships' **Phalanx CIWS** guns take them on by themselves, the strike jets included, with the
  same alarms and sound as the C-RAM; they leave enemy ships' shells and missiles alone.

### Career

The game has War Thunder style progression built in (the **Career** mod is installed and switched on by itself
and can't be switched off). You start with nothing but a patrol boat, an F-16C (or MiG-29) and the standard guns,
0 research points (RP) and 0 silver (SL). Winning battles pays RP and silver (a lost battle pays only a quarter;
the big naval and aviation battles pay more); the after-action report shows what you earned. In the **HANGAR**
(main menu or deploy screen) research ships, aircraft and guns with RP, one after another down each tree, then
buy them with silver. Only what you own goes into battle, and you always sail and fly **your own** ship or
aircraft: the bots never take it, and when it's sunk or shot down it's back at the harbour or airbase a few
seconds later. Owned ships and aircraft take modifications you research,
buy and switch on (reinforced hull, gas turbines, rudder, gun loading drill, fast rearming, Phalanx Block 1B,
damage control training, spall liners; engine tuning, airframe, flight controls, extra flares). New guns to
unlock and equip per class: AK-12, SCAR-H, MP5A3, KRISS Vector, Remington 870, M249 SAW, PKP Pecheneg, Mk 14 EBR,
AWM, Glock 17 and Desert Eagle.

For testing there is a separate mod that is **not** part of the game:
[`extras/infinite-everything.sfmod.json`](extras/infinite-everything.sfmod.json). Import it from MODS → IMPORT
MOD FILE: the HANGAR shows ∞ RP and silver (what you unlock stays unlocked), and in battle you, your ship and
your aircraft take no damage and never run out of ammo, missiles, torpedoes, bombs or flares. Remove it to play
normally.

## Multiplayer

Add the **Multiplayer** mod (MODS screen), then press **MULTIPLAYER** on the main menu. One player hosts a game and
gets a 4-letter code; anyone else joins with the code and picks a side. The host's game runs the bots, the flags,
the tickets and the buildings, everyone plays their own soldier, and tanks, jets, bombers and ships are driven by
whoever gets in. Up to 8 players. It works in every battle type: the host's battle decides, and if you have a
different one picked, the game room shows a button that switches over and joins again by itself.

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
- Build whole new maps up to 6 km across: flags, HQs, destructible buildings, roads, props, terrain, seas with
  islands and vegetation, or no flags at all for Team Deathmatch.
- Add whole battle types with their own card on the main menu.
- Run scripts that hook into damage, firing, explosions, projectiles, movement, reloading and scoring, and that
  can spawn explosions and bots, move soldiers, build 3D objects with collision, add HUD elements, bind keys
  (with touch buttons on phones), run timers, save data and slow down time.

Bundled examples: the three battle types (Tank Warfare, Aviation, Naval), Multiplayer (online play with friends), Jets (F/A-18E, F-16C, A-10C, Su-27, MiG-29, Su-25) and Bombers (B-17 and Lancaster) for Aviation battles, Career
(research and buy ships, aircraft and guns), Armory (earn credits from kills and upgrade your guns with
suppressors and more), Vehicle Interiors (sit inside tanks and
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
