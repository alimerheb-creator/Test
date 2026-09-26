// Sixth Front — shared constants: teams, map layout, weapons, classes, tuning.

export const GAME_TITLE = 'SIXTH FRONT';
export const MAP_NAME = 'KARSA VALLEY';

export const PLAY_HALF = 240;   // half-size of the playable square (m)
export const WORLD_HALF = 560;  // half-size of the rendered terrain (m)
export const GRAVITY = 20;

export const TEAMS = [
  {
    id: 0, name: 'VANGUARD', short: 'VGD', color: '#3fa9f5', hex: 0x3fa9f5,
    helmet: 0x4f5638, top: 0x6b6a4c, pants: 0x5a5a40, vest: 0x46492f, tank: 0x5d6443,
  },
  {
    id: 1, name: 'ONYX', short: 'ONX', color: '#ff4b3a', hex: 0xff4b3a,
    helmet: 0x2a2c30, top: 0x44474e, pants: 0x33363c, vest: 0x24262a, tank: 0x4f5257,
  },
];
export const SQUAD_COLOR = '#7ce35b';
export const SQUAD_NAMES = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL', 'INDIA', 'JULIET'];

// Team headquarters. Vanguard (player team) deploys from the south.
export const HQS = [
  { x: 0, z: 212, yaw: 0 },
  { x: 0, z: -212, yaw: Math.PI },
];

export const FLAGS = [
  { id: 'A', name: 'QUARRY', x: -135, z: 110, radius: 13, flat: 46 },
  { id: 'B', name: 'OLD MILL', x: 120, z: 95, radius: 13, flat: 46 },
  { id: 'C', name: 'MARKET', x: 0, z: 0, radius: 14, flat: 70 },
  { id: 'D', name: 'RELAY STATION', x: -120, z: -100, radius: 13, flat: 46 },
  { id: 'E', name: 'CEMENT WORKS', x: 135, z: -105, radius: 13, flat: 46 },
];

// Destructible buildings: [centerX, centerZ, panelsX, panelsZ, floors]
export const BUILDINGS = [
  // Market town (flag C)
  [-30, -30, 4, 4, 3], [0, -33, 4, 3, 2], [31, -31, 4, 4, 2], [-33, 0, 3, 4, 2],
  [33, 2, 3, 5, 3], [-31, 31, 4, 3, 2], [2, 33, 5, 3, 2], [31, 31, 4, 4, 3],
  [-58, -12, 3, 3, 1], [57, -24, 3, 3, 1], [-12, 60, 3, 3, 1], [14, -60, 3, 3, 2],
  [-56, 34, 3, 4, 1], [58, 40, 4, 3, 2],
  // Quarry (A)
  [-157, 122, 3, 3, 1], [-117, 94, 4, 3, 2],
  // Old Mill (B) — the tower is a sniper nest
  [140, 113, 3, 2, 4], [102, 80, 4, 3, 1], [138, 72, 3, 3, 1],
  // Relay Station (D)
  [-141, -118, 3, 3, 2], [-100, -84, 3, 3, 1],
  // Cement Works (E)
  [158, -120, 5, 4, 1], [115, -88, 3, 3, 2],
  // Farmsteads
  [-70, 160, 3, 3, 1], [75, 165, 3, 3, 2], [-185, 20, 3, 3, 2], [185, 0, 3, 4, 1],
  [-70, -165, 3, 3, 2], [70, -160, 3, 3, 1], [-62, 78, 3, 3, 1], [62, -78, 3, 3, 1],
  [-192, -60, 3, 3, 1], [192, 62, 3, 3, 1],
];

export const ROADS = [
  [[0, 250], [0, 212], [25, 160], [120, 95], [70, 40], [0, 0], [-70, -40], [-120, -100], [-30, -160], [0, -212], [0, -250]],
  [[-135, 110], [-75, 60], [0, 0], [75, -55], [135, -105]],
  [[0, 212], [-60, 170], [-135, 110], [-200, 20], [-120, -100]],
  [[0, -212], [60, -170], [135, -105], [195, 10], [120, 95]],
];

