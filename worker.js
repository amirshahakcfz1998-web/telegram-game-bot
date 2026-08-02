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
  canvas { background: #cdeeff; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); touch-action: manipulation; }
  #overlay {
    position: absolute; inset: 0; background: rgba(0,0,0,0.6); color: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; z-index: 10; padding: 20px;
  }
  #overlay h1 { font-size: 24px; margin-bottom: 6px; }
  #overlay p { margin: 4px 0; font-size: 14px; }
  #overlay button {
    margin-top: 16px; padding: 12px 28px; font-size: 16px; border: none; border-radius: 24px;
    background: #ff5a5f; color: #fff; font-weight: bold;
  }
  .hidden { display: none !important; }
  #board { margin-top: 12px; font-size: 13px; opacity: 0.95; max-height: 130px; overflow-y: auto; width: 90%; }
  #board div { display: flex; justify-content: space-between; padding: 2px 10px; }
  #levelUp {
    position: absolute; top: 42%; width: 100%; text-align: center; color: #fff;
    font-size: 30px; font-weight: bold; z-index: 6; text-shadow: 0 3px 8px #000; opacity: 0; transition: opacity 0.35s;
  }
</style>
</head>
<body>
<div id="hud">🪙 <span id="score">0</span> &nbsp;|&nbsp; لول <span id="level">1</span> &nbsp;|&nbsp; رکورد: <span id="best">0</span></div>
<div id="levelUp"></div>
<canvas id="game" width="380" height="500"></canvas>
<div id="overlay">
  <h1>🏃 بدو بدو و پرش</h1>
  <p>برای پرش روی صفحه ضربه بزن، سکه‌ها رو جمع کن</p>
  <p>هر ۱۰۰ سکه یک لول سریع‌تر میشه</p>
  <button id="startBtn">شروع بازی</button>
  <div id="board"><b>برترین‌ها</b></div>
</div>

<script>
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const user = tg?.initDataUnsafe?.user || { id: 0, first_name: "مهمان" };

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

let player, obstacles, coins, score, level, running, speed, spawnTimer, coinTimer, frame, clouds, groundOffset;

function resetGame() {
  player = { x: 70, y: GROUND_Y - 46, w: 30, h: 46, vy: 0, jumping: false, legPhase: 0 };
  obstacles = [];
  coins = [];
  score = 0;
  level = 1;
  speed = 4.5;
  spawnTimer = 60;
  coinTimer = 35;
  frame = 0;
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
  if (!player.jumping) {
    player.vy = -13.5;
    player.jumping = true;
  }
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
  const y = high ? GROUND_Y - 100 - Math.random() * 30 : GROUND_Y - 30;
  coins.push({ x: W + 10, y, r: 10, collected: false, spin: 0 });
}

function showLevelUp() {
  levelUpEl.textContent = '🎉 لول ' + level + '!';
  levelUpEl.style.opacity = '1';
  setTimeout(() => { levelUpEl.style.opacity = '0'; }, 850);
}

