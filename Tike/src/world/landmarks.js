import * as THREE from 'three';
import { elevation } from './terrain.js';
import { mulberry32 } from '../lib/noise.js';

// ---------------------------------------------------------------------------
// The things you'd actually point at.
//
// Proportions are honest where it matters (Gran Torre really is roughly twice
// anything near it) and gently exaggerated where a true-scale object would be
// a single pixel — the Virgen on San Cristóbal is about 1.5× real size so the
// silhouette reads from across the basin.
// ---------------------------------------------------------------------------

export const PLACES = {
  granTorre: { x: 182, z: -30 },
  sanCristobal: { x: 66, z: -140 },
  plazaArmas: { x: -118, z: 22 },
  santaLucia: { x: -52, z: 44 },
  estadio: { x: -46, z: 132 },
  airport: { x: -930, z: -392 },
  vineyards: { x: -300, z: 430 },
  valleNevado: { x: 700, z: -180 },
};

const glassMat = () =>
  new THREE.MeshStandardMaterial({
    color: 0x51707f,
    roughness: 0.16,
    metalness: 0.62,
    emissive: new THREE.Color(0x2a4a66),
    emissiveIntensity: 0,
  });

const stoneMat = (color, rough = 0.85) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 });

// --- Gran Torre Santiago ----------------------------------------------------
// 300 m, the tallest building in South America, sitting on the Costanera Center
// mall podium with its three shorter siblings.

function buildCostaneraCenter(nightMats) {
  const g = new THREE.Group();
  const { x, z } = PLACES.granTorre;
  const base = elevation(x, z);
  g.position.set(x, base, z);
  g.rotation.y = -0.26;

  const podiumMat = stoneMat(0x9a9086, 0.9);
  const podium = new THREE.Mesh(new THREE.BoxGeometry(30, 4.2, 24), podiumMat);
  podium.position.y = 2.1;
  podium.castShadow = podium.receiveShadow = true;
  g.add(podium);

  const glass = glassMat();
  nightMats.push(glass);

  // Square prism with a slight taper — CylinderGeometry with 4 radial segments,
  // spun 45° so the faces sit square to the grid.
  const H = 30;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(4.0, 5.0, H, 4, 1), glass);
  tower.rotation.y = Math.PI / 4;
  tower.position.y = 4.2 + H / 2;
  tower.castShadow = tower.receiveShadow = true;
  g.add(tower);

  // Corner fins give the tower its vertical grain instead of a blank slab.
  const finMat = stoneMat(0xb9c2c8, 0.5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.55, H, 0.55), finMat);
    fin.position.set(Math.cos(a) * 4.4, 4.2 + H / 2, Math.sin(a) * 4.4);
    fin.castShadow = true;
    g.add(fin);
  }

  // Sky Costanera — the open-air observation deck near the top.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(9.6, 1.0, 9.6), stoneMat(0xd8dde0, 0.5));
  deck.position.y = 4.2 + H - 3.4;
  deck.rotation.y = 0;
  deck.castShadow = true;
  g.add(deck);

  // Flat crown, not a spire — the real tower stops square and lets the mast do
  // the pointing.
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.0, 1.3, 4, 1), finMat);
  crown.rotation.y = Math.PI / 4;
  crown.position.y = 4.2 + H + 0.65;
  crown.castShadow = true;
  g.add(crown);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 3.4, 6), finMat);
  mast.position.y = 4.2 + H + 3.0;
  g.add(mast);

  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), beaconMat);
  beacon.position.y = 4.2 + H + 4.9;
  g.add(beacon);
  g.userData.beacon = beaconMat;

  // The three shorter Costanera towers.
  const sibling = [
    { dx: -10, dz: 8, h: 11 },
    { dx: 9, dz: 9, h: 9.5 },
    { dx: 11, dz: -7, h: 12.5 },
  ];
  for (const s of sibling) {
    const m = glassMat();
    nightMats.push(m);
    const t = new THREE.Mesh(new THREE.BoxGeometry(5.2, s.h, 5.2), m);
    t.position.set(s.dx, 4.2 + s.h / 2, s.dz);
    t.castShadow = t.receiveShadow = true;
    g.add(t);
  }

  g.name = 'granTorre';
  return g;
}

// --- Cerro San Cristóbal ----------------------------------------------------

