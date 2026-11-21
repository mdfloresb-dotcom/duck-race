import { CatmullRomCurve3, Vector3 } from 'three';

export type SurfaceType =
  | 'water'
  | 'boost_current'
  | 'mud'
  | 'ice_water'
  | 'lava_channel'
  | 'bridge'
  | 'ramp';

export type PowerUpType =
  | 'turbo'
  | 'shield'
  | 'wave'
  | 'missile'
  | 'lightning'
  | 'nitro_overdrive'
  | 'emp_pulse'
  | 'coin_magnet'
  | 'squid_ink'
  | 'mine';

export interface PowerUpMeta {
  key: PowerUpType;
  name: string;
  shortDesc: string;
  color: string;
}

export const POWERUP_META: Record<PowerUpType, PowerUpMeta> = {
  turbo: {
    key: 'turbo',
    name: 'Turbo Cohete',
    shortDesc: 'Impulso cohete durante 2.5 s',
    color: '#f97316',
  },
  shield: {
    key: 'shield',
    name: 'Escudo Burbuja',
    shortDesc: 'Defensa total por 6.0 s',
    color: '#38bdf8',
  },
  wave: {
    key: 'wave',
    name: 'Ola Gigante',
    shortDesc: 'Onda sónica contra rivales',
    color: '#22d3ee',
  },
  missile: {
    key: 'missile',
    name: 'Torpedo Pato',
    shortDesc: 'Torpedo teledirigido al rival',
    color: '#ef4444',
  },
  lightning: {
    key: 'lightning',
    name: 'Tormenta Rayo',
    shortDesc: 'Encoge y frena rivales 2.5 s',
    color: '#facc15',
  },
  nitro_overdrive: {
    key: 'nitro_overdrive',
    name: 'Nitro Plasma',
    shortDesc: 'Sobremarcha extrema por 3.5 s',
    color: '#e879f9',
  },
  emp_pulse: {
    key: 'emp_pulse',
    name: 'Onda Sónica EMP',
    shortDesc: 'Pulso eléctrico +25 monedas',
    color: '#a855f7',
  },
  coin_magnet: {
    key: 'coin_magnet',
    name: 'Imán Dorado',
    shortDesc: 'Atrae Patocoins por 7.0 s (+30)',
    color: '#fde047',
  },
  squid_ink: {
    key: 'squid_ink',
    name: 'Tinta Calamar',
    shortDesc: 'Ciega la pantalla de rivales',
    color: '#1e293b',
  },
  mine: {
    key: 'mine',
    name: 'Boya Mina',
    shortDesc: 'Suelta una mina explosiva atrás',
    color: '#fb7185',
  },
};

export const POWERUP_KEYS: PowerUpType[] = [
  'turbo',
  'shield',
  'wave',
  'missile',
  'lightning',
  'nitro_overdrive',
  'emp_pulse',
  'coin_magnet',
  'squid_ink',
  'mine',
];

export interface UnderglowPreset {
  id: string;
  name: string;
  hex: string;
}

export const UNDERGLOW_PRESETS: UnderglowPreset[] = [
  { id: 'cyan', name: 'Neón Cian', hex: '#22d3ee' },
  { id: 'crimson', name: 'Pulso Carmesí', hex: '#f43f5e' },
  { id: 'violet', name: 'Plasma Violeta', hex: '#a855f7' },
  { id: 'emerald', name: 'Verde Tóxico', hex: '#10b981' },
  { id: 'gold', name: 'Oro Eléctrico', hex: '#facc15' },
  { id: 'blaze', name: 'Fuego Nitro', hex: '#f97316' },
];

export interface VehicleStats {
  velocidadMax: number;
  aceleracion: number;
  manejo: number;
  turbo: number;
}

export interface VehicleDef {
  id: string;
  name: string;
  tagline: string;
  hullType: 'jetski' | 'speedboat' | 'yacht' | 'bathtub' | 'rubberduck';
  unlockCost: number;
  primaryColor: string;
  accentColor: string;
  scarfColor: string;
  baseStats: VehicleStats;
}

export interface UpgradeLevels {
  velocidadMax: number;
  aceleracion: number;
  manejo: number;
  turbo: number;
}

export interface SaveData {
  coins: number;
  unlockedVehicles: string[];
  selectedVehicleId: string;
  selectedTrackId: string;
  selectedUnderglowColor: string;
  upgrades: Record<string, UpgradeLevels>;
  bestTimes: Record<string, number>;
  muted: boolean;
}

export type CameraMode = 'chase' | 'hood';

export type TunnelTheme =
  | 'glass_ocean'
  | 'neon_industrial'
  | 'volcano_magma'
  | 'ice_cavern'
  | 'swamp_canopy'
  | 'treasure_cave';

export interface ControlPoint {
  x: number;
  y: number;
  w: number;
  z?: number; // elevation in sim units (0 = water level)
  surface?: SurfaceType;
  tunnel?: TunnelTheme;
}

export interface TrackBranch {
  id: string;
  label: string;
  forkIdx: number;
  mergeIdx: number;
  points: ControlPoint[];
}

export interface TrackSample {
  x: number;
  y: number;
  z: number;
  slope: number; // sin(pitch) = dz / horizDist
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  halfWidth: number;
  surface: SurfaceType;
  tunnel: TunnelTheme | null;
  s: number;
  laneId: string;
  curvature: number;
}

export interface TrackDef {
  id: string;
  name: string;
  subtitle: string;
  biome: 'lagoon' | 'city' | 'arctic' | 'swamp' | 'volcano' | 'pirate';
  swatch: string;
  skyTop: string;
  skyHorizon: string;
  fogColor: string;
  waterBase: string;
  waterHighlight: string;
  neonAccent: string;
  neonSecondary: string;
  bankColor: string;
  points: ControlPoint[];
  branches: TrackBranch[];
}

export interface CheckpointState {
  lap: number;
  lastS: number;
  visitedSectors: number; // 8-bit mask
  highestSector: number;
  wrongWay: boolean;
}

export interface TrackCoinSpawn {
  x: number;
  y: number;
  z: number;
  phase: number;
}

export const TOTAL_LAPS = 3;
export const NUM_CHECKPOINTS = 8;
export const MAX_UPGRADE_LEVEL = 5;
export const WORLD_SCALE = 0.05; // 100 sim units = 5.0 Three.js meters

export const VEHICLES: VehicleDef[] = [
  {
    id: 'jetski',
    name: 'Moto Acuática',
    tagline: 'Ágil en curvas cerradas y perfecta para rutas estrechas.',
    hullType: 'jetski',
    unlockCost: 0,
    primaryColor: '#0ea5e9',
    accentColor: '#facc15',
    scarfColor: '#ef4444',
    baseStats: { velocidadMax: 6.2, aceleracion: 7.4, manejo: 8.6, turbo: 6.8 },
  },
  {
    id: 'speedboat',
    name: 'Lancha Rápida',
    tagline: 'Casco en V de alta velocidad punta en rectas largas.',
    hullType: 'speedboat',
    unlockCost: 0,
    primaryColor: '#ef4444',
    accentColor: '#f8fafc',
    scarfColor: '#38bdf8',
    baseStats: { velocidadMax: 8.2, aceleracion: 6.4, manejo: 6.2, turbo: 7.4 },
  },
  {
    id: 'yacht',
    name: 'Mini-Yate',
    tagline: 'Estabilidad blindada y propulsor turbo de larga duración.',
    hullType: 'yacht',
    unlockCost: 0,
    primaryColor: '#f8fafc',
    accentColor: '#eab308',
    scarfColor: '#10b981',
    baseStats: { velocidadMax: 7.2, aceleracion: 6.0, manejo: 6.8, turbo: 8.8 },
  },
  {
    id: 'bathtub',
    name: 'Bañera con Motor',
    tagline: 'Porcelana propulsada por V8 con salida explosiva y burbujas.',
    hullType: 'bathtub',
    unlockCost: 300,
    primaryColor: '#e2e8f0',
    accentColor: '#ec4899',
    scarfColor: '#a855f7',
    baseStats: { velocidadMax: 7.8, aceleracion: 9.2, manejo: 7.6, turbo: 8.0 },
  },
  {
    id: 'rubberduck',
    name: 'Patito Súper Veloz',
    tagline: 'Prototipo legendario hidro-jet con dominio total del agua.',
    hullType: 'rubberduck',
    unlockCost: 650,
    primaryColor: '#facc15',
    accentColor: '#f97316',
    scarfColor: '#06b6d4',
    baseStats: { velocidadMax: 9.4, aceleracion: 8.8, manejo: 9.0, turbo: 9.4 },
  },
];

