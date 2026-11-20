import * as THREE from 'three';

export interface ProceduralTextureSet {
  waterNormal: THREE.CanvasTexture;
  waterRoughness: THREE.CanvasTexture;
  waterAlbedo: THREE.CanvasTexture;
  bridgeWoodAlbedo: THREE.CanvasTexture;
  bridgeMetalAlbedo: THREE.CanvasTexture;
  surfaceNormal: THREE.CanvasTexture;
  surfaceRoughness: THREE.CanvasTexture;
  tunnelWallAlbedo: THREE.CanvasTexture;
  tunnelWallNormal: THREE.CanvasTexture;
  cityTowerAlbedo: THREE.CanvasTexture;
  chevronSign: THREE.CanvasTexture;
  barrierStripe: THREE.CanvasTexture;
  checkeredBanner: THREE.CanvasTexture;
  powerBox: THREE.CanvasTexture;
  glowDisc: THREE.CanvasTexture;
  shadowDisc: THREE.CanvasTexture;
  headlightBeam: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const aniso = Math.max(1, maxAnisotropy);
  const TEX = 1024;

  // 1. Tileable 1024x1024 Water Normal Map (Linear / NoColorSpace)
  const [nCan, nCtx] = makeCanvas(TEX, TEX);
  const nImg = nCtx.createImageData(TEX, TEX);
  const nd = nImg.data;
  const twoPiOverTex = (Math.PI * 2) / TEX;
  for (let y = 0; y < TEX; y++) {
    const v = y * twoPiOverTex;
    const sinV3 = Math.sin(v * 3);
    const sinV5 = Math.sin(v * 5);
    for (let x = 0; x < TEX; x++) {
      const u = x * twoPiOverTex;
      const dx =
        Math.cos(u * 4 + sinV3) * 0.34 +
        Math.cos(u * 10 - v * 7) * 0.22 +
        Math.sin(u * 18 + v * 13) * 0.12;
      const dy =
        Math.sin(v * 6 + Math.cos(u * 4)) * 0.34 +
        sinV5 * 0.14 +
        Math.sin(v * 9 + u * 6) * 0.18 +
        Math.cos(v * 17 - u * 12) * 0.11;
      const nx = dx > 1 ? 1 : dx < -1 ? -1 : dx;
      const ny = dy > 1 ? 1 : dy < -1 ? -1 : dy;
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      const idx = (y * TEX + x) * 4;
      nd[idx] = (nx * 0.5 + 0.5) * 255;
      nd[idx + 1] = (ny * 0.5 + 0.5) * 255;
      nd[idx + 2] = (nz * 0.5 + 0.5) * 255;
      nd[idx + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  const waterNormal = new THREE.CanvasTexture(nCan);
  waterNormal.wrapS = THREE.RepeatWrapping;
  waterNormal.wrapT = THREE.RepeatWrapping;
  waterNormal.anisotropy = aniso;

  // 2. 1024x1024 Water Specular / Roughness Map (Linear / NoColorSpace)
  const [rCan, rCtx] = makeCanvas(TEX, TEX);
  rCtx.fillStyle = '#2c2c2c';
  rCtx.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 1600; i++) {
    const x = (i * 193) % TEX;
    const y = (i * 317) % TEX;
    const w = 24 + (i % 7) * 18;
    const h = 5 + (i % 4) * 4;
    rCtx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(12,12,12,0.24)';
    rCtx.fillRect(x, y, w, h);
  }
  const waterRoughness = new THREE.CanvasTexture(rCan);
  waterRoughness.wrapS = THREE.RepeatWrapping;
  waterRoughness.wrapT = THREE.RepeatWrapping;
  waterRoughness.anisotropy = aniso;

  // 3. 1024x1024 Water Crisp Foam Streaks Albedo Map (sRGB)
  const [aCan, aCtx] = makeCanvas(TEX, TEX);
  aCtx.fillStyle = '#ffffff';
  aCtx.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 380; i++) {
    const x = (i * 131) % TEX;
    const y = (i * 227) % TEX;
    aCtx.fillStyle = i % 2 === 0 ? 'rgba(210, 245, 255, 0.25)' : 'rgba(135, 195, 235, 0.2)';
    aCtx.fillRect(x, y, 5 + (i % 5) * 4, 38 + (i % 6) * 20);
  }
  const waterAlbedo = new THREE.CanvasTexture(aCan);
  waterAlbedo.colorSpace = THREE.SRGBColorSpace;
  waterAlbedo.wrapS = THREE.RepeatWrapping;
  waterAlbedo.wrapT = THREE.RepeatWrapping;
  waterAlbedo.anisotropy = aniso;

  // 4. 1024x1024 Suspension Wooden Bridge Planks Albedo (sRGB)
  const [bwCan, bwCtx] = makeCanvas(TEX, TEX);
  bwCtx.fillStyle = '#78350f';
  bwCtx.fillRect(0, 0, TEX, TEX);
  const plankRows = 16;
  const plankH = TEX / plankRows;
  for (let p = 0; p < plankRows; p++) {
    const py = p * plankH;
    const shade = p % 3 === 0 ? '#92400e' : p % 2 === 0 ? '#78350f' : '#6b300c';
    bwCtx.fillStyle = shade;
    bwCtx.fillRect(0, py + 3, TEX, plankH - 6);
    bwCtx.fillStyle = 'rgba(28, 12, 4, 0.55)';
    bwCtx.fillRect(0, py, TEX, 4);
    for (let g = 0; g < 18; g++) {
      bwCtx.fillStyle = g % 2 === 0 ? 'rgba(251, 191, 36, 0.08)' : 'rgba(40, 18, 6, 0.18)';
      bwCtx.fillRect(((p * 97 + g * 137) % (TEX - 140)), py + 8 + (g * 7) % (plankH - 16), 90 + (g % 5) * 32, 3);
    }
    // Iron bolts on each plank edge
    bwCtx.fillStyle = '#1e293b';
    bwCtx.beginPath();
    bwCtx.arc(46, py + plankH * 0.5, 7, 0, Math.PI * 2);
    bwCtx.arc(TEX - 46, py + plankH * 0.5, 7, 0, Math.PI * 2);
    bwCtx.fill();
  }
  const bridgeWoodAlbedo = new THREE.CanvasTexture(bwCan);
  bridgeWoodAlbedo.colorSpace = THREE.SRGBColorSpace;
  bridgeWoodAlbedo.wrapS = THREE.RepeatWrapping;
  bridgeWoodAlbedo.wrapT = THREE.RepeatWrapping;
  bridgeWoodAlbedo.anisotropy = aniso;

  // 5. 1024x1024 Metallic Asphalt / Bascule Bridge Deck Albedo (sRGB)
  const [bmCan, bmCtx] = makeCanvas(TEX, TEX);
  bmCtx.fillStyle = '#1e293b';
  bmCtx.fillRect(0, 0, TEX, TEX);
  for (let y = 0; y < TEX; y += 64) {
    bmCtx.fillStyle = y % 128 === 0 ? '#273549' : '#1e293b';
    bmCtx.fillRect(0, y, TEX, 62);
    bmCtx.fillStyle = '#0f172a';
    bmCtx.fillRect(0, y + 60, TEX, 4);
  }
  for (let i = 0; i < 1400; i++) {
    bmCtx.fillStyle = i % 2 === 0 ? 'rgba(148, 163, 184, 0.08)' : 'rgba(15, 23, 42, 0.18)';
    bmCtx.fillRect((i * 173) % TEX, (i * 257) % TEX, 6, 6);
  }
  // Center dashed guide stripe & edge neon safety trim
  bmCtx.fillStyle = '#38bdf8';
  bmCtx.fillRect(16, 0, 14, TEX);
  bmCtx.fillRect(TEX - 30, 0, 14, TEX);
  bmCtx.fillStyle = '#facc15';
  for (let y = 16; y < TEX; y += 128) {
    bmCtx.fillRect(TEX * 0.5 - 8, y, 16, 72);
  }
  const bridgeMetalAlbedo = new THREE.CanvasTexture(bmCan);
  bridgeMetalAlbedo.colorSpace = THREE.SRGBColorSpace;
  bridgeMetalAlbedo.wrapS = THREE.RepeatWrapping;
  bridgeMetalAlbedo.wrapT = THREE.RepeatWrapping;
  bridgeMetalAlbedo.anisotropy = aniso;

  // 6. 1024x1024 Surface Normal & Roughness Maps for Bridges / Planks (Linear / NoColorSpace)
  const [snCan, snCtx] = makeCanvas(TEX, TEX);
  snCtx.fillStyle = 'rgb(128,128,255)';
  snCtx.fillRect(0, 0, TEX, TEX);
  const [srCan, srCtx] = makeCanvas(TEX, TEX);
  srCtx.fillStyle = '#8a8a8a';
  srCtx.fillRect(0, 0, TEX, TEX);
  for (let p = 0; p < plankRows; p++) {
    const py = p * plankH;
    snCtx.fillStyle = 'rgb(128, 70, 220)';
    snCtx.fillRect(0, py, TEX, 5);
    snCtx.fillStyle = 'rgb(128, 185, 225)';
    snCtx.fillRect(0, py + 5, TEX, 4);
    srCtx.fillStyle = '#d4d4d4';
    srCtx.fillRect(0, py, TEX, 6);
    for (let g = 0; g < 16; g++) {
      srCtx.fillStyle = g % 2 === 0 ? '#555555' : '#a8a8a8';
      srCtx.fillRect((g * 149 + p * 71) % TEX, py + 10 + (g * 5) % (plankH - 14), 72, 3);
    }
  }
  const surfaceNormal = new THREE.CanvasTexture(snCan);
  surfaceNormal.wrapS = THREE.RepeatWrapping;
  surfaceNormal.wrapT = THREE.RepeatWrapping;
  surfaceNormal.anisotropy = aniso;

  const surfaceRoughness = new THREE.CanvasTexture(srCan);
  surfaceRoughness.wrapS = THREE.RepeatWrapping;
  surfaceRoughness.wrapT = THREE.RepeatWrapping;
  surfaceRoughness.anisotropy = aniso;

  // 7. 1024x1024 Tunnel Wall Albedo + Normal Maps
  const [twCan, twCtx] = makeCanvas(TEX, TEX);
  twCtx.fillStyle = '#94a3b8';
  twCtx.fillRect(0, 0, TEX, TEX);
  const [twnCan, twnCtx] = makeCanvas(TEX, TEX);
  twnCtx.fillStyle = 'rgb(128,128,255)';
  twnCtx.fillRect(0, 0, TEX, TEX);
  for (let y = 0; y < TEX; y += 128) {
    for (let x = 0; x < TEX; x += 256) {
      const off = ((y / 128) % 2) * 128;
      const bx = (x + off) % TEX;
      twCtx.fillStyle = (x + y) % 256 === 0 ? '#cbd5e1' : '#64748b';
      twCtx.fillRect(bx + 4, y + 4, 248, 120);
      twCtx.strokeStyle = '#1e293b';
      twCtx.lineWidth = 6;
      twCtx.strokeRect(bx + 3, y + 3, 250, 122);

      twnCtx.fillStyle = 'rgb(142, 114, 235)';
      twnCtx.fillRect(bx + 6, y + 6, 244, 10);
      twnCtx.fillStyle = 'rgb(112, 144, 235)';
      twnCtx.fillRect(bx + 6, y + 114, 244, 10);
    }
  }
  const tunnelWallAlbedo = new THREE.CanvasTexture(twCan);
  tunnelWallAlbedo.colorSpace = THREE.SRGBColorSpace;
  tunnelWallAlbedo.wrapS = THREE.RepeatWrapping;
  tunnelWallAlbedo.wrapT = THREE.RepeatWrapping;
  tunnelWallAlbedo.repeat.set(4, 2);
  tunnelWallAlbedo.anisotropy = aniso;

  const tunnelWallNormal = new THREE.CanvasTexture(twnCan);
  tunnelWallNormal.wrapS = THREE.RepeatWrapping;
  tunnelWallNormal.wrapT = THREE.RepeatWrapping;
  tunnelWallNormal.repeat.set(4, 2);
  tunnelWallNormal.anisotropy = aniso;

  // 8. 1024x1024 Illuminated Futuristic Skyscraper Windows Albedo (sRGB)
  const [ctCan, ctCtx] = makeCanvas(TEX, TEX);
  ctCtx.fillStyle = '#090f24';
  ctCtx.fillRect(0, 0, TEX, TEX);
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 16; col++) {
      const lit = (row * 17 + col * 31) % 5 !== 0;
      if (!lit) continue;
      const tint = (row + col) % 7 === 0 ? '#f43f5e' : (row * col) % 4 === 0 ? '#facc15' : '#38bdf8';
      ctCtx.fillStyle = tint;
      ctCtx.fillRect(col * 64 + 12, row * 32 + 7, 40, 18);
    }
  }
  const cityTowerAlbedo = new THREE.CanvasTexture(ctCan);
  cityTowerAlbedo.colorSpace = THREE.SRGBColorSpace;
  cityTowerAlbedo.wrapS = THREE.RepeatWrapping;
  cityTowerAlbedo.wrapT = THREE.RepeatWrapping;
  cityTowerAlbedo.anisotropy = aniso;

  // 9. Illuminated Curve Chevron Sign (sRGB)
  const [cCan, cCtx] = makeCanvas(512, 256);
  cCtx.fillStyle = '#090d1a';
  cCtx.fillRect(0, 0, 512, 256);
  cCtx.strokeStyle = '#334155';
  cCtx.lineWidth = 10;
  cCtx.strokeRect(5, 5, 502, 246);
  for (let k = 0; k < 3; k++) {
    const ox = 85 + k * 150;
    cCtx.fillStyle = k === 1 ? '#fef08a' : '#f97316';
    cCtx.beginPath();
    cCtx.moveTo(ox - 45, 36);
    cCtx.lineTo(ox + 20, 36);
    cCtx.lineTo(ox + 75, 128);
    cCtx.lineTo(ox + 20, 220);
    cCtx.lineTo(ox - 45, 220);
    cCtx.lineTo(ox + 10, 128);
    cCtx.closePath();
    cCtx.fill();
  }
  const chevronSign = new THREE.CanvasTexture(cCan);
  chevronSign.colorSpace = THREE.SRGBColorSpace;
  chevronSign.anisotropy = aniso;

  // 10. Modern Barrier Hazard Stripe (sRGB)
  const [bCan, bCtx] = makeCanvas(256, 128);
  bCtx.fillStyle = '#1e293b';
  bCtx.fillRect(0, 0, 256, 128);
  bCtx.fillStyle = '#f8fafc';
  for (let x = -128; x < 384; x += 64) {
    bCtx.beginPath();
    bCtx.moveTo(x, 0);
    bCtx.lineTo(x + 32, 0);
    bCtx.lineTo(x - 16, 128);
    bCtx.lineTo(x - 48, 128);
    bCtx.closePath();
    bCtx.fill();
  }
  bCtx.fillStyle = '#22d3ee';
  bCtx.fillRect(0, 0, 256, 14);
  const barrierStripe = new THREE.CanvasTexture(bCan);
  barrierStripe.colorSpace = THREE.SRGBColorSpace;
  barrierStripe.wrapS = THREE.RepeatWrapping;
  barrierStripe.wrapT = THREE.RepeatWrapping;
  barrierStripe.anisotropy = aniso;

  // 11. Start / Finish Checkered Gantry Banner (sRGB)
  const [sCan, sCtx] = makeCanvas(256, 128);
  const cell = 32;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 8; x++) {
      sCtx.fillStyle = (x + y) % 2 === 0 ? '#f8fafc' : '#090d1a';
      sCtx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  sCtx.fillStyle = '#facc15';
  sCtx.fillRect(0, 0, 256, 6);
  sCtx.fillRect(0, 122, 256, 6);
  const checkeredBanner = new THREE.CanvasTexture(sCan);
  checkeredBanner.colorSpace = THREE.SRGBColorSpace;
  checkeredBanner.wrapS = THREE.RepeatWrapping;
  checkeredBanner.wrapT = THREE.RepeatWrapping;
  checkeredBanner.anisotropy = aniso;

  // 12. Surprise Power-Up Box Face (sRGB)
  const [pCan, pCtx] = makeCanvas(512, 512);
  const pGrad = pCtx.createLinearGradient(0, 0, 512, 512);
  pGrad.addColorStop(0, '#facc15');
  pGrad.addColorStop(0.5, '#f97316');
  pGrad.addColorStop(1, '#ec4899');
  pCtx.fillStyle = pGrad;
  pCtx.fillRect(0, 0, 512, 512);
  pCtx.strokeStyle = '#ffffff';
  pCtx.lineWidth = 36;
  pCtx.strokeRect(24, 24, 464, 464);
  pCtx.fillStyle = '#090d1a';
  pCtx.font = '900 310px system-ui, sans-serif';
  pCtx.textAlign = 'center';
  pCtx.textBaseline = 'middle';
  pCtx.fillText('?', 256, 276);
  pCtx.strokeStyle = '#ffffff';
  pCtx.lineWidth = 12;
  pCtx.strokeText('?', 256, 276);
  const powerBox = new THREE.CanvasTexture(pCan);
  powerBox.colorSpace = THREE.SRGBColorSpace;
  powerBox.anisotropy = aniso;

  // 13. Vivid NFS Neon Underglow Skirt Disc (sRGB)
  const [gCan, gCtx] = makeCanvas(256, 256);
  const gGrad = gCtx.createRadialGradient(128, 128, 12, 128, 128, 124);
  gGrad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
  gGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.85)');
  gGrad.addColorStop(0.74, 'rgba(255, 255, 255, 0.35)');
  gGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
  gCtx.fillStyle = gGrad;
  gCtx.fillRect(0, 0, 256, 256);
  const glowDisc = new THREE.CanvasTexture(gCan);
  glowDisc.colorSpace = THREE.SRGBColorSpace;

  // 14. Soft Contact Shadow Disc (sRGB)
  const [shCan, shCtx] = makeCanvas(256, 256);
  const shGrad = shCtx.createRadialGradient(128, 128, 10, 128, 128, 124);
  shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  shGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.32)');
  shGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 256, 256);
  const shadowDisc = new THREE.CanvasTexture(shCan);
  shadowDisc.colorSpace = THREE.SRGBColorSpace;

  // 15. Projected Headlight Beam Cone Texture (sRGB)
  const [hlCan, hlCtx] = makeCanvas(256, 256);
  const hlGrad = hlCtx.createLinearGradient(0, 128, 256, 128);
  hlGrad.addColorStop(0, 'rgba(224, 247, 255, 0.92)');
  hlGrad.addColorStop(0.5, 'rgba(186, 230, 253, 0.42)');
  hlGrad.addColorStop(1, 'rgba(186, 230, 253, 0.0)');
  hlCtx.fillStyle = hlGrad;
  hlCtx.beginPath();
  hlCtx.moveTo(0, 114);
  hlCtx.lineTo(256, 14);
  hlCtx.lineTo(256, 242);
  hlCtx.lineTo(0, 142);
  hlCtx.closePath();
  hlCtx.fill();
  const headlightBeam = new THREE.CanvasTexture(hlCan);
  headlightBeam.colorSpace = THREE.SRGBColorSpace;

  const allTextures = [
    waterNormal,
    waterRoughness,
    waterAlbedo,
    bridgeWoodAlbedo,
    bridgeMetalAlbedo,
    surfaceNormal,
    surfaceRoughness,
    tunnelWallAlbedo,
    tunnelWallNormal,
    cityTowerAlbedo,
    chevronSign,
    barrierStripe,
    checkeredBanner,
    powerBox,
    glowDisc,
    shadowDisc,
    headlightBeam,
  ];

  return {
    waterNormal,
    waterRoughness,
    waterAlbedo,
    bridgeWoodAlbedo,
    bridgeMetalAlbedo,
    surfaceNormal,
    surfaceRoughness,
    tunnelWallAlbedo,
    tunnelWallNormal,
    cityTowerAlbedo,
    chevronSign,
    barrierStripe,
    checkeredBanner,
    powerBox,
    glowDisc,
    shadowDisc,
    headlightBeam,
    dispose: () => allTextures.forEach((t) => t.dispose()),
  };
}

