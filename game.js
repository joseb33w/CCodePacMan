(() => {
  'use strict';

  const TILE = 16;
  const COLS = 28;
  const ROWS = 31;
  const W = COLS * TILE;
  const H = ROWS * TILE;
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
    '######.## #      # ##.######',
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

  const WALL = 1;
  const PELLET = 2;
  const POWER = 3;
  const DOOR = 4;
  const EMPTY = 0;
  const HIGH_KEY = 'ccode-pacman-high-v3';
  const COLORS = {
    yellow: '#ffd84d', wallA: '#333cff', wallB: '#1517a8', wallEdge: '#7881ff',
    pellet: '#ffe7c4', cyan: '#37f8ff', pink: '#ff4de3', red: '#ff4d5d', orange: '#ffad42'
  };
  const DIRS = {
    up: { x: 0, y: -1, name: 'up' },
    down: { x: 0, y: 1, name: 'down' },
    left: { x: -1, y: 0, name: 'left' },
    right: { x: 1, y: 0, name: 'right' },
    none: { x: 0, y: 0, name: 'none' }
  };
  const ORDER = [DIRS.up, DIRS.left, DIRS.down, DIRS.right];

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const els = {
    score: $('score'), high: $('high'), lives: $('lives'), level: $('level'), mode: $('mode'), pellets: $('pellets'),
    message: $('message'), messageTitle: $('messageTitle'), messageText: $('messageText'), start: $('startBtn'),
    pause: $('pauseBtn'), sound: $('soundBtn'), go: $('goBtn'), restart: $('restartBtn'), hint: $('hint')
  };

  let maze = [];
  let pellets = 0;
  let totalPellets = 0;
  let score = 0;
  let high = Number(localStorage.getItem(HIGH_KEY) || 0);
  let lives = 3;
  let level = 1;
  let state = 'ready';
  let pac;
  let ghosts = [];
  let mode = 'chase';
  let modeTimer = 0;
  let powerTimer = 0;
  let ghostCombo = 0;
  let fruit = null;
  let particles = [];
  let popups = [];
  let lastTime = 0;
  let frame = 0;
  let heldDir = null;
  let swipeStart = null;
  let audioCtx = null;
  let soundOn = true;

  function safe(fn, label) {
    try { return fn(); }
    catch (err) {
      console.error(label + ':', err.message, err.stack || '');
      showMessage('Error', err.message || 'Something went wrong.', 'Restart');
      state = 'paused';
    }
  }

  window.addEventListener('error', (event) => {
    console.error('Runtime error:', event.message, event.error?.stack || '');
    showMessage('Error', event.message || 'Game error', 'Restart');
    state = 'paused';
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

  function center(t) { return t * TILE + TILE / 2; }
  function tile(px) { return Math.floor(px / TILE); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function opposite(d) {
    if (d === DIRS.up) return DIRS.down;
    if (d === DIRS.down) return DIRS.up;
    if (d === DIRS.left) return DIRS.right;
    if (d === DIRS.right) return DIRS.left;
    return DIRS.none;
  }
  function tileAt(tx, ty) {
    if (ty < 0 || ty >= ROWS) return WALL;
    if (tx < 0 || tx >= COLS) return EMPTY;
    return maze[ty][tx];
  }
  function blocked(tx, ty, doorOk = false) {
    const t = tileAt(tx, ty);
    return t === WALL || (t === DOOR && !doorOk);
  }
  function canMoveFrom(tx, ty, d, doorOk = false) { return !blocked(tx + d.x, ty + d.y, doorOk); }
  function distSq(tx, ty, target) { return (tx - target.x) ** 2 + (ty - target.y) ** 2; }

  function buildMaze() {
    maze = [];
    pellets = 0;
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

  class Actor {
    constructor(tx, ty, color) {
      this.x = center(tx);
      this.y = center(ty);
      this.tx = tx;
      this.ty = ty;
      this.dir = DIRS.none;
      this.next = DIRS.none;
      this.color = color;
      this.speed = 90;
      this.stuckTimer = 0;
      this.lastX = this.x;
      this.lastY = this.y;
    }
    syncTile() {
      this.tx = tile(clamp(this.x, 0, W - 1));
      this.ty = tile(clamp(this.y, 0, H - 1));
    }
    snap() {
      this.syncTile();
      this.x = center(this.tx);
      this.y = center(this.ty);
    }
    atCenter(slack = 2.6) {
      this.syncTile();
      return Math.abs(this.x - center(this.tx)) <= slack && Math.abs(this.y - center(this.ty)) <= slack;
    }
    canMove(d, doorOk = false) {
      this.syncTile();
      return canMoveFrom(this.tx, this.ty, d, doorOk);
    }
    move(dt, doorOk = false) {
      if (this.dir === DIRS.none) return;
      let nx = this.x + this.dir.x * this.speed * dt;
      let ny = this.y + this.dir.y * this.speed * dt;
      if (nx < -TILE / 2) nx = W + TILE / 2;
      if (nx > W + TILE / 2) nx = -TILE / 2;

      const tx = tile(clamp(nx, 0, W - 1));
      const ty = tile(clamp(ny, 0, H - 1));
      if (blocked(tx, ty, doorOk)) {
        this.snap();
        return;
      }
      this.x = nx;
      this.y = ny;
      this.syncTile();
    }
  }

  class Pac extends Actor {
    constructor() {
      super(13, 23, COLORS.yellow);
      this.dir = DIRS.left;
      this.next = DIRS.left;
      this.speed = 98 + Math.min(26, level * 3);
      this.mouth = 0;
    }
    update(dt) {
      this.mouth += dt * 10;
      const next = this.next;
      if (next !== DIRS.none) {
        const cx = center(this.tx);
        const cy = center(this.ty);
        const reverse = this.dir !== DIRS.none && next.x === -this.dir.x && next.y === -this.dir.y;
        if (reverse && this.canMove(next)) this.dir = next;
        else if (next.x && Math.abs(this.y - cy) <= TILE * 0.48 && canMoveFrom(this.tx, this.ty, next)) {
          this.y = cy; this.dir = next;
        } else if (next.y && Math.abs(this.x - cx) <= TILE * 0.48 && canMoveFrom(this.tx, this.ty, next)) {
          this.x = cx; this.dir = next;
        }
      }
      this.move(dt);
      this.eat();
    }
    eat() {
      const t = tileAt(this.tx, this.ty);
      if (t === PELLET || t === POWER) {
        maze[this.ty][this.tx] = EMPTY;
        pellets--;
        if (t === POWER) {
          addScore(50, this.x, this.y, '+50');
          powerTimer = 7.5;
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
      if (fruit && Math.hypot(fruit.x - this.x, fruit.y - this.y) < TILE * 0.85) {
        addScore(fruit.points, fruit.x, fruit.y, '+' + fruit.points);
        burst(fruit.x, fruit.y, fruit.color, 30);
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
      const open = 0.08 + Math.abs(Math.sin(this.mouth)) * 0.28;
      ctx.fillStyle = COLORS.yellow;
      ctx.shadowBlur = 12;
      ctx.shadowColor = COLORS.yellow;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, open * Math.PI, (2 - open) * Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  class Ghost extends Actor {
    constructor(name, tx, ty, color, scatter, startDir) {
      super(tx, ty, color);
      this.name = name;
      this.baseColor = color;
      this.scatter = scatter;
      this.home = { x: tx, y: ty };
      this.mode = 'chase';
      this.dir = startDir;
      this.speed = 80;
      this.releasePulse = Math.random() * Math.PI * 2;
    }
    frighten() {
      if (this.mode === 'eaten') return;
      this.mode = 'fright';
      this.dir = opposite(this.dir);
    }
    target() {
      if (this.mode === 'eaten') return { x: 13, y: 11 };
      if (this.mode === 'fright') return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (mode === 'scatter') return this.scatter;
      if (this.name === 'blinky') return { x: pac.tx, y: pac.ty };
      if (this.name === 'pinky') return { x: pac.tx + pac.dir.x * 4, y: pac.ty + pac.dir.y * 4 };
      if (this.name === 'inky') {
        const b = ghosts[0] || pac;
        const ahead = { x: pac.tx + pac.dir.x * 2, y: pac.ty + pac.dir.y * 2 };
        return { x: ahead.x + (ahead.x - b.tx), y: ahead.y + (ahead.y - b.ty) };
      }
      return Math.hypot(pac.tx - this.tx, pac.ty - this.ty) > 8 ? { x: pac.tx, y: pac.ty } : this.scatter;
    }
    choose(forceReverse = false) {
      const target = this.target();
      const reverse = opposite(this.dir);
      const options = [];
      for (const d of ORDER) {
        if (!forceReverse && this.mode !== 'fright' && d === reverse) continue;
        if (this.canMove(d, this.mode === 'eaten')) options.push(d);
      }
      const usable = options.length ? options : ORDER.filter((d) => this.canMove(d, this.mode === 'eaten'));
      if (!usable.length) { this.dir = reverse; return; }
      if (this.mode === 'fright' && Math.random() < 0.35) {
        this.dir = usable[Math.floor(Math.random() * usable.length)];
        return;
      }
      let best = usable[0];
      let bestD = Infinity;
      for (const d of usable) {
        const dd = distSq(this.tx + d.x, this.ty + d.y, target);
        if (dd < bestD) { bestD = dd; best = d; }
      }
      this.dir = best;
    }
    update(dt) {
      this.speed = this.mode === 'fright' ? 58 : this.mode === 'eaten' ? 140 : 82 + Math.min(28, level * 3);

      if (this.atCenter(2.8)) {
        this.snap();
        this.choose(false);
      }
      const beforeX = this.x;
      const beforeY = this.y;
      this.move(dt, this.mode === 'eaten');

      const moved = Math.hypot(this.x - beforeX, this.y - beforeY);
      if (moved < 0.04) this.stuckTimer += dt;
      else this.stuckTimer = 0;

      if (this.stuckTimer > 0.16) {
        this.snap();
        this.choose(true);
        this.move(dt * 2.5, this.mode === 'eaten');
        this.stuckTimer = 0;
      }

      if (this.mode === 'eaten' && this.tx === 13 && this.ty === 11) {
        this.mode = 'chase';
        this.dir = DIRS.left;
      }
    }
    draw() {
      const frightened = this.mode === 'fright';
      const eaten = this.mode === 'eaten';
      const bob = Math.sin(frame * 0.18 + this.releasePulse) * 1.2;
      ctx.save();
      ctx.translate(this.x, this.y + bob);
      if (!eaten) {
        ctx.fillStyle = frightened ? (powerTimer < 2 && Math.floor(frame / 8) % 2 ? '#fff' : '#2732ff') : this.baseColor;
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle;
        const r = TILE * 0.46;
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
      ctx.arc(-4, -2, 3, 0, Math.PI * 2);
      ctx.arc(4, -2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = frightened ? '#ff3333' : '#061069';
      ctx.beginPath();
      ctx.arc(-4 + this.dir.x * 1.4, -2 + this.dir.y * 1.4, 1.5, 0, Math.PI * 2);
      ctx.arc(4 + this.dir.x * 1.4, -2 + this.dir.y * 1.4, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function spawnActors() {
    pac = new Pac();
    ghosts = [
      new Ghost('blinky', 13, 11, COLORS.red, { x: 25, y: 0 }, DIRS.left),
      new Ghost('pinky', 14, 11, '#ff9dff', { x: 2, y: 0 }, DIRS.right),
      new Ghost('inky', 12, 11, COLORS.cyan, { x: 27, y: 30 }, DIRS.left),
      new Ghost('clyde', 15, 11, COLORS.orange, { x: 0, y: 30 }, DIRS.right)
    ];
  }

  function resetGame() {
    score = 0;
    lives = 3;
    level = 1;
    mode = 'chase';
    modeTimer = 0;
    powerTimer = 0;
    ghostCombo = 0;
    fruit = null;
    particles = [];
    popups = [];
    buildMaze();
    spawnActors();
    setReady('Ready?', 'Eat every pellet. Ghosts now move immediately when gameplay starts.');
    updateHud();
  }
  function nextLevel() {
    level++;
    mode = 'chase';
    modeTimer = 0;
    powerTimer = 0;
    fruit = null;
    buildMaze();
    spawnActors();
    setReady('Level ' + level, 'The ghosts are faster. Hold a direction before turns.');
    updateHud();
  }
  function setReady(title, text) { state = 'ready'; showMessage(title, text, 'Go'); }
  function start() {
    if (audioCtx?.state === 'suspended') audioCtx.resume();
    if (state === 'gameover') resetGame();
    if (state === 'ready' || state === 'paused') {
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
    lives--;
    updateHud();
    if (lives <= 0) {
      state = 'gameover';
      showMessage('Game Over', 'Final score: ' + score + '. Try another run.', 'Restart');
      beep(150, 0.18, 'sawtooth', 0.05);
    } else {
      spawnActors();
      setReady('Ready?', lives + ' lives left. The ghosts will move as soon as you press Go.');
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
    if (score > high) {
      high = score;
      localStorage.setItem(HIGH_KEY, String(high));
    }
    if (label) popups.push({ text: label, x, y, life: 52, color: points >= 100 ? COLORS.cyan : COLORS.yellow });
    updateHud();
  }
  function maybeFruit() {
    if (fruit) return;
    const eaten = totalPellets - pellets;
    if (eaten === Math.floor(totalPellets * 0.35) || eaten === Math.floor(totalPellets * 0.70)) {
      const data = [ ['🍒', 100, '#ff476f'], ['🍓', 300, '#ff4de3'], ['🍊', 500, '#ffad42'], ['🔔', 700, '#ffd84d'], ['🔑', 1000, '#37f8ff'] ][Math.min(level - 1, 4)];
      fruit = { emoji: data[0], points: data[1], color: data[2], x: center(13), y: center(17), time: 8.5 };
      popups.push({ text: 'BONUS', x: fruit.x, y: fruit.y - 10, life: 70, color: fruit.color });
    }
  }
  function burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 25 + Math.random() * 58;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, age: 0, life: 0.45 + Math.random() * 0.28, r: 1.3 + Math.random() * 2.4, color });
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
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(gainValue, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (err) { console.warn('Audio:', err.message); }
  }

  function update(dt) {
    frame++;

    // In the ready overlay, let ghosts patrol behind the translucent panel so they never look frozen.
    if (state === 'ready') {
      ghosts.forEach((g) => g.update(dt * 0.5));
      updateEffects(dt);
      return;
    }
    if (state !== 'playing') {
      updateEffects(dt);
      return;
    }

    modeTimer += dt;
    if (mode === 'scatter' && modeTimer > 7) { mode = 'chase'; modeTimer = 0; }
    if (mode === 'chase' && modeTimer > 20) { mode = 'scatter'; modeTimer = 0; }

    if (powerTimer > 0) {
      powerTimer -= dt;
      if (powerTimer <= 0) ghosts.forEach((g) => { if (g.mode === 'fright') g.mode = 'chase'; });
    } else {
      ghostCombo = 0;
    }

    pac.update(dt);
    ghosts.forEach((g) => g.update(dt));
    checkCollisions();
    updateEffects(dt);

    if (fruit) {
      fruit.time -= dt;
      if (fruit.time <= 0) fruit = null;
    }
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
          g.dir = DIRS.up;
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
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
      return p.age < p.life;
    });
    popups = popups.filter((p) => { p.life--; p.y -= 0.32; return p.life > 0; });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
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
        const px = x * TILE;
        const py = y * TILE;
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
          ctx.fillRect(px, py + TILE / 2 - 1.4, TILE, 2.8);
        } else if (t === PELLET) {
          ctx.fillStyle = COLORS.pellet;
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 2.1, 0, Math.PI * 2);
          ctx.fill();
        } else if (t === POWER) {
          const pulse = 1 + Math.sin(frame / 8) * 0.22;
          ctx.fillStyle = '#ffd0bd';
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 5 * pulse, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  function drawFruit() {
    ctx.save();
    ctx.font = '18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 12;
    ctx.shadowColor = fruit.color;
    ctx.fillText(fruit.emoji, fruit.x, fruit.y + Math.sin(frame / 7) * 2);
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
    ctx.shadowBlur = 8;
    ctx.shadowColor = p.color;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.text, p.x, p.y);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function requestDirection(name) {
    if (!DIRS[name] || !pac) return;
    pac.next = DIRS[name];
    els.hint.textContent = 'Queued: ' + name.toUpperCase();
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
      if (k === 'arrowup' || k === 'w') requestDirection('up');
      else if (k === 'arrowdown' || k === 's') requestDirection('down');
      else if (k === 'arrowleft' || k === 'a') requestDirection('left');
      else if (k === 'arrowright' || k === 'd') requestDirection('right');
      else if (k === 'p' || k === 'escape') pauseToggle();
      else if (k === 'enter' || k === ' ') start();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
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
    canvas.addEventListener('pointerup', () => { swipeStart = null; });
    canvas.addEventListener('pointercancel', () => { swipeStart = null; });

    els.start.addEventListener('click', () => safe(start, 'startButton'));
    els.go.addEventListener('pointerdown', (e) => { e.preventDefault(); safe(start, 'goButton'); }, { passive: false });
    els.pause.addEventListener('click', () => safe(pauseToggle, 'pauseButton'));
    els.restart.addEventListener('click', () => safe(() => { resetGame(); start(); }, 'restartButton'));
    els.sound.addEventListener('click', () => safe(() => {
      soundOn = !soundOn;
      els.sound.textContent = soundOn ? 'Sound On' : 'Sound Off';
      els.sound.setAttribute('aria-pressed', String(soundOn));
      if (soundOn) beep(880, 0.08, 'triangle', 0.05);
    }, 'soundButton'));
  }

  function resizeStage() {
    const stage = $('stage');
    const rect = stage.getBoundingClientRect();
    const ratio = W / H;
    let h = Math.max(180, rect.height - 12);
    let w = h * ratio;
    if (w > rect.width - 12) { w = rect.width - 12; h = w / ratio; }
    canvas.style.width = Math.floor(w) + 'px';
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
        pac: pac ? { x: pac.x, y: pac.y, tx: pac.tx, ty: pac.ty } : null,
        ghosts: ghosts.map((g) => ({ name: g.name, x: Math.round(g.x), y: Math.round(g.y), tx: g.tx, ty: g.ty, mode: g.mode }))
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
