import * as THREE from 'three';
import {
  TRACK_DEFS,
  WORLD_SCALE,
  generateTrackCoins,
  sampleBranchSpline,
  sampleClosedSpline,
  type TrackDef,
  type TrackSample,
  type TunnelTheme,
} from './hydroEngine';
import { createSkyDomeTexture, type ProceduralTextureSet } from './textures';

export interface ObstacleItem {
  kind:
    | 'whirlpool'
    | 'buoy'
    | 'log'
    | 'ice'
    | 'croc'
    | 'lily'
    | 'hotrock'
    | 'crystal'
    | 'geyser'
    | 'boulder';
  x: number;
  y: number;
  z: number;
  baseX?: number;
  baseY?: number;
  tx?: number;
  ty?: number;
  r: number;
  angle: number;
  phase: number;
  brokenTimer?: number;
  sideSign?: number;
}

export interface CannonItem {
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  period: number;
  phase: number;
}

export interface PowerBoxItem {
  x: number;
  y: number;
  z: number;
  respawn: number;
  phase: number;
}

export interface CoinItem {
  x: number;
  y: number;
  z: number;
  respawn: number;
  phase: number;
}

export interface RampItem {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  w: number;
}

export interface TrafficBoatItem {
  laneIdx: number;
  offset: number;
  speed: number;
  color: string;
  crossing?: boolean;
  crossX?: number;
  crossY?: number;
  nx?: number;
  ny?: number;
  tx?: number;
  ty?: number;
  halfWidth?: number;
  phase?: number;
}

export interface SceneryItem {
  x: number;
  y: number;
  size: number;
  angle: number;
  variant: number;
  neonColor: string;
}

export interface CompiledTrack extends Omit<TrackDef, 'branches'> {
  main: TrackSample[];
  branches: {
    id: string;
    label: string;
    forkS: number;
    mergeS: number;
    samples: TrackSample[];
  }[];
  obstacles: ObstacleItem[];
  mudZones: { x: number; y: number; r: number }[];
  powerBoxes: PowerBoxItem[];
  coins: CoinItem[];
  ramps: RampItem[];
  bridgesOver: { x: number; y: number; nx: number; ny: number; tx: number; ty: number; w: number }[];
  docks: { x: number; y: number; angle: number }[];
  sceneries: SceneryItem[];
  trafficBoats: TrafficBoatItem[];
  cannons: CannonItem[];
}

function findFlatSampleZ(lanes: TrackSample[][], x: number, y: number): number {
  let bestD2 = Infinity;
  let bestZ = 0;
  for (const arr of lanes) {
    for (let i = 0; i < arr.length; i++) {
      const pt = arr[i];
      const dx = x - pt.x;
      const dy = y - pt.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestZ = pt.z;
      }
    }
  }
  return bestZ;
}

export function buildCompiledTrack(def: TrackDef): CompiledTrack {
  const main = sampleClosedSpline(def.points, 15, 'main');
  const branches = def.branches.map((b) => ({
    id: b.id,
    label: b.label,
    forkS: b.forkIdx / def.points.length,
    mergeS: b.mergeIdx / def.points.length,
    samples: sampleBranchSpline(def.points, b, 14),
  }));

  let seed = def.id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 17);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const obstacles: ObstacleItem[] = [];
  const mudZones: { x: number; y: number; r: number }[] = [];
  const powerBoxes: PowerBoxItem[] = [];
  const ramps: RampItem[] = [];
  const bridgesOver: { x: number; y: number; nx: number; ny: number; tx: number; ty: number; w: number }[] = [];
  const docks: { x: number; y: number; angle: number }[] = [];
  const sceneries: SceneryItem[] = [];
  const trafficBoats: TrafficBoatItem[] = [];
  const cannons: CannonItem[] = [];

  const allLanes = [main, ...branches.map((b) => b.samples)];

  for (let i = 10; i < main.length - 8; i += 24) {
    const pt = main[i];
    for (let c = 0; c < 3; c++) {
      const offset = (c - 1) * (pt.halfWidth * 0.42);
      powerBoxes.push({
        x: pt.x + pt.nx * offset,
        y: pt.y + pt.ny * offset,
        z: pt.z,
        respawn: 0,
        phase: rand() * Math.PI * 2,
      });
    }
  }
  for (const br of branches) {
    const mid = br.samples[Math.floor(br.samples.length * 0.45)];
    if (mid) {
      powerBoxes.push({ x: mid.x, y: mid.y, z: mid.z, respawn: 0, phase: rand() * 6 });
      powerBoxes.push({
        x: mid.x + mid.nx * 55,
        y: mid.y + mid.ny * 55,
        z: mid.z,
        respawn: 0,
        phase: rand() * 6,
      });
    }
  }

  for (const lane of allLanes) {
    // Spawn one launch ramp at the midpoint of each contiguous 'ramp' surface run
    let runStart = -1;
    for (let i = 6; i < lane.length - 4; i++) {
      const pt = lane[i];
      if (pt.surface === 'ramp') {
        if (runStart < 0) runStart = i;
      } else if (runStart >= 0) {
        const midIdx = Math.floor((runStart + i - 1) * 0.5);
        const rpt = lane[midIdx];
        ramps.push({ x: rpt.x, y: rpt.y, z: rpt.z, tx: rpt.tx, ty: rpt.ty, w: rpt.halfWidth * 0.85 });
        runStart = -1;
      }
    }
    if (runStart >= 0) {
      const midIdx = Math.floor((runStart + lane.length - 5) * 0.5);
      const rpt = lane[midIdx];
      ramps.push({ x: rpt.x, y: rpt.y, z: rpt.z, tx: rpt.tx, ty: rpt.ty, w: rpt.halfWidth * 0.85 });
    }

    for (let i = 10; i < lane.length - 6; i++) {
      const pt = lane[i];

      if (
        def.biome === 'city' &&
        lane === main &&
        (i === 52 || i === 116 || i === 210) &&
        pt.z < 5 &&
        Math.hypot(pt.x, pt.y) > 460
      ) {
        bridgesOver.push({
          x: pt.x,
          y: pt.y,
          nx: pt.nx,
          ny: pt.ny,
          tx: pt.tx,
          ty: pt.ty,
          w: pt.halfWidth * 2.35,
        });
        // Crossing patrol boat oscillating perpendicular to canal intersection
        trafficBoats.push({
          laneIdx: i,
          offset: 0,
          speed: 1.5 + rand() * 0.5,
          color: i === 116 ? '#38bdf8' : '#f43f5e',
          crossing: true,
          crossX: pt.x,
          crossY: pt.y,
          nx: pt.nx,
          ny: pt.ny,
          tx: pt.tx,
          ty: pt.ty,
          halfWidth: pt.halfWidth * 0.72,
          phase: rand() * Math.PI * 2,
        });
      }

      if ((def.biome === 'city' || def.biome === 'volcano' || def.biome === 'pirate') && i % 26 === 0 && pt.z < 10) {
        const side = rand() > 0.5 ? 1 : -1;
        docks.push({
          x: pt.x + pt.nx * side * (pt.halfWidth + 14),
          y: pt.y + pt.ny * side * (pt.halfWidth + 14),
          angle: Math.atan2(pt.ty, pt.tx),
        });
      }

      // Pirate Cove cliffside cannons firing arcing cannonballs onto the water
      if (def.biome === 'pirate' && lane === main && !pt.tunnel && pt.z < 12 && (i === 28 || i === 74 || i === 104 || i === 174)) {
        const side = i % 2 === 0 ? 1 : -1;
        const sx = pt.x + pt.nx * side * (pt.halfWidth + 130);
        const sy = pt.y + pt.ny * side * (pt.halfWidth + 130);
        const targetOffset = (rand() - 0.5) * pt.halfWidth * 0.75;
        cannons.push({
          sx,
          sy,
          sz: 85,
          tx: pt.x + pt.nx * targetOffset,
          ty: pt.y + pt.ny * targetOffset,
          tz: pt.z,
          period: 3.4 + rand() * 1.1,
          phase: rand() * 3.4,
        });
      }

      // Spawn surface obstacles (avoid water-based hazards high up on elevated bridges)
      if (i % 13 === 0 && i > 14 && pt.z < 15) {
        const offset = (rand() - 0.5) * pt.halfWidth * 1.12;
        const ox = pt.x + pt.nx * offset;
        const oy = pt.y + pt.ny * offset;

        if (def.biome === 'lagoon') {
          const kind = rand() < 0.28 ? 'whirlpool' : rand() < 0.65 ? 'buoy' : 'log';
          obstacles.push({
            kind,
            x: ox,
            y: oy,
            z: pt.z,
            r: kind === 'whirlpool' ? 48 : 22,
            angle: rand() * 6,
            phase: rand() * 6,
          });
        } else if (def.biome === 'city') {
          if (rand() < 0.44 && lane === main && pt.z < 3) {
            trafficBoats.push({
              laneIdx: i,
              offset: (rand() - 0.5) * pt.halfWidth * 0.68,
              speed: 110 + rand() * 65,
              color: rand() > 0.5 ? '#f59e0b' : '#cbd5e1',
            });
          } else {
            obstacles.push({
              kind: rand() < 0.68 ? 'buoy' : 'whirlpool',
              x: ox,
              y: oy,
              z: pt.z,
              r: 24,
              angle: 0,
              phase: rand() * 6,
            });
          }
        } else if (def.biome === 'arctic') {
          const kind = rand() < 0.76 ? 'ice' : 'whirlpool';
          obstacles.push({
            kind,
            x: ox,
            y: oy,
            z: pt.z,
            r: kind === 'ice' ? 32 : 46,
            angle: rand() * 6,
            phase: rand() * 6,
            brokenTimer: 0,
          });
        } else if (def.biome === 'swamp') {
          if (rand() < 0.34) {
            mudZones.push({ x: ox, y: oy, r: 62 });
          } else {
            const r = rand();
            const kind = r < 0.34 ? 'croc' : r < 0.62 ? 'whirlpool' : r < 0.82 ? 'log' : 'lily';
            obstacles.push({
              kind,
              x: ox,
              y: oy,
              z: pt.z,
              baseX: ox,
              baseY: oy,
              tx: pt.nx,
              ty: pt.ny,
              r: kind === 'whirlpool' ? 46 : kind === 'croc' ? 30 : 26,
              angle: Math.atan2(pt.ty, pt.tx) + (rand() - 0.5),
              phase: rand() * 6,
            });
          }
        } else if (def.biome === 'volcano') {
          const r = rand();
          const kind = r < 0.38 ? 'geyser' : r < 0.72 ? 'boulder' : 'hotrock';
          obstacles.push({
            kind,
            x: ox,
            y: oy,
            z: pt.z,
            baseX: pt.x,
            baseY: pt.y,
            tx: pt.nx,
            ty: pt.ny,
            r: kind === 'geyser' ? 36 : kind === 'boulder' ? 28 : 26,
            angle: rand() * 6,
            phase: rand() * 6,
            sideSign: pt.halfWidth * 0.78,
          });
        } else if (def.biome === 'pirate') {
          const kind = rand() < 0.55 ? 'buoy' : rand() < 0.8 ? 'log' : 'whirlpool';
          obstacles.push({
            kind,
            x: ox,
            y: oy,
            z: pt.z,
            r: kind === 'whirlpool' ? 48 : 24,
            angle: rand() * 6,
            phase: rand() * 6,
          });
        }
      }

      if (i % 4 === 0 && !pt.tunnel) {
        for (const side of [-1, 1]) {
          if (rand() > 0.65) continue;
          const dist = pt.halfWidth + 70 + rand() * 170;
          const sx = pt.x + pt.nx * side * dist;
          const sy = pt.y + pt.ny * side * dist;
          let clear = true;
          for (let k = 0; k < main.length; k += 4) {
            if (Math.hypot(sx - main[k].x, sy - main[k].y) < main[k].halfWidth + 38) {
              clear = false;
              break;
            }
          }
          if (clear) {
            for (const br of branches) {
              for (let k = 0; k < br.samples.length; k += 3) {
                if (Math.hypot(sx - br.samples[k].x, sy - br.samples[k].y) < br.samples[k].halfWidth + 38) {
                  clear = false;
                  break;
                }
              }
              if (!clear) break;
            }
          }
          if (clear) {
            sceneries.push({
              x: sx,
              y: sy,
              size: 28 + rand() * 34,
              angle: rand() * Math.PI * 2,
              variant: Math.floor(rand() * 3),
              neonColor: ['#f43f5e', '#22d3ee', '#facc15', '#a855f7'][Math.floor(rand() * 4)],
            });
          }
        }
      }
    }
  }

  if (def.biome === 'lagoon') {
    const rpt = main[28];
    ramps.push({ x: rpt.x, y: rpt.y, z: rpt.z, tx: rpt.tx, ty: rpt.ty, w: 120 });
  }

  const coins: CoinItem[] = generateTrackCoins(main, branches).map((c) => ({
    ...c,
    z: c.z ?? findFlatSampleZ(allLanes, c.x, c.y),
    respawn: 0,
  }));

  return {
    ...def,
    main,
    branches,
    obstacles,
    mudZones,
    powerBoxes,
    coins,
    ramps,
    bridgesOver,
    docks,
    sceneries,
    trafficBoats,
    cannons,
  };
}

