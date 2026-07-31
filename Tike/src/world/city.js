import * as THREE from 'three';
import { mulberry32, fbm, clamp, smoothstep } from '../lib/noise.js';
import { elevation } from './terrain.js';
import { RIVER_PATH, distanceToRiver } from './river.js';

// ---------------------------------------------------------------------------
// The city.
//
// Santiago is laid out as a damero — the Spanish colonial checkerboard — and
// that grid is rotated about 15° off true north, inherited from the 1541 street
// plan. Everything here is generated in that rotated frame and then mapped into
// world space, which is why the whole city reads as one coherent block pattern
// instead of a noise field of boxes.
//
// Density and height follow the real gradient: a dense mid-rise centro, the
// glass cluster of "Sanhattan" where Providencia meets the river, the Apoquindo
// corridor running east toward the mountains, and low sprawl everywhere else.
// ---------------------------------------------------------------------------

const GRID_ANGLE = -0.26; // radians off cardinal
const BLOCK = 12; // 120 m — a real Santiago block
const COS_G = Math.cos(GRID_ANGLE);
const SIN_G = Math.sin(GRID_ANGLE);

const AIRPORT = { x: -930, z: -392 }; // mirrors PLACES.airport
const CENTRO = { x: -118, z: 22 };
const SANHATTAN = { x: 182, z: -30 };
const LAS_CONDES = { x: 322, z: -186 };

// Green space that actually exists, in world coordinates.
const PARKS = [
  { x: -40, z: -18, r: 34 }, // Parque Forestal, along the Mapocho
  { x: -150, z: 96, r: 40 }, // Parque O'Higgins
  { x: 262, z: -138, r: 38 }, // Parque Bicentenario
  { x: 60, z: 62, r: 26 }, // Parque Almagro-ish
];

function gridToWorld(u, v) {
  return { x: u * COS_G - v * SIN_G, z: u * SIN_G + v * COS_G };
}

function parkInfluence(x, z) {
  let p = 0;
  for (const q of PARKS) {
    p = Math.max(p, smoothstep(q.r, q.r * 0.45, Math.hypot(x - q.x, z - q.z)));
  }
  return p;
}

// --- facade texture ---------------------------------------------------------
// One canvas, generated once, used as the emissive map. During the day it is
// scaled to zero; after sunset it becomes every lit window in the basin.

function makeWindowTexture(lit) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const rand = mulberry32(lit ? 0x51ee : 0x2244);

  // The daytime map multiplies the per-instance facade colour, so its base has
  // to sit near white — anything darker and every building in the basin turns
  // to soot. The windows only need to be a shade cooler than the wall.
  ctx.fillStyle = lit ? '#000000' : '#fbfaf7';
  ctx.fillRect(0, 0, S, S);

  const cols = 12;
  const rows = 22;
  const cw = S / cols;
  const rh = S / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.22;
      const y = r * rh + rh * 0.24;
      const w = cw * 0.56;
      const h = rh * 0.5;
      if (lit) {
        if (rand() > 0.55) continue;
        const warm = rand();
        const g = 215 + rand() * 40;
        ctx.fillStyle =
          warm < 0.74
            ? `rgb(255, ${Math.round(g * 0.84)}, ${Math.round(g * 0.5)})`
            : `rgb(${Math.round(g * 0.78)}, ${Math.round(g * 0.9)}, 255)`;
      } else {
        const v = 176 + rand() * 34;
        ctx.fillStyle = `rgb(${v}, ${v + 5}, ${v + 12})`;
      }
      ctx.fillRect(x, y, w, h);
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = lit ? THREE.SRGBColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// --- palette ----------------------------------------------------------------
// Santiago is a concrete-and-render city: sand, bone, weathered grey, with the
// occasional brick block. Saturation kept low on purpose — a skyline of primary
// colours reads as a toy, and the sun does the rest of the work.
const FACADE = [
  '#c6bfb1',
  '#d0c9ba',
  '#b2a798',
  '#adaaa3',
  '#d8d2c5',
  '#9b8d7e',
  '#b08375',
  '#cac7c0',
  '#bfb3a0',
];
const GLASS = ['#8296a1', '#758d9a', '#8ea3ad', '#7d94a1', '#98a9b2'];

