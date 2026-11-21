import {
  AI_PROFILES,
  MAX_UPGRADE_LEVEL,
  POWERUP_KEYS,
  POWERUP_META,
  TOTAL_LAPS,
  UNDERGLOW_PRESETS,
  VEHICLES,
  calculateRaceReward,
  computeWaveHeight,
  createCheckpointState,
  createDefaultSaveData,
  evaluateAiPowerDecision,
  getEffectiveVehicleStats,
  getUpgradeCost,
  normalizeAngle,
  resolveVehicleCollision,
  stepCraftPhysics,
  updateCheckpointProgress,
  type CameraMode,
  type CheckpointState,
  type PowerUpType,
  type SaveData,
  type UpgradeLevels,
} from './hydroEngine';
import { COMPILED_TRACKS, findNearestSample, type CompiledTrack } from './tracks3d';
import { SoundEngine } from './audio';
import {
  HydroSceneRenderer,
  MAX_PARTICLES,
  type InkSplatterState,
  type MineSimState,
  type ParticleSlot,
  type ProjectileSimState,
  type RacerSimState,
  type ShockwaveSimState,
} from './renderer3d';

const STORAGE_KEY = 'duck_hydro_race_save_v1';

type GameState = 'title' | 'playing' | 'paused' | 'gameover';

interface RacerRuntime extends RacerSimState {
  heldItem: PowerUpType | null;
  cp: CheckpointState;
  finished: boolean;
  finishTime: number;
  lapStartTime: number;
  bestLapTime: number;
  lapProgress: number;
  aiSkill: number;
  aiPrefLane: string;
  aiLaneOffset: number;
  aiItemCooldown: number;
  aiDecisionTimer: number;
  aiTargetIdx: number;
  laneId: string;
  coinsCollected: number;
}

interface ProjectileRuntime extends ProjectileSimState {
  vx: number;
  vy: number;
  vz: number;
  ownerIdx: number;
  targetIdx: number;
  life: number;
}

interface ShockwaveRuntime extends ShockwaveSimState {
  ownerIdx: number;
  hitIndices: Set<number>;
  isEmp: boolean;
}

interface MineRuntime extends MineSimState {
  ownerIdx: number;
  armDelay: number;
  life: number;
}

interface InkRuntime extends InkSplatterState {
  life: number;
  maxLife: number;
}

function loadSaveData(): SaveData {
  const defaults = createDefaultSaveData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const upgrades: Record<string, UpgradeLevels> = { ...defaults.upgrades };
    if (parsed.upgrades) {
      for (const v of VEHICLES) {
        if (parsed.upgrades[v.id]) {
          upgrades[v.id] = {
            velocidadMax: Math.min(MAX_UPGRADE_LEVEL, Math.max(1, parsed.upgrades[v.id].velocidadMax || 1)),
            aceleracion: Math.min(MAX_UPGRADE_LEVEL, Math.max(1, parsed.upgrades[v.id].aceleracion || 1)),
            manejo: Math.min(MAX_UPGRADE_LEVEL, Math.max(1, parsed.upgrades[v.id].manejo || 1)),
            turbo: Math.min(MAX_UPGRADE_LEVEL, Math.max(1, parsed.upgrades[v.id].turbo || 1)),
          };
        }
      }
    }
    const validVeh = VEHICLES.some((v) => v.id === parsed.selectedVehicleId)
      ? parsed.selectedVehicleId!
      : defaults.selectedVehicleId;
    const validTrack = COMPILED_TRACKS.some((t) => t.id === parsed.selectedTrackId)
      ? parsed.selectedTrackId!
      : defaults.selectedTrackId;
    const validGlow = UNDERGLOW_PRESETS.some((g) => g.hex === parsed.selectedUnderglowColor)
      ? parsed.selectedUnderglowColor!
      : defaults.selectedUnderglowColor;

    return {
      coins: typeof parsed.coins === 'number' && parsed.coins >= 0 ? Math.floor(parsed.coins) : defaults.coins,
      unlockedVehicles: Array.isArray(parsed.unlockedVehicles)
        ? Array.from(new Set([...defaults.unlockedVehicles, ...parsed.unlockedVehicles]))
        : defaults.unlockedVehicles,
      selectedVehicleId: validVeh,
      selectedTrackId: validTrack,
      selectedUnderglowColor: validGlow,
      upgrades,
      bestTimes: parsed.bestTimes && typeof parsed.bestTimes === 'object' ? parsed.bestTimes : {},
      muted: Boolean(parsed.muted),
    };
  } catch {
    return defaults;
  }
}