export function createSkyDomeTexture(
  skyTop: string,
  skyHorizon: string,
  neonAccent: string,
  biome: string
): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(1024, 512);
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, skyTop);
  grad.addColorStop(0.36, skyTop);
  grad.addColorStop(0.52, skyHorizon);
  grad.addColorStop(0.57, biome === 'lagoon' ? '#fef08a' : neonAccent);
  grad.addColorStop(0.65, skyHorizon);
  grad.addColorStop(1, skyTop);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Horizon atmospheric glow band
  ctx.save();
  ctx.globalAlpha = biome === 'lagoon' ? 0.45 : 0.28;
  const horizonGlow = ctx.createLinearGradient(0, 195, 0, 305);
  horizonGlow.addColorStop(0, 'rgba(0,0,0,0)');
  horizonGlow.addColorStop(0.5, biome === 'lagoon' ? '#fde047' : neonAccent);
  horizonGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, 195, 1024, 110);
  ctx.restore();

  if (biome === 'lagoon') {
    // Sunny coastal solar disc + bright tropical clouds
    const sunGrad = ctx.createRadialGradient(280, 185, 6, 280, 185, 76);
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.28, '#fef08a');
    sunGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(280, 185, 76, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let i = 0; i < 12; i++) {
      const cx = (i * 97 + 40) % 1024;
      const cy = 140 + (i % 4) * 24;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 48 + (i % 3) * 18, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (let i = 0; i < 240; i++) {
      const sx = (i * 197 + 43) % 1024;
      const sy = (i * 89 + 19) % 228;
      const r = i % 6 === 0 ? 1.15 : 0.65;
      ctx.fillStyle = i % 7 === 0 ? neonAccent : 'rgba(248, 250, 252, 0.85)';
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // City neon skyline silhouettes on horizon
  if (biome === 'city') {
    ctx.fillStyle = '#070b1a';
    for (let x = 0; x < 1024; x += 28) {
      const bh = 22 + ((x * 37) % 68);
      ctx.fillRect(x, 266 - bh, 22, bh);
      ctx.fillStyle = x % 56 === 0 ? neonAccent : '#facc15';
      ctx.fillRect(x + 4, 266 - bh + 4, 14, 3);
      ctx.fillStyle = '#070b1a';
    }
  }

  // Aurora ribbons in Arctic sky
  if (biome === 'arctic') {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 22;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 32) {
      const y = 135 + Math.sin(x * 0.012) * 30;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Stormy moon & lightning clouds in Pirate Cove sky
  if (biome === 'pirate') {
    const moonGrad = ctx.createRadialGradient(740, 175, 4, 740, 175, 52);
    moonGrad.addColorStop(0, '#f8fafc');
    moonGrad.addColorStop(0.4, 'rgba(226, 232, 240, 0.55)');
    moonGrad.addColorStop(1, 'rgba(226, 232, 240, 0)');
    ctx.fillStyle = moonGrad;
    ctx.beginPath();
    ctx.arc(740, 175, 52, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
