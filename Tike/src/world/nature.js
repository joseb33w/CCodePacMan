import * as THREE from 'three';
import { elevation } from './terrain.js';
import { mulberry32, fbm, smoothstep, clamp } from '../lib/noise.js';
import { distanceToRiver, riverCurve } from './river.js';
import { PLACES } from './landmarks.js';

// Matches the park blocks the city generator leaves empty.
const PARK_SEEDS = [
  { x: -40, z: -18, r: 34, n: 420 },
  { x: -150, z: 96, r: 40, n: 460 },
  { x: 262, z: -138, r: 38, n: 420 },
  { x: 60, z: 62, r: 26, n: 220 },
];

// ---------------------------------------------------------------------------
// Everything that isn't built: the wooded cerros, the Maipo Valley vineyards
// that start where the sprawl stops, the farm patchwork on the plain, and the
// ski area up at 3000 m that you can see from a downtown balcony.
// ---------------------------------------------------------------------------

// --- trees ------------------------------------------------------------------

export function buildVegetation() {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const rand = mulberry32(0x7e33);

  // Kept deliberately cheap: there are ~20 000 of these and they are also drawn
  // into the shadow map, so a few extra segments each turns into millions of
  // triangles per frame for detail nobody can resolve at this scale.
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 1.0, 4, 1, true);
  trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.SphereGeometry(0.6, 5, 4);
  crownGeo.translate(0, 1.35, 0);
  crownGeo.scale(1, 1.25, 1);

  const trunks = [];
  const crowns = [];

  const push = (x, z, s, hue) => {
    const y = elevation(x, z);
    trunks.push({ x, y, z, s });
    crowns.push({ x, y, z, s, hue });
  };

  // Wooded cerros. San Cristóbal is a planted park — dense, dark, and it is the
  // reason a green hill sits in the middle of a grey city.
  const cerros = [
    { x: 66, z: -140, r: 180, n: 13000, hue: 0.3, min: 11 },
    { x: -52, z: 44, r: 44, n: 1100, hue: 0.29, min: 8 },
    { x: 336, z: -338, r: 168, n: 4200, hue: 0.22, min: 24 },
    { x: 232, z: 268, r: 98, n: 1600, hue: 0.2, min: 14 },
  ];
  for (const c of cerros) {
    for (let i = 0; i < c.n; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * c.r;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      const h = elevation(x, z);
      if (h < c.min) continue;
      // Break up the treeline: a hard circular edge is the giveaway that a
      // forest was stamped rather than grown.
      const edge = fbm(x * 0.02, z * 0.02, { octaves: 3, seed: 43 });
      if (r / c.r > 0.55 + edge * 0.62) continue;
      // Thins toward bare rock higher up the bigger cerros.
      if (h > 60 && rand() < (h - 60) / 90) continue;
      push(x, z, 0.5 + rand() * 0.34, c.hue + rand() * 0.05);
    }
  }

  // Riparian corridor — the Mapocho carries a green line across the whole city.
  // Walk the actual curve instead of guessing at where it runs.
  const rp = new THREE.Vector3();
  const rt = new THREE.Vector3();
  const rs = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 2000; i++) {
    const u = rand();
    riverCurve.getPointAt(u, rp);
    riverCurve.getTangentAt(u, rt);
    rs.crossVectors(up, rt).normalize();
    const off = (rand() < 0.5 ? -1 : 1) * (4.6 + rand() * 4.4);
    const x = rp.x + rs.x * off;
    const z = rp.z + rs.z * off;
    if (elevation(x, z) > 30) continue;
    push(x, z, 0.5 + rand() * 0.3, 0.28 + rand() * 0.06);
  }

  // Street trees on the park blocks, so the city itself isn't treeless.
  for (const p of PARK_SEEDS) {
    for (let i = 0; i < p.n; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * p.r;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      if (elevation(x, z) > 30) continue;
      push(x, z, 0.48 + rand() * 0.3, 0.29 + rand() * 0.05);
    }
  }

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 });
  const crownMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });

  const tMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trunks.length);
  const cMesh = new THREE.InstancedMesh(crownGeo, crownMat, crowns.length);
  // Only the canopy casts — trunk shadows are invisible under it and would
  // double the shadow-pass geometry for nothing.
  cMesh.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();

  for (let i = 0; i < trunks.length; i++) {
    const t = trunks[i];
    p.set(t.x, t.y, t.z);
    s.set(t.s * 0.8, t.s, t.s * 0.8);
    m.compose(p, q, s);
    tMesh.setMatrixAt(i, m);
    cMesh.setMatrixAt(i, m);
    col.setHSL(crowns[i].hue, 0.4 + rand() * 0.18, 0.16 + rand() * 0.11);
    cMesh.setColorAt(i, col);
  }
  tMesh.instanceMatrix.needsUpdate = true;
  cMesh.instanceMatrix.needsUpdate = true;
  if (cMesh.instanceColor) cMesh.instanceColor.needsUpdate = true;

  group.add(tMesh, cMesh);
  group.userData.treeCount = trunks.length;
  return group;
}

