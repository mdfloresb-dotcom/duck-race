import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  WORLD_SCALE,
  mapTrackToWorld,
  stepChaseCamera,
  stepHoodCamera,
  worldRightFromAngle,
  type CameraMode,
  type ChaseCamState,
} from './hydroEngine';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { buildCraftMesh, type CraftMeshHandle } from './vehicles3d';
import { buildTrackScene, type CompiledTrack, type TrackSceneHandle } from './tracks3d';

export interface RacerSimState {
  idx: number;
  isPlayer: boolean;
  name: string;
  hullType: 'jetski' | 'speedboat' | 'yacht' | 'bathtub' | 'rubberduck';
  primaryColor: string;
  accentColor: string;
  scarfColor: string;
  underglowColor: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  lateralSlip: number;
  lean: number;
  groundZ: number;
  groundSlope: number;
  airZ: number;
  airVz: number;
  gear: number;
  rpmRatio: number;
  driftCharge: number;
  driftStage: 0 | 1 | 2;
  miniTurboTimer: number;
  turboTimer: number;
  nitroTimer: number;
  shieldTimer: number;
  magnetTimer: number;
  mudTimer: number;
  lightningTimer: number;
  empTimer: number;
  spinTimer: number;
  spinVisual: number;
  braking: boolean;
  inTunnel: boolean;
  stats: { velocidadMax: number; aceleracion: number; manejo: number; turbo: number };
}

export interface ProjectileSimState {
  x: number;
  y: number;
  z: number;
  angle: number;
}

export interface ShockwaveSimState {
  x: number;
  y: number;
  z: number;
  r: number;
  maxR: number;
  color: string;
}

export interface MineSimState {
  x: number;
  y: number;
  z: number;
}

export interface InkSplatterState {
  x: number;
  y: number;
  r: number;
  alpha: number;
}

export interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  life: number;
  maxLife: number;
  colorHex: number;
}

interface WaterDropSlot {
  active: boolean;
  x: number; // 0..1 normalized
  y: number;
  r: number;
  vy: number;
  life: number;
  maxLife: number;
}

