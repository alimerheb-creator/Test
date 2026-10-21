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

## Windows app

A ready-to-run Windows program is in [`exe/SixthFront.exe`](exe/SixthFront.exe) (about 10 MB, nothing to
install, works offline except for multiplayer).

1. Download `SixthFront.exe` and double-click it. It is not signed, so the first time Windows may say
   "Windows protected your PC": click **More info**, then **Run anyway**.
2. The game opens in its own window, maximized. **F11** switches to full screen and back.

It plays in the Microsoft Edge WebView2 Runtime, which comes with Windows 11 and up-to-date Windows 10. Without
it, the game opens in your web browser instead (keep the little Sixth Front box open while you play). Your
progress is kept in `%LOCALAPPDATA%\SixthFront`; delete that folder to start over. Windows 10 or 11, 64-bit.

To rebuild it yourself (Linux, macOS or Windows with Git Bash; needs Node and Go 1.24 or newer, no C compiler):

```bash
npm install
npm run build:exe        # writes windows/build/SixthFront.exe
```

`npm run release` builds both apps and copies them to `apk/SixthFront.apk` and `exe/SixthFront.exe`; the
iPhone app is built by GitHub (below). Every release ships all three together.

## iPhone and iPad app

The iOS app is in [`ipa/SixthFront.ipa`](ipa/SixthFront.ipa) (about 2 MB, works offline except for multiplayer).
GitHub builds it on a Mac from the same game files every time the game changes
([`.github/workflows/ios.yml`](.github/workflows/ios.yml)), and starts it on an iPhone simulator to check the game
comes up.

Apple only lets signed apps onto an iPhone, and signing needs an Apple account, so the file is unsigned: install it
with a sideloading tool that signs it with your own Apple ID.

1. On a computer, install **Sideloadly** (Windows or Mac) or **AltStore**.
2. Connect the iPhone or iPad with a cable, open Sideloadly, drop `SixthFront.ipa` in, type your Apple ID and press
   **Start**.
3. On the iPhone: **Settings → General → VPN & Device Management**, tap your Apple ID and **Trust** it. On iOS 16 and
   newer also switch on **Settings → Privacy & Security → Developer Mode** (the phone restarts).
4. Open **Sixth Front**. It runs full screen in landscape, keeps the screen on, and saves on the device.

With a free Apple ID an installed app runs for 7 days before it has to be signed again (AltStore and Sideloadly can
refresh it automatically); a paid Apple Developer account makes it a year. Needs iOS 15 or newer.

No computer at hand? Play it in Safari: put the game on GitHub Pages (see *Play it in a browser*), open it on the
iPhone, then **Share → Add to Home Screen**. It then opens full screen from its own icon.

