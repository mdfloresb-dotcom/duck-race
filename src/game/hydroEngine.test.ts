import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VEHICLES,
  TRACK_DEFS,
  POWERUP_KEYS,
  POWERUP_META,
  UNDERGLOW_PRESETS,
  MAX_UPGRADE_LEVEL,
  createDefaultSaveData,
  getUpgradeCost,
  getEffectiveVehicleStats,
  calculateRaceReward,
  sampleClosedSpline,
  sampleBranchSpline,
  generateTrackCoins,
  createCheckpointState,
  updateCheckpointProgress,
  stepCraftPhysics,
  stepCameraAngle,
  mapTrackToWorld,
  worldForwardFromAngle,
  worldRightFromAngle,
  stepChaseCamera,
  stepHoodCamera,
  computeWaveHeight,
  evaluateAiPowerDecision,
  resolveVehicleCollision,
  getHullColliderDims,
  type ControlPoint,
  type CollisionRacerBody,
} from './hydroEngine';

test('vehicle garage stats scale monotonically up to max level', () => {
  const jet = VEHICLES[0];
  const lv1 = getEffectiveVehicleStats(jet, {
    velocidadMax: 1,
    aceleracion: 1,
    manejo: 1,
    turbo: 1,
  });
  const lv5 = getEffectiveVehicleStats(jet, {
    velocidadMax: MAX_UPGRADE_LEVEL,
    aceleracion: MAX_UPGRADE_LEVEL,
    manejo: MAX_UPGRADE_LEVEL,
    turbo: MAX_UPGRADE_LEVEL,
  });
  assert.ok(lv5.velocidadMax > lv1.velocidadMax);
  assert.ok(lv5.aceleracion > lv1.aceleracion);
  assert.ok(lv5.manejo > lv1.manejo);
  assert.ok(lv5.turbo > lv1.turbo);
  assert.equal(getUpgradeCost(MAX_UPGRADE_LEVEL), Infinity);
  assert.ok(getUpgradeCost(2) > getUpgradeCost(1));
});

test('default save data initializes 3 unlocked vehicles, neon underglow, and all 6 tracks + 10 power-ups exist', () => {
  const save = createDefaultSaveData();
  assert.equal(save.unlockedVehicles.length, 3);
  assert.equal(VEHICLES.length, 5);
  assert.equal(TRACK_DEFS.length, 6);
  assert.equal(POWERUP_KEYS.length, 10);
  assert.ok(POWERUP_KEYS.includes('squid_ink'));
  assert.ok(POWERUP_KEYS.includes('mine'));
  for (const key of POWERUP_KEYS) {
    assert.ok(POWERUP_META[key].name.length > 0);
  }
  assert.ok(UNDERGLOW_PRESETS.some((u) => u.hex === save.selectedUnderglowColor));
  assert.ok(!save.unlockedVehicles.includes('bathtub'));
  assert.ok(!save.unlockedVehicles.includes('rubberduck'));
});

test('podium race rewards decrease by placement and scale with circuit index', () => {
  const p1 = calculateRaceReward(1, 0);
  const p2 = calculateRaceReward(2, 0);
  const p3 = calculateRaceReward(3, 0);
  const p4 = calculateRaceReward(4, 0);
  assert.ok(p1 > p2 && p2 > p3 && p3 > p4);
  assert.ok(calculateRaceReward(1, 4) > p1);
});

test('checkpoint anti-cheat blocks reverse crossing and validates full laps', () => {
  let cp = createCheckpointState();
  let res = updateCheckpointProgress(cp, 0.02, 1);
  assert.equal(res.invalidLapAttempt, false);
  cp = res.state;
  res = updateCheckpointProgress(cp, 0.95, -1);
  assert.equal(res.state.wrongWay, true);
  cp = res.state;
  res = updateCheckpointProgress(cp, 0.03, 1);
  assert.equal(res.lapCompleted, false);
  assert.equal(res.invalidLapAttempt, true);
  assert.equal(res.state.lap, 1);

  cp = createCheckpointState();
  for (const s of [0.05, 0.18, 0.31, 0.44, 0.56, 0.69, 0.81, 0.93]) {
    res = updateCheckpointProgress(cp, s, 1);
    cp = res.state;
    assert.equal(res.lapCompleted, false);
  }
  res = updateCheckpointProgress(cp, 0.04, 1);
  assert.equal(res.lapCompleted, true);
  assert.equal(res.state.lap, 2);
});