function buildSanCristobal(nightMats) {
  const g = new THREE.Group();
  const { x, z } = PLACES.sanCristobal;
  const summit = elevation(x, z);
  g.position.set(x, summit, z);
  g.name = 'sanCristobal';

  const white = stoneMat(0xeae6dd, 0.7);

  // Sanctuary terrace — the white apron that makes the summit legible from the
  // valley floor long before you can make out the statue.
  const terrace = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8.4, 0.9, 24), white);
  terrace.position.y = 0.45;
  terrace.receiveShadow = terrace.castShadow = true;
  g.add(terrace);

  const steps = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 0.7, 20), white);
  steps.position.y = 1.2;
  steps.castShadow = true;
  g.add(steps);

  // Pedestal + Virgen de la Inmaculada Concepción.
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 2.6, 16), white);
  pedestal.position.y = 2.85;
  pedestal.castShadow = true;
  g.add(pedestal);

  const statueMat = new THREE.MeshStandardMaterial({
    color: 0xf6f4ee,
    roughness: 0.55,
    metalness: 0.0,
    emissive: new THREE.Color(0xdfe6ff),
    emissiveIntensity: 0,
  });
  nightMats.push(statueMat); // floodlit at night, visible across the whole city

  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 1.15, 3.2, 14), statueMat);
  robe.position.y = 5.75;
  robe.castShadow = true;
  g.add(robe);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 0.9, 12), statueMat);
  torso.position.y = 7.7;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), statueMat);
  head.position.y = 8.32;
  head.castShadow = true;
  g.add(head);

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 20), statueMat);
  halo.position.y = 8.5;
  halo.rotation.x = Math.PI / 2;
  g.add(halo);

  // Arms held slightly open, the way the real statue stands.
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.5, 8), statueMat);
    arm.position.set(s * 0.42, 7.5, 0.12);
    arm.rotation.z = s * 0.44;
    g.add(arm);
  }

  // Radio masts that share the summit.
  const mastMat = stoneMat(0xb0b4b8, 0.6);
  for (const [mx, mz, mh] of [[-5.5, 3.2, 5.5], [5.8, -2.4, 4.2]]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, mh, 6), mastMat);
    mast.position.set(mx, mh / 2 + 0.7, mz);
    g.add(mast);
  }

  return g;
}

// Funicular + teleférico: two thin cables running off the hill. Small, but they
// are what tells you this cerro is a place people go, not scenery.
function buildCableLines() {
  const g = new THREE.Group();
  g.name = 'cables';
  const { x, z } = PLACES.sanCristobal;
  const top = new THREE.Vector3(x, elevation(x, z) + 2.0, z + 6);

  const lines = [
    { to: new THREE.Vector3(x - 12, 0, z + 168), sag: 3.0 }, // funicular, Bellavista side
    { to: new THREE.Vector3(x + 96, 0, z - 74), sag: 5.5 }, // teleférico toward Tobalaba
  ];

  const mat = new THREE.LineBasicMaterial({ color: 0x2c2c30, transparent: true, opacity: 0.75 });
  const cabins = [];
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0xd4453a, roughness: 0.5 });

  for (const l of lines) {
    l.to.y = elevation(l.to.x, l.to.z) + 1.5;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const p = new THREE.Vector3().lerpVectors(top, l.to, t);
      p.y -= Math.sin(t * Math.PI) * l.sag;
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 1.5), cabinMat);
    cabin.castShadow = true;
    g.add(cabin);
    cabins.push({ mesh: cabin, curve, t: Math.random() * 0, speed: 0.06 });
  }

  g.userData.cabins = cabins;
  return g;
}

// --- Plaza de Armas & the colonial core -------------------------------------