To build the app yourself on a Mac: `npm install`, `brew install xcodegen`, then `bash ios/build-ipa.sh` (writes
`ios/build/SixthFront.ipa`; `ios/` holds the Swift app that runs the game).

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
- **Soldiers**: modelled with shaped limbs and joints, a plate carrier with magazine pouches, radio and
  assault pack, a helmet with headset and NVG mount, camouflage on the uniform, and a carbine with optic, magazine
  and foregrip. They shoulder the rifle when fighting and carry it at low ready when running or with no enemy
  about; knees bend as they walk, crouch (kneeling on one knee) and crawl. When they die their knees give way and
  they fall back, forward or to the side, limbs loose, and the rifle drops beside them.
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
- **Graphics**: HDR rendering with ambient occlusion (from Medium up: soft shadowing in corners, under vehicles and where things meet the ground), sunlit haze (distant ground glows toward the sun), cloud shadows drifting over the land, heat haze shimmering behind jet engines and round explosions, sunlight glowing through leaves and grass when you look toward it, bullet holes in walls, crates, rock, metal and the ground, spent cases flying out of the ejection port (red shells from the shotgun), tank tracks pressed into the dirt behind every tank, soft contact shadows under distant soldiers and tanks (beyond the reach of the sun's shadows), ships of weathered steel (rust weeping down the sides, plate seams, a stained waterline, non-skid decks), ships trailing a wake of broken foam that spreads and fades behind them, bloom, sun glare and lens ghosts, ACES tone mapping with colour grading,
  film grain and vignette, image-based reflections (the weapon in your hands too: rounded machined edges, bead-blasted steel and stippled polymer, rail teeth, ports, sights, muzzle devices and butt pads, gloved fingers round the grip, a muzzle flash that lights the gun), ground that varies in big drier and greener patches instead of repeating, weathered and mud-spattered tanks with skirts, road wheels and tracks, plank crates, normal-mapped walls and ground, wind-blown grass and trees,
  textured smoke, MSAA (FXAA edge smoothing on Medium, where there is no MSAA) and soft shadows. From Medium up: firs made of sprays of needles and broadleaf trees of
  leaf clusters (with barked trunks and shadows the shape of the foliage), weathered and lichened boulders;
  buildings with window frames and sills, glass that reflects the sky, mullions, shutters, string courses,
  cornices and coping, a darker plinth, dressed stone at the corners, iron balconies, downpipes and air
  conditioners, water tanks and aerials on the roofs (all of it goes with the wall it is on); explosions with a
  billowing fireball, a ring of dust blown out along the ground, sparks and embers, a column of smoke that hangs
  for a while and a scorch mark left behind, and broken lumps of masonry or earth flying out trailing dust.
  Presets: Auto, Low, Medium, High, Ultra (Auto picks Medium on phones and High on desktop).
- **Mobile controls**: virtual stick, drag-to-look, and a context button that appears when you can act
  (hold to **revive** a downed teammate with a progress ring, enter or exit a tank, detonate C-4). There are
  also buttons for prone, sprint (latches on), map and scoreboard, plus aim assist, optional auto-fire,
  vibration, and adjustable look sensitivity and button size. When you're down, a button lets you give up
  and redeploy.

## Career Mode

**CAREER MODE** on the main menu is a story campaign for each kind of battle: infantry, tanks, aviation and
naval. Each one runs from the First World War through the Second and the Cold War to the present day, in four chapters. A
mission picks its own battle, map, armies and weather, puts you in your seat and plays out a script: radio
calls (read aloud if you switch RADIO VOICE on), objectives, waves, and the crew or section fighting beside
you. Finishing a mission opens the next one and pays research points, silver and gold into the RESEARCH
screen, with up to three stars for how well it went. Fail a mission and the next try at it goes a little easier on you,
each time, up to four times; win it and it goes back to normal.

- **Aviation**: ten missions in each of the four wars.
  **1914–1918**: **THE FOKKER SCOURGE**, Immelmann's wingman in an Eindecker, diving on the B.E.2cs from behind
  where the observer can't shoot; **THE AIRSHIP OVER CUFFLEY**, a B.E.2c at night over London with the new
  incendiary bullets: spraying SL 11's length does nothing, a whole drum into one place sets her alight, and London
  watches her fall; **BLOODY APRIL**, Sopwith Pups escorting B.E.2s over Arras against Richthofen's red Albatros;
  **THE GOTHAS**, the long climb after the daylight bombers over the City (nobody shot one down that day);
  **BALLOON BUSTERS** over Ypres; **THE DAWN RAID**, Bishop alone over a German aerodrome, catching the Albatros as
  they lift off; **THE RED BARON**; **THE PIAVE**, Baracca's SPADs strafing the Austro-Hungarian columns at the
  pontoon bridges, low through the ground fire; **CHÂTEAU-THIERRY**, the 94th Aero's SPADs keeping JG I's Fokker
  D.VIIs off the American balloons; **AMIENS**, S.E.5as with Cooper bombs on the field guns and the Somme bridges.
  **1939–1945**: **THEIR FINEST HOUR**; **PEARL HARBOR**, Welch and Taylor's P-40s up from Haleiwa against the Vals
  over battleship row; **MIDWAY**, an SBD of Scouting Six following the destroyer Arashi to the Kidō Butai and
  diving on the Kaga, the radioman firing aft; **DAMBUSTERS**; **THE FLYING TANK**, Il-2s laying PTAB bomblets along
  the panzer columns at Kursk, the gunner holding off the Focke-Wulfs; the B-17 missions (**BANDITS AT SIX**,
  **BOMBS AWAY**, **STRAGGLER**, **LITTLE FRIENDS**); **THE SWALLOW**, an Me 262 of JG 7 with R4M rockets against a
  box of Fortresses, then home to an airfield the Mustangs are circling.
  **The Cold War**: **MIG ALLEY**, McConnell's Sabre against the MiG-15s, never across the Yalu, with twenty minutes
  of fuel; **OPERATION FOCUS**, a Mirage under the radar to Bir Gifgafa, bombs on the runway and the cannon on the
  MiGs parked in rows; **OPERATION BOLO**, Olds's Phantoms (no gun, just missiles) pretending to be F-105s until the
  MiG-21s come up through the cloud; **THUD RIDGE**, an F-105D down the ridge to the Thai Nguyen steel works through
  the SA-2s and the 57 mm guns, MiG-17s waiting; **SANDY ONE**, a Skyraider over Roger Locher after 23 days on the
  run, clearing the guns round him and covering the Jolly Green in the hover; **MANSOURA**, an Egyptian MiG-21
  against the Phantoms and Neshers coming for the runway; **GULF OF SIDRA**, an F-14 that mustn't fire first, until
  the Su-22 does; **MOLE CRICKET 19**, an F-16 over the Bekaa with Python 3s; **SAN CARLOS**, a Sea Harrier cutting
  off the Daggers and Skyhawks before they reach the ships; and **ELEVEN DAYS OF CHRISTMAS**.
  **Since 1991**: **TASK FORCE NORMANDY**, Apaches fifty feet over the desert, Hellfires on the radars at H-hour;
  **THE FIRST NIGHT**, an F-117 over Baghdad with two laser-guided bombs, the whole city's guns firing blind;
  **WILD WEASEL**; **HOG HEAVEN**, an A-10 on the Republican Guard's dug-in tanks under the oil smoke;
  **ALLIED FORCE**, an F-15C with AMRAAMs against the MiG-29s heading for Tuzla; **HORSE SOLDIERS**; **ANACONDA**,
  Apaches over Hell's Halfpipe in the Shahi-Kot, never hovering where the RPGs can find you; **ODYSSEY DAWN**, a B-2
  with sixteen JDAMs down a row of hardened aircraft shelters; **THE RED SEA**, a Super Hornet against a swarm of
  Shahed drones and cruise missiles; and **VAMPIRE, VAMPIRE**.
  Thirty more aircraft for them, each at real size with its own engine, guns and markings, from the Fokker E.III
  to the F-117: the B.E.2c, Albatros D.III, Pup, Nieuport 17, SPAD XIII, Fokker D.VII, S.E.5a and Gotha; the P-40,
  Zero, Val, Dauntless, Il-2 and Me 262; the F-86, MiG-15, MiG-17, F-4C and F-4E, F-105, A-1, Mirage III, Nesher,
  Dagger, F-14 (its wings sweep with speed), Su-22, MiG-23, Sea Harrier and A-4; and the Shahed drone. Missiles
  are as good as they were: the 1960s Sidewinder has to be fired from behind and mostly misses, the AIM-9L locks
  head-on; and bombs, rockets and missiles are one load a sortie.
- **Tanks**: ten missions in each of the four wars.
  **1914–1918**: **FLERS**, the first tanks in history, D17 "Dinnaken" up the High Street (its engine stalls now and
  then); **BERRY-AU-BAC**, the French Schneiders across open ground under the German guns; **BULLECOURT**, Mark IIs in
  the snow crushing gaps in the wire for the Australians; **FRAY BENTOS**, ditched in a shell hole and holding out
  for three days; **CAMBRAI**, and the first tank-against-tank fight at Villers-Bretonneux; **HAMEL**, Monash's
  93 minutes, crushing the machine-gun posts in Vaire Wood and the village under your tracks; **SOISSONS**, the
  Renault FTs in the wheat; **MUSICAL BOX**, a Whippet alone behind the lines at Amiens, machine-gunning a field
  battery and a camp; **SAINT-MIHIEL**, Patton's FTs.
  **1939–1945**: **STONNE**, the Char B1 "Eure" in the village; **RASEINIAI**, one KV-2 holding a German division's
  road for a day, and the pioneers who come at night with charges for the tracks; **MTSENSK**, Katukov's T-34
  ambushes against Guderian's panzers; **STEEL, STEEL, STEEL** at Prokhorovka; **SUPERCHARGE** at El Alamein; **HOLD
  THE CROSSROADS** in Normandy; **FIREFLY**, the Sherman Firefly in the orchard waiting for Wittmann's Tigers to come
  side-on; **ARRACOURT**, Shermans in the fog against the new Panthers; **BREAKTHROUGH TO BASTOGNE**; **COLOGNE
  CATHEDRAL**, a Pershing round the side streets of the bombed city to the Panther in the square.
  **The Cold War**: **THE BOWLING ALLEY**, Pershings at night on the Taegu road; **THE HOOK**, Centurions dug in on a
  Korean ridge firing over the infantry; **ASAL UTTAR**, Indian Centurions hidden in the sugar cane and the Pattons
  bogged in the flooded fields; **CHAWINDA**, one Pakistani regiment against an armoured division; **ABU-AGEILA**,
  Sharon's night attack in the Sinai; **THE VALLEY OF TEARS**; **BASANTAR**, the Poona Horse across the minefields;
  **THE CHINESE FARM**, Sagger teams in the irrigation ditches; **DEZFUL**, the Iranian armoured division in the
  Iraqi trap; **SULTAN YACOUB**, Israeli tanks cut off in a Lebanese valley at night.
  **Since 1991**: **KHAFJI**, Qatari and Saudi tanks in the streets; **73 EASTING**; **MEDINA RIDGE**, M1A1s
  against the Republican Guard's dug-in tanks at long range; **BASRA**, Challengers on the canal bank; **OBJECTIVE
  PEACH**, the Euphrates bridge and the night counter-attack; **THUNDER RUN**, up Highway 8 into Baghdad; **FALLUJAH**,
  Abrams with the Marines against the strongpoints; **WADI SALUKI**, Merkavas against Hezbollah's Kornet teams on
  the ridges; **MOSUL**, holding the hospital until the relief column gets through car bombs and drones; and a last
  stand in Karsk.
  Each era's tanks have their own models, guns (fast and flat-shooting in the modern ones, slow and arching in
  the old ones) and armour (front, side and rear), the infantry on both sides carry their own era's weapons and
  wear their own uniforms, machine-gun posts can be crushed under the tracks, and the earth ramps give you a
  hull-down position where only your turret shows. Winter missions cover the map in snow, desert missions turn
  it into sand and stony ridges, the town missions build a city of flat-roofed houses or bombed ruins. An enemy
  crew can't mend a holed tank in the middle of a fight; yours still patches itself up slowly when it's left alone.