// --- Maipo Valley vineyards + farmland --------------------------------------

const CELL = 23; // ~230 m — a plausible smallholding

// Crop identity comes from low-frequency noise so neighbouring cells agree and
// the plain reads as a patchwork of fields rather than confetti.
const CROPS = [
  { h: 0.245, s: 0.4, l: 0.19, vine: true }, // vineyard
  { h: 0.1, s: 0.26, l: 0.25, vine: false }, // ploughed earth
  { h: 0.155, s: 0.33, l: 0.36, vine: false }, // stubble
  { h: 0.27, s: 0.42, l: 0.26, vine: false }, // irrigated pasture
  { h: 0.21, s: 0.3, l: 0.31, vine: false }, // orchard
];

export function buildFarmland() {
  const group = new THREE.Group();
  group.name = 'farmland';
  const rand = mulberry32(0x91cc);

  const X0 = -1900;
  const X1 = 940;
  const Z0 = -1500;
  const Z1 = 1560;

  const positions = [];
  const colors = [];
  const vineCells = [];
  const col = new THREE.Color();

  for (let x = X0; x < X1; x += CELL) {
    for (let z = Z0; z < Z1; z += CELL) {
      // Corner heights, so each field sits flush on the terrain instead of
      // hovering like a floating card.
      const h00 = elevation(x, z);
      const h10 = elevation(x + CELL, z);
      const h01 = elevation(x, z + CELL);
      const h11 = elevation(x + CELL, z + CELL);
      const hi = Math.max(h00, h10, h01, h11);
      const lo = Math.min(h00, h10, h01, h11);
      if (hi > 26 || hi - lo > 3.2) continue; // too high or too steep to farm

      const cx = x + CELL / 2;
      const cz = z + CELL / 2;

      // Stay clear of the built-up basin and the river channel.
      const dCity = Math.hypot(cx + 118, cz - 22);
      const cityEdge = 620 + fbm(cx * 0.0035, cz * 0.0035, { seed: 71 }) * 300;
      if (dCity < cityEdge) continue;
      if (distanceToRiver(cx, cz) < 8) continue;

      // Gaps: scrub, roads, and land nobody bothered to plant.
      const use = fbm(cx * 0.0055, cz * 0.0055, { octaves: 3, seed: 33 });
      if (use < 0.36 || rand() < 0.12) continue;

      // Vineyards concentrate south of the city — the Maipo valley.
      const maipo = smoothstep(120, 460, cz) * smoothstep(500, 60, Math.abs(cx + 260));
      const pick = fbm(cx * 0.011, cz * 0.011, { octaves: 2, seed: 51 });
      let crop;
      if (maipo > 0.45 && pick > 0.42) crop = CROPS[0];
      else crop = CROPS[1 + Math.min(3, Math.floor(pick * 5.2) % 4)];

      const shade = 0.86 + fbm(cx * 0.09, cz * 0.09, { octaves: 2, seed: 91 }) * 0.3;
      col.setHSL(crop.h + (rand() - 0.5) * 0.012, crop.s, clamp(crop.l * shade, 0.05, 0.6));

      const y = 0.14;
      const a = [x, h00 + y, z];
      const b = [x + CELL, h10 + y, z];
      const c = [x, h01 + y, z + CELL];
      const d = [x + CELL, h11 + y, z + CELL];
      positions.push(...a, ...c, ...b, ...b, ...c, ...d);
      for (let k = 0; k < 6; k++) colors.push(col.r, col.g, col.b);

      if (crop.vine) vineCells.push({ x: cx, z: cz, y: (h00 + h11) / 2 });
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, metalness: 0 })
  );
  mesh.receiveShadow = true;
  group.add(mesh);

  // Vineyard rows: low hedges inside the vineyard cells, so a camera down at
  // eye level reads corduroy instead of flat green.
  const ROWS_PER = Math.floor(CELL / 2.3);
  const rowGeo = new THREE.BoxGeometry(1, 0.55, 0.7);
  rowGeo.translate(0, 0.275, 0);
  const rowMat = new THREE.MeshStandardMaterial({ color: 0x365a2d, roughness: 0.95 });
  const rowMesh = new THREE.InstancedMesh(rowGeo, rowMat, vineCells.length * ROWS_PER);
  rowMesh.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3(CELL * 0.94, 1, 1);
  let i = 0;
  for (const v of vineCells) {
    for (let r = 0; r < ROWS_PER; r++) {
      const off = (r / (ROWS_PER - 1) - 0.5) * CELL * 0.92;
      p.set(v.x, elevation(v.x, v.z + off) + 0.16, v.z + off);
      m.compose(p, q, s);
      rowMesh.setMatrixAt(i++, m);
    }
  }
  rowMesh.count = i;
  rowMesh.instanceMatrix.needsUpdate = true;
  group.add(rowMesh);

  group.userData.fieldCount = positions.length / 18;
  return group;
}