test('branch spline sampling connects fork and merge smoothly and spawns on-track coins', () => {
  const mainPts: ControlPoint[] = [
    { x: 0, y: 0, w: 300, z: 0 },
    { x: 800, y: 0, w: 300, z: 40 },
    { x: 1400, y: 500, w: 300, z: 120 },
    { x: 1000, y: 1100, w: 300, z: 30 },
    { x: 200, y: 1000, w: 300, z: 0, tunnel: 'glass_ocean' },
    { x: -300, y: 500, w: 300, z: 0 },
  ];
  const main = sampleClosedSpline(mainPts, 10, 'main');
  const branch = sampleBranchSpline(
    mainPts,
    {
      id: 'shortcut',
      label: 'Atajo',
      forkIdx: 1,
      mergeIdx: 4,
      points: [
        { x: 700, y: 500, w: 220, z: 0, surface: 'ramp' },
        { x: 450, y: 780, w: 220, z: 0, surface: 'boost_current' },
      ],
    },
    10
  );
  assert.equal(main.length, 60);
  assert.ok(branch.length > 20);
  assert.ok(main.some((p) => p.z > 80));
  assert.ok(main.some((p) => p.slope > 0.02));
  assert.ok(main.some((p) => p.slope < -0.02));
  assert.ok(main.some((p) => p.tunnel === 'glass_ocean'));
  for (let i = 1; i < branch.length; i++) {
    assert.ok(branch[i].s >= branch[i - 1].s);
  }
  const coins = generateTrackCoins(main, [{ samples: branch }]);
  assert.ok(coins.length >= 6);
});

test('all 6 official tracks include both elevated overpasses and thematic tunnels including Pirate Cove', () => {
  assert.equal(TRACK_DEFS[5].id, 'pirate');
  for (const def of TRACK_DEFS) {
    const samples = sampleClosedSpline(def.points, 12, 'main');
    assert.ok(
      samples.some((s) => s.z >= 90),
      `${def.id} must have an elevated overpass`
    );
    assert.ok(
      samples.some((s) => s.tunnel !== null),
      `${def.id} must have a thematic tunnel`
    );
  }
  const pirateSamples = sampleClosedSpline(TRACK_DEFS[5].points, 12, 'main');
  assert.ok(
    pirateSamples.some((s) => s.tunnel === 'treasure_cave'),
    'pirate track must include treasure_cave tunnel'
  );
});