- **Naval**: ten missions in each of the four wars.
  **1914–1918**: **HELIGOLAND BIGHT**, Beatty's battlecruisers storming into the Bight after Tyrwhitt's destroyers;
  **U-9**, Weddigen's submarine sinking Aboukir, Hogue and Cressy one after another as each stops for the last;
  **CORONEL**, Cradock's old cruisers against von Spee at sunset; **EMDEN BEACHED AND KNOCKED OUT**, HMAS Sydney at
  the Cocos Islands; **THE FALKLAND ISLANDS**, Invincible and Inflexible running down Scharnhorst and Gneisenau;
  **THE DOGGER BANK**, Lion's damage control while Blücher is finished off; **THE RUN TO THE SOUTH** at Jutland;
  **THE Q-SHIP**, Campbell's Farnborough taking the torpedo, the panic party in the boat, the hidden guns behind the
  screens; **ZEEBRUGGE**, Vindictive alongside the mole under the guns while the blockships go into the canal; **THE
  PREMUDA RAID**.
  **1939–1945**: **THE RIVER PLATE**; **DUNKIRK**, HMS Gallant alongside the East Mole loading troops under the
  Stukas; **CAPE MATAPAN**, Warspite's guns at point-blank range on the Italian cruisers in the searchlight;
  **THE MIGHTY HOOD**; **SINK THE BISMARCK**; **WASHINGTON AND KIRISHIMA**, Lee's radar-directed sixteen-inch guns off
  Savo Island while the Japanese shell the South Dakota; **CONVOY ONS 5**, a corvette's radar, Asdic and Hedgehog
  in the night the wolf packs broke; **NORTH CAPE**, the Scharnhorst run down in the Arctic dark; **SMALL BOYS,
  ATTACK**; **THE SHIP THAT WOULD NOT DIE**, the destroyer Laffey on the radar picket line off Okinawa under
  twenty-two kamikaze attacks.
  **The Cold War**: **THE YANGTZE INCIDENT**, Amethyst's night escape past the batteries; **THE SITTING DUCKS**, US
  destroyers anchored off Wolmi-do as bait for the Inchon guns; **BLACK SATURDAY**, practice depth charges on a
  Soviet submarine off Cuba that turns out to carry a nuclear torpedo; **THE GULF OF TONKIN**, USS Maddox and the
  torpedo boats; **THE BROWN WATER NAVY**, a river patrol boat on the Mekong; **LATAKIA**, the first missile battle at
  sea, Israeli Sa'ar boats against Syrian Ossas; **OPERATION TRIDENT**; **CONQUEROR AND THE BELGRANO**, a nuclear
  submarine's World War Two torpedoes; **BOMB ALLEY**, HMS Broadsword with Coventry off Pebble Island; **PRAYING
  MANTIS**.
  **Since 1991**: **THE BUBIYAN TURKEY SHOOT**, Lynx helicopters' Sea Skuas on the Iraqi fast attack craft; **SEA DART
  AND THE SILKWORM**, HMS Gloucester saving USS Missouri; **THE BATTLESHIP**, Missouri's guns, and Iraqi soldiers on
  Faylaka surrendering to a drone; **THE CRAB WAR**, ramming North Korean boats back over the Northern Limit Line;
  **INS HANIT**, a C-802 from Beirut and the fight to save the ship; **THE LIFEBOAT**, the Maersk Alabama's
  lifeboat and the SEAL snipers; **DAWN OF THE GULF OF ADEN**, Korean commandos retaking the Samho Jewelry;
  **NINE HOURS IN THE RED SEA**, USS Carney against cruise missiles and drones from Yemen; **THE LAST DITCH**, a
  destroyer's Phalanx as the very last defence; **SURFACE ACTION GROUP**.