export const MOVE = {
  walk: 4.6, sprint: 7.3, crouch: 2.5, prone: 1.1, adsMul: 0.6,
  jump: 6.2, accel: 55, airAccel: 9, slideSpeed: 10, slideTime: 0.85,
};

// Hitscan firearms. dmg: [near, far] across range: [start, end] metres.
export const WEAPONS = {
  ar: {
    id: 'ar', name: 'M4K CARBINE', kind: 'auto', rpm: 760, dmg: [25, 17], range: [25, 70], mag: 30, reserve: 150,
    reload: 2.2, spreadHip: 0.032, spreadAds: 0.0035, bloom: 0.005, bloomMax: 0.03, recoil: [0.011, 0.005],
    adsFov: 48, adsTime: 0.18, head: 1.8, sound: 'rifle', model: 'ar', botRange: 110,
  },
  smg: {
    id: 'smg', name: 'VX-9 PDW', kind: 'auto', rpm: 920, dmg: [22, 12], range: [12, 40], mag: 40, reserve: 200,
    reload: 1.9, spreadHip: 0.024, spreadAds: 0.006, bloom: 0.004, bloomMax: 0.028, recoil: [0.008, 0.006],
    adsFov: 56, adsTime: 0.14, head: 1.6, sound: 'smg', model: 'smg', botRange: 70,
  },
  lmg: {
    id: 'lmg', name: 'KR-250 LMG', kind: 'auto', rpm: 680, dmg: [27, 20], range: [30, 80], mag: 100, reserve: 200,
    reload: 4.8, spreadHip: 0.045, spreadAds: 0.006, bloom: 0.004, bloomMax: 0.035, recoil: [0.013, 0.008],
    adsFov: 46, adsTime: 0.26, head: 1.7, sound: 'lmg', model: 'lmg', botRange: 120,
  },
  sniper: {
    id: 'sniper', name: 'SR-338 BOLT', kind: 'bolt', rpm: 46, dmg: [96, 82], range: [60, 250], mag: 5, reserve: 30,
    reload: 3.0, spreadHip: 0.05, spreadAds: 0.0, bloom: 0, bloomMax: 0, recoil: [0.055, 0.01],
    adsFov: 13, adsTime: 0.3, head: 2.6, sound: 'sniper', model: 'sniper', scope: true, botRange: 230,
  },
  pistol: {
    id: 'pistol', name: 'P-19 SIDEARM', kind: 'semi', rpm: 420, dmg: [30, 18], range: [10, 35], mag: 15, reserve: 60,
    reload: 1.5, spreadHip: 0.018, spreadAds: 0.006, bloom: 0.012, bloomMax: 0.04, recoil: [0.02, 0.006],
    adsFov: 60, adsTime: 0.12, head: 1.8, sound: 'pistol', model: 'pistol', botRange: 50,
  },
  coax: {
    id: 'coax', name: 'COAXIAL MG', kind: 'auto', rpm: 700, dmg: [24, 18], range: [40, 120], mag: 200, reserve: 9999,
    reload: 3.5, spreadHip: 0.012, spreadAds: 0.008, bloom: 0.002, bloomMax: 0.02, recoil: [0, 0],
    adsFov: 30, adsTime: 0.2, head: 1.5, sound: 'lmg', model: 'none', botRange: 120,
  },
};

export const GADGETS = {
  ugl: { id: 'ugl', name: '40MM LAUNCHER', ammo: 4, reload: 2.2, projectile: 'ugl', model: 'ugl', adsFov: 50 },
  rpg: { id: 'rpg', name: 'RPG-7V', ammo: 5, reload: 2.8, projectile: 'rocket', model: 'rpg', adsFov: 40 },
  crate: { id: 'crate', name: 'SUPPLY CRATE', ammo: 1, recharge: 25, projectile: 'crate', model: 'crate', adsFov: 60 },
  c4: { id: 'c4', name: 'C-4 CHARGES', ammo: 3, reload: 0.6, projectile: 'c4', model: 'c4', adsFov: 60 },
};

