(() => {
  "use strict";
  const TILE = 20, COLS = 28, ROWS = 31;
  const RAW = [
    "############################","#............##............#","#.####.#####.##.#####.####.#","#o####.#####.##.#####.####o#","#.####.#####.##.#####.####.#","#..........................#","#.####.##.########.##.####.#","#.####.##.########.##.####.#","#......##....##....##......#","######.##### ## #####.######","######.##### ## #####.######","######.##          ##.######","######.## ###--### ##.######","######.## #      # ##.######","      .   #      #   .      ","######.## #      # ##.######","######.## ######## ##.######","######.##          ##.######","######.## ######## ##.######","######.## ######## ##.######","#............##............#","#.####.#####.##.#####.####.#","#.####.#####.##.#####.####.#","#o..##................##..o#","###.##.##.########.##.##.###","###.##.##.########.##.##.###","#......##....##....##......#","#.##########.##.##########.#","#.##########.##.##########.#","#..........................#","############################"
  ];
  const WALL = 1, PELLET = 2, POWER = 3, EMPTY = 0, DOOR = 4;
  const DIRS = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0}, none:{x:0,y:0} };
  const canvas = document.getElementById("game"), ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const scoreEl = $("score"), highEl = $("highscore"), livesEl = $("lives"), levelEl = $("level"), comboEl = $("combo");
  const overlay = $("overlay"), overlayText = $("overlay-text"), overlaySub = $("overlay-subtitle"), startBtn = $("start-btn");
  const pauseBtn = $("pause-btn"), soundBtn = $("sound-btn"), quickStart = $("quick-start"), restartBtn = $("restart-btn");
  const modeLabel = $("mode-label"), pelletLabel = $("pellet-label");
  const HIGH_KEY = "pacman-highscore";
  const SWIPE_THRESHOLD = 8;
  let high = parseInt(localStorage.getItem(HIGH_KEY) || "0", 10);
  let maze = [], pellets = 0, totalPellets = 0, milestones = new Set();
  let pac, ghosts, score = 0, lives = 3, level = 1, state = "ready", timer = 0, mode = "chase", modeTimer = 0;
  let ghostChain = 0, fruit = null, particles = [], popups = [], frame = 0, sound = true, audioCtx = null, swipeStart = null;
  let heldDir = null, holdRaf = null;
  highEl.textContent = high;

  window.addEventListener("error", (event) => {
    console.error("Game error:", event.message, event.error?.stack || "");
    overlay.classList.remove("hidden"); overlayText.textContent = "ERROR"; overlaySub.textContent = event.message || "Refresh and try again.";
  });
  document.addEventListener("gesturestart", e => e.preventDefault(), { passive:false });
  document.addEventListener("dblclick", e => e.preventDefault(), { passive:false });
  document.addEventListener("contextmenu", e => e.preventDefault());

  function buildMaze(){
    maze=[]; pellets=0;
    for(let y=0;y<ROWS;y++){
      const row=[];
      for(let x=0;x<COLS;x++){
        const ch=RAW[y][x];
        if(ch==="#") row.push(WALL); else if(ch==="."){row.push(PELLET); pellets++;}
        else if(ch==="o"){row.push(POWER); pellets++;} else if(ch==="-") row.push(DOOR); else row.push(EMPTY);
      }
      maze.push(row);
    }
    totalPellets=pellets; milestones=new Set([Math.floor(totalPellets*.32), Math.floor(totalPellets*.68)]);
  }
  function isWall(x,y,door=false){ if(y<0||y>=ROWS) return true; if(x<0||x>=COLS) return false; const t=maze[y][x]; return t===WALL || (t===DOOR&&!door); }
  function beep(f=440,d=.08,type="square",g=.04){
    if(!sound) return; try{ const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; audioCtx=audioCtx||new AC(); if(audioCtx.state==="suspended") audioCtx.resume(); const t=audioCtx.currentTime,o=audioCtx.createOscillator(),gain=audioCtx.createGain(); o.type=type; o.frequency.value=f; gain.gain.setValueAtTime(0,t); gain.gain.linearRampToValueAtTime(g,t+.01); gain.gain.exponentialRampToValueAtTime(.0001,t+d); o.connect(gain); gain.connect(audioCtx.destination); o.start(t); o.stop(t+d+.03);}catch(e){console.warn(e.message);} }
  function addScore(n,x=pac?.x||280,y=pac?.y||300,label){ score+=n; if(score>high){high=score; localStorage.setItem(HIGH_KEY,String(high));} if(label) popup(label,x,y,n>=100?"#00ffff":"#ffcc00"); updateHud(); }
  function burst(x,y,color,count=12){ for(let i=0;i<count;i++){ const a=Math.random()*Math.PI*2,s=.8+Math.random()*2.4; particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:36,max:36,color,r:1.4+Math.random()*2.4}); } }
  function popup(text,x,y,color="#ffcc00"){ popups.push({text,x,y,life:58,color}); }

  class Entity{
    constructor(tx,ty,color){ this.tx=tx; this.ty=ty; this.x=tx*TILE+TILE/2; this.y=ty*TILE+TILE/2; this.dir=DIRS.none; this.next=DIRS.none; this.color=color; this.speed=2; }
    snap(){ this.x=this.tx*TILE+TILE/2; this.y=this.ty*TILE+TILE/2; }
    move(d,door=false){ let nx=this.x+d.x*this.speed, ny=this.y+d.y*this.speed; if(nx<0) nx+=COLS*TILE; if(nx>=COLS*TILE) nx-=COLS*TILE; const tx=Math.floor(nx/TILE), ty=Math.floor(ny/TILE); if(isWall(tx,ty,door)){this.snap(); return false;} this.x=nx; this.y=ny; this.tx=tx; this.ty=ty; return true; }
  }
  class Pac extends Entity{
    constructor(){ super(13,23,"#ffcc00"); this.speed=Math.min(2.55,2.05+level*.04); this.dir=DIRS.left; this.next=DIRS.left; this.mouth=0; this.alive=true; this.dying=0; }
    update(){
      if(!this.alive){this.dying++; return;} this.mouth=(this.mouth+.17)%(Math.PI/2);
      const centered=Math.abs(this.x-(this.tx*TILE+TILE/2))<this.speed && Math.abs(this.y-(this.ty*TILE+TILE/2))<this.speed;
      if(centered&&this.next!==DIRS.none&&!isWall(this.tx+this.next.x,this.ty+this.next.y)){this.dir=this.next; this.snap();}
      if(this.dir!==DIRS.none) this.move(this.dir,false); if(this.x<0)this.x+=COLS*TILE; if(this.x>=COLS*TILE)this.x-=COLS*TILE; this.tx=Math.floor(this.x/TILE); this.ty=Math.floor(this.y/TILE);
      const t=maze[this.ty]?.[this.tx];
      if(t===PELLET){ maze[this.ty][this.tx]=EMPTY; pellets--; addScore(10,this.x,this.y,"+10"); maybeFruit(); beep(660,.035,"square",.025); }
      else if(t===POWER){ maze[this.ty][this.tx]=EMPTY; pellets--; addScore(50,this.x,this.y,"+50"); ghosts.forEach(g=>g.frighten()); ghostChain=0; modeLabel.textContent="POWER MODE!"; burst(this.x,this.y,"#00ffff",24); beep(220,.08,"sawtooth",.055); setTimeout(()=>beep(440,.1,"sawtooth",.05),70); }
      if(fruit&&Math.hypot(fruit.x-this.x,fruit.y-this.y)<TILE*.75) eatFruit();
    }
    draw(){ ctx.save(); ctx.translate(this.x,this.y); let a=0; if(this.dir===DIRS.left)a=Math.PI; else if(this.dir===DIRS.up)a=-Math.PI/2; else if(this.dir===DIRS.down)a=Math.PI/2; ctx.rotate(a); const r=TILE/2-1; ctx.fillStyle=this.color; ctx.beginPath(); if(!this.alive){ const t=Math.min(1,this.dying/60), open=Math.PI/2*(1+t*2); ctx.moveTo(0,0); ctx.arc(0,0,r,open,Math.PI*2-open); } else { const open=Math.abs(Math.sin(this.mouth*2))*.45+.05; ctx.moveTo(0,0); ctx.arc(0,0,r,open*Math.PI,Math.PI*2-open*Math.PI); } ctx.closePath(); ctx.fill(); ctx.restore(); }
  }
  class Ghost extends Entity{
    constructor(name,tx,ty,color,scatter){ super(tx,ty,color); this.name=name; this.start={x:tx,y:ty}; this.scatter=scatter; this.mode="house"; this.release=0; this.fright=0; this.speed=1.65; this.dir=DIRS.up; }
    frighten(){ if(["eaten","house","exit"].includes(this.mode)) return; this.mode="fright"; this.fright=Math.max(240,390-level*18); this.dir={x:-this.dir.x,y:-this.dir.y}; }
    target(){ if(this.mode==="scatter")return this.scatter; if(this.mode==="eaten")return{x:13,y:14}; if(this.mode==="fright")return{x:Math.random()*COLS|0,y:Math.random()*ROWS|0}; const p={x:pac.tx,y:pac.ty}; if(this.name==="blinky")return p; if(this.name==="pinky")return{x:p.x+pac.dir.x*4,y:p.y+pac.dir.y*4}; if(this.name==="inky"){ const b=ghosts[0], a={x:p.x+pac.dir.x*2,y:p.y+pac.dir.y*2}; return{x:a.x+(a.x-b.tx),y:a.y+(a.y-b.ty)};} const dx=p.x-this.tx,dy=p.y-this.ty; return Math.hypot(dx,dy)>8?p:this.scatter; }
    choose(){ const cand=[DIRS.up,DIRS.left,DIRS.down,DIRS.right], tgt=this.target(), rev={x:-this.dir.x,y:-this.dir.y}; let best=null,dist=1e9; for(const d of cand){ if(d.x===rev.x&&d.y===rev.y)continue; const nx=this.tx+d.x,ny=this.ty+d.y,door=this.mode==="eaten"||this.mode==="exit"; if(isWall(nx,ny,door))continue; const dd=(nx-tgt.x)**2+(ny-tgt.y)**2; if(dd<dist){dist=dd; best=d;} } if(best)this.dir=best; }
    update(){
      if(this.mode==="house"){ this.release++; this.y+=this.dir.y*.5; if(this.y<(this.start.y-.3)*TILE+TILE/2)this.dir=DIRS.down; if(this.y>(this.start.y+.3)*TILE+TILE/2)this.dir=DIRS.up; const times={blinky:0,pinky:50,inky:190,clyde:350}; if(this.release>=(times[this.name]||0)){this.mode="exit"; this.dir=DIRS.up; this.x=13.5*TILE; this.tx=13;} return; }
      if(this.mode==="exit"){ this.y-=this.speed; this.ty=Math.floor(this.y/TILE); if(this.ty<=11){this.snap(); this.mode=mode; this.dir=Math.random()<.5?DIRS.left:DIRS.right;} return; }
      if(this.mode==="fright"&&--this.fright<=0)this.mode=mode; this.speed=this.mode==="fright"?1.08:this.mode==="eaten"?3.6:1.6+Math.min(.5,level*.05);
      const centered=Math.abs(this.x-(this.tx*TILE+TILE/2))<this.speed && Math.abs(this.y-(this.ty*TILE+TILE/2))<this.speed;
      if(centered){ this.snap(); if(this.mode==="eaten"&&this.tx===13&&this.ty===14){this.mode="house"; this.release=this.name==="blinky"?-40:0; this.tx=this.start.x; this.ty=this.start.y; this.snap(); this.dir=DIRS.up; return;} this.choose(); }
      if(!this.move(this.dir,this.mode==="eaten"||this.mode==="exit"))this.choose(); if(this.x<0)this.x+=COLS*TILE; if(this.x>=COLS*TILE)this.x-=COLS*TILE; this.tx=Math.floor(this.x/TILE); this.ty=Math.floor(this.y/TILE);
    }
    draw(){ const r=TILE/2-1; let body=this.color; if(this.mode==="fright")body=this.fright<120&&Math.floor(this.fright/15)%2?"#fff":"#2121de"; if(this.mode==="eaten")body=null; if(body){ctx.fillStyle=body; ctx.beginPath(); ctx.arc(this.x,this.y-1,r,Math.PI,0); ctx.lineTo(this.x+r,this.y+r); for(let i=0;i<3;i++){ctx.lineTo(this.x+r-((i*2+1)*r)/3,this.y+r-3); ctx.lineTo(this.x+r-((i*2+2)*r)/3,this.y+r);} ctx.closePath(); ctx.fill();} ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(this.x-4,this.y-2,3,0,Math.PI*2); ctx.arc(this.x+4,this.y-2,3,0,Math.PI*2); ctx.fill(); ctx.fillStyle=this.mode==="fright"?"#f00":"#008"; ctx.beginPath(); ctx.arc(this.x-4+this.dir.x*1.5,this.y-2+this.dir.y*1.5,1.5,0,Math.PI*2); ctx.arc(this.x+4+this.dir.x*1.5,this.y-2+this.dir.y*1.5,1.5,0,Math.PI*2); ctx.fill(); }
  }
  function place(){ pac=new Pac(); ghosts=[new Ghost("blinky",13,11,"#ff0000",{x:25,y:0}),new Ghost("pinky",13,14,"#ffb8ff",{x:2,y:0}),new Ghost("inky",12,14,"#00ffff",{x:27,y:30}),new Ghost("clyde",14,14,"#ffb852",{x:0,y:30})]; ghosts[0].mode="chase"; ghosts[0].dir=DIRS.left; mode="chase"; modeTimer=0; }
  function newGame(){ score=0;lives=3;level=1;fruit=null;particles=[];popups=[];buildMaze();place();state="ready";timer=120;overlay.classList.remove("hidden");overlayText.textContent="READY!";overlaySub.textContent="Eat pellets, chain ghosts, grab bonus fruit.";startBtn.textContent="START";updateHud();labels(); }
  function nextLevel(){ level++;fruit=null;buildMaze();place();state="ready";timer=120;overlay.classList.remove("hidden");overlayText.textContent="LEVEL "+level;overlaySub.textContent="Ghosts are faster. Stay sharp.";startBtn.textContent="GO";updateHud();labels(); }
  function loseLife(){ lives--; updateHud(); if(lives<=0){state="gameover";overlay.classList.remove("hidden");overlayText.textContent="GAME OVER";overlaySub.textContent="Final score: "+score+". Tap restart to try again.";startBtn.textContent="RESTART";beep(120,.22,"sawtooth",.06);} else {state="ready";fruit=null;place();overlay.classList.remove("hidden");overlayText.textContent="READY!";overlaySub.textContent=lives+" lives left. Watch the corners.";startBtn.textContent="GO";} labels(); }
  function updateHud(){ scoreEl.textContent=score; highEl.textContent=high; livesEl.textContent=lives; levelEl.textContent=level; comboEl.textContent="x"+Math.max(1,ghostChain||1); }
  function labels(){ modeLabel.textContent=state==="playing"?`Playing · ${mode}`:state[0].toUpperCase()+state.slice(1); pelletLabel.textContent="Pellets remaining: "+pellets; pauseBtn.textContent=state==="paused"?"RESUME":"PAUSE"; }
  function maybeFruit(){ const eaten=totalPellets-pellets; if(!fruit&&milestones.has(eaten)){milestones.delete(eaten); const f=[{e:"🍒",p:100,c:"#ff3355"},{e:"🍓",p:300,c:"#ff4d99"},{e:"🍊",p:500,c:"#ff9f1c"},{e:"🔔",p:700,c:"#ffcc00"},{e:"🔑",p:1000,c:"#00ffff"}][Math.min(4,level-1)]; fruit={x:13*TILE+TILE/2,y:17*TILE+TILE/2,t:620,...f}; popup("BONUS!",fruit.x,fruit.y-10,fruit.c); beep(880,.08,"triangle",.055); } }
  function eatFruit(){ addScore(fruit.p,fruit.x,fruit.y,"+"+fruit.p); burst(fruit.x,fruit.y,fruit.c,30); popup(fruit.e+" BONUS",fruit.x,fruit.y-20,fruit.c); fruit=null; beep(980,.1,"triangle",.065); }
  function collisions(){ ghosts.forEach(g=>{ if(g.mode==="house"||g.mode==="eaten")return; if(Math.hypot(g.x-pac.x,g.y-pac.y)<TILE*.6){ if(g.mode==="fright"){g.mode="eaten"; ghostChain++; const pts=200*2**(ghostChain-1); addScore(pts,g.x,g.y,"+"+pts); burst(g.x,g.y,"#00ffff",26); beep(520+ghostChain*120,.12,"square",.055);} else if(state==="playing"){pac.alive=false; state="dying"; timer=90; burst(pac.x,pac.y,"#ffcc00",38); beep(180,.2,"sawtooth",.06);} } }); }
  function drawMaze(){ for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){ const t=maze[y][x], px=x*TILE, py=y*TILE; if(t===WALL){ctx.fillStyle="#2121de";ctx.fillRect(px+2,py+2,TILE-4,TILE-4);ctx.strokeStyle="#6b6bff";ctx.strokeRect(px+2,py+2,TILE-4,TILE-4);} else if(t===DOOR){ctx.fillStyle="#ffb8ff";ctx.fillRect(px,py+TILE/2-2,TILE,4);} else if(t===PELLET){ctx.fillStyle="#ffdfb8";ctx.beginPath();ctx.arc(px+TILE/2,py+TILE/2,2,0,Math.PI*2);ctx.fill();} else if(t===POWER){const p=(Math.sin(frame/9)+1)/2;ctx.fillStyle=p>.55?"#fff":"#ffb897";ctx.beginPath();ctx.arc(px+TILE/2,py+TILE/2,5+p*1.8,0,Math.PI*2);ctx.fill();} } }
  function drawExtras(){ if(fruit){ if(--fruit.t<=0)fruit=null; else{ctx.save();ctx.font="18px Arial";ctx.textAlign="center";ctx.textBaseline="middle";ctx.shadowBlur=14;ctx.shadowColor=fruit.c;ctx.fillText(fruit.e,fruit.x,fruit.y+Math.sin(frame/8)*2);ctx.restore();} } particles=particles.filter(p=>p.life>0); particles.forEach(p=>{p.life--;p.x+=p.vx;p.y+=p.vy;p.vx*=.98;p.vy*=.98;ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}); popups=popups.filter(p=>p.life>0); popups.forEach(p=>{p.life--;p.y-=.45;ctx.globalAlpha=Math.max(0,p.life/58);ctx.fillStyle=p.color;ctx.font="bold 14px Courier New";ctx.textAlign="center";ctx.shadowBlur=8;ctx.shadowColor=p.color;ctx.fillText(p.text,p.x,p.y);ctx.shadowBlur=0;ctx.globalAlpha=1;}); }
  function draw(){ ctx.fillStyle="#000";ctx.fillRect(0,0,canvas.width,canvas.height); drawMaze(); drawExtras(); if(state!=="gameover")pac.draw(); ghosts.forEach(g=>g.draw()); if(state==="win"){ctx.fillStyle="#ffcc00";ctx.font="bold 28px Courier New";ctx.textAlign="center";ctx.fillText("LEVEL CLEAR!",canvas.width/2,ROWS*TILE+30);} }
  function tick(){ frame++; if(state==="playing"){ modeTimer++; if(mode==="scatter"&&modeTimer>420){mode="chase";modeTimer=0;} else if(mode==="chase"&&modeTimer>1200){mode="scatter";modeTimer=0;} pac.update(); ghosts.forEach(g=>g.update()); collisions(); if(pellets<=0){state="win";timer=120;beep(880,.18,"triangle",.07);} if(!ghosts.some(g=>g.mode==="fright"))ghostChain=0; } else if(state==="dying"){pac.update(); if(--timer<=0)loseLife();} else if(state==="win"&&--timer<=0)nextLevel(); updateHud(); labels(); draw(); requestAnimationFrame(tick); }
  function queue(dir){
    if(!pac||!DIRS[dir])return;
    const d=DIRS[dir];
    pac.next=d;
    if(state==="ready")start();
    if(!["playing","ready"].includes(state))return;

    const cx=pac.tx*TILE+TILE/2, cy=pac.ty*TILE+TILE/2;
    const isReverse=pac.dir!==DIRS.none&&d.x===-pac.dir.x&&d.y===-pac.dir.y;
    if(isReverse&&!isWall(pac.tx+d.x,pac.ty+d.y)){
      pac.dir=d;
      return;
    }

    // Mobile buttons and short swipes should feel immediate, not like they are
    // waiting for a slow click. If Pac-Man is close enough to the lane center,
    // snap to the lane and turn right away.
    const turnSlack=Math.max(pac.speed*3.2,TILE*.45);
    if(d.y!==0&&Math.abs(pac.x-cx)<=turnSlack&&!isWall(pac.tx,pac.ty+d.y)){
      pac.x=cx;
      pac.dir=d;
    }else if(d.x!==0&&Math.abs(pac.y-cy)<=turnSlack&&!isWall(pac.tx+d.x,pac.ty)){
      pac.y=cy;
      pac.dir=d;
    }
  }
  function start(){ if(audioCtx?.state==="suspended")audioCtx.resume(); if(state==="gameover")newGame(); overlay.classList.add("hidden"); state="playing"; timer=0; beep(760,.08,"square",.045); }
  function pause(){ if(state==="playing"){state="paused";overlay.classList.remove("hidden");overlayText.textContent="PAUSED";overlaySub.textContent="Press P, Resume, or GO to keep playing.";startBtn.textContent="RESUME";} else if(state==="paused"){overlay.classList.add("hidden");state="playing";} labels(); }
  function clearHeldDir(){
    heldDir=null;
    if(holdRaf){ cancelAnimationFrame(holdRaf); holdRaf=null; }
    document.querySelectorAll("[data-dir]").forEach((b)=>b.classList.remove("active"));
  }
  function holdLoop(){
    if(!heldDir){ holdRaf=null; return; }
    queue(heldDir);
    holdRaf=requestAnimationFrame(holdLoop);
  }
  function setHeldDir(dir,btn){
    if(!DIRS[dir])return;
    heldDir=dir;
    document.querySelectorAll("[data-dir]").forEach((b)=>b.classList.toggle("active", b===btn));
    queue(dir);
    if(!holdRaf) holdRaf=requestAnimationFrame(holdLoop);
  }
  document.addEventListener("keydown",e=>{ const k=e.key.toLowerCase(); if(k==="arrowup"||k==="w")queue("up"); else if(k==="arrowdown"||k==="s")queue("down"); else if(k==="arrowleft"||k==="a")queue("left"); else if(k==="arrowright"||k==="d")queue("right"); else if(k==="enter"||k===" "){ if(["ready","gameover","paused"].includes(state))start(); } else if(k==="p"||k==="escape")pause(); if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))e.preventDefault(); });
  canvas.addEventListener("pointerdown",e=>{e.preventDefault();swipeStart={x:e.clientX,y:e.clientY};canvas.setPointerCapture?.(e.pointerId);},{passive:false}); canvas.addEventListener("pointermove",e=>{if(!swipeStart)return; const dx=e.clientX-swipeStart.x,dy=e.clientY-swipeStart.y; if(Math.hypot(dx,dy)<SWIPE_THRESHOLD)return; queue(Math.abs(dx)>Math.abs(dy)?(dx>0?"right":"left"):(dy>0?"down":"up")); swipeStart={x:e.clientX,y:e.clientY};},{passive:false}); canvas.addEventListener("pointerup",()=>swipeStart=null); canvas.addEventListener("pointercancel",()=>swipeStart=null);
  document.querySelectorAll("[data-dir]").forEach(btn=>{
    btn.addEventListener("pointerdown",e=>{e.preventDefault();btn.setPointerCapture?.(e.pointerId);setHeldDir(btn.dataset.dir,btn);},{passive:false});
    btn.addEventListener("pointermove",e=>{
      e.preventDefault();
      const el=document.elementFromPoint(e.clientX,e.clientY)?.closest?.("[data-dir]");
      if(el&&el.dataset.dir!==heldDir)setHeldDir(el.dataset.dir,el);
    },{passive:false});
    btn.addEventListener("pointerup",e=>{e.preventDefault();clearHeldDir();},{passive:false});
    btn.addEventListener("pointercancel",clearHeldDir);
    btn.addEventListener("lostpointercapture",clearHeldDir);
  });
  startBtn.addEventListener("click",start); quickStart.addEventListener("click",()=>state==="paused"?pause():start()); pauseBtn.addEventListener("click",pause); restartBtn.addEventListener("click",()=>{newGame();start();}); soundBtn.addEventListener("click",()=>{sound=!sound;soundBtn.textContent=sound?"SOUND ON":"SOUND OFF";soundBtn.setAttribute("aria-pressed",String(sound)); if(sound)beep(900,.08,"triangle",.05);});
  buildMaze(); place(); newGame(); requestAnimationFrame(tick);
})();