- **Infantry**: ten missions in each of the four wars.
  **1914–1918**: **MONS**, the regulars of the BEF on the canal bank, fifteen aimed rounds a minute against the
  German columns, Dease's Vickers gun at the Nimy bridge, then the order to retire; **ANZAC COVE**, out of the boats
  at dawn on the wrong beach, up the scrub-covered cliffs to Plugge's Plateau, and Mustafa Kemal's counter-attack;
  **FORT VAUX**, sandbag barricades in the dark galleries under the fort against grenades and flamethrowers, and
  Raynal's last pigeon; **OVER THE TOP** on the first day of the Somme; **THE CREEPING BARRAGE** at Vimy Ridge;
  **CAPORETTO**, with Rommel's mountain troops through the mist up Monte Matajur: get above the Italian positions
  and they surrender; **PASSCHENDAELE**, the duckboards and the mud (it slows you down) to the concrete pillboxes on
  the Meetcheele spur, bombs through the loopholes; **KAISERSCHLACHT**, a German stormtrooper through the fog past
  the British outposts to storm Manchester Hill; **BELLEAU WOOD**, across the wheat field (lie down in it and you're
  hard to hit) into the wood; **SERGEANT YORK**, behind the German lines to a battalion headquarters, the machine
  guns on the ridge, Lieutenant Endriss's bayonet charge, and the prisoners marched back.
  **1939–1945**: **THE RAATE ROAD**, Finnish ski troops in the snowy forest blowing up the Soviet column's field
  kitchens and blocking the breakout; **EDSON'S RIDGE**, a night on Guadalcanal under the flares, banzai charges, and
  the fall back to the last knoll; **PAVLOV'S HOUSE**; **MONTE CASSINO**, the Poles on Point 593 and up to the ruined
  abbey, the flag on the rubble and the Kraków trumpet call; **PEGASUS BRIDGE**, out of the glider at 00:16, the
  pillbox, "Ham and Jam", the PIAT against the tank at the T-junction and Lord Lovat's piper; **BRÉCOURT MANOR**;
  **A BRIDGE TOO FAR**, Frost's paratroopers in the houses at Arnhem bridge against Gräbner's armoured cars and
  half-tracks; **THE BOIS JACQUES**; **IWO JIMA**, up Suribachi's black ash with satchel charges for the caves, and the
  flag on the crater rim; **THE REICHSTAG**, across the Königsplatz and into the building, holding the hall while
  the Victory Banner goes up.
  **The Cold War**: **FOX HILL** at the Chosin Reservoir at thirty below, the bugles in the night and the Corsairs at
  dawn; **PORK CHOP HILL**, up behind the barrage to the bunkers on the crest; **DIEN BIEN PHU**, Bigeard's
  paratroopers on Éliane 2; **IA DRANG**, the Hueys into LZ X-Ray, the lost platoon and "Broken Arrow"; **LONG TAN**,
  in the rubber trees in the monsoon rain, the ammunition drop and the APCs at dusk; **AMMUNITION HILL**, trench by
  trench in the night; **HUE CITY**; **GOOSE GREEN**, the gorse gully under Darwin Hill; **MOUNT TUMBLEDOWN**, sangar
  to sangar in the crags and the bayonet charge; **HILL 3234**, the 9th Company's twelve hours in Afghanistan.
  **Since 1991**: **MEDAK POCKET**, UN peacekeepers who may only fire back, and a roadblock where you mustn't fire at
  all; **BLACK HAWK DOWN**, to the crash site in Mogadishu, the night round the wreck and the Mogadishu Mile;
  **TAKUR GHAR**, out of a burning Chinook onto a snowy summit; **NASIRIYAH**, the Saddam Canal bridge and the wounded;
  **DEBECKA PASS**, Javelins against T-55s; **FALLUJAH**, house by house, and the Hell House; **SANGIN**, the district
  centre under siege; **WANAT**, ammunition up to Topside; **KAMDESH**, taking Combat Outpost Keating back; **MOSUL**,
  drones dropping grenades, a car bomb, and the ruins of the al-Nuri mosque.
  The ground is made for each battle: hills, ridges and mountains raised, canals and trenches dug with water in
  them, jungle and elephant grass, a rubber plantation, Flanders mud with flooded shell holes, black volcanic ash, a
  bombed city, walled compounds; illumination flares light the night battles. Every army wears its own uniform
  and headgear (the Pickelhaube, the Brodie, the Adrian, the Stahlhelm, slouch hats and kabalaks, the M1, the
  SSh-40, Japanese and Chinese helmets and fur caps, pith helmets, red berets, UN blue helmets, turbans, and modern
  helmets and plate carriers) and carries its own weapons, each with its own first-person model: the Lee-Enfield,
  Lebel, Gewehr 98, Springfield, M1917, Carcano, Mauser, Arisaka, Mosin-Nagant, Chauchat, Lewis, MG 08/15, MP 18,
  Suomi, PPSh, Thompson, Sten, Bren, BAR, DP-27, Type 96, M1 Garand, M1 carbine, MP 40, MG 42, MAT-49, Owen, Uzi,
  FN FAL and SLR, GPMG, M16, M60, AK-47, AK-74, RPK, PKM, C7, M4, L85, M249 and M240, with PIATs, LAWs, AT4s,
  SMAWs, Javelins, M79s and satchel charges. Men charging or firing on the run hit less often than men lying in a
  trench, and each time you are hit and carried back the mission goes a little easier on you. In the ground missions
  before 1991 the map's shipping containers and concrete barriers are gone.

