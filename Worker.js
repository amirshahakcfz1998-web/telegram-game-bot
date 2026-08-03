export const RUNNER_HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>بدو بدو</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; padding: 0; background: #cdeeff;
    font-family: Tahoma, sans-serif; display: flex; flex-direction: column;
    align-items: center; justify-content: center; height: 100vh; overflow: hidden; touch-action: manipulation;
  }
  #hud { position: absolute; top: 10px; width: 100%; text-align: center; color: #2b2b2b; font-weight: bold; font-size: 16px; z-index: 5; text-shadow: 0 1px 2px #fff; }
  canvas { background: #cdeeff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.25); touch-action: manipulation; }
  #overlay {
    position: absolute; inset: 0; background: rgba(0,0,0,0.65); color: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; z-index: 10; padding: 20px; backdrop-filter: blur(3px);
  }
  #overlay h1 { font-size: 24px; margin-bottom: 6px; color: #ffd23f; }
  #overlay p { margin: 4px 0; font-size: 14px; opacity: 0.9; }
  #overlay button {
    margin-top: 16px; padding: 12px 32px; font-size: 16px; border: none; border-radius: 24px;
    background: linear-gradient(135deg, #ff5a5f, #e0383e); color: #fff; font-weight: bold;
    box-shadow: 0 4px 15px rgba(255,90,95,0.4); cursor: pointer;
  }
  .hidden { display: none !important; }
  #board { margin-top: 14px; font-size: 13px; opacity: 0.95; max-height: 140px; overflow-y: auto; width: 90%; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 6px; }
  #board div { display: flex; justify-content: space-between; padding: 4px 10px; }
  #levelUp {
    position: absolute; top: 40%; width: 100%; text-align: center; color: #ffd23f;
    font-size: 32px; font-weight: bold; z-index: 6; text-shadow: 0 4px 10px rgba(0,0,0,0.8); opacity: 0; transition: opacity 0.35s;
  }
  #soundBtn {
    position: absolute; top: 8px; left: 10px; z-index: 8; background: rgba(0,0,0,0.35); border: none;
    color: #fff; font-size: 20px; width: 38px; height: 38px; border-radius: 50%;
  }
</style>
</head>
<body>
<div id="hud">🪙 <span id="score">0</span> &nbsp;|&nbsp; لول <span id="level">1</span> &nbsp;|&nbsp; رکورد: <span id="best">0</span></div>
<button id="soundBtn">🔊</button>
<div id="levelUp"></div>
<canvas id="game" width="380" height="500"></canvas>
<div id="overlay">
  <h1>🏃 بدو بدو و پرش (دو مرحله‌ای)</h1>
  <p>برای پرش تک یا **پرش دوتایی** روی صفحه ضربه بزن!</p>
  <p>سکه‌ها رو جمع کن و لول آپ شو</p>
  <button id="startBtn">شروع بازی</button>
  <div id="board"><b>برترین‌ها</b></div>
</div>

<script>
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const user = tg?.initDataUnsafe?.user || { id: 0, first_name: "مهمان" };

let soundOn = true;
let actx = null;
function beep(freq, dur, type) {
  if (!soundOn) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.value = 0.09;
    o.connect(g); g.connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  jump: () => beep(520, 0.12, 'triangle'),
  doubleJump: () => { beep(650, 0.1, 'triangle'); setTimeout(() => beep(850, 0.1, 'triangle'), 50); },
  coin: () => { beep(850, 0.08); setTimeout(() => beep(1250, 0.08), 60); },
  crash: () => beep(110, 0.4, 'sawtooth'),
  levelUp: () => { beep(600, 0.12); setTimeout(() => beep(900, 0.15), 100); }
};

const soundBtn = document.getElementById('soundBtn');
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
});

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const bestEl = document.getElementById('best');
const boardEl = document.getElementById('board');
const levelUpEl = document.getElementById('levelUp');

const W = canvas.width, H = canvas.height;
const GROUND_Y = H - 70;

let best = Number(localStorage.getItem('runner_best') || 0);
bestEl.textContent = best;

