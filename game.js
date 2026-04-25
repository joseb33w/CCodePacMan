(() => {
  const TILE = 20;
  const COLS = 28;
  const ROWS = 31;

  // Maze legend:
  //   # wall, . pellet, o power pellet, ' ' empty (walkable, no pellet),
  //   - ghost door (only ghosts pass)
  const RAW_MAZE = [
    "############################",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#o####.#####.##.#####.####o#",
    "#.####.#####.##.#####.####.#",
    "#..........................#",
    "#.####.##.########.##.####.#",
    "#.####.##.########.##.####.#",
    "#......##....##....##......#",
    "######.##### ## #####.######",
    "######.##### ## #####.######",
    "######.##          ##.######",
    "######.## ###--### ##.######",
    "######.## #      # ##.######",
    "      .   #      #   .      ",
    "######.## #      # ##.######",
    "######.## ######## ##.######",
    "######.##          ##.######",
    "######.## ######## ##.######",
    "######.## ######## ##.######",
    "#............##............#",
    "#.####.#####.##.#####.####.#",
    "#.####.#####.##.#####.####.#",
    "#o..##................##..o#",
    "###.##.##.########.##.##.###",
    "###.##.##.########.##.##.###",
    "#......##....##....##......#",
    "#.##########.##.##########.#",
    "#.##########.##.##########.#",
    "#..........................#",
    "############################",
  ];

  const TILE_WALL = 1;
  const TILE_PELLET = 2;
  const TILE_POWER = 3;
  const TILE_EMPTY = 0;
  const TILE_DOOR = 4;

  let maze = [];
  let pelletsRemaining = 0;

  function buildMaze() {
    maze = [];
    pelletsRemaining = 0;
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      const src = RAW_MAZE[y];
      for (let x = 0; x < COLS; x++) {
        const ch = src[x];
        if (ch === "#") row.push(TILE_WALL);
        else if (ch === ".") {
          row.push(TILE_PELLET);
          pelletsRemaining++;
        } else if (ch === "o") {
          row.push(TILE_POWER);
          pelletsRemaining++;
        } else if (ch === "-") row.push(TILE_DOOR);
        else row.push(TILE_EMPTY);
      }
      maze.push(row);
    }
  }

  // Directions
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    none: { x: 0, y: 0 },
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const highEl = document.getElementById("highscore");
  const livesEl = document.getElementById("lives");
  const levelEl = document.getElementById("level");
  const overlay = document.getElementById("overlay");
  const overlayText = document.getElementById("overlay-text");
  const startBtn = document.getElementById("start-btn");

  const HIGH_KEY = "pacman-highscore";
  let highScore = parseInt(localStorage.getItem(HIGH_KEY) || "0", 10);
  highEl.textContent = highScore;

  const GHOST_COLORS = {
    blinky: "#ff0000",
    pinky: "#ffb8ff",
    inky: "#00ffff",
    clyde: "#ffb852",
  };

  function isWall(x, y, allowDoor = false) {
    if (y < 0 || y >= ROWS) return true;
    // tunnel x wrap
    if (x < 0 || x >= COLS) return false;
    const t = maze[y][x];
    if (t === TILE_WALL) return true;
    if (t === TILE_DOOR && !allowDoor) return true;
    return false;
  }

  function wrapX(x) {
    if (x < 0) return COLS - 1;
    if (x >= COLS) return 0;
    return x;
  }

  class Entity {
    constructor(tileX, tileY, color) {
      this.tileX = tileX;
      this.tileY = tileY;
      // pixel position at center of tile
      this.x = tileX * TILE + TILE / 2;
      this.y = tileY * TILE + TILE / 2;
      this.dir = DIRS.none;
      this.nextDir = DIRS.none;
      this.color = color;
      this.speed = 2; // pixels per frame
    }
    tile() {
      return {
        x: Math.floor(this.x / TILE),
        y: Math.floor(this.y / TILE),
      };
    }
    centeredOnTile() {
      const cx = this.tileX * TILE + TILE / 2;
      const cy = this.tileY * TILE + TILE / 2;
      return Math.abs(this.x - cx) < 0.5 && Math.abs(this.y - cy) < 0.5;
    }
    snapToTile() {
      this.x = this.tileX * TILE + TILE / 2;
      this.y = this.tileY * TILE + TILE / 2;
    }
    moveByDir(dir, allowDoor = false) {
      // move pixel-by-pixel along dir; on tile center, allow turn
      const speed = this.speed;
      let nx = this.x + dir.x * speed;
      let ny = this.y + dir.y * speed;
      // tunnel wrap (horizontal)
      if (nx < 0) nx += COLS * TILE;
      if (nx >= COLS * TILE) nx -= COLS * TILE;

      // Check collision with wall: when crossing into next tile
      const tx = Math.floor(nx / TILE);
      const ty = Math.floor(ny / TILE);
      if (isWall(tx, ty, allowDoor)) {
        // stop at center of current tile
        this.snapToTile();
        return false;
      }
      this.x = nx;
      this.y = ny;
      this.tileX = tx;
      this.tileY = ty;
      return true;
    }
  }

  class PacMan extends Entity {
    constructor() {
      super(13, 23, "#ffcc00");
      this.speed = 2;
      this.mouth = 0;
      this.alive = true;
      this.dyingTimer = 0;
      this.dir = DIRS.left;
      this.nextDir = DIRS.left;
    }
    reset() {
      this.tileX = 13;
      this.tileY = 23;
      this.snapToTile();
      this.dir = DIRS.left;
      this.nextDir = DIRS.left;
      this.alive = true;
      this.dyingTimer = 0;
    }
    update() {
      if (!this.alive) {
        this.dyingTimer++;
        return;
      }
      this.mouth = (this.mouth + 0.15) % (Math.PI / 2);

      // attempt to switch to nextDir if possible at tile center
      const onCenter =
        Math.abs(this.x - (this.tileX * TILE + TILE / 2)) < this.speed &&
        Math.abs(this.y - (this.tileY * TILE + TILE / 2)) < this.speed;

      if (onCenter && this.nextDir !== DIRS.none) {
        const nx = this.tileX + this.nextDir.x;
        const ny = this.tileY + this.nextDir.y;
        if (!isWall(nx, ny)) {
          this.dir = this.nextDir;
          this.snapToTile();
        }
      }

      if (this.dir !== DIRS.none) {
        // attempt move
        const moved = this.moveByDir(this.dir, false);
        if (!moved) {
          // try snap and stop
        }
      }

      // tunnel wrap
      if (this.x < 0) this.x += COLS * TILE;
      if (this.x >= COLS * TILE) this.x -= COLS * TILE;
      this.tileX = Math.floor(this.x / TILE);
      this.tileY = Math.floor(this.y / TILE);

      // eat pellet
      const t = maze[this.tileY] && maze[this.tileY][this.tileX];
      if (t === TILE_PELLET) {
        maze[this.tileY][this.tileX] = TILE_EMPTY;
        pelletsRemaining--;
        addScore(10);
      } else if (t === TILE_POWER) {
        maze[this.tileY][this.tileX] = TILE_EMPTY;
        pelletsRemaining--;
        addScore(50);
        triggerFrightened();
      }
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      let angle = 0;
      if (this.dir === DIRS.right) angle = 0;
      else if (this.dir === DIRS.left) angle = Math.PI;
      else if (this.dir === DIRS.up) angle = -Math.PI / 2;
      else if (this.dir === DIRS.down) angle = Math.PI / 2;
      ctx.rotate(angle);

      if (!this.alive) {
        // death animation: shrinking arc
        const t = Math.min(1, this.dyingTimer / 60);
        const open = (Math.PI / 2) * (1 + t * 2);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, TILE / 2 - 1, open, Math.PI * 2 - open);
        ctx.closePath();
        ctx.fill();
      } else {
        const open = Math.abs(Math.sin(this.mouth * 2)) * 0.45 + 0.05;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, TILE / 2 - 1, open * Math.PI, Math.PI * 2 - open * Math.PI);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  class Ghost extends Entity {
    constructor(name, tileX, tileY, scatterTarget) {
      super(tileX, tileY, GHOST_COLORS[name]);
      this.name = name;
      this.startTile = { x: tileX, y: tileY };
      this.scatterTarget = scatterTarget;
      this.mode = "house"; // house | exit | chase | scatter | frightened | eaten
      this.releaseTimer = 0;
      this.frightenedTimer = 0;
      this.speed = 1.7;
      this.dir = DIRS.up;
      this.x = tileX * TILE + TILE / 2;
      this.y = tileY * TILE + TILE / 2;
    }
    reset() {
      this.tileX = this.startTile.x;
      this.tileY = this.startTile.y;
      this.x = this.tileX * TILE + TILE / 2;
      this.y = this.tileY * TILE + TILE / 2;
      this.dir = DIRS.up;
      this.mode = "house";
      this.releaseTimer = 0;
      this.frightenedTimer = 0;
    }
    setFrightened() {
      if (this.mode === "eaten" || this.mode === "house" || this.mode === "exit") return;
      this.mode = "frightened";
      this.frightenedTimer = 360; // ~6 seconds @ 60fps
      // reverse direction
      this.dir = { x: -this.dir.x, y: -this.dir.y };
    }
    targetTile() {
      if (this.mode === "scatter") return this.scatterTarget;
      if (this.mode === "eaten") return { x: 13, y: 14 }; // ghost house entry
      if (this.mode === "frightened") {
        return {
          x: Math.floor(Math.random() * COLS),
          y: Math.floor(Math.random() * ROWS),
        };
      }
      // chase
      const p = pacman;
      const pt = { x: p.tileX, y: p.tileY };
      switch (this.name) {
        case "blinky":
          return pt;
        case "pinky": {
          // 4 tiles ahead of pacman
          return {
            x: pt.x + p.dir.x * 4,
            y: pt.y + p.dir.y * 4,
          };
        }
        case "inky": {
          // 2 tiles ahead, mirrored from blinky
          const ahead = {
            x: pt.x + p.dir.x * 2,
            y: pt.y + p.dir.y * 2,
          };
          const b = ghosts.find((g) => g.name === "blinky");
          return {
            x: ahead.x + (ahead.x - b.tileX),
            y: ahead.y + (ahead.y - b.tileY),
          };
        }
        case "clyde": {
          const dx = pt.x - this.tileX;
          const dy = pt.y - this.tileY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist > 8 ? pt : this.scatterTarget;
        }
      }
      return pt;
    }
    chooseDir() {
      // At tile center, choose direction toward target (no reverse)
      const candidates = [DIRS.up, DIRS.left, DIRS.down, DIRS.right];
      const target = this.targetTile();
      let best = null;
      let bestDist = Infinity;
      const rev = { x: -this.dir.x, y: -this.dir.y };
      for (const d of candidates) {
        if (d.x === rev.x && d.y === rev.y) continue;
        const nx = this.tileX + d.x;
        const ny = this.tileY + d.y;
        const allowDoor = this.mode === "eaten" || this.mode === "exit";
        if (isWall(nx, ny, allowDoor)) continue;
        // Don't enter through door from above unless eaten/exit
        const dx = nx - target.x;
        const dy = ny - target.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          best = d;
        }
      }
      if (best) this.dir = best;
    }
    update() {
      // House logic
      if (this.mode === "house") {
        this.releaseTimer++;
        // bob up and down inside house
        this.y += this.dir.y * 0.5;
        if (this.y < (this.startTile.y - 0.3) * TILE + TILE / 2) this.dir = DIRS.down;
        if (this.y > (this.startTile.y + 0.3) * TILE + TILE / 2) this.dir = DIRS.up;
        const releaseTimes = { blinky: 0, pinky: 60, inky: 240, clyde: 480 };
        if (this.releaseTimer >= (releaseTimes[this.name] || 0)) {
          this.mode = "exit";
          this.dir = DIRS.up;
          this.x = 13.5 * TILE; // align to door
          this.tileX = 13;
        }
        return;
      }

      if (this.mode === "exit") {
        // travel up until row 11 then begin chase
        this.y -= this.speed;
        this.tileY = Math.floor(this.y / TILE);
        if (this.tileY <= 11) {
          this.snapToTile();
          this.mode = currentMode;
          this.dir = Math.random() < 0.5 ? DIRS.left : DIRS.right;
        }
        return;
      }

      if (this.mode === "frightened") {
        this.frightenedTimer--;
        if (this.frightenedTimer <= 0) {
          this.mode = currentMode;
        }
      }

      // adjust speed based on mode
      let speed = 1.7;
      if (this.mode === "frightened") speed = 1.1;
      else if (this.mode === "eaten") speed = 3.5;
      this.speed = speed;

      // At tile center, pick direction
      const cx = this.tileX * TILE + TILE / 2;
      const cy = this.tileY * TILE + TILE / 2;
      const onCenter = Math.abs(this.x - cx) < this.speed && Math.abs(this.y - cy) < this.speed;
      if (onCenter) {
        this.snapToTile();
        // If eaten and reached house, respawn
        if (this.mode === "eaten" && this.tileX === 13 && this.tileY === 14) {
          this.mode = "house";
          this.releaseTimer = Math.max(0, (this.name === "blinky" ? -30 : 0));
          this.tileX = this.startTile.x;
          this.tileY = this.startTile.y;
          this.x = this.tileX * TILE + TILE / 2;
          this.y = this.tileY * TILE + TILE / 2;
          this.dir = DIRS.up;
          return;
        }
        this.chooseDir();
      }

      // move
      const allowDoor = this.mode === "eaten" || this.mode === "exit";
      const moved = this.moveByDir(this.dir, allowDoor);
      if (!moved) {
        // try perpendicular at center
        this.chooseDir();
      }

      // tunnel wrap
      if (this.x < 0) this.x += COLS * TILE;
      if (this.x >= COLS * TILE) this.x -= COLS * TILE;
      this.tileX = Math.floor(this.x / TILE);
      this.tileY = Math.floor(this.y / TILE);
    }
    draw() {
      const r = TILE / 2 - 1;
      let body = this.color;
      if (this.mode === "frightened") {
        body = this.frightenedTimer < 120 && Math.floor(this.frightenedTimer / 15) % 2
          ? "#ffffff"
          : "#2121de";
      }
      if (this.mode === "eaten") body = null;

      if (body) {
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(this.x, this.y - 1, r, Math.PI, 0);
        ctx.lineTo(this.x + r, this.y + r);
        // wavy bottom
        const waves = 3;
        for (let i = 0; i < waves; i++) {
          const x1 = this.x + r - ((i * 2 + 1) * r) / waves;
          const x2 = this.x + r - ((i * 2 + 2) * r) / waves;
          ctx.lineTo(x1, this.y + r - 3);
          ctx.lineTo(x2, this.y + r);
        }
        ctx.closePath();
        ctx.fill();
      }

      // eyes
      const eyeR = 3;
      const eyeOffsetX = 4;
      const eyeOffsetY = -2;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(this.x - eyeOffsetX, this.y + eyeOffsetY, eyeR, 0, Math.PI * 2);
      ctx.arc(this.x + eyeOffsetX, this.y + eyeOffsetY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      // pupils based on direction
      const pdx = this.dir.x * 1.5;
      const pdy = this.dir.y * 1.5;
      ctx.fillStyle = this.mode === "frightened" ? "#ff0000" : "#000088";
      ctx.beginPath();
      ctx.arc(this.x - eyeOffsetX + pdx, this.y + eyeOffsetY + pdy, 1.5, 0, Math.PI * 2);
      ctx.arc(this.x + eyeOffsetX + pdx, this.y + eyeOffsetY + pdy, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // === Game state ===
  let pacman;
  let ghosts;
  let score = 0;
  let lives = 3;
  let level = 1;
  let state = "ready"; // ready | playing | dying | win | gameover
  let stateTimer = 0;
  let currentMode = "chase"; // chase or scatter
  let modeTimer = 0;
  let frightenedActive = false;
  let ghostEatChain = 0;

  function newGame() {
    score = 0;
    lives = 3;
    level = 1;
    buildMaze();
    placeEntities();
    state = "ready";
    stateTimer = 120;
    overlay.classList.remove("hidden");
    overlayText.textContent = "READY!";
    startBtn.textContent = "START";
    updateHUD();
  }

  function placeEntities() {
    pacman = new PacMan();
    ghosts = [
      new Ghost("blinky", 13, 11, { x: 25, y: 0 }),
      new Ghost("pinky", 13, 14, { x: 2, y: 0 }),
      new Ghost("inky", 12, 14, { x: 27, y: 30 }),
      new Ghost("clyde", 14, 14, { x: 0, y: 30 }),
    ];
    // blinky starts outside the house
    ghosts[0].mode = "chase";
    ghosts[0].dir = DIRS.left;
    currentMode = "chase";
    modeTimer = 0;
  }

  function nextLevel() {
    level++;
    buildMaze();
    placeEntities();
    state = "ready";
    stateTimer = 120;
    overlay.classList.remove("hidden");
    overlayText.textContent = "LEVEL " + level;
    startBtn.textContent = "GO";
    updateHUD();
  }

  function loseLife() {
    lives--;
    updateHUD();
    if (lives <= 0) {
      state = "gameover";
      stateTimer = 0;
      overlay.classList.remove("hidden");
      overlayText.textContent = "GAME OVER";
      startBtn.textContent = "RESTART";
    } else {
      state = "ready";
      stateTimer = 120;
      placeEntities();
      overlay.classList.remove("hidden");
      overlayText.textContent = "READY!";
      startBtn.textContent = "GO";
    }
  }

  function addScore(pts) {
    score += pts;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HIGH_KEY, String(highScore));
    }
    updateHUD();
  }

  function updateHUD() {
    scoreEl.textContent = score;
    highEl.textContent = highScore;
    livesEl.textContent = lives;
    levelEl.textContent = level;
  }

  function triggerFrightened() {
    frightenedActive = true;
    ghostEatChain = 0;
    for (const g of ghosts) g.setFrightened();
  }

  function checkCollisions() {
    for (const g of ghosts) {
      if (g.mode === "house" || g.mode === "eaten") continue;
      const dx = g.x - pacman.x;
      const dy = g.y - pacman.y;
      if (dx * dx + dy * dy < (TILE * 0.6) * (TILE * 0.6)) {
        if (g.mode === "frightened") {
          g.mode = "eaten";
          ghostEatChain++;
          addScore(200 * Math.pow(2, ghostEatChain - 1));
        } else {
          // pacman dies
          pacman.alive = false;
          state = "dying";
          stateTimer = 90;
        }
      }
    }
  }

  // === Drawing ===
  function drawMaze() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = maze[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (t === TILE_WALL) {
          ctx.fillStyle = "#2121de";
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          ctx.strokeStyle = "#4a4aff";
          ctx.strokeRect(px + 2, py + 2, TILE - 4, TILE - 4);
        } else if (t === TILE_DOOR) {
          ctx.fillStyle = "#ffb8ff";
          ctx.fillRect(px, py + TILE / 2 - 2, TILE, 4);
        } else if (t === TILE_PELLET) {
          ctx.fillStyle = "#ffb897";
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (t === TILE_POWER) {
          const pulse = (Math.sin(Date.now() / 150) + 1) / 2;
          ctx.fillStyle = "#ffb897";
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 5 + pulse * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function draw() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMaze();
    if (state !== "gameover") {
      pacman.draw();
    }
    for (const g of ghosts) g.draw();

    if (state === "win") {
      ctx.fillStyle = "#ffcc00";
      ctx.font = "bold 28px Courier New";
      ctx.textAlign = "center";
      ctx.fillText("LEVEL CLEAR!", canvas.width / 2, ROWS * TILE + 30);
    }
  }

  // === Main loop ===
  function tick() {
    if (state === "playing") {
      // mode timer for chase/scatter cycling
      modeTimer++;
      // simple cycle: 7s scatter, 20s chase (60fps)
      if (currentMode === "scatter" && modeTimer > 420) {
        currentMode = "chase";
        modeTimer = 0;
      } else if (currentMode === "chase" && modeTimer > 1200) {
        currentMode = "scatter";
        modeTimer = 0;
      }

      pacman.update();
      for (const g of ghosts) g.update();
      checkCollisions();

      // win condition
      if (pelletsRemaining <= 0) {
        state = "win";
        stateTimer = 120;
      }

      // reset frightened flag
      if (frightenedActive) {
        const anyFright = ghosts.some((g) => g.mode === "frightened");
        if (!anyFright) {
          frightenedActive = false;
          ghostEatChain = 0;
        }
      }
    } else if (state === "dying") {
      pacman.update();
      stateTimer--;
      if (stateTimer <= 0) {
        loseLife();
      }
    } else if (state === "win") {
      stateTimer--;
      if (stateTimer <= 0) {
        nextLevel();
      }
    } else if (state === "ready") {
      stateTimer--;
    }

    draw();
    requestAnimationFrame(tick);
  }

  // === Input ===
  document.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowup" || k === "w") pacman.nextDir = DIRS.up;
    else if (k === "arrowdown" || k === "s") pacman.nextDir = DIRS.down;
    else if (k === "arrowleft" || k === "a") pacman.nextDir = DIRS.left;
    else if (k === "arrowright" || k === "d") pacman.nextDir = DIRS.right;
    else if (k === "enter" || k === " ") {
      if (state === "ready" || state === "gameover") startGame();
    }
    if (
      k === "arrowup" || k === "arrowdown" ||
      k === "arrowleft" || k === "arrowright" || k === " "
    ) e.preventDefault();
  });

  function startGame() {
    if (state === "gameover") {
      newGame();
    }
    overlay.classList.add("hidden");
    state = "playing";
    stateTimer = 0;
  }

  startBtn.addEventListener("click", startGame);

  // Initialize
  buildMaze();
  placeEntities();
  newGame();
  requestAnimationFrame(tick);
})();