function buildPlazaDeArmas() {
  const g = new THREE.Group();
  const { x, z } = PLACES.plazaArmas;
  const base = elevation(x, z);
  g.position.set(x, base, z);
  g.rotation.y = -0.26;
  g.name = 'plazaArmas';

  // The plaza itself.
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(13, 0.5, 13), stoneMat(0xc2b49b, 0.95));
  plaza.position.y = 0.3;
  plaza.receiveShadow = true;
  g.add(plaza);

  const treeMat = stoneMat(0x2f5330, 0.95);
  const rand = mulberry32(0x1541);
  for (let i = 0; i < 26; i++) {
    const t = new THREE.Mesh(new THREE.SphereGeometry(0.55 + rand() * 0.3, 6, 5), treeMat);
    t.position.set((rand() - 0.5) * 11, 1.2, (rand() - 0.5) * 11);
    t.scale.y = 1.3;
    t.castShadow = true;
    g.add(t);
  }

  // Catedral Metropolitana: neoclassical front, twin bell towers, long nave.
  const cream = stoneMat(0xdcd2bd, 0.85);
  const cathedral = new THREE.Group();
  cathedral.position.set(-8.6, 0, 0);

  const nave = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.6, 11), cream);
  nave.position.y = 1.8;
  nave.castShadow = nave.receiveShadow = true;
  cathedral.add(nave);

  const roof = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 11, 3, 1), stoneMat(0x8a4a3a, 0.9));
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.y = 4.1;
  roof.castShadow = true;
  cathedral.add(roof);

  const facade = new THREE.Mesh(new THREE.BoxGeometry(5.4, 4.4, 1.2), cream);
  facade.position.set(0, 2.2, 5.6);
  facade.castShadow = true;
  cathedral.add(facade);

  for (const s of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(1.7, 7.2, 1.7), cream);
    tower.position.set(s * 1.9, 3.6, 5.6);
    tower.castShadow = true;
    cathedral.add(tower);

    const belfry = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.3, 1.35), stoneMat(0xe6ddc9, 0.8));
    belfry.position.set(s * 1.9, 7.85, 5.6);
    cathedral.add(belfry);

    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.7, 4), stoneMat(0x6d6a63, 0.7));
    cap.rotation.y = Math.PI / 4;
    cap.position.set(s * 1.9, 9.3, 5.6);
    cap.castShadow = true;
    cathedral.add(cap);
  }
  g.add(cathedral);

  // Correo Central and the Municipalidad, closing the other two sides.
  for (const [px, pz, w, d] of [[0, -8.8, 13, 4.4], [8.8, 0, 4.4, 13]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 3.4, d), stoneMat(0xd9c9ac, 0.88));
    b.position.set(px, 1.7, pz);
    b.castShadow = b.receiveShadow = true;
    g.add(b);
  }

  return g;
}

// --- Estadio Nacional -------------------------------------------------------

function buildEstadio() {
  const g = new THREE.Group();
  const { x, z } = PLACES.estadio;
  g.position.set(x, elevation(x, z), z);
  g.name = 'estadio';

  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(9.5, 11.5, 3.4, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xbfb6a6, roughness: 0.85, side: THREE.DoubleSide })
  );
  bowl.position.y = 1.7;
  bowl.castShadow = bowl.receiveShadow = true;
  g.add(bowl);

  const pitch = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, 0.3, 28), stoneMat(0x3f7a3c, 0.95));
  pitch.position.y = 0.5;
  pitch.receiveShadow = true;
  g.add(pitch);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(10.2, 0.4, 8, 40), stoneMat(0xdad3c6, 0.7));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 3.5;
  g.add(ring);

  return g;
}

// --- Aeropuerto Arturo Merino Benítez (SCL) ---------------------------------

function buildAirport() {
  const g = new THREE.Group();
  const { x, z } = PLACES.airport;
  g.position.set(x, elevation(x, z), z);
  g.rotation.y = 0.18;
  g.name = 'airport';

  const asphalt = stoneMat(0x3c3c40, 0.95);
  for (const dz of [-14, 14]) {
    const rw = new THREE.Mesh(new THREE.BoxGeometry(120, 0.5, 5.4), asphalt);
    rw.position.set(0, 0.28, dz);
    rw.receiveShadow = true;
    g.add(rw);

    // Centreline markings.
    const markMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e0 });
    for (let i = -11; i <= 11; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.34), markMat);
      m.position.set(i * 5.2, 0.56, dz);
      g.add(m);
    }
  }

  const apron = new THREE.Mesh(new THREE.BoxGeometry(56, 0.45, 16), stoneMat(0x53535a, 0.95));
  apron.position.set(0, 0.26, 0);
  apron.receiveShadow = true;
  g.add(apron);

  const terminal = new THREE.Mesh(new THREE.BoxGeometry(40, 3.2, 7.5), stoneMat(0xc8cdd2, 0.6));
  terminal.position.set(0, 1.6, 0);
  terminal.castShadow = terminal.receiveShadow = true;
  g.add(terminal);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 8, 12), stoneMat(0xd6dade, 0.6));
  tower.position.set(-22, 4, 1);
  tower.castShadow = true;
  g.add(tower);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.5, 1.6, 12), glassMat());
  cab.position.set(-22, 8.6, 1);
  g.add(cab);

  // Parked aircraft at the gates.
  for (let i = 0; i < 6; i++) {
    const p = makeAircraft(0.8);
    p.position.set(-17 + i * 7, 0.9, 6.5);
    p.rotation.y = Math.PI;
    g.add(p);
  }

  return g;
}