export const COMPILED_TRACKS: CompiledTrack[] = TRACK_DEFS.map(buildCompiledTrack);

/**
 * Height- and progress-aware nearest track sample lookup.
 * When `currentZ` / `lastS` are supplied, prevents racers on an elevated overpass (z ~ 145)
 * from cross-snapping onto the lower perpendicular water canal (z = 0) at Figure-8 crossings.
 */
export function findNearestSample(
  track: CompiledTrack,
  x: number,
  y: number,
  preferredLaneId: string | null = null,
  currentZ?: number,
  lastS?: number
): { sample: TrackSample; idx: number; arr: TrackSample[]; dist: number } {
  let best: { sample: TrackSample; idx: number; arr: TrackSample[]; dist: number } | null = null;
  let bestDistSq = Infinity;

  const scan = (arr: TrackSample[], bias: number) => {
    for (let i = 0; i < arr.length; i++) {
      const pt = arr[i];
      const dx = x - pt.x;
      const dy = y - pt.y;
      const dzPenalty = currentZ !== undefined ? Math.pow(pt.z - currentZ, 2) * 1.25 : 0;
      let sPenalty = 0;
      if (lastS !== undefined) {
        const ds = Math.abs(pt.s - lastS);
        const circDs = Math.min(ds, 1 - ds);
        if (circDs > 0.22) {
          sPenalty = circDs * circDs * 3200000;
        }
      }
      const d2 = (dx * dx + dy * dy + dzPenalty + sPenalty) * bias;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        best = { sample: pt, idx: i, arr, dist: Math.hypot(dx, dy) };
      }
    }
  };

  scan(track.main, preferredLaneId === 'main' ? 0.92 : 1.0);
  for (const br of track.branches) {
    scan(br.samples, preferredLaneId === br.id ? 0.88 : 1.0);
  }
  return best!;
}

// ============================================================================
// THREE.JS 3D TRACK ENVIRONMENT BUILDER (ELEVATED OVERPASSES & TUNNELS)
// ============================================================================
export interface TrackSceneHandle {
  group: THREE.Group;
  update: (simTime: number) => void;
  dispose: () => void;
}

