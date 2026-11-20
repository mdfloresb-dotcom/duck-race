import * as THREE from 'three';
import type { CameraMode } from './hydroEngine';
import type { ProceduralTextureSet } from './textures';

export interface CraftVisualConfig {
  hullType: 'jetski' | 'speedboat' | 'yacht' | 'bathtub' | 'rubberduck';
  primaryColor: string;
  accentColor: string;
  scarfColor: string;
  underglowColor: string;
  isPlayer: boolean;
}

export interface CraftMeshHandle {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  duckGroup: THREE.Group;
  scarfSegments: THREE.Mesh[];
  brakeLights: THREE.MeshStandardMaterial;
  headlightBeamMesh: THREE.Mesh;
  underglowMat: THREE.MeshBasicMaterial;
  underglowLight: THREE.PointLight | null;
  flameGroup: THREE.Group;
  shieldMesh: THREE.Mesh;
  magnetRing: THREE.Mesh;
  contactShadow: THREE.Mesh;
  setCameraMode: (mode: CameraMode) => void;
  setUnderglowColor: (hex: string) => void;
  updateVisuals: (params: {
    simTime: number;
    idx: number;
    groundZ: number;
    airZ: number;
    lean: number;
    pitch: number;
    spinVisual: number;
    braking: boolean;
    drifting: boolean;
    driftStage: 0 | 1 | 2;
    turboActive: boolean;
    nitroActive: boolean;
    shieldActive: boolean;
    magnetActive: boolean;
    lightningActive: boolean;
    inTunnel: boolean;
    engineVib: number;
  }) => void;
  dispose: () => void;
}

function makeExtrudedHull(
  points: [number, number][],
  depth: number,
  bevelSize = 0.06
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  });
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevelSize,
    bevelSize,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, depth + bevelSize, 0);
  return geo;
}

