import * as THREE from 'three';
import { elevation } from './terrain.js';

// ---------------------------------------------------------------------------
// Río Mapocho — comes down out of the cordillera in the north-east, cuts the
// city diagonally, and leaves toward the west. It's the line every Santiago
// map is organised around, so the city generator uses it as a hard constraint.
// ---------------------------------------------------------------------------

export const RIVER_PATH = [
  [610, -470],
  [470, -372],
  [352, -286],
  [246, -206],
  [140, -136],
  [36, -78],
  [-70, -40],
  [-192, -8],
  [-330, 24],
  [-500, 66],
  [-700, 120],
  [-940, 196],
  [-1240, 296],
];

export const riverCurve = new THREE.CatmullRomCurve3(
  RIVER_PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'catmullrom',
  0.4
);

// Flattened polyline used for the distance queries the city makes thousands of
// times. Sampling once beats evaluating the spline per test.
const SAMPLES = 420;
const _pts = [];
{
  const v = new THREE.Vector3();
  for (let i = 0; i <= SAMPLES; i++) {
    riverCurve.getPointAt(i / SAMPLES, v);
    _pts.push(v.x, v.z);
  }
}

export function distanceToRiver(x, z) {
  let best = Infinity;
  for (let i = 0; i < _pts.length - 2; i += 2) {
    const ax = _pts[i];
    const az = _pts[i + 1];
    const bx = _pts[i + 2];
    const bz = _pts[i + 3];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 > 0 ? ((x - ax) * dx + (z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + dx * t - x;
    const pz = az + dz * t - z;
    const d = px * px + pz * pz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function buildRiver() {
  const group = new THREE.Group();
  group.name = 'mapocho';

  const DIV = 300;
  const halfWidth = 3.4;
  const positions = [];
  const indices = [];
  const uvs = [];

  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= DIV; i++) {
    const u = i / DIV;
    riverCurve.getPointAt(u, p);
    riverCurve.getTangentAt(u, t);
    side.crossVectors(up, t).normalize();

    // The channel narrows through the city and spreads out on the plain.
    const w = halfWidth * (0.72 + 0.6 * Math.abs(Math.sin(u * 5.1)));
    // Sit just under the terrain surface so the banks read as cut, not painted.
    const y = elevation(p.x, p.z) - 0.9;

    positions.push(p.x + side.x * w, y, p.z + side.z * w);
    positions.push(p.x - side.x * w, y, p.z - side.z * w);
    uvs.push(0, u * 40, 1, u * 40);

    if (i < DIV) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // The Mapocho is famously silt-brown, not blue. Getting that right matters
  // more than any specular trick.
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6a5540,
    roughness: 0.34,
    metalness: 0.15,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