let player, obstacles, coins, particles, floatingTexts, score, level, running, speed, spawnTimer, coinTimer, clouds, groundOffset, jumpsLeft;

function resetGame() {
  player = { x: 70, y: GROUND_Y - 46, w: 30, h: 46, vy: 0, legPhase: 0 };
  jumpsLeft = 2;
  obstacles = [];
  coins = [];
  particles = [];
  floatingTexts = [];
  score = 0;
  level = 1;
  speed = 4.8;
  spawnTimer = 60;
  coinTimer = 35;
  groundOffset = 0;
  clouds = [
    { x: 60, y: 60, s: 1 }, { x: 220, y: 100, s: 0.7 }, { x: 330, y: 50, s: 0.9 }
  ];
  running = true;
  scoreEl.textContent = 0;
  levelEl.textContent = 1;
}

function jump() {
  if (!running) return;
  if (jumpsLeft > 0) {
    player.vy = jumpsLeft === 2 ? -13 : -11;
    if (jumpsLeft === 2) sfx.jump(); else sfx.doubleJump();
    createJumpSparks(player.x + player.w / 2, player.y + player.h);
    jumpsLeft--;
  }
}

function createJumpSparks(x, y) {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x, y, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 2 + 1,
      r: 3, color: '#ffffff', life: 15
    });
  }
}

function createCoinSparks(x, y) {
  for (let i = 0; i < 10; i++) {
    particles.push({
      x, y, vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6,
      r: 2.5 + Math.random() * 2, color: '#ffd23f', life: 20
    });
  }
  floatingTexts.push({ x, y, text: '+10', vy: -1.5, alpha: 1 });
}

canvas.addEventListener('touchstart', (e) => { e.preventDefault(); jump(); }, { passive: false });
canvas.addEventListener('mousedown', jump);
document.addEventListener('keydown', (e) => { if (e.code === 'Space') jump(); });

function spawnObstacle() {
  const types = ['rock', 'crate'];
  const type = types[Math.floor(Math.random() * types.length)];
  const h = type === 'rock' ? 28 : 34;
  obstacles.push({ x: W + 10, y: GROUND_Y - h, w: type === 'rock' ? 32 : 30, h, type });
}

function spawnCoin() {
  const high = Math.random() < 0.5;
  const y = high ? GROUND_Y - 110 - Math.random() * 30 : GROUND_Y - 35;
  coins.push({ x: W + 10, y, r: 10, collected: false, spin: 0 });
}

function showLevelUp() {
  levelUpEl.textContent = '🎉 لول ' + level + '!';
  levelUpEl.style.opacity = '1';
  setTimeout(() => { levelUpEl.style.opacity = '0'; }, 850);
}