function applyRimLighting(
  mat: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  rimHex: string,
  strength = 0.72
): void {
  const rimCol = new THREE.Color(rimHex);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: rimCol };
    shader.uniforms.uRimStrength = { value: strength };
    shader.fragmentShader =
      `uniform vec3 uRimColor;\nuniform float uRimStrength;\n` +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        vec3 rimN = normalize(vNormal);
        vec3 rimV = normalize(vViewPosition);
        float rimF = pow(1.0 - clamp(abs(dot(rimN, rimV)), 0.0, 1.0), 2.5);
        gl_FragColor.rgb += uRimColor * rimF * uRimStrength;
        #include <dithering_fragment>
        `
      );
  };
  mat.customProgramCacheKey = () => `rim_${rimHex}_${strength}`;
}

export function buildCraftMesh(
  cfg: CraftVisualConfig,
  textures: ProceduralTextureSet
): CraftMeshHandle {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };

  const hullMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(cfg.primaryColor),
      roughness: 0.22,
      metalness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
    })
  );
  applyRimLighting(hullMat, cfg.underglowColor, cfg.isPlayer ? 0.85 : 0.72);
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(cfg.accentColor),
      roughness: 0.35,
      metalness: 0.25,
    })
  );
  applyRimLighting(accentMat, '#e0f2fe', 0.48);
  const darkTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.78,
      metalness: 0.15,
    })
  );
  const chromeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.14,
      metalness: 0.92,
    })
  );
  const glassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.08,
      metalness: 0.15,
      emissive: new THREE.Color(0x0284c7),
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.82,
    })
  );
  const dashGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: new THREE.Color(cfg.underglowColor),
      emissiveIntensity: 1.9,
      roughness: 0.15,
    })
  );
  const headlightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: new THREE.Color(0xe0f2fe),
      emissiveIntensity: 2.8,
      roughness: 0.1,
    })
  );
  const brakeLights = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: new THREE.Color(0xff1122),
      emissiveIntensity: 1.0,
      roughness: 0.2,
    })
  );

  // Contact shadow disc grounded just above track surface
  const shadowGeo = trackGeo(new THREE.PlaneGeometry(4.2, 2.8));
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.shadowDisc,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.018;
  root.add(contactShadow);

  // Neon Underglow skirt disc
  const glowGeo = trackGeo(new THREE.PlaneGeometry(5.6, 3.8));
  glowGeo.rotateX(-Math.PI / 2);
  const underglowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.glowDisc,
      color: new THREE.Color(cfg.underglowColor),
      transparent: true,
      opacity: cfg.isPlayer ? 1.0 : 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const underglowMesh = new THREE.Mesh(glowGeo, underglowMat);
  underglowMesh.position.y = 0.042;
  root.add(underglowMesh);

  let underglowLight: THREE.PointLight | null = null;
  if (cfg.isPlayer) {
    underglowLight = new THREE.PointLight(cfg.underglowColor, 5.8, 12.5, 1.5);
    underglowLight.position.set(0, 0.4, 0);
    root.add(underglowLight);
  }

  // Headlight projected water beam cone (facing +X)
  const beamGeo = trackGeo(new THREE.PlaneGeometry(13.0, 4.8));
  beamGeo.rotateX(-Math.PI / 2);
  beamGeo.translate(7.4, 0, 0);
  const beamMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.headlightBeam,
      color: 0xe0f7ff,
      transparent: true,
      opacity: cfg.isPlayer ? 0.62 : 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const headlightBeamMesh = new THREE.Mesh(beamGeo, beamMat);
  headlightBeamMesh.position.y = 0.065;
  root.add(headlightBeamMesh);

  const tubBubbles: { mesh: THREE.Mesh; basePos: [number, number, number]; phase: number }[] = [];

  // -------------------------------------------------------------------------
  // Composite Procedural Craft Assemblies (bow faces +X, Hood POV visible!)
  // -------------------------------------------------------------------------
  let pilotPos: [number, number, number] = [0.0, 0.72, 0];
  let tailX = -1.45;
  let headlightX = 1.45;
  let headlightSpreadZ = 0.24;
  let tailSpreadZ = 0.36;

  if (cfg.hullType === 'jetski') {
    const hull = new THREE.Mesh(
      trackGeo(
        makeExtrudedHull(
          [
            [1.76, 0],
            [0.85, -0.62],
            [-1.32, -0.56],
            [-1.5, 0],
            [-1.32, 0.56],
            [0.85, 0.62],
          ],
          0.38,
          0.07
        )
      ),
      hullMat
    );
    hull.position.y = 0.04;
    hull.castShadow = true;
    bodyPivot.add(hull);

    // Sculpted bow cowl visible in Hood POV
    const cowl = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.16, 0.22, 0.62)), accentMat);
    cowl.position.set(0.76, 0.48, 0);
    cowl.rotation.z = -0.14;
    bodyPivot.add(cowl);

    // Front hood aero fin + illuminated digital dash display
    const noseFin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.74, 0.08, 0.16)), darkTrimMat);
    noseFin.position.set(1.18, 0.62, 0);
    noseFin.rotation.z = -0.2;
    bodyPivot.add(noseFin);

    const dashBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.08, 0.48)), dashGlowMat);
    dashBar.position.set(0.64, 0.72, 0);
    bodyPivot.add(dashBar);

    const visor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 0.14, 0.52)), glassMat);
    visor.position.set(0.76, 0.74, 0);
    visor.rotation.z = -0.44;
    bodyPivot.add(visor);

    const bar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.035, 0.035, 0.92, 10)), chromeMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(0.46, 0.78, 0);
    bodyPivot.add(bar);

    const seat = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.05, 0.22, 0.42)), darkTrimMat);
    seat.position.set(-0.42, 0.54, 0);
    bodyPivot.add(seat);

    for (const side of [-1, 1]) {
      const pipe = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 0.34, 12)), chromeMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-1.52, 0.28, side * 0.24);
      bodyPivot.add(pipe);
    }

    pilotPos = [-0.15, 0.76, 0];
    tailX = -1.48;
    headlightX = 1.56;
    headlightSpreadZ = 0.2;
    tailSpreadZ = 0.28;
  } else if (cfg.hullType === 'speedboat') {
    const hull = new THREE.Mesh(
      trackGeo(
        makeExtrudedHull(
          [
            [2.08, 0],
            [0.65, -0.82],
            [-1.62, -0.74],
            [-1.62, 0.74],
            [0.65, 0.82],
          ],
          0.42,
          0.07
        )
      ),
      hullMat
    );
    hull.position.y = 0.04;
    hull.castShadow = true;
    bodyPivot.add(hull);

    // Long racing bow deck + illuminated dash
    const stripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.95, 0.1, 0.58)), accentMat);
    stripe.position.set(0.54, 0.56, 0);
    bodyPivot.add(stripe);

    const dashStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.14, 0.09, 0.74)), dashGlowMat);
    dashStrip.position.set(0.46, 0.68, 0);
    bodyPivot.add(dashStrip);

    const shield = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.58, 0.34, 1.12)), glassMat);
    shield.position.set(0.42, 0.7, 0);
    shield.rotation.z = -0.46;
    bodyPivot.add(shield);

    const wing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.32, 0.08, 1.52)), darkTrimMat);
    wing.position.set(-1.42, 0.92, 0);
    bodyPivot.add(wing);
    for (const s of [-1, 1]) {
      const strut = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.42, 0.08)), chromeMat);
      strut.position.set(-1.42, 0.7, s * 0.48);
      bodyPivot.add(strut);

      const motor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.36, 0.42, 0.26)), darkTrimMat);
      motor.position.set(-1.74, 0.36, s * 0.36);
      bodyPivot.add(motor);
    }

    pilotPos = [-0.25, 0.72, 0];
    tailX = -1.68;
    headlightX = 1.85;
    headlightSpreadZ = 0.26;
    tailSpreadZ = 0.42;
  } else if (cfg.hullType === 'yacht') {
    const hull = new THREE.Mesh(
      trackGeo(
        makeExtrudedHull(
          [
            [1.96, 0],
            [1.15, -0.88],
            [-1.58, -0.84],
            [-1.65, 0],
            [-1.58, 0.84],
            [1.15, 0.88],
          ],
          0.48,
          0.08
        )
      ),
      hullMat
    );
    hull.position.y = 0.04;
    hull.castShadow = true;
    bodyPivot.add(hull);

    const teakMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.72, metalness: 0.05 })
    );
    const deck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.35, 0.1, 1.18)), teakMat);
    deck.position.set(0.05, 0.58, 0);
    bodyPivot.add(deck);

    // Chrome bow railing & illuminated bridge bar for Hood POV
    const bowRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.85, 0.07, 0.08)), chromeMat);
    bowRail.position.set(1.38, 0.72, 0);
    bodyPivot.add(bowRail);

    const dashBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 0.08, 0.68)), dashGlowMat);
    dashBar.position.set(0.66, 0.72, 0);
    bodyPivot.add(dashBar);

    const cabin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 0.36, 0.96)), glassMat);
    cabin.position.set(0.42, 0.76, 0);
    bodyPivot.add(cabin);

    const arch = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.58, 0.06, 8, 18, Math.PI)), accentMat);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(-0.68, 0.68, 0);
    bodyPivot.add(arch);

    for (const s of [-1, 1]) {
      const pipe = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.3, 12)), chromeMat);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(-1.66, 0.3, s * 0.44);
      bodyPivot.add(pipe);
    }

    pilotPos = [-0.28, 0.8, 0];
    tailX = -1.65;
    headlightX = 1.78;
    headlightSpreadZ = 0.34;
    tailSpreadZ = 0.48;
  } else if (cfg.hullType === 'bathtub') {
    const tub = new THREE.Mesh(
      trackGeo(
        makeExtrudedHull(
          [
            [1.64, -0.58],
            [1.64, 0.58],
            [1.1, 0.82],
            [-1.35, 0.82],
            [-1.62, 0.52],
            [-1.62, -0.52],
            [-1.35, -0.82],
            [1.1, -0.82],
          ],
          0.52,
          0.08
        )
      ),
      hullMat
    );
    tub.position.y = 0.04;
    tub.castShadow = true;
    bodyPivot.add(tub);

    const suds = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.35, 0.1, 1.05)), glassMat);
    suds.position.set(0, 0.56, 0);
    bodyPivot.add(suds);

    // Porcelain rolled bow rim + chrome faucet visible in Hood POV
    const porcelainRim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.28, 0.16, 1.28)), hullMat);
    porcelainRim.position.set(1.48, 0.64, 0);
    bodyPivot.add(porcelainRim);

    const faucet = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.12, 0.46, 12)), chromeMat);
    faucet.position.set(1.25, 0.82, 0);
    bodyPivot.add(faucet);

    const spout = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.05, 0.06, 0.35, 10)), chromeMat);
    spout.rotation.z = Math.PI / 2.4;
    spout.position.set(1.06, 0.96, 0);
    bodyPivot.add(spout);

    const trim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.22, 0.92)), accentMat);
    trim.position.set(1.38, 0.48, 0);
    bodyPivot.add(trim);

    // Translucent soap bubbles along the front porcelain rim (extra expressive in Hood POV!)
    const bubbleMat = trackMat(
      new THREE.MeshPhysicalMaterial({
        color: 0xe0f2fe,
        emissive: new THREE.Color(0x38bdf8),
        emissiveIntensity: 0.35,
        roughness: 0.08,
        transparent: true,
        opacity: 0.72,
      })
    );
    const bubbleGeo = trackGeo(new THREE.SphereGeometry(0.11, 10, 10));
    const bubbleOffsets: [number, number, number][] = [
      [1.18, 0.72, -0.34],
      [1.34, 0.74, -0.18],
      [1.26, 0.76, 0.24],
      [1.08, 0.7, 0.38],
      [1.42, 0.73, 0.04],
    ];
    bubbleOffsets.forEach((pos, bIdx) => {
      const bm = new THREE.Mesh(bubbleGeo, bubbleMat);
      bm.scale.setScalar(0.75 + (bIdx % 3) * 0.25);
      bm.position.set(pos[0], pos[1], pos[2]);
      bodyPivot.add(bm);
      tubBubbles.push({ mesh: bm, basePos: pos, phase: bIdx * 1.3 });
    });

    const v8 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.46, 0.76)), darkTrimMat);
    v8.position.set(-1.62, 0.46, 0);
    bodyPivot.add(v8);

    for (const s of [-1, 1]) {
      const stack = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.07, 0.09, 0.45, 10)), chromeMat);
      stack.rotation.z = 0.35;
      stack.position.set(-1.66, 0.78, s * 0.24);
      bodyPivot.add(stack);
    }

    pilotPos = [0.05, 0.72, 0];
    tailX = -1.78;
    headlightX = 1.58;
    headlightSpreadZ = 0.3;
    tailSpreadZ = 0.42;
  } else {
    // 'rubberduck'
    const duckBody = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(1.0, 22, 16)), hullMat);
    duckBody.scale.set(1.72, 0.52, 1.08);
    duckBody.position.set(0, 0.44, 0);
    duckBody.castShadow = true;
    bodyPivot.add(duckBody);

    const bowHead = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.55, 18, 14)), hullMat);
    bowHead.position.set(1.25, 0.78, 0);
    bodyPivot.add(bowHead);

    const billMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.38, metalness: 0.1 })
    );
    const bowBill = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.36, 14, 12)), billMat);
    bowBill.scale.set(1.35, 0.45, 0.92);
    bowBill.position.set(1.82, 0.72, 0);
    bodyPivot.add(bowBill);

    // Illuminated visor brow on bow for Hood POV cockpit feedback
    const bowVisor = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, 0.1, 0.62)), dashGlowMat);
    bowVisor.position.set(0.95, 0.86, 0);
    bodyPivot.add(bowVisor);

    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.25, 0.14, 0.58)), accentMat);
      wing.position.set(-0.08, 0.52, s * 1.12);
      wing.rotation.x = s * 0.18;
      bodyPivot.add(wing);
    }

    for (const s of [-1, 1]) {
      const pod = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.16, 0.2, 0.58, 14)), chromeMat);
      pod.rotation.z = Math.PI / 2;
      pod.position.set(-1.55, 0.48, s * 0.42);
      bodyPivot.add(pod);
    }

    pilotPos = [-0.1, 0.88, 0];
    tailX = -1.72;
    headlightX = 1.62;
    headlightSpreadZ = 0.28;
    tailSpreadZ = 0.42;
  }

  // Twin LED Headlights & Rear Red LED Brake Taillights
  for (const s of [-1, 1]) {
    const hl = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.11, 10, 10)), headlightMat);
    hl.position.set(headlightX, 0.44, s * headlightSpreadZ);
    bodyPivot.add(hl);

    const tl = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.1, 0.12, 0.28)), brakeLights);
    tl.position.set(tailX, 0.44, s * tailSpreadZ);
    bodyPivot.add(tl);
  }

  // Duck Pilot + Aviator Goggles + Fluttering Multi-Segment Scarf
  const duckGroup = new THREE.Group();
  duckGroup.position.set(pilotPos[0], pilotPos[1], pilotPos[2]);
  bodyPivot.add(duckGroup);

  const duckFeatherMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.58, metalness: 0.04 })
  );
  const beakMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45, metalness: 0.05 })
  );
  const goggleLensMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x0ea5e9),
      emissiveIntensity: 0.65,
      roughness: 0.1,
      metalness: 0.3,
    })
  );
  const scarfMat = trackMat(
    new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.scarfColor), roughness: 0.82 })
  );

  const torso = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.22, 0.28, 0.36, 12)), duckFeatherMat);
  torso.position.y = 0.12;
  duckGroup.add(torso);

  const head = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.27, 16, 14)), duckFeatherMat);
  head.position.y = 0.44;
  head.castShadow = true;
  duckGroup.add(head);

  const beak = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.14, 12, 10)), beakMat);
  beak.scale.set(1.45, 0.55, 0.95);
  beak.position.set(0.28, 0.41, 0);
  duckGroup.add(beak);

  const strap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.278, 0.278, 0.11, 14)), darkTrimMat);
  strap.position.set(0, 0.48, 0);
  duckGroup.add(strap);

  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 12)), goggleLensMat);
    lens.rotation.z = Math.PI / 2;
    lens.position.set(0.23, 0.49, s * 0.11);
    duckGroup.add(lens);
  }

  const scarfSegments: THREE.Mesh[] = [];
  const scarfGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.07, 0.16));
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(scarfGeo, scarfMat);
    seg.position.set(-0.22 - i * 0.26, 0.26, 0);
    duckGroup.add(seg);
    scarfSegments.push(seg);
  }

  // Twin Turbo / Nitro Exhaust Flames
  const flameGroup = new THREE.Group();
  flameGroup.position.set(tailX - 0.12, 0.36, 0);
  flameGroup.visible = false;
  bodyPivot.add(flameGroup);

  const outerFlameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf97316,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const innerFlameMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const coneGeo = trackGeo(new THREE.ConeGeometry(0.22, 1.35, 10));
  coneGeo.rotateZ(Math.PI / 2);
  coneGeo.translate(-0.65, 0, 0);
  const innerConeGeo = trackGeo(new THREE.ConeGeometry(0.12, 0.85, 10));
  innerConeGeo.rotateZ(Math.PI / 2);
  innerConeGeo.translate(-0.42, 0, 0);

  for (const s of [-1, 1]) {
    const fOut = new THREE.Mesh(coneGeo, outerFlameMat);
    fOut.position.z = s * (tailSpreadZ * 0.65);
    flameGroup.add(fOut);

    const fIn = new THREE.Mesh(innerConeGeo, innerFlameMat);
    fIn.position.z = s * (tailSpreadZ * 0.65);
    flameGroup.add(fIn);
  }

  // Active Bubble Shield Dome + Gold Magnet Ring
  const shieldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x0ea5e9),
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.28,
      roughness: 0.1,
      depthWrite: false,
    })
  );
  const shieldMesh = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(2.15, 18, 14)), shieldMat);
  shieldMesh.position.y = 0.65;
  shieldMesh.visible = false;
  root.add(shieldMesh);

  const magnetMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  const magnetGeo = trackGeo(new THREE.TorusGeometry(2.25, 0.08, 8, 32));
  magnetGeo.rotateX(Math.PI / 2);
  const magnetRing = new THREE.Mesh(magnetGeo, magnetMat);
  magnetRing.position.y = 0.22;
  magnetRing.visible = false;
  root.add(magnetRing);

  return {
    root,
    bodyPivot,
    duckGroup,
    scarfSegments,
    brakeLights,
    headlightBeamMesh,
    underglowMat,
    underglowLight,
    flameGroup,
    shieldMesh,
    magnetRing,
    contactShadow,
    setCameraMode: (mode: CameraMode) => {
      duckGroup.visible = mode !== 'hood';
    },
    setUnderglowColor: (hex: string) => {
      underglowMat.color.set(hex);
      dashGlowMat.emissive.set(hex);
      if (underglowLight) underglowLight.color.set(hex);
    },
    updateVisuals: (p) => {
      const groundM = p.groundZ * 0.05;
      const airM = p.airZ * 0.05;
      const hopM = Math.max(0, airM - groundM);
      const vib = Math.sin(p.simTime * 56 + p.idx * 2.1) * p.engineVib * 0.014;

      const targetScale = p.lightningActive ? 0.64 : 1.0;
      const nextScale = bodyPivot.scale.x + (targetScale - bodyPivot.scale.x) * 0.22;
      bodyPivot.scale.setScalar(nextScale);

      bodyPivot.position.y = airM + Math.sin(p.simTime * 7 + p.idx) * 0.028 + vib;
      bodyPivot.rotation.x = p.lean * 0.28;
      bodyPivot.rotation.z = p.pitch;
      bodyPivot.rotation.y = p.spinVisual;

      contactShadow.position.y = groundM + 0.018;
      contactShadow.scale.setScalar(Math.max(0.55, (1 - hopM * 0.08) * nextScale));
      contactShadow.material.opacity = Math.max(0.18, 0.55 - hopM * 0.08);
      underglowMesh.position.y = groundM + 0.042 + hopM * 0.15;
      if (underglowLight) {
        underglowLight.position.y = groundM + 0.42 + hopM * 0.3;
        underglowLight.intensity = p.inTunnel ? 8.2 : 5.8;
      }
      const beamMat = headlightBeamMesh.material as THREE.MeshBasicMaterial;
      beamMat.opacity = cfg.isPlayer ? (p.inTunnel ? 0.68 : 0.28) : (p.inTunnel ? 0.42 : 0.22);

      brakeLights.emissiveIntensity = p.braking ? 6.5 : p.drifting ? 4.2 : 1.1;

      if (duckGroup.visible) {
        for (let i = 0; i < scarfSegments.length; i++) {
          const seg = scarfSegments[i];
          seg.position.z = Math.sin(p.simTime * 16 + p.idx * 2 + i * 0.9) * (0.07 + i * 0.05);
          seg.position.y = 0.28 + Math.cos(p.simTime * 13 + i * 0.7) * 0.04;
          seg.rotation.y = Math.sin(p.simTime * 15 + i) * 0.25;
        }
      }

      for (const b of tubBubbles) {
        b.mesh.position.y = b.basePos[1] + Math.sin(p.simTime * 6.5 + b.phase) * 0.04;
      }

      // Turbo / Nitro / Drift Mini-Turbo exhaust flames
      const boostOn = p.turboActive || p.nitroActive || p.driftStage > 0;
      flameGroup.visible = boostOn;
      if (boostOn) {
        const flicker = 0.85 + Math.sin(p.simTime * 48 + p.idx) * 0.35;
        const scaleBase = p.nitroActive ? 1.55 : p.turboActive ? 1.1 : p.driftStage === 2 ? 0.72 : 0.48;
        flameGroup.scale.set(scaleBase * flicker, 1, 1);
        outerFlameMat.color.setHex(
          p.nitroActive ? 0xe879f9 : p.turboActive ? 0xf97316 : p.driftStage === 2 ? 0xf97316 : 0x38bdf8
        );
      }

      shieldMesh.visible = p.shieldActive;
      shieldMesh.position.y = airM + 0.65;
      if (p.shieldActive) {
        shieldMesh.rotation.y += 0.03;
        const pulse = 1 + Math.sin(p.simTime * 8) * 0.04;
        shieldMesh.scale.setScalar(pulse);
      }

      magnetRing.visible = p.magnetActive;
      magnetRing.position.y = groundM + 0.22 + hopM * 0.3;
      if (p.magnetActive) {
        magnetRing.rotation.z = p.simTime * 3.5;
      }

      headlightBeamMesh.position.y = groundM + 0.068 + hopM * 0.25;
      beamMat.opacity = cfg.isPlayer ? (p.inTunnel ? 0.94 : 0.65) : p.inTunnel ? 0.65 : 0.36;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