export const AI_PROFILES = [
  { name: 'Capitán Cuack', hullType: 'speedboat' as const, primaryColor: '#f97316', accentColor: '#fef08a', scarfColor: '#0ea5e9', underglow: '#f97316', skill: 0.98 },
  { name: 'Baronesa Pluma', hullType: 'yacht' as const, primaryColor: '#a855f7', accentColor: '#f8fafc', scarfColor: '#facc15', underglow: '#a855f7', skill: 0.94 },
  { name: 'Turbo Pato', hullType: 'jetski' as const, primaryColor: '#10b981', accentColor: '#fde047', scarfColor: '#ec4899', underglow: '#10b981', skill: 0.91 },
  { name: 'Don Pico', hullType: 'bathtub' as const, primaryColor: '#ec4899', accentColor: '#f8fafc', scarfColor: '#22d3ee', underglow: '#f43f5e', skill: 0.87 },
  { name: 'Relámpago Azul', hullType: 'rubberduck' as const, primaryColor: '#38bdf8', accentColor: '#facc15', scarfColor: '#ef4444', underglow: '#38bdf8', skill: 1.01 },
];

export const TRACK_DEFS: TrackDef[] = [
  {
    id: 'lagoon',
    name: 'Laguna Tropical',
    subtitle: 'Circuito técnico costero · Doble chicane en arrecife y recta de playa',
    biome: 'lagoon',
    swatch: 'linear-gradient(135deg, #0ea5e9 0%, #facc15 100%)',
    skyTop: '#0369a1',
    skyHorizon: '#38bdf8',
    fogColor: '#0e4f7a',
    waterBase: '#0284c7',
    waterHighlight: '#7dd3fc',
    neonAccent: '#22d3ee',
    neonSecondary: '#facc15',
    bankColor: '#d97706',
    points: [
      { x: -420, y: -1800, w: 390, z: 0 },
      { x: 480, y: -1800, w: 390, z: 0 },
      { x: 1320, y: -1780, w: 380, z: 0, surface: 'boost_current' },
      { x: 2180, y: -1460, w: 375, z: 0 },
      { x: 2660, y: -680, w: 365, z: 46, surface: 'bridge' },
      { x: 2540, y: 260, w: 360, z: 132, surface: 'bridge' },
      { x: 1960, y: 1020, w: 370, z: 44, surface: 'boost_current' },
      { x: 1180, y: 1580, w: 360, z: 0 },
      { x: 420, y: 1100, w: 350, z: 0 },
      { x: -240, y: 1840, w: 350, z: 0 },
      { x: -940, y: 1260, w: 350, z: 0 },
      { x: -1820, y: 1540, w: 365, z: 0, tunnel: 'glass_ocean' },
      { x: -2560, y: 820, w: 360, z: 0, tunnel: 'glass_ocean' },
      { x: -2580, y: -260, w: 365, z: 0, surface: 'boost_current', tunnel: 'glass_ocean' },
      { x: -2160, y: -1260, w: 380, z: 0 },
      { x: -1350, y: -1780, w: 390, z: 0 },
    ],
    branches: [
      {
        id: 'coral_cut',
        label: 'Atajo Arrecife Turbo',
        forkIdx: 2,
        mergeIdx: 7,
        points: [
          { x: 1780, y: -920, w: 280, z: 0, surface: 'ramp' },
          { x: 1820, y: 140, w: 280, z: 0, surface: 'boost_current' },
          { x: 1440, y: 940, w: 280, z: 0, surface: 'ramp' },
        ],
      },
      {
        id: 'palm_bay',
        label: 'Bahía de Arena',
        forkIdx: 10,
        mergeIdx: 14,
        points: [
          { x: -1560, y: 720, w: 285, z: 0, surface: 'boost_current' },
          { x: -1740, y: -320, w: 285, z: 0, surface: 'ramp' },
        ],
      },
    ],
  },
  {
    id: 'city',
    name: 'Canales Neón de la Ciudad',
    subtitle: 'Circuito en "8" con paso a desnivel · Curvas 90° y rectas neón',
    biome: 'city',
    swatch: 'linear-gradient(135deg, #1e1b4b 0%, #f43f5e 100%)',
    skyTop: '#040614',
    skyHorizon: '#1e1042',
    fogColor: '#130c2e',
    waterBase: '#0d1b45',
    waterHighlight: '#f43f5e',
    neonAccent: '#f43f5e',
    neonSecondary: '#22d3ee',
    bankColor: '#1e293b',
    points: [
      { x: -750, y: 0, w: 275, z: 0 },
      { x: 0, y: 0, w: 275, z: 0 },
      { x: 900, y: 0, w: 270, z: 0, surface: 'boost_current' },
      { x: 1920, y: 0, w: 265, z: 0 },
      { x: 2300, y: -280, w: 255, z: 0 },
      { x: 2300, y: -1340, w: 260, z: 0, tunnel: 'neon_industrial' },
      { x: 2000, y: -1720, w: 260, z: 0, tunnel: 'neon_industrial' },
      { x: 760, y: -1720, w: 265, z: 0, surface: 'boost_current' },
      { x: 120, y: -1620, w: 260, z: 0 },
      { x: 0, y: -950, w: 265, z: 58, surface: 'bridge' },
      { x: 0, y: 0, w: 270, z: 145, surface: 'bridge' },
      { x: 0, y: 950, w: 265, z: 58, surface: 'bridge' },
      { x: -140, y: 1640, w: 260, z: 0 },
      { x: -1240, y: 1640, w: 265, z: 0, surface: 'boost_current' },
      { x: -2200, y: 1600, w: 260, z: 0 },
      { x: -2350, y: 900, w: 260, z: 0 },
      { x: -2350, y: 180, w: 265, z: 0 },
      { x: -1600, y: 0, w: 275, z: 0 },
    ],
    branches: [
      {
        id: 'neon_alley',
        label: 'Callejón Neón',
        forkIdx: 3,
        mergeIdx: 7,
        points: [
          { x: 1960, y: -740, w: 240, z: 0, surface: 'boost_current' },
          { x: 1420, y: -1260, w: 240, z: 0, surface: 'boost_current' },
        ],
      },
      {
        id: 'grand_dock',
        label: 'Dársena Central',
        forkIdx: 13,
        mergeIdx: 16,
        points: [
          { x: -1480, y: 1200, w: 245, z: 0, surface: 'water' },
          { x: -1860, y: 620, w: 245, z: 0, surface: 'boost_current' },
        ],
      },
    ],
  },
  {
    id: 'arctic',
    name: 'Bahía Ártica',
    subtitle: 'Serpentina y horquillas 180° · Slalom glaciar de puro drift',
    biome: 'arctic',
    swatch: 'linear-gradient(135deg, #064e3b 0%, #7dd3fc 100%)',
    skyTop: '#061830',
    skyHorizon: '#164e63',
    fogColor: '#0e3a52',
    waterBase: '#0369a1',
    waterHighlight: '#7dd3fc',
    neonAccent: '#38bdf8',
    neonSecondary: '#34d399',
    bankColor: '#e2e8f0',
    points: [
      { x: -450, y: -1700, w: 340, z: 0, surface: 'ice_water' },
      { x: 450, y: -1700, w: 340, z: 0, surface: 'boost_current' },
      { x: 1460, y: -1700, w: 335, z: 0, surface: 'ice_water' },
      { x: 2440, y: -1650, w: 340, z: 0, surface: 'ice_water' },
      { x: 2780, y: -1120, w: 350, z: 0, surface: 'ice_water' },
      { x: 2240, y: -680, w: 340, z: 0, surface: 'boost_current' },
      { x: 1280, y: -780, w: 325, z: 0, surface: 'ice_water' },
      { x: 650, y: -120, w: 320, z: 0, surface: 'ice_water' },
      { x: 1420, y: 520, w: 320, z: 45, surface: 'bridge' },
      { x: 850, y: 1280, w: 325, z: 125, surface: 'bridge' },
      { x: -120, y: 880, w: 325, z: 38, surface: 'boost_current' },
      { x: -820, y: 1620, w: 330, z: 0, surface: 'ice_water' },
      { x: -1850, y: 1820, w: 340, z: 0, surface: 'ice_water' },
      { x: -2650, y: 1380, w: 345, z: 0, surface: 'ice_water' },
      { x: -2320, y: 680, w: 335, z: 0, surface: 'boost_current', tunnel: 'ice_cavern' },
      { x: -2550, y: -250, w: 330, z: 0, surface: 'ice_water', tunnel: 'ice_cavern' },
      { x: -2350, y: -1220, w: 335, z: 0, surface: 'ice_water', tunnel: 'ice_cavern' },
      { x: -1450, y: -1700, w: 340, z: 0, surface: 'ice_water' },
    ],
    branches: [
      {
        id: 'glacier_cut',
        label: 'Grieta Glaciar',
        forkIdx: 5,
        mergeIdx: 8,
        points: [
          { x: 1840, y: -440, w: 250, z: 0, surface: 'boost_current' },
          { x: 1460, y: 40, w: 250, z: 0, surface: 'ice_water' },
        ],
      },
      {
        id: 'fjord_shortcut',
        label: 'Paso de Témpanos',
        forkIdx: 11,
        mergeIdx: 15,
        points: [
          { x: -1480, y: 1180, w: 255, z: 0, surface: 'ice_water' },
          { x: -1850, y: 320, w: 255, z: 0, surface: 'boost_current' },
        ],
      },
    ],
  },
  {
    id: 'swamp',
    name: 'Pantano Encantado',
    subtitle: 'Laberinto sinuoso · Curvas ciegas bajo raíces, manglares y lodo',
    biome: 'swamp',
    swatch: 'linear-gradient(135deg, #1a2e05 0%, #84cc16 100%)',
    skyTop: '#040e06',
    skyHorizon: '#122c0c',
    fogColor: '#10260a',
    waterBase: '#1a3810',
    waterHighlight: '#a3e635',
    neonAccent: '#a3e635',
    neonSecondary: '#facc15',
    bankColor: '#14532d',
    points: [
      { x: -450, y: -1750, w: 295, z: 0 },
      { x: 450, y: -1750, w: 285, z: 0 },
      { x: 1450, y: -1620, w: 265, z: 0 },
      { x: 2180, y: -980, w: 260, z: 45, surface: 'bridge' },
      { x: 1620, y: -150, w: 255, z: 120, surface: 'bridge' },
      { x: 2480, y: 580, w: 260, z: 35, surface: 'bridge' },
      { x: 2120, y: 1580, w: 265, z: 0 },
      { x: 1180, y: 1820, w: 255, z: 0 },
      { x: 420, y: 920, w: 245, z: 0, surface: 'boost_current' },
      { x: -350, y: 1680, w: 255, z: 0 },
      { x: -1250, y: 1580, w: 250, z: 0, tunnel: 'swamp_canopy' },
      { x: -1820, y: 680, w: 245, z: 0, tunnel: 'swamp_canopy' },
      { x: -2620, y: 820, w: 250, z: 0, tunnel: 'swamp_canopy' },
      { x: -2650, y: -280, w: 255, z: 0, tunnel: 'swamp_canopy' },
      { x: -1750, y: -680, w: 255, z: 0, surface: 'boost_current' },
      { x: -2180, y: -1480, w: 275, z: 0 },
      { x: -1350, y: -1750, w: 295, z: 0 },
    ],
    branches: [
      {
        id: 'gator_pass',
        label: 'Paso del Manglar',
        forkIdx: 2,
        mergeIdx: 6,
        points: [
          { x: 1160, y: -480, w: 240, z: 0, surface: 'water' },
          { x: 1360, y: 660, w: 240, z: 0, surface: 'boost_current' },
        ],
      },
      {
        id: 'bayou_cut',
        label: 'Ciénaga de Lodo',
        forkIdx: 9,
        mergeIdx: 14,
        points: [
          { x: -950, y: 740, w: 245, z: 0, surface: 'mud' },
          { x: -1220, y: -120, w: 245, z: 0, surface: 'boost_current' },
        ],
      },
    ],
  },
  {
    id: 'volcano',
    name: 'Caldera Volcánica',
    subtitle: 'Alta velocidad y saltos · Rectas gigantes y rampas sobre lava',
    biome: 'volcano',
    swatch: 'linear-gradient(135deg, #1c1917 0%, #f97316 100%)',
    skyTop: '#120403',
    skyHorizon: '#4a1406',
    fogColor: '#330d04',
    waterBase: '#29120a',
    waterHighlight: '#f97316',
    neonAccent: '#f97316',
    neonSecondary: '#facc15',
    bankColor: '#292524',
    points: [
      { x: -600, y: -1350, w: 305, z: 0 },
      { x: 250, y: -1350, w: 305, z: 0, surface: 'boost_current' },
      { x: 1150, y: -1350, w: 300, z: 0, surface: 'ramp' },
      { x: 2050, y: -1350, w: 300, z: 0, surface: 'lava_channel' },
      { x: 2880, y: -950, w: 305, z: 0, surface: 'lava_channel', tunnel: 'volcano_magma' },
      { x: 3220, y: -150, w: 305, z: 0, surface: 'lava_channel', tunnel: 'volcano_magma' },
      { x: 2920, y: 720, w: 305, z: 0, surface: 'boost_current', tunnel: 'volcano_magma' },
      { x: 2050, y: 1220, w: 300, z: 0 },
      { x: 1100, y: 1250, w: 300, z: 0, surface: 'ramp' },
      { x: 150, y: 1220, w: 300, z: 0, surface: 'boost_current' },
      { x: -800, y: 1250, w: 300, z: 55, surface: 'bridge' },
      { x: -1750, y: 1220, w: 300, z: 140, surface: 'bridge' },
      { x: -2750, y: 860, w: 305, z: 50, surface: 'bridge' },
      { x: -3180, y: -40, w: 310, z: 0, surface: 'boost_current' },
      { x: -2820, y: -940, w: 310, z: 0 },
      { x: -1750, y: -1350, w: 305, z: 0 },
    ],
    branches: [
      {
        id: 'magma_bridge',
        label: 'Atajo Térmico',
        forkIdx: 3,
        mergeIdx: 7,
        points: [
          { x: 2240, y: -520, w: 250, z: 0, surface: 'ramp' },
          { x: 2320, y: 480, w: 250, z: 0, surface: 'boost_current' },
        ],
      },
      {
        id: 'basalt_docks',
        label: 'Grieta de Basalto',
        forkIdx: 11,
        mergeIdx: 15,
        points: [
          { x: -2140, y: 520, w: 255, z: 0, surface: 'lava_channel' },
          { x: -2280, y: -480, w: 255, z: 0, surface: 'ramp' },
        ],
      },
    ],
  },
  {
    id: 'pirate',
    name: 'Cala Pirata y Ruinas',
    subtitle: 'Circuito mixto extremo · Zigzag entre galeones, cueva espiral y salto final',
    biome: 'pirate',
    swatch: 'linear-gradient(135deg, #0f172a 0%, #fbbf24 100%)',
    skyTop: '#050b18',
    skyHorizon: '#1e293b',
    fogColor: '#111c2d',
    waterBase: '#0b3657',
    waterHighlight: '#fbbf24',
    neonAccent: '#fbbf24',
    neonSecondary: '#38bdf8',
    bankColor: '#44403c',
    points: [
      { x: -450, y: -1750, w: 355, z: 0 },
      { x: 550, y: -1750, w: 350, z: 0, surface: 'boost_current' },
      { x: 1550, y: -1700, w: 345, z: 0 },
      { x: 2480, y: -1420, w: 320, z: 0, surface: 'ramp' },
      { x: 1850, y: -620, w: 310, z: 0 },
      { x: 2720, y: 120, w: 310, z: 0, surface: 'boost_current' },
      { x: 1920, y: 880, w: 315, z: 0, surface: 'ramp' },
      { x: 2480, y: 1680, w: 330, z: 0 },
      { x: 1450, y: 1920, w: 330, z: 48, surface: 'bridge' },
      { x: 380, y: 1780, w: 325, z: 130, surface: 'bridge' },
      { x: -550, y: 1850, w: 330, z: 42, surface: 'boost_current' },
      { x: -1580, y: 1650, w: 330, z: 0, tunnel: 'treasure_cave' },
      { x: -2520, y: 1080, w: 325, z: 0, tunnel: 'treasure_cave' },
      { x: -2750, y: 80, w: 325, z: 0, tunnel: 'treasure_cave' },
      { x: -2180, y: -760, w: 330, z: 0, surface: 'boost_current', tunnel: 'treasure_cave' },
      { x: -2550, y: -1480, w: 340, z: 0 },
      { x: -1350, y: -1750, w: 355, z: 0, surface: 'ramp' },
    ],
    branches: [
      {
        id: 'galleon_shortcut',
        label: 'Salto del Galeón',
        forkIdx: 2,
        mergeIdx: 7,
        points: [
          { x: 1180, y: -780, w: 260, z: 0, surface: 'ramp' },
          { x: 1120, y: 150, w: 260, z: 0, surface: 'boost_current' },
          { x: 1280, y: 1050, w: 260, z: 0, surface: 'ramp' },
        ],
      },
      {
        id: 'corsair_cove',
        label: 'Desfiladero del Tesoro',
        forkIdx: 10,
        mergeIdx: 15,
        points: [
          { x: -1150, y: 920, w: 265, z: 0, surface: 'water' },
          { x: -1480, y: -180, w: 265, z: 0, surface: 'boost_current' },
        ],
      },
    ],
  },
];

