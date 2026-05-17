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

  const WALL = 1, PELLET = 2, POWER = 3, DOOR = 4, EMPTY = 0;
  const DIR = {
    up: { x: 0, y: -1, name: 'up' },
    down: { x: 0, y: 1, name: 'down' },
    left: { x: -1, y: 0, name: 'left' },
    right: { x: 1, y: 0, name: 'right' },
    none: { x: 0, y: 0, name: 'none' }
  };
  const DIR_LIST = [DIR.up, DIR.left, DIR.down, DIR.right];
  const COLORS = { yellow:'#ffd84d', blue:'#2424ff', wall:'#2528df', wallEdge:'#6972ff', pellet:'#ffe7c4', cyan:'#37f8ff', pink:'#ff4de3', red:'#ff4d5d', orange:'#ffad42' };

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const els = {
    score: $('score'), high: $('high'), lives: $('lives'), level: $('level'), mode: $('mode'), pellets: $('pellets'),
    message: $('message'), messageTitle: $('messageTitle'), messageText: $('messageText'), start: $('startBtn'),
    pause: $('pauseBtn'), sound: $('soundBtn'), go: $('goBtn'), restart: $('restartBtn'), hint: $('hint')
  };

  const HIGH_KEY = 'ccode-pacman-high-v2';
  let high = Number(localStorage.getItem(HIGH_KEY) || 0);
  let maze = [];
  let pellets = 0;
  let totalPellets = 0;
  let score = 0;
  let lives = 3;
  let level = 1;
  let state = 'ready';
  let pac = null;
  let ghosts = [];
  let fruit = null;
  let particles = [];
  let popups = [];
  let mode = 'chase';
  let modeTime = 0;
  let powerTime = 0;
  let ghostCombo = 0;
  let lastTime = 0;
  let frame = 0;
  let heldDir = null;
  let swipeStart = null;
  let audioCtx = null;
  let soundOn = true;
  let lastErrorText = '';

  function safe(fn, label) {
    try { return fn(); }
    catch (err) {
      console.error(label + ':', err.message, err.stack || '');
      lastErrorText = err.message || 'Unknown error';
      showMessage('Error', lastErrorText, 'Restart');
      state = 'paused';
    }
  }

  window.addEventListener('error', (event) => {
    console.error('Runtime error:', event.message, event.error?.stack || '');
    lastErrorText = event.message || 'Game error';
    showMessage('Error', lastErrorText, 'Restart');
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive:false });

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

  function tileAt(tx, ty) {
    if (ty < 0 || ty >= ROWS) return WALL;
    if (tx < 0 || tx >= COLS) return EMPTY;
    return maze[ty][tx];
  }
  function blocked(tx, ty, canUseDoor = false) {
    const t = tileAt(tx, ty);
    return t === WALL || (t === DOOR && !canUseDoor);
  }
  function centerOf(t) { return t * TILE + TILE / 2; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dist2(a, b) { return (a.tx - b.x) ** 2 + (a.ty - b.y) ** 2; }

  class Actor {
    constructor(tx, ty, color) {
      this.tx = tx; this.ty = ty;
      this.x = centerOf(tx); this.y = centerOf(ty);
      this.dir = DIR.none; this.next = DIR.none;
      this.color = color; this.speed = 90;
    }
    snap() { this.x = centerOf(this.tx); this.y = centerOf(this.ty); }
    centered(slack = 2.2) { return Math.abs(this.x - centerOf(this.tx)) <= slack && Math.abs(this.y - centerOf(this.ty)) <= slack; }
    canMove(d, door = false) { return !blocked(this.tx + d.x, this.ty + d.y, door); }
    step(dt, door = false) {
      if (this.dir === DIR.none) return;
      const distance = this.speed * dt;
      let nx = this.x + this.dir.x * distance;
      let ny = this.y + this.dir.y * distance;
      if (nx < -TILE / 2) nx = W + TILE / 2;
      if (nx > W + TILE / 2) nx = -TILE / 2;
      const ntx = Math.floor(clamp(nx, 0, W - 1) / TILE);
      const nty = Math.floor(clamp(ny, 0, H - 1) / TILE);
      if (blocked(ntx, nty, door)) { this.snap(); return; }
      this.x = nx; this.y = ny;
      this.tx = Math.floor(clamp(this.x, 0, W - 1) / TILE);
      this.ty = Math.floor(clamp(this.y, 0, H - 1) / TILE);
    }
  }

  class Pac extends Actor {
    constructor() {
      super(13, 23, COLORS.yellow);
      this.dir = DIR.left;
      this.next = DIR.left;
      this.speed = 94 + Math.min(24, level * 3);
      this.mouth = 0;
      this.dead = false;
    }
    update(dt) {
      this.mouth += dt * 9;
      const next = this.next;
      if (next !== DIR.none) {
        const cx = centerOf(this.tx), cy = centerOf(this.ty);
        const reversing = this.dir !== DIR.none && next.x === -this.dir.x && next.y === -this.dir.y;
        if (reversing && this.canMove(next)) this.dir = next;
        else if (next.y !== 0 && Math.abs(this.x - cx) <= TILE * 0.45 && !blocked(this.tx, this.ty + next.y)) { this.x = cx; this.dir = next; }
        else if (next.x !== 0 && Math.abs(this.y - cy) <= TILE * 0.45 && !blocked(this.tx + next.x, this.ty)) { this.y = cy; this.dir = next; }
      }
      this.step(dt);
      this.eat();
    }
    eat() {
      const t = tileAt(this.tx, this.ty);
      if (t === PELLET || t === POWER) {
        maze[this.ty][this.tx] = EMPTY;
        pellets--;
        addScore(t === POWER ? 50 : 10, this.x, this.y, t === POWER ? '+50' : '+10');
        if (t === POWER) {
          powerTime = 7.5;
          ghostCombo = 0;
          ghosts.forEach((g) => g.frighten());
          burst(this.x, this.y, COLORS.cyan, 22);
          beep(280, 0.10, 'sawtooth');
        } else beep(760, 0.025, 'square', 0.02);
        maybeFruit();
      }
      if (fruit && Math.hypot(fruit.x - this.x, fruit.y - this.y) < TILE * 0.85) {
        addScore(fruit.points, fruit.x, fruit.y, '+' + fruit.points);
        burst(fruit.x, fruit.y, fruit.color, 28);
        beep(980, .12, 'triangle', .05);
        fruit = null;
      }
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      let rot = 0;
      if (this.dir === DIR.left) rot = Math.PI;
      if (this.dir === DIR.up) rot = -Math.PI / 2;
      if (this.dir === DIR.down) rot = Math.PI / 2;
      ctx.rotate(rot);
      const r = TILE * 0.48;
      const open = 0.08 + Math.abs(Math.sin(this.mouth)) * 0.28;
      ctx.fillStyle = COLORS.yellow;
      ctx.shadowBlur = 10; ctx.shadowColor = COLORS.yellow;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, open * Math.PI, (2 - open) * Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  class Ghost extends Actor {
    constructor(name, tx, ty, color, scatter) {
      super(tx, ty, color);
      this.name = name;
      this.home = { tx, ty };
      this.scatter = scatter;
      this.baseColor = color;
      this.mode = name === 'blinky' ? 'chase' : 'house';
      this.release = { blinky: 0, pinky: 1.8, inky: 4.3, clyde: 6.6 }[name] || 0;
      this.houseTime = 0;
      this.speed = 76;
      this.dir = name === 'blinky' ? DIR.left : DIR.up;
    }
    frighten() {
      if (this.mode === 'eaten' || this.mode === 'house') return;
      this.mode = 'fright';
      this.dir = opposite(this.dir);
    }
    getTarget() {
      if (this.mode === 'eaten') return { x: 13, y: 14 };
      if (this.mode === 'fright') return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (mode === 'scatter') return this.scatter;
      const p = { x: pac.tx, y: pac.ty };
      if (this.name === 'blinky') return p;
      if (this.name === 'pinky') return { x: p.x + pac.dir.x * 4, y: p.y + pac.dir.y * 4 };
      if (this.name === 'inky') {
        const b = ghosts[0];
        const ahead = { x: p.x + pac.dir.x * 2, y: p.y + pac.dir.y * 2 };
        return { x: ahead.x + (ahead.x - b.tx), y: ahead.y + (ahead.y - b.ty) };
      }
      return Math.hypot(p.x - this.tx, p.y - this.ty) > 8 ? p : this.scatter;
    }
    choose() {
      const target = this.getTarget();
      let best = null, bestD = Infinity;
      const rev = opposite(this.dir);
      for (const d of DIR_LIST) {
        if (d.x === rev.x && d.y === rev.y && this.mode !== 'fright') continue;
        const nx = this.tx + d.x, ny = this.ty + d.y;
        if (blocked(nx, ny, this.mode === 'eaten')) continue;
        const fake = { tx: nx, ty: ny };
        const dd = dist2(fake, target);
        if (dd < bestD) { bestD = dd; best = d; }
      }
      if (best) this.dir = best;
    }
    update(dt) {
      if (this.mode === 'house') {
        this.houseTime += dt;
        this.y += Math.sin(this.houseTime * 5) * 0.18;
        if (this.houseTime >= this.release) {
          this.mode = 'chase'; this.tx = 13; this.ty = 11; this.x = centerOf(13); this.y = centerOf(11); this.dir = DIR.left;
        }
        return;
      }
      this.speed = this.mode === 'fright' ? 56 : this.mode === 'eaten' ? 132 : 76 + Math.min(24, level * 3);
      if (this.centered(2.4)) { this.snap(); this.choose(); }
      this.step(dt, this.mode === 'eaten');
      if (this.mode === 'eaten' && this.tx === 13 && this.ty === 14) {
        this.mode = 'house'; this.houseTime = Math.max(0, this.release - 1); this.tx = this.home.tx; this.ty = this.home.ty; this.snap(); this.dir = DIR.up;
      }
    }
    draw() {
      const frightened = this.mode === 'fright';
      const eaten = this.mode === 'eaten';
      const r = TILE * 0.46;
      ctx.save();
      ctx.translate(this.x, this.y);
      if (!eaten) {
        ctx.fillStyle = frightened ? (powerTime < 2 && Math.floor(frame / 8) % 2 ? '#fff' : '#2732ff') : this.baseColor;
        ctx.shadowBlur = frightened ? 12 : 8; ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(0, -1, r, Math.PI, 0);
        ctx.lineTo(r, r);
        for (let i = 0; i < 3; i++) { ctx.lineTo(r - (i * 2 + 1) * r / 3, r - 4); ctx.lineTo(r - (i * 2 + 2) * r / 3, r); }
        ctx.closePath(); ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-4, -2, 3, 0, Math.PI * 2); ctx.arc(4, -2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = frightened ? '#ff3333' : '#061069';
      ctx.beginPath(); ctx.arc(-4 + this.dir.x * 1.5, -2 + this.dir.y * 1.5, 1.5, 0, Math.PI * 2); ctx.arc(4 + this.dir.x * 1.5, -2 + this.dir.y * 1.5, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function opposite(d) {
    if (d === DIR.up) return DIR.down;
    if (d === DIR.down) return DIR.up;
    if (d === DIR.left) return DIR.right;
    if (d === DIR.right) return DIR.left;
    return DIR.none;
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

  function addScore(n, x, y, label) {
    score += n;
    if (score > high) { high = score; localStorage.setItem(HIGH_KEY, String(high)); }
    if (label) popups.push({ text: label, x, y, life: 52, color: n >= 100 ? COLORS.cyan : COLORS.yellow });
    updateHud();
  }
  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 24 + Math.random() * 55;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .48 + Math.random() * .25, age: 0, color, r: 1.5 + Math.random() * 2.2 });
    }
  }

  function spawnActors() {
    pac = new Pac();
    ghosts = [
      new Ghost('blinky', 13, 11, COLORS.red, { x: 25, y: 0 }),
      new Ghost('pinky', 13, 14, '#ff9dff', { x: 2, y: 0 }),
      new Ghost('inky', 12, 14, COLORS.cyan, { x: 27, y: 30 }),
      new Ghost('clyde', 14, 14, COLORS.orange, { x: 0, y: 30 })
    ];
  }

  function resetGame() {
    score = 0; lives = 3; level = 1; mode = 'chase'; modeTime = 0; powerTime = 0; ghostCombo = 0; fruit = null; particles = []; popups = [];
    buildMaze(); spawnActors(); setReady('Ready?', 'Eat every pellet. Power pellets make ghosts vulnerable.'); updateHud();
  }
  function setReady(title, text) { state = 'ready'; showMessage(title, text, 'Go'); }
  function nextLevel() { level++; mode = 'chase'; modeTime = 0; powerTime = 0; fruit = null; buildMaze(); spawnActors(); setReady('Level ' + level, 'Faster ghosts, same instant controls.'); updateHud(); }
  function loseLife() {
    lives--; updateHud();
    if (lives <= 0) { state = 'gameover'; showMessage('Game Over', 'Final score: ' + score + '. Try another run.', 'Restart'); beep(150, .18, 'sawtooth', .05); }
    else { spawnActors(); setReady('Ready?', lives + ' lives left. Hold a direction before corners.'); }
  }
  function start() {
    if (audioCtx?.state === 'suspended') audioCtx.resume();
    if (state === 'gameover') resetGame();
    if (state === 'paused') { state = 'playing'; hideMessage(); updateHud(); return; }
    if (state === 'ready') { state = 'playing'; hideMessage(); beep(760, .08, 'square', .045); updateHud(); }
  }
  function pauseToggle() {
    if (state === 'playing') { state = 'paused'; showMessage('Paused', 'Tap Go or Resume to continue.', 'Resume'); }
    else if (state === 'paused') start();
    updateHud();
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
    const label = state === 'playing' ? (powerTime > 0 ? 'Power' : mode) : state;
    els.mode.textContent = label.charAt(0).toUpperCase() + label.slice(1);
    els.pellets.textContent = 'Pellets: ' + pellets;
    els.pause.textContent = state === 'paused' ? 'Resume' : 'Pause';
  }

  function maybeFruit() {
    const eaten = totalPellets - pellets;
    if (fruit) return;
    if (eaten === Math.floor(totalPellets * .35) || eaten === Math.floor(totalPellets * .70)) {
      const fruitData = [ ['🍒', 100, '#ff476f'], ['🍓', 300, '#ff4de3'], ['🍊', 500, '#ffad42'], ['🔔', 700, '#ffd84d'], ['🔑', 1000, '#37f8ff'] ][Math.min(level - 1, 4)];
      fruit = { emoji: fruitData[0], points: fruitData[1], color: fruitData[2], x: centerOf(13), y: centerOf(17), time: 8.5 };
      popups.push({ text: 'BONUS', x: fruit.x, y: fruit.y - 10, life: 70, color: fruit.color });
    }
  }

  function update(dt) {
    if (state !== 'playing') return;
    frame++;
    modeTime += dt;
    if (mode === 'scatter' && modeTime > 7) { mode = 'chase'; modeTime = 0; }
    if (mode === 'chase' && modeTime > 20) { mode = 'scatter'; modeTime = 0; }
    if (powerTime > 0) {
      powerTime -= dt;
      if (powerTime <= 0) ghosts.forEach((g) => { if (g.mode === 'fright') g.mode = mode; });
    } else ghostCombo = 0;
    pac.update(dt);
    ghosts.forEach((g) => g.update(dt));
    checkCollisions();
    updateEffects(dt);
    if (fruit) { fruit.time -= dt; if (fruit.time <= 0) fruit = null; }
    if (pellets <= 0) { beep(980, .14, 'triangle', .06); state = 'levelclear'; showMessage('Level Clear!', 'Great run. Next maze is faster.', 'Next'); setTimeout(() => safe(nextLevel, 'nextLevel'), 850); }
  }

  function checkCollisions() {
    for (const g of ghosts) {
      if (g.mode === 'house' || g.mode === 'eaten') continue;
      if (Math.hypot(g.x - pac.x, g.y - pac.y) < TILE * .70) {
        if (g.mode === 'fright') {
          ghostCombo++;
          const pts = 200 * Math.pow(2, ghostCombo - 1);
          addScore(pts, g.x, g.y, '+' + pts);
          burst(g.x, g.y, COLORS.cyan, 25);
          g.mode = 'eaten';
          beep(520 + ghostCombo * 140, .1, 'square', .05);
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
    particles = particles.filter((p) => { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .985; p.vy *= .985; return p.age < p.life; });
    popups = popups.filter((p) => { p.life--; p.y -= .32; return p.life > 0; });
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
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
          grad.addColorStop(0, '#3138ff'); grad.addColorStop(1, '#1517a8');
          ctx.fillStyle = grad; ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
          ctx.strokeStyle = COLORS.wallEdge; ctx.lineWidth = 1; ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
        } else if (t === DOOR) {
          ctx.fillStyle = '#ff9dff'; ctx.fillRect(px, py + TILE / 2 - 1.4, TILE, 2.8);
        } else if (t === PELLET) {
          ctx.fillStyle = COLORS.pellet; ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2, 2.1, 0, Math.PI * 2); ctx.fill();
        } else if (t === POWER) {
          const pulse = 1 + Math.sin(frame / 8) * .22;
          ctx.fillStyle = '#ffd0bd'; ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2, 5 * pulse, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
  function drawFruit() {
    ctx.save(); ctx.font = '18px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowBlur = 12; ctx.shadowColor = fruit.color; ctx.fillText(fruit.emoji, fruit.x, fruit.y + Math.sin(frame / 7) * 2); ctx.restore();
  }
  function drawParticle(p) {
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function drawPopup(p) {
    ctx.globalAlpha = Math.min(1, p.life / 22);
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 8; ctx.shadowColor = p.color;
    ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillText(p.text, p.x, p.y);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  function requestDirection(name) {
    if (!DIR[name] || !pac) return;
    pac.next = DIR[name];
    els.hint.textContent = 'Queued: ' + name.toUpperCase();
    if (state === 'ready') start();
    if (state === 'paused') start();
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
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();
    }, 'keydown'));

    document.querySelectorAll('[data-dir]').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => safe(() => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); setHeld(btn.dataset.dir, btn); }, 'dirDown'), { passive:false });
      btn.addEventListener('pointermove', (e) => safe(() => { e.preventDefault(); const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-dir]'); if (el && el.dataset.dir !== heldDir) setHeld(el.dataset.dir, el); }, 'dirMove'), { passive:false });
      btn.addEventListener('pointerup', (e) => { e.preventDefault(); clearHeld(); }, { passive:false });
      btn.addEventListener('pointercancel', clearHeld);
      btn.addEventListener('lostpointercapture', clearHeld);
    });

    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); swipeStart = { x: e.clientX, y: e.clientY }; }, { passive:false });
    canvas.addEventListener('pointermove', (e) => safe(() => {
      if (!swipeStart) return;
      e.preventDefault();
      const dx = e.clientX - swipeStart.x;
      const dy = e.clientY - swipeStart.y;
      if (Math.hypot(dx, dy) < 12) return;
      requestDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      swipeStart = { x: e.clientX, y: e.clientY };
    }, 'swipeMove'), { passive:false });
    canvas.addEventListener('pointerup', () => { swipeStart = null; });
    canvas.addEventListener('pointercancel', () => { swipeStart = null; });

    els.start.addEventListener('click', () => safe(start, 'startButton'));
    els.go.addEventListener('pointerdown', (e) => { e.preventDefault(); safe(start, 'goButton'); }, { passive:false });
    els.pause.addEventListener('click', () => safe(pauseToggle, 'pauseButton'));
    els.restart.addEventListener('click', () => safe(() => { resetGame(); start(); }, 'restartButton'));
    els.sound.addEventListener('click', () => safe(() => {
      soundOn = !soundOn;
      els.sound.textContent = soundOn ? 'Sound On' : 'Sound Off';
      els.sound.setAttribute('aria-pressed', String(soundOn));
      if (soundOn) beep(880, .08, 'triangle', .05);
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