export const PROJECTILES = {
  grenade: { name: 'FRAG GRENADE', speed: 18, gravity: 20, fuse: 2.4, bounce: 0.35, radius: 7.5, dmg: 125, structural: 70, veh: 60 },
  ugl: { name: '40MM LAUNCHER', speed: 62, gravity: 12, radius: 4.8, dmg: 105, structural: 110, veh: 90, direct: 120 },
  rocket: { name: 'RPG-7V', speed: 72, gravity: 3, radius: 4.8, dmg: 110, structural: 230, veh: 300, direct: 220, trail: true },
  shell: { name: 'TANK CANNON', speed: 190, gravity: 4, radius: 5.8, dmg: 150, structural: 330, veh: 340, direct: 300 },
  c4: { name: 'C-4', speed: 11, gravity: 20, radius: 7.5, dmg: 220, structural: 480, veh: 700, sticky: true },
  crate: { name: 'SUPPLY CRATE', speed: 9, gravity: 20, bounce: 0.2 },
};

export const CLASSES = {
  assault: {
    id: 'assault', name: 'ASSAULT', primary: 'ar', secondary: 'pistol', gadget: 'ugl', grenades: 2,
    blurb: 'Frontline rifleman. Carries a 40mm launcher to crack defenders out of cover.',
  },
  engineer: {
    id: 'engineer', name: 'ENGINEER', primary: 'smg', secondary: 'pistol', gadget: 'rpg', grenades: 1,
    blurb: 'Anti-armor. RPG rockets wreck tanks and punch holes straight through walls.',
  },
  support: {
    id: 'support', name: 'SUPPORT', primary: 'lmg', secondary: 'pistol', gadget: 'crate', grenades: 1, fastRevive: true,
    blurb: 'Suppressive LMG fire. Drops supply crates and revives teammates twice as fast.',
  },
  recon: {
    id: 'recon', name: 'RECON', primary: 'sniper', secondary: 'pistol', gadget: 'c4', grenades: 1, autoSpot: true,
    blurb: 'Long-range marksman. Anything in your scope gets spotted. Carries C-4.',
  },
};
export const CLASS_ORDER = ['assault', 'engineer', 'support', 'recon'];

export const SCORE = {
  kill: 100, headshot: 25, assist: 50, capture: 250, neutralize: 100, revive: 100,
  resupply: 10, vehicle: 300, spotAssist: 25,
};

export const DIFFICULTY = {
  easy: { label: 'RECRUIT', reaction: [0.6, 1.0], aimError: 0.1, turn: 3.0, spreadMul: 3.2, burst: [2, 4], dmgMul: 0.6 },
  normal: { label: 'REGULAR', reaction: [0.35, 0.65], aimError: 0.055, turn: 4.5, spreadMul: 2.2, burst: [3, 6], dmgMul: 0.8 },
  hard: { label: 'VETERAN', reaction: [0.18, 0.38], aimError: 0.028, turn: 6.5, spreadMul: 1.4, burst: [4, 8], dmgMul: 1.0 },
};

export const DEFAULT_SETTINGS = {
  playerName: 'Recruit',
  botsPerTeam: 12,
  difficulty: 'normal',
  tickets: 250,
  sensitivity: 1.0,
  fov: 62,
  quality: 'high',
  volume: 0.8,
};

export const BOT_NAMES = [
  'Hollis', 'Ortega', 'Kowalski', 'Ramirez', 'Nakamura', 'Brennan', 'Duarte', 'Volkov', 'Okafor', 'Lindqvist',
  'Petrov', 'Haddad', 'Moreau', 'Castillo', 'Reyes', 'Novak', 'Fischer', 'Ivanova', 'Mbeki', 'Sato',
  'Kaya', 'Dubois', 'Rossi', 'Walsh', 'Kim', 'Adeyemi', 'Larsen', 'Silva', 'Horvat', 'Quinn',
  'Varga', 'Zielinski', 'Abbas', 'Marek', 'Tanaka', 'Ferreira', 'Kovacs', 'Santos', 'Becker', 'Lund',
  'Osei', 'Mendez', 'Rahimi', 'Cho', 'Draper', 'Yilmaz', 'Grieve', 'Nkosi', 'Arce', 'Holm',
];