function persistSaveData(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota / private mode issues
  }
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '00:00.0';
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${String(mins).padStart(2, '0')}:${rem < 10 ? '0' : ''}${rem.toFixed(1)}`;
}

function getVehicleById(id: string) {
  return VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
}

function getTrackById(id: string): CompiledTrack {
  return COMPILED_TRACKS.find((t) => t.id === id) ?? COMPILED_TRACKS[0];
}

function drawMuteSvg(svgEl: Element | null, muted: boolean): void {
  if (!svgEl) return;
  if (muted) {
    svgEl.innerHTML =
      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
  } else {
    svgEl.innerHTML =
      '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
  }
}

function drawPowerUpSvg(svgEl: Element | null, type: PowerUpType | null): void {
  if (!svgEl) return;
  if (!type) {
    svgEl.innerHTML =
      '<circle cx="12" cy="12" r="9" fill="none" stroke="rgba(148,163,184,0.45)" stroke-width="2" stroke-dasharray="4 3"/>';
    return;
  }
  switch (type) {
    case 'turbo':
      svgEl.innerHTML = '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="#f97316" stroke="#fef08a" stroke-width="1.3"/>';
      break;
    case 'shield':
      svgEl.innerHTML = '<path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5l8-3z" fill="rgba(56,189,248,0.45)" stroke="#38bdf8" stroke-width="2"/>';
      break;
    case 'wave':
      svgEl.innerHTML = '<path d="M2 15c2-4 5-4 7 0s5 4 7 0 4-4 6 0" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round"/><path d="M2 10c2-4 5-4 7 0s5 4 7 0 4-4 6 0" fill="none" stroke="#bae6fd" stroke-width="2" stroke-linecap="round"/>';
      break;
    case 'missile':
      svgEl.innerHTML = '<path d="M5 19L19 5l-2 9-4 4-8 1z" fill="#ef4444" stroke="#fecaca" stroke-width="1.5"/><circle cx="7" cy="17" r="2.2" fill="#facc15"/>';
      break;
    case 'lightning':
      svgEl.innerHTML = '<polygon points="13 1 4 14 11 14 9 23 20 10 13 10 13 1" fill="#facc15" stroke="#ffffff" stroke-width="1.2"/>';
      break;
    case 'nitro_overdrive':
      svgEl.innerHTML = '<path d="M12 2c3 4 6 7 6 12a6 6 0 1 1-12 0c0-3 1.5-5.5 3.5-8 .5 2 1.8 3 2.5 3 .3-2.5 0-5 0-7z" fill="#e879f9" stroke="#fdf4ff" stroke-width="1.3"/>';
      break;
    case 'emp_pulse':
      svgEl.innerHTML = '<circle cx="12" cy="12" r="3.5" fill="#c084fc"/><circle cx="12" cy="12" r="7" fill="none" stroke="#a855f7" stroke-width="2"/><circle cx="12" cy="12" r="10.2" fill="none" stroke="#e9d5ff" stroke-width="1.2" stroke-dasharray="3 2"/>';
      break;
    case 'coin_magnet':
      svgEl.innerHTML = '<path d="M6 4v8a6 6 0 0 0 12 0V4h-3v8a3 3 0 0 1-6 0V4H6z" fill="#ef4444" stroke="#fde047" stroke-width="1.4"/><rect x="6" y="4" width="3" height="3" fill="#e2e8f0"/><rect x="15" y="4" width="3" height="3" fill="#e2e8f0"/>';
      break;
    case 'squid_ink':
      svgEl.innerHTML = '<path d="M12 3c4.2 0 7 3 7 6.5 0 2.5-1.4 4.2-2.2 6.5-.4 1.2-1.8 1.5-2.6.5-.5-.6-.8-1.5-1.2-1.5s-.7.9-1.2 1.5c-.8 1-2.2.7-2.6-.5C8.4 13.7 7 12 7 9.5 7 6 9.8 3 12 3z" fill="#0f172a" stroke="#94a3b8" stroke-width="1.5"/><circle cx="9.8" cy="8.8" r="1.1" fill="#38bdf8"/><circle cx="14.2" cy="8.8" r="1.1" fill="#38bdf8"/>';
      break;
    case 'mine':
      svgEl.innerHTML = '<circle cx="12" cy="12" r="5.5" fill="#1e293b" stroke="#fb7185" stroke-width="1.8"/><line x1="12" y1="2" x2="12" y2="6" stroke="#f43f5e" stroke-width="2.2"/><line x1="12" y1="18" x2="12" y2="22" stroke="#f43f5e" stroke-width="2.2"/><line x1="2" y1="12" x2="6" y2="12" stroke="#f43f5e" stroke-width="2.2"/><line x1="18" y1="12" x2="22" y2="12" stroke="#f43f5e" stroke-width="2.2"/><circle cx="12" cy="12" r="2" fill="#f43f5e"/>';
      break;
  }
}

function main(): void {
  const byId = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
    document.getElementById(id) as T | null;

  // Self-heal if an older dev Service Worker served stale cached HTML missing newer HUD controls
  if (
    (!byId('hudCameraBtn') || !byId('hudGearVal')) &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator
  ) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .then(async () => {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      })
      .finally(() => {
        if (!sessionStorage.getItem('hydroduck_sw_healed')) {
          sessionStorage.setItem('hydroduck_sw_healed', '1');
          window.location.reload();
        }
      });
  } else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }

  const webglMount = byId('webglMount')!;
  const fxOverlayCanvas = byId<HTMLCanvasElement>('fxOverlayCanvas')!;
  const minimapCanvas = byId<HTMLCanvasElement>('minimapCanvas')!;
  if (!webglMount || !fxOverlayCanvas || !minimapCanvas) return;

  const titleScreen = byId('titleScreen')!;
  const garageModal = byId('garageModal')!;
  const hudLayer = byId('hudLayer')!;
  const pauseModal = byId('pauseModal')!;
  const resultsModal = byId('resultsModal')!;
  const touchControls = byId('touchControls')!;
  const raceBanner = byId('raceBanner')!;
  const bannerBig = byId('bannerBig')!;
  const bannerSub = byId('bannerSub')!;
  const wrongWayBanner = byId('wrongWayBanner')!;
  const torpedoAlert = byId('torpedoAlert');
  const iosInstallModal = byId('iosInstallModal');
  const offlineBanner = byId('offlineBanner');

  const menuCoinsVal = byId('menuCoinsVal')!;
  const garageCoinsVal = byId('garageCoinsVal')!;
  const hudSelectedVehicle = byId('hudSelectedVehicle')!;
  const hudSelectedTrack = byId('hudSelectedTrack')!;
  const circuitGrid = byId('circuitGrid')!;

  const installAppBtn = byId<HTMLButtonElement>('installAppBtn');
  const installAppLabel = byId('installAppLabel');
  const menuMuteBtn = byId<HTMLButtonElement>('menuMuteBtn');
  const menuMuteIcon = byId('menuMuteIcon')!;
  const startRaceBtn = byId<HTMLButtonElement>('startRaceBtn');
  const openGarageBtn = byId<HTMLButtonElement>('openGarageBtn');
  const closeGarageBtn = byId<HTMLButtonElement>('closeGarageBtn');

  const garageVehicleList = byId('garageVehicleList')!;
  const garagePreviewCanvas = byId<HTMLCanvasElement>('garagePreviewCanvas')!;
  const garageVehName = byId('garageVehName')!;
  const garageVehTagline = byId('garageVehTagline')!;
  const garageActionBtn = byId<HTMLButtonElement>('garageActionBtn');
  const garageUnderglowRow = byId('garageUnderglowRow')!;
  const garageStatRows = byId('garageStatRows')!;

  const hudPosVal = byId('hudPosVal')!;
  const hudLapVal = byId('hudLapVal')!;
  const hudTimeVal = byId('hudTimeVal')!;
  const hudSpeedVal = byId('hudSpeedVal')!;
  const hudGearVal = byId('hudGearVal');
  const hudDriftBadge = byId('hudDriftBadge');
  const speedoArc = byId('speedoArc');
  const nitroArc = byId('nitroArc');
  const hudPowerupSlot = byId<HTMLButtonElement>('hudPowerupSlot');
  const hudPowerupIcon = byId('hudPowerupIcon')!;
  const hudPowerupName = byId('hudPowerupName')!;
  const hudCameraBtn = byId<HTMLButtonElement>('hudCameraBtn');
  const hudCamLabel = byId('hudCamLabel');
  const hudMuteBtn = byId<HTMLButtonElement>('hudMuteBtn');
  const hudMuteIcon = byId('hudMuteIcon')!;
  const hudRestartBtn = byId<HTMLButtonElement>('hudRestartBtn');
  const hudPauseBtn = byId<HTMLButtonElement>('hudPauseBtn');

  const pauseTrackLabel = byId('pauseTrackLabel')!;
  const resumeBtn = byId<HTMLButtonElement>('resumeBtn');
  const pauseRestartBtn = byId<HTMLButtonElement>('pauseRestartBtn');
  const pauseMenuBtn = byId<HTMLButtonElement>('pauseMenuBtn');

  const resultsHeadline = byId('resultsHeadline')!;
  const resTotalTime = byId('resTotalTime')!;
  const resBestLap = byId('resBestLap')!;
  const resCoinsEarned = byId('resCoinsEarned')!;
  const resStandings = byId('resStandings')!;
  const playAgainBtn = byId<HTMLButtonElement>('playAgainBtn');
  const resGarageBtn = byId<HTMLButtonElement>('resGarageBtn');
  const resMenuBtn = byId<HTMLButtonElement>('resMenuBtn');

  const closeIosInstallBtn = byId<HTMLButtonElement>('closeIosInstallBtn');
  const okIosInstallBtn = byId<HTMLButtonElement>('okIosInstallBtn');

  const joystickZone = byId('joystickZone');
  const joystickKnob = byId('joystickKnob');
  const joyDirLeft = byId('joyDirLeft');
  const joyDirRight = byId('joyDirRight');
  const touchGasBtn = byId<HTMLButtonElement>('touchGasBtn');
  const touchBrakeBtn = byId<HTMLButtonElement>('touchBrakeBtn');
  const touchBoostBtn = byId<HTMLButtonElement>('touchBoostBtn');

  let saveData = loadSaveData();
  const sound = new SoundEngine(saveData.muted);
  const renderer = new HydroSceneRenderer(webglMount, fxOverlayCanvas, minimapCanvas);

  let gameState: GameState = 'title';
  let cameraMode: CameraMode = 'chase';
  let currentTrack: CompiledTrack = getTrackById(saveData.selectedTrackId);
  let garageInspectId = saveData.selectedVehicleId;

  let racers: RacerRuntime[] = [];
  let projectiles: ProjectileRuntime[] = [];
  let mines: MineRuntime[] = [];
  let shockwaves: ShockwaveRuntime[] = [];
  let inkSplatters: InkRuntime[] = [];
  let cannonPrevFracs: number[] = [];
  const particles: ParticleSlot[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    size: 0.2,
    life: 0,
    maxLife: 1,
    colorHex: 0xffffff,
  }));
  let particleCursor = 0;

  let simTime = 0;
  let raceTime = 0;
  let countdown = 3.2;
  let lastCountdownNum = 4;
  let bannerTimer = 0;
  let screenShake = 0;
  let hullSoundCooldown = 0;
  let lightningFlash = 0;
  let boostKick = 0;
  let landingCompress = 0;
  let waterSplashIntensity = 0;
  let lastPlayerSteer = 0;

  // Input state
  const keys = new Set<string>();
  let joyPointerId: number | null = null;
  let joySteer = 0;
  let touchGas = false;
  let touchBrake = false;

  // Render loop timer handles for clean shutdown
  let rafId = 0;
  let timerId = 0;
  let lastFrameNow = performance.now();

  // PWA Install Prompt
  let deferredInstallPrompt: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  function updateInstallButtonVisibility(): void {
    if (isStandalone) {
      installAppBtn?.classList.add('hidden');
      return;
    }
    if (deferredInstallPrompt || isIos) {
      installAppBtn?.classList.remove('hidden');
      if (installAppLabel) {
        installAppLabel.textContent = isIos ? 'Instalar en iPhone' : 'Instalar App';
      }
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as unknown as typeof deferredInstallPrompt;
    updateInstallButtonVisibility();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installAppBtn?.classList.add('hidden');
  });

  installAppBtn?.addEventListener('click', async () => {
    sound.unlock();
    if (deferredInstallPrompt) {
      await deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      installAppBtn.classList.add('hidden');
    } else if (isIos) {
      iosInstallModal?.classList.remove('hidden');
    }
    installAppBtn.blur();
  });

  closeIosInstallBtn?.addEventListener('click', () => iosInstallModal?.classList.add('hidden'));
  okIosInstallBtn?.addEventListener('click', () => iosInstallModal?.classList.add('hidden'));

  function syncOfflineBanner(): void {
    if (!offlineBanner) return;
    if (navigator.onLine) offlineBanner.classList.add('hidden');
    else offlineBanner.classList.remove('hidden');
  }
  window.addEventListener('online', syncOfflineBanner);
  window.addEventListener('offline', syncOfflineBanner);
  syncOfflineBanner();
  updateInstallButtonVisibility();

  function syncStateAttr(state: GameState): void {
    gameState = state;
    document.body.dataset.state = state;
    document.body.dataset.cam = cameraMode;
  }

  function syncCameraButtonUi(): void {
    document.body.dataset.cam = cameraMode;
    hudCameraBtn?.classList.toggle('cam-pov', cameraMode === 'hood');
    hudCameraBtn?.setAttribute('aria-pressed', String(cameraMode === 'hood'));
    if (hudCamLabel) {
      hudCamLabel.textContent = cameraMode === 'hood' ? 'CAM: POV' : 'CAM: NFS';
    }
  }

  function renderCurrentFrame(dt = 0.016): void {
    renderer.render({
      gameState,
      cameraMode,
      track: currentTrack,
      racers,
      particles,
      projectiles,
      mines,
      shockwaves,
      inkSplatters,
      simTime,
      dt,
      steerInput: lastPlayerSteer,
      screenShake,
      lightningFlash,
      boostKick,
      landingCompress,
      waterSplashIntensity,
      playerUnderglow: saveData.selectedUnderglowColor,
    });
  }

  function toggleCameraMode(): void {
    cameraMode = cameraMode === 'chase' ? 'hood' : 'chase';
    syncCameraButtonUi();
    if (gameState === 'playing') {
      showBanner(
        cameraMode === 'hood' ? 'CÁMARA DE CAPÓ (POV)' : 'CÁMARA BAJA NFS',
        cameraMode === 'hood' ? 'Proa a ras del agua' : 'Persecución dinámica',
        0.9
      );
      renderCurrentFrame(0.016);
    }
  }

  function isMobileViewportOrTouch(): boolean {
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth <= 920
    );
  }

  function updateTouchControlsVisibility(): void {
    if (gameState === 'playing' && isMobileViewportOrTouch()) {
      touchControls.classList.remove('hidden');
    } else {
      touchControls.classList.add('hidden');
    }
  }

  function showBanner(big: string, sub = '', duration = 1.6): void {
    bannerBig.textContent = big;
    if (sub) {
      bannerSub.textContent = sub;
      bannerSub.classList.remove('hidden');
    } else {
      bannerSub.classList.add('hidden');
    }
    raceBanner.classList.remove('hidden');
    bannerTimer = duration;
  }

  function spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    maxLife: number,
    colorHex: number
  ): void {
    const slot = particles[particleCursor];
    particleCursor = (particleCursor + 1) % MAX_PARTICLES;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = vx;
    slot.vy = vy;
    slot.vz = vz;
    slot.size = size;
    slot.life = maxLife;
    slot.maxLife = maxLife;
    slot.colorHex = colorHex;
  }

  function createRacer(idx: number, isPlayer: boolean): RacerRuntime {
    const sf = currentTrack.main[0];
    const col = idx % 2 === 0 ? -1 : 1;
    const backOffset = 48 + idx * 54;
    const sideOffset = col * Math.min(68, sf.halfWidth * 0.35);

    const startX = sf.x - sf.tx * backOffset + sf.nx * sideOffset;
    const startY = sf.y - sf.ty * backOffset + sf.ny * sideOffset;
    const startAngle = Math.atan2(sf.ty, sf.tx);

    if (isPlayer) {
      const veh = getVehicleById(saveData.selectedVehicleId);
      const stats = getEffectiveVehicleStats(veh, saveData.upgrades[veh.id]);
      return {
        idx,
        isPlayer: true,
        name: 'Tú (Pato As)',
        hullType: veh.hullType,
        primaryColor: veh.primaryColor,
        accentColor: veh.accentColor,
        scarfColor: veh.scarfColor,
        underglowColor: saveData.selectedUnderglowColor,
        x: startX,
        y: startY,
        vx: 0,
        vy: 0,
        angle: startAngle,
        speed: 0,
        lateralSlip: 0,
        lean: 0,
        groundZ: sf.z,
        groundSlope: sf.slope,
        airZ: sf.z,
        airVz: 0,
        gear: 1,
        rpmRatio: 0,
        driftCharge: 0,
        driftStage: 0,
        miniTurboTimer: 0,
        turboTimer: 0,
        nitroTimer: 0,
        shieldTimer: 0,
        magnetTimer: 0,
        mudTimer: 0,
        lightningTimer: 0,
        empTimer: 0,
        spinTimer: 0,
        spinVisual: 0,
        braking: false,
        accelerating: false,
        inTunnel: sf.tunnel !== null,
        stats,
        heldItem: null,
        cp: createCheckpointState(),
        finished: false,
        finishTime: 0,
        lapStartTime: 0,
        bestLapTime: Infinity,
        lapProgress: 0,
        aiSkill: 1,
        aiPrefLane: 'main',
        aiLaneOffset: 0,
        aiItemCooldown: 0,
        aiDecisionTimer: 0,
        aiTargetIdx: 4,
        laneId: 'main',
        coinsCollected: 0,
      };
    } else {
      const prof = AI_PROFILES[(idx - 1) % AI_PROFILES.length];
      const baseVeh = VEHICLES.find((v) => v.hullType === prof.hullType) ?? VEHICLES[0];
      const aiStats = {
        velocidadMax: baseVeh.baseStats.velocidadMax + 0.55,
        aceleracion: baseVeh.baseStats.aceleracion + 0.45,
        manejo: baseVeh.baseStats.manejo + 0.5,
        turbo: baseVeh.baseStats.turbo + 0.4,
      };
      return {
        idx,
        isPlayer: false,
        name: prof.name,
        hullType: prof.hullType,
        primaryColor: prof.primaryColor,
        accentColor: prof.accentColor,
        scarfColor: prof.scarfColor,
        underglowColor: prof.underglow,
        x: startX,
        y: startY,
        vx: 0,
        vy: 0,
        angle: startAngle,
        speed: 0,
        lateralSlip: 0,
        lean: 0,
        groundZ: sf.z,
        groundSlope: sf.slope,
        airZ: sf.z,
        airVz: 0,
        gear: 1,
        rpmRatio: 0,
        driftCharge: 0,
        driftStage: 0,
        miniTurboTimer: 0,
        turboTimer: 0,
        nitroTimer: 0,
        shieldTimer: 0,
        magnetTimer: 0,
        mudTimer: 0,
        lightningTimer: 0,
        empTimer: 0,
        spinTimer: 0,
        spinVisual: 0,
        braking: false,
        accelerating: false,
        inTunnel: sf.tunnel !== null,
        stats: aiStats,
        heldItem: null,
        cp: createCheckpointState(),
        finished: false,
        finishTime: 0,
        lapStartTime: 0,
        bestLapTime: Infinity,
        lapProgress: 0,
        aiSkill: prof.skill,
        aiPrefLane: 'main',
        aiLaneOffset: ((idx % 3) - 1) * 42,
        aiItemCooldown: 2 + idx * 0.6,
        aiDecisionTimer: 0,
        aiTargetIdx: 4,
        laneId: 'main',
        coinsCollected: 0,
      };
    }
  }

  function resetTrackPickups(): void {
    for (const box of currentTrack.powerBoxes) box.respawn = 0;
    for (const coin of currentTrack.coins) coin.respawn = 0;
    for (const ob of currentTrack.obstacles) {
      if (ob.baseX !== undefined) ob.x = ob.baseX;
      if (ob.baseY !== undefined) ob.y = ob.baseY;
      ob.brokenTimer = 0;
    }
    cannonPrevFracs = currentTrack.cannons.map((c) => ((simTime + c.phase) % c.period) / c.period);
  }

  function initAttractScene(): void {
    currentTrack = getTrackById(saveData.selectedTrackId);
    resetTrackPickups();
    renderer.setTrack(currentTrack);

    racers = Array.from({ length: 6 }, (_, i) => createRacer(i, i === 0));
    racers.forEach((r) => {
      r.speed = 360;
      r.vx = Math.cos(r.angle) * 360;
      r.vy = Math.sin(r.angle) * 360;
    });
    projectiles = [];
    mines = [];
    shockwaves = [];
    inkSplatters = [];
    particles.forEach((p) => (p.active = false));
    renderer.syncRacersMeshes(racers);
    renderer.resetChaseCam(racers[0].angle);
  }

  function refreshMuteIcons(): void {
    drawMuteSvg(menuMuteIcon, saveData.muted);
    drawMuteSvg(hudMuteIcon, saveData.muted);
  }

  function refreshMenuUI(): void {
    menuCoinsVal.textContent = String(saveData.coins);
    garageCoinsVal.textContent = String(saveData.coins);
    const veh = getVehicleById(saveData.selectedVehicleId);
    const trk = getTrackById(saveData.selectedTrackId);
    hudSelectedVehicle.textContent = veh.name;
    hudSelectedTrack.textContent = trk.name;
    refreshMuteIcons();
    renderCircuitGrid();
  }

  function renderCircuitGrid(): void {
    circuitGrid.innerHTML = '';
    COMPILED_TRACKS.forEach((trk) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `circuit-card${trk.id === saveData.selectedTrackId ? ' active' : ''}`;
      const best = saveData.bestTimes[trk.id];
      const bestTxt = best ? `Récord ${formatTime(best)}` : `${trk.branches.length} atajos`;
      card.innerHTML = `
        <div class="circuit-card-top">
          <span class="circuit-name">${trk.name}</span>
          <span class="circuit-swatch" style="background:${trk.swatch};"></span>
        </div>
        <div class="circuit-meta">${trk.subtitle} · <strong>${bestTxt}</strong></div>
      `;
      card.addEventListener('click', () => {
        sound.unlock();
        saveData.selectedTrackId = trk.id;
        persistSaveData(saveData);
        refreshMenuUI();
        if (gameState === 'title') {
          initAttractScene();
        }
        card.blur();
      });
      circuitGrid.appendChild(card);
    });
  }

  function drawGaragePreview(): void {
    const ctx = garagePreviewCanvas.getContext('2d');
    if (!ctx) return;
    const w = garagePreviewCanvas.width;
    const h = garagePreviewCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Nocturnal dock preview backdrop
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.55, 8, w * 0.5, h * 0.55, w * 0.65);
    bg.addColorStop(0, '#0c3559');
    bg.addColorStop(1, '#040d1c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Selected Neon Underglow Aura
    const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.54, 6, w * 0.5, h * 0.54, 72);
    glowGrad.addColorStop(0, saveData.selectedUnderglowColor);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const veh = getVehicleById(garageInspectId);
    ctx.save();
    ctx.translate(w * 0.5, h * 0.52);

    // Craft silhouette
    ctx.fillStyle = veh.primaryColor;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (veh.hullType === 'jetski') {
      ctx.moveTo(56, 0);
      ctx.lineTo(14, -22);
      ctx.lineTo(-48, -18);
      ctx.lineTo(-48, 18);
      ctx.lineTo(14, 22);
    } else if (veh.hullType === 'speedboat') {
      ctx.moveTo(64, 0);
      ctx.lineTo(16, -28);
      ctx.lineTo(-54, -24);
      ctx.lineTo(-54, 24);
      ctx.lineTo(16, 28);
    } else if (veh.hullType === 'yacht') {
      ctx.moveTo(60, 0);
      ctx.lineTo(28, -32);
      ctx.lineTo(-52, -30);
      ctx.lineTo(-52, 30);
      ctx.lineTo(28, 32);
    } else if (veh.hullType === 'bathtub') {
      ctx.roundRect(-50, -28, 100, 56, 18);
    } else {
      ctx.ellipse(0, 0, 54, 34, 0, 0, Math.PI * 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Accent racing stripe
    ctx.fillStyle = veh.accentColor;
    ctx.fillRect(-26, -7, 64, 14);

    // Duck pilot helmet + goggles
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(-4, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.ellipse(12, 0, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, -10, 7, 7);
    ctx.fillRect(0, 3, 7, 7);
    ctx.restore();
  }

  function renderGarage(): void {
    garageCoinsVal.textContent = String(saveData.coins);
    menuCoinsVal.textContent = String(saveData.coins);

    garageVehicleList.innerHTML = '';
    VEHICLES.forEach((v) => {
      const unlocked = saveData.unlockedVehicles.includes(v.id);
      const selected = saveData.selectedVehicleId === v.id;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `vehicle-item${garageInspectId === v.id ? ' active' : ''}`;
      item.innerHTML = `
        <div>
          <div class="vehicle-item-name">${v.name}</div>
          <div class="vehicle-item-sub">${
            selected ? 'Equipado' : unlocked ? 'Desbloqueado' : `${v.unlockCost} Patocoins`
          }</div>
        </div>
        <span style="width:16px;height:16px;border-radius:4px;background:${v.primaryColor};border:2px solid ${v.accentColor};flex-shrink:0;"></span>
      `;
      item.addEventListener('click', () => {
        sound.unlock();
        garageInspectId = v.id;
        renderGarage();
        item.blur();
      });
      garageVehicleList.appendChild(item);
    });

    const veh = getVehicleById(garageInspectId);
    const unlocked = saveData.unlockedVehicles.includes(veh.id);
    const selected = saveData.selectedVehicleId === veh.id;

    garageVehName.textContent = veh.name;
    garageVehTagline.textContent = veh.tagline;

    if (garageActionBtn) {
      if (selected) {
        garageActionBtn.textContent = 'Equipado';
        garageActionBtn.disabled = true;
      } else if (unlocked) {
        garageActionBtn.textContent = 'Equipar';
        garageActionBtn.disabled = false;
      } else {
        garageActionBtn.textContent = `Desbloquear (${veh.unlockCost})`;
        garageActionBtn.disabled = saveData.coins < veh.unlockCost;
      }
    }

    // Underglow Swatches
    garageUnderglowRow.innerHTML = '';
    UNDERGLOW_PRESETS.forEach((preset) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.title = preset.name;
      sw.setAttribute('aria-label', preset.name);
      sw.className = `underglow-swatch${saveData.selectedUnderglowColor === preset.hex ? ' active' : ''}`;
      sw.style.background = preset.hex;
      sw.style.boxShadow =
        saveData.selectedUnderglowColor === preset.hex ? `0 0 12px ${preset.hex}` : 'none';
      sw.addEventListener('click', () => {
        sound.unlock();
        saveData.selectedUnderglowColor = preset.hex;
        persistSaveData(saveData);
        renderer.updatePlayerUnderglow(preset.hex);
        if (racers[0]) racers[0].underglowColor = preset.hex;
        renderGarage();
        sw.blur();
      });
      garageUnderglowRow.appendChild(sw);
    });

    // Upgrades
    const lv = saveData.upgrades[veh.id] ?? { velocidadMax: 1, aceleracion: 1, manejo: 1, turbo: 1 };
    const statDefs: { key: keyof UpgradeLevels; label: string; base: number }[] = [
      { key: 'velocidadMax', label: 'Velocidad Máx.', base: veh.baseStats.velocidadMax },
      { key: 'aceleracion', label: 'Aceleración', base: veh.baseStats.aceleracion },
      { key: 'manejo', label: 'Manejo / Drift', base: veh.baseStats.manejo },
      { key: 'turbo', label: 'Nitro / Turbo', base: veh.baseStats.turbo },
    ];

    garageStatRows.innerHTML = '';
    statDefs.forEach((sd) => {
      const curLv = lv[sd.key];
      const cost = getUpgradeCost(curLv);
      const basePips = Math.round((sd.base / 10) * 6);
      const upPips = curLv - 1;
      const totalPips = 10;

      let pipsHtml = '';
      for (let i = 0; i < totalPips; i++) {
        const cls = i < basePips ? 'filled' : i < basePips + upPips ? 'upgraded' : '';
        pipsHtml += `<span class="stat-pip ${cls}"></span>`;
      }

      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = `
        <span class="stat-label">${sd.label}</span>
        <div class="stat-pips">${pipsHtml}</div>
        <button class="btn-upgrade" type="button" ${
          !unlocked || curLv >= MAX_UPGRADE_LEVEL || saveData.coins < cost ? 'disabled' : ''
        }>${curLv >= MAX_UPGRADE_LEVEL ? 'MÁX' : `Mejorar (${cost})`}</button>
      `;

      const btn = row.querySelector('button');
      btn?.addEventListener('click', () => {
        sound.unlock();
        if (!unlocked || curLv >= MAX_UPGRADE_LEVEL || saveData.coins < cost) return;
        saveData.coins -= cost;
        saveData.upgrades[veh.id][sd.key] = curLv + 1;
        persistSaveData(saveData);
        sound.playPickup();
        renderGarage();
        btn.blur();
      });
      garageStatRows.appendChild(row);
    });

    drawGaragePreview();
  }

  garageActionBtn?.addEventListener('click', () => {
    sound.unlock();
    const veh = getVehicleById(garageInspectId);
    const unlocked = saveData.unlockedVehicles.includes(veh.id);
    if (unlocked) {
      saveData.selectedVehicleId = veh.id;
      persistSaveData(saveData);
      sound.playPickup();
      if (gameState === 'title') initAttractScene();
      refreshMenuUI();
      renderGarage();
    } else if (saveData.coins >= veh.unlockCost) {
      saveData.coins -= veh.unlockCost;
      saveData.unlockedVehicles.push(veh.id);
      saveData.selectedVehicleId = veh.id;
      persistSaveData(saveData);
      sound.playLap();
      if (gameState === 'title') initAttractScene();
      refreshMenuUI();
      renderGarage();
    }
    garageActionBtn.blur();
  });

  openGarageBtn?.addEventListener('click', () => {
    sound.unlock();
    garageInspectId = saveData.selectedVehicleId;
    renderGarage();
    garageModal.classList.remove('hidden');
    openGarageBtn.blur();
  });

  closeGarageBtn?.addEventListener('click', () => {
    garageModal.classList.add('hidden');
    refreshMenuUI();
    closeGarageBtn.blur();
  });

  function updatePowerupHud(item: PowerUpType | null): void {
    drawPowerUpSvg(hudPowerupIcon, item);
    if (item) {
      const meta = POWERUP_META[item];
      hudPowerupName.textContent = meta.name;
      hudPowerupSlot?.classList.add('ready');
      touchBoostBtn?.classList.add('ready');
    } else {
      hudPowerupName.textContent = 'Sin Objeto';
      hudPowerupSlot?.classList.remove('ready');
      touchBoostBtn?.classList.remove('ready');
    }
  }

  function startRace(fromUserGesture = true): void {
    if (fromUserGesture) sound.unlock();
    currentTrack = getTrackById(saveData.selectedTrackId);
    resetTrackPickups();
    renderer.setTrack(currentTrack);

    racers = Array.from({ length: 6 }, (_, i) => createRacer(i, i === 0));
    projectiles = [];
    mines = [];
    shockwaves = [];
    inkSplatters = [];
    particles.forEach((p) => (p.active = false));

    renderer.syncRacersMeshes(racers);
    renderer.resetChaseCam(racers[0].angle);

    raceTime = 0;
    countdown = 1.8;
    lastCountdownNum = 4;
    screenShake = 0;
    lightningFlash = 0;
    boostKick = 0;
    landingCompress = 0;
    waterSplashIntensity = 0;

    titleScreen.classList.add('hidden');
    garageModal.classList.add('hidden');
    pauseModal.classList.add('hidden');
    resultsModal.classList.add('hidden');
    hudLayer.classList.remove('hidden');
    wrongWayBanner.classList.add('hidden');
    torpedoAlert?.classList.add('hidden');

    syncStateAttr('playing');
    syncCameraButtonUi();
    updateTouchControlsVisibility();
    updatePowerupHud(null);
    sound.setTunnelEffect(false);
    showBanner('3', currentTrack.name, 1.0);
    sound.playCountdown(false);
    refreshMuteIcons();
    renderCurrentFrame(0.016);
  }

  function togglePause(): void {
    if (gameState === 'playing') {
      syncStateAttr('paused');
      pauseTrackLabel.textContent = `${currentTrack.name} · Vuelta ${Math.min(TOTAL_LAPS, racers[0]?.cp.lap || 1)} / ${TOTAL_LAPS}`;
      pauseModal.classList.remove('hidden');
      touchControls.classList.add('hidden');
      torpedoAlert?.classList.add('hidden');
      sound.updateEngine(0, 0, 1, false, false, false);
    } else if (gameState === 'paused') {
      syncStateAttr('playing');
      pauseModal.classList.add('hidden');
      updateTouchControlsVisibility();
    }
  }

  function returnToTitle(): void {
    syncStateAttr('title');
    sound.updateEngine(0, 0, 1, false, false, false);
    sound.setTunnelEffect(false);
    hudLayer.classList.add('hidden');
    pauseModal.classList.add('hidden');
    resultsModal.classList.add('hidden');
    raceBanner.classList.add('hidden');
    wrongWayBanner.classList.add('hidden');
    torpedoAlert?.classList.add('hidden');
    touchControls.classList.add('hidden');
    titleScreen.classList.remove('hidden');
    initAttractScene();
    refreshMenuUI();
  }

  function activatePowerUp(r: RacerRuntime): void {
    const item = r.heldItem;
    if (!item || r.finished) return;
    r.heldItem = null;
    if (r.isPlayer) updatePowerupHud(null);

    if (item === 'turbo') {
      r.turboTimer = 2.5 + r.stats.turbo * 0.14;
      if (r.isPlayer) {
        boostKick = 1.0;
        sound.playTurbo();
        showBanner('¡TURBO COHETE!', 'Velocidad máxima', 1.1);
      }
      for (let i = 0; i < 16; i++) {
        spawnParticle(r.x, r.y, r.airZ * 0.05 + 0.5, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, 2, 0.36, 0.55, 0xf97316);
      }
    } else if (item === 'nitro_overdrive') {
      r.nitroTimer = 3.5 + r.stats.turbo * 0.12;
      if (r.isPlayer) {
        boostKick = 1.25;
        sound.playNitroOverdrive();
        screenShake = Math.max(screenShake, 0.55);
        showBanner('¡NITRO PLASMA!', 'Sobremarcha extrema FOV 90°', 1.25);
      }
      for (let i = 0; i < 20; i++) {
        spawnParticle(r.x, r.y, r.airZ * 0.05 + 0.55, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, 3, 0.42, 0.65, 0xe879f9);
      }
    } else if (item === 'shield') {
      r.shieldTimer = 6.0;
      if (r.isPlayer) {
        sound.playShield();
        showBanner('¡ESCUDO ACTIVO!', 'Protección total 6s', 1.1);
      }
    } else if (item === 'wave') {
      shockwaves.push({
        x: r.x,
        y: r.y,
        z: r.groundZ,
        r: 24,
        maxR: 340,
        color: '#22d3ee',
        ownerIdx: r.idx,
        hitIndices: new Set(),
        isEmp: false,
      });
      if (r.isPlayer) {
        sound.playWave();
        screenShake = Math.max(screenShake, 0.45);
        showBanner('¡OLA GIGANTE!', 'Empujón expansivo', 1.1);
      }
    } else if (item === 'emp_pulse') {
      shockwaves.push({
        x: r.x,
        y: r.y,
        z: r.groundZ,
        r: 28,
        maxR: 420,
        color: '#a855f7',
        ownerIdx: r.idx,
        hitIndices: new Set(),
        isEmp: true,
      });
      if (r.isPlayer) {
        saveData.coins += 25;
        r.coinsCollected += 25;
        persistSaveData(saveData);
        sound.playEmp();
        screenShake = Math.max(screenShake, 0.5);
        showBanner('¡PULSO EMP!', '+25 Patocoins robados', 1.2);
      }
    } else if (item === 'coin_magnet') {
      r.magnetTimer = 7.0;
      if (r.isPlayer) {
        saveData.coins += 30;
        r.coinsCollected += 30;
        persistSaveData(saveData);
        sound.playMagnet();
        showBanner('¡IMÁN DORADO!', '+30 Patocoins · Atracción 7s', 1.2);
      }
    } else if (item === 'missile') {
      const sorted = [...racers].sort((a, b) => b.lapProgress - a.lapProgress);
      const myPos = sorted.indexOf(r);
      const target = myPos > 0 ? sorted[myPos - 1] : sorted[1] ?? sorted[sorted.length - 1];
      projectiles.push({
        x: r.x + Math.cos(r.angle) * 42,
        y: r.y + Math.sin(r.angle) * 42,
        z: r.airZ + 8,
        vx: Math.cos(r.angle) * 920,
        vy: Math.sin(r.angle) * 920,
        vz: 0,
        angle: r.angle,
        ownerIdx: r.idx,
        targetIdx: target && target !== r ? target.idx : -1,
        life: 4.5,
      });
      if (r.isPlayer) {
        sound.playMissile();
        showBanner('¡MISIL PATO!', `Objetivo: ${target?.name ?? 'Al frente'}`, 1.0);
      } else if (target?.isPlayer) {
        sound.playMissile();
        sound.playIncomingWarning();
      }
    } else if (item === 'lightning') {
      lightningFlash = 1.0;
      let playerStruck = false;
      racers.forEach((other) => {
        if (other !== r && other.shieldTimer <= 0) {
          other.lightningTimer = 2.5;
          other.vx *= 0.56;
          other.vy *= 0.56;
          if (other.isPlayer) playerStruck = true;
        }
      });
      if (r.isPlayer) {
        sound.playLightning();
        screenShake = Math.max(screenShake, 0.55);
        showBanner('¡TORMENTA DE RAYOS!', 'Rivales encogidos 2.5s', 1.15);
      } else if (playerStruck) {
        sound.playLightning();
        sound.playIncomingWarning();
        screenShake = Math.max(screenShake, 0.65);
        showBanner('¡CUIDADO! RAYO ENTRANTE', `${r.name} te ha encogido`, 1.55);
      }
    } else if (item === 'squid_ink') {
      const player = racers[0];
      if (r.isPlayer) {
        sound.playInkSplatter();
        showBanner('¡TINTA DE CALAMAR!', 'Visibilidad rival bloqueada', 1.15);
        racers.forEach((other) => {
          if (other !== r && other.shieldTimer <= 0) {
            other.empTimer = Math.max(other.empTimer, 1.4);
          }
        });
      } else if (player && player.shieldTimer <= 0) {
        sound.playInkSplatter();
        for (let k = 0; k < 7; k++) {
          inkSplatters.push({
            x: 0.14 + Math.random() * 0.72,
            y: 0.14 + Math.random() * 0.68,
            r: 0.08 + Math.random() * 0.08,
            alpha: 0.92,
            life: 4.2,
            maxLife: 4.2,
          });
        }
        showBanner('¡TINTA DE CALAMAR!', `${r.name} manchó tu pantalla`, 1.35);
      }
    } else if (item === 'mine') {
      mines.push({
        x: r.x - Math.cos(r.angle) * 44,
        y: r.y - Math.sin(r.angle) * 44,
        z: r.groundZ * 0.05,
        ownerIdx: r.idx,
        armDelay: 0.55,
        life: 24,
      });
      if (r.isPlayer) {
        sound.playBump();
        showBanner('¡BOYA MINA!', 'Mina explosiva soltada atrás', 1.0);
      }
    }
  }

  function finishRace(): void {
    syncStateAttr('gameover');
    sound.updateEngine(0, 0, 1, false, false, false);
    sound.setTunnelEffect(false);
    sound.playVictory();
    touchControls.classList.add('hidden');
    hudLayer.classList.add('hidden');
    wrongWayBanner.classList.add('hidden');
    torpedoAlert?.classList.add('hidden');

    const sorted = [...racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.lapProgress - a.lapProgress;
    });

    const player = racers[0];
    const place = sorted.indexOf(player) + 1;
    const trackIdx = COMPILED_TRACKS.indexOf(currentTrack);
    const reward = calculateRaceReward(place, Math.max(0, trackIdx));

    saveData.coins += reward;
    const prevBest = saveData.bestTimes[currentTrack.id];
    if (!prevBest || player.finishTime < prevBest) {
      saveData.bestTimes[currentTrack.id] = Number(player.finishTime.toFixed(2));
    }
    persistSaveData(saveData);

    const medalLabels = [
      '¡1.º Lugar — Podio de Oro!',
      '¡2.º Lugar — Podio de Plata!',
      '¡3.º Lugar — Podio de Bronce!',
      `${place}.º Lugar — Gran Carrera`,
      `${place}.º Lugar — Sigue Mejorando`,
      `${place}.º Lugar — Revancha en Camino`,
    ];
    resultsHeadline.textContent = medalLabels[Math.min(5, place - 1)];
    resTotalTime.textContent = formatTime(player.finishTime);
    resBestLap.textContent = Number.isFinite(player.bestLapTime) ? formatTime(player.bestLapTime) : formatTime(player.finishTime / TOTAL_LAPS);
    resCoinsEarned.textContent = `+${reward + player.coinsCollected}`;

    resStandings.innerHTML = '';
    sorted.forEach((r, idx) => {
      const row = document.createElement('div');
      row.className = `standing-row${r.isPlayer ? ' player' : ''}`;
      const timeStr = r.finished ? formatTime(r.finishTime) : `${Math.min(TOTAL_LAPS, r.cp.lap)}/${TOTAL_LAPS} v`;
      row.innerHTML = `<span>${idx + 1}.º ${r.name}</span><span class="tabular">${timeStr}</span>`;
      resStandings.appendChild(row);
    });

    resultsModal.classList.remove('hidden');
  }

  function stepSimulation(dt: number): void {
    simTime += dt;
    screenShake = Math.max(0, screenShake - dt * 1.9);
    hullSoundCooldown = Math.max(0, hullSoundCooldown - dt);
    lightningFlash = Math.max(0, lightningFlash - dt * 2.8);
    boostKick = Math.max(0, boostKick - dt * 2.6);
    landingCompress = Math.max(0, landingCompress - dt * 3.4);
    waterSplashIntensity = Math.max(0, waterSplashIntensity - dt * 1.6);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z = Math.max(0.05, p.z + p.vz * dt);
      p.vz -= 4.5 * dt;
    }

    // Attract mode autopilot on Title screen
    if (gameState === 'title') {
      racers.forEach((r) => {
        const nearest = findNearestSample(currentTrack, r.x, r.y, r.laneId, r.groundZ, r.cp.lastS);
        const target = nearest.arr[(nearest.idx + 5) % nearest.arr.length];
        const desiredAngle = Math.atan2(target.y - r.y, target.x - r.x);
        const diff = normalizeAngle(desiredAngle - r.angle);
        const steer = Math.max(-1, Math.min(1, diff * 2.5));
        const res = stepCraftPhysics({
          vx: r.vx,
          vy: r.vy,
          angle: r.angle,
          throttle: 0.72,
          steer,
          stats: r.stats,
          turboTimer: 0,
          mudTimer: 0,
          onBoostCurrent: false,
          lightningSlowTimer: 0,
          groundSlope: nearest.sample.slope,
          prevGear: r.gear,
          dt,
        });
        r.vx = res.vx;
        r.vy = res.vy;
        r.angle = res.angle;
        r.speed = res.speed;
        r.lateralSlip = res.lateralSlip;
        r.gear = res.gear;
        r.rpmRatio = res.rpmRatio;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.lean += (steer - r.lean) * (1 - Math.exp(-8 * dt));
        const post = findNearestSample(currentTrack, r.x, r.y, r.laneId, r.groundZ, r.cp.lastS);
        r.cp.lastS = post.sample.s;
        r.groundZ = post.sample.z;
        r.groundSlope = post.sample.slope;
        r.airZ = post.sample.z;
        r.inTunnel = post.sample.tunnel !== null;
      });
      for (let i = 0; i < racers.length; i++) {
        for (let j = i + 1; j < racers.length; j++) {
          resolveVehicleCollision(racers[i], racers[j]);
        }
      }
      return;
    }

    if (gameState !== 'playing') return;

    if (countdown > 0) {
      countdown -= dt;
      const n = Math.ceil((countdown / 1.8) * 3);
      if (n !== lastCountdownNum && n >= 1 && n <= 3) {
        lastCountdownNum = n;
        showBanner(String(n), currentTrack.name, 0.65);
        sound.playCountdown(false);
      }
      if (countdown <= 0) {
        countdown = 0;
        showBanner('¡YA!', '¡Acelera a fondo!', 0.85);
        sound.playCountdown(true);
      }
    } else {
      raceTime += dt;
    }

    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) raceBanner.classList.add('hidden');
    }

    for (const box of currentTrack.powerBoxes) {
      if (box.respawn > 0) box.respawn = Math.max(0, box.respawn - dt);
    }
    for (const coin of currentTrack.coins) {
      if (coin.respawn > 0) coin.respawn = Math.max(0, coin.respawn - dt);
    }

    for (const ob of currentTrack.obstacles) {
      if (ob.brokenTimer && ob.brokenTimer > 0) {
        ob.brokenTimer = Math.max(0, ob.brokenTimer - dt);
      }
      if (ob.kind === 'croc' && ob.baseX !== undefined && ob.baseY !== undefined) {
        ob.x = ob.baseX + Math.cos(simTime * 1.4 + ob.phase) * 32;
        ob.y = ob.baseY + Math.sin(simTime * 1.4 + ob.phase) * 20;
      } else if (ob.kind === 'log' && ob.baseX !== undefined && ob.baseY !== undefined && ob.tx !== undefined && ob.ty !== undefined) {
        const swing = Math.sin(simTime * 1.1 + ob.phase) * 34;
        ob.x = ob.baseX + ob.tx * swing;
        ob.y = ob.baseY + ob.ty * swing;
      } else if (ob.kind === 'boulder' && ob.baseX !== undefined && ob.baseY !== undefined && ob.tx !== undefined && ob.ty !== undefined) {
        const swing = Math.sin(simTime * 1.7 + ob.phase) * (ob.sideSign ?? 120);
        ob.x = ob.baseX + ob.tx * swing;
        ob.y = ob.baseY + ob.ty * swing;
      }
    }

    // Pirate Cove Cannonball Impact Splash Check
    for (let ci = 0; ci < currentTrack.cannons.length; ci++) {
      const c = currentTrack.cannons[ci];
      const frac = ((simTime + c.phase) % c.period) / c.period;
      const prevFrac = cannonPrevFracs[ci] ?? frac;
      cannonPrevFracs[ci] = frac;
      if (frac >= 0.72 && prevFrac < 0.72) {
        const p0 = racers[0];
        if (p0 && Math.hypot(p0.x - c.tx, p0.y - c.ty) < 620) {
          sound.playCannonBlast();
        }
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          spawnParticle(c.tx, c.ty, c.tz * 0.05 + 0.4, Math.cos(a) * 140, Math.sin(a) * 140, 5.2, 0.36, 0.55, 0xfacc15);
        }
        for (const r of racers) {
          if (r.shieldTimer <= 0 && Math.abs(r.airZ - c.tz) < 28 && Math.hypot(r.x - c.tx, r.y - c.ty) < 56) {
            r.spinTimer = Math.max(r.spinTimer, 1.0);
            r.vx *= 0.45;
            r.vy *= 0.45;
            if (r.isPlayer) {
              sound.playBump();
              screenShake = Math.max(screenShake, 0.65);
            }
          }
        }
      }
    }

    // Update Squid Ink Blot Fade
    for (let i = inkSplatters.length - 1; i >= 0; i--) {
      const ink = inkSplatters[i];
      ink.life -= dt;
      ink.alpha = Math.max(0, Math.min(0.92, (ink.life / ink.maxLife) * 1.35));
      if (ink.life <= 0) inkSplatters.splice(i, 1);
    }

    const sortedRanks = [...racers].sort((a, b) => b.lapProgress - a.lapProgress);
    const leaderProgress = sortedRanks[0]?.lapProgress ?? 0;
    const playerProgress = racers[0]?.lapProgress ?? 0;

    for (const r of racers) {
      r.turboTimer = Math.max(0, r.turboTimer - dt);
      r.nitroTimer = Math.max(0, r.nitroTimer - dt);
      r.miniTurboTimer = Math.max(0, r.miniTurboTimer - dt);
      r.shieldTimer = Math.max(0, r.shieldTimer - dt);
      r.magnetTimer = Math.max(0, r.magnetTimer - dt);
      r.mudTimer = Math.max(0, r.mudTimer - dt);
      r.lightningTimer = Math.max(0, r.lightningTimer - dt);
      r.empTimer = Math.max(0, r.empTimer - dt);

      if (r.spinTimer > 0) {
        r.spinTimer = Math.max(0, r.spinTimer - dt);
        r.spinVisual += dt * 14;
      } else {
        r.spinVisual *= Math.exp(-10 * dt);
      }

      const nearest = findNearestSample(currentTrack, r.x, r.y, r.laneId, r.groundZ, r.cp.lastS);
      r.laneId = nearest.sample.laneId;
      const waveOffset = computeWaveHeight(
        r.x,
        r.y,
        simTime,
        currentTrack.biome,
        nearest.sample.surface,
        nearest.sample.tunnel !== null
      );
      r.groundZ = nearest.sample.z + waveOffset;
      r.groundSlope = nearest.sample.slope;
      r.inTunnel = nearest.sample.tunnel !== null;

      if (r.airZ > r.groundZ + 0.5 || r.airVz !== 0) {
        r.airZ += r.airVz * dt;
        r.airVz -= 560 * dt;
        if (r.airZ <= r.groundZ) {
          r.airZ = r.groundZ;
          r.airVz = 0;
          if (r.isPlayer) {
            sound.playSplash(true);
            landingCompress = 1.0;
            waterSplashIntensity = 1.0;
          }
          for (let k = 0; k < 10; k++) {
            const a = (k / 10) * Math.PI * 2;
            spawnParticle(
              r.x,
              r.y,
              r.groundZ * 0.05 + 0.2,
              Math.cos(a) * 120,
              Math.sin(a) * 120,
              3.5,
              0.35,
              0.45,
              0xbae6fd
            );
          }
        }
      } else {
        r.airZ = r.groundZ;
      }

      const isAirborne = r.airZ > r.groundZ + 6;
      const onBoostCurrent = nearest.sample.surface === 'boost_current' && !isAirborne;
      const onIce = nearest.sample.surface === 'ice_water' && !isAirborne;

      let throttle = 0;
      let steer = 0;

      if (countdown <= 0 && !r.finished) {
        if (r.isPlayer) {
          const up = keys.has('ArrowUp') || keys.has('KeyW') || touchGas;
          const down = keys.has('ArrowDown') || keys.has('KeyS') || touchBrake;
          const left = keys.has('ArrowLeft') || keys.has('KeyA');
          const right = keys.has('ArrowRight') || keys.has('KeyD');

          throttle = up ? 1 : down ? -1 : 0;
          r.braking = down && r.speed > 40;
          if (left) steer -= 1;
          if (right) steer += 1;
          if (Math.abs(joySteer) > 0.04) steer = joySteer;
          steer = Math.max(-1, Math.min(1, steer));
          lastPlayerSteer = steer;
        } else {
          r.aiDecisionTimer -= dt;
          if (r.aiDecisionTimer <= 0) {
            r.aiDecisionTimer = 2.2 + Math.random() * 2.0;
            if (currentTrack.branches.length > 0 && Math.random() < 0.38) {
              const br = currentTrack.branches[Math.floor(Math.random() * currentTrack.branches.length)];
              r.aiPrefLane = br.id;
            } else {
              r.aiPrefLane = 'main';
            }
          }

          let targetSample =
            nearest.sample.laneId !== 'main' && nearest.idx + 4 >= nearest.arr.length
              ? currentTrack.main[
                  (Math.floor(nearest.sample.s * currentTrack.main.length) + 4) % currentTrack.main.length
                ]
              : nearest.arr[(nearest.idx + 4) % nearest.arr.length];
          for (const br of currentTrack.branches) {
            if (r.aiPrefLane === br.id && Math.abs(nearest.sample.s - br.forkS) < 0.06) {
              targetSample = br.samples[Math.min(br.samples.length - 1, 3)];
              break;
            }
          }

          const tx = targetSample.x + targetSample.nx * r.aiLaneOffset;
          const ty = targetSample.y + targetSample.ny * r.aiLaneOffset;
          const desired = Math.atan2(ty - r.y, tx - r.x);
          const diff = normalizeAngle(desired - r.angle);
          steer = Math.max(-1, Math.min(1, diff * 2.4));
          throttle = Math.abs(diff) > 0.85 ? 0.65 : r.aiSkill;
          r.braking = Math.abs(diff) > 0.95;

          r.accelerating = throttle > 0.15;
          if (r.heldItem) {
            r.aiItemCooldown -= dt;
            let closestAheadDist = Infinity;
            let closestBehindDist = Infinity;
            for (const other of racers) {
              if (other === r) continue;
              const d = Math.hypot(other.x - r.x, other.y - r.y);
              if (other.lapProgress >= r.lapProgress && d < closestAheadDist) closestAheadDist = d;
              if (other.lapProgress < r.lapProgress && d < closestBehindDist) closestBehindDist = d;
            }
            const threatenedByMissile = projectiles.some((m) => m.targetIdx === r.idx);
            const shouldFire = evaluateAiPowerDecision({
              heldItem: r.heldItem,
              myProgress: r.lapProgress,
              leaderProgress,
              playerProgress,
              myRank: sortedRanks.indexOf(r) + 1,
              closestAheadDist,
              closestBehindDist,
              threatenedByMissile,
              onStraight: Math.abs(nearest.sample.curvature) < 0.05,
              cooldownReady: r.aiItemCooldown <= 0,
            });
            if (shouldFire) {
              activatePowerUp(r);
              r.aiItemCooldown = 1.8 + Math.random() * 2.2;
            }
          }
        }
        if (r.isPlayer) r.accelerating = throttle > 0.15;
      } else {
        r.braking = false;
        r.accelerating = false;
      }

      const phys = stepCraftPhysics({
        vx: r.vx,
        vy: r.vy,
        angle: r.angle,
        throttle,
        steer,
        stats: r.stats,
        turboTimer: r.turboTimer,
        nitroOverdriveTimer: r.nitroTimer,
        miniTurboTimer: r.miniTurboTimer,
        mudTimer: r.mudTimer,
        onBoostCurrent,
        onIce,
        lightningSlowTimer: r.lightningTimer,
        empSlowTimer: r.empTimer,
        spinTimer: r.spinTimer,
        groundSlope: r.groundSlope,
        isAirborne,
        driftCharge: r.driftCharge,
        prevGear: r.gear,
        dt,
      });

      r.vx = phys.vx;
      r.vy = phys.vy;
      r.angle = phys.angle;
      r.speed = phys.speed;
      r.lateralSlip = phys.lateralSlip;
      r.gear = phys.gear;
      r.rpmRatio = phys.rpmRatio;
      r.driftCharge = phys.driftCharge;
      r.driftStage = phys.driftStage;
      r.lean += (steer - r.lean) * (1 - Math.exp(-9 * dt));

      const mtStage = phys.miniTurboTriggered;
      if (mtStage === 1 || mtStage === 2) {
        r.miniTurboTimer = Math.max(r.miniTurboTimer, mtStage === 2 ? 1.15 : 0.72);
        if (r.isPlayer) {
          boostKick = Math.max(boostKick, mtStage === 2 ? 0.95 : 0.6);
          sound.playMiniTurbo(mtStage);
        }
      }

      r.x += r.vx * dt;
      r.y += r.vy * dt;

      // Wake & 2-Stage Drift Mini-Turbo Sparks
      const groundMeters = r.groundZ * 0.05;
      if (r.speed > 130 && !isAirborne && Math.random() < 0.65) {
        const backX = r.x - Math.cos(r.angle) * 26;
        const backY = r.y - Math.sin(r.angle) * 26;
        const isBoost = r.turboTimer > 0 || r.nitroTimer > 0 || r.miniTurboTimer > 0;
        const pColor = r.nitroTimer > 0 ? 0xe879f9 : r.turboTimer > 0 ? 0xf97316 : 0xe0f2fe;
        spawnParticle(
          backX + (Math.random() - 0.5) * 14,
          backY + (Math.random() - 0.5) * 14,
          groundMeters + 0.18,
          -r.vx * 0.22 + (Math.random() - 0.5) * 40,
          -r.vy * 0.22 + (Math.random() - 0.5) * 40,
          1.4,
          isBoost ? 0.34 : 0.22,
          0.35,
          pColor
        );
      }

      if (r.lateralSlip > 80 && !isAirborne && Math.random() < 0.82) {
        const sparkHex =
          r.driftStage === 2
            ? 0xf97316
            : r.driftStage === 1
              ? 0x38bdf8
              : parseInt(r.underglowColor.replace('#', ''), 16) || 0x22d3ee;
        spawnParticle(
          r.x - Math.cos(r.angle) * 18,
          r.y - Math.sin(r.angle) * 18,
          groundMeters + 0.25,
          -r.vx * 0.15 + (Math.random() - 0.5) * 90,
          -r.vy * 0.15 + (Math.random() - 0.5) * 90,
          2.8,
          r.driftStage > 0 ? 0.3 : 0.24,
          0.32,
          sparkHex
        );
      }

      // Height-aware Track Boundary Banking
      const postNear = findNearestSample(currentTrack, r.x, r.y, r.laneId, r.groundZ, r.cp.lastS);
      const postWave = computeWaveHeight(
        r.x,
        r.y,
        simTime,
        currentTrack.biome,
        postNear.sample.surface,
        postNear.sample.tunnel !== null
      );
      r.groundZ = postNear.sample.z + postWave;
      r.groundSlope = postNear.sample.slope;
      r.inTunnel = postNear.sample.tunnel !== null;
      if (r.airVz === 0 && r.airZ < r.groundZ + 1) {
        r.airZ = r.groundZ;
      }

      const dxB = r.x - postNear.sample.x;
      const dyB = r.y - postNear.sample.y;
      const distFromCenter = Math.hypot(dxB, dyB);
      const maxAllow = postNear.sample.halfWidth - 18;
      if (distFromCenter > maxAllow) {
        const nx = dxB / (distFromCenter || 1);
        const ny = dyB / (distFromCenter || 1);
        r.x = postNear.sample.x + nx * maxAllow;
        r.y = postNear.sample.y + ny * maxAllow;
        const outDot = r.vx * nx + r.vy * ny;
        if (outDot > 0) {
          r.vx -= nx * outDot * 1.35;
          r.vy -= ny * outDot * 1.35;
          r.vx *= 0.88;
          r.vy *= 0.88;
          if (r.isPlayer && outDot > 110) {
            sound.playBump();
            screenShake = Math.max(screenShake, 0.28);
          }
        }
      }

      // Jump Ramps
      for (const rm of currentTrack.ramps) {
        if (
          Math.abs(r.groundZ - rm.z) < 28 &&
          r.airZ <= r.groundZ + 6 &&
          r.speed > 190 &&
          Math.hypot(r.x - rm.x, r.y - rm.y) < 62
        ) {
          r.airVz = currentTrack.biome === 'pirate' ? 275 : 235;
          r.turboTimer = Math.max(r.turboTimer, 0.65);
          if (r.isPlayer) {
            sound.playJump();
            waterSplashIntensity = Math.max(waterSplashIntensity, 0.9);
          }
        }
      }

      // Mud Puddles (Swamp)
      if (!isAirborne && r.groundZ < 12 && r.shieldTimer <= 0) {
        for (const mz of currentTrack.mudZones) {
          if (Math.hypot(r.x - mz.x, r.y - mz.y) < mz.r) {
            r.mudTimer = 2.0;
            break;
          }
        }
      }

      // Obstacles (Height-matched + Breakable Ice + Erupting Geysers)
      if (!isAirborne) {
        for (const ob of currentTrack.obstacles) {
          if (ob.brokenTimer && ob.brokenTimer > 0) continue;
          if (Math.abs(r.groundZ - ob.z) > 26) continue;
          const d = Math.hypot(r.x - ob.x, r.y - ob.y);
          if (d < ob.r + 22) {
            if (ob.kind === 'whirlpool') {
              if (r.shieldTimer <= 0) {
                r.spinTimer = Math.max(r.spinTimer, 1.0);
                r.vx += (ob.x - r.x) * 2.5 * dt;
                r.vy += (ob.y - r.y) * 2.5 * dt;
              }
            } else if (ob.kind === 'ice') {
              // Breakable ice floe shatters into crystal shards instead of hard bounce
              ob.brokenTimer = 7.0;
              for (let k = 0; k < 10; k++) {
                const a = (k / 10) * Math.PI * 2;
                spawnParticle(ob.x, ob.y, ob.z * 0.05 + 0.5, Math.cos(a) * 165, Math.sin(a) * 165, 4.2, 0.34, 0.55, 0xbae6fd);
              }
              if (r.shieldTimer <= 0) {
                r.vx *= 0.82;
                r.vy *= 0.82;
              }
              if (r.isPlayer) {
                sound.playIceShatter();
                screenShake = Math.max(screenShake, 0.32);
              }
            } else if (ob.kind === 'geyser') {
              const erupting = Math.sin(simTime * 1.4 + ob.phase) > 0.25;
              if (erupting) {
                r.airVz = 315;
                for (let k = 0; k < 8; k++) {
                  spawnParticle(ob.x, ob.y, ob.z * 0.05 + 0.8, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, 7.5, 0.42, 0.55, 0xe0f2fe);
                }
                if (r.isPlayer) {
                  sound.playGeyser();
                  waterSplashIntensity = Math.max(waterSplashIntensity, 0.85);
                }
              }
            } else {
              const nx = (r.x - ob.x) / (d || 1);
              const ny = (r.y - ob.y) / (d || 1);
              r.x = ob.x + nx * (ob.r + 23);
              r.y = ob.y + ny * (ob.r + 23);
              if (r.shieldTimer <= 0) {
                r.vx = r.vx * 0.55 + nx * 165;
                r.vy = r.vy * 0.55 + ny * 165;
                if (r.isPlayer) {
                  sound.playBump();
                  screenShake = Math.max(screenShake, 0.45);
                }
              }
            }
          }
        }
      }

      // Traffic & Crossing Patrol Boats (City, water height matched)
      if (!isAirborne && r.groundZ < 14 && currentTrack.trafficBoats.length > 0) {
        for (const tb of currentTrack.trafficBoats) {
          let tx = 0;
          let ty = 0;
          if (tb.crossing && tb.crossX !== undefined && tb.crossY !== undefined && tb.nx !== undefined && tb.ny !== undefined) {
            const swing = Math.sin(simTime * tb.speed + (tb.phase ?? 0)) * (tb.halfWidth ?? 80);
            tx = tb.crossX + tb.nx * swing;
            ty = tb.crossY + tb.ny * swing;
          } else {
            const sIdx = Math.floor((tb.laneIdx + simTime * 2.2) % currentTrack.main.length);
            const pt = currentTrack.main[sIdx];
            if (Math.abs(pt.z - r.groundZ) > 20) continue;
            tx = pt.x + pt.nx * tb.offset;
            ty = pt.y + pt.ny * tb.offset;
          }
          const d = Math.hypot(r.x - tx, r.y - ty);
          if (d < 46) {
            const nx = (r.x - tx) / (d || 1);
            const ny = (r.y - ty) / (d || 1);
            r.x = tx + nx * 47;
            r.y = ty + ny * 47;
            if (r.shieldTimer <= 0) {
              r.vx = r.vx * 0.5 + nx * 180;
              r.vy = r.vy * 0.5 + ny * 180;
              if (r.isPlayer) {
                sound.playBump();
                screenShake = Math.max(screenShake, 0.45);
              }
            }
          }
        }
      }

      // Surprise Boxes (Height-matched)
      for (const box of currentTrack.powerBoxes) {
        if (box.respawn <= 0 && Math.abs(r.airZ - box.z) < 28 && Math.hypot(r.x - box.x, r.y - box.y) < 52) {
          box.respawn = 5.5;
          if (!r.heldItem) {
            const picked = POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)];
            r.heldItem = picked;
            if (r.isPlayer) {
              updatePowerupHud(picked);
              sound.playPickup();
              showBanner(POWERUP_META[picked].name.toUpperCase(), POWERUP_META[picked].shortDesc, 1.15);
            }
          }
          for (let k = 0; k < 8; k++) {
            spawnParticle(
              box.x,
              box.y,
              box.z * 0.05 + 0.9,
              (Math.random() - 0.5) * 140,
              (Math.random() - 0.5) * 140,
              3,
              0.28,
              0.4,
              0xfacc15
            );
          }
        }
      }

      // Collectible Patocoins (Height-matched)
      if (r.isPlayer) {
        for (const coin of currentTrack.coins) {
          if (coin.respawn > 0 || Math.abs(r.airZ - coin.z) > 32) continue;
          const dx = r.x - coin.x;
          const dy = r.y - coin.y;
          const dist = Math.hypot(dx, dy);
          if (r.magnetTimer > 0 && dist < 380 && dist > 1) {
            coin.x += (dx / dist) * 520 * dt;
            coin.y += (dy / dist) * 520 * dt;
          }
          if (dist < 54) {
            coin.respawn = 14.0;
            saveData.coins += 5;
            r.coinsCollected += 5;
            sound.playCoin();
            for (let k = 0; k < 6; k++) {
              spawnParticle(
                coin.x,
                coin.y,
                coin.z * 0.05 + 0.8,
                (Math.random() - 0.5) * 100,
                (Math.random() - 0.5) * 100,
                2.5,
                0.22,
                0.35,
                0xfde047
              );
            }
          }
        }
      }

      // Checkpoint / Lap Progression
      if (!r.finished && countdown <= 0) {
        const headingDot = Math.cos(r.angle) * postNear.sample.tx + Math.sin(r.angle) * postNear.sample.ty;
        const cpRes = updateCheckpointProgress(r.cp, postNear.sample.s, headingDot);
        r.cp = cpRes.state;
        const effectiveS =
          r.cp.lap === 1 && r.cp.highestSector <= 1 && r.cp.lastS > 0.78
            ? r.cp.lastS - 1
            : r.cp.lastS;
        r.lapProgress = (r.cp.lap - 1) + effectiveS;

        if (r.isPlayer) {
          if (r.cp.wrongWay) wrongWayBanner.classList.remove('hidden');
          else wrongWayBanner.classList.add('hidden');
        }

        if (cpRes.lapCompleted) {
          const lapDuration = raceTime - r.lapStartTime;
          if (lapDuration > 4 && lapDuration < r.bestLapTime) {
            r.bestLapTime = lapDuration;
          }
          r.lapStartTime = raceTime;

          if (r.cp.lap > TOTAL_LAPS) {
            r.finished = true;
            r.finishTime = raceTime;
            if (r.isPlayer) {
              finishRace();
              return;
            }
          } else if (r.isPlayer) {
            sound.playLap();
            showBanner(
              r.cp.lap === TOTAL_LAPS ? '¡ÚLTIMA VUELTA!' : `VUELTA ${r.cp.lap} / ${TOTAL_LAPS}`,
              `Mejor vuelta: ${formatTime(r.bestLapTime)}`,
              1.4
            );
          }
        } else if (cpRes.invalidLapAttempt && r.isPlayer) {
          showBanner('CHECKPOINT FALTANTE', 'Completa el circuito entero', 1.1);
        }
      }
    }

    // Solid Oriented-Capsule Racer-to-Racer Collisions & Close-Pass Water Splashes
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < racers.length; i++) {
        for (let j = i + 1; j < racers.length; j++) {
          const a = racers[i];
          const b = racers[j];
          if (iter === 0 && (a.isPlayer || b.isPlayer) && Math.abs(a.airZ - b.airZ) <= 36) {
            const closeDist = Math.hypot(b.x - a.x, b.y - a.y);
            if (closeDist < 88 && (a.speed > 260 || b.speed > 260)) {
              waterSplashIntensity = Math.max(waterSplashIntensity, 0.45);
            }
          }

          const colRes = resolveVehicleCollision(a, b);
          if (!colRes.collided) continue;

          a.speed = Math.hypot(a.vx, a.vy);
          b.speed = Math.hypot(b.vx, b.vy);

          // Re-clamp pushed hulls cleanly inside canal walls
          for (const pushed of [a, b]) {
            const wallNear = findNearestSample(
              currentTrack,
              pushed.x,
              pushed.y,
              pushed.laneId,
              pushed.groundZ,
              pushed.cp.lastS
            );
            const wx = pushed.x - wallNear.sample.x;
            const wy = pushed.y - wallNear.sample.y;
            const wd = Math.hypot(wx, wy);
            const wMax = wallNear.sample.halfWidth - 18;
            if (wd > wMax && wd > 0.01) {
              pushed.x = wallNear.sample.x + (wx / wd) * wMax;
              pushed.y = wallNear.sample.y + (wy / wd) * wMax;
            }
          }

          if (iter === 0) {
            const sparkCount = colRes.shieldKnock ? 12 : 8;
            for (let k = 0; k < sparkCount; k++) {
              const ang = Math.random() * Math.PI * 2;
              const spd = 85 + Math.random() * 145;
              const isWaterSpray = k % 3 === 0;
              spawnParticle(
                colRes.impactX,
                colRes.impactY,
                colRes.impactZ,
                Math.cos(ang) * spd,
                Math.sin(ang) * spd,
                2.5 + Math.random() * 2.5,
                isWaterSpray ? 2.6 : 1.7,
                0.28 + Math.random() * 0.16,
                isWaterSpray ? 0xbae6fd : colRes.shieldKnock ? 0x22d3ee : 0xfb923c
              );
            }

            if (a.isPlayer || b.isPlayer) {
              screenShake = Math.max(screenShake, Math.min(0.65, 0.24 * colRes.impactStrength));
              waterSplashIntensity = Math.max(waterSplashIntensity, 0.85);
              if (hullSoundCooldown <= 0) {
                sound.playHullImpact(colRes.impactStrength);
                hullSoundCooldown = 0.14;
                if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
                  navigator.vibrate(25);
                }
              }
            }
          }
        }
      }
    }

    // Homing Missiles (Height-tracking)
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const m = projectiles[i];
      m.life -= dt;
      if (m.life <= 0) {
        projectiles.splice(i, 1);
        continue;
      }
      if (m.targetIdx >= 0 && racers[m.targetIdx]) {
        const tgt = racers[m.targetIdx];
        const desired = Math.atan2(tgt.y - m.y, tgt.x - m.x);
        const diff = normalizeAngle(desired - m.angle);
        m.angle += Math.max(-3.6 * dt, Math.min(3.6 * dt, diff));
        m.vx = Math.cos(m.angle) * 920;
        m.vy = Math.sin(m.angle) * 920;
        m.z += ((tgt.airZ + 8) - m.z) * (1 - Math.exp(-6 * dt));
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      if (Math.random() < 0.7) {
        spawnParticle(m.x, m.y, m.z * 0.05 + 0.35, 0, 0, 1.0, 0.24, 0.3, 0xf97316);
      }

      let hit = false;
      for (const r of racers) {
        if (r.idx === m.ownerIdx) continue;
        if (Math.abs(r.airZ - m.z) < 28 && Math.hypot(r.x - m.x, r.y - m.y) < 42) {
          if (r.shieldTimer <= 0) {
            r.spinTimer = 1.25;
            r.vx *= 0.35;
            r.vy *= 0.35;
            if (r.isPlayer) {
              sound.playBump();
              screenShake = Math.max(screenShake, 0.65);
            }
          }
          for (let k = 0; k < 14; k++) {
            spawnParticle(
              m.x,
              m.y,
              m.z * 0.05 + 0.5,
              (Math.random() - 0.5) * 200,
              (Math.random() - 0.5) * 200,
              4,
              0.36,
              0.45,
              0xef4444
            );
          }
          hit = true;
          break;
        }
      }
      if (hit) projectiles.splice(i, 1);
    }

    // Buoy Mines Collision & Expiry
    for (let i = mines.length - 1; i >= 0; i--) {
      const mn = mines[i];
      mn.life -= dt;
      mn.armDelay = Math.max(0, mn.armDelay - dt);
      if (mn.life <= 0) {
        mines.splice(i, 1);
        continue;
      }
      if (mn.armDelay > 0) continue;
      let exploded = false;
      for (const r of racers) {
        if (Math.abs(r.airZ - mn.z * 20) < 24 && Math.hypot(r.x - mn.x, r.y - mn.y) < 38) {
          if (r.shieldTimer <= 0) {
            r.spinTimer = 1.25;
            r.vx *= 0.35;
            r.vy *= 0.35;
            if (r.isPlayer) {
              sound.playMineExplosion();
              screenShake = Math.max(screenShake, 0.72);
            }
          }
          for (let k = 0; k < 14; k++) {
            spawnParticle(mn.x, mn.y, mn.z + 0.5, (Math.random() - 0.5) * 210, (Math.random() - 0.5) * 210, 4.8, 0.38, 0.5, 0xf97316);
          }
          exploded = true;
          break;
        }
      }
      if (exploded) mines.splice(i, 1);
    }

    // Shockwaves (Height-aware)
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const sw = shockwaves[i];
      sw.r += 580 * dt;
      for (const r of racers) {
        if (r.idx === sw.ownerIdx || sw.hitIndices.has(r.idx)) continue;
        if (Math.abs(r.airZ - sw.z) > 38) continue;
        const d = Math.hypot(r.x - sw.x, r.y - sw.y);
        if (d <= sw.r) {
          sw.hitIndices.add(r.idx);
          if (r.shieldTimer <= 0) {
            const nx = (r.x - sw.x) / (d || 1);
            const ny = (r.y - sw.y) / (d || 1);
            if (sw.isEmp) {
              r.empTimer = 2.4;
              r.vx *= 0.45;
              r.vy *= 0.45;
            } else {
              r.vx += nx * 380;
              r.vy += ny * 380;
              r.spinTimer = 0.75;
            }
            if (r.isPlayer) {
              sound.playBump();
              screenShake = Math.max(screenShake, 0.55);
            }
          }
        }
      }
      if (sw.r >= sw.maxR) shockwaves.splice(i, 1);
    }

    // Ambient Biome Weather & Atmosphere Particles (Snow, Embers, Fireflies, Sea Mist, Neon Motes)
    const focus = racers[0];
    if (focus) {
      const spawnChance = currentTrack.biome === 'arctic' ? 0.85 : 0.48;
      if (Math.random() < spawnChance) {
        const fwdX = Math.cos(focus.angle);
        const fwdY = Math.sin(focus.angle);
        const distAhead = 80 + Math.random() * 480;
        const sideSpan = (Math.random() - 0.5) * 420;
        const px = focus.x + fwdX * distAhead - fwdY * sideSpan;
        const py = focus.y + fwdY * distAhead + fwdX * sideSpan;
        const baseZ = focus.groundZ * 0.05;
        if (currentTrack.biome === 'arctic') {
          spawnParticle(px, py, baseZ + 6 + Math.random() * 6, -40, 20, -2.2, 0.16, 1.3, 0xf8fafc);
        } else if (currentTrack.biome === 'volcano') {
          spawnParticle(px, py, baseZ + 2 + Math.random() * 8, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 1.8, 0.17, 1.1, 0xf97316);
        } else if (currentTrack.biome === 'swamp') {
          spawnParticle(px, py, baseZ + 0.8 + Math.random() * 3.5, (Math.random() - 0.5) * 28, (Math.random() - 0.5) * 28, 0.6, 0.15, 1.4, 0xfacc15);
        } else if (currentTrack.biome === 'city') {
          spawnParticle(px, py, baseZ + 1.2 + Math.random() * 5.0, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, 0.4, 0.14, 1.2, 0x38bdf8);
        } else if (currentTrack.biome === 'pirate') {
          spawnParticle(px, py, baseZ + 1.0 + Math.random() * 4.5, -32, 18, 0.5, 0.16, 1.3, 0xe2e8f0);
        } else {
          spawnParticle(px, py, baseZ + 0.8 + Math.random() * 4.0, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24, 0.5, 0.15, 1.3, 0xfef08a);
        }
      }
    }

    // Blinking Rear Torpedo Incoming Warning
    const playerTargetedByTorpedo = projectiles.some((m) => m.targetIdx === 0);
    if (torpedoAlert) {
      if (playerTargetedByTorpedo) torpedoAlert.classList.remove('hidden');
      else torpedoAlert.classList.add('hidden');
    }

    // Update NFS Digital Speedometer HUD & Engine/Tunnel Synth
    const player = racers[0];
    if (player) {
      const sorted = [...racers].sort((a, b) => b.lapProgress - a.lapProgress);
      const pos = sorted.indexOf(player) + 1;
      hudPosVal.textContent = `${pos}.º / 6`;
      hudLapVal.textContent = `${Math.min(TOTAL_LAPS, player.cp.lap)} / ${TOTAL_LAPS}`;
      hudTimeVal.textContent = formatTime(raceTime);

      const kmh = Math.round(player.speed * 0.25);
      hudSpeedVal.textContent = String(kmh);
      if (hudGearVal) {
        hudGearVal.textContent = `M${player.gear}`;
        hudGearVal.style.background =
          player.nitroTimer > 0 ? '#e879f9' : player.turboTimer > 0 ? '#f97316' : '#22d3ee';
      }

      if (hudDriftBadge) {
        hudDriftBadge.textContent =
          player.nitroTimer > 0
            ? 'NITRO'
            : player.turboTimer > 0 || player.miniTurboTimer > 0
              ? 'TURBO'
              : player.driftStage === 2
                ? 'DRIFT II'
                : player.driftStage === 1
                  ? 'DRIFT I'
                  : '';
        hudDriftBadge.style.color = player.driftStage === 2 ? '#f97316' : '#38bdf8';
      }

      const maxKmh = 210;
      const frac = Math.min(1, kmh / maxKmh);
      if (speedoArc) {
        speedoArc.setAttribute('stroke-dashoffset', String((53.4 * (1 - frac)).toFixed(1)));
        speedoArc.setAttribute(
          'stroke',
          player.nitroTimer > 0 ? '#e879f9' : player.turboTimer > 0 ? '#f97316' : '#38bdf8'
        );
      }

      const nitroFrac =
        player.nitroTimer > 0
          ? Math.min(1, player.nitroTimer / 3.5)
          : player.turboTimer > 0
            ? Math.min(1, player.turboTimer / 2.5)
            : player.miniTurboTimer > 0
              ? Math.min(1, player.miniTurboTimer / 1.15)
              : Math.min(1, player.driftCharge / 1.55);
      if (nitroArc) {
        nitroArc.setAttribute('stroke-dashoffset', String((72.3 * (1 - nitroFrac)).toFixed(1)));
        nitroArc.setAttribute(
          'stroke',
          player.nitroTimer > 0
            ? '#e879f9'
            : player.driftStage === 1 && player.turboTimer <= 0
              ? '#38bdf8'
              : '#f97316'
        );
      }

      const maxBase = 450 + player.stats.velocidadMax * 38;
      sound.setTunnelEffect(player.inTunnel);
      sound.updateEngine(
        Math.min(1.4, player.speed / maxBase),
        player.rpmRatio,
        player.gear,
        player.turboTimer > 0 || player.nitroTimer > 0 || player.miniTurboTimer > 0,
        player.inTunnel,
        countdown <= 0
      );
    }
  }

  // Keyboard bindings
  window.addEventListener('keydown', (e) => {
    sound.unlock();
    keys.add(e.code);

    if (e.code === 'KeyM') {
      saveData.muted = !saveData.muted;
      sound.setMuted(saveData.muted);
      persistSaveData(saveData);
      refreshMuteIcons();
      return;
    }

    if (gameState === 'title') {
      if ((e.code === 'Enter' || e.code === 'Space') && garageModal.classList.contains('hidden')) {
        e.preventDefault();
        startRace();
      }
      return;
    }

    if (gameState === 'playing') {
      if (e.code === 'Space') {
        e.preventDefault();
        if (racers[0]) activatePowerUp(racers[0]);
      } else if (e.code === 'KeyC') {
        toggleCameraMode();
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
      } else if (e.code === 'KeyR') {
        startRace();
      }
    } else if (gameState === 'paused') {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        togglePause();
      } else if (e.code === 'KeyR') {
        startRace();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys.delete(e.code);
  });

  // Virtual Multi-Touch Joystick (Corrected Left/Right Polarity) & Pedals
  function updateJoystickFromClient(clientX: number): void {
    if (!joystickZone || !joystickKnob) return;
    const rect = joystickZone.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const maxOffset = rect.width * 0.36;
    const dx = Math.max(-maxOffset, Math.min(maxOffset, clientX - cx));
    joySteer = dx / maxOffset;
    joystickKnob.style.transform = `translate(${dx.toFixed(1)}px, 0px)`;
    joyDirLeft?.classList.toggle('active', joySteer < -0.18);
    joyDirRight?.classList.toggle('active', joySteer > 0.18);
  }

  function resetJoystick(): void {
    joyPointerId = null;
    joySteer = 0;
    if (joystickKnob) joystickKnob.style.transform = 'translate(0px, 0px)';
    joyDirLeft?.classList.remove('active');
    joyDirRight?.classList.remove('active');
  }

  joystickZone?.addEventListener('pointerdown', (e) => {
    sound.unlock();
    e.preventDefault();
    joyPointerId = e.pointerId;
    joystickZone.setPointerCapture(e.pointerId);
    updateJoystickFromClient(e.clientX);
  });

  joystickZone?.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyPointerId) return;
    e.preventDefault();
    updateJoystickFromClient(e.clientX);
  });

  joystickZone?.addEventListener('pointerup', (e) => {
    if (e.pointerId === joyPointerId) resetJoystick();
  });
  joystickZone?.addEventListener('pointercancel', (e) => {
    if (e.pointerId === joyPointerId) resetJoystick();
  });

  const bindHoldBtn = (btn: HTMLButtonElement | null, onChange: (down: boolean) => void) => {
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => {
      sound.unlock();
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add('pressed');
      onChange(true);
    });
    const up = () => {
      btn.classList.remove('pressed');
      onChange(false);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  };

  bindHoldBtn(touchGasBtn, (down) => (touchGas = down));
  bindHoldBtn(touchBrakeBtn, (down) => (touchBrake = down));
  touchBoostBtn?.addEventListener('pointerdown', (e) => {
    sound.unlock();
    e.preventDefault();
    if (racers[0]) activatePowerUp(racers[0]);
  });

  // UI Button Listeners
  startRaceBtn?.addEventListener('click', () => {
    startRaceBtn.blur();
    startRace();
  });
  playAgainBtn?.addEventListener('click', () => {
    playAgainBtn.blur();
    startRace();
  });
  resGarageBtn?.addEventListener('click', () => {
    resultsModal.classList.add('hidden');
    returnToTitle();
    garageInspectId = saveData.selectedVehicleId;
    renderGarage();
    garageModal.classList.remove('hidden');
  });
  resMenuBtn?.addEventListener('click', returnToTitle);

  hudPowerupSlot?.addEventListener('click', () => {
    sound.unlock();
    if (racers[0]) activatePowerUp(racers[0]);
    hudPowerupSlot.blur();
  });
  hudCameraBtn?.addEventListener('click', () => {
    sound.unlock();
    toggleCameraMode();
    hudCameraBtn.blur();
  });
  hudPauseBtn?.addEventListener('click', () => {
    togglePause();
    hudPauseBtn.blur();
  });
  hudRestartBtn?.addEventListener('click', () => {
    startRace();
    hudRestartBtn.blur();
  });
  resumeBtn?.addEventListener('click', togglePause);
  pauseRestartBtn?.addEventListener('click', () => startRace());
  pauseMenuBtn?.addEventListener('click', returnToTitle);

  const toggleMute = (btn: HTMLButtonElement | null) => {
    sound.unlock();
    saveData.muted = !saveData.muted;
    sound.setMuted(saveData.muted);
    persistSaveData(saveData);
    refreshMuteIcons();
    btn?.blur();
  };
  menuMuteBtn?.addEventListener('click', () => toggleMute(menuMuteBtn));
  hudMuteBtn?.addEventListener('click', () => toggleMute(hudMuteBtn));

  window.addEventListener('resize', () => {
    renderer.resize(window.innerWidth, window.innerHeight);
    updateTouchControlsVisibility();
    renderCurrentFrame(0.016);
  });

  // Render Loop with Software-WebGL GPU Fence Yielding (`afterDraw`)
  const gl = renderer.renderer.getContext() as WebGL2RenderingContext;

  function afterDraw(tick: FrameRequestCallback): void {
    if (!renderer.isSoftwareGl || typeof gl.fenceSync !== 'function') {
      rafId = requestAnimationFrame(tick);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      timerId = window.setTimeout(() => {
        rafId = requestAnimationFrame(tick);
      }, 80);
      return;
    }
    gl.flush();
    const poll = () => {
      const status = gl.clientWaitSync(sync, 0, 0);
      if (
        status === gl.WAIT_FAILED ||
        status === gl.CONDITION_SATISFIED ||
        status === gl.ALREADY_SIGNALED
      ) {
        gl.deleteSync(sync);
        timerId = window.setTimeout(() => {
          rafId = requestAnimationFrame(tick);
        }, 80);
      } else {
        timerId = window.setTimeout(poll, 5);
      }
    };
    timerId = window.setTimeout(poll, 5);
  }

  function frameLoop(now: number): void {
    const rawDt = (now - lastFrameNow) / 1000;
    lastFrameNow = now;
    const clampedRaw = Math.min(0.24, Math.max(0.001, rawDt));

    if (gameState === 'paused' || gameState === 'gameover') {
      timerId = window.setTimeout(() => {
        rafId = requestAnimationFrame(frameLoop);
      }, 120);
      return;
    }

    const steps = Math.max(1, Math.min(5, Math.ceil(clampedRaw / 0.045)));
    const subDt = clampedRaw / steps;
    for (let s = 0; s < steps; s++) {
      stepSimulation(subDt);
    }
    renderCurrentFrame(clampedRaw);

    afterDraw(frameLoop);
  }

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(rafId);
    clearTimeout(timerId);
    renderer.dispose();
  });

  // Boot
  refreshMenuUI();
  initAttractScene();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('autostart') === '1') {
    startRace(false);
  } else {
    syncStateAttr('title');
  }
  if (urlParams.get('cam') === 'hood') {
    cameraMode = 'hood';
    syncCameraButtonUi();
  }

  renderer.render({
    gameState,
    cameraMode,
    track: currentTrack,
    racers,
    particles,
    projectiles,
    mines,
    shockwaves,
    inkSplatters,
    simTime,
    dt: 0.016,
    steerInput: 0,
    screenShake: 0,
    lightningFlash: 0,
    boostKick: 0,
    landingCompress: 0,
    waterSplashIntensity: 0,
    playerUnderglow: saveData.selectedUnderglowColor,
  });

  lastFrameNow = performance.now();
  rafId = requestAnimationFrame(frameLoop);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', main, { once: true });
} else {
  main();
}