test('water physics accelerates through 5 gears, respects slope gravity, and charges 2-stage drift mini-turbo', () => {
  const stats = VEHICLES[0].baseStats;
  let vx = 0;
  let vy = 0;
  let angle = 0;
  let prevGear = 1;
  let maxGearReached = 1;

  for (let i = 0; i < 45; i++) {
    const step = stepCraftPhysics({
      vx,
      vy,
      angle,
      throttle: 1,
      steer: 0,
      stats,
      turboTimer: 0,
      mudTimer: 0,
      onBoostCurrent: false,
      lightningSlowTimer: 0,
      prevGear,
      dt: 0.05,
    });
    vx = step.vx;
    vy = step.vy;
    angle = step.angle;
    prevGear = step.gear;
    maxGearReached = Math.max(maxGearReached, step.gear);
  }
  const cruiseSpeed = Math.hypot(vx, vy);
  assert.ok(cruiseSpeed > 380);
  assert.ok(maxGearReached >= 4);

  // Slope physics: downhill accelerates faster than steep uphill
  const uphill = stepCraftPhysics({
    vx,
    vy,
    angle,
    throttle: 1,
    steer: 0,
    stats,
    turboTimer: 0,
    mudTimer: 0,
    onBoostCurrent: false,
    lightningSlowTimer: 0,
    groundSlope: 0.35,
    dt: 0.2,
  });
  const downhill = stepCraftPhysics({
    vx,
    vy,
    angle,
    throttle: 1,
    steer: 0,
    stats,
    turboTimer: 0,
    mudTimer: 0,
    onBoostCurrent: false,
    lightningSlowTimer: 0,
    groundSlope: -0.35,
    dt: 0.2,
  });
  assert.ok(downhill.speed > uphill.speed);

  // 2-stage drift mini-turbo charging & release
  let dVx = Math.cos(0) * 520;
  let dVy = Math.sin(0) * 520;
  let dAngle = 0;
  let driftCharge = 0;
  let maxStage: 0 | 1 | 2 = 0;
  for (let i = 0; i < 36; i++) {
    const dStep = stepCraftPhysics({
      vx: dVx,
      vy: dVy,
      angle: dAngle,
      throttle: 1,
      steer: 1,
      stats,
      turboTimer: 0,
      mudTimer: 0,
      onBoostCurrent: false,
      lightningSlowTimer: 0,
      driftCharge,
      dt: 0.05,
    });
    dVx = dStep.vx;
    dVy = dStep.vy;
    dAngle = dStep.angle;
    driftCharge = dStep.driftCharge;
    if (dStep.driftStage > maxStage) maxStage = dStep.driftStage;
  }
  assert.equal(maxStage, 2);

  const releaseStep = stepCraftPhysics({
    vx: dVx,
    vy: dVy,
    angle: dAngle,
    throttle: 1,
    steer: 0,
    stats,
    turboTimer: 0,
    mudTimer: 0,
    onBoostCurrent: false,
    lightningSlowTimer: 0,
    driftCharge,
    dt: 0.05,
  });
  assert.equal(releaseStep.miniTurboTriggered, 2);

  const nitroStep = stepCraftPhysics({
    vx,
    vy,
    angle,
    throttle: 1,
    steer: 0,
    stats,
    turboTimer: 0,
    nitroOverdriveTimer: 2.0,
    mudTimer: 0,
    onBoostCurrent: false,
    lightningSlowTimer: 0,
    dt: 0.25,
  });
  assert.ok(nitroStep.speed > cruiseSpeed);

  const mudStep = stepCraftPhysics({
    vx,
    vy,
    angle,
    throttle: 1,
    steer: 0,
    stats,
    turboTimer: 0,
    mudTimer: 1.5,
    onBoostCurrent: false,
    lightningSlowTimer: 0,
    dt: 0.4,
  });
  assert.ok(mudStep.speed < cruiseSpeed);
});

test('right-handed 3D mapping keeps right steer aligned with worldRight', () => {
  const fwd0 = worldForwardFromAngle(0);
  const right0 = worldRightFromAngle(0);
  assert.deepEqual(fwd0, { x: 1, y: 0, z: 0 });
  assert.deepEqual(right0, { x: 0, y: 0, z: 1 });

  const turned = stepCraftPhysics({
    vx: 300,
    vy: 0,
    angle: 0,
    throttle: 1,
    steer: 1,
    stats: VEHICLES[0].baseStats,
    turboTimer: 0,
    mudTimer: 0,
    onBoostCurrent: false,
    lightningSlowTimer: 0,
    dt: 0.1,
  });
  const fwdTurned = worldForwardFromAngle(turned.angle);
  const dotWithRight = fwdTurned.x * right0.x + fwdTurned.z * right0.z;
  assert.ok(dotWithRight > 0, 'positive steer must turn toward worldRight');

  const wPos = mapTrackToWorld(100, -200, 1.5, 0.05);
  assert.deepEqual(wPos, { x: 5, y: 1.5, z: -10 });
});