export function createDefaultSaveData(): SaveData {
  const upgrades: Record<string, UpgradeLevels> = {};
  for (const v of VEHICLES) {
    upgrades[v.id] = { velocidadMax: 1, aceleracion: 1, manejo: 1, turbo: 1 };
  }
  return {
    coins: 100,
    unlockedVehicles: ['jetski', 'speedboat', 'yacht'],
    selectedVehicleId: 'jetski',
    selectedTrackId: 'lagoon',
    selectedUnderglowColor: UNDERGLOW_PRESETS[0].hex,
    upgrades,
    bestTimes: {},
    muted: false,
  };
}

export function getUpgradeCost(currentLevel: number): number {
  if (currentLevel >= MAX_UPGRADE_LEVEL) return Infinity;
  return 80 + (currentLevel - 1) * 75;
}

export function getEffectiveVehicleStats(
  vehicle: VehicleDef,
  levels?: UpgradeLevels
): VehicleStats {
  const lv = levels ?? { velocidadMax: 1, aceleracion: 1, manejo: 1, turbo: 1 };
  return {
    velocidadMax: Number((vehicle.baseStats.velocidadMax + (lv.velocidadMax - 1) * 0.55).toFixed(2)),
    aceleracion: Number((vehicle.baseStats.aceleracion + (lv.aceleracion - 1) * 0.55).toFixed(2)),
    manejo: Number((vehicle.baseStats.manejo + (lv.manejo - 1) * 0.55).toFixed(2)),
    turbo: Number((vehicle.baseStats.turbo + (lv.turbo - 1) * 0.55).toFixed(2)),
  };
}