// --- Valle Nevado -----------------------------------------------------------
// A ski resort at 3000 m, 90 minutes from the centro. Half the point of a
// Santiago winter is that this is a day trip.

export function buildSkiResort() {
  const group = new THREE.Group();
  group.name = 'valleNevado';

  // Find a plausible shelf near the anchor: high, but not a knife edge. The
  // search window is deliberately tight so the itinerary can aim a camera at
  // the result without knowing exactly where it landed.
  // Wanted: a bench at roughly 3000 m — high enough to be above the treeline
  // and into the snow, flat enough to put buildings on. Score trades slope
  // against altitude so it never settles for a green foothill.
  let best = null;
  for (let x = 700; x < 980; x += 5) {
    for (let z = -300; z < -20; z += 5) {
      const h = elevation(x, z);
      if (h < 270 || h > 372) continue;
      const gx = elevation(x + 6, z) - elevation(x - 6, z);
      const gz = elevation(x, z + 6) - elevation(x, z - 6);
      const slope = Math.hypot(gx, gz) / 12;
      const score = slope + Math.abs(h - 320) * 0.004;
      if (!best || score < best.score) best = { x, z, h, slope, score };
    }
  }
  if (!best) {
    const x = 780;
    const z = -150;
    best = { x, z, h: elevation(x, z) };
  }
  PLACES.valleNevado = { x: best.x, z: best.z, y: best.h };

  group.position.set(best.x, best.h, best.z);

  const rand = mulberry32(0x5c11);
  const lodgeMats = [0xd8d2c6, 0xb85c4a, 0x8a7f70].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })
  );

  for (let i = 0; i < 16; i++) {
    const w = 2.6 + rand() * 3.0;
    const h = 1.8 + rand() * 2.4;
    const d = 2.4 + rand() * 2.6;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lodgeMats[(rand() * 3) | 0]);
    const a = rand() * Math.PI * 2;
    const r = rand() * 14;
    const lx = Math.cos(a) * r;
    const lz = Math.sin(a) * r;
    b.position.set(lx, elevation(best.x + lx, best.z + lz) - best.h + h / 2, lz);
    b.rotation.y = rand() * 0.6;
    b.castShadow = b.receiveShadow = true;
    group.add(b);
  }

  // Chairlift heading further up the ridge.
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x50535a, roughness: 0.7 });
  const cableMat = new THREE.LineBasicMaterial({ color: 0x2b2d33 });
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const lx = t * 46;
    const lz = -t * 26;
    const gy = elevation(best.x + lx, best.z + lz) - best.h;
    if (i % 2 === 0) {
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 3.2, 6), towerMat);
      tw.position.set(lx, gy + 1.6, lz);
      tw.castShadow = true;
      group.add(tw);
    }
    pts.push(new THREE.Vector3(lx, gy + 3.1, lz));
  }
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat));

  return group;
}