export function buildCity() {
  const group = new THREE.Group();
  group.name = 'city';
  const rand = mulberry32(0x5A17);

  const pads = [];
  const buildings = [];

  const HALF_U = 62; // blocks east-west  (~15 km of basin)
  const HALF_V = 54; // blocks north-south

  for (let iu = -HALF_U; iu <= HALF_U; iu++) {
    for (let iv = -HALF_V; iv <= HALF_V; iv++) {
      const u = iu * BLOCK;
      const v = iv * BLOCK;
      const { x, z } = gridToWorld(u, v);

      const h = elevation(x, z);
      if (h > 27) continue; // the cerros stay green

      // Sprawl thins out toward the edge of the basin, with a noisy boundary so
      // the city doesn't end in a perfect rectangle.
      const dc = Math.hypot(x - CENTRO.x, z - CENTRO.z);
      const edge = fbm(x * 0.0042, z * 0.0042, { octaves: 4, seed: 71 });
      const reach = 520 + edge * 270;
      const density = smoothstep(reach, reach * 0.55, dc);
      if (density < 0.05 || rand() > density * 0.95 + 0.05) continue;

      const river = distanceToRiver(x, z);
      if (river < 6) continue; // the Mapocho gets its channel
      if (Math.hypot(x - AIRPORT.x, z - AIRPORT.z) < 108) continue; // runway protection zone

      const park = parkInfluence(x, z);
      const isPark = park > 0.55 || (river < 10 && rand() < 0.6); // Parque Forestal hugs the banks

      // Slope check — the foothill neighbourhoods terrace, they don't float.
      const gx = elevation(x + 4, z) - elevation(x - 4, z);
      const gz = elevation(x, z + 4) - elevation(x, z - 4);
      if (Math.hypot(gx, gz) / 8 > 0.16) continue;

      pads.push({ x, z, y: h, park: isPark, plaza: false });

      if (isPark) continue;

      // --- heights -------------------------------------------------------
      const ds = Math.hypot(x - SANHATTAN.x, z - SANHATTAN.z);
      const dl = Math.hypot(x - LAS_CONDES.x, z - LAS_CONDES.z);
      let tall =
        3.4 * Math.exp(-(dc * dc) / (2 * 74 * 74)) +
        12.5 * Math.exp(-(ds * ds) / (2 * 48 * 48)) +
        6.8 * Math.exp(-(dl * dl) / (2 * 76 * 76));

      // The Apoquindo corridor: a ribbon of towers following the avenue east.
      const corridor = Math.exp(-Math.pow((z + 130 + (x - 120) * 0.28) / 26, 2)) * smoothstep(60, 260, x);
      tall += corridor * 5.4;

      const count = rand() < 0.34 ? 2 : 1;
      for (let b = 0; b < count; b++) {
        const jitter = count === 2 ? (b === 0 ? -2.6 : 2.6) : 0;
        const jx = x + (rand() - 0.5) * 1.6 + jitter * COS_G;
        const jz = z + (rand() - 0.5) * 1.6 + jitter * SIN_G;

        let height = 1.5 + rand() * 2.1 + tall * (0.55 + rand() * 0.75);
        if (rand() < 0.018) height *= 1.7 + rand(); // the odd outlier tower
        height = clamp(height, 1.1, 22);

        // Footprints fill most of the block — a real damero is built to the
        // property line, not dotted with freestanding cubes.
        const glassy = height > 8.5 || (height > 5 && rand() < 0.4);
        const wide = count === 2 ? 5.3 : 9.1;
        const w = wide * (0.76 + rand() * 0.24);
        const d = (count === 2 ? 9.1 : wide) * (0.76 + rand() * 0.24);

        buildings.push({
          x: jx,
          z: jz,
          y: elevation(jx, jz),
          w,
          d,
          h: height,
          rot: GRID_ANGLE + (rand() - 0.5) * 0.06,
          color: glassy ? GLASS[(rand() * GLASS.length) | 0] : FACADE[(rand() * FACADE.length) | 0],
          glassy,
        });
      }
    }
  }

  group.add(makePads(pads));
  group.add(makeBuildings(buildings));

  group.userData.buildingCount = buildings.length;
  group.userData.blockCount = pads.length;
  return group;
}

function makePads(pads) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  const mesh = new THREE.InstancedMesh(geo, mat, pads.length);
  mesh.receiveShadow = true;
  mesh.name = 'blocks';

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, GRID_ANGLE, 0));
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const rand = mulberry32(0x77aa);

  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    // Pads nearly fill their block so the streets read as thin seams rather
    // than a checkerboard of gaps.
    scl.set(BLOCK - 0.9, 0.6, BLOCK - 0.9);
    pos.set(p.x, p.y + 0.18, p.z);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);

    if (p.park) {
      col.setHSL(0.28 + rand() * 0.05, 0.32 + rand() * 0.14, 0.19 + rand() * 0.07);
    } else {
      // Roof-and-asphalt grey. Kept dark so lit windows and headlights carry
      // the night rather than competing with a glowing ground plane.
      const v = 0.13 + rand() * 0.1;
      col.setRGB(v, v * 0.97, v * 0.92);
    }
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