export function calculateRaceReward(position: number, trackIndex: number): number {
  const baseByPlace = [240, 150, 95, 55, 40, 30];
  const base = baseByPlace[Math.max(0, Math.min(5, position - 1))] ?? 30;
  const trackBonus = 1 + trackIndex * 0.12;
  return Math.round(base * trackBonus);
}

export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function sampleClosedSpline(
  points: ControlPoint[],
  samplesPerSegment = 15,
  laneId = 'main'
): TrackSample[] {
  const n = points.length;
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(p.x, p.y, p.z ?? 0)),
    true,
    'catmullrom',
    0.5
  );
  const raw: { x: number; y: number; z: number; w: number; surface: SurfaceType; tunnel: TunnelTheme | null }[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let k = 0; k < samplesPerSegment; k++) {
      const t = k / samplesPerSegment;
      const u = (i + t) / n;
      const pos = curve.getPoint(u);
      raw.push({
        x: pos.x,
        y: pos.y,
        z: Math.max(0, pos.z),
        w: catmullRom(p0.w, p1.w, p2.w, p3.w, t),
        surface: t < 0.5 ? (p1.surface ?? 'water') : (p2.surface ?? 'water'),
        tunnel: t < 0.5 ? (p1.tunnel ?? null) : (p2.tunnel ?? null),
      });
    }
  }
  const total = raw.length;
  const tangents: { tx: number; ty: number; slope: number }[] = [];
  for (let i = 0; i < total; i++) {
    const prev = raw[(i - 1 + total) % total];
    const next = raw[(i + 1) % total];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dy) || 1;
    tangents.push({ tx: dx / len, ty: dy / len, slope: dz / len });
  }

  const result: TrackSample[] = [];
  for (let i = 0; i < total; i++) {
    const curr = raw[i];
    const tPrev = tangents[(i - 2 + total) % total];
    const tNext = tangents[(i + 2) % total];
    const cross = tPrev.tx * tNext.ty - tPrev.ty * tNext.tx;
    const { tx, ty, slope } = tangents[i];
    result.push({
      x: curr.x,
      y: curr.y,
      z: curr.z,
      slope,
      tx,
      ty,
      nx: -ty,
      ny: tx,
      halfWidth: Math.max(120, curr.w * 0.5),
      surface: curr.surface,
      tunnel: curr.tunnel,
      s: i / total,
      laneId,
      curvature: cross,
    });
  }
  return result;
}