export const MAX_PARTICLES = 340;
const MAX_WATER_DROPS = 26;

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class HydroSceneRenderer {
  public readonly isSoftwareGl: boolean;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly textures: ProceduralTextureSet;

  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private baseFogDensity = 0.0072;
  private tunnelBlend = 0;

  private trackHandle: TrackSceneHandle | null = null;
  private activeTrackId = '';
  private craftHandles: CraftMeshHandle[] = [];

  private particleMesh: THREE.InstancedMesh;
  private particleGeo: THREE.BufferGeometry;
  private particleMat: THREE.MeshBasicMaterial;
  private scratchDummy = new THREE.Object3D();
  private scratchColor = new THREE.Color();

  private missileGroup: THREE.Group[] = [];
  private missileGeo: THREE.BufferGeometry;
  private missileMat: THREE.MeshStandardMaterial;
  private mineGroup: THREE.Group[] = [];
  private mineCoreGeo: THREE.BufferGeometry;
  private mineSpikeGeo: THREE.BufferGeometry;
  private mineCoreMat: THREE.MeshStandardMaterial;
  private mineGlowMat: THREE.MeshStandardMaterial;
  private waveRings: THREE.Mesh[] = [];
  private waveGeo: THREE.BufferGeometry;

  public chaseState: ChaseCamState = {
    camAngle: 0,
    camFov: 62,
    driftSwing: 0,
    camRoll: 0,
    camWorldX: 0,
    camWorldY: 1.4,
    camWorldZ: 0,
    lookWorldX: 20,
    lookWorldY: 1.0,
    lookWorldZ: 0,
    speedLinesIntensity: 0,
  };

  private waterDrops: WaterDropSlot[] = Array.from({ length: MAX_WATER_DROPS }, () => ({
    active: false,
    x: 0.5,
    y: 0.5,
    r: 6,
    vy: 0.08,
    life: 0,
    maxLife: 1,
  }));
  private dropCursor = 0;

  private fxCanvas: HTMLCanvasElement;
  private fxCtx: CanvasRenderingContext2D;
  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;
  private minimapBg: HTMLCanvasElement | null = null;
  private cachedMinimapTrackId = '';
  private minimapTransform = { scale: 1, ox: 0, oy: 0 };

  constructor(
    mountEl: HTMLElement,
    fxCanvas: HTMLCanvasElement,
    minimapCanvas: HTMLCanvasElement
  ) {
    this.isSoftwareGl = detectSoftwareWebGL();
    this.fxCanvas = fxCanvas;
    this.fxCtx = fxCanvas.getContext('2d')!;
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d')!;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'game-canvas');
    this.renderer.domElement.setAttribute('aria-label', 'Pista 3D Duck Hydro-Race');
    mountEl.innerHTML = '';
    mountEl.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x041224);
    this.scene.fog = new THREE.FogExp2(0x041224, this.baseFogDensity);

    this.camera = new THREE.PerspectiveCamera(
      62,
      Math.max(0.5, window.innerWidth / Math.max(1, window.innerHeight)),
      0.2,
      520
    );

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x041224, 0.85);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xffe4c4, 1.55);
    this.keyLight.position.set(45, 72, 32);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    const d = 55;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 160;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0x22d3ee, 1.15);
    this.rimLight.position.set(-50, 28, -45);
    this.scene.add(this.rimLight);

    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());

    this.particleGeo = new THREE.SphereGeometry(0.18, 6, 5);
    this.particleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(this.particleGeo, this.particleMat, MAX_PARTICLES);
    this.particleMesh.frustumCulled = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.scratchDummy.scale.set(0, 0, 0);
      this.scratchDummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.scratchDummy.matrix);
      this.particleMesh.setColorAt(i, this.scratchColor.setHex(0xffffff));
    }
    this.scene.add(this.particleMesh);

    this.missileGeo = new THREE.ConeGeometry(0.32, 1.35, 10);
    this.missileGeo.rotateZ(-Math.PI / 2);
    this.missileMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: new THREE.Color(0xf97316),
      emissiveIntensity: 2.2,
      roughness: 0.25,
    });
    for (let i = 0; i < 8; i++) {
      const mg = new THREE.Group();
      const body = new THREE.Mesh(this.missileGeo, this.missileMat);
      body.position.y = 0.65;
      mg.add(body);
      mg.visible = false;
      this.scene.add(mg);
      this.missileGroup.push(mg);
    }

    this.waveGeo = new THREE.RingGeometry(0.88, 1.0, 32);
    this.waveGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const wMat = new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const wm = new THREE.Mesh(this.waveGeo, wMat);
      wm.position.y = 0.14;
      wm.visible = false;
      this.scene.add(wm);
      this.waveRings.push(wm);
    }

    this.mineCoreGeo = new THREE.SphereGeometry(0.55, 10, 10);
    this.mineSpikeGeo = new THREE.ConeGeometry(0.14, 0.42, 6);
    this.mineCoreMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.75,
    });
    this.mineGlowMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: new THREE.Color(0xf43f5e),
      emissiveIntensity: 2.8,
    });
    for (let i = 0; i < 10; i++) {
      const mg = new THREE.Group();
      const core = new THREE.Mesh(this.mineCoreGeo, this.mineCoreMat);
      mg.add(core);
      const dirs: [number, number, number][] = [
        [0, 1, 0],
        [0, -1, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      for (const [dx, dy, dz] of dirs) {
        const sp = new THREE.Mesh(this.mineSpikeGeo, this.mineGlowMat);
        sp.position.set(dx * 0.56, dy * 0.56, dz * 0.56);
        sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz));
        mg.add(sp);
      }
      mg.visible = false;
      this.scene.add(mg);
      this.mineGroup.push(mg);
    }

    this.resize(window.innerWidth, window.innerHeight);
  }

  public resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    const dpr = this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    this.fxCanvas.width = Math.floor(w * dpr);
    this.fxCanvas.height = Math.floor(h * dpr);
  }

  public setTrack(track: CompiledTrack): void {
    if (this.activeTrackId === track.id && this.trackHandle) return;
    this.activeTrackId = track.id;

    if (this.trackHandle) {
      this.scene.remove(this.trackHandle.group);
      this.trackHandle.dispose();
    }

    this.baseFogDensity =
      track.biome === 'swamp'
        ? 0.0115
        : track.biome === 'pirate'
          ? 0.0082
          : track.biome === 'lagoon'
            ? 0.0046
            : 0.0072;
    this.scene.background = new THREE.Color(track.skyTop);
    this.scene.fog = new THREE.FogExp2(track.fogColor, this.baseFogDensity);
    this.hemiLight.color.set(track.biome === 'lagoon' ? '#e0f2fe' : track.neonAccent);
    this.hemiLight.groundColor.set(track.skyHorizon);
    this.rimLight.color.set(track.neonSecondary);

    this.trackHandle = buildTrackScene(track, this.textures, this.isSoftwareGl);
    this.scene.add(this.trackHandle.group);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  public syncRacersMeshes(racers: RacerSimState[]): void {
    for (const h of this.craftHandles) {
      this.scene.remove(h.root);
      h.dispose();
    }
    this.craftHandles = racers.map((r) => {
      const h = buildCraftMesh(
        {
          hullType: r.hullType,
          primaryColor: r.primaryColor,
          accentColor: r.accentColor,
          scarfColor: r.scarfColor,
          underglowColor: r.underglowColor,
          isPlayer: r.isPlayer,
        },
        this.textures
      );
      this.scene.add(h.root);
      return h;
    });
  }

  public updatePlayerUnderglow(hex: string): void {
    if (this.craftHandles[0]) {
      this.craftHandles[0].setUnderglowColor(hex);
    }
  }

  public resetChaseCam(playerAngle: number): void {
    this.chaseState.camAngle = playerAngle;
    this.chaseState.camFov = 62;
    this.chaseState.driftSwing = 0;
    this.chaseState.camRoll = 0;
    this.tunnelBlend = 0;
    this.waterDrops.forEach((d) => (d.active = false));
  }

  public spawnWaterDroplets(count: number): void {
    for (let i = 0; i < count; i++) {
      const slot = this.waterDrops[this.dropCursor];
      this.dropCursor = (this.dropCursor + 1) % MAX_WATER_DROPS;
      slot.active = true;
      // Place mostly near perimeter edges so center visibility stays razor sharp
      const edgeSide = Math.random() < 0.5 ? Math.random() * 0.28 : 0.72 + Math.random() * 0.28;
      slot.x = Math.random() < 0.7 ? edgeSide : 0.2 + Math.random() * 0.6;
      slot.y = Math.random() * 0.75;
      slot.r = 5 + Math.random() * 11;
      slot.vy = 0.06 + Math.random() * 0.14;
      slot.maxLife = 0.75 + Math.random() * 0.9;
      slot.life = slot.maxLife;
    }
  }

  public render(params: {
    gameState: 'title' | 'playing' | 'paused' | 'gameover';
    cameraMode: CameraMode;
    track: CompiledTrack;
    racers: RacerSimState[];
    particles: ParticleSlot[];
    projectiles: ProjectileSimState[];
    mines: MineSimState[];
    shockwaves: ShockwaveSimState[];
    inkSplatters: InkSplatterState[];
    simTime: number;
    dt: number;
    steerInput: number;
    screenShake: number;
    lightningFlash: number;
    boostKick: number;
    landingCompress: number;
    waterSplashIntensity: number;
    playerUnderglow: string;
  }): void {
    const { track, racers, particles, projectiles, mines, shockwaves, inkSplatters, simTime, dt, gameState } = params;

    if (this.trackHandle) {
      this.trackHandle.update(simTime);
    }

    const focusRacer = racers[0];
    const effectiveCamMode: CameraMode = gameState === 'playing' ? params.cameraMode : 'chase';

    // Update Racer 3D Meshes
    for (let i = 0; i < racers.length && i < this.craftHandles.length; i++) {
      const r = racers[i];
      const h = this.craftHandles[i];
      if (i === 0) h.setCameraMode(effectiveCamMode);

      const wp = mapTrackToWorld(r.x, r.y, 0);
      h.root.position.set(wp.x, 0, wp.z);
      h.root.rotation.y = -r.angle;

      const slopePitch = Math.atan(r.groundSlope || 0);
      const airPitch = r.airVz > 20 ? 0.14 : r.airVz < -40 ? -0.1 : 0;
      const throttlePitch = r.braking ? -0.05 : r.turboTimer > 0 || r.nitroTimer > 0 ? 0.065 : 0;
      const pitch = slopePitch + airPitch + throttlePitch;

      const engineVib = Math.min(1.4, r.speed / 550);

      h.updateVisuals({
        simTime,
        idx: r.idx,
        groundZ: r.groundZ,
        airZ: r.airZ,
        lean: r.lean,
        pitch,
        spinVisual: r.spinVisual,
        braking: r.braking,
        drifting: r.lateralSlip > 85,
        driftStage: r.driftStage,
        turboActive: r.turboTimer > 0 || r.miniTurboTimer > 0,
        nitroActive: r.nitroTimer > 0,
        shieldActive: r.shieldTimer > 0,
        magnetActive: r.magnetTimer > 0,
        lightningActive: r.lightningTimer > 0,
        inTunnel: r.inTunnel,
        engineVib,
      });
    }

    // Tunnel ambient lighting transition (darkens sunlight/sky so headlights + neon strips pop!)
    const targetTunnel = gameState === 'playing' && focusRacer?.inTunnel ? 1 : 0;
    this.tunnelBlend += (targetTunnel - this.tunnelBlend) * (1 - Math.exp(-5.5 * dt));
    const baseHemi = track.biome === 'lagoon' ? 1.25 : 0.88;
    const baseKey = track.biome === 'lagoon' ? 2.15 : 1.55;
    this.hemiLight.intensity = baseHemi - this.tunnelBlend * (baseHemi * 0.65);
    this.keyLight.intensity = baseKey - this.tunnelBlend * (baseKey * 0.72);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = this.baseFogDensity * (1 + this.tunnelBlend * 0.48);
    }

    if (focusRacer) {
      const fw = mapTrackToWorld(focusRacer.x, focusRacer.y, focusRacer.groundZ * WORLD_SCALE);
      this.keyLight.position.set(fw.x + 38, fw.y + 66, fw.z + 28);
      this.keyLight.target.position.set(fw.x, fw.y, fw.z);
    }

    // Update Camera (Title Flyover vs Active Low-Chase or Hood/Cockpit POV)
    if (gameState === 'title' && focusRacer) {
      const orbitA = focusRacer.angle + Math.sin(simTime * 0.35) * 0.48 + 0.32;
      const fw = mapTrackToWorld(focusRacer.x, focusRacer.y, focusRacer.groundZ * WORLD_SCALE);
      const dist = 7.4;
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
      this.camera.up.set(0, 1, 0);
      this.camera.position.set(
        fw.x - Math.cos(orbitA) * dist,
        fw.y + 2.65 + Math.sin(simTime * 0.6) * 0.35,
        fw.z - Math.sin(orbitA) * dist
      );
      this.camera.lookAt(
        fw.x + Math.cos(focusRacer.angle) * 6.5,
        fw.y + 0.95,
        fw.z + Math.sin(focusRacer.angle) * 6.5
      );
      this.chaseState.speedLinesIntensity = 0;
    } else if (focusRacer) {
      const maxBaseSpeed = 450 + focusRacer.stats.velocidadMax * 38;
      const camInput = {
        playerX: focusRacer.x,
        playerY: focusRacer.y,
        playerAirZ: focusRacer.airZ,
        playerAngle: focusRacer.angle,
        playerSpeed: focusRacer.speed,
        maxBaseSpeed,
        steerInput: params.steerInput,
        lateralSlip: focusRacer.lateralSlip,
        turboActive: focusRacer.turboTimer > 0 || focusRacer.miniTurboTimer > 0,
        nitroActive: focusRacer.nitroTimer > 0,
        boostKick: params.boostKick,
        landingCompress: params.landingCompress,
        camAngle: this.chaseState.camAngle,
        camFov: this.chaseState.camFov,
        driftSwing: this.chaseState.driftSwing,
        dt,
      };

      this.chaseState =
        effectiveCamMode === 'hood' ? stepHoodCamera(camInput) : stepChaseCamera(camInput);

      const highSpeedRatio = Math.max(0, focusRacer.speed / maxBaseSpeed - 0.8);
      const vibAmp =
        highSpeedRatio * 0.036 +
        (focusRacer.turboTimer > 0 || focusRacer.nitroTimer > 0 ? 0.03 : 0) +
        (effectiveCamMode === 'hood' ? highSpeedRatio * 0.02 : 0);
      const shakeAmp = params.screenShake * params.screenShake * 0.45 + vibAmp;
      const sx = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp : 0;
      const sy = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp : 0;

      const portraitPull =
        effectiveCamMode === 'chase' && this.camera.aspect < 0.85 ? 1.05 : 0;
      const fx = Math.cos(this.chaseState.camAngle);
      const fz = Math.sin(this.chaseState.camAngle);

      if (Math.abs(this.camera.fov - this.chaseState.camFov) > 0.05) {
        this.camera.fov = this.chaseState.camFov;
        this.camera.updateProjectionMatrix();
      }

      if (effectiveCamMode === 'hood' && Math.abs(this.chaseState.camRoll) > 0.001) {
        const roll = this.chaseState.camRoll;
        const right = worldRightFromAngle(this.chaseState.camAngle);
        this.camera.up.set(
          -Math.sin(roll) * right.x,
          Math.cos(roll),
          -Math.sin(roll) * right.z
        );
      } else {
        this.camera.up.set(0, 1, 0);
      }

      const slopeLookDelta =
        effectiveCamMode === 'hood' ? (focusRacer.groundSlope || 0) * 14 : (focusRacer.groundSlope || 0) * 10;

      this.camera.position.set(
        this.chaseState.camWorldX - fx * portraitPull + sx,
        this.chaseState.camWorldY + portraitPull * 0.25 + sy,
        this.chaseState.camWorldZ - fz * portraitPull
      );
      this.camera.lookAt(
        this.chaseState.lookWorldX,
        this.chaseState.lookWorldY + slopeLookDelta,
        this.chaseState.lookWorldZ
      );
    }

    // Update Instanced Particle Pool
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = particles[i];
      if (!p.active) {
        this.scratchDummy.scale.set(0, 0, 0);
        this.scratchDummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, this.scratchDummy.matrix);
        continue;
      }
      const lifeRatio = Math.max(0.05, p.life / p.maxLife);
      this.scratchDummy.position.set(p.x * WORLD_SCALE, p.z, p.y * WORLD_SCALE);
      this.scratchDummy.scale.setScalar(p.size * lifeRatio);
      this.scratchDummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.scratchDummy.matrix);
      this.particleMesh.setColorAt(i, this.scratchColor.setHex(p.colorHex));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    // Update Projectiles
    for (let i = 0; i < this.missileGroup.length; i++) {
      const mg = this.missileGroup[i];
      const m = projectiles[i];
      if (!m) {
        mg.visible = false;
      } else {
        mg.visible = true;
        mg.position.set(m.x * WORLD_SCALE, m.z * WORLD_SCALE, m.y * WORLD_SCALE);
        mg.rotation.y = -m.angle;
      }
    }

    // Update Shockwaves
    for (let i = 0; i < this.waveRings.length; i++) {
      const wm = this.waveRings[i];
      const sw = shockwaves[i];
      if (!sw) {
        wm.visible = false;
      } else {
        wm.visible = true;
        wm.position.set(sw.x * WORLD_SCALE, sw.z * WORLD_SCALE + 0.14, sw.y * WORLD_SCALE);
        const radiusM = Math.max(0.5, sw.r * WORLD_SCALE);
        wm.scale.setScalar(radiusM);
        const wMat = wm.material as THREE.MeshBasicMaterial;
        wMat.color.set(sw.color);
        wMat.opacity = Math.max(0, 1 - sw.r / sw.maxR);
      }
    }

    // Update Buoy Mines
    for (let i = 0; i < this.mineGroup.length; i++) {
      const mg = this.mineGroup[i];
      const mn = mines[i];
      if (!mn) {
        mg.visible = false;
      } else {
        mg.visible = true;
        mg.position.set(
          mn.x * WORLD_SCALE,
          mn.z * WORLD_SCALE + 0.45 + Math.sin(simTime * 5 + i) * 0.14,
          mn.y * WORLD_SCALE
        );
        mg.rotation.y = simTime * 2.4 + i;
      }
    }

    this.renderer.render(this.scene, this.camera);

    // Update & render 2D FX Overlay (Speed Streaks, Water Droplets on Hood POV, Squid Ink Blots, Visor FX)
    if (params.waterSplashIntensity > 0.1 && Math.random() < params.waterSplashIntensity) {
      this.spawnWaterDroplets(effectiveCamMode === 'hood' ? 3 : 1);
    }
    for (let i = 0; i < MAX_WATER_DROPS; i++) {
      const d = this.waterDrops[i];
      if (!d.active) continue;
      d.life -= dt;
      d.y += d.vy * dt;
      if (d.life <= 0 || d.y > 1.05) d.active = false;
    }

    this.renderFxOverlay(
      gameState === 'playing' ? this.chaseState.speedLinesIntensity : 0,
      effectiveCamMode,
      simTime,
      params.lightningFlash,
      params.playerUnderglow,
      Boolean(
        focusRacer &&
          (focusRacer.nitroTimer > 0 || focusRacer.turboTimer > 0 || focusRacer.miniTurboTimer > 0)
      ),
      Boolean(focusRacer && focusRacer.shieldTimer > 0),
      Boolean(focusRacer && focusRacer.empTimer > 0),
      inkSplatters
    );

    if (gameState === 'playing') {
      this.renderTacticalGPSMinimap(track, racers);
    }
  }

  private renderFxOverlay(
    intensity: number,
    cameraMode: CameraMode,
    simTime: number,
    lightningFlash: number,
    glowHex: string,
    boostActive: boolean,
    shieldActive: boolean,
    empActive: boolean,
    inkSplatters: InkSplatterState[]
  ): void {
    const w = this.fxCanvas.width;
    const h = this.fxCanvas.height;
    const ctx = this.fxCtx;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.hypot(cx, cy);

    // 1. High-Speed Wind / Foam Streak Lines (>80% speed or Boost)
    if (intensity > 0.05) {
      ctx.save();
      ctx.strokeStyle = boostActive ? glowHex : '#e0f2fe';
      ctx.globalAlpha = Math.min(0.75, intensity * (cameraMode === 'hood' ? 0.58 : 0.45));
      ctx.lineWidth = Math.max(1.5, w * 0.002);
      ctx.beginPath();
      const lineCount = cameraMode === 'hood' ? 28 : 22;
      for (let i = 0; i < lineCount; i++) {
        const a = (i / lineCount) * Math.PI * 2 + Math.sin(simTime * 11 + i) * 0.05;
        const r1 = maxR * (0.58 + ((simTime * 5.2 + i * 0.29) % 0.26));
        const r2 = maxR * 1.05;
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      }
      ctx.stroke();

      if (boostActive) {
        const edgeGrad = ctx.createRadialGradient(cx, cy, maxR * 0.55, cx, cy, maxR);
        edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
        edgeGrad.addColorStop(1, glowHex);
        ctx.globalAlpha = 0.26 * intensity;
        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
    }

    // 2. Translucent Water Droplet Splatters on Camera Lens / Visor (prominent in Hood POV)
    let hasDrops = false;
    for (let i = 0; i < MAX_WATER_DROPS; i++) {
      if (this.waterDrops[i].active) {
        hasDrops = true;
        break;
      }
    }
    if (hasDrops) {
      ctx.save();
      for (let i = 0; i < MAX_WATER_DROPS; i++) {
        const d = this.waterDrops[i];
        if (!d.active) continue;
        const alpha = Math.min(1, d.life / d.maxLife) * (cameraMode === 'hood' ? 0.52 : 0.28);
        const px = d.x * w;
        const py = d.y * h;
        const pr = d.r * (w / 1000);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(186, 230, 253, 0.45)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(px, py, pr, pr * 1.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(px - pr * 0.28, py - pr * 0.35, Math.max(1.2, pr * 0.24), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 3. First-Person Shield Visor / EMP edge tint
    if (cameraMode === 'hood' && (shieldActive || empActive)) {
      ctx.save();
      const visorGrad = ctx.createRadialGradient(cx, cy, maxR * 0.62, cx, cy, maxR);
      visorGrad.addColorStop(0, 'rgba(0,0,0,0)');
      visorGrad.addColorStop(1, empActive ? 'rgba(168, 85, 247, 0.42)' : 'rgba(56, 189, 248, 0.32)');
      ctx.fillStyle = visorGrad;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 4. Squid Ink Splatters on Camera Lens
    if (inkSplatters.length > 0) {
      ctx.save();
      for (const ink of inkSplatters) {
        if (ink.alpha <= 0.01) continue;
        const px = ink.x * w;
        const py = ink.y * h;
        const pr = ink.r * Math.min(w, h);
        ctx.globalAlpha = Math.min(0.94, ink.alpha);
        ctx.fillStyle = '#070b14';
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fill();
        for (let b = 0; b < 6; b++) {
          const ba = (b / 6) * Math.PI * 2 + ink.x * 5;
          ctx.beginPath();
          ctx.arc(px + Math.cos(ba) * pr * 0.85, py + Math.sin(ba) * pr * 0.85, pr * 0.42, 0, Math.PI * 2);
          ctx.fill();
        }
        // Downward ink drip
        ctx.beginPath();
        ctx.ellipse(px + pr * 0.15, py + pr * 1.15, pr * 0.16, pr * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
        // Wet glossy highlight
        ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
        ctx.beginPath();
        ctx.arc(px - pr * 0.25, py - pr * 0.25, pr * 0.18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (lightningFlash > 0) {
      ctx.fillStyle = `rgba(254, 249, 195, ${(lightningFlash * 0.55).toFixed(2)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private ensureMinimapBg(track: CompiledTrack): void {
    if (this.cachedMinimapTrackId === track.id && this.minimapBg) return;
    this.cachedMinimapTrackId = track.id;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const bg = document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    const bctx = bg.getContext('2d')!;

    bctx.fillStyle = 'rgba(4, 12, 26, 0.92)';
    bctx.fillRect(0, 0, w, h);
    bctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
    bctx.lineWidth = 1;
    for (let x = 24; x < w; x += 28) {
      bctx.beginPath();
      bctx.moveTo(x, 0);
      bctx.lineTo(x, h);
      bctx.stroke();
    }
    for (let y = 24; y < h; y += 28) {
      bctx.beginPath();
      bctx.moveTo(0, y);
      bctx.lineTo(w, y);
      bctx.stroke();
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pt of track.main) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    const pad = 18;
    const scale = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1));
    const ox = (w - (maxX - minX) * scale) / 2 - minX * scale;
    const oy = (h - (maxY - minY) * scale) / 2 - minY * scale;
    this.minimapTransform = { scale, ox, oy };

    const drawPath = (arr: { x: number; y: number }[], closed: boolean, color: string, lw: number) => {
      bctx.strokeStyle = color;
      bctx.lineWidth = lw;
      bctx.lineCap = 'round';
      bctx.lineJoin = 'round';
      bctx.beginPath();
      arr.forEach((pt, idx) => {
        const px = pt.x * scale + ox;
        const py = pt.y * scale + oy;
        if (idx === 0) bctx.moveTo(px, py);
        else bctx.lineTo(px, py);
      });
      if (closed) bctx.closePath();
      bctx.stroke();
    };

    drawPath(track.main, true, 'rgba(34, 211, 238, 0.25)', 12);
    drawPath(track.main, true, '#22d3ee', 4.5);
    for (const br of track.branches) {
      drawPath(br.samples, false, 'rgba(250, 204, 21, 0.72)', 3);
    }

    const sf = track.main[0];
    bctx.fillStyle = '#ffffff';
    bctx.fillRect(sf.x * scale + ox - 4, sf.y * scale + oy - 4, 8, 8);

    this.minimapBg = bg;
  }

  public renderTacticalGPSMinimap(track: CompiledTrack, racers: RacerSimState[]): void {
    this.ensureMinimapBg(track);
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const ctx = this.minimapCtx;
    ctx.clearRect(0, 0, w, h);
    if (this.minimapBg) ctx.drawImage(this.minimapBg, 0, 0);

    const { scale, ox, oy } = this.minimapTransform;

    for (let i = 1; i < racers.length; i++) {
      const r = racers[i];
      const rx = r.x * scale + ox;
      const ry = r.y * scale + oy;
      ctx.fillStyle = '#f43f5e';
      ctx.strokeStyle = '#090d1a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx, ry, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const player = racers[0];
    if (player) {
      const px = player.x * scale + ox;
      const py = player.y * scale + oy;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(player.angle);
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#090d1a';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-7, -6.5);
      ctx.lineTo(-3.5, 0);
      ctx.lineTo(-7, 6.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  public dispose(): void {
    if (this.trackHandle) {
      this.trackHandle.dispose();
    }
    this.craftHandles.forEach((h) => h.dispose());
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.missileGeo.dispose();
    this.missileMat.dispose();
    this.waveGeo.dispose();
    this.waveRings.forEach((w) => (w.material as THREE.Material).dispose());
    this.mineCoreGeo.dispose();
    this.mineSpikeGeo.dispose();
    this.mineCoreMat.dispose();
    this.mineGlowMat.dispose();
    this.textures.dispose();
    this.renderer.dispose();
  }
}