test('multi-camera system: Low-Chase (62-90 deg FOV + drift swing) and Hood POV (bow mount + corner roll)', () => {
  const idleCam = stepChaseCamera({
    playerX: 0,
    playerY: 0,
    playerAirZ: 0,
    playerAngle: 0,
    playerSpeed: 0,
    maxBaseSpeed: 650,
    steerInput: 0,
    lateralSlip: 0,
    turboActive: false,
    nitroActive: false,
    camAngle: 0,
    camFov: 62,
    driftSwing: 0,
    dt: 0.05,
  });
  assert.ok(idleCam.camFov >= 62 && idleCam.camFov < 63);
  assert.ok(idleCam.camWorldX < 0); // Trailing behind craft facing +X
  assert.ok(idleCam.camWorldY < 1.8); // Low chase cam height
  assert.ok(idleCam.lookWorldX > 15); // Looking far toward horizon

  let fov = 62;
  let swing = 0;
  let camAngle = 0;
  let res = idleCam;
  for (let i = 0; i < 45; i++) {
    res = stepChaseCamera({
      playerX: i * 15,
      playerY: 0,
      playerAirZ: 0,
      playerAngle: 0,
      playerSpeed: 950,
      maxBaseSpeed: 650,
      steerInput: 1,
      lateralSlip: 180,
      turboActive: true,
      nitroActive: true,
      camAngle,
      camFov: fov,
      driftSwing: swing,
      dt: 0.05,
    });
    fov = res.camFov;
    swing = res.driftSwing;
    camAngle = res.camAngle;
  }
  assert.ok(res.camFov > 86 && res.camFov <= 90);
  assert.ok(Math.abs(res.driftSwing) > 0.5);
  assert.ok(res.speedLinesIntensity > 0.85);

  // Hood / Cockpit POV Camera
  let hoodFov = 62;
  let hoodRoll = 0;
  let hoodRes = stepHoodCamera({
    playerX: 0,
    playerY: 0,
    playerAirZ: 0,
    playerAngle: 0,
    playerSpeed: 650,
    maxBaseSpeed: 650,
    steerInput: 1,
    lateralSlip: 160,
    turboActive: false,
    nitroActive: false,
    camAngle: 0,
    camFov: hoodFov,
    driftSwing: hoodRoll,
    dt: 0.05,
  });
  for (let i = 0; i < 30; i++) {
    hoodRes = stepHoodCamera({
      playerX: 0,
      playerY: 0,
      playerAirZ: 0,
      playerAngle: 0,
      playerSpeed: 650,
      maxBaseSpeed: 650,
      steerInput: 1,
      lateralSlip: 160,
      turboActive: false,
      nitroActive: false,
      camAngle: 0,
      camFov: hoodFov,
      driftSwing: hoodRoll,
      dt: 0.05,
    });
    hoodFov = hoodRes.camFov;
    hoodRoll = hoodRes.camRoll;
  }
  assert.ok(hoodRes.camWorldX > 0, 'hood cam mounts forward near craft bow');
  assert.ok(hoodRes.camFov >= 73 && hoodRes.camFov <= 77, 'cruise FOV targets ~75 deg');
  assert.ok(Math.abs(hoodRes.camRoll) > 0.08, 'hood cam rolls strongly into corners');
});

test('heading-up camera wraps shortest angle across +/-PI smoothly', () => {
  const next = stepCameraAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.05, 10);
  assert.ok(Math.abs(next) > 2.9);
});

test('onIce surface produces significantly wider lateral drift slip than normal water', () => {
  const stats = VEHICLES[0].baseStats;
  const normalStep = stepCraftPhysics({
    vx: 480,
    vy: 0,
    angle: 0,
    throttle: 1,
    steer: 1,
    stats,
    turboTimer: 0,
    mudTimer: 0,
    onBoostCurrent: false,
    onIce: false,
    lightningSlowTimer: 0,
    dt: 0.15,
  });
  const iceStep = stepCraftPhysics({
    vx: 480,
    vy: 0,
    angle: 0,
    throttle: 1,
    steer: 1,
    stats,
    turboTimer: 0,
    mudTimer: 0,
    onBoostCurrent: false,
    onIce: true,
    lightningSlowTimer: 0,
    dt: 0.15,
  });
  assert.ok(iceStep.lateralSlip > normalStep.lateralSlip);
});

test('computeWaveHeight produces strong storm swells on pirate biome and flattens on bridges or tunnels', () => {
  let maxPirate = 0;
  for (let t = 0; t < 3.0; t += 0.2) {
    maxPirate = Math.max(maxPirate, Math.abs(computeWaveHeight(120, 340, t, 'pirate', 'water', false)));
  }
  assert.ok(maxPirate > 6);
  assert.equal(computeWaveHeight(120, 340, 1.0, 'pirate', 'bridge', false), 0);
  assert.equal(computeWaveHeight(120, 340, 1.0, 'pirate', 'water', true), 0);
  assert.equal(computeWaveHeight(120, 340, 1.0, 'city', 'water', false), 0);
});