## Battle types

The **BATTLE** picker on the main menu chooses what kind of battle you fight. Each one is a mod with its own map;
picking a card installs and switches it on for you and restarts on its map. Aviation and Naval also offer a
**MAP** and a **MODE** row under the cards.

- **NORMAL**: the base game, infantry and tanks on Karsa Valley (or a map mod you switched on), with attack
  helicopters flying ground support (see below).
- **TANKS** (Tank Warfare): everyone commands a tank (or an attack helicopter), up to 10 a side, on Iron Steppe, a wide open map of farms,
  a rail depot and the crossroads town of Karsk. Deploy at your HQ or a flag you hold and you start in a tank.
- **AVIATION**: an air war on 3 km maps (about six times the normal one): **Highlands** (mountains and green
  valleys), **Dune Sea** (desert dunes and mesas), **Fjordland** (fjords, glaciers and snowy peaks) and **Sea
  Canyons** (sheer, layered cliffs standing in the sea with narrow channels between them, made for flying low between
  the walls, with a low afternoon sun straight down the channels) and **Pine Gorge** (a pine-forested plateau cut by
  a river canyon a hundred metres deep, with its two forks, waterfalls pouring off the rim and four stone arch bridges
  you can fly under) and **Schweinfurt** (the bombers' map: patchwork farmland with hedges and lanes, villages
  with red roofs and church spires, the town on its river, the ball-bearing works with their sawtooth halls and
  chimneys, a reservoir in the hills held back by a masonry dam with two towers, and a deck of cloud below the
  bombers). The land is full of detail when you fly low: pine forests along the rims and on the mesa tops,
  crags and ledges with pines growing out of them on the cliff faces, layered rock with moss in its cracks, boulders
  at the foot of the cliffs, waterfalls with spray and mist lying in the channels. Everyone
  flies the jets and bombers (the Jets and Bombers mods only run here), up to 10 aircraft a side, about four jets
  to every bomber. Twenty aircraft: for Vanguard the F-16C, F/A-18E, F-35A and F-22A fighters, the A-10C and
  F-15E for ground attack, and the B-17G, B-52H, B-1B and B-2A bombers; for Onyx the MiG-29, Su-27, Su-35S and
  Su-57, the Su-25 and Su-34, and the Lancaster, Tu-95MS, Tu-22M3 and Tu-160. The **F-35A, F-22A, Su-57 and B-2A
  are stealthy**: enemy missiles lock on to them slower and only from closer. **Radar missiles** (AIM-120, R-77)
  reach about twice as far as heat seekers and fall for flares less often; **guided bombs** (JDAM, KAB) glide
  onto an enemy vehicle or installation near where they would have landed; the modern bombers carry **cruise
  missiles** (JASSM, Kh-101, Kh-22) that lock on from about two kilometres, and the **B-1B, Tu-22M3 and Tu-160
  sweep their wings back** as they speed up. **Flight is real physics**: thrust along the nose, lift square to the
  airflow that grows with the square of the speed and with the angle of attack until the wing stalls, drag (a huge
  air brake with the jet broadside to the air), gravity, and a velocity that can stop and go backwards; the
  controls turn the nose against the airframe's own stability, which swings the nose into the airflow. A
  fly-by-wire system keeps the angle of attack under the stall and the load under the g limit, so the tightest
  turns come near corner speed, a hard turn bleeds speed, and the engines (about 1 g of thrust, 1.4 g in
  afterburner) can't hold a vertical climb for ever. **No buttons for manoeuvres: they come out of the physics.**
  In the **Su-27, Su-35S, Su-57, MiG-29 and F-22A** a sharp, hard pull from level flight at a moderate speed
  (flick the aim far up above the nose, or snap the stick back) overrides the limiter, and you fly **Pugachev's
  Cobra**: the nose rears up past vertical while the jet slides on along its path and the air brakes it hard, then
  comes back down as you let go, so a chaser overshoots and a missile closing in can lose you. Hold the pull in the
  thrust-vectoring Su-35S, Su-57 or F-22A and the nose keeps going right over, the **Kulbit**. In any jet, climb
  straight up with the throttle back until the speed runs out: it stops, slides back on its tail, and the airflow
  swings the nose down through the vertical like a bell's clapper into a dive, the **Kvochur Bell**. The HUD names
  the manoeuvre while you fly it. Bots throw a Cobra at whoever sits on their tail. **Damage** goes to
  the part that is hit: shoot a **wing** and it breaks off (with its engines and missiles), tumbles down burning
  and the aircraft rolls toward the missing wing and spins in; a shot-off **fin** or **tailplane** leaves it flying
  but hard to control, and hits around the cockpit hurt most. Damaged aircraft trail grey, then black smoke, then
  burn with a streaming flame. **Flares** come out the way each aircraft really dispenses them: the Flankers and
  MiG-29 fan them up and out of the tail, the US fighters drop short bursts from under the fuselage, the A-10 and
  Su-25 ripple long strings to both sides, bombers lay big "angel wing" fans and helicopters fire them sideways,
  each one burning white-hot with a thick smoke trail. The canopies are tinted glass (gold on the F-16, F-22,
  F-35 and Su-57) over a cockpit with the pilot in helmet, visor and oxygen mask, the ejection seat, the glare
  shield and the HUD. The chase camera frames every jet the same way, the whole aircraft in the lower half of the
  screen with its fins just under the aiming point (the F/A-18's twin fins no longer fill the view). The **sea** is
  drawn by its own shader: waves at three scales, the sky, clouds and cliffs mirrored in it, the sun's glittering
  path, turquoise shallows and surf along the shore. Looking toward the sun you see **sun shafts** past the cliffs
  and wings. **Afterburners** burn as glowing plumes with shock diamonds, cannon **tracers** fly out as white-hot
  streaks (a glowing dot when seen from right behind) with a **muzzle flash**, and the rounds throw up spray from
  the water and dust from the ground. A jet skimming the sea throws up spray, the edges of the picture blur at
  speed, and long white **contrails** stream off the wingtips of fast jets. The HUD
  has a **compass radar** (heading-up, with the view ahead as a pale wedge and every aircraft as an arrow, red the
  enemy and blue your side), the **pilot's name** over each aircraft, and a **top view of your aircraft** whose
  wings, tail and fuselage turn yellow, orange and red as they are hit (a part shot off is dashed). On a phone the
  **buttons change when you fly**: the soldier's buttons give way to the aircraft's own, the weapons by name (GUN,
  MISSILE, BOMBS, ROCKETS, ATGM... with what's left), FLARES, CAMERA, ZOOM (BOMB SIGHT with bombs) and SPOT, and
  EJECT moves up next to the pause button. A **throttle slider** sits on the left (the top is
  afterburner), the fire button is a big round button with rounds on it, you steer by dragging anywhere, and the
  minimap makes room for the radar. Modes:
  **Conquest** (sky zones: fly through one to take it, bomb one the enemy holds to knock it back), **Air
  Superiority** (no zones, shoot down their air force) and **Ground Strike** (bomb the enemy airbase's radar,
  fuel depot, hangars, command bunker and C-RAM sites; every one lost costs tickets). **Your spawns:** each
  aircraft in your crew is yours alone and comes back at your airbase about 6 seconds after you lose it (ejecting
  counts as losing it). With **1 aircraft** in your crew you get **3 spawns** in it; with **2**, the first gets
  **2** and the second **1**; with **3 or 4**, each gets **1**. The deploy list shows how many each one has left
  ("2 SPAWNS LEFT", "BACK IN 4 S"). Every airbase is guarded by
  **C-RAM** guns. Nobody aims them: they open up by themselves on air attacks only (enemy jets flying low, and
  the bombs, rockets and missiles they release) and on the **drone strikes** each side sends at the other's
  airbase about once a minute. When your side's guns engage something incoming near you, or a strike comes for
  you, the base alarm sounds like the real one over a base's loudspeakers: a wailing siren with an echo, then
  "INCOMING, INCOMING, INCOMING". A slow beep means an enemy C-RAM is tracking you, a fast one that it's firing.
  To hear the real recording instead, use **LOAD REAL SOUND** next to C-RAM ALARM in the main menu's settings
  (MP3 or WAV under 2.5 MB; **BUILT-IN** goes back, **TEST** plays it).
- **NAVAL**: battleships (Iowa / Sovetsky Soyuz: nine 406 mm guns in three turrets that fire together, eight
  Harpoons, four Phalanx guns), cruisers (Ticonderoga / Slava), destroyers (Arleigh Burke / Sovremenny), frigates
  (Constellation / Grigorovich), corvettes (Freedom LCS / Buyan-M) and patrol boats, nine ships a side. Maps: **Sapphire Strait**
  (rocky islands), **Iron Harbor** (a grey port between two coasts), **Arctic Passage** (pack ice and
  icebergs) and **North Sea** (open water, grey swell). Modes: **Conquest** (buoys), **Fleet Battle** (no flags, sink the enemy fleet) and **Strike** (shell
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
  **Missile defence.** Every ship, the patrol boat included, has **decoy launchers** (Space, DECOY on a phone):
  chaff and flare rockets out to both sides that pull most of the missiles coming for you onto the decoys (three
  salvos, one back every 20 s). **V** (SMOKE) lays a **smoke screen**: for 16 s nobody can lock a missile on you,
  missiles already flying at you lose you, and the enemy loses sight of you beyond a few hundred metres (45 s to
  get it back). Missiles also miss sometimes, more often against small, fast boats. Bot captains do the same.

### Matchmaking: you fight your own level

Your **battle rank** in a battle type is the highest rank (I to V) in your crew slots for it. The bots on both
sides then use only what's within one rank of it, so beginners meet beginners:

- **Naval:** with only the patrol boat (rank I) the fleets are patrol boats and corvettes; a corvette brings in
  frigates and destroyers; a battleship captain meets destroyers, cruisers and battleships.
- **Aviation:** a beginner's F-16C (or MiG-29) meets MiG-29s, Su-27s, Su-25s, Lancasters and Mi-24s, not Su-57s
  and F-22As; the stealth fighters and modern bombers only show up once you fly rank III and IV.
- **Tanks:** the bot tanks carry the armour, speed and gun of tanks within one rank of yours (an M1A2 or T-90M
  crew meets M1A1s, T-80Us and the like); attack helicopters only show up if they're within the range too.

The battle shows your rank when it starts (BATTLE RANK II · BOTS RANK I–III). Online, the host's rank is the
game's, and the games list shows each game's rank so you can pick one near your level.

### Tank smoke

Every tank carries two salvos of **smoke grenades** (V, SMOKE on a phone): a wall of smoke in front that missiles
can't lock through, and the helicopters' and jets' missiles already flying at you lose you. The cover lasts 12 s
while you stay near the cloud; a salvo comes back every 40 s. Bot crews fire theirs when a missile comes for them.

### Helicopters and ground support

Attack helicopters are built into the game (the **Helicopters** mod, always on) and fly in NORMAL, TANK and
AVIATION battles: the **AH-1Z Viper** and **AH-64E Apache** for Vanguard, the **Mi-24V Hind** and **Ka-52 Alligator**
(two rotors on one mast, no tail rotor) for Onyx. Research and buy them in the AIRCRAFT tree, put one in a crew slot,
and it shows up on the deploy screen as HELI. Each has a chin gun that follows your sight, guided anti-tank missiles
(Hellfire, Shturm, Vikhr: hold the sight on a tank or installation until it locks, then fire) and rocket pods.

- **Flying.** The mouse (or a drag) aims the gun and turns the nose; W/S (the stick) fly forward and back, A/D
  sideways; Shift/Z, the mouse wheel or the UP/DOWN buttons on a phone climb and descend. Let go and it hovers. It
  keeps a few metres off the ground and lifts over the hills ahead by itself.
- **Ground support missions.** Every so often your side's helicopters are called in: DESTROY ENEMY ARMOUR or CLEAR
  ENEMY INFANTRY at a flag (or, in an Aviation battle, knock out an installation). The mission, its progress and a
  countdown show at the top of the flight HUD with a marker over the area. Kills made from the air inside the area
  count; finish it and the enemy loses **15 tickets**. The bot pilots fly the missions too.
- **Danger.** Enemy infantry fire shoulder-launched **Stinger** and **Igla** missiles (flares help), engineers fire
  RPGs, tank crews put their cannon on helicopters hovering low, and the airbases' C-RAM guns shred anything low.

### Career and research

Progression works like War Thunder Mobile and is built into the game: the **Career** and **Armory** mods are
installed and switched on by themselves (with the Helicopters mod) and can't be switched off. Press **RESEARCH** on the main menu (the gold
button in the top-right corner, or the one next to DEPLOY), the deploy screen or the battle report for the research trees: **SHIPS**, **AIRCRAFT** and **TANKS** for each side (VANGUARD and ONYX), and
**WEAPONS**. Next to the back button, **DAILY TASKS** lists today's three tasks (see below). Each tree has a column per rank (I to V) with lines from each vehicle to the next; locked ones
are red, a premium vehicle sits in the gold row at the top, and your **crew slots** run along the bottom.

- **Earning.** You start with a patrol boat, an F-16C (or MiG-29), an M60A3 (or T-62M) and the standard guns, and
  0 research points (RP), silver and gold. Winning battles pays RP, silver and gold (a lost battle pays a quarter;
  the big naval and aviation battles pay more); the after-action report lists where it all went.
- **Research.** Pick a vehicle and press RESEARCH THIS (the one with the star): the RP from that tree's battles
  (naval for ships, aviation for aircraft, tank battles for tanks, infantry battles for guns) goes into it, shown
  on its card as ★ 622/840. Anything left over is free RP, which you can put into anything. Researched means you
  can buy it with silver; premium vehicles are bought straight away with gold and pay 50% more.
- **Crew slots.** Only what's in your crew slots goes into battle, and you always use **your own** ship, aircraft
  or tank (the bots never take it; it's back a few seconds after it's sunk, shot down or knocked out). In tank
  battles the four class cards are your four crew slots. For guns, the slots are each class's gun and the sidearm.
- **Modifications and attachments.** Every vehicle has modifications (hull, turbines, rudder, loading drill, fast
  rearming, Phalanx Block 1B, damage control, spall liners; engine, airframe, controls, flares; composite armour,
  engine, tracks, loader, turret drive, APFSDS) and every gun has the Armory's attachments (suppressor, compensator,
  muzzle brake, barrels, grips, magazines, laser, ammunition, finishes). What you fight in researches its next one
  with its own RP (tap one to research it next, tap again to finish it with free RP), then buy it with silver and
  switch it on or equip it.
- **Aircraft.** Fighters, then attack and strike aircraft, then two lines of bombers. VANGUARD: F-16C → F/A-18E →
  F-35A → F-22A; A-10C → F-15E; B-17G → B-52H → B-2A; B-1B. ONYX: MiG-29 → Su-27 → Su-35S → Su-57; Su-25 → Su-34;
  Lancaster → Tu-95MS → Tu-160; Tu-22M3. Helicopters: AH-1Z → AH-64E and Mi-24V → Ka-52. The deploy screen lists the
  aircraft you have bought. A helicopter flown in a NORMAL or TANK battle puts half that battle's RP into the
  AIRCRAFT tree.
- **Daily tasks.** Three a day, new ones at midnight: win a battle, kill soldiers, destroy tanks, shoot down
  aircraft, sink ships, capture objectives, score points, destroy targets from a helicopter or complete a ground
  support mission. Each pays RP, silver (and some gold) the moment it's done; the pinned RESEARCH button shows how
  many you've finished.
- **Ships.** Patrol boat → corvette → frigate; destroyer → cruiser → battleship (rank V).
- **Tanks.** VANGUARD: M60A3 Patton, M1 Abrams, M1A1, M1A2 SEPv3 (premium M1A1 HC Click-Bait). ONYX: T-62M, T-72B,
  T-80U, T-90M (premium T-72B3). Each rank has more armour, speed, a faster reload and a harder-hitting gun.
- **Guns.** M4K, AK-12, SCAR-H, MCX Spear; VX-9, MP5A3, KRISS Vector, FN P90; Remington 870, Saiga-12K; KR-250,
  M249, PKP, XM250; SR-338, Mk 14 EBR, AWM, Barrett M82A1; P-19, Glock 17, Desert Eagle; premium HK416.

For testing there is a separate mod that is **not** part of the game:
[`extras/infinite-everything.sfmod.json`](extras/infinite-everything.sfmod.json). Import it from MODS → IMPORT
MOD FILE: the RESEARCH screen shows ∞ RP, silver and gold (what you unlock stays unlocked), and in battle you, your ship and
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

Bundled examples: the three battle types (Tank Warfare, Aviation, Naval), Multiplayer (online play with friends), Jets (twelve, from the F-16C and MiG-29 to the F-22A and Su-57) and Bombers (eight, from the B-17 and Lancaster to
the B-2A and Tu-160) for Aviation battles, Career
(research and buy ships, aircraft and guns), Armory (earn credits from kills and upgrade your guns with
suppressors and more), Vehicle Interiors (sit inside tanks and the
cockpits of jets, bombers and helicopters), Random Wheel (a random map and game mode before every match), HD Weapons (detailed gun models),
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

In a tank: W/S throttle, A/D steer, mouse aims the turret, 1 cannon, 2 coax MG, right mouse to zoom, V smoke grenades.
In a ship (Naval): W/S engine telegraph, A/D rudder, Space decoys, V smoke screen, R damage control, G HE/AP shells.
In a helicopter: the mouse aims the gun and turns, W/S forward and back, A/D sideways, Shift/Z or the wheel up and
down, 1/2/3 weapons, Space flares, E ejects.
In a jet or bomber (Jets and Bombers mods): the mouse steers, W/S throttle, A/D roll, Q/E rudder (yaw the nose left
and right for fine aiming), 1/2/3 weapons, Space flares, F spots, J ejects. Every aircraft's ailerons, elevators and
rudder move with the controls (cut from the wing, the tailplane and the fin, and shot off with them). The Cobra is a sharp, hard pull: flick the mouse far up (or snap the stick back) from level flight
in a Su-27, Su-35S, Su-57, MiG-29 or F-22A. On a phone: drag anywhere to steer (a quick, long swipe up throws a
Cobra), the slider on the left is the throttle, the big round button fires, and the buttons are named for flying
(GUN / MISSILE / BOMBS, FLARES, CAMERA, ZOOM, SPOT, EJECT at the top left), and the two RUDDER buttons at the bottom
yaw the nose. Or set FLIGHT CONTROLS to TILT (GYRO) on a phone or tablet and fly by tilting it: left and right to roll,
toward and away from you to pitch (LEVEL at the top right takes the way you hold it as level). Set FLIGHT CONTROLS to JOYSTICK in the settings (main menu or pause) to fly with W/S/A/D or the on-screen
stick instead: Shift/Z or the mouse wheel for throttle (THR buttons on phones), the mouse or a drag to look around,
and INVERT PITCH if you prefer pulling back to climb. C switches between the outside view and the cockpit (Vehicle Interiors mod; in a tank it takes the
commander's seat, in a helicopter the pilot's seat behind the gunner, beside the co-pilot in the Ka-52).
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
The Windows wrapper lives in `windows/`: a small Go program with the same offline bundle packed inside. It
serves the game on `127.0.0.1:47613` (a fixed address, so saves are found again) and shows it in a WebView2
window; `build-exe.sh` builds it. On Linux or macOS, `cd windows && go run .` after `npm run build:exe` serves
the same files and prints the address to open in a browser.

Fonts (Big Shoulders Stencil, Saira Semi Condensed, IBM Plex Mono) are under the SIL Open Font License;
the license texts are in `android/fonts/`.