export function sampleBranchSpline(
  mainPoints: ControlPoint[],
  branch: TrackBranch,
  samplesPerSegment = 14
): TrackSample[] {
  const n = mainPoints.length;
  const startPt = mainPoints[branch.forkIdx];
  const endPt = mainPoints[branch.mergeIdx];
  const preStart = mainPoints[(branch.forkIdx - 1 + n) % n];
  const postEnd = mainPoints[(branch.mergeIdx + 1) % n];
  const fullPts = [preStart, startPt, ...branch.points, endPt, postEnd];
  const innerPts = [startPt, ...branch.points, endPt];
  const branchCurve = new CatmullRomCurve3(
    innerPts.map((p) => new Vector3(p.x, p.y, p.z ?? 0)),
    false,
    'catmullrom',
    0.5
  );

  const sStart = branch.forkIdx / n;
  const sEnd = branch.mergeIdx / n;
  const sSpan = sEnd >= sStart ? sEnd - sStart : 1 - sStart + sEnd;

  const raw: { x: number; y: number; z: number; w: number; surface: SurfaceType; tunnel: TunnelTheme | null }[] = [];
  const segCount = fullPts.length - 3;
  for (let i = 1; i <= segCount; i++) {
    const p0 = fullPts[i - 1];
    const p1 = fullPts[i];
    const p2 = fullPts[i + 1];
    const p3 = fullPts[i + 2];
    const steps = i === segCount ? samplesPerSegment + 1 : samplesPerSegment;
    for (let k = 0; k < steps; k++) {
      const t = k / samplesPerSegment;
      const u = Math.min(1, Math.max(0, (i - 1 + t) / segCount));
      const pos = branchCurve.getPoint(u);
      raw.push({
        x: pos.x,
        y: pos.y,
        z: Math.max(0, pos.z),
        w: catmullRom(p0.w, p1.w, p2.w, p3.w, t),
        surface: t < 0.5 ? (p1.surface ?? 'water') : (p2.surface ?? 'water'),
        tunnel: t < 0.5 ? (p1.tunnel ?? null) : (p2.tunnel ?? null),
      });
    }
  }

  const total = raw.length;
  const tangents: { tx: number; ty: number; slope: number }[] = [];
  for (let i = 0; i < total; i++) {
    const prev = raw[Math.max(0, i - 1)];
    const next = raw[Math.min(total - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const dz = next.z - prev.z;
    const len = Math.hypot(dx, dy) || 1;
    tangents.push({ tx: dx / len, ty: dy / len, slope: dz / len });
  }

  const result: TrackSample[] = [];
  for (let i = 0; i < total; i++) {
    const curr = raw[i];
    const tPrev = tangents[Math.max(0, i - 2)];
    const tNext = tangents[Math.min(total - 1, i + 2)];
    const cross = tPrev.tx * tNext.ty - tPrev.ty * tNext.tx;
    const { tx, ty, slope } = tangents[i];
    const frac = i / Math.max(1, total - 1);
    const s = (sStart + frac * sSpan) % 1;
    result.push({
      x: curr.x,
      y: curr.y,
      z: curr.z,
      slope,
      tx,
      ty,
      nx: -ty,
      ny: tx,
      halfWidth: Math.max(105, curr.w * 0.5),
      surface: curr.surface,
      tunnel: curr.tunnel,
      s,
      laneId: branch.id,
      curvature: cross,
    });
  }
  return result;
}

export function generateTrackCoins(
  main: TrackSample[],
  branches: { samples: TrackSample[] }[]
): TrackCoinSpawn[] {
  const coins: TrackCoinSpawn[] = [];
  for (let i = 14; i < main.length - 10; i += 28) {
    const pt = main[i];
    const laneSign = ((i / 28) | 0) % 2 === 0 ? 1 : -1;
    const baseOffset = laneSign * Math.min(72, pt.halfWidth * 0.36);
    for (let k = 0; k < 3; k++) {
      const sPt = main[(i + k * 2) % main.length];
      coins.push({
        x: sPt.x + sPt.nx * baseOffset,
        y: sPt.y + sPt.ny * baseOffset,
        z: sPt.z,
        phase: (i + k) * 0.45,
      });
    }
  }
  for (const br of branches) {
    for (let i = 5; i < br.samples.length - 4; i += 10) {
      const pt = br.samples[i];
      coins.push({ x: pt.x, y: pt.y, z: pt.z, phase: i * 0.5 });
    }
  }
  return coins;
}

export function createCheckpointState(): CheckpointState {
  return {
    lap: 1,
    lastS: 0.98,
    visitedSectors: 0,
    highestSector: 0,
    wrongWay: false,
  };
}

export function countBits(mask: number): number {
  let c = 0;
  let m = mask;
  while (m > 0) {
    c += m & 1;
    m >>= 1;
  }
  return c;
}

export function updateCheckpointProgress(
  state: CheckpointState,
  newS: number,
  headingDotTangent = 1
): { state: CheckpointState; lapCompleted: boolean; invalidLapAttempt: boolean } {
  const sector = Math.min(NUM_CHECKPOINTS - 1, Math.floor(newS * NUM_CHECKPOINTS));
  let visitedSectors = state.visitedSectors;
  let highestSector = state.highestSector;
  let lap = state.lap;
  let lapCompleted = false;
  let invalidLapAttempt = false;

  const hadPriorSectors = state.visitedSectors !== 0;
  const deltaS = newS - state.lastS;
  const wrappedForward = state.lastS > 0.78 && newS < 0.22;
  const wrappedBackward = state.lastS < 0.22 && newS > 0.78;

  if (!wrappedBackward) {
    if (sector <= highestSector + 2) {
      visitedSectors |= 1 << sector;
      if (sector > highestSector) {
        highestSector = sector;
      }
    }
  }

  if (wrappedForward) {
    const bitCount = countBits(visitedSectors);
    const hitMid = (visitedSectors & (1 << 3)) !== 0 || (visitedSectors & (1 << 4)) !== 0;
    const hitPreFinish = (visitedSectors & (1 << 6)) !== 0 || (visitedSectors & (1 << 7)) !== 0;
    if (bitCount >= 5 && hitMid && hitPreFinish) {
      lap += 1;
      lapCompleted = true;
      visitedSectors = 1 << sector;
      highestSector = sector;
    } else if (hadPriorSectors) {
      invalidLapAttempt = true;
    } else {
      visitedSectors = 1 << sector;
      highestSector = sector;
    }
  }

  const movingBackward =
    headingDotTangent < -0.35 || (!wrappedForward && !wrappedBackward && deltaS < -0.015);

  return {
    state: {
      lap,
      lastS: newS,
      visitedSectors,
      highestSector,
      wrongWay: movingBackward,
    },
    lapCompleted,
    invalidLapAttempt,
  };
}

export interface CraftPhysicsInput {
  vx: number;
  vy: number;
  angle: number;
  throttle: number; // -1..1
  steer: number; // -1..1
  stats: VehicleStats;
  turboTimer: number;
  nitroOverdriveTimer?: number;
  miniTurboTimer?: number;
  mudTimer: number;
  onBoostCurrent: boolean;
  onIce?: boolean;
  lightningSlowTimer: number;
  empSlowTimer?: number;
  spinTimer?: number;
  groundSlope?: number; // dz/ds: >0 uphill, <0 downhill
  isAirborne?: boolean;
  driftCharge?: number;
  prevGear?: number;
  dt: number;
}

export interface CraftPhysicsResult {
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  lateralSlip: number;
  gear: number;
  rpmRatio: number;
  justShifted: boolean;
  driftCharge: number;
  driftStage: 0 | 1 | 2;
  miniTurboTriggered: 0 | 1 | 2;
}

export function stepCraftPhysics(input: CraftPhysicsInput): CraftPhysicsResult {
  const { stats, dt } = input;
  const maxSpeed = 450 + stats.velocidadMax * 38;
  const accelForce = 420 + stats.aceleracion * 52;
  const turnRate = 1.7 + stats.manejo * 0.15;

  let speedMult = 1.0;
  if (input.nitroOverdriveTimer && input.nitroOverdriveTimer > 0) {
    speedMult *= 1.56 + stats.turbo * 0.03;
  } else if (input.turboTimer > 0) {
    speedMult *= 1.42 + stats.turbo * 0.025;
  } else if (input.miniTurboTimer && input.miniTurboTimer > 0) {
    speedMult *= 1.24 + stats.turbo * 0.015;
  }
  if (input.onBoostCurrent) speedMult *= 1.32;
  if (input.mudTimer > 0) speedMult *= 0.56;
  if (input.lightningSlowTimer > 0) speedMult *= 0.52;
  if (input.empSlowTimer && input.empSlowTimer > 0) speedMult *= 0.55;
  if (input.spinTimer && input.spinTimer > 0) speedMult *= 0.48;

  const currentSpeed = Math.hypot(input.vx, input.vy);
  const steerFactor = 0.55 + 0.45 * Math.min(1, currentSpeed / 160);
  const newAngle = input.angle + input.steer * turnRate * steerFactor * dt;

  const fx = Math.cos(newAngle);
  const fy = Math.sin(newAngle);
  const rx = -fy;
  const ry = fx;

  let vx = input.vx;
  let vy = input.vy;

  const vRatio = Math.min(1.3, currentSpeed / Math.max(1, maxSpeed));
  // Power curve: explosive low-end launch torque -> strong midrange -> aero drag at top speed
  const torqueMult =
    vRatio < 0.28
      ? 1.42 - vRatio * 0.4
      : vRatio < 0.82
        ? 1.15 - (vRatio - 0.28) * 0.25
        : Math.max(0.84, 1.02 - (vRatio - 0.82) * 0.38);

  const isBoosted =
    input.turboTimer > 0 ||
    (input.nitroOverdriveTimer ?? 0) > 0 ||
    (input.miniTurboTimer ?? 0) > 0;

  // Simulated 5-speed gearbox + RPM dip on upshift
  const gearFloat = Math.min(4.99, Math.max(0, vRatio * 4.55));
  const gear = Math.floor(gearFloat) + 1;
  const gearFrac = gearFloat - Math.floor(gearFloat);
  const rpmRatio = Math.min(1, 0.36 + gearFrac * 0.64 + (isBoosted ? 0.14 : 0));
  const prevGear = input.prevGear ?? gear;
  const justShifted = gear > prevGear && input.throttle > 0.2;
  const shiftDip = justShifted ? 0.86 : 1.0;

  const thrust =
    input.throttle >= 0
      ? input.throttle * accelForce * torqueMult * shiftDip * (isBoosted ? 1.48 : 1)
      : input.throttle * accelForce * 0.7;
  vx += fx * thrust * dt;
  vy += fy * thrust * dt;

  // Slope gravity resistance/boost (uphill slows without turbo, downhill boosts naturally)
  const slope = input.groundSlope ?? 0;
  if (!input.isAirborne && Math.abs(slope) > 0.005) {
    const slopeAccel = -slope * (slope > 0 && isBoosted ? 110 : 280);
    vx += fx * slopeAccel * dt;
    vy += fy * slopeAccel * dt;
  }

  const forwardVel = vx * fx + vy * fy;
  const lateralVel = vx * rx + vy * ry;

  // Aerodynamic + hydrodynamic drag curve (quadratic component near Vmax)
  const capRatio = Math.min(1.4, Math.abs(forwardVel) / Math.max(1, maxSpeed * speedMult));
  const aeroDrag = (input.onIce ? 0.22 : 0.35) + Math.pow(capRatio, 2) * 0.45;
  const forwardDrag = Math.exp(-aeroDrag * dt);
  // Real weight transfer & lateral slide: looser rear grip at high speed during steering, extra wide drift on ice_water
  const baseLateralGrip = Math.max(
    1.6,
    2.5 + stats.manejo * 0.32 - Math.abs(input.steer) * vRatio * 1.15
  );
  const dynamicLateralGrip = input.onIce ? Math.max(0.75, baseLateralGrip * 0.56) : baseLateralGrip;
  const lateralGrip = Math.exp(-dynamicLateralGrip * dt);

  let nextForward = forwardVel * forwardDrag;
  const nextLateral = lateralVel * lateralGrip;

  // 2-stage Drift Mini-Turbo charging & burst release
  let driftCharge = input.driftCharge ?? 0;
  const lateralAbs = Math.abs(nextLateral);
  const driftingNow =
    !input.isAirborne &&
    input.throttle > 0.2 &&
    Math.abs(input.steer) > 0.45 &&
    currentSpeed > 185 &&
    lateralAbs > 42;

  let miniTurboTriggered: 0 | 1 | 2 = 0;
  if (driftingNow) {
    driftCharge = Math.min(2.4, driftCharge + dt);
  } else if (driftCharge > 0) {
    if (Math.abs(input.steer) < 0.35 && input.throttle > 0.1) {
      if (driftCharge >= 1.55) {
        miniTurboTriggered = 2;
        nextForward += 165;
      } else if (driftCharge >= 0.7) {
        miniTurboTriggered = 1;
        nextForward += 95;
      }
      driftCharge = 0;
    } else {
      driftCharge = Math.max(0, driftCharge - dt * 1.8);
    }
  }

  const driftStage: 0 | 1 | 2 = driftCharge >= 1.55 ? 2 : driftCharge >= 0.7 ? 1 : 0;

  const cap = maxSpeed * speedMult;
  if (nextForward > cap) {
    nextForward = cap + (nextForward - cap) * Math.exp(-4 * dt);
  } else if (nextForward < -cap * 0.38) {
    nextForward = -cap * 0.38;
  }

  vx = fx * nextForward + rx * nextLateral;
  vy = fy * nextForward + ry * nextLateral;

  return {
    vx,
    vy,
    angle: newAngle,
    speed: Math.hypot(vx, vy),
    lateralSlip: lateralAbs,
    gear,
    rpmRatio,
    justShifted,
    driftCharge,
    driftStage,
    miniTurboTriggered,
  };
}

export function normalizeAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function stepCameraAngle(
  currentAngle: number,
  targetAngle: number,
  dt: number,
  stiffness = 8.5
): number {
  const diff = normalizeAngle(targetAngle - currentAngle);
  const alpha = 1 - Math.exp(-stiffness * dt);
  return normalizeAngle(currentAngle + diff * alpha);
}

/**
 * Right-handed 3D coordinate mapping from 2D track space (x, y) to Three.js (X, Y-up, Z).
 * Ensures steering right (angle increasing) turns toward worldRight = forward x up = (-sin a, 0, cos a).
 */
export function mapTrackToWorld(
  trackX: number,
  trackY: number,
  heightMeters = 0,
  scale = WORLD_SCALE
): { x: number; y: number; z: number } {
  return {
    x: trackX * scale,
    y: heightMeters,
    z: trackY * scale,
  };
}

export function worldForwardFromAngle(angle: number): { x: number; y: number; z: number } {
  return {
    x: Math.cos(angle) || 0,
    y: 0,
    z: Math.sin(angle) || 0,
  };
}

export function worldRightFromAngle(angle: number): { x: number; y: number; z: number } {
  return {
    x: -Math.sin(angle) || 0,
    y: 0,
    z: Math.cos(angle) || 0,
  };
}

export interface ChaseCamInput {
  playerX: number;
  playerY: number;
  playerAirZ: number;
  playerAngle: number;
  playerSpeed: number;
  maxBaseSpeed: number;
  steerInput: number;
  lateralSlip: number;
  turboActive: boolean;
  nitroActive: boolean;
  boostKick?: number;
  landingCompress?: number;
  camAngle: number;
  camFov: number;
  driftSwing: number;
  dt: number;
}

export interface ChaseCamState {
  camAngle: number;
  camFov: number;
  driftSwing: number;
  camRoll: number;
  camWorldX: number;
  camWorldY: number;
  camWorldZ: number;
  lookWorldX: number;
  lookWorldY: number;
  lookWorldZ: number;
  speedLinesIntensity: number;
}

function computeDynamicFov(
  currentFov: number,
  speedRatio: number,
  turboActive: boolean,
  nitroActive: boolean,
  dt: number
): number {
  // 62 deg at rest -> 75 deg at cruise -> up to 90 deg during Turbo / Nitro
  let targetFov = 62 + Math.min(1, speedRatio) * 13;
  if (turboActive) targetFov = Math.max(targetFov, 85);
  if (nitroActive) targetFov = 90;
  const fovAlpha = 1 - Math.exp(-6.5 * dt);
  const next = currentFov + (targetFov - currentFov) * fovAlpha;
  return Math.max(62, Math.min(90, next));
}

/**
 * Need for Speed style low-chase camera kinematics:
 * - Dynamic FOV progression: 62 deg idle -> 75 deg cruise -> 90 deg Nitro/Turbo
 * - Drift camera lag/swing revealing the sliding vehicle's side profile
 * - Boost kick pull-back and landing suspension compression
 */
export function stepChaseCamera(input: ChaseCamInput): ChaseCamState {
  const speedRatio = Math.max(0, Math.min(1.5, input.playerSpeed / Math.max(1, input.maxBaseSpeed)));
  const nextFov = computeDynamicFov(input.camFov, speedRatio, input.turboActive, input.nitroActive, input.dt);

  const driftFactor = Math.min(1, input.lateralSlip / 155) * 0.75 + Math.abs(input.steerInput) * 0.25;
  const targetSwing =
    -Math.sign(input.steerInput || 0) * Math.min(1.18, driftFactor * 1.18) * Math.min(1, speedRatio * 1.4);
  const swingAlpha = 1 - Math.exp(-5.4 * input.dt);
  const nextSwing = input.driftSwing + (targetSwing - input.driftSwing) * swingAlpha;

  const angleStiffness = Math.abs(nextSwing) > 0.25 ? 5.6 : 8.8;
  const nextCamAngle = stepCameraAngle(input.camAngle, input.playerAngle, input.dt, angleStiffness);

  const fx = Math.cos(nextCamAngle);
  const fz = Math.sin(nextCamAngle);
  const rx = -fz;
  const rz = fx;

  const playerW = mapTrackToWorld(input.playerX, input.playerY, input.playerAirZ * WORLD_SCALE);
  const kickDist = (input.boostKick ?? 0) * 0.65;
  const compressY = (input.landingCompress ?? 0) * 0.28;

  const chaseDist = 3.85 - Math.min(0.45, speedRatio * 0.25) + kickDist;
  const chaseHeight = Math.max(0.85, 1.42 + Math.min(0.28, input.playerAirZ * WORLD_SCALE * 0.35) - compressY);

  const camWorldX = playerW.x - fx * chaseDist + rx * nextSwing;
  const camWorldY = chaseHeight + playerW.y * 0.72;
  const camWorldZ = playerW.z - fz * chaseDist + rz * nextSwing;

  const lookAhead = 22.0;
  const lookWorldX = playerW.x + fx * lookAhead + rx * (nextSwing * 0.2);
  const lookWorldY = 1.05 + playerW.y * 0.75;
  const lookWorldZ = playerW.z + fz * lookAhead + rz * (nextSwing * 0.2);

  const speedLinesIntensity = input.nitroActive
    ? 1.0
    : input.turboActive
      ? 0.9
      : Math.max(0, Math.min(0.82, (speedRatio - 0.78) * 3.6));

  return {
    camAngle: nextCamAngle,
    camFov: nextFov,
    driftSwing: nextSwing,
    camRoll: 0,
    camWorldX,
    camWorldY,
    camWorldZ,
    lookWorldX,
    lookWorldY,
    lookWorldZ,
    speedLinesIntensity,
  };
}

/**
 * Hood / First-Person Cockpit camera mounted over the craft's bow:
 * - Exposes the craft's forward prow/dashboard at bottom of viewport
 * - Aggressive cornering roll into turns
 * - 62-90 deg dynamic FOV + landing compression + boost kick
 */
export function stepHoodCamera(input: ChaseCamInput): ChaseCamState {
  const speedRatio = Math.max(0, Math.min(1.5, input.playerSpeed / Math.max(1, input.maxBaseSpeed)));
  const nextFov = computeDynamicFov(input.camFov, speedRatio, input.turboActive, input.nitroActive, input.dt);

  const fx = Math.cos(input.playerAngle);
  const fz = Math.sin(input.playerAngle);

  const playerW = mapTrackToWorld(input.playerX, input.playerY, input.playerAirZ * WORLD_SCALE);
  const compressY = (input.landingCompress ?? 0) * 0.22;
  const kickBack = (input.boostKick ?? 0) * 0.22;

  // Positioned just behind bow cowl so the front edge/hood fills the lower edge of the screen
  const hoodForwardOffset = 0.28 - kickBack;
  const hoodHeight = Math.max(0.75, 1.12 - compressY);

  const camWorldX = playerW.x + fx * hoodForwardOffset;
  const camWorldY = hoodHeight + playerW.y;
  const camWorldZ = playerW.z + fz * hoodForwardOffset;

  const lookAhead = 26.0;
  const lookWorldX = playerW.x + fx * lookAhead;
  const lookWorldY = 0.88 + playerW.y;
  const lookWorldZ = playerW.z + fz * lookAhead;

  const targetRoll = -input.steerInput * (0.08 + Math.min(0.08, (input.lateralSlip / 220) * 0.08));
  const rollAlpha = 1 - Math.exp(-8.5 * input.dt);
  const camRoll = input.driftSwing + (targetRoll - input.driftSwing) * rollAlpha;

  const speedLinesIntensity = input.nitroActive
    ? 1.0
    : input.turboActive
      ? 0.92
      : Math.max(0, Math.min(0.85, (speedRatio - 0.78) * 3.8));

  return {
    camAngle: input.playerAngle,
    camFov: nextFov,
    driftSwing: camRoll,
    camRoll,
    camWorldX,
    camWorldY,
    camWorldZ,
    lookWorldX,
    lookWorldY,
    lookWorldZ,
    speedLinesIntensity,
  };
}

/**
 * Dynamic wave swell height in simulation units.
 * Pirate Cove features heavy stormy swells while Laguna/Arctic have gentle chop.
 * Elevated bridges and covered tunnels flatten waves so crafts stay cleanly supported.
 */
export function computeWaveHeight(
  x: number,
  y: number,
  simTime: number,
  biome: TrackDef['biome'],
  surface: SurfaceType,
  inTunnel: boolean
): number {
  if (surface === 'bridge' || inTunnel) return 0;
  if (biome === 'pirate') {
    const w1 = Math.sin(x * 0.0042 + simTime * 2.9) * 9.5;
    const w2 = Math.cos(y * 0.0051 - simTime * 2.2) * 7.2;
    return w1 + w2;
  }
  if (biome === 'lagoon' || biome === 'arctic') {
    return Math.sin(x * 0.005 + y * 0.004 + simTime * 2.4) * 2.4;
  }
  return 0;
}

export interface AiCombatContext {
  heldItem: PowerUpType | null;
  myProgress: number;
  leaderProgress: number;
  playerProgress: number;
  myRank: number; // 1 = first
  closestAheadDist: number;
  closestBehindDist: number;
  threatenedByMissile: boolean;
  onStraight: boolean;
  cooldownReady: boolean;
}

/**
 * Strategic bidirectional AI power-up trigger decision:
 * - Shield when threatened by an incoming homing torpedo or packed rivals.
 * - Lightning when trailing behind leader/player.
 * - Torpedo when a racer ahead is within engagement range.
 * - Buoy Mine when a pursuer is right behind.
 * - Squid Ink / Sonic Wave / EMP when rivals are nearby.
 * - Turbo / Nitro when trailing or charging down a straight.
 */
export function evaluateAiPowerDecision(ctx: AiCombatContext): boolean {
  if (!ctx.heldItem) return false;
  if (ctx.heldItem === 'shield') {
    return ctx.threatenedByMissile || ctx.closestBehindDist < 170 || ctx.closestAheadDist < 160;
  }
  if (!ctx.cooldownReady) return false;
  switch (ctx.heldItem) {
    case 'lightning':
      return ctx.myRank >= 2 || ctx.playerProgress > ctx.myProgress - 0.05;
    case 'missile':
      return ctx.myRank > 1 && ctx.closestAheadDist < 950;
    case 'mine':
      return ctx.closestBehindDist < 420 || ctx.myRank <= 3;
    case 'squid_ink':
      return ctx.closestAheadDist < 750 || ctx.closestBehindDist < 550;
    case 'wave':
    case 'emp_pulse':
      return ctx.closestAheadDist < 340 || ctx.closestBehindDist < 340;
    case 'turbo':
    case 'nitro_overdrive':
      return ctx.onStraight || ctx.myRank > 1;
    case 'coin_magnet':
      return true;
    default:
      return true;
  }
}

export interface HullColliderDims {
  halfSpine: number;
  radius: number;
  mass: number;
}

export function getHullColliderDims(
  hullType: VehicleDef['hullType']
): HullColliderDims {
  switch (hullType) {
    case 'jetski':
      return { halfSpine: 19, radius: 16, mass: 0.92 };
    case 'speedboat':
      return { halfSpine: 24, radius: 18, mass: 1.05 };
    case 'yacht':
      return { halfSpine: 24, radius: 21, mass: 1.25 };
    case 'bathtub':
      return { halfSpine: 19, radius: 19, mass: 1.08 };
    case 'rubberduck':
      return { halfSpine: 18, radius: 20, mass: 1.0 };
  }
}

export interface CollisionRacerBody {
  x: number;
  y: number;
  airZ: number;
  vx: number;
  vy: number;
  angle: number;
  hullType: VehicleDef['hullType'];
  shieldTimer: number;
}

export interface VehicleCollisionResult {
  collided: boolean;
  impactX: number;
  impactY: number;
  impactZ: number;
  normalX: number;
  normalY: number;
  impactStrength: number;
  shieldKnock: boolean;
}

function closestPointsOnSegments2D(
  ax0: number,
  ay0: number,
  ax1: number,
  ay1: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number
): { pAx: number; pAy: number; pBx: number; pBy: number } {
  const ux = ax1 - ax0;
  const uy = ay1 - ay0;
  const vx = bx1 - bx0;
  const vy = by1 - by0;
  const wx = ax0 - bx0;
  const wy = ay0 - by0;

  const a = ux * ux + uy * uy;
  const b = ux * vx + uy * vy;
  const c = vx * vx + vy * vy;
  const d = ux * wx + uy * wy;
  const e = vx * wx + vy * wy;
  const D = a * c - b * b;

  let sN: number;
  let sD = D;
  let tN: number;
  let tD = D;

  if (D < 1e-6) {
    sN = 0;
    sD = 1;
    tN = e;
    tD = c;
  } else {
    sN = b * e - c * d;
    tN = a * e - b * d;
    if (sN < 0) {
      sN = 0;
      tN = e;
      tD = c;
    } else if (sN > sD) {
      sN = sD;
      tN = e + b;
      tD = c;
    }
  }

  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0;
    else if (-d > a) sN = sD;
    else {
      sN = -d;
      sD = a;
    }
  } else if (tN > tD) {
    tN = tD;
    if (-d + b < 0) sN = 0;
    else if (-d + b > a) sN = sD;
    else {
      sN = -d + b;
      sD = a;
    }
  }

  const sc = Math.abs(sN) < 1e-6 ? 0 : sN / sD;
  const tc = Math.abs(tN) < 1e-6 ? 0 : tN / tD;
  return {
    pAx: ax0 + sc * ux,
    pAy: ay0 + sc * uy,
    pBx: bx0 + tc * vx,
    pBy: by0 + tc * vy,
  };
}

/**
 * Solid oriented-capsule hull collision resolver between two watercrafts:
 * 1. Ignores vertical deck crossings (e.g., Figure-8 City overpass z=145 vs lower canal z=0).
 * 2. Performs immediate zero-overlap positional separation along collision normal.
 * 3. Resolves realistic sideswipe lateral shove & rear-end momentum transfer.
 * 4. Shield Bubble preserves the shielded racer's speed intact while knocking the rival aside.
 */
export function resolveVehicleCollision(
  a: CollisionRacerBody,
  b: CollisionRacerBody
): VehicleCollisionResult {
  // Elevation clearance guard: bridge overpass vs underpass never collide
  if (Math.abs(a.airZ - b.airZ) > 36) {
    return {
      collided: false,
      impactX: 0,
      impactY: 0,
      impactZ: 0,
      normalX: 0,
      normalY: 0,
      impactStrength: 0,
      shieldKnock: false,
    };
  }

  const dimA = getHullColliderDims(a.hullType);
  const dimB = getHullColliderDims(b.hullType);

  const fAx = Math.cos(a.angle);
  const fAy = Math.sin(a.angle);
  const fBx = Math.cos(b.angle);
  const fBy = Math.sin(b.angle);

  const closest = closestPointsOnSegments2D(
    a.x - fAx * dimA.halfSpine,
    a.y - fAy * dimA.halfSpine,
    a.x + fAx * dimA.halfSpine,
    a.y + fAy * dimA.halfSpine,
    b.x - fBx * dimB.halfSpine,
    b.y - fBy * dimB.halfSpine,
    b.x + fBx * dimB.halfSpine,
    b.y + fBy * dimB.halfSpine
  );

  const dx = closest.pBx - closest.pAx;
  const dy = closest.pBy - closest.pAy;
  const dist = Math.hypot(dx, dy);
  const minDist = dimA.radius + dimB.radius;

  if (dist >= minDist) {
    return {
      collided: false,
      impactX: 0,
      impactY: 0,
      impactZ: 0,
      normalX: 0,
      normalY: 0,
      impactStrength: 0,
      shieldKnock: false,
    };
  }

  let nx = 1;
  let ny = 0;
  if (dist > 1e-4) {
    nx = dx / dist;
    ny = dy / dist;
  } else {
    const cDx = b.x - a.x;
    const cDy = b.y - a.y;
    const cLen = Math.hypot(cDx, cDy);
    if (cLen > 1e-4) {
      nx = cDx / cLen;
      ny = cDy / cLen;
    } else {
      nx = -fAy;
      ny = fAx;
    }
  }

  const penetration = minDist - dist + 0.5;
  const aShield = a.shieldTimer > 0;
  const bShield = b.shieldTimer > 0;

  if (aShield && !bShield) {
    b.x += nx * penetration;
    b.y += ny * penetration;
  } else if (bShield && !aShield) {
    a.x -= nx * penetration;
    a.y -= ny * penetration;
  } else {
    const totalMass = dimA.mass + dimB.mass;
    const shareA = dimB.mass / totalMass;
    const shareB = dimA.mass / totalMass;
    a.x -= nx * penetration * shareA;
    a.y -= ny * penetration * shareA;
    b.x += nx * penetration * shareB;
    b.y += ny * penetration * shareB;
  }

  const relVx = b.vx - a.vx;
  const relVy = b.vy - a.vy;
  const velAlongNormal = relVx * nx + relVy * ny;
  let impactStrength = Math.max(0.25, Math.min(2.0, -velAlongNormal / 260));
  let shieldKnock = false;

  if (aShield && !bShield) {
    shieldKnock = true;
    const speedA = Math.hypot(a.vx, a.vy);
    const knockVel = Math.max(290, speedA * 0.52);
    b.vx += nx * knockVel;
    b.vy += ny * knockVel;
    impactStrength = Math.max(0.85, impactStrength);
  } else if (bShield && !aShield) {
    shieldKnock = true;
    const speedB = Math.hypot(b.vx, b.vy);
    const knockVel = Math.max(290, speedB * 0.52);
    a.vx -= nx * knockVel;
    a.vy -= ny * knockVel;
    impactStrength = Math.max(0.85, impactStrength);
  } else {
    const invMassA = 1 / dimA.mass;
    const invMassB = 1 / dimB.mass;
    const restitution = 0.42;

    if (velAlongNormal < 0) {
      const impulse = (-(1 + restitution) * velAlongNormal) / (invMassA + invMassB);
      a.vx -= nx * impulse * invMassA;
      a.vy -= ny * impulse * invMassA;
      b.vx += nx * impulse * invMassB;
      b.vy += ny * impulse * invMassB;
    }

    // Sideswipe lateral rub impulse when hulls scrape side-by-side at speed
    const speedMax = Math.max(Math.hypot(a.vx, a.vy), Math.hypot(b.vx, b.vy));
    const latDotA = Math.abs(nx * -fAy + ny * fAx);
    if (latDotA > 0.55 && speedMax > 140) {
      const shove = 58 * latDotA;
      a.vx -= nx * shove * invMassA;
      a.vy -= ny * shove * invMassA;
      b.vx += nx * shove * invMassB;
      b.vy += ny * shove * invMassB;
    }
  }

  return {
    collided: true,
    impactX: (closest.pAx + closest.pBx) * 0.5,
    impactY: (closest.pAy + closest.pBy) * 0.5,
    impactZ: (a.airZ + b.airZ) * 0.5 * WORLD_SCALE + 0.45,
    normalX: nx,
    normalY: ny,
    impactStrength,
    shieldKnock,
  };
}