function update() {
  if (!running) return;
  frame++;
  groundOffset = (groundOffset + speed) % 40;

  player.vy += 0.75;
  player.y += player.vy;
  if (player.y >= GROUND_Y - player.h) {
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    if (player.jumping) player.jumping = false;
  }
  if (!player.jumping) player.legPhase += 0.35;

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
      }
    }
  }
  coins = coins.filter(c => !c.collected);

  const newLevel = Math.floor(score / 100) + 1;
  if (newLevel !== level) {
    level = newLevel;
    levelEl.textContent = level;
    speed = 4.5 + (level - 1) * 0.8;
    showLevelUp();
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, '#8fd3ff');
  sky.addColorStop(1, '#d9f4ff');
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

  ctx.fillStyle = '#6bbf59';
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
  const legSwing = player.jumping ? 0.5 : Math.sin(player.legPhase) * 0.9;

  ctx.save();
  ctx.translate(x + w / 2, y + h);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0, 4, w * 0.5, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // back leg
  ctx.strokeStyle = '#2b3a67';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.42);
  ctx.lineTo(-8 * legSwing, -8);
  ctx.stroke();

  // front leg
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.42);
  ctx.lineTo(8 * legSwing, -8);
  ctx.stroke();

  // body
  ctx.fillStyle = '#e0574c';
  ctx.beginPath();
  ctx.moveTo(-9, -h * 0.42);
  ctx.lineTo(9, -h * 0.42);
  ctx.lineTo(7, -h * 0.82);
  ctx.lineTo(-7, -h * 0.82);
  ctx.closePath();
  ctx.fill();

  // arms
  ctx.strokeStyle = '#e0574c';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(-4, -h * 0.78);
  ctx.lineTo(-10 * legSwing, -h * 0.55);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(4, -h * 0.78);
  ctx.lineTo(10 * legSwing, -h * 0.55);
  ctx.stroke();

  // head
  ctx.fillStyle = '#f4c199';
  ctx.beginPath();
  ctx.arc(0, -h * 0.95, 9, 0, Math.PI * 2);
  ctx.fill();

  // hair
  ctx.fillStyle = '#3b2a20';
  ctx.beginPath();
  ctx.arc(0, -h * 0.99, 9.5, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawObstacle(o) {
  if (o.type === 'rock') {
    ctx.fillStyle = '#8d8d8d';
    ctx.beginPath();
    ctx.moveTo(o.x, o.y + o.h);
    ctx.lineTo(o.x + 4, o.y + 6);
    ctx.lineTo(o.x + o.w * 0.5, o.y);
    ctx.lineTo(o.x + o.w - 4, o.y + 8);
    ctx.lineTo(o.x + o.w, o.y + o.h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#6b6b6b';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    ctx.fillStyle = '#a9702f';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = '#6e4718';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y, o.w, o.h);
    ctx.beginPath();
    ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + o.w, o.y + o.h);
    ctx.moveTo(o.x + o.w, o.y); ctx.lineTo(o.x, o.y + o.h);
    ctx.stroke();
  }
}

function drawCoin(c) {
  ctx.save();
  ctx.translate(c.x, c.y);
  const squash = Math.abs(Math.cos(c.spin));
  ctx.scale(squash * 0.9 + 0.15, 1);
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(0, 0, c.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e0a500';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function draw() {
  drawBackground();
  for (const o of obstacles) drawObstacle(o);
  for (const c of coins) drawCoin(c);
  drawBoy();
}

function loop() {
  update();
  draw();
  if (running) requestAnimationFrame(loop);
}

async function endGame() {
  running = false;
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
      \`<div><span>\${i+1}. \${d.name}</span><span>\${d.score}</span></div>\`).join('');
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
    margin: 0; padding: 0; background: #1b1b1b; font-family: Tahoma, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; overflow: hidden; touch-action: manipulation;
  }
  #hud { position: absolute; top: 10px; width: 100%; text-align: center; color: #fff; font-weight: bold; font-size: 16px; z-index: 5; }
  canvas { background: #5a915a; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
  #overlay {
    position: absolute; inset: 0; background: rgba(0,0,0,0.7); color: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; z-index: 10; padding: 20px;
  }
  #overlay h1 { font-size: 22px; margin-bottom: 6px; }
  #overlay p { margin: 4px 0; font-size: 14px; opacity: 0.9; }
  #overlay button {
    margin-top: 16px; padding: 12px 28px; font-size: 16px; border: none; border-radius: 24px;
    background: #ffd23f; color: #222; font-weight: bold;
  }
  .hidden { display: none !important; }
  #board { margin-top: 12px; font-size: 13px; max-height: 130px; overflow-y: auto; width: 90%; }
  #board div { display: flex; justify-content: space-between; padding: 2px 10px; }
  #levelUp {
    position: absolute; top: 45%; width: 100%; text-align: center; color: #ffd23f;
    font-size: 28px; font-weight: bold; z-index: 6; text-shadow: 0 2px 6px #000; opacity: 0; transition: opacity 0.3s;
  }
</style>
</head>
<body>
<div id="hud">امتیاز: <span id="score">0</span> &nbsp;|&nbsp; لول: <span id="level">1</span> &nbsp;|&nbsp; رکورد: <span id="best">0</span></div>
<div id="levelUp"></div>
<canvas id="game" width="340" height="540"></canvas>
<div id="overlay">
  <h1>🏎️ جاده سه‌لاین</h1>
  <p>با ضربه به چپ یا راست صفحه لاین عوض کن</p>
  <p>هر ۲۰۰ امتیاز یک لول سخت‌تر میشه</p>
  <button id="startBtn">شروع بازی</button>
  <div id="board"><b>برترین‌ها</b></div>
</div>

<script>
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const user = tg?.initDataUnsafe?.user || { id: 0, first_name: "مهمان" };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const bestEl = document.getElementById('best');
const boardEl = document.getElementById('board');
const levelUpEl = document.getElementById('levelUp');

const W = canvas.width, H = canvas.height;
const LANES = 3;
const ROAD_MARGIN = 60;
const LANE_W = (W - ROAD_MARGIN * 2) / LANES;

let best = Number(localStorage.getItem('racing_best') || 0);
bestEl.textContent = best;

let car, obstacles, props, score, level, running, speed, spawnTimer, spawnInterval, propTimer, roadOffset;
const CAR_COLORS = ['#e63946', '#3a86ff', '#ffb703', '#6a994e', '#8338ec'];

function laneX(lane) { return ROAD_MARGIN + lane * LANE_W + LANE_W / 2; }

function resetGame() {
  car = { lane: 1, w: 38, h: 62, y: H - 110 };
  obstacles = [];
  props = [];
  score = 0;
  level = 1;
  speed = 3.4;
  spawnInterval = 78;
  spawnTimer = 40;
  propTimer = 20;
  roadOffset = 0;
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
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = t.clientX - rect.left;
  moveLane(x < rect.width / 2 ? -1 : 1);
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  moveLane(x < rect.width / 2 ? -1 : 1);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') moveLane(-1);
  if (e.key === 'ArrowRight') moveLane(1);
});

function spawnObstacle() {
  const lane = Math.floor(Math.random() * LANES);
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  obstacles.push({ lane, y: -90, w: 36, h: 60, passed: false, color });
}

function spawnProp() {
  const side = Math.random() < 0.5 ? 'left' : 'right';
  const type = Math.random() < 0.5 ? 'tree' : 'house';
  const x = side === 'left' ? 10 + Math.random() * (ROAD_MARGIN - 40) : W - 10 - Math.random() * (ROAD_MARGIN - 40);
  props.push({ x, y: -60, type, side });
}

function showLevelUp() {
  levelUpEl.textContent = 'لول ' + level + '!';
  levelUpEl.style.opacity = '1';
  setTimeout(() => { levelUpEl.style.opacity = '0'; }, 900);
}

function update() {
  if (!running) return;

  roadOffset = (roadOffset + speed) % 44;

  spawnTimer--;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = spawnInterval;
  }
  propTimer--;
  if (propTimer <= 0) {
    spawnProp();
    propTimer = 55 + Math.floor(Math.random() * 20);
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.y += speed;
    if (!o.passed && o.y > car.y) {
      o.passed = true;
      score += 5;
    }
    if (o.y > H + 80) obstacles.splice(i, 1);
  }
  for (let i = props.length - 1; i >= 0; i--) {
    props[i].y += speed;
    if (props[i].y > H + 60) props.splice(i, 1);
  }

  const newLevel = Math.floor(score / 200) + 1;
  if (newLevel !== level) {
    level = newLevel;
    levelEl.textContent = level;
    speed = 3.4 + (level - 1) * 0.85;
    spawnInterval = Math.max(32, 78 - (level - 1) * 6);
    showLevelUp();
  }

  for (const o of obstacles) {
    if (car.lane === o.lane && car.y < o.y + o.h && car.y + car.h > o.y) {
      endGame();
      return;
    }
  }

  score += 1;
  scoreEl.textContent = score;
}

function drawHouse(x, y, side) {
  const flip = side === 'left' ? -1 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#e8dcc8';
  ctx.fillRect(-14, -10, 28, 22);
  ctx.fillStyle = '#b5453f';
  ctx.beginPath();
  ctx.moveTo(-18, -10);
  ctx.lineTo(0, -26);
  ctx.lineTo(18, -10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6ea8d8';
  ctx.fillRect(-6, -2, 12, 10);
  ctx.restore();
}

function drawTree(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#6e4a2e';
  ctx.fillRect(-3, 0, 6, 14);
  ctx.fillStyle = '#3f8f46';
  ctx.beginPath();
  ctx.arc(0, -6, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4fa855';
  ctx.beginPath();
  ctx.arc(-5, -10, 9, 0, Math.PI * 2);
  ctx.arc(6, -9, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGrass() {
  const g1 = ctx.createLinearGradient(0, 0, 0, H);
  g1.addColorStop(0, '#6fae5f');
  g1.addColorStop(1, '#4f8f47');
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let y = -roadOffset; y < H; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(ROAD_MARGIN - 6, y);
    ctx.moveTo(W - ROAD_MARGIN + 6, y); ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawRoad() {
  const rg = ctx.createLinearGradient(ROAD_MARGIN, 0, W - ROAD_MARGIN, 0);
  rg.addColorStop(0, '#3a3a3a');
  rg.addColorStop(0.5, '#464646');
  rg.addColorStop(1, '#3a3a3a');
  ctx.fillStyle = rg;
  ctx.fillRect(ROAD_MARGIN, 0, W - ROAD_MARGIN * 2, H);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(ROAD_MARGIN - 4, 0, 4, H);
  ctx.fillRect(W - ROAD_MARGIN, 0, 4, H);

  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 3;
  ctx.setLineDash([20, 18]);
  ctx.lineDashOffset = -roadOffset;
  for (let l = 1; l < LANES; l++) {
    const x = ROAD_MARGIN + l * LANE_W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawCar(x, y, w, h, body, isPlayer) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, h * 0.42, w * 0.55, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, shade(body, -25));
  grad.addColorStop(0.5, body);
  grad.addColorStop(1, shade(body, -25));

  ctx.fillStyle = grad;
  roundRect(-w / 2, -h / 2, w, h, 10);
  ctx.fill();

  ctx.fillStyle = 'rgba(30,40,60,0.85)';
  roundRect(-w / 2 + 5, -h / 2 + 8, w - 10, h * 0.32, 6);
  ctx.fill();

  ctx.fillStyle = isPlayer ? '#ffe27a' : '#ffdede';
  ctx.fillRect(-w / 2 + 4, -h / 2 + 2, 6, 5);
  ctx.fillRect(w / 2 - 10, -h / 2 + 2, 6, 5);

  ctx.fillStyle = '#c0392b';
  ctx.fillRect(-w / 2 + 4, h / 2 - 7, 6, 5);
  ctx.fillRect(w / 2 - 10, h / 2 - 7, 6, 5);

  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-w / 2 - 2, -h * 0.28, 4, 14);
  ctx.fillRect(w / 2 - 2, -h * 0.28, 4, 14);
  ctx.fillRect(-w / 2 - 2, h * 0.1, 4, 14);
  ctx.fillRect(w / 2 - 2, h * 0.1, 4, 14);

  ctx.restore();
}

function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0x00FF) + percent;
  let b = (num & 0x0000FF) + percent;
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw() {
  drawGrass();
  drawRoad();

  for (const p of props) {
    if (p.type === 'tree') drawTree(p.x, p.y);
    else drawHouse(p.x, p.y, p.side);
  }

  for (const o of obstacles) {
    drawCar(laneX(o.lane), o.y, o.w, o.h, o.color, false);
  }

  drawCar(laneX(car.lane), car.y, car.w, car.h, '#2e7dff', true);
}

function loop() {
  update();
  draw();
  if (running) requestAnimationFrame(loop);
}

async function endGame() {
  running = false;
  if (score > best) {
    best = score;
    localStorage.setItem('racing_best', best);
    bestEl.textContent = best;
  }
  document.getElementById('startBtn').textContent = 'دوباره بازی کن';
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
    boardEl.innerHTML = '<b>برترین‌ها</b>' + data.map((d, i) =>
      \`<div><span>\${i+1}. \${d.name}</span><span>\${d.score}</span></div>\`).join('');
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
// ================= تنظیمات =================
// این مقادیر رو در Cloudflare Workers -> Settings -> Variables تعریف کن:
// BOT_TOKEN  = توکن ربات از @BotFather
// BASE_URL   = آدرس ورکر (مثلا https://mybot.username.workers.dev)
// KV binding = یک KV namespace با نام GAMEDB بساز و به این ورکر وصل کن

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
      if (url.pathname === '/webhookinfo') {
        const result = await tg(env, 'getWebhookInfo', {});
        return new Response(JSON.stringify(result, null, 2), { headers: { 'content-type': 'application/json' } });
      }
      return new Response('Bot is running ✅');
    } catch (err) {
      return new Response('Error: ' + err.message, { status: 500 });
    }
  }
};

// ================= کمکی: تماس با تلگرام =================
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

// ================= امتیازها و لیدربورد =================
async function saveScore(request, env) {
  const body = await request.json();
  const { game, user_id, name, score } = body;
  if (!game || !user_id || typeof score !== 'number') {
    return new Response('bad request', { status: 400 });
  }
  const key = `score:${game}:${user_id}`;
  const existing = await env.GAMEDB.get(key, 'json');
  if (!existing || score > existing.score) {
    await env.GAMEDB.put(key, JSON.stringify({ name, score, user_id }));
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
}

async function getLeaderboard(request, env, url) {
  const game = url.searchParams.get('game') || 'runner';
  const list = await env.GAMEDB.list({ prefix: `score:${game}:` });
  const entries = [];
  for (const k of list.keys) {
    const val = await env.GAMEDB.get(k.name, 'json');
    if (val) entries.push(val);
  }
  entries.sort((a, b) => b.score - a.score);
  return new Response(JSON.stringify(entries.slice(0, 10)), { headers: { 'content-type': 'application/json' } });
}

// ================= وبهوک اصلی =================
async function handleWebhook(request, env) {
  const update = await request.json();

  if (update.callback_query) {
    await handleCallback(update.callback_query, env);
    return new Response('ok');
  }

  const msg = update.message;
  if (!msg || !msg.text) return new Response('ok');

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text === '/start' || text === '/games' || text === 'بازی‌ها') {
    await sendGameMenu(chatId, env);
    return new Response('ok');
  }

  if (text === '/دوز' || text === '/xo' || text === 'دوز') {
    await startTicTacToe(chatId, msg.from, env);
    return new Response('ok');
  }

  if (text === '/رکوردها' || text === '/leaderboard') {
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: 'برای دیدن رکوردها وارد بازی «بدو بدو» یا «جاده سه‌لاین» شو، جدول برترین‌ها بالای صفحه‌ست.'
    });
    return new Response('ok');
  }

  // هر پیام دیگه‌ای (فقط در چت خصوصی) دوباره منوی بازی‌ها رو نشون میده
  if (msg.chat.type === 'private') {
    await sendGameMenu(chatId, env);
  }

  return new Response('ok');
}

async function sendGameMenu(chatId, env) {
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: '🎮 سلام! یکی از بازی‌ها رو انتخاب کن:',
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌⭕ دوز (نه مهره)', callback_data: 'menu:ttt' }],
        [{ text: '🏃 بدو بدو و پرش', web_app: { url: `${env.BASE_URL}/game/runner` } }],
        [{ text: '🏎️ جاده سه‌لاین', web_app: { url: `${env.BASE_URL}/game/racing` } }]
      ]
    }
  });
}

// ================= بازی دوز (Tic Tac Toe) =================
function emptyBoard() { return Array(9).fill(null); }

function renderBoard(board) {
  const symbols = { X: '❌', O: '⭕' };
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const row = [];
    for (let c = 0; c < 3; c++) {
      const idx = r * 3 + c;
      const val = board[idx];
      row.push({
        text: val ? symbols[val] : '➖',
        callback_data: `ttt|${idx}`
      });
    }
    rows.push(row);
  }
  return rows;
}

function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every(cell => cell)) return 'draw';
  return null;
}

async function startTicTacToe(chatId, from, env) {
  const key = `ttt:${chatId}`;
  const state = {
    board: emptyBoard(),
    players: { X: { id: from.id, name: from.first_name || 'بازیکن ۱' } },
    turn: 'X',
    status: 'waiting_for_o'
  };
  await env.GAMEDB.put(key, JSON.stringify(state));

  const sent = await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: `بازی دوز شروع شد!\n❌ ${state.players.X.name}\n⭕ منتظر بازیکن دوم... (روی یک خونه بزن تا وارد بازی بشی)`,
    reply_markup: { inline_keyboard: renderBoard(state.board) }
  });

  state.message_id = sent.result?.message_id;
  await env.GAMEDB.put(key, JSON.stringify(state));
}

async function handleCallback(cq, env) {
  const data = cq.data;
  const chatId = cq.message.chat.id;
  const from = cq.from;

  if (data === 'menu:ttt') {
    await startTicTacToe(chatId, from, env);
    await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }

  if (!data.startsWith('ttt|')) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
    return;
  }

  const idx = parseInt(data.split('|')[1], 10);
  const key = `ttt:${chatId}`;
  const state = await env.GAMEDB.get(key, 'json');

  if (!state) {
    await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'بازی‌ای در جریان نیست. با /دوز شروع کن.' });
    return;
  }

  if (state.status === 'waiting_for_o') {
    if (from.id === state.players.X.id) {
      await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'باید منتظر بمونی یه نفر دیگه وارد بشه!' });
      return;
    }
    state.players.O = { id: from.id, name: from.first_name || 'بازیکن ۲' };
    state.status = 'playing';
  }

  if (state.status === 'playing') {
    const currentPlayer = state.players[state.turn];
    if (from.id !== currentPlayer.id) {
      await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'نوبت تو نیست!' });
      return;
    }
    if (state.board[idx]) {
      await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id, text: 'این خونه پر شده!' });
      return;
    }
    state.board[idx] = state.turn;
    const winner = checkWinner(state.board);

    if (winner) {
      const text = winner === 'draw'
        ? '🤝 مساوی شد!'
        : `🎉 برنده: ${state.players[winner].name} (${winner === 'X' ? '❌' : '⭕'})`;
      await tg(env, 'editMessageText', {
        chat_id: chatId,
        message_id: cq.message.message_id,
        text: `❌ ${state.players.X.name}   ⭕ ${state.players.O.name}\n\n${text}`,
        reply_markup: { inline_keyboard: renderBoard(state.board) }
      });
      await env.GAMEDB.delete(key);
      await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
      return;
    }

    state.turn = state.turn === 'X' ? 'O' : 'X';
    await env.GAMEDB.put(key, JSON.stringify(state));

    await tg(env, 'editMessageText', {
      chat_id: chatId,
      message_id: cq.message.message_id,
      text: `❌ ${state.players.X.name}   ⭕ ${state.players.O.name}\n\nنوبت: ${state.turn === 'X' ? '❌ ' + state.players.X.name : '⭕ ' + state.players.O.name}`,
      reply_markup: { inline_keyboard: renderBoard(state.board) }
    });
  }

  await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
}
