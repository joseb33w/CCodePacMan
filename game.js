(() => {
  'use strict';

  const TILE = 16;
  const COLS = 28;
  const ROWS = 31;
  const W = COLS * TILE;
  const H = ROWS * TILE;
  const HIGH_KEY = 'ccode-pacman-high-v10';

  const RAW = [
    '############################',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#o####.#####.##.#####.####o#',
    '#.####.#####.##.#####.####.#',
    '#..........................#',
    '#.####.##.########.##.####.#',
    '#.####.##.########.##.####.#',
    '#......##....##....##......#',
    '######.##### ## #####.######',
    '######.##### ## #####.######',
    '######.##          ##.######',
    '######.## ###--### ##.######',
    '######.##         # ##.######',
    '      .   #      #   .      ',
    '######.## #      # ##.######',
    '######.## ######## ##.######',
    '######.##          ##.######',
    '######.## ######## ##.######',
    '######.## ######## ##.######',
    '#............##............#',
    '#.####.#####.##.#####.####.#',
    '#.####.#####.##.#####.####.#',
    '#o..##................##..o#',
    '###.##.##.########.##.##.###',
    '###.##.##.########.##.##.###',
    '#......##....##....##......#',
    '#.##########.##.##########.#',
    '#.##########.##.##########.#',
    '#..........................#',
    '############################'
  ];

  const EMPTY = 0, WALL = 1, PELLET = 2, POWER = 3, DOOR = 4;
  const COLORS = {
    yellow: '#ffe45c',
    wallA: '#5a6cff',
    wallB: '#1c2bd0',
    wallEdge: '#a6b2ff',
    pellet: '#fff6db',
    cyan: '#48f7ff',
    pink: '#ff79e8',
    red: '#ff5577',
    orange: '#ffb24d',
    fruitLeaf: '#7eff8e'
  };
  const DIRS = {
    up:    { x: 0, y: -1, name: 'up' },
    down:  { x: 0, y: 1,  name: 'down' },
    left:  { x: -1, y: 0, name: 'left' },
    right: { x: 1, y: 0,  name: 'right' },
    none:  { x: 0, y: 0,  name: 'none' }
  };
  const DIR_ORDER = [DIRS.up, DIRS.left, DIRS.down, DIRS.right];
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const els = {
    score: $('score'), high: $('high'), lives: $('lives'), level: $('level'),
    mode: $('mode'), pellets: $('pellets'),
    message: $('message'), messageTitle: $('messageTitle'), messageText: $('messageText'),
    start: $('startBtn'), pause: $('pauseBtn'), sound: $('soundBtn'),
    go: $('goBtn'), restart: $('restartBtn'), hint: $('hint')
  };

  let maze = [], pellets = 0, totalPellets = 0, score = 0;
  let high = Number(localStorage.getItem(HIGH_KEY) || 0);
  let lives = 3, level = 1, state = 'ready', mode = 'chase';
  let modeTimer = 0, powerTimer = 0, ghostCombo = 0;
  let pac, ghosts = [], fruit = null, fruitMarks = new Set();
  let particles = [], popups = [], frame = 0, lastTime = 0;
  let heldDir = null, swipeStart = null, audioCtx = null, soundOn = true;

  const center = (t) => t * TILE + TILE / 2;
  const tileFromPx = (px) => Math.floor(px / TILE);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function safe(fn, label) {
    try { return fn(); }
    catch (err) {
      console.error(label + ':', err.message, err.stack || '');
      showMessage('Error', err.message || 'Something went wrong.', 'Restart');
      state = 'paused';
    }
  }
  window.addEventListener('error', (e) => {
    console.error('Runtime error:', e.message, e.error?.stack || '');
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

  function opposite(d) {
    if (d === DIRS.up) return DIRS.down;
    if (d === DIRS.down) return DIRS.up;
    if (d === DIRS.left) return DIRS.right;
    if (d === DIRS.right) return DIRS.left;
    return DIRS.none;
  }
  function sameDir(a, b) { return a && b && a.x === b.x && a.y === b.y; }
  function tileAt(tx, ty) {
    if (ty < 0 || ty >= ROWS) return WALL;
    if (tx < 0 || tx >= COLS) return EMPTY;
    return maze[ty]?.[tx] ?? WALL;
  }
  function passable(tx, ty, forGhost = false) {
    const t = tileAt(tx, ty);
    return t !== WALL && (forGhost || t !== DOOR);
  }
  function availableDirs(tileX, tileY, currentDir, forGhost, allowReverse) {
    const rev = opposite(currentDir);
    return DIR_ORDER.filter((d) => {
      if (!allowReverse && currentDir !== DIRS.none && sameDir(d, rev)) return false;
      return passable(tileX + d.x, tileY + d.y, forGhost);
    });
  }

  function buildMaze() {
    maze = []; pellets = 0; fruitMarks = new Set();
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        const ch = RAW[y][x];
        if (ch === '#') row.push(WALL);
        else if (ch === '.') { row.push(PELLET); pellets++; }
        else if (ch === 'o') { row.push(POWER); pellets++; }
        else if (ch === '-') row.push(DOOR);
        else row.push(EMPTY);
      }
      maze.push(row);
    }
    totalPellets = pellets;
  }

  function nearestOpen(tx, ty, forGhost = true) {
    tx = clamp(Math.round(tx), 0, COLS - 1);
    ty = clamp(Math.round(ty), 0, ROWS - 1);
    if (passable(tx, ty, forGhost)) return { x: tx, y: ty };
    const seen = new Set([`${tx},${ty}`]);
    const q = [{ x: tx, y: ty }];
    while (q.length) {
      const p = q.shift();
      for (const d of DIR_ORDER) {
        const nx = p.x + d.x, ny = p.y + d.y, k = `${nx},${ny}`;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || seen.has(k)) continue;
        if (passable(nx, ny, forGhost)) return { x: nx, y: ny };
        seen.add(k); q.push({ x: nx, y: ny });
      }
    }
    return { x: 13, y: 23 };
  }

  // ─────────────── PLAYER ───────────────
  class Pac {
    constructor() {
      this.tx = 13; this.ty = 23;
      this.x = center(this.tx); this.y = center(this.ty);
      this.dir = DIRS.left; this.next = DIRS.left;
      this.speed = 100 + Math.min(24, level * 3);
      this.mouth = 0;
    }
    update(dt) {
      this.mouth += dt * 10;
      const cx = center(this.tx), cy = center(this.ty);
      const dxOff = this.x - cx, dyOff = this.y - cy;

      // Direction change is allowed near the center perpendicular to the new dir
      if (this.next !== DIRS.none) {
        const reverse = this.dir !== DIRS.none && sameDir(this.next, opposite(this.dir));
        if (reverse && passable(this.tx + this.next.x, this.ty + this.next.y, false)) {
          this.dir = this.next;
        } else if (this.next.x !== 0 && Math.abs(dyOff) <= TILE * 0.45 && passable(this.tx + this.next.x, this.ty, false)) {
          this.y = cy; this.dir = this.next;
        } else if (this.next.y !== 0 && Math.abs(dxOff) <= TILE * 0.45 && passable(this.tx, this.ty + this.next.y, false)) {
          this.x = cx; this.dir = this.next;
        }
      }

      // Move
      if (this.dir !== DIRS.none) {
        let nx = this.x + this.dir.x * this.speed * dt;
        let ny = this.y + this.dir.y * this.speed * dt;
        // Wrap-around
        if (nx < -TILE / 2) nx = W + TILE / 2;
        if (nx > W + TILE / 2) nx = -TILE / 2;
        // Wall check: look one half-tile ahead
        const ax = nx + this.dir.x * (TILE / 2 - 0.5);
        const ay = ny + this.dir.y * (TILE / 2 - 0.5);
        if (passable(tileFromPx(clamp(ax, 0, W - 1)), tileFromPx(clamp(ay, 0, H - 1)), false)) {
          this.x = nx; this.y = ny;
        } else {
          // Stop at current tile center
          this.x = cx; this.y = cy;
        }
        this.tx = tileFromPx(clamp(this.x, 0, W - 1));
        this.ty = tileFromPx(clamp(this.y, 0, H - 1));
      }
      this.eat();
    }
    eat() {
      const t = tileAt(this.tx, this.ty);
      if (t === PELLET || t === POWER) {
        maze[this.ty][this.tx] = EMPTY;
        pellets--;
        if (t === POWER) {
          addScore(50, this.x, this.y, '+50');
          powerTimer = 8.5;
          ghostCombo = 0;
          ghosts.forEach((g) => g.frighten());
          burst(this.x, this.y, COLORS.cyan, 24);
          beep(260, 0.12, 'sawtooth', 0.045);
        } else {
          addScore(10, this.x, this.y, '+10');
          beep(760, 0.025, 'square', 0.02);
        }
        maybeFruit();
      }
      if (fruit && Math.hypot(fruit.x - this.x, fruit.y - this.y) < TILE * 0.95) {
        addScore(fruit.points, fruit.x, fruit.y, '+' + fruit.points);
        burst(fruit.x, fruit.y, fruit.color, 34);
        beep(980, 0.12, 'triangle', 0.05);
        fruit = null;
      }
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      let rot = 0;
      if (this.dir === DIRS.left) rot = Math.PI;
      if (this.dir === DIRS.up) rot = -Math.PI / 2;
      if (this.dir === DIRS.down) rot = Math.PI / 2;
      ctx.rotate(rot);
      const r = TILE * 0.48;
      const open = 0.08 + Math.abs(Math.sin(this.mouth)) * 0.30;
      ctx.fillStyle = COLORS.yellow;
      ctx.shadowBlur = 16; ctx.shadowColor = COLORS.yellow;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, open * Math.PI, (2 - open) * Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(2, -r * 0.55, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ─────────────── GHOST ───────────────
  // Model: ghost is ALWAYS moving toward `targetTile`. When pixel position
  // reaches the center of that tile, we pick a new targetTile (the next step).
  // This is the canonical Pac-Man rhythm and inherently prevents oscillation.
  class Ghost {
    constructor(name, tx, ty, color, scatter, startDir) {
      this.name = name; this.baseColor = color;
      this.color = color;
      this.scatter = scatter;
      this.spawnTile = { x: tx, y: ty };
      this.tx = tx; this.ty = ty;
      this.x = center(tx); this.y = center(ty);
      this.mode = 'chase';
      this.phase = Math.random() * Math.PI * 2;
      // Outgoing direction (we will commit to it after we leave the spawn tile)
      this.dir = startDir;
      // Target tile we're walking TO. Pick a neighbor in startDir or any open neighbor.
      this.targetTile = this.pickInitialTarget(startDir);
      this.speed = 96;
    }
    pickInitialTarget(startDir) {
      // Try to head in the requested direction first; otherwise pick any open neighbor
      const cands = [startDir, ...DIR_ORDER.filter(d => !sameDir(d, startDir))];
      for (const d of cands) {
        if (passable(this.tx + d.x, this.ty + d.y, true)) {
          this.dir = d;
          return { x: this.tx + d.x, y: this.ty + d.y };
        }
      }
      // Should never happen for a valid spawn
      return { x: this.tx, y: this.ty };
    }
    frighten() {
      if (this.mode === 'eaten') return;
      this.mode = 'fright';
      // Reverse: next decision will pick a new target; for now keep current path
    }
    aiTarget() {
      if (this.mode === 'eaten') return this.spawnTile;
      if (this.mode === 'fright') {
        const corners = [{ x: 1, y: 1 }, { x: 26, y: 1 }, { x: 1, y: 29 }, { x: 26, y: 29 }];
        return corners[(frame + this.name.length) % corners.length];
      }
      if (mode === 'scatter' || !pac) return this.scatter;
      if (this.name === 'blinky') return { x: pac.tx, y: pac.ty };
      if (this.name === 'pinky')  return { x: pac.tx + pac.dir.x * 4, y: pac.ty + pac.dir.y * 4 };
      if (this.name === 'inky') {
        const b = ghosts[0] || pac;
        const ahead = { x: pac.tx + pac.dir.x * 2, y: pac.ty + pac.dir.y * 2 };
        return { x: ahead.x + (ahead.x - b.tx), y: ahead.y + (ahead.y - b.ty) };
      }
      return Math.hypot(pac.tx - this.tx, pac.ty - this.ty) > 8 ? { x: pac.tx, y: pac.ty } : this.scatter;
    }
    /**
     * At a tile boundary, pick the next tile to walk into.
     * Standard Pac-Man rule: no reversing, pick neighbor closest (squared dist) to the AI target.
     */
    chooseNextTile() {
      const opts = availableDirs(this.tx, this.ty, this.dir, true, false);
      const dirs = opts.length ? opts : availableDirs(this.tx, this.ty, this.dir, true, true);
      if (!dirs.length) {
        // Dead end with no reverse — should never happen on this map, but stay put.
        return { x: this.tx, y: this.ty };
      }
      let pick;
      if (this.mode === 'fright') {
        pick = dirs[Math.floor(Math.random() * dirs.length)];
      } else {
        const tgt = this.aiTarget();
        let best = dirs[0], bestDist = Infinity;
        // DIR_ORDER ensures classic tie-break: up, left, down, right
        for (const d of dirs) {
          const nx = this.tx + d.x, ny = this.ty + d.y;
          const dist = (nx - tgt.x) ** 2 + (ny - tgt.y) ** 2;
          if (dist < bestDist) { bestDist = dist; best = d; }
        }
        pick = best;
      }
      this.dir = pick;
      return { x: this.tx + pick.x, y: this.ty + pick.y };
    }
    update(dt, demo = false) {
      this.phase += dt * 6;
      if (this.mode === 'fright')      this.speed = 76;
      else if (this.mode === 'eaten')  this.speed = 150;
      else                              this.speed = 96 + Math.min(30, level * 5);
      if (demo) this.speed *= 0.85;

      // Walk toward target tile center every frame.
      const goalX = center(this.targetTile.x);
      const goalY = center(this.targetTile.y);
      let dx = goalX - this.x, dy = goalY - this.y;
      const distLeft = Math.hypot(dx, dy);
      const stepLen = this.speed * dt;

      if (distLeft <= stepLen || distLeft < 0.5) {
        // Arrived at target tile center.
        this.x = goalX; this.y = goalY;
        this.tx = this.targetTile.x; this.ty = this.targetTile.y;
        // Pick the next target tile.
        this.targetTile = this.chooseNextTile();

        // Eaten → home check
        if (this.mode === 'eaten' && this.tx === this.spawnTile.x && this.ty === this.spawnTile.y) {
          this.mode = 'chase';
        }
      } else {
        // Step toward target (normalize direction)
        this.x += (dx / distLeft) * stepLen;
        this.y += (dy / distLeft) * stepLen;
      }
    }
    draw() {
      const frightened = this.mode === 'fright';
      const eaten = this.mode === 'eaten';
      const bob = Math.sin(this.phase) * 1.4;
      ctx.save();
      ctx.translate(this.x, this.y + bob);
      if (!eaten) {
        ctx.fillStyle = frightened
          ? (powerTimer < 2 && Math.floor(frame / 8) % 2 ? '#fff' : '#2940ff')
          : this.baseColor;
        ctx.shadowBlur = 18; ctx.shadowColor = ctx.fillStyle;
        const r = TILE * 0.5;
        ctx.beginPath();
        ctx.arc(0, -1, r, Math.PI, 0);
        ctx.lineTo(r, r);
        for (let i = 0; i < 3; i++) {
          ctx.lineTo(r - (i * 2 + 1) * r / 3, r - 4);
          ctx.lineTo(r - (i * 2 + 2) * r / 3, r);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-4, -2, 3.4, 0, Math.PI * 2);
      ctx.arc(4, -2, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = frightened ? '#ff3333' : '#07156e';
      ctx.beginPath();
      ctx.arc(-4 + this.dir.x * 1.8, -2 + this.dir.y * 1.8, 1.7, 0, Math.PI * 2);
      ctx.arc(4 + this.dir.x * 1.8, -2 + this.dir.y * 1.8, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function spawnActors() {
    pac = new Pac();
    const spawn = (preferTx, preferTy) => nearestOpen(preferTx, preferTy, true);
    const a = spawn(1, 5), b = spawn(26, 5), c = spawn(1, 26), d = spawn(26, 26);
    ghosts = [
      new Ghost('blinky', a.x, a.y, COLORS.red,    { x: 26, y: 1  }, DIRS.right),
      new Ghost('pinky',  b.x, b.y, COLORS.pink,   { x: 1,  y: 1  }, DIRS.left ),
      new Ghost('inky',   c.x, c.y, COLORS.cyan,   { x: 26, y: 29 }, DIRS.right),
      new Ghost('clyde',  d.x, d.y, COLORS.orange, { x: 1,  y: 29 }, DIRS.left )
    ];
  }

  function resetGame() {
    score = 0; lives = 3; level = 1;
    mode = 'chase'; modeTimer = 0; powerTimer = 0; ghostCombo = 0;
    fruit = null; particles = []; popups = [];
    buildMaze(); spawnActors();
    setReady('Ready?', 'Eat every pellet. Grab a power dot to bite the ghosts. Bonus fruit appears mid-level.');
    updateHud();
  }
  function nextLevel() {
    level++; mode = 'chase'; modeTimer = 0; powerTimer = 0; fruit = null;
    buildMaze(); spawnActors();
    setReady('Level ' + level, 'The ghosts are faster now — stay sharp.');
    updateHud();
  }
  function setReady(title, text) { state = 'ready'; showMessage(title, text, 'Go'); }
  function start() {
    if (audioCtx?.state === 'suspended') audioCtx.resume();
    if (state === 'gameover') resetGame();
    if (state === 'ready' || state === 'paused' || state === 'levelclear') {
      state = 'playing';
      hideMessage();
      beep(760, 0.08, 'square', 0.045);
      updateHud();
    }
  }
  function pauseToggle() {
    if (state === 'playing') { state = 'paused'; showMessage('Paused', 'Tap Go or Resume to continue.', 'Resume'); }
    else if (state === 'paused') start();
    updateHud();
  }
  function loseLife() {
    lives--; updateHud();
    if (lives <= 0) {
      state = 'gameover';
      showMessage('Game Over', 'Final score: ' + score + '. Tap Restart to play again.', 'Restart');
      beep(150, 0.18, 'sawtooth', 0.05);
    } else {
      spawnActors();
      setReady('Ready?', lives + ' lives left. The ghosts are circling already.');
    }
  }
  function showMessage(title, text, button) {
    els.messageTitle.textContent = title;
    els.messageText.textContent = text;
    els.start.textContent = button;
    els.message.classList.remove('hidden');
  }
  function hideMessage() { els.message.classList.add('hidden'); }
  function updateHud() {
    els.score.textContent = score;
    els.high.textContent = high;
    els.lives.textContent = lives;
    els.level.textContent = level;
    const label = state === 'playing' ? (powerTimer > 0 ? 'Power' : mode) : state;
    els.mode.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    els.pellets.textContent = 'Pellets: ' + pellets;
    els.pause.textContent = state === 'paused' ? 'Resume' : 'Pause';
  }
  function addScore(points, x, y, label) {
    score += points;
    if (score > high) { high = score; localStorage.setItem(HIGH_KEY, String(high)); }
    if (label) popups.push({ text: label, x, y, life: 52, color: points >= 100 ? COLORS.cyan : COLORS.yellow });
    updateHud();
  }
  function maybeFruit() {
    if (fruit) return;
    const eaten = totalPellets - pellets;
    [Math.floor(totalPellets * 0.35), Math.floor(totalPellets * 0.70)].forEach((mark, idx) => {
      if (!fruit && eaten >= mark && !fruitMarks.has(idx)) {
        fruitMarks.add(idx);
        const data = [
          { kind: 'cherry', points: 100,  color: '#ff476f' },
          { kind: 'berry',  points: 300,  color: '#ff68e8' },
          { kind: 'orange', points: 500,  color: '#ffb24d' },
          { kind: 'bell',   points: 700,  color: '#ffe45c' },
          { kind: 'key',    points: 1000, color: '#48f7ff' }
        ][Math.min(level - 1, 4)];
        fruit = { ...data, x: center(13), y: center(17), time: 9.5 };
        popups.push({ text: 'BONUS', x: fruit.x, y: fruit.y - 14, life: 72, color: fruit.color });
      }
    });
  }
  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 25 + Math.random() * 58;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        age: 0, life: 0.45 + Math.random() * 0.28,
        r: 1.3 + Math.random() * 2.4, color
      });
    }
  }
  function beep(freq = 440, dur = 0.08, type = 'square', gainValue = 0.035) {
    if (!soundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(gainValue, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch (err) { console.warn('Audio:', err.message); }
  }

  function update(dt) {
    frame++;
    if (state === 'ready') {
      ghosts.forEach((g) => g.update(dt, true));
      updateEffects(dt);
      return;
    }
    if (state !== 'playing') { updateEffects(dt); return; }
    modeTimer += dt;
    if (mode === 'scatter' && modeTimer > 7)  { mode = 'chase';   modeTimer = 0; }
    if (mode === 'chase'   && modeTimer > 20) { mode = 'scatter'; modeTimer = 0; }
    if (powerTimer > 0) {
      powerTimer -= dt;
      if (powerTimer <= 0) ghosts.forEach((g) => { if (g.mode === 'fright') g.mode = 'chase'; });
    } else { ghostCombo = 0; }
    pac.update(dt);
    ghosts.forEach((g) => g.update(dt));
    checkCollisions();
    updateEffects(dt);
    if (fruit) { fruit.time -= dt; if (fruit.time <= 0) fruit = null; }
    if (pellets <= 0) {
      state = 'levelclear';
      beep(980, 0.14, 'triangle', 0.06);
      showMessage('Level Clear!', 'Great run. Next maze is faster.', 'Next');
      setTimeout(() => safe(nextLevel, 'nextLevel'), 850);
    }
  }

  function checkCollisions() {
    for (const g of ghosts) {
      if (g.mode === 'eaten') continue;
      if (Math.hypot(g.x - pac.x, g.y - pac.y) < TILE * 0.72) {
        if (g.mode === 'fright') {
          ghostCombo++;
          const pts = 200 * Math.pow(2, ghostCombo - 1);
          addScore(pts, g.x, g.y, '+' + pts);
          g.mode = 'eaten';
          burst(g.x, g.y, COLORS.cyan, 26);
          beep(520 + ghostCombo * 140, 0.1, 'square', 0.05);
        } else {
          burst(pac.x, pac.y, COLORS.yellow, 34);
          state = 'dying';
          showMessage('Ouch!', 'A ghost caught you. Get ready...', 'Go');
          setTimeout(() => safe(loseLife, 'loseLife'), 800);
        }
      }
    }
  }
  function updateEffects(dt) {
    particles = particles.filter((p) => {
      p.age += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.985; p.vy *= 0.985;
      return p.age < p.life;
    });
    popups = popups.filter((p) => { p.life--; p.y -= 0.32; return p.life > 0; });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#040614';
    ctx.fillRect(0, 0, W, H);
    drawMaze();
    if (fruit) drawFruit();
    particles.forEach(drawParticle);
    if (pac && state !== 'gameover') pac.draw();
    ghosts.forEach((g) => g.draw());
    popups.forEach(drawPopup);
  }

  function drawMaze() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = maze[y][x];
        const px = x * TILE, py = y * TILE;
        if (t === WALL) {
          const grad = ctx.createLinearGradient(px, py, px + TILE, py + TILE);
          grad.addColorStop(0, COLORS.wallA);
          grad.addColorStop(1, COLORS.wallB);
          ctx.fillStyle = grad;
          ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
          ctx.strokeStyle = COLORS.wallEdge;
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
        } else if (t === DOOR) {
          ctx.fillStyle = '#ff9dff';
          ctx.fillRect(px, py + TILE / 2 - 1.5, TILE, 3);
        } else if (t === PELLET) {
          ctx.fillStyle = COLORS.pellet;
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else if (t === POWER) {
          const pulse = 1 + Math.sin(frame / 8) * 0.22;
          ctx.fillStyle = '#fff0c0';
          ctx.shadowBlur = 8; ctx.shadowColor = '#ffd166';
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 5 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    }
  }

  function drawFruit() {
    const y = fruit.y + Math.sin(frame / 7) * 2;
    ctx.save();
    ctx.translate(fruit.x, y);
    ctx.shadowBlur = 22;
    ctx.shadowColor = fruit.color;

    if (fruit.kind === 'cherry') {
      ctx.fillStyle = '#ff2e5f';
      ctx.beginPath(); ctx.arc(-5, 3, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, 3, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd1dd';
      ctx.beginPath(); ctx.arc(-7, 1, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, 1, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#1aa653';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-5, -2); ctx.quadraticCurveTo(0, -11, 5, -2);
      ctx.stroke();
      ctx.fillStyle = COLORS.fruitLeaf;
      ctx.beginPath();
      ctx.ellipse(2, -9, 3.5, 1.8, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (fruit.kind === 'orange') {
      const grad = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
      grad.addColorStop(0, '#ffcf6e');
      grad.addColorStop(1, '#ff8410');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 1, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath(); ctx.arc(-3, -2, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = COLORS.fruitLeaf;
      ctx.beginPath();
      ctx.ellipse(3, -7, 4, 2, -0.55, 0, Math.PI * 2);
      ctx.fill();
    } else if (fruit.kind === 'bell') {
      const grad = ctx.createLinearGradient(0, -8, 0, 8);
      grad.addColorStop(0, '#fff5a8');
      grad.addColorStop(1, '#ff9b1f');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-7, 5);
      ctx.quadraticCurveTo(-7, -8, 0, -8);
      ctx.quadraticCurveTo(7, -8, 7, 5);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ff7e0a';
      ctx.fillRect(-7, 5, 14, 3);
      ctx.fillStyle = '#ffe45c';
      ctx.beginPath(); ctx.arc(0, 7.5, 1.6, 0, Math.PI * 2); ctx.fill();
    } else if (fruit.kind === 'key') {
      ctx.strokeStyle = '#0bbcff';
      ctx.fillStyle = '#0bbcff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-4, 0, 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(9, 0);
      ctx.moveTo(5, 0); ctx.lineTo(5, 4);
      ctx.moveTo(8, 0); ctx.lineTo(8, 3);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#bff2ff';
      ctx.beginPath(); ctx.arc(-4, 0, 1.6, 0, Math.PI * 2); ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(-2, -2, 1, 0, 1, 8);
      grad.addColorStop(0, '#ff8edd');
      grad.addColorStop(1, '#c41a96');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 1, 8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff3c4';
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * 3.6, 1 + Math.sin(ang) * 3.6, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = COLORS.fruitLeaf;
      ctx.beginPath();
      ctx.moveTo(-6, -5); ctx.lineTo(0, -9); ctx.lineTo(6, -5);
      ctx.quadraticCurveTo(0, -3, -6, -5);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticle(p) {
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  function drawPopup(p) {
    ctx.globalAlpha = Math.min(1, p.life / 22);
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 10; ctx.shadowColor = p.color;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function requestDirection(name) {
    if (!DIRS[name] || !pac) return;
    pac.next = DIRS[name];
    els.hint.textContent = 'Heading ' + name.toUpperCase();
    if (state === 'ready' || state === 'paused') start();
  }
  function setHeld(name, btn) {
    heldDir = name;
    document.querySelectorAll('[data-dir]').forEach((b) => b.classList.toggle('active', b === btn));
    requestDirection(name);
  }
  function clearHeld() {
    heldDir = null;
    document.querySelectorAll('[data-dir]').forEach((b) => b.classList.remove('active'));
  }
  function bindControls() {
    document.addEventListener('keydown', (e) => safe(() => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup'    || k === 'w') requestDirection('up');
      else if (k === 'arrowdown'  || k === 's') requestDirection('down');
      else if (k === 'arrowleft'  || k === 'a') requestDirection('left');
      else if (k === 'arrowright' || k === 'd') requestDirection('right');
      else if (k === 'p' || k === 'escape') pauseToggle();
      else if (k === 'enter' || k === ' ') start();
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    }, 'keydown'));

    document.querySelectorAll('[data-dir]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => safe(() => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        setHeld(btn.dataset.dir, btn);
      }, 'dirDown'), { passive: false });
      btn.addEventListener('pointermove', (e) => safe(() => {
        e.preventDefault();
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-dir]');
        if (el && el.dataset.dir !== heldDir) setHeld(el.dataset.dir, el);
      }, 'dirMove'), { passive: false });
      btn.addEventListener('pointerup', (e) => { e.preventDefault(); clearHeld(); }, { passive: false });
      btn.addEventListener('pointercancel', clearHeld);
      btn.addEventListener('lostpointercapture', clearHeld);
    });

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      swipeStart = { x: e.clientX, y: e.clientY };
      if (state === 'ready') start();
    }, { passive: false });
    canvas.addEventListener('pointermove', (e) => safe(() => {
      if (!swipeStart) return;
      e.preventDefault();
      const dx = e.clientX - swipeStart.x;
      const dy = e.clientY - swipeStart.y;
      if (Math.hypot(dx, dy) < 12) return;
      requestDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      swipeStart = { x: e.clientX, y: e.clientY };
    }, 'swipeMove'), { passive: false });
    canvas.addEventListener('pointerup',   () => { swipeStart = null; });
    canvas.addEventListener('pointercancel', () => { swipeStart = null; });

    els.start.addEventListener('click', () => safe(start, 'startButton'));
    els.go.addEventListener('pointerdown', (e) => { e.preventDefault(); safe(start, 'goButton'); }, { passive: false });
    els.pause.addEventListener('click', () => safe(pauseToggle, 'pauseButton'));
    els.restart.addEventListener('click', () => safe(() => { resetGame(); start(); }, 'restartButton'));
    els.sound.addEventListener('click', () => safe(() => {
      soundOn = !soundOn;
      els.sound.textContent = soundOn ? '🔊' : '🔇';
      els.sound.setAttribute('aria-pressed', String(soundOn));
      if (soundOn) beep(880, 0.08, 'triangle', 0.05);
    }, 'soundButton'));
  }

  function resizeStage() {
    const stage = $('stage');
    const rect = stage.getBoundingClientRect();
    const ratio = W / H;
    let h = Math.max(180, rect.height - 14);
    let w = h * ratio;
    if (w > rect.width - 14) { w = rect.width - 14; h = w / ratio; }
    canvas.style.width  = Math.floor(w) + 'px';
    canvas.style.height = Math.floor(h) + 'px';
  }

  function loop(time) {
    safe(() => {
      const dt = Math.min(0.035, (time - lastTime) / 1000 || 0.016);
      lastTime = time;
      if (heldDir) requestDirection(heldDir);
      update(dt);
      draw();
      updateHud();
      window.__pacmanDebug = {
        state,
        fruit: fruit ? { kind: fruit.kind } : null,
        ghosts: ghosts.map((g) => ({
          name: g.name, tx: g.tx, ty: g.ty,
          x: Math.round(g.x), y: Math.round(g.y),
          dir: g.dir.name, mode: g.mode,
          target: g.targetTile
        }))
      };
    }, 'loop');
    requestAnimationFrame(loop);
  }

  function init() {
    bindControls();
    resetGame();
    resizeStage();
    window.addEventListener('resize', resizeStage);
    window.addEventListener('orientationchange', () => setTimeout(resizeStage, 120));
    els.high.textContent = high;
    requestAnimationFrame(loop);
  }

  safe(init, 'init');
})();