test('evaluateAiPowerDecision deploys offensive and defensive powers strategically', () => {
  assert.equal(
    evaluateAiPowerDecision({
      heldItem: 'shield',
      myProgress: 1.4,
      leaderProgress: 1.6,
      playerProgress: 1.5,
      myRank: 2,
      closestAheadDist: 500,
      closestBehindDist: 500,
      threatenedByMissile: true,
      onStraight: false,
      cooldownReady: false,
    }),
    true
  );
  assert.equal(
    evaluateAiPowerDecision({
      heldItem: 'lightning',
      myProgress: 1.2,
      leaderProgress: 1.5,
      playerProgress: 1.4,
      myRank: 3,
      closestAheadDist: 600,
      closestBehindDist: 600,
      threatenedByMissile: false,
      onStraight: false,
      cooldownReady: true,
    }),
    true
  );
  assert.equal(
    evaluateAiPowerDecision({
      heldItem: 'missile',
      myProgress: 1.2,
      leaderProgress: 1.5,
      playerProgress: 1.4,
      myRank: 2,
      closestAheadDist: 400,
      closestBehindDist: 700,
      threatenedByMissile: false,
      onStraight: true,
      cooldownReady: true,
    }),
    true
  );
  assert.equal(
    evaluateAiPowerDecision({
      heldItem: 'missile',
      myProgress: 1.2,
      leaderProgress: 1.5,
      playerProgress: 1.4,
      myRank: 1,
      closestAheadDist: 400,
      closestBehindDist: 700,
      threatenedByMissile: false,
      onStraight: true,
      cooldownReady: true,
    }),
    false
  );
  assert.equal(
    evaluateAiPowerDecision({
      heldItem: 'mine',
      myProgress: 1.5,
      leaderProgress: 1.6,
      playerProgress: 1.4,
      myRank: 4,
      closestAheadDist: 600,
      closestBehindDist: 220,
      threatenedByMissile: false,
      onStraight: false,
      cooldownReady: true,
    }),
    true
  );
});