function update() {
  if (!running) return;
  groundOffset = (groundOffset + speed) % 40;

  player.vy += 0.72;
  player.y += player.vy;
  if (player.y >= GROUND_Y - player.h) {
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    jumpsLeft = 2;
  }
  if (jumpsLeft === 2) player.legPhase += 0.35;

  spawnTimer--;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = Math.max(38, 75 - level * 3);
  }
  coinTimer--;
  if (coinTimer <= 0) {
    spawnCoin();
    coinTimer = 45 + Math.floor(Math.random() * 30);
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= speed;
    if (obstacles[i].x + obstacles[i].w < 0) obstacles.splice(i, 1);
  }
  for (let i = coins.length - 1; i >= 0; i--) {
    coins[i].x -= speed;
    coins[i].spin += 0.2;
    if (coins[i].x < -20) coins.splice(i, 1);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy; ft.alpha -= 0.04;
    if (ft.alpha <= 0) floatingTexts.splice(i, 1);
  }

  const px = player.x, py = player.y, pw = player.w, ph = player.h;
  for (const o of obstacles) {
    if (px < o.x + o.w - 4 && px + pw - 4 > o.x && py < o.y + o.h && py + ph > o.y) {
      endGame();
      return;
    }
  }
  for (const c of coins) {
    if (!c.collected) {
      const dx = (px + pw / 2) - c.x, dy = (py + ph / 2) - c.y;
      if (Math.sqrt(dx * dx + dy * dy) < c.r + 16) {
        c.collected = true;
        score += 10;
        scoreEl.textContent = score;
        sfx.coin();
        createCoinSparks(c.x, c.y);
      }
    }
  }
  coins = coins.filter(c => !c.collected);

  const newLevel = Math.floor(score / 100) + 1;
  if (newLevel !== level) {
    level = newLevel;
    levelEl.textContent = level;
    speed = 4.8 + (level - 1) * 0.8;
    showLevelUp();
    sfx.levelUp();
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#74c0fc');
  sky.addColorStop(1, '#e7f5ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, GROUND_Y);

  ctx.fillStyle = '#fff7c2';
  ctx.beginPath(); ctx.arc(W - 50, 45, 24, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const c of clouds) {
    c.x -= speed * 0.15 * c.s;
    if (c.x < -50) c.x = W + 50;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 26 * c.s, 14 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x + 18 * c.s, c.y + 5, 18 * c.s, 11 * c.s, 0, 0, Math.PI * 2);
    ctx.ellipse(c.x - 18 * c.s, c.y + 5, 16 * c.s, 10 * c.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#51cf66';
  ctx.fillRect(0, GROUND_Y, W, 14);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(0, GROUND_Y + 14, W, H - GROUND_Y - 14);

  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 3;
  for (let x = -groundOffset; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y + 22);
    ctx.lineTo(x + 20, GROUND_Y + 22);
    ctx.stroke();
  }
}

function drawBoy() {
  const x = player.x, y = player.y, w = player.w, h = player.h;
  const legSwing = jumpsLeft < 2 ? 0.5 : Math.sin(player.legPhase) * 0.9;

  ctx.save();
  ctx.translate(x + w / 2, y + h);

  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 4, w * 0.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#2b3a67'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -h * 0.42); ctx.lineTo(-8 * legSwing, -8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -h * 0.42); ctx.lineTo(8 * legSwing, -8); ctx.stroke();

  ctx.fillStyle = '#ff6b6b';
  ctx.beginPath();
  ctx.moveTo(-9, -h * 0.42); ctx.lineTo(9, -h * 0.42);
  ctx.lineTo(7, -h * 0.82); ctx.lineTo(-7, -h * 0.82);
  ctx.closePath(); ctx.fill();

  ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-4, -h * 0.78); ctx.lineTo(-10 * legSwing, -h * 0.55); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -h * 0.78); ctx.lineTo(10 * legSwing, -h * 0.55); ctx.stroke();

  ctx.fillStyle = '#f4c199';
  ctx.beginPath(); ctx.arc(0, -h * 0.95, 9, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#3b2a20';
  ctx.beginPath(); ctx.arc(0, -h * 0.99, 9.5, Math.PI, Math.PI * 2); ctx.fill();

  ctx.restore();
}

function drawObstacle(o) {
  if (o.type === 'rock') {
    ctx.fillStyle = '#8d8d8d';
    ctx.beginPath();
    ctx.moveTo(o.x, o.y + o.h); ctx.lineTo(o.x + 4, o.y + 6);
    ctx.lineTo(o.x + o.w * 0.5, o.y); ctx.lineTo(o.x + o.w - 4, o.y + 8);
    ctx.lineTo(o.x + o.w, o.y + o.h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b6b6b'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    ctx.fillStyle = '#a9702f';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = '#6e4718'; ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y, o.w, o.h);
  }
}

function drawCoin(c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  const squash = Math.abs(Math.cos(c.spin));
  ctx.scale(squash * 0.9 + 0.15, 1);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.arc(0, 0, c.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#e0a500'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

function draw() {
  drawBackground();
  for (const o of obstacles) drawObstacle(o);
  for (const c of coins) drawCoin(c);
  drawBoy();

  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  for (const ft of floatingTexts) {
    ctx.fillStyle = `rgba(255, 210, 63, ${ft.alpha})`;
    ctx.font = 'bold 16px Tahoma';
    ctx.fillText(ft.text, ft.x - 10, ft.y);
  }
}

function loop() {
  update();
  draw();
  if (running) requestAnimationFrame(loop);
}

async function endGame() {
  running = false;
  sfx.crash();
  if (score > best) {
    best = score;
    localStorage.setItem('runner_best', best);
    bestEl.textContent = best;
  }
  document.getElementById('startBtn').textContent = 'دوباره بازی کن';
  overlay.classList.remove('hidden');
  overlay.querySelector('h1').textContent = '🏁 امتیاز: ' + score + ' (لول ' + level + ')';
  try {
    await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'runner', user_id: user.id, name: user.first_name || 'بازیکن', score })
    });
  } catch (e) {}
  loadLeaderboard();
}

