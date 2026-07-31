import * as THREE from 'three';
import { fbm, ridged, clamp, smoothstep } from '../lib/noise.js';

// ---------------------------------------------------------------------------
// Scale: 1 world unit = 10 metres.
//
// Santiago sits in a basin roughly 80 km across, pinned between the Cordillera
// de los Andes to the east and the lower Cordillera de la Costa to the west.
// That containment is the whole reason the city looks — and breathes — the way
// it does, so the terrain models both walls rather than just the pretty one.
// ---------------------------------------------------------------------------

export const WORLD = {
  width: 6600,
  depth: 5400,
  segX: 480,
  segZ: 392,
};

// Cerros that rise straight out of the street grid. Baked into the heightfield
// (rather than dropped on top as separate meshes) so the skirts blend.
const CERROS = [
  { x: 66, z: -140, r: 178, h: 31, seed: 5 }, // San Cristóbal
  { x: -52, z: 44, r: 44, h: 10, seed: 9 }, // Santa Lucía
  { x: 336, z: -338, r: 168, h: 72, seed: 13 }, // Manquehue
  { x: 232, z: 268, r: 96, h: 26, seed: 17 }, // Cerro Chena-ish, south
];

function cerroHeight(x, z) {
  let h = 0;
  for (const c of CERROS) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d >= 1) continue;
    const falloff = Math.pow(Math.cos((d * Math.PI) / 2), 1.7);
    const wob = 0.82 + fbm(x * 0.01, z * 0.01, { octaves: 3, seed: c.seed }) * 0.36;
    h += c.h * falloff * wob;
  }
  return h;
}

export function elevation(x, z) {
  // Basin floor: nearly flat, tilted so it drains west-north-west.
  let h = 5 + fbm(x * 0.0017, z * 0.0017, { octaves: 4, seed: 11 }) * 8 - x * 0.0055;

  // The Andes. A wandering mask decides where the front range starts, then
  // ridged noise carves the spines and a finer octave roughs up the faces.
  const front = x + (fbm(z * 0.0042, x * 0.0021, { octaves: 3, seed: 3 }) - 0.5) * 460;
  const andes = smoothstep(430, 1260, front);
  if (andes > 0) {
    const spine = ridged(x * 0.00128, z * 0.00128, { octaves: 6, seed: 7 });
    const detail = ridged(x * 0.0054, z * 0.0054, { octaves: 4, seed: 23 });
    // A high-frequency ridged octave on top: without it the range renders as
    // smooth dunes instead of rock, especially from close up at Valle Nevado.
    const rock = ridged(x * 0.019, z * 0.019, { octaves: 3, gain: 0.45, seed: 89 });
    h += andes * andes * (68 + spine * 436 + detail * 88 + rock * 22);
  }

  // Coastal range: older, softer, half the height.
  const coast = smoothstep(-980, -1760, x);
  if (coast > 0) {
    const c = ridged(x * 0.0023, z * 0.0023, { octaves: 5, seed: 41 });
    h += coast * (26 + c * 132);
  }

  return h + cerroHeight(x, z);
}

// Palette sampled from the basin itself: dry summer grass, granite, oxidised
// scree, and the snowline that hangs over the city ten months a year.
const C_VALLEY = new THREE.Color('#7e8355');
const C_DRY = new THREE.Color('#9a8f63');
const C_SCRUB = new THREE.Color('#6f6a44');
const C_ROCK_LOW = new THREE.Color('#6b5c4c');
const C_ROCK_HIGH = new THREE.Color('#8a8078');
const C_SCREE = new THREE.Color('#9c7d63');
const C_SNOW = new THREE.Color('#dde4ec');
const C_CERRO = new THREE.Color('#48583a');

const _a = new THREE.Color();
const _b = new THREE.Color();

function terrainColor(x, z, h, slope, out) {
  const grain = fbm(x * 0.012, z * 0.012, { octaves: 3, seed: 61 });

  if (h < 16) {
    // Valley floor — patchwork of parched grass and irrigated green.
    out.copy(C_VALLEY).lerp(C_DRY, clamp(grain * 1.5 - 0.15, 0, 1));
    return out;
  }

  // Foothills into bare rock.
  _a.copy(C_SCRUB).lerp(C_ROCK_LOW, smoothstep(30, 130, h));
  _b.copy(C_ROCK_LOW).lerp(C_ROCK_HIGH, smoothstep(120, 340, h));
  out.copy(_a).lerp(_b, smoothstep(60, 200, h));

  // The cerros standing inside the basin are planted parks — San Cristóbal is
  // the biggest urban park in Chile — so they read green, not desert.
  const urban = smoothstep(10, 24, h) * (1 - smoothstep(64, 120, h)) * (1 - smoothstep(330, 470, x));
  out.lerp(C_CERRO, urban * (0.5 + grain * 0.36));

  // Scree fans on the sunny mid-elevation faces.
  out.lerp(C_SCREE, smoothstep(0.45, 0.95, slope) * smoothstep(90, 220, h) * 0.55 * grain);

  // Snow. The line wobbles hard with terrain noise, and steep faces stay bare —
  // that contrast is what gives the cordillera its striped look at distance.
  // A single clean blanket across the whole range reads as a cloud bank.
  const snowline = 302 + (grain - 0.5) * 132;
  let snow = smoothstep(snowline, snowline + 74, h);
  snow *= 1 - smoothstep(0.58, 0.94, slope);
  // Wind-packed patches cling below the line in the couloirs.
  snow = Math.max(snow, smoothstep(snowline - 70, snowline + 14, h) * (1 - smoothstep(0.3, 0.54, slope)) * 0.45);
  out.lerp(C_SNOW, clamp(snow, 0, 1));
  return out;
}

export function buildTerrain() {
  const geo = new THREE.PlaneGeometry(WORLD.width, WORLD.depth, WORLD.segX, WORLD.segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const count = pos.count;

  for (let i = 0; i < count; i++) {
    pos.setY(i, elevation(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const normal = geo.attributes.normal;
  const colors = new Float32Array(count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const slope = 1 - clamp(normal.getY(i), 0, 1);
    terrainColor(pos.getX(i), pos.getZ(i), pos.getY(i), slope, col);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}