test('all 6 tracks have distinct non-oval silhouettes including City Figure-8 crossing and Pirate ramps', () => {
  for (const def of TRACK_DEFS) {
    const samples = sampleClosedSpline(def.points, 12, 'main');
    const xs = samples.map((p) => p.x);
    const ys = samples.map((p) => p.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    assert.ok(spanX > 2200 && spanY > 2200, `${def.id} spans large custom layout`);
  }

  // City track forms a real Figure-8 crossing with elevated overpass over lower canal
  const cityDef = TRACK_DEFS.find((t) => t.id === 'city')!;
  const citySamples = sampleClosedSpline(cityDef.points, 14, 'main');
  const lowUnderpass = citySamples.filter((p) => p.z < 10);
  const highOverpass = citySamples.filter((p) => p.z >= 120);
  let minCrossDist = Infinity;
  for (const lo of lowUnderpass) {
    for (const hi of highOverpass) {
      const d = Math.hypot(lo.x - hi.x, lo.y - hi.y);
      if (d < minCrossDist) minCrossDist = d;
    }
  }
  assert.ok(minCrossDist < 85, `City Figure-8 overpass must cross directly above lower canal (dist=${minCrossDist.toFixed(1)})`);

  // Volcano & Pirate feature jump ramps
  const volcanoDef = TRACK_DEFS.find((t) => t.id === 'volcano')!;
  const pirateDef = TRACK_DEFS.find((t) => t.id === 'pirate')!;
  const volcanoSamples = sampleClosedSpline(volcanoDef.points, 12, 'main');
  const pirateSamples = sampleClosedSpline(pirateDef.points, 12, 'main');
  assert.ok(volcanoSamples.some((p) => p.surface === 'ramp'), 'volcano includes jump ramps');
  assert.ok(pirateSamples.some((p) => p.surface === 'ramp'), 'pirate includes jump ramps');
  assert.ok(pirateSamples.slice(-24).some((p) => p.surface === 'ramp'), 'pirate finishes with a final jump ramp');
});

test('solid oriented-capsule vehicle collision prevents overlap, transfers momentum, respects Shield Bubble and Figure-8 height', () => {
  // 1. Overlapping capsules are separated cleanly with zero remaining overlap
  const a: CollisionRacerBody = {
    x: 0,
    y: 0,
    airZ: 0,
    vx: 460,
    vy: 0,
    angle: 0,
    hullType: 'speedboat',
    shieldTimer: 0,
  };
  const b: CollisionRacerBody = {
    x: 10,
    y: 12,
    airZ: 0,
    vx: 260,
    vy: 0,
    angle: 0,
    hullType: 'jetski',
    shieldTimer: 0,
  };
  const res1 = resolveVehicleCollision(a, b);
  assert.equal(res1.collided, true);
  // Running a second check right away should show zero residual overlap
  const resFollow = resolveVehicleCollision(a, b);
  assert.equal(resFollow.collided, false);

  // 2. Rear-end collision slows trailing craft and pushes lead craft forward
  const trailer: CollisionRacerBody = {
    x: 0,
    y: 0,
    airZ: 0,
    vx: 620,
    vy: 0,
    angle: 0,
    hullType: 'jetski',
    shieldTimer: 0,
  };
  const leader: CollisionRacerBody = {
    x: 34,
    y: 0,
    airZ: 0,
    vx: 240,
    vy: 0,
    angle: 0,
    hullType: 'jetski',
    shieldTimer: 0,
  };
  const rearHit = resolveVehicleCollision(trailer, leader);
  assert.equal(rearHit.collided, true);
  assert.ok(trailer.vx < 620, 'trailing craft transfers forward momentum on rear-end hit');
  assert.ok(leader.vx > 240, 'lead craft receives forward push from rear impact');

  // 3. Sideswipe transfers lateral velocity impulse
  const leftCraft: CollisionRacerBody = {
    x: 0,
    y: -14,
    airZ: 0,
    vx: 420,
    vy: 60,
    angle: 0,
    hullType: 'yacht',
    shieldTimer: 0,
  };
  const rightCraft: CollisionRacerBody = {
    x: 0,
    y: 14,
    airZ: 0,
    vx: 420,
    vy: -60,
    angle: 0,
    hullType: 'speedboat',
    shieldTimer: 0,
  };
  const sideHit = resolveVehicleCollision(leftCraft, rightCraft);
  assert.equal(sideHit.collided, true);
  assert.ok(leftCraft.vy < 0 && rightCraft.vy > 0, 'sideswipe pushes both crafts laterally apart');

  // 4. Shield Bubble keeps shielded craft speed intact while knocking rival aside
  const shielded: CollisionRacerBody = {
    x: 0,
    y: 0,
    airZ: 0,
    vx: 550,
    vy: 0,
    angle: 0,
    hullType: 'jetski',
    shieldTimer: 3.0,
  };
  const victim: CollisionRacerBody = {
    x: 24,
    y: 8,
    airZ: 0,
    vx: 500,
    vy: 0,
    angle: 0,
    hullType: 'speedboat',
    shieldTimer: 0,
  };
  const shieldHit = resolveVehicleCollision(shielded, victim);
  assert.equal(shieldHit.collided, true);
  assert.equal(shieldHit.shieldKnock, true);
  assert.equal(shielded.vx, 550, 'shielded racer keeps 100% velocity');
  assert.ok(Math.hypot(victim.vx - 500, victim.vy) > 250, 'unshielded rival gets knocked strongly');

  // 5. Figure-8 height clearance: overpass vs underpass never collide
  const dim = getHullColliderDims('speedboat');
  assert.ok(dim.radius > 0 && dim.halfSpine > 0);
  const underpassRacer: CollisionRacerBody = {
    x: 0,
    y: 0,
    airZ: 0,
    vx: 450,
    vy: 0,
    angle: 0,
    hullType: 'speedboat',
    shieldTimer: 0,
  };
  const overpassRacer: CollisionRacerBody = {
    x: 0,
    y: 0,
    airZ: 145,
    vx: 0,
    vy: 450,
    angle: Math.PI / 2,
    hullType: 'speedboat',
    shieldTimer: 0,
  };
  const bridgeCheck = resolveVehicleCollision(underpassRacer, overpassRacer);
  assert.equal(bridgeCheck.collided, false, 'Figure-8 vertical overpass must clear underpass racers');
});

