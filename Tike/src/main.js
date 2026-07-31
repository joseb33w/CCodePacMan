import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { buildTerrain, elevation } from './world/terrain.js';
import { buildRiver } from './world/river.js';
import { buildCity, buildTraffic, updateTraffic } from './world/city.js';
import { buildLandmarks, updateLandmarks } from './world/landmarks.js';
import { buildVegetation, buildFarmland, buildSkiResort } from './world/nature.js';
import { PLACES } from './world/landmarks.js';
import { Sky } from './world/sky.js';
import { Tour, STOPS } from './tour.js';
import { createUI } from './ui.js';
import { clamp, smoothstep } from './lib/noise.js';

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb9cfe4, 0.00019);

// Image-based lighting. Without it, anything metallic — every pane of glass in
// Sanhattan — renders as a black slab, and shadowed faces go dead flat. A tiny
// sky-to-ground gradient run through PMREM is enough and costs nothing.
function makeSkyEnvironment() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 32;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0.0, '#4d87d8');
  g.addColorStop(0.42, '#a8c7e6');
  g.addColorStop(0.5, '#cdc7b2');
  g.addColorStop(1.0, '#6e6351');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 32);

  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}
scene.environment = makeSkyEnvironment();
scene.environmentIntensity = 1;

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.6, 9000);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 8;
controls.maxDistance = 2400;
controls.enabled = false;

const sky = new Sky(scene);
const tour = new Tour(camera);

// ---------------------------------------------------------------------------
// Boot. The world is generated procedurally, which takes a beat, so it's built
// in steps with a frame between each one — otherwise the loading screen never
// gets a chance to paint.
// ---------------------------------------------------------------------------

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

const state = {
  night: 0,
  landmarks: null,
  traffic: null,
  city: null,
  padMaterial: null,
  stats: {},
};

async function boot(setStatus) {
  setStatus('Raising the cordillera…');
  await nextFrame();
  const terrain = buildTerrain();
  scene.add(terrain);

  setStatus('Cutting the Mapocho…');
  await nextFrame();
  scene.add(buildRiver());

  setStatus('Laying out the damero…');
  await nextFrame();
  const city = buildCity();
  scene.add(city);
  state.city = city;
  state.stats.buildings = city.userData.buildingCount;
  state.stats.blocks = city.userData.blockCount;
  state.padMaterial = city.getObjectByName('blocks').material;
  state.wallMaterial = city.getObjectByName('buildings').userData.wallMaterial;

  setStatus('Planting the cerros…');
  await nextFrame();
  const veg = buildVegetation();
  scene.add(veg);
  state.stats.trees = veg.userData.treeCount;

  setStatus('Sowing the Maipo valley…');
  await nextFrame();
  scene.add(buildFarmland());

  setStatus('Building the landmarks…');
  await nextFrame();
  const landmarks = buildLandmarks();
  scene.add(landmarks);
  state.landmarks = landmarks;
  scene.add(buildSkiResort());

  // The resort settles wherever the terrain offers a shelf, so the Valle
  // Nevado stop is framed from the result rather than from a guess.
  const vn = PLACES.valleNevado;
  const andes = STOPS.find((s) => s.id === 'andes');
  andes.pos = [vn.x - 178, vn.y + 62, vn.z + 196];
  andes.look = [vn.x + 30, vn.y + 2, vn.z - 34];

  setStatus('Starting the traffic…');
  await nextFrame();
  const traffic = buildTraffic();
  scene.add(traffic);
  state.traffic = traffic;

  setStatus('Ready');
  await nextFrame();
}

// ---------------------------------------------------------------------------

const ui = createUI({
  tour,
  onFreeToggle(free) {
    tour.setFree(free);
    controls.enabled = free;
    if (free) {
      controls.target.copy(tour.look);
      controls.update();
    }
  },
  onTimeOverride(hours) {
    timeOverride = hours;
  },
  onTimeRelease() {
    timeOverride = null;
  },
});

let timeOverride = null;

const clock = new THREE.Clock();
let elapsed = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;

  let hours = tour.update(dt);
  if (timeOverride !== null) hours = timeOverride;

  if (tour.free) controls.update();

  sky.update(hours);
  sky.follow(camera);

  const night = sky.nightAmount;
  state.night = night;

  // Everything that switches on after dark.
  if (state.wallMaterial) state.wallMaterial.emissiveIntensity = night * 1.45;
  if (state.padMaterial) {
    state.padMaterial.emissive.setRGB(1.0, 0.78, 0.46);
    state.padMaterial.emissiveIntensity = night * 0.05; // street lighting, not a light box
  }
  if (state.traffic) {
    updateTraffic(state.traffic, dt);
    state.traffic.userData.material.emissiveIntensity = night * 2.2;
  }
  if (state.landmarks) updateLandmarks(state.landmarks, dt, elapsed, night);

  // Ambient sky light falls away after sunset; keep a floor so the mountains
  // stay a silhouette rather than a void.
  scene.environmentIntensity = 0.04 + (1 - night) * 0.56;

  // Fog tracks the sky so the basin haze stays believable at every hour, and
  // thins after dark once the inversion layer settles.
  scene.fog.color.copy(sky.fogColor);
  scene.fog.density = 0.0001 - night * 0.00005;
  renderer.toneMappingExposure = 1.05 + night * 0.2;

  ui.tick(hours, tour);
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}
window.addEventListener('resize', onResize);

boot(ui.setStatus).then(() => {
  ui.ready(state.stats);
  tour.goTo(0, true);
  clock.getDelta();
  frame();
});

// Handy for poking at the scene from the console.
window.tike = { scene, camera, renderer, tour, sky, state, elevation, clamp, smoothstep };