export function makeAircraft(scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.35, metalness: 0.25 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x1b3f8b, roughness: 0.4 });

  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 5.2, 4, 10), body);
  fus.rotation.z = Math.PI / 2;
  fus.castShadow = true;
  g.add(fus);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 7.4), body);
  wing.position.set(-0.2, -0.1, 0);
  wing.castShadow = true;
  g.add(wing);

  const tailPlane = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2.8), body);
  tailPlane.position.set(-2.9, 0.25, 0);
  g.add(tailPlane);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 0.12), accent);
  fin.position.set(-3.0, 0.95, 0);
  fin.castShadow = true;
  g.add(fin);

  for (const s of [-1, 1]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.2, 10), accent);
    eng.rotation.z = Math.PI / 2;
    eng.position.set(0.15, -0.42, s * 2.2);
    g.add(eng);
  }

  g.scale.setScalar(scale);
  return g;
}

// ---------------------------------------------------------------------------

export function buildLandmarks() {
  const group = new THREE.Group();
  group.name = 'landmarks';
  const nightMats = [];

  const costanera = buildCostaneraCenter(nightMats);
  group.add(costanera);
  const cerro = buildSanCristobal(nightMats);
  group.add(cerro);
  const cables = buildCableLines();
  group.add(cables);
  group.add(buildPlazaDeArmas());
  group.add(buildEstadio());
  group.add(buildAirport());

  // The arrival: a jet on final approach into SCL, tracking down the basin.
  const arrival = makeAircraft(1.6);
  group.add(arrival);

  const approach = new THREE.CatmullRomCurve3([
    new THREE.Vector3(420, 210, 280),
    new THREE.Vector3(140, 168, 150),
    new THREE.Vector3(-160, 124, 30),
    new THREE.Vector3(-470, 86, -110),
    new THREE.Vector3(-760, 40, -280),
    new THREE.Vector3(-934, 7, -390),
  ]);

  group.userData = {
    nightMats,
    beacon: costanera.userData.beacon,
    cabins: cables.userData.cabins,
    arrival,
    approach,
    arrivalT: 0,
  };

  return group;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export function updateLandmarks(group, dt, elapsed, night) {
  const d = group.userData;

  // Night lighting: glass towers pick up interior light, the Virgen is floodlit.
  for (const m of d.nightMats) m.emissiveIntensity = night * 0.9;

  // Aviation beacon, ~40 flashes a minute.
  const flash = Math.sin(elapsed * 4.2) > 0.6 ? 1 : 0.06;
  d.beacon.color.setRGB(flash, flash * 0.16, flash * 0.1);

  // Cable cars shuttle up and down.
  for (const c of d.cabins) {
    c.t += c.speed * dt;
    const ping = Math.abs(((c.t % 2) + 2) % 2 - 1);
    c.curve.getPointAt(ping, _v);
    c.mesh.position.copy(_v);
  }

  // The inbound flight loops its approach.
  d.arrivalT = (d.arrivalT + dt * 0.012) % 1;
  d.approach.getPointAt(d.arrivalT, _v);
  d.approach.getTangentAt(d.arrivalT, _v2);
  d.arrival.position.copy(_v);
  // Nose is local +X; a Y-rotation of θ sends +X to (cosθ, 0, -sinθ).
  d.arrival.rotation.y = Math.atan2(-_v2.z, _v2.x);
  d.arrival.rotation.z = Math.asin(THREE.MathUtils.clamp(_v2.y, -1, 1));
  d.arrival.visible = d.arrivalT < 0.985;
}