function makeBuildings(list) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0); // pivot at the base so scaling grows upward

  const litMap = makeWindowTexture(true);
  const dayMap = makeWindowTexture(false);

  const wall = new THREE.MeshStandardMaterial({
    map: dayMap,
    emissiveMap: litMap,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
    roughness: 0.72,
    metalness: 0.06,
  });

  // Every instance shares one texture, so without this every building in the
  // basin lights the same windows at night and the city reads as a tray of
  // identical cubes. A per-instance UV scale keeps floor heights consistent
  // across wildly different buildings; the offset decorrelates the pattern.
  wall.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFacadeUv;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
         #ifdef USE_MAP
           vMapUv = vMapUv * aFacadeUv.xy + aFacadeUv.zw;
         #endif
         #ifdef USE_EMISSIVEMAP
           vEmissiveMapUv = vEmissiveMapUv * aFacadeUv.xy + aFacadeUv.zw;
         #endif`
      );
  };
  // Roofs are gravel, tar and plant rooms — always darker than the facade, and
  // that difference is most of what stops an aerial view reading as flat.
  const roof = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0.02, color: 0x6e6e6a });

  // BoxGeometry group order: +X, -X, +Y, -Y, +Z, -Z. Only the four walls get
  // windows; the roofs stay plain gravel-and-plant-room grey.
  const materials = [wall, wall, roof, roof, wall, wall];

  const mesh = new THREE.InstancedMesh(geo, materials, list.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'buildings';

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();

  const facadeUv = new Float32Array(list.length * 4);
  const rand = mulberry32(0x3c19);

  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    e.set(0, b.rot, 0);
    q.setFromEuler(e);
    pos.set(b.x, b.y, b.z);
    scl.set(b.w, b.h, b.d);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.set(b.color));

    // 12 columns and 22 rows per tile → about 6 m of facade per window and
    // 3.6 m per floor once the tile is stretched to these spans.
    facadeUv[i * 4] = Math.max(0.6, b.w / 6);
    facadeUv[i * 4 + 1] = Math.max(0.6, b.h / 8);
    facadeUv[i * 4 + 2] = rand();
    facadeUv[i * 4 + 3] = rand();
  }
  geo.setAttribute('aFacadeUv', new THREE.InstancedBufferAttribute(facadeUv, 4));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  mesh.userData.wallMaterial = wall;
  mesh.userData.roofMaterial = roof;
  return mesh;
}

// ---------------------------------------------------------------------------
// Traffic. Three of the arteries that actually carry Santiago: the Alameda
// running east-west through the centro, the Providencia–Apoquindo axis heading
// for the mountains, and Costanera Norte tracing the river.
// ---------------------------------------------------------------------------

const AVENUES = [
  // Alameda / Libertador Bernardo O'Higgins
  [[-420, 128], [-260, 82], [-120, 34], [10, -6], [140, -46]],
  // Providencia → Apoquindo → Las Condes
  [[10, -6], [110, -44], [200, -96], [300, -172], [400, -246]],
  // Costanera Norte, shadowing the Mapocho
  [[-380, 44], [-200, 6], [-40, -30], [130, -100], [290, -196]],
  // Vicuña Mackenna, north-south
  [[-70, -60], [-96, 30], [-122, 130], [-148, 240]],
];

export function buildTraffic() {
  const group = new THREE.Group();
  group.name = 'traffic';

  const curves = AVENUES.map(
    (pts) =>
      new THREE.CatmullRomCurve3(
        pts.map(([x, z]) => new THREE.Vector3(x, elevation(x, z) + 0.6, z)),
        false,
        'catmullrom',
        0.4
      )
  );

  const PER_LANE = 90;
  const total = curves.length * PER_LANE * 2;

  const geo = new THREE.BoxGeometry(1.05, 0.34, 0.5);
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.4,
    metalness: 0.2,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0,
    vertexColors: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, total);
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.name = 'cars';

  const rand = mulberry32(0x0ca5);
  const cars = [];
  const col = new THREE.Color();
  let i = 0;
  for (let c = 0; c < curves.length; c++) {
    for (let lane = 0; lane < 2; lane++) {
      for (let k = 0; k < PER_LANE; k++) {
        cars.push({
          curve: curves[c],
          t: rand(),
          speed: (0.008 + rand() * 0.007) * (lane === 0 ? 1 : -1),
          offset: lane === 0 ? 1.5 : -1.5,
          dir: lane === 0 ? 1 : -1,
        });
        // Headlights white-ish forward, tail lights red — set as instance colour
        // so the night pass reads as two flowing streams.
        col.set(lane === 0 ? '#ffe9c4' : '#ff6a55');
        mesh.setColorAt(i, col);
        i++;
      }
    }
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  group.add(mesh);
  group.userData = { mesh, cars, material: mat };
  return group;
}

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _side = new THREE.Vector3();
const _scale = new THREE.Vector3(1, 1, 1);

export function updateTraffic(group, dt) {
  const { mesh, cars } = group.userData;
  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    car.t += car.speed * dt * 0.06;
    if (car.t > 1) car.t -= 1;
    if (car.t < 0) car.t += 1;

    car.curve.getPointAt(car.t, _p);
    car.curve.getTangentAt(car.t, _t);
    _side.crossVectors(_up, _t).normalize().multiplyScalar(car.offset);
    _p.add(_side);

    const angle = Math.atan2(_t.x * car.dir, _t.z * car.dir);
    _q.setFromAxisAngle(_up, angle - Math.PI / 2);
    _m.compose(_p, _q, _scale);
    mesh.setMatrixAt(i, _m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

export { RIVER_PATH, GRID_ANGLE, CENTRO, SANHATTAN, LAS_CONDES };
