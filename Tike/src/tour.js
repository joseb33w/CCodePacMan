import * as THREE from 'three';
import { elevation } from './world/terrain.js';

// ---------------------------------------------------------------------------
// The itinerary. Each stop is a camera setup plus the hour of day it should be
// seen at — half of what makes a place feel like a place is the light you saw
// it in, so the sun moves with the plan.
// ---------------------------------------------------------------------------

export const STOPS = [
  {
    id: 'llegada',
    day: 'Day 1 · 08:20',
    title: 'Llegada',
    place: 'Aeropuerto Arturo Merino Benítez (SCL)',
    hours: 8.3,
    text:
      'You come in low over the Maipo plain from the west. The basin is already ' +
      'bright, and the whole eastern wall of the Andes is up on the horizon before ' +
      'the wheels touch. It is the first thing everyone notices: the mountains are ' +
      'not near the city, they are the edge of it.',
    pos: [-1330, 100, -76],
    look: [-840, 16, -330],
    fov: 52,
  },
  {
    id: 'centro',
    day: 'Day 1 · 11:00',
    title: 'Plaza de Armas',
    place: 'Centro Histórico',
    hours: 11,
    text:
      'The city was set out from this square in 1541 — a perfect grid of blocks ' +
      'that the whole basin still follows. The Catedral Metropolitana takes one ' +
      'side, the old post office another. Chess players, street preachers, and a ' +
      'hundred stray dogs take the middle.',
    pos: [-166, 27, 70],
    look: [-118, 7, 22],
    fov: 46,
  },
  {
    id: 'lastarria',
    day: 'Day 2 · 09:40',
    title: 'Cerro Santa Lucía',
    place: 'Barrio Lastarria',
    hours: 9.6,
    text:
      'A volcanic outcrop dropped into the middle of downtown, terraced into a ' +
      'stone garden in the 1870s. Climb it in ten minutes for the first proper ' +
      'look at the grid, then come down into Lastarria for coffee under the ' +
      'plane trees.',
    pos: [-16, 24, 84],
    look: [-52, 13, 44],
    fov: 44,
  },
  {
    id: 'sancristobal',
    day: 'Day 2 · 19:40',
    title: 'Cerro San Cristóbal',
    place: 'Parque Metropolitano',
    hours: 19.7,
    text:
      'Three hundred metres of wooded hill straight out of the street grid, with ' +
      'the Virgen de la Inmaculada Concepción on top. Take the 1925 funicular up ' +
      'the Bellavista side and arrive as the light goes orange on the cordillera.',
    pos: [-14, 50, -60],
    look: [64, 36, -134],
    fov: 50,
    clampMargin: 22,
  },
  {
    id: 'sanhattan',
    day: 'Day 3 · 12:20',
    title: 'Gran Torre Santiago',
    place: 'Sanhattan, Providencia',
    hours: 12.4,
    text:
      'Three hundred metres of glass, the tallest building in South America, ' +
      'standing over a shopping mall the size of a neighbourhood. Locals call ' +
      'this cluster Sanhattan without any irony at all.',
    pos: [250, 40, 30],
    look: [182, 28, -30],
    fov: 42,
  },
  {
    id: 'skydeck',
    day: 'Day 3 · 18:10',
    title: 'Sky Costanera',
    place: 'Mirador, piso 61',
    hours: 18.2,
    text:
      'From the deck the basin finally makes sense. The grid runs out west until ' +
      'it hits haze; east it stops dead against a wall of rock four kilometres ' +
      'high. On a clear winter afternoon the snowline looks close enough to walk to.',
    pos: [188, 48, -26],
    look: [566, 46, -150],
    fov: 56,
  },
  {
    id: 'maipo',
    day: 'Day 4 · 16:30',
    title: 'Valle del Maipo',
    place: 'Ruta del Vino',
    hours: 16.6,
    text:
      'Forty minutes south the blocks give out and the rows begin — cabernet ' +
      'sauvignon and carménère on gravel soils, irrigated with Andean snowmelt. ' +
      'The mountains you were looking at this morning are what you are drinking.',
    pos: [-486, 44, 1010],
    look: [-146, 20, 748],
    fov: 48,
  },
  {
    id: 'andes',
    day: 'Day 5 · 10:00',
    title: 'Valle Nevado',
    place: 'Cordillera de los Andes',
    hours: 10,
    text:
      'Sixty kilometres and forty switchbacks from the centro, at three thousand ' +
      'metres. You can ski here in the morning and be back in the city for dinner, ' +
      'which is a genuinely absurd thing for a capital to offer.',
    pos: [560, 300, 40],
    look: [760, 250, -210],
    fov: 46,
    clampMargin: 26,
  },
  {
    id: 'noche',
    day: 'Day 5 · 21:40',
    title: 'Santiago de noche',
    place: 'Sobre la cuenca',
    hours: 21.7,
    text:
      'The last look. Six million people, a grid of light pushed up against a ' +
      'black wall of mountains, with the Virgen lit white on her hill and the ' +
      'Gran Torre blinking over everything.',
    pos: [-300, 150, 210],
    look: [140, 20, -70],
    fov: 52,
  },
];

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function clampAboveGround(v, margin = 8) {
  const g = elevation(v.x, v.z) + margin;
  if (v.y < g) v.y = g;
  return v;
}

