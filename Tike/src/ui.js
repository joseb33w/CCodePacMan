import { STOPS } from './tour.js';

// ---------------------------------------------------------------------------
// Overlay wiring. Deliberately plain DOM — the scene is the product, the UI
// just needs to stay out of its way and never drop a frame.
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const STEPS = [
  'Raising the cordillera…',
  'Cutting the Mapocho…',
  'Laying out the damero…',
  'Planting the cerros…',
  'Sowing the Maipo valley…',
  'Building the landmarks…',
  'Starting the traffic…',
  'Ready',
];

function hourLabel(h) {
  const hh = ((h % 24) + 24) % 24;
  const m = Math.floor((hh % 1) * 60);
  return `${String(Math.floor(hh)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function partOfDay(h) {
  const hh = ((h % 24) + 24) % 24;
  if (hh < 5.5) return 'night';
  if (hh < 8) return 'dawn';
  if (hh < 12) return 'morning';
  if (hh < 15) return 'midday';
  if (hh < 18.5) return 'afternoon';
  if (hh < 20.5) return 'golden hour';
  if (hh < 22) return 'dusk';
  return 'night';
}

export function createUI({ tour, onFreeToggle, onTimeOverride, onTimeRelease }) {
  const loader = $('loader');
  const loaderBar = $('loader-bar');
  const status = $('status');

  const card = $('card');
  const cardDay = $('card-day');
  const cardTitle = $('card-title');
  const cardPlace = $('card-place');
  const cardText = $('card-text');
  const cardProgress = $('card-progress');

  const clockEl = $('clock');
  const todEl = $('tod');
  const timeInput = $('time');
  const stopsEl = $('stops');

  const btnPrev = $('btn-prev');
  const btnNext = $('btn-next');
  const btnPlay = $('btn-play');
  const btnFree = $('btn-free');
  const iconPlay = $('icon-play');
  const iconPause = $('icon-pause');
  const hint = $('hint');

  // --- itinerary rail -------------------------------------------------------
  const stopButtons = STOPS.map((s, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="name">${s.title}</span><span class="tick"></span>`;
    b.addEventListener('click', () => {
      if (tour.free) setFree(false);
      tour.goTo(i);
    });
    stopsEl.appendChild(b);
    return b;
  });

  function renderStop(index, stop) {
    cardDay.textContent = stop.day;
    cardTitle.textContent = stop.title;
    cardPlace.textContent = stop.place;
    cardText.textContent = stop.text;
    card.classList.remove('swap');
    void card.offsetWidth; // restart the animation
    card.classList.add('swap');
    stopButtons.forEach((b, i) => b.classList.toggle('active', i === index));
  }

  tour.onChange((index, stop) => renderStop(index, stop));

  // --- transport ------------------------------------------------------------
  btnPrev.addEventListener('click', () => tour.prev());
  btnNext.addEventListener('click', () => tour.next());
  btnPlay.addEventListener('click', () => setPlaying(!tour.playing));

  function setPlaying(v) {
    tour.setPlaying(v);
    iconPlay.classList.toggle('hidden', v);
    iconPause.classList.toggle('hidden', !v);
  }

  let free = false;
  function setFree(v) {
    free = v;
    btnFree.classList.toggle('on', v);
    onFreeToggle(v);
  }
  btnFree.addEventListener('click', () => setFree(!free));

  // --- time scrubbing -------------------------------------------------------
  // Dragging the slider overrides the itinerary's hour; letting go hands the
  // sun back to the tour.
  let scrubbing = false;
  timeInput.addEventListener('input', () => {
    scrubbing = true;
    onTimeOverride(parseFloat(timeInput.value));
  });
  const release = () => {
    if (!scrubbing) return;
    scrubbing = false;
    onTimeRelease();
  };
  timeInput.addEventListener('change', release);
  timeInput.addEventListener('pointerup', release);
  timeInput.addEventListener('pointercancel', release);
  timeInput.addEventListener('blur', release);

  // --- keyboard -------------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Space') {
      e.preventDefault();
      setPlaying(!tour.playing);
    } else if (e.code === 'ArrowRight') {
      tour.next();
    } else if (e.code === 'ArrowLeft') {
      tour.prev();
    } else if (e.key === 'f' || e.key === 'F') {
      setFree(!free);
    }
  });

  let hintTimer = null;

  return {
    setStatus(text) {
      status.textContent = text;
      const i = STEPS.indexOf(text);
      loaderBar.style.width = `${(((i < 0 ? 0 : i) + 1) / STEPS.length) * 100}%`;
    },

    ready() {
      loader.classList.add('done');
      setTimeout(() => loader.classList.add('hidden'), 900);
      for (const el of [$('topbar'), stopsEl, card, $('controls'), hint]) {
        el.classList.remove('hidden');
      }
      renderStop(tour.index, STOPS[tour.index]);
      hintTimer = setTimeout(() => {
        hint.style.opacity = '0';
      }, 9000);
    },

    tick(hours, t) {
      clockEl.textContent = hourLabel(hours);
      todEl.textContent = partOfDay(hours);
      if (!scrubbing) timeInput.value = String(((hours % 24) + 24) % 24);

      const p = t.phase === 'travel' ? t.progress * 0.35 : 0.35 + (t.clock / t.HOLD) * 0.65;
      cardProgress.style.width = `${Math.min(p, 1) * 100}%`;
    },

    setFree,
  };
}