function buildRibbonGeometry(
  samples: TrackSample[],
  closed: boolean,
  widthOffsetMeters: number,
  yOffsetMeters: number,
  surfaceFilter?: (s: TrackSample) => boolean
): THREE.BufferGeometry {
  const n = samples.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let vertCount = 0;
  let accumDist = 0;
  const limit = closed ? n : n - 1;

  for (let i = 0; i < limit; i++) {
    const a = samples[i];
    const b = samples[(i + 1) % n];
    if (surfaceFilter && !surfaceFilter(a) && !surfaceFilter(b)) continue;

    const segLen = Math.hypot(b.x - a.x, b.y - a.y) * WORLD_SCALE;
    const wa = a.halfWidth * WORLD_SCALE + widthOffsetMeters;
    const wb = b.halfWidth * WORLD_SCALE + widthOffsetMeters;

    const ax = a.x * WORLD_SCALE;
    const ay = a.z * WORLD_SCALE + yOffsetMeters;
    const az = a.y * WORLD_SCALE;
    const bx = b.x * WORLD_SCALE;
    const by = b.z * WORLD_SCALE + yOffsetMeters;
    const bz = b.y * WORLD_SCALE;

    const v0 = vertCount;
    positions.push(
      ax - a.nx * wa, ay, az - a.ny * wa,
      ax + a.nx * wa, ay, az + a.ny * wa,
      bx - b.nx * wb, by, bz - b.ny * wb,
      bx + b.nx * wb, by, bz + b.ny * wb
    );

    const u0 = accumDist * 0.12;
    const u1 = (accumDist + segLen) * 0.12;
    accumDist += segLen;
    uvs.push(0, u0, 1, u0, 0, u1, 1, u1);

    indices.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
    vertCount += 4;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  if (positions.length > 0) {
    geo.computeVertexNormals();
  }
  geo.computeBoundingSphere();
  return geo;
}

export function buildTrackScene(
  track: CompiledTrack,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): TrackSceneHandle {
  const group = new THREE.Group();
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const mat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  // 0. Nocturnal Sky Dome
  const skyTex = createSkyDomeTexture(track.skyTop, track.skyHorizon, track.neonAccent, track.biome);
  disposables.push(skyTex);
  const skyDome = new THREE.Mesh(
    geo(new THREE.SphereGeometry(430, 24, 16)),
    mat(
      new THREE.MeshBasicMaterial({
        map: skyTex,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      })
    )
  );
  group.add(skyDome);

  // 1. Infinite Seamless Nocturnal Ocean Plane (y = -0.18)
  const oceanGeo = geo(new THREE.PlaneGeometry(1600, 1600));
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = mat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(track.fogColor).multiplyScalar(0.85),
      normalMap: textures.waterNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.28,
      metalness: 0.35,
    })
  );
  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.position.y = -0.18;
  oceanMesh.receiveShadow = true;
  group.add(oceanMesh);

  // 2. Bank / Shoreline Shoulders (follows ground level z = 0)
  const bankMat = mat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(track.bankColor),
      normalMap: textures.surfaceNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: textures.surfaceRoughness,
      roughness: track.biome === 'arctic' ? 0.35 : 0.85,
      metalness: track.biome === 'city' ? 0.25 : 0.06,
    })
  );
  group.add(
    new THREE.Mesh(
      geo(buildRibbonGeometry(track.main, true, 1.9, -0.07, (s) => s.z < 12)),
      bankMat
    )
  );
  for (const br of track.branches) {
    group.add(new THREE.Mesh(geo(buildRibbonGeometry(br.samples, false, 1.6, -0.07)), bankMat));
  }

  // 3. Stylized PBR Water Surface (Dual Crossed Normal Waves + Depth Gradient + Shoreline Foam)
  const waterMat = mat(
    isSoftwareGl
      ? new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: textures.waterAlbedo,
          normalMap: textures.waterNormal,
          normalScale: new THREE.Vector2(0.85, 0.85),
          roughnessMap: textures.waterRoughness,
          roughness: track.biome === 'lagoon' ? 0.14 : 0.18,
          metalness: track.biome === 'lagoon' ? 0.18 : 0.25,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          map: textures.waterAlbedo,
          normalMap: textures.waterNormal,
          normalScale: new THREE.Vector2(0.95, 0.95),
          roughnessMap: textures.waterRoughness,
          roughness: 0.14,
          metalness: track.biome === 'lagoon' ? 0.16 : 0.22,
          clearcoat: 1.0,
          clearcoatRoughness: 0.08,
          envMapIntensity: 1.45,
        })
  );
  const waterDeepColor = new THREE.Color(track.waterBase);
  const waterShallowColor = new THREE.Color(track.waterHighlight);
  const waterFoamColor = new THREE.Color(track.biome === 'volcano' ? 0xfdba74 : 0xe0f7ff);
  waterMat.customProgramCacheKey = () => `water_pbr_${track.id}_${isSoftwareGl ? 'sw' : 'hw'}`;
  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = { value: 0 };
    shader.uniforms.uWaterDeep = { value: waterDeepColor };
    shader.uniforms.uWaterShallow = { value: waterShallowColor };
    shader.uniforms.uFoamColor = { value: waterFoamColor };
    shader.uniforms.uWaterNormalTex = { value: textures.waterNormal };
    waterMat.userData.shader = shader;

    shader.vertexShader =
      `varying vec3 vWaterWorldPos;\nvarying float vChannelU;\nvarying vec3 vViewRight;\nvarying vec3 vViewFwd;\n` +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 waterWp = modelMatrix * vec4(transformed, 1.0);
        vWaterWorldPos = waterWp.xyz;
        vChannelU = uv.x;
        vViewRight = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vViewFwd = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);`
      );

    shader.fragmentShader =
      `uniform float uWaterTime;\nuniform vec3 uWaterDeep;\nuniform vec3 uWaterShallow;\nuniform vec3 uFoamColor;\nuniform sampler2D uWaterNormalTex;\nvarying vec3 vWaterWorldPos;\nvarying float vChannelU;\nvarying vec3 vViewRight;\nvarying vec3 vViewFwd;\n` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float edgeProx = abs(vChannelU - 0.5) * 2.0;
          float shallowMix = smoothstep(0.32, 0.94, edgeProx);
          vec3 waterTint = mix(uWaterDeep, uWaterShallow, shallowMix * 0.82);
          diffuseColor.rgb *= waterTint;
          float shoreWave = sin(vWaterWorldPos.x * 0.52 + uWaterTime * 3.1) * cos(vWaterWorldPos.z * 0.52 - uWaterTime * 2.7);
          float foamBand = smoothstep(0.76, 0.99, edgeProx + shoreWave * 0.08);
          diffuseColor.rgb = mix(diffuseColor.rgb, uFoamColor, foamBand * 0.65);`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          vec2 wUv1 = vWaterWorldPos.xz * 0.068 + vec2(uWaterTime * 0.045, -uWaterTime * 0.085);
          vec2 wUv2 = vWaterWorldPos.xz * 0.115 + vec2(-uWaterTime * 0.062, -uWaterTime * 0.038);
          vec3 rn1 = texture2D(uWaterNormalTex, wUv1).xyz * 2.0 - 1.0;
          vec3 rn2 = texture2D(uWaterNormalTex, wUv2).xyz * 2.0 - 1.0;
          float rnx = (rn1.x + rn2.x * 0.72) * 0.28;
          float rnz = (rn1.y + rn2.y * 0.72) * 0.28;
          normal = normalize(normal + vViewRight * rnx + vViewFwd * rnz);`
        );
  };

  const mainWater = new THREE.Mesh(geo(buildRibbonGeometry(track.main, true, 0, 0.0)), waterMat);
  mainWater.receiveShadow = true;
  group.add(mainWater);
  for (const br of track.branches) {
    const brWater = new THREE.Mesh(geo(buildRibbonGeometry(br.samples, false, 0, 0.0)), waterMat);
    brWater.receiveShadow = true;
    group.add(brWater);
  }

  // Contact Foam Collars shared material for pillars, ramps, and obstacles
  const contactFoamMat = mat(
    new THREE.MeshBasicMaterial({
      map: textures.foamRing,
      color: track.biome === 'volcano' ? 0xfdba74 : 0xe0f7ff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    })
  );
  const contactFoamMeshes: { mesh: THREE.Mesh; baseScale: number; phase: number }[] = [];

  // Arctic Ice Water Glazed Sheet Overlay
  if (track.biome === 'arctic') {
    const iceSheetMat = mat(
      new THREE.MeshStandardMaterial({
        color: 0xbaf3ff,
        emissive: new THREE.Color(0x0ea5e9),
        emissiveIntensity: 0.22,
        normalMap: textures.surfaceNormal,
        roughness: 0.08,
        metalness: 0.2,
        transparent: true,
        opacity: 0.42,
      })
    );
    const isIceWater = (s: TrackSample) => s.surface === 'ice_water';
    group.add(new THREE.Mesh(geo(buildRibbonGeometry(track.main, true, -0.8, 0.022, isIceWater)), iceSheetMat));
    for (const br of track.branches) {
      group.add(new THREE.Mesh(geo(buildRibbonGeometry(br.samples, false, -0.8, 0.022, isIceWater)), iceSheetMat));
    }
  }

  // Elevated Overpass Under-Deck & Support Pillars (z > 10)
  const viaductUnderMat = mat(
    new THREE.MeshStandardMaterial({
      color: track.biome === 'lagoon' ? 0x451a03 : 0x0f172a,
      normalMap: textures.surfaceNormal,
      roughness: 0.65,
      metalness: track.biome === 'lagoon' ? 0.12 : 0.45,
      side: THREE.DoubleSide,
    })
  );
  const elevatedFilter = (s: TrackSample) => s.z > 8;
  const underDeckGeo = geo(buildRibbonGeometry(track.main, true, 1.25, -0.35, elevatedFilter));
  if (underDeckGeo.getAttribute('position').count > 0) {
    group.add(new THREE.Mesh(underDeckGeo, viaductUnderMat));
  }

  // Viaduct Support Columns (kept clear of both branch canals and crossing Figure-8 main canals)
  const pillarCoords: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < track.main.length; i += 4) {
    const pt = track.main[i];
    if (pt.z < 18) continue;
    for (const side of [-1, 1]) {
      const px = pt.x + pt.nx * side * (pt.halfWidth + 14);
      const py = pt.y + pt.ny * side * (pt.halfWidth + 14);
      let hitsLowerCanal = false;
      for (let k = 0; k < track.main.length; k += 2) {
        const mPt = track.main[k];
        if (mPt.z < 20 && Math.hypot(px - mPt.x, py - mPt.y) < mPt.halfWidth + 24) {
          hitsLowerCanal = true;
          break;
        }
      }
      if (!hitsLowerCanal) {
        for (const br of track.branches) {
          for (let k = 0; k < br.samples.length; k += 2) {
            if (Math.hypot(px - br.samples[k].x, py - br.samples[k].y) < br.samples[k].halfWidth + 14) {
              hitsLowerCanal = true;
              break;
            }
          }
          if (hitsLowerCanal) break;
        }
      }
      if (!hitsLowerCanal) {
        pillarCoords.push({ x: px * WORLD_SCALE, y: pt.z * WORLD_SCALE, z: py * WORLD_SCALE });
      }
    }
  }
  if (pillarCoords.length > 0) {
    const colGeo = geo(new THREE.CylinderGeometry(0.42, 0.56, 1, 8));
    const colInst = new THREE.InstancedMesh(colGeo, viaductUnderMat, pillarCoords.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < pillarCoords.length; i++) {
      const pc = pillarCoords[i];
      const h = pc.y + 0.35;
      dummy.position.set(pc.x, h * 0.5 - 0.35, pc.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      colInst.setMatrixAt(i, dummy.matrix);
    }
    colInst.computeBoundingSphere();
    group.add(colInst);

    const pillarFoamGeo = geo(new THREE.PlaneGeometry(2.5, 2.5));
    pillarFoamGeo.rotateX(-Math.PI / 2);
    const pillarFoamInst = new THREE.InstancedMesh(pillarFoamGeo, contactFoamMat, pillarCoords.length);
    for (let i = 0; i < pillarCoords.length; i++) {
      const pc = pillarCoords[i];
      dummy.position.set(pc.x, 0.03, pc.z);
      dummy.rotation.set(0, i * 0.7, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pillarFoamInst.setMatrixAt(i, dummy.matrix);
    }
    pillarFoamInst.computeBoundingSphere();
    group.add(pillarFoamInst);
  }

  // Lava Channel Glow Strip (Volcano)
  if (track.biome === 'volcano') {
    const lavaMat = mat(
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: new THREE.Color(0xea580c),
        emissiveIntensity: 2.1,
        roughness: 0.35,
      })
    );
    const isLava = (s: TrackSample) => s.surface === 'lava_channel';
    group.add(new THREE.Mesh(geo(buildRibbonGeometry(track.main, true, -1.2, 0.024, isLava)), lavaMat));
    for (const br of track.branches) {
      group.add(new THREE.Mesh(geo(buildRibbonGeometry(br.samples, false, -1.0, 0.024, isLava)), lavaMat));
    }
  }

  // Boost Current Neon Flow Strip
  const boostMat = mat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(track.neonAccent),
      emissive: new THREE.Color(track.neonAccent),
      emissiveIntensity: 1.85,
      transparent: true,
      opacity: 0.78,
      roughness: 0.2,
    })
  );
  const isBoost = (s: TrackSample) => s.surface === 'boost_current';
  group.add(new THREE.Mesh(geo(buildRibbonGeometry(track.main, true, -3.2, 0.026, isBoost)), boostMat));
  for (const br of track.branches) {
    group.add(new THREE.Mesh(geo(buildRibbonGeometry(br.samples, false, -2.5, 0.026, isBoost)), boostMat));
  }

  // Thematic Bridges Surface Deck (Wooden Suspension Bridge in Lagoon, Metallic Drawbridge in City, Stone/Iron elsewhere)
  const useWoodBridge = track.biome === 'lagoon' || track.biome === 'swamp' || track.biome === 'pirate';
  const bridgeDeckMat = mat(
    new THREE.MeshStandardMaterial({
      map: useWoodBridge ? textures.bridgeWoodAlbedo : textures.bridgeMetalAlbedo,
      normalMap: textures.surfaceNormal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughnessMap: textures.surfaceRoughness,
      roughness: useWoodBridge ? 0.78 : 0.38,
      metalness: useWoodBridge ? 0.08 : 0.65,
    })
  );
  const isBridge = (s: TrackSample) => s.surface === 'bridge';
  group.add(new THREE.Mesh(geo(buildRibbonGeometry(track.main, true, -1.2, 0.035, isBridge)), bridgeDeckMat));
  for (const br of track.branches) {
    group.add(new THREE.Mesh(geo(buildRibbonGeometry(br.samples, false, -1.2, 0.035, isBridge)), bridgeDeckMat));
  }

  // Lagoon Wooden Suspension Bridge Towers & Side Rope Cables
  if (track.biome === 'lagoon') {
    const ropeMat = mat(new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 }));
    const postGeo = geo(new THREE.BoxGeometry(0.32, 3.8, 0.32));
    const bridgePts = track.main.filter((s, idx) => s.surface === 'bridge' && idx % 3 === 0);
    if (bridgePts.length > 0) {
      const postInst = new THREE.InstancedMesh(postGeo, ropeMat, bridgePts.length * 2);
      const dummy = new THREE.Object3D();
      let pIdx = 0;
      for (const pt of bridgePts) {
        for (const side of [-1, 1]) {
          dummy.position.set(
            (pt.x + pt.nx * side * (pt.halfWidth + 4)) * WORLD_SCALE,
            pt.z * WORLD_SCALE + 1.85,
            (pt.y + pt.ny * side * (pt.halfWidth + 4)) * WORLD_SCALE
          );
          dummy.rotation.set(0, -Math.atan2(pt.ty, pt.tx), 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          postInst.setMatrixAt(pIdx++, dummy.matrix);
        }
      }
      postInst.computeBoundingSphere();
      group.add(postInst);
    }
  }

  // 4. Modern NFS Safety Barriers + Illuminated Neon Top Trim (pitched cleanly along slopes!)
  const barrierPositions: { x: number; y: number; z: number; yaw: number; pitch: number; len: number }[] = [];
  const isNearBranchJunction = (pt: TrackSample) => {
    for (const br of track.branches) {
      const fPt = br.samples[0];
      const mPt = br.samples[br.samples.length - 1];
      if (Math.hypot(pt.x - fPt.x, pt.y - fPt.y) < 280 && Math.abs(pt.z - fPt.z) < 25) return true;
      if (Math.hypot(pt.x - mPt.x, pt.y - mPt.y) < 280 && Math.abs(pt.z - mPt.z) < 25) return true;
    }
    return false;
  };

  const collectBarriers = (samples: TrackSample[], closed: boolean) => {
    const n = samples.length;
    const step = 2;
    for (let i = 0; i < (closed ? n : n - step); i += step) {
      const a = samples[i];
      const b = samples[(i + step) % n];
      if (closed && isNearBranchJunction(a)) continue;
      for (const side of [-1, 1]) {
        const ax = (a.x + a.nx * side * (a.halfWidth + 14)) * WORLD_SCALE;
        const ay = a.z * WORLD_SCALE;
        const az = (a.y + a.ny * side * (a.halfWidth + 14)) * WORLD_SCALE;
        const bx = (b.x + b.nx * side * (b.halfWidth + 14)) * WORLD_SCALE;
        const by = b.z * WORLD_SCALE;
        const bz = (b.y + b.ny * side * (b.halfWidth + 14)) * WORLD_SCALE;
        const horizLen = Math.hypot(bx - ax, bz - az);
        const len = Math.hypot(horizLen, by - ay);
        if (horizLen < 0.2 || len > 18) continue;
        const yaw = -Math.atan2(bz - az, bx - ax);
        const pitch = Math.atan2(by - ay, horizLen);
        barrierPositions.push({
          x: (ax + bx) * 0.5,
          y: (ay + by) * 0.5,
          z: (az + bz) * 0.5,
          yaw,
          pitch,
          len,
        });
      }
    }
  };
  collectBarriers(track.main, true);
  for (const br of track.branches) collectBarriers(br.samples, false);

  if (barrierPositions.length > 0) {
    const railGeo = geo(new THREE.BoxGeometry(1, 0.58, 0.26));
    const railMat = mat(
      new THREE.MeshStandardMaterial({
        map: textures.barrierStripe,
        color: 0xffffff,
        roughness: 0.45,
        metalness: 0.35,
      })
    );
    const neonStripGeo = geo(new THREE.BoxGeometry(1, 0.11, 0.29));
    const neonStripMat = mat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(track.neonAccent),
        emissive: new THREE.Color(track.neonAccent),
        emissiveIntensity: 2.4,
        roughness: 0.2,
      })
    );

    const railInst = new THREE.InstancedMesh(railGeo, railMat, barrierPositions.length);
    const neonInst = new THREE.InstancedMesh(neonStripGeo, neonStripMat, barrierPositions.length);
    const dummy = new THREE.Object3D();
    dummy.rotation.order = 'YXZ';

    for (let i = 0; i < barrierPositions.length; i++) {
      const bp = barrierPositions[i];
      dummy.position.set(bp.x, bp.y + 0.29, bp.z);
      dummy.rotation.set(0, bp.yaw, bp.pitch);
      dummy.scale.set(bp.len * 1.03, 1, 1);
      dummy.updateMatrix();
      railInst.setMatrixAt(i, dummy.matrix);

      dummy.position.y = bp.y + 0.62;
      dummy.updateMatrix();
      neonInst.setMatrixAt(i, dummy.matrix);
    }
    railInst.computeBoundingSphere();
    neonInst.computeBoundingSphere();
    group.add(railInst);
    group.add(neonInst);
  }

  // 4b. Uniform Rhythmic Speed Pylons along track edges (extreme high-speed optical flow)
  const pylonCoords: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < track.main.length; i += 2) {
    const pt = track.main[i];
    if (isNearBranchJunction(pt)) continue;
    for (const side of [-1, 1]) {
      pylonCoords.push({
        x: (pt.x + pt.nx * side * (pt.halfWidth + 16)) * WORLD_SCALE,
        y: pt.z * WORLD_SCALE + 0.95,
        z: (pt.y + pt.ny * side * (pt.halfWidth + 16)) * WORLD_SCALE,
      });
    }
  }
  if (pylonCoords.length > 0) {
    const pylonPostGeo = geo(new THREE.BoxGeometry(0.14, 1.35, 0.14));
    const pylonHeadGeo = geo(new THREE.SphereGeometry(0.18, 6, 6));
    const pylonPostMat = mat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 }));
    const pylonHeadMat = mat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(track.neonSecondary),
        emissive: new THREE.Color(track.neonSecondary),
        emissiveIntensity: 2.8,
      })
    );
    const postInst = new THREE.InstancedMesh(pylonPostGeo, pylonPostMat, pylonCoords.length);
    const headInst = new THREE.InstancedMesh(pylonHeadGeo, pylonHeadMat, pylonCoords.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < pylonCoords.length; i++) {
      const pc = pylonCoords[i];
      dummy.position.set(pc.x, pc.y - 0.15, pc.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postInst.setMatrixAt(i, dummy.matrix);
      dummy.position.y = pc.y + 0.58;
      dummy.updateMatrix();
      headInst.setMatrixAt(i, dummy.matrix);
    }
    postInst.computeBoundingSphere();
    headInst.computeBoundingSphere();
    group.add(postInst);
    group.add(headInst);
  }

  // 5. Animated Luminous Curve Chevron Signs on Sharp Corners
  const chevronMats: THREE.MeshStandardMaterial[] = [];
  const sharpChevrons: { x: number; y: number; z: number; yaw: number }[] = [];
  for (let i = 0; i < track.main.length; i += 2) {
    const pt = track.main[i];
    if (Math.abs(pt.curvature) < 0.085) continue;
    const outerSide = pt.curvature > 0 ? -1 : 1;
    const wx = (pt.x + pt.nx * outerSide * (pt.halfWidth + 24)) * WORLD_SCALE;
    const wz = (pt.y + pt.ny * outerSide * (pt.halfWidth + 24)) * WORLD_SCALE;
    const faceYaw = -Math.atan2(pt.ty, pt.tx) + Math.PI * 0.5 + (pt.curvature > 0 ? 0.35 : -0.35);
    sharpChevrons.push({ x: wx, y: pt.z * WORLD_SCALE + 1.4, z: wz, yaw: faceYaw });
  }
  if (sharpChevrons.length > 0) {
    const chevGeo = geo(new THREE.BoxGeometry(2.8, 1.45, 0.18));
    const chevMat = mat(
      new THREE.MeshStandardMaterial({
        map: textures.chevronSign,
        emissiveMap: textures.chevronSign,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 1.8,
        roughness: 0.2,
      })
    );
    chevronMats.push(chevMat);
    const chevInst = new THREE.InstancedMesh(chevGeo, chevMat, sharpChevrons.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < sharpChevrons.length; i++) {
      const ch = sharpChevrons[i];
      dummy.position.set(ch.x, ch.y, ch.z);
      dummy.rotation.set(0, ch.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      chevInst.setMatrixAt(i, dummy.matrix);
    }
    chevInst.computeBoundingSphere();
    group.add(chevInst);
  }

  // 6. Start / Finish Gantry Arch & 8 Neon Checkpoint Arches
  const sf = track.main[0];
  const sfGroup = new THREE.Group();
  sfGroup.position.set(sf.x * WORLD_SCALE, sf.z * WORLD_SCALE, sf.y * WORLD_SCALE);
  sfGroup.rotation.y = -Math.atan2(sf.ty, sf.tx);
  const sfSpan = sf.halfWidth * 2 * WORLD_SCALE + 1.4;

  const gantryPillarMat = mat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.7 })
  );
  const gantryNeonMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: new THREE.Color(0xfacc15),
      emissiveIntensity: 2.8,
      roughness: 0.2,
    })
  );
  const bannerTex = textures.checkeredBanner.clone();
  bannerTex.needsUpdate = true;
  bannerTex.repeat.set(Math.max(4, Math.round(sfSpan / 2.6)), 1);
  disposables.push(bannerTex);
  const bannerMat = mat(
    new THREE.MeshStandardMaterial({
      map: bannerTex,
      emissiveMap: bannerTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.95,
      roughness: 0.3,
    })
  );

  for (const s of [-1, 1]) {
    const pillar = new THREE.Mesh(geo(new THREE.BoxGeometry(0.95, 6.8, 0.95)), gantryPillarMat);
    pillar.position.set(0, 3.4, s * (sfSpan * 0.5));
    sfGroup.add(pillar);

    const glowStrip = new THREE.Mesh(geo(new THREE.BoxGeometry(1.05, 6.2, 0.24)), gantryNeonMat);
    glowStrip.position.set(0, 3.4, s * (sfSpan * 0.5 - 0.3));
    sfGroup.add(glowStrip);
  }
  const crossBeam = new THREE.Mesh(geo(new THREE.BoxGeometry(1.1, 1.55, sfSpan + 0.8)), bannerMat);
  crossBeam.position.set(0, 6.2, 0);
  sfGroup.add(crossBeam);

  const sfStrip = new THREE.Mesh(geo(new THREE.PlaneGeometry(sfSpan - 1.2, 2.2)), bannerMat);
  sfStrip.rotation.order = 'YXZ';
  sfStrip.rotation.y = Math.PI / 2;
  sfStrip.rotation.x = -Math.PI / 2;
  sfStrip.position.y = 0.032;
  sfGroup.add(sfStrip);
  group.add(sfGroup);

  const archRingMat = mat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(track.neonSecondary),
      emissive: new THREE.Color(track.neonSecondary),
      emissiveIntensity: 2.2,
      roughness: 0.2,
    })
  );
  for (let sec = 1; sec < 8; sec++) {
    const idx = Math.floor((sec / 8) * track.main.length);
    const pt = track.main[idx];
    if (pt.tunnel) continue; // Tunnel ribs replace checkpoint arches inside tunnels
    // Skip arch if directly beneath an elevated Figure-8 overpass so posts never clip deck
    const underOverpass =
      pt.z < 20 &&
      track.main.some(
        (other) => other.z > 65 && Math.hypot(other.x - pt.x, other.y - pt.y) < 280
      );
    if (underOverpass) continue;
    const span = pt.halfWidth * 2 * WORLD_SCALE + 0.8;
    const archGroup = new THREE.Group();
    archGroup.position.set(pt.x * WORLD_SCALE, pt.z * WORLD_SCALE, pt.y * WORLD_SCALE);
    archGroup.rotation.y = -Math.atan2(pt.ty, pt.tx);

    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.22, 0.28, 5.2, 8)), gantryPillarMat);
      post.position.set(0, 2.6, s * (span * 0.5));
      archGroup.add(post);

      const beacon = new THREE.Mesh(geo(new THREE.SphereGeometry(0.32, 10, 10)), archRingMat);
      beacon.position.set(0, 5.2, s * (span * 0.5));
      archGroup.add(beacon);
    }
    const topBar = new THREE.Mesh(geo(new THREE.BoxGeometry(0.24, 0.24, span)), archRingMat);
    topBar.position.set(0, 5.2, 0);
    archGroup.add(topBar);
    group.add(archGroup);
  }

  // 7. Thematic 3D Tunnels (Glass Underwater Tube + Manta Rays, Neon Industrial, Volcano Magma, Ice Cavern Stalactites, Swamp Canopy, Pirate Treasure Cave)
  const tunnelStripMats: THREE.MeshStandardMaterial[] = [];
  const mantaSwimmers: {
    group: THREE.Group;
    leftWing: THREE.Mesh;
    rightWing: THREE.Mesh;
    baseX: number;
    baseZ: number;
    phase: number;
    speed: number;
    radius: number;
  }[] = [];

  const tunnelConfigs: Record<
    TunnelTheme,
    { wallColor: number; stripColor: number; stripAlt: number; translucent: boolean; textured: boolean }
  > = {
    glass_ocean: { wallColor: 0x0ea5e9, stripColor: 0x22d3ee, stripAlt: 0x38bdf8, translucent: true, textured: false },
    neon_industrial: { wallColor: 0x0f172a, stripColor: 0x22d3ee, stripAlt: 0xf43f5e, translucent: false, textured: true },
    volcano_magma: { wallColor: 0x291712, stripColor: 0xf97316, stripAlt: 0xfacc15, translucent: false, textured: true },
    ice_cavern: { wallColor: 0x0284c7, stripColor: 0x7dd3fc, stripAlt: 0x34d399, translucent: true, textured: false },
    swamp_canopy: { wallColor: 0x14532d, stripColor: 0xa3e635, stripAlt: 0xfacc15, translucent: false, textured: true },
    treasure_cave: { wallColor: 0x1e293b, stripColor: 0xfbbf24, stripAlt: 0xf43f5e, translucent: false, textured: true },
  };

  const createdTunnelMats = new Map<TunnelTheme, { wall: THREE.MeshStandardMaterial; s1: THREE.MeshStandardMaterial; s2: THREE.MeshStandardMaterial }>();
  const getTunnelMats = (theme: TunnelTheme) => {
    if (createdTunnelMats.has(theme)) return createdTunnelMats.get(theme)!;
    const cfg = tunnelConfigs[theme];
    const wall = mat(
      new THREE.MeshStandardMaterial({
        color: cfg.wallColor,
        map: cfg.textured ? textures.tunnelWallAlbedo : null,
        normalMap: cfg.textured ? textures.tunnelWallNormal : null,
        normalScale: new THREE.Vector2(0.85, 0.85),
        emissive: new THREE.Color(cfg.translucent ? cfg.wallColor : 0x000000),
        emissiveIntensity: cfg.translucent ? 0.25 : 0,
        roughness: cfg.translucent ? 0.12 : 0.72,
        metalness: cfg.translucent ? 0.15 : 0.35,
        transparent: cfg.translucent,
        opacity: cfg.translucent ? 0.34 : 0.96,
        side: THREE.DoubleSide,
      })
    );
    const s1 = mat(
      new THREE.MeshStandardMaterial({
        color: cfg.stripColor,
        emissive: new THREE.Color(cfg.stripColor),
        emissiveIntensity: 2.8,
      })
    );
    const s2 = mat(
      new THREE.MeshStandardMaterial({
        color: cfg.stripAlt,
        emissive: new THREE.Color(cfg.stripAlt),
        emissiveIntensity: 2.6,
      })
    );
    tunnelStripMats.push(s1, s2);
    const entry = { wall, s1, s2 };
    createdTunnelMats.set(theme, entry);
    return entry;
  };

  const mantaMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      emissive: new THREE.Color(0x38bdf8),
      emissiveIntensity: 0.48,
      roughness: 0.28,
    })
  );
  const chestGoldMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: new THREE.Color(0xd97706),
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.85,
    })
  );
  const rubyGemMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: new THREE.Color(0xe11d48),
      emissiveIntensity: 1.5,
      roughness: 0.12,
    })
  );
  const icicleMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: new THREE.Color(0x38bdf8),
      emissiveIntensity: 0.35,
      roughness: 0.12,
      transparent: true,
      opacity: 0.84,
    })
  );

  for (let i = 0; i < track.main.length; i += 2) {
    const pt = track.main[i];
    if (!pt.tunnel) continue;
    const nextPt = track.main[(i + 2) % track.main.length];
    const mats = getTunnelMats(pt.tunnel);
    const segLen = Math.max(3.5, Math.hypot(nextPt.x - pt.x, nextPt.y - pt.y) * WORLD_SCALE * 1.18);
    const span = pt.halfWidth * WORLD_SCALE + 1.0;

    const tg = new THREE.Group();
    tg.position.set(pt.x * WORLD_SCALE, pt.z * WORLD_SCALE, pt.y * WORLD_SCALE);
    tg.rotation.y = -Math.atan2(pt.ty, pt.tx);

    const shellGeo = geo(new THREE.CylinderGeometry(span, span, segLen, 12, 1, true, 0, Math.PI));
    shellGeo.rotateZ(Math.PI / 2);
    shellGeo.rotateY(Math.PI / 2);
    const shell = new THREE.Mesh(shellGeo, mats.wall);
    shell.position.y = 0.2;
    shell.scale.set(1, 0.72, 1);
    tg.add(shell);

    if (i % 4 === 0) {
      const ribGeo = geo(new THREE.TorusGeometry(span * 0.96, 0.34, 6, 16, Math.PI));
      const rib = new THREE.Mesh(ribGeo, mats.wall);
      rib.rotation.y = Math.PI / 2;
      rib.position.y = 0.2;
      rib.scale.set(1, 0.72, 1);
      tg.add(rib);

      const stripMat = (i / 4) % 2 === 0 ? mats.s1 : mats.s2;
      const roofStrip = new THREE.Mesh(geo(new THREE.BoxGeometry(0.45, 0.22, span * 0.85)), stripMat);
      roofStrip.position.set(0, span * 0.67, 0);
      tg.add(roofStrip);

      // Glass underwater tunnel: wing-flapping giant Manta Rays outside the glass dome
      if (pt.tunnel === 'glass_ocean' && i % 8 === 0) {
        const mg = new THREE.Group();
        const body = new THREE.Mesh(geo(new THREE.ConeGeometry(0.7, 2.5, 6)), mantaMat);
        body.rotation.z = -Math.PI / 2;
        body.scale.set(0.35, 1, 1.3);
        mg.add(body);
        const wingGeo = geo(new THREE.BoxGeometry(1.1, 0.08, 1.9));
        const leftWing = new THREE.Mesh(wingGeo, mantaMat);
        leftWing.position.set(0, 0, -1.1);
        mg.add(leftWing);
        const rightWing = new THREE.Mesh(wingGeo, mantaMat);
        rightWing.position.set(0, 0, 1.1);
        mg.add(rightWing);
        const tail = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.04, 0.1, 2.2, 5)), mantaMat);
        tail.rotation.z = Math.PI / 2;
        tail.position.set(-2.0, 0, 0);
        mg.add(tail);
        group.add(mg);
        mantaSwimmers.push({
          group: mg,
          leftWing,
          rightWing,
          baseX: pt.x * WORLD_SCALE,
          baseZ: pt.y * WORLD_SCALE,
          phase: i * 0.65,
          speed: 0.6 + (i % 3) * 0.2,
          radius: span + 2.8,
        });
      }

      // Ice Cavern hanging icicle stalactites
      if (pt.tunnel === 'ice_cavern') {
        for (const s of [-0.45, 0.45]) {
          const icicle = new THREE.Mesh(geo(new THREE.ConeGeometry(0.34, 2.1, 6)), icicleMat);
          icicle.rotation.x = Math.PI;
          icicle.position.set(0, span * 0.56, s * span);
          tg.add(icicle);
        }
      }

      // Treasure Cave gold chests & sparkling rubies lining the cave ledges
      if (pt.tunnel === 'treasure_cave') {
        for (const s of [-1, 1]) {
          const chest = new THREE.Mesh(geo(new THREE.BoxGeometry(1.1, 0.75, 0.85)), chestGoldMat);
          chest.position.set(0, 0.42, s * (span - 1.1));
          tg.add(chest);
          const gem = new THREE.Mesh(geo(new THREE.OctahedronGeometry(0.42, 0)), rubyGemMat);
          gem.position.set(0.3, 1.05, s * (span - 1.1));
          tg.add(gem);
        }
      }
    }
    group.add(tg);
  }

  // Swamp low-lying ground mist sheets
  if (track.biome === 'swamp') {
    const mistMat = mat(
      new THREE.MeshBasicMaterial({
        color: 0xa3e635,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const mistGeo = geo(new THREE.CircleGeometry(9.5, 16));
    mistGeo.rotateX(-Math.PI / 2);
    for (let i = 6; i < track.main.length; i += 8) {
      const pt = track.main[i];
      if (pt.z > 8) continue;
      const mist = new THREE.Mesh(mistGeo, mistMat);
      mist.position.set(pt.x * WORLD_SCALE, 0.38, pt.y * WORLD_SCALE);
      group.add(mist);
    }
  }

  // 8. Overpass Drawbridges (City visual spans with metallic texture & warning lights)
  const bridgeAmberMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: new THREE.Color(0xf59e0b),
      emissiveIntensity: 2.2,
    })
  );
  for (const br of track.bridgesOver) {
    const bg = new THREE.Group();
    bg.position.set(br.x * WORLD_SCALE, 4.4, br.y * WORLD_SCALE);
    bg.rotation.y = -Math.atan2(br.ny, br.nx);
    const deck = new THREE.Mesh(
      geo(new THREE.BoxGeometry(br.w * WORLD_SCALE, 0.8, 3.8)),
      bridgeDeckMat
    );
    bg.add(deck);
    const rail = new THREE.Mesh(
      geo(new THREE.BoxGeometry(br.w * WORLD_SCALE, 0.2, 4.0)),
      archRingMat
    );
    rail.position.y = 0.45;
    bg.add(rail);
    for (const s of [-1, 1]) {
      const tower = new THREE.Mesh(geo(new THREE.BoxGeometry(0.9, 3.2, 0.9)), gantryPillarMat);
      tower.position.set(s * (br.w * WORLD_SCALE * 0.45), 1.6, 0);
      bg.add(tower);
      const beacon = new THREE.Mesh(geo(new THREE.SphereGeometry(0.28, 8, 8)), bridgeAmberMat);
      beacon.position.set(s * (br.w * WORLD_SCALE * 0.45), 3.35, 0);
      bg.add(beacon);
    }
    group.add(bg);
  }

  // 9. Jump Ramps (Split Pirate Galleons in Pirate Cove, Neon Launch Ramps elsewhere)
  const rampMat = mat(
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.2 })
  );
  const rampNeonMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: new THREE.Color(0xfacc15),
      emissiveIntensity: 2.5,
    })
  );
  const galleonWoodMat = mat(
    new THREE.MeshStandardMaterial({
      map: textures.bridgeWoodAlbedo,
      normalMap: textures.surfaceNormal,
      roughness: 0.82,
    })
  );
  const sailMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: new THREE.Color(0x92400e),
      emissiveIntensity: 0.25,
      side: THREE.DoubleSide,
    })
  );

  for (const rm of track.ramps) {
    const rg = new THREE.Group();
    rg.position.set(rm.x * WORLD_SCALE, rm.z * WORLD_SCALE, rm.y * WORLD_SCALE);
    rg.rotation.y = -Math.atan2(rm.ty, rm.tx);
    if (track.biome === 'pirate') {
      const deckHull = new THREE.Mesh(geo(new THREE.BoxGeometry(5.4, 0.85, 5.4)), galleonWoodMat);
      deckHull.position.set(0, 0.42, 0);
      deckHull.rotation.z = 0.22;
      rg.add(deckHull);
      const bowProw = new THREE.Mesh(geo(new THREE.ConeGeometry(1.8, 3.2, 5)), galleonWoodMat);
      bowProw.rotation.z = -Math.PI / 2 + 0.22;
      bowProw.position.set(3.2, 1.05, 0);
      rg.add(bowProw);
      const mast = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.16, 0.22, 5.2, 7)), galleonWoodMat);
      mast.position.set(-0.6, 2.8, -2.1);
      rg.add(mast);
      const sail = new THREE.Mesh(geo(new THREE.PlaneGeometry(2.6, 2.4)), sailMat);
      sail.position.set(-0.2, 3.6, -2.0);
      rg.add(sail);
      const lip = new THREE.Mesh(geo(new THREE.BoxGeometry(0.32, 0.2, 5.4)), rampNeonMat);
      lip.position.set(2.55, 1.05, 0);
      rg.add(lip);
    } else {
      const wedge = new THREE.Mesh(geo(new THREE.BoxGeometry(3.8, 0.65, 4.8)), rampMat);
      wedge.position.set(0, 0.28, 0);
      wedge.rotation.z = 0.24;
      rg.add(wedge);
      const lip = new THREE.Mesh(geo(new THREE.BoxGeometry(0.28, 0.2, 4.95)), rampNeonMat);
      lip.position.set(1.82, 0.72, 0);
      rg.add(lip);
    }
    const rampFoamGeo = geo(new THREE.PlaneGeometry(5.6, 5.8));
    rampFoamGeo.rotateX(-Math.PI / 2);
    const rampFoam = new THREE.Mesh(rampFoamGeo, contactFoamMat);
    rampFoam.position.y = 0.036;
    rg.add(rampFoam);
    contactFoamMeshes.push({ mesh: rampFoam, baseScale: 1.0, phase: rm.x * 0.01 });
    group.add(rg);
  }

  // 10. Mud Zones (Swamp)
  const mudMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0x451a03,
      roughness: 0.9,
      metalness: 0.05,
    })
  );
  for (const mz of track.mudZones) {
    const mud = new THREE.Mesh(
      geo(new THREE.CircleGeometry(mz.r * WORLD_SCALE, 18)),
      mudMat
    );
    mud.rotation.x = -Math.PI / 2;
    mud.position.set(mz.x * WORLD_SCALE, 0.025, mz.y * WORLD_SCALE);
    group.add(mud);
  }

  // 11. Rim-Lit & Dynamic Biome Obstacles
  const obstacleDynamicMeshes: { mesh: THREE.Object3D; ob: ObstacleItem; plume?: THREE.Mesh }[] = [];
  const buoyRedMat = mat(new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.35 }));
  const buoyGlowMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: new THREE.Color(0xfacc15),
      emissiveIntensity: 2.8,
    })
  );
  const logMat = mat(new THREE.MeshStandardMaterial({ map: textures.bridgeWoodAlbedo, color: 0x92400e, roughness: 0.85 }));
  const iceMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.55,
      roughness: 0.16,
      metalness: 0.15,
    })
  );
  const hotRockMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0x292524,
      emissive: new THREE.Color(0xf97316),
      emissiveIntensity: 1.25,
      roughness: 0.7,
    })
  );
  const boulderMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0x44403c,
      emissive: new THREE.Color(0xea580c),
      emissiveIntensity: 0.85,
      normalMap: textures.surfaceNormal,
      roughness: 0.75,
    })
  );
  const geyserVentMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      emissive: new THREE.Color(0x38bdf8),
      emissiveIntensity: 1.6,
      roughness: 0.4,
    })
  );
  const steamMat = mat(
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const crystalMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      emissive: new THREE.Color(0x14b8a6),
      emissiveIntensity: 1.5,
      roughness: 0.15,
      metalness: 0.2,
    })
  );
  const crocMat = mat(new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.65 }));
  const lilyMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: new THREE.Color(0x166534),
      emissiveIntensity: 0.35,
      roughness: 0.7,
    })
  );
  const whirlMat = mat(
    new THREE.MeshBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const rimRingMat = mat(
    new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );

  for (const ob of track.obstacles) {
    const obGroup = new THREE.Group();
    obGroup.position.set(ob.x * WORLD_SCALE, ob.z * WORLD_SCALE, ob.y * WORLD_SCALE);
    let plumeMesh: THREE.Mesh | undefined;

    if (ob.kind === 'whirlpool') {
      const r1 = new THREE.Mesh(geo(new THREE.TorusGeometry(ob.r * WORLD_SCALE, 0.1, 8, 24)), whirlMat);
      r1.rotation.x = Math.PI / 2;
      r1.position.y = 0.08;
      obGroup.add(r1);
      const r2 = new THREE.Mesh(geo(new THREE.TorusGeometry(ob.r * WORLD_SCALE * 0.55, 0.08, 8, 20)), whirlMat);
      r2.rotation.x = Math.PI / 2;
      r2.position.y = 0.12;
      obGroup.add(r2);
    } else if (ob.kind === 'buoy') {
      const base = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.65, 0.85, 1.35, 12)), buoyRedMat);
      base.position.y = 0.65;
      obGroup.add(base);
      const beacon = new THREE.Mesh(geo(new THREE.SphereGeometry(0.32, 10, 10)), buoyGlowMat);
      beacon.position.y = 1.5;
      obGroup.add(beacon);
    } else if (ob.kind === 'log') {
      const log = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.45, 0.5, 2.8, 10)), logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = ob.angle;
      log.position.y = 0.25;
      obGroup.add(log);
    } else if (ob.kind === 'ice') {
      const berg = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(1.45, 0)), iceMat);
      berg.scale.set(1.2, 0.95, 1.15);
      berg.position.y = 0.72;
      berg.rotation.y = ob.angle;
      obGroup.add(berg);
    } else if (ob.kind === 'hotrock') {
      const rock = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(1.25, 0)), hotRockMat);
      rock.position.y = 0.7;
      rock.rotation.y = ob.angle;
      obGroup.add(rock);
    } else if (ob.kind === 'boulder') {
      const boulder = new THREE.Mesh(geo(new THREE.DodecahedronGeometry(1.38, 1)), boulderMat);
      boulder.position.y = 1.15;
      obGroup.add(boulder);
    } else if (ob.kind === 'geyser') {
      const vent = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.1, 1.65, 0.45, 12)), geyserVentMat);
      vent.position.y = 0.22;
      obGroup.add(vent);
      plumeMesh = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.65, 1.15, 6.2, 10)), steamMat);
      plumeMesh.position.y = 3.1;
      obGroup.add(plumeMesh);
    } else if (ob.kind === 'crystal') {
      const crys = new THREE.Mesh(geo(new THREE.OctahedronGeometry(1.25, 0)), crystalMat);
      crys.scale.set(0.8, 1.55, 0.8);
      crys.position.y = 1.15;
      obGroup.add(crys);
    } else if (ob.kind === 'croc') {
      const body = new THREE.Mesh(geo(new THREE.BoxGeometry(2.4, 0.45, 0.85)), crocMat);
      body.position.y = 0.25;
      obGroup.add(body);
      const eyes = new THREE.Mesh(geo(new THREE.BoxGeometry(0.24, 0.18, 0.55)), buoyGlowMat);
      eyes.position.set(0.85, 0.52, 0);
      obGroup.add(eyes);
      obGroup.rotation.y = -ob.angle;
    } else {
      const pad = new THREE.Mesh(geo(new THREE.CylinderGeometry(1.2, 1.2, 0.14, 14)), lilyMat);
      pad.position.y = 0.08;
      obGroup.add(pad);
    }

    if (ob.kind !== 'whirlpool' && ob.kind !== 'geyser') {
      const ring = new THREE.Mesh(
        geo(new THREE.RingGeometry(ob.r * WORLD_SCALE * 0.92, ob.r * WORLD_SCALE * 1.12, 20)),
        rimRingMat
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.04;
      obGroup.add(ring);

      const obFoamSize = ob.r * WORLD_SCALE * 2.7;
      const obFoamGeo = geo(new THREE.PlaneGeometry(obFoamSize, obFoamSize));
      obFoamGeo.rotateX(-Math.PI / 2);
      const obFoam = new THREE.Mesh(obFoamGeo, contactFoamMat);
      obFoam.position.y = 0.034;
      obGroup.add(obFoam);
      contactFoamMeshes.push({ mesh: obFoam, baseScale: 1.0, phase: ob.phase });
    }

    group.add(obGroup);
    obstacleDynamicMeshes.push({ mesh: obGroup, ob, plume: plumeMesh });
  }

  // 11b. Pirate Cove Cliffside Cannons & Arcing Cannonballs
  const cannonVisuals: {
    cannon: CannonItem;
    ball: THREE.Mesh;
    splash: THREE.Mesh;
  }[] = [];
  if (track.cannons.length > 0) {
    const cannonBaseMat = mat(new THREE.MeshStandardMaterial({ color: 0x1c1917, metalness: 0.75, roughness: 0.4 }));
    const cannonBallMat = mat(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        emissive: new THREE.Color(0xf97316),
        emissiveIntensity: 1.4,
        roughness: 0.3,
      })
    );
    const splashMat = mat(
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    for (const c of track.cannons) {
      const cg = new THREE.Group();
      cg.position.set(c.sx * WORLD_SCALE, c.sz * WORLD_SCALE, c.sy * WORLD_SCALE);
      cg.rotation.y = -Math.atan2(c.ty - c.sy, c.tx - c.sx);
      const barrel = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.45, 0.65, 2.8, 10)), cannonBaseMat);
      barrel.rotation.z = -Math.PI / 2 + 0.35;
      cg.add(barrel);
      group.add(cg);

      const ball = new THREE.Mesh(geo(new THREE.SphereGeometry(0.58, 10, 10)), cannonBallMat);
      group.add(ball);

      const splash = new THREE.Mesh(geo(new THREE.RingGeometry(0.7, 1.35, 18)), splashMat);
      splash.rotation.x = -Math.PI / 2;
      splash.position.set(c.tx * WORLD_SCALE, c.tz * WORLD_SCALE + 0.08, c.ty * WORLD_SCALE);
      group.add(splash);

      cannonVisuals.push({ cannon: c, ball, splash });
    }
  }

  // 12. Traffic & Crossing Patrol Boats (City)
  const trafficMeshes: { mesh: THREE.Group; tb: TrafficBoatItem; siren?: THREE.MeshStandardMaterial }[] = [];
  for (const tb of track.trafficBoats) {
    const tg = new THREE.Group();
    const hull = new THREE.Mesh(
      geo(new THREE.BoxGeometry(2.8, 0.72, 1.45)),
      mat(new THREE.MeshStandardMaterial({ color: new THREE.Color(tb.color), roughness: 0.35 }))
    );
    hull.position.y = 0.36;
    tg.add(hull);
    const cabin = new THREE.Mesh(geo(new THREE.BoxGeometry(1.15, 0.55, 1.05)), gantryPillarMat);
    cabin.position.set(0.1, 0.95, 0);
    tg.add(cabin);
    const sirenMat = mat(
      new THREE.MeshStandardMaterial({
        color: tb.crossing ? 0x22d3ee : 0xef4444,
        emissive: new THREE.Color(tb.crossing ? 0xf43f5e : 0xff1122),
        emissiveIntensity: 3.0,
      })
    );
    const beacon = new THREE.Mesh(geo(new THREE.BoxGeometry(0.24, 0.22, 0.65)), sirenMat);
    beacon.position.set(0.1, 1.32, 0);
    tg.add(beacon);
    group.add(tg);
    trafficMeshes.push({ mesh: tg, tb, siren: tb.crossing ? sirenMat : undefined });
  }

  // 13. Surprise Power-Up Boxes (?)
  const boxGeo = geo(new THREE.BoxGeometry(1.45, 1.45, 1.45));
  const boxMat = mat(
    new THREE.MeshStandardMaterial({
      map: textures.powerBox,
      emissiveMap: textures.powerBox,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 1.65,
      roughness: 0.2,
    })
  );
  const boxRingGeo = geo(new THREE.RingGeometry(1.0, 1.45, 20));
  boxRingGeo.rotateX(-Math.PI / 2);
  const boxRingMat = mat(
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const powerBoxMeshes: { cube: THREE.Mesh; ring: THREE.Mesh; box: PowerBoxItem }[] = [];
  for (const box of track.powerBoxes) {
    const baseY = box.z * WORLD_SCALE;
    const cube = new THREE.Mesh(boxGeo, boxMat);
    cube.position.set(box.x * WORLD_SCALE, baseY + 1.15, box.y * WORLD_SCALE);
    group.add(cube);

    const ring = new THREE.Mesh(boxRingGeo, boxRingMat);
    ring.position.set(box.x * WORLD_SCALE, baseY + 0.055, box.y * WORLD_SCALE);
    group.add(ring);

    powerBoxMeshes.push({ cube, ring, box });
  }

  // 14. Collectible Gold Patocoins (metallic 3D medallion with relief rim)
  const coinGeo = geo(new THREE.CylinderGeometry(0.62, 0.62, 0.16, 20));
  coinGeo.rotateZ(Math.PI / 2);
  const coinRimGeo = geo(new THREE.TorusGeometry(0.54, 0.085, 8, 20));
  coinRimGeo.rotateY(Math.PI / 2);
  const coinMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: new THREE.Color(0xb45309),
      emissiveIntensity: 0.45,
      roughness: 0.16,
      metalness: 0.92,
    })
  );
  const coinRimMat = mat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: new THREE.Color(0xd97706),
      emissiveIntensity: 0.35,
      roughness: 0.12,
      metalness: 0.95,
    })
  );
  const coinMeshes: { mesh: THREE.Mesh; coin: CoinItem }[] = [];
  for (const coin of track.coins) {
    const cm = new THREE.Mesh(coinGeo, coinMat);
    const rim = new THREE.Mesh(coinRimGeo, coinRimMat);
    cm.add(rim);
    cm.position.set(coin.x * WORLD_SCALE, coin.z * WORLD_SCALE + 0.95, coin.y * WORLD_SCALE);
    group.add(cm);
    coinMeshes.push({ mesh: cm, coin });
  }

  // 15. InstancedMesh Biome Scenery
  if (track.sceneries.length > 0) {
    const count = track.sceneries.length;
    const dummy = new THREE.Object3D();
    const colorTmp = new THREE.Color();

    if (track.biome === 'lagoon') {
      const trunkGeo = geo(new THREE.CylinderGeometry(0.24, 0.46, 5.4, 8));
      const trunkMat = mat(new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 }));
      const frondGeo = geo(new THREE.ConeGeometry(2.7, 1.2, 7));
      const frondMat = mat(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: new THREE.Color(0x065f46),
          emissiveIntensity: 0.45,
          roughness: 0.55,
        })
      );
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
      const frondsLow = new THREE.InstancedMesh(frondGeo, frondMat, count);
      const frondsHigh = new THREE.InstancedMesh(frondGeo, frondMat, count);
      for (let i = 0; i < count; i++) {
        const sc = track.sceneries[i];
        const s = (sc.size / 36) * (0.85 + ((i * 37) % 30) / 100);
        dummy.position.set(sc.x * WORLD_SCALE, 2.5 * s, sc.y * WORLD_SCALE);
        dummy.rotation.set(0.08 * Math.sin(i), sc.angle, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        trunks.setMatrixAt(i, dummy.matrix);

        dummy.position.y = 4.9 * s;
        dummy.scale.set(s, s * 0.85, s);
        dummy.updateMatrix();
        frondsLow.setMatrixAt(i, dummy.matrix);

        dummy.position.y = 5.45 * s;
        dummy.rotation.y = sc.angle + 0.45;
        dummy.scale.set(s * 0.72, s * 0.75, s * 0.72);
        dummy.updateMatrix();
        frondsHigh.setMatrixAt(i, dummy.matrix);

        colorTmp.setHex(i % 2 === 0 ? 0x16a34a : 0x10b981);
        frondsLow.setColorAt(i, colorTmp);
        frondsHigh.setColorAt(i, colorTmp);
      }
      trunks.computeBoundingSphere();
      frondsLow.computeBoundingSphere();
      frondsHigh.computeBoundingSphere();
      group.add(trunks);
      group.add(frondsLow);
      group.add(frondsHigh);
    } else if (track.biome === 'city') {
      const bGeo = geo(new THREE.BoxGeometry(4.2, 14.0, 4.2));
      const bMat = mat(
        new THREE.MeshStandardMaterial({
          map: textures.cityTowerAlbedo,
          emissiveMap: textures.cityTowerAlbedo,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 0.75,
          roughness: 0.32,
          metalness: 0.55,
        })
      );
      const capGeo = geo(new THREE.BoxGeometry(4.4, 0.5, 4.4));
      const capMat = mat(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 1.85,
        })
      );
      const towers = new THREE.InstancedMesh(bGeo, bMat, count);
      const caps = new THREE.InstancedMesh(capGeo, capMat, count);
      for (let i = 0; i < count; i++) {
        const sc = track.sceneries[i];
        const hScale = 0.75 + ((i * 29) % 100) / 70;
        dummy.position.set(sc.x * WORLD_SCALE, 7.0 * hScale, sc.y * WORLD_SCALE);
        dummy.rotation.set(0, sc.angle, 0);
        dummy.scale.set(1, hScale, 1);
        dummy.updateMatrix();
        towers.setMatrixAt(i, dummy.matrix);

        dummy.position.y = 14.0 * hScale + 0.12;
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        caps.setMatrixAt(i, dummy.matrix);
        colorTmp.set(sc.neonColor);
        caps.setColorAt(i, colorTmp);
      }
      towers.computeBoundingSphere();
      caps.computeBoundingSphere();
      group.add(towers);
      group.add(caps);
    } else {
      const spireGeo = geo(new THREE.ConeGeometry(2.2, 6.8, 6));
      const isGlowing = track.biome === 'volcano' || track.biome === 'pirate';
      const spireMat = mat(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: new THREE.Color(
            track.biome === 'pirate'
              ? 0xd97706
              : track.biome === 'volcano'
                ? 0x9a3412
                : track.biome === 'arctic'
                  ? 0x0284c7
                  : 0x14532d
          ),
          emissiveIntensity: isGlowing ? 0.65 : track.biome === 'arctic' ? 0.38 : 0.25,
          roughness: track.biome === 'arctic' ? 0.16 : 0.78,
          transparent: track.biome === 'arctic',
          opacity: track.biome === 'arctic' ? 0.86 : 1.0,
        })
      );
      const spires = new THREE.InstancedMesh(spireGeo, spireMat, count);
      for (let i = 0; i < count; i++) {
        const sc = track.sceneries[i];
        const s = (sc.size / 34) * (0.85 + ((i * 19) % 30) / 100);
        dummy.position.set(sc.x * WORLD_SCALE, 3.2 * s, sc.y * WORLD_SCALE);
        dummy.rotation.set(0, sc.angle, 0);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        spires.setMatrixAt(i, dummy.matrix);

        if (track.biome === 'pirate') {
          colorTmp.setHex(i % 2 === 0 ? 0x44403c : 0x292524);
        } else if (track.biome === 'arctic') {
          colorTmp.setHex(i % 2 === 0 ? 0xbae6fd : 0x38bdf8);
        } else if (track.biome === 'volcano') {
          colorTmp.setHex(i % 2 === 0 ? 0x292524 : 0x57534e);
        } else {
          colorTmp.setHex(i % 2 === 0 ? 0x15803d : 0x166534);
        }
        spires.setColorAt(i, colorTmp);
      }
      spires.computeBoundingSphere();
      group.add(spires);
    }
  }

  return {
    group,
    update: (simTime: number) => {
      textures.waterNormal.offset.set(simTime * 0.04, -simTime * 0.08);
      textures.waterAlbedo.offset.set(simTime * 0.02, -simTime * 0.14);

      if (waterMat.userData.shader) {
        waterMat.userData.shader.uniforms.uWaterTime.value = simTime;
      }

      for (const cf of contactFoamMeshes) {
        const pulse = cf.baseScale * (0.94 + Math.sin(simTime * 3.2 + cf.phase) * 0.08);
        cf.mesh.scale.set(pulse, 1, pulse);
      }

      if (track.biome === 'pirate') {
        oceanMesh.position.y = -0.18 + Math.sin(simTime * 2.2) * 0.18;
      }

      for (const cm of chevronMats) {
        cm.emissiveIntensity = 1.65 + Math.sin(simTime * 6.5) * 0.55;
      }

      for (let i = 0; i < tunnelStripMats.length; i++) {
        tunnelStripMats[i].emissiveIntensity = 2.4 + Math.sin(simTime * 4.5 + i * 1.4) * 0.7;
      }

      for (const m of mantaSwimmers) {
        const ang = simTime * m.speed + m.phase;
        m.group.position.set(
          m.baseX + Math.cos(ang) * m.radius * 0.35,
          Math.min(8.5, Math.max(2.6, 5.2 + Math.sin(ang * 1.3) * 2.2)),
          m.baseZ + Math.sin(ang) * m.radius * 0.35
        );
        m.group.rotation.y = -ang + Math.PI * 0.5;
        const flap = Math.sin(simTime * 5.2 + m.phase) * 0.42;
        m.leftWing.rotation.x = flap;
        m.rightWing.rotation.x = -flap;
      }

      for (const item of powerBoxMeshes) {
        const alive = item.box.respawn <= 0;
        item.cube.visible = alive;
        item.ring.visible = alive;
        if (alive) {
          item.cube.rotation.y = simTime * 2.2 + item.box.phase;
          item.cube.rotation.x = Math.sin(simTime * 1.8 + item.box.phase) * 0.22;
          item.cube.position.y = item.box.z * WORLD_SCALE + 1.15 + Math.sin(simTime * 3.8 + item.box.phase) * 0.25;
        }
      }

      for (const item of coinMeshes) {
        const alive = item.coin.respawn <= 0;
        item.mesh.visible = alive;
        if (alive) {
          item.mesh.rotation.y = simTime * 3.2 + item.coin.phase;
          item.mesh.position.set(
            item.coin.x * WORLD_SCALE,
            item.coin.z * WORLD_SCALE + 0.92 + Math.sin(simTime * 4.2 + item.coin.phase) * 0.18,
            item.coin.y * WORLD_SCALE
          );
        }
      }

      for (const item of obstacleDynamicMeshes) {
        if (item.ob.kind === 'croc' || item.ob.kind === 'log' || item.ob.kind === 'boulder') {
          item.mesh.position.x = item.ob.x * WORLD_SCALE;
          item.mesh.position.z = item.ob.y * WORLD_SCALE;
          if (item.ob.kind === 'boulder') {
            item.mesh.rotation.x = simTime * 3.8;
            item.mesh.rotation.z = simTime * 2.4;
          }
        } else if (item.ob.kind === 'whirlpool') {
          item.mesh.rotation.y = simTime * 3.5 + item.ob.phase;
        } else if (item.ob.kind === 'ice') {
          item.mesh.visible = (item.ob.brokenTimer ?? 0) <= 0;
        } else if (item.ob.kind === 'geyser' && item.plume) {
          const erupt = Math.sin(simTime * 1.4 + item.ob.phase) > 0.25;
          item.plume.visible = erupt;
          if (erupt) {
            const pulse = 0.85 + Math.sin(simTime * 16) * 0.18;
            item.plume.scale.set(pulse, 0.8 + Math.sin(simTime * 9) * 0.25, pulse);
          }
        }
      }

      for (const cv of cannonVisuals) {
        const c = cv.cannon;
        const frac = ((simTime + c.phase) % c.period) / c.period;
        if (frac < 0.72) {
          const u = frac / 0.72;
          const arcY = (c.sz * (1 - u) + c.tz * u + Math.sin(u * Math.PI) * 210) * WORLD_SCALE;
          cv.ball.visible = true;
          cv.ball.position.set(
            (c.sx + (c.tx - c.sx) * u) * WORLD_SCALE,
            arcY,
            (c.sy + (c.ty - c.sy) * u) * WORLD_SCALE
          );
          cv.splash.visible = false;
        } else {
          const sFrac = (frac - 0.72) / 0.28;
          cv.ball.visible = false;
          cv.splash.visible = true;
          cv.splash.scale.setScalar(1 + sFrac * 3.2);
        }
      }

      for (const item of trafficMeshes) {
        if (item.tb.crossing && item.tb.crossX !== undefined && item.tb.crossY !== undefined && item.tb.nx !== undefined && item.tb.ny !== undefined) {
          const swing = Math.sin(simTime * item.tb.speed + (item.tb.phase ?? 0)) * (item.tb.halfWidth ?? 80);
          const dir = Math.cos(simTime * item.tb.speed + (item.tb.phase ?? 0)) >= 0 ? 1 : -1;
          item.mesh.position.set(
            (item.tb.crossX + item.tb.nx * swing) * WORLD_SCALE,
            0.05,
            (item.tb.crossY + item.tb.ny * swing) * WORLD_SCALE
          );
          item.mesh.rotation.y = -Math.atan2(item.tb.ny * dir, item.tb.nx * dir);
          if (item.siren) {
            item.siren.emissive.setHex(Math.floor(simTime * 8) % 2 === 0 ? 0xf43f5e : 0x22d3ee);
          }
        } else {
          const sIdx = Math.floor((item.tb.laneIdx + simTime * 2.2) % track.main.length);
          const pt = track.main[sIdx];
          item.mesh.position.set(
            (pt.x + pt.nx * item.tb.offset) * WORLD_SCALE,
            pt.z * WORLD_SCALE,
            (pt.y + pt.ny * item.tb.offset) * WORLD_SCALE
          );
          item.mesh.rotation.y = -Math.atan2(pt.ty, pt.tx);
        }
      }
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
