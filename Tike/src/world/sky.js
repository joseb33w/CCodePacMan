import * as THREE from 'three';
import { clamp, smoothstep, mulberry32 } from '../lib/noise.js';

// ---------------------------------------------------------------------------
// Sky, sun and the light rig, all driven by a single time-of-day value in hours.
//
// Santiago is at 33°S, so the sun tracks across the *northern* half of the sky.
// The arc below leans that way on purpose — it is why the Andes catch light on
// their western faces in the afternoon and go flat blue at dawn.
// ---------------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunTint;
  uniform float uSunPower;
  uniform float uHaze;
  varying vec3 vDir;

  void main() {
    vec3 d = normalize(vDir);
    float up = d.y;

    // Sky gradient. pow() keeps the horizon band tight instead of smearing
    // halfway up the dome.
    float t = pow(clamp(up, 0.0, 1.0), 0.42);
    vec3 col = mix(uHorizon, uZenith, t);

    // Below the horizon fades to the basin's dusty haze rather than to black,
    // so distant terrain never reads as a hard cut-out.
    col = mix(col, uGround, smoothstep(0.0, -0.22, up));

    // Sun: a tight disc inside a wide forward-scattered bloom.
    float cosA = dot(d, uSunDir);
    float bloom = pow(clamp(cosA, 0.0, 1.0), 16.0) * 0.42
                + pow(clamp(cosA, 0.0, 1.0), 220.0) * 2.2;
    float disc = smoothstep(0.99955, 0.99985, cosA);
    col += uSunTint * (bloom * uSunPower) + uSunTint * disc * uSunPower * 3.0;

    // The smog layer that pools in the basin — strongest near the horizon,
    // strongest again when the sun is low and raking through it.
    float band = pow(1.0 - clamp(abs(up) * 3.4, 0.0, 1.0), 2.0);
    col = mix(col, uSunTint * 0.55 + vec3(0.34, 0.31, 0.28), band * uHaze * 0.42);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// Keyframed palette. Each entry is anchored to the sun's height above the
// horizon (sin of its elevation), which behaves better than keying off clock
// time when the arc is tilted.
const KEYS = [
  { e: -0.55, zen: '#03050e', hor: '#0a1024', gnd: '#080b16', sun: '#2b3550', power: 0.0, haze: 0.18 },
  { e: -0.12, zen: '#0b1533', hor: '#37324e', gnd: '#1a1a26', sun: '#8a5f74', power: 0.35, haze: 0.5 },
  { e: 0.02, zen: '#1e3566', hor: '#d87a4a', gnd: '#4a3527', sun: '#ff9142', power: 1.0, haze: 1.0 },
  { e: 0.16, zen: '#2f5c9e', hor: '#e8b183', gnd: '#7a6247', sun: '#ffc27a', power: 0.85, haze: 0.78 },
  { e: 0.45, zen: '#3a76c6', hor: '#b9cfe4', gnd: '#8f8b78', sun: '#fff3dd', power: 0.5, haze: 0.42 },
  { e: 0.95, zen: '#2f6fcc', hor: '#c3d8ea', gnd: '#95917d', sun: '#ffffff', power: 0.42, haze: 0.34 },
];

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function sampleKeys(e, field, out) {
  if (e <= KEYS[0].e) return out.set(KEYS[0][field]);
  for (let i = 1; i < KEYS.length; i++) {
    if (e <= KEYS[i].e) {
      const k0 = KEYS[i - 1];
      const k1 = KEYS[i];
      const t = (e - k0.e) / (k1.e - k0.e);
      return out.set(k0[field]).lerp(_c2.set(k1[field]), t);
    }
  }
  return out.set(KEYS[KEYS.length - 1][field]);
}

function sampleScalar(e, field) {
  if (e <= KEYS[0].e) return KEYS[0][field];
  for (let i = 1; i < KEYS.length; i++) {
    if (e <= KEYS[i].e) {
      const k0 = KEYS[i - 1];
      const k1 = KEYS[i];
      const t = (e - k0.e) / (k1.e - k0.e);
      return k0[field] + (k1[field] - k0[field]) * t;
    }
  }
  return KEYS[KEYS.length - 1][field];
}

function buildStars(count, radius) {
  const rand = mulberry32(0xbeef);
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Uniform on the upper hemisphere.
    const u = rand();
    const y = Math.pow(rand(), 0.65);
    const r = Math.sqrt(1 - y * y);
    const a = u * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r * radius;
    pos[i * 3 + 1] = y * radius;
    pos[i * 3 + 2] = Math.sin(a) * r * radius;
    size[i] = 5 + Math.pow(rand(), 5) * 26;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize;
      varying float vFade;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize;
        vFade = smoothstep(0.0, 0.35, normalize(position).y);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.06, d);
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92), a * uOpacity * vFade);
      }
    `,
  });

  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = -999;
  return pts;
}

export class Sky {
  constructor(scene) {
    this.sunDir = new THREE.Vector3(0, 1, 0);

    const geo = new THREE.SphereGeometry(6200, 48, 32);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color('#3a76c6') },
        uHorizon: { value: new THREE.Color('#b9cfe4') },
        uGround: { value: new THREE.Color('#8f8b78') },
        uSunDir: { value: this.sunDir },
        uSunTint: { value: new THREE.Color('#ffffff') },
        uSunPower: { value: 0.5 },
        uHaze: { value: 0.4 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(geo, this.material);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.stars = buildStars(1400, 5600);
    scene.add(this.stars);

    // --- lights -------------------------------------------------------------
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.near = 200;
    cam.far = 2600;
    cam.left = -620;
    cam.right = 620;
    cam.top = 620;
    cam.bottom = -620;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.8;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbcd6f2, 0x6b6350, 0.9);
    scene.add(this.hemi);

    // Warm bounce off the basin floor — keeps north-facing walls from going
    // dead flat once the sun drops behind the coastal range.
    this.bounce = new THREE.DirectionalLight(0xffd9b0, 0.35);
    this.bounce.position.set(-1, 0.35, 0.4);
    scene.add(this.bounce);

    this.fogColor = new THREE.Color();
    this.sunTint = new THREE.Color();
    this.elevation = 1;
  }

  // hours: 0..24
  update(hours) {
    // Santiago summer: sun up around 06:30, down around 20:25. The arc is a
    // tilted circle — at solar noon the sun sits ~66° up and to the NORTH,
    // which is why afternoon light rakes the west faces of the cordillera.
    const SUNRISE = 6.5;
    const SUNSET = 20.4;
    const TILT = 0.42; // radians of the noon sun away from zenith, toward north

    const a = ((hours - SUNRISE) / (SUNSET - SUNRISE)) * Math.PI;
    const s = Math.sin(a);
    const dir = this.sunDir.set(Math.cos(a), s * Math.cos(TILT), -s * Math.sin(TILT)).normalize();
    const e = dir.y;
    this.elevation = e;

    sampleKeys(e, 'zen', this.material.uniforms.uZenith.value);
    sampleKeys(e, 'hor', this.material.uniforms.uHorizon.value);
    sampleKeys(e, 'gnd', this.material.uniforms.uGround.value);
    sampleKeys(e, 'sun', this.sunTint);
    this.material.uniforms.uSunTint.value.copy(this.sunTint);
    this.material.uniforms.uSunPower.value = sampleScalar(e, 'power');
    this.material.uniforms.uHaze.value = sampleScalar(e, 'haze');

    // Sun intensity falls off fast through the last few degrees, then the
    // moon takes over as a cold, dim key light.
    const day = smoothstep(-0.06, 0.22, e);
    this.sun.position.copy(dir).multiplyScalar(1800);
    this.sun.intensity = day * 3.4;
    this.sun.color.copy(this.sunTint).lerp(_c1.set('#ffffff'), smoothstep(0.2, 0.6, e));

    this.hemi.intensity = 0.1 + day * 0.46;
    this.hemi.color.copy(this.material.uniforms.uHorizon.value);
    this.hemi.groundColor.set(day > 0.5 ? '#6b6350' : '#1c2230');
    this.bounce.intensity = smoothstep(0.3, 0.0, e) * smoothstep(-0.3, -0.02, e) * 0.5 + day * 0.22;

    this.stars.material.uniforms.uOpacity.value = clamp(smoothstep(0.04, -0.16, e), 0, 1) * 0.95;

    // Fog picks up the horizon colour so distant ridges dissolve into the sky.
    this.fogColor.copy(this.material.uniforms.uHorizon.value).lerp(this.material.uniforms.uGround.value, 0.35);

    this.nightAmount = clamp(smoothstep(0.1, -0.1, e), 0, 1);
    return this;
  }

  // Keeps the dome and stars centred on the viewer so they never run out.
  follow(camera) {
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);
    this.sun.target.position.set(camera.position.x, 0, camera.position.z);
    this.sun.position.copy(this.sunDir).multiplyScalar(1800).add(this.sun.target.position);
  }
}