async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard?game=runner');
    const data = await res.json();
    boardEl.innerHTML = '<b>برترین‌ها</b>' + data.map((d, i) =>
      `<div><span>${i+1}. ${d.name}</span><span>${d.score}</span></div>`).join('');
  } catch (e) {}
}

document.getElementById('startBtn').addEventListener('click', () => {
  overlay.classList.add('hidden');
  resetGame();
  loop();
});

loadLeaderboard();
</script>
</body>
</html>`;

export const RACING_HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>جاده سه‌لاین</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; padding: 0; background: #0d1117; font-family: Tahoma, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; overflow: hidden; touch-action: manipulation;
  }
  #hud { position: absolute; top: 10px; width: 100%; text-align: center; color: #fff; font-weight: bold; font-size: 16px; z-index: 5; text-shadow: 0 1px 3px rgba(0,0,0,0.6); }
  canvas { background: #5a915a; border-radius: 14px; box-shadow: 0 6px 28px rgba(0,0,0,0.5); }
  #overlay {
    position: absolute; inset: 0; border-radius: 14px; color: #fff; overflow-y: auto;
    background: radial-gradient(circle at 50% 0%, #23324a, #0d1117 75%);
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    text-align: center; z-index: 10; padding: 22px 18px 14px;
  }
  .hidden { display: none !important; }
  #overlay h1 { font-size: 24px; margin: 6px 0 2px; text-shadow: 0 2px 8px rgba(255,210,63,0.3); color: #ffd23f; }
  #overlay .tagline { margin: 2px 0 14px; font-size: 13px; opacity: 0.8; }
  #playBtn {
    margin-top: 6px; padding: 13px 40px; font-size: 17px; border: none; border-radius: 26px;
    background: linear-gradient(135deg,#ffd23f,#ff9f1c); color: #22190a; font-weight: bold;
    box-shadow: 0 6px 16px rgba(255,159,28,0.4); cursor: pointer;
  }
  #board {
    margin-top: 16px; font-size: 13px; width: 100%; max-width: 280px; background: rgba(255,255,255,0.06);
    border-radius: 12px; padding: 8px 4px; max-height: 150px; overflow-y: auto;
  }
  #board .boardTitle { font-weight: bold; margin-bottom: 4px; color: #ffd23f; }
  #board div.row { display: flex; justify-content: space-between; padding: 3px 10px; }
  #soundBtn {
    position: absolute; top: 8px; left: 10px; z-index: 8; background: rgba(0,0,0,0.4); border: none;
    color: #fff; font-size: 20px; width: 38px; height: 38px; border-radius: 50%;
  }
</style>
</head>
<body>
<div id="hud">امتیاز: <span id="score">0</span> &nbsp;|&nbsp; لول: <span id="level">1</span> &nbsp;|&nbsp; رکورد: <span id="best">0</span></div>
<button id="soundBtn">🔊</button>
<canvas id="game" width="340" height="540"></canvas>

<div id="overlay">
  <h1>🏎️ جاده سه‌لاین هیجان‌انگیز</h1>
  <p class="tagline">با لمس چپ یا راست جاده تغییر لاین بده!</p>
  <button id="playBtn">شروع بازی</button>
  <div id="board"><div class="boardTitle">برترین‌ها</div></div>
</div>

<script>
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const user = tg?.initDataUnsafe?.user || { id: 0, first_name: "مهمان" };

let soundOn = true;
let actx = null;
function beep(freq, dur, type) {
  if (!soundOn) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.value = 0.08;
    o.connect(g); g.connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  crash: () => beep(120, 0.4, 'sawtooth'),
  pass: () => beep(350, 0.05)
};

const soundBtn = document.getElementById('soundBtn');
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
});

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const bestEl = document.getElementById('best');
const boardEl = document.getElementById('board');

const W = canvas.width, H = canvas.height;
const LANES = 3;
const ROAD_MARGIN = 60;
const LANE_W = (W - ROAD_MARGIN * 2) / LANES;

let best = Number(localStorage.getItem('racing_best') || 0);
bestEl.textContent = best;

let car, obstacles, score, level, running, speed, spawnTimer, roadOffset, shakeTime;
const CAR_COLORS = ['#e63946', '#ffb703', '#6a994e', '#8338ec'];

function laneX(lane) { return ROAD_MARGIN + lane * LANE_W + LANE_W / 2; }

function resetGame() {
  car = { lane: 1, w: 36, h: 60, y: H - 110 };
  obstacles = [];
  score = 0;
  level = 1;
  speed = 4;
  spawnTimer = 40;
  roadOffset = 0;
  shakeTime = 0;
  running = true;
  levelEl.textContent = 1;
  scoreEl.textContent = 0;
}

function moveLane(dir) {
  if (!running) return;
  car.lane = Math.min(LANES - 1, Math.max(0, car.lane + dir));
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const x = e.touches[0].clientX - canvas.getBoundingClientRect().left;
  moveLane(x < canvas.offsetWidth / 2 ? -1 : 1);
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  const x = e.clientX - canvas.getBoundingClientRect().left;
  moveLane(x < canvas.offsetWidth / 2 ? -1 : 1);
});

function spawnObstacle() {
  const lane = Math.floor(Math.random() * LANES);
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  obstacles.push({ lane, y: -80, w: 34, h: 58, passed: false, color });
}

function update() {
  if (!running) return;
  roadOffset = (roadOffset + speed) % 40;

  spawnTimer--;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = Math.max(28, 65 - level * 4);
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.y += speed;
    if (!o.passed && o.y > car.y) {
      o.passed = true;
      score += 5;
      sfx.pass();
    }
    if (o.y > H + 80) obstacles.splice(i, 1);
  }

  const newLevel = Math.floor(score / 150) + 1;
  if (newLevel !== level) {
    level = newLevel;
    levelEl.textContent = level;
    speed = 4 + (level - 1) * 0.85;
  }

  for (const o of obstacles) {
    if (car.lane === o.lane && car.y < o.y + o.h && car.y + car.h > o.y) {
      shakeTime = 15;
      endGame();
      return;
    }
  }

  score += 1;
  scoreEl.textContent = score;
}

function drawRoad() {
  ctx.fillStyle = '#4f8f47'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(ROAD_MARGIN, 0, W - ROAD_MARGIN * 2, H);

  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3;
  ctx.setLineDash([20, 18]); ctx.lineDashOffset = -roadOffset;
  for (let l = 1; l < LANES; l++) {
    const x = ROAD_MARGIN + l * LANE_W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawCar(x, y, w, h, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = '#1e283c';
  ctx.fillRect(-w / 2 + 4, -h / 2 + 8, w - 8, h * 0.35);
  ctx.restore();
}

function draw() {
  ctx.save();
  if (shakeTime > 0) {
    ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    shakeTime--;
  }

  drawRoad();
  for (const o of obstacles) drawCar(laneX(o.lane), o.y, o.w, o.h, o.color);
  drawCar(laneX(car.lane), car.y, car.w, car.h, '#2e7dff');

  ctx.restore();
}

function loop() {
  update();
  draw();
  if (running) requestAnimationFrame(loop);
}

async function endGame() {
  running = false;
  sfx.crash();
  if (score > best) {
    best = score;
    localStorage.setItem('racing_best', best);
    bestEl.textContent = best;
  }
  document.getElementById('playBtn').textContent = 'دوباره بازی کن';
  overlay.classList.remove('hidden');
  overlay.querySelector('h1').textContent = '🏁 امتیاز: ' + score + ' (لول ' + level + ')';
  try {
    await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'racing', user_id: user.id, name: user.first_name || 'بازیکن', score })
    });
  } catch (e) {}
  loadLeaderboard();
}

async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard?game=racing');
    const data = await res.json();
    boardEl.innerHTML = '<div class="boardTitle">🏆 برترین‌ها</div>' + data.map((d, i) =>
      `<div class="row"><span>${i+1}. ${d.name}</span><span>${d.score}</span></div>`).join('');
  } catch (e) {}
}

document.getElementById('playBtn').addEventListener('click', () => {
  overlay.classList.add('hidden');
  resetGame();
  loop();
});

loadLeaderboard();
</script>
</body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/webhook' && request.method === 'POST') {
        return await handleWebhook(request, env);
      }
      if (url.pathname === '/game/runner') {
        return new Response(RUNNER_HTML, { headers: { 'content-type': 'text/html;charset=utf-8' } });
      }
      if (url.pathname === '/game/racing') {
        return new Response(RACING_HTML, { headers: { 'content-type': 'text/html;charset=utf-8' } });
      }
      if (url.pathname === '/api/score' && request.method === 'POST') {
        return await saveScore(request, env);
      }
      if (url.pathname === '/api/leaderboard') {
        return await getLeaderboard(request, env, url);
      }
      if (url.pathname === '/setwebhook') {
        return await setWebhook(env);
      }
      return new Response('Bot is running ✅');
    } catch (err) {
      return new Response('Error: ' + err.message, { status: 500 });
    }
  }
};

async function tg(env, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

async function setWebhook(env) {
  const result = await tg(env, 'setWebhook', { url: `${env.BASE_URL}/webhook` });
  return new Response(JSON.stringify(result, null, 2), { headers: { 'content-type': 'application/json' } });
}

async function saveScore(request, env) {
  const body = await request.json();
  const { game, user_id, name, score } = body;
  if (!game || !user_id || typeof score !== 'number') {
    return new Response('bad request', { status: 400 });
  }

  const lbKey = `lb:${game}`;
  let leaderboard = (await env.GAMEDB.get(lbKey, 'json')) || [];

  const idx = leaderboard.findIndex(item => String(item.user_id) === String(user_id));
  if (idx !== -1) {
    if (score > leaderboard[idx].score) {
      leaderboard[idx].score = score;
      leaderboard[idx].name = name;
    }
  } else {
    leaderboard.push({ user_id, name, score });
  }

  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 10);

  await env.GAMEDB.put(lbKey, JSON.stringify(leaderboard));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
}

async function getLeaderboard(request, env, url) {
  const game = url.searchParams.get('game') || 'runner';
  const leaderboard = (await env.GAMEDB.get(`lb:${game}`, 'json')) || [];
  return new Response(JSON.stringify(leaderboard), { headers: { 'content-type': 'application/json' } });
}

async function handleWebhook(request, env) {
  const update = await request.json();
  const msg = update.message;
  if (!msg || !msg.text) return new Response('ok');

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === '/start' || text === '/games' || text === 'بازی‌ها') {
    await sendGameMenu(chatId, env);
  }

  return new Response('ok');
}

async function sendGameMenu(chatId, env) {
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: '🎮 به ربات بازی خوش آمدید! یکی از بازی‌ها را انتخاب کنید:',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏃 بدو بدو و پرش (جدید)', web_app: { url: `${env.BASE_URL}/game/runner` } }],
        [{ text: '🏎️ جاده سه‌لاین (ارتقایافته)', web_app: { url: `${env.BASE_URL}/game/racing` } }]
      ]
    }
  });
}