export class Tour {
  constructor(camera) {
    this.camera = camera;
    this.stops = STOPS;
    this.index = 0;
    this.playing = true;
    this.free = false;

    this.TRAVEL = 6.0; // seconds in transit
    this.HOLD = 9.5; // seconds parked at a stop

    this.phase = 'hold';
    this.clock = 0;
    this.drift = 0;

    this.from = { pos: new THREE.Vector3(), look: new THREE.Vector3(), hours: 12, fov: 50 };
    this.to = { pos: new THREE.Vector3(), look: new THREE.Vector3(), hours: 12, fov: 50 };
    this.mid = new THREE.Vector3();

    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.hours = STOPS[0].hours;

    this._readStop(0, this.to);
    this.pos.copy(this.to.pos);
    this.look.copy(this.to.look);
    this.hours = this.to.hours;
    this._apply();

    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    for (const fn of this.listeners) fn(this.index, this.stops[this.index], this.phase);
  }

  _readStop(i, out) {
    const s = this.stops[i];
    out.pos.set(...s.pos);
    clampAboveGround(out.pos, s.clampMargin ?? 8);
    out.look.set(...s.look);
    out.hours = s.hours;
    out.fov = s.fov ?? 50;
    return out;
  }

  goTo(i, instant = false) {
    const n = this.stops.length;
    const next = ((i % n) + n) % n;

    this.from.pos.copy(this.pos);
    this.from.look.copy(this.look);
    this.from.hours = this.hours;
    this.from.fov = this.camera.fov;

    this.index = next;
    this._readStop(next, this.to);

    if (instant) {
      this.pos.copy(this.to.pos);
      this.look.copy(this.to.look);
      this.hours = this.to.hours;
      this.phase = 'hold';
      this.clock = 0;
      this._apply();
      this._emit();
      return;
    }

    // Arc the camera up and over rather than dollying through the city.
    this.mid.addVectors(this.from.pos, this.to.pos).multiplyScalar(0.5);
    const span = this.from.pos.distanceTo(this.to.pos);
    this.mid.y += Math.min(span * 0.26, 190);
    clampAboveGround(this.mid, 24);

    this.phase = 'travel';
    this.clock = 0;
    this.drift = 0;
    this._emit();
  }

  next() {
    this.goTo(this.index + 1);
  }

  prev() {
    this.goTo(this.index - 1);
  }

  setPlaying(v) {
    this.playing = v;
    this._emit();
  }

  setFree(v) {
    this.free = v;
    if (!v) {
      // Snap the itinerary back to wherever the camera ended up so resuming
      // doesn't teleport.
      this.pos.copy(this.camera.position);
      this.goTo(this.index);
    }
    this._emit();
  }

  get progress() {
    return this.phase === 'travel' ? this.clock / this.TRAVEL : 1;
  }

  update(dt) {
    if (this.free) return this.hours;

    if (this.phase === 'travel') {
      this.clock += dt;
      const t = easeInOut(Math.min(this.clock / this.TRAVEL, 1));

      // Quadratic Bézier through the lifted midpoint.
      const u = 1 - t;
      this.pos
        .copy(this.from.pos)
        .multiplyScalar(u * u)
        .addScaledVector(this.mid, 2 * u * t)
        .addScaledVector(this.to.pos, t * t);
      this.look.lerpVectors(this.from.look, this.to.look, t);
      this.hours = this.from.hours + (this.to.hours - this.from.hours) * t;
      this.camera.fov = this.from.fov + (this.to.fov - this.from.fov) * t;

      if (this.clock >= this.TRAVEL) {
        this.phase = 'hold';
        this.clock = 0;
        this._emit();
      }
    } else {
      if (this.playing) {
        this.clock += dt;
        if (this.clock >= this.HOLD) this.next();
      }
      // Slow parallax drift so a held shot still breathes.
      this.drift += dt;
      const r = 0.016;
      const a = this.drift * 0.11;
      const offset = this.to.pos.clone().sub(this.to.look);
      const radius = offset.length();
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(a) * r);
      offset.y += Math.sin(a * 1.7) * radius * 0.006;
      this.pos.copy(this.to.look).add(offset);
      this.hours = this.to.hours;
    }

    this._apply();
    return this.hours;
  }

  _apply() {
    clampAboveGround(this.pos, 4);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
    this.camera.updateProjectionMatrix();
  }
}
