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

// ---- صدا (Web Audio, بدون فایل خارجی) ----
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
  jump: () => beep(500, 0.15, 'triangle'),
  coin: () => { beep(800, 0.08); setTimeout(() => beep(1100, 0.08), 60); },
  crash: () => beep(110, 0.4, 'sawtooth'),
  levelUp: () => { beep(600, 0.12); setTimeout(() => beep(900, 0.15), 100); }
};

const soundBtn = document.getElementById('soundBtn');
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
  saveProfile({ soundOn });
});

async function loadProfile() {
  try {
    const res = await fetch(\`/api/profile?user_id=\${user.id}&name=\${encodeURIComponent(user.first_name || 'بازیکن')}\`);
    const p = await res.json();
    soundOn = p.soundOn !== false;
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
  } catch (e) {}
}
async function saveProfile(fields) {
  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, name: user.first_name || 'بازیکن', ...fields })
    });
  } catch (e) {}
}
loadProfile();

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
    sfx.jump();
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
        sfx.coin();
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
    sfx.levelUp();
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
    margin: 0; padding: 0; background: #0d1117; font-family: Tahoma, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; overflow: hidden; touch-action: manipulation;
  }
  #hud { position: absolute; top: 10px; width: 100%; text-align: center; color: #fff; font-weight: bold; font-size: 16px; z-index: 5; text-shadow: 0 1px 3px rgba(0,0,0,0.6); }
  canvas { background: #5a915a; border-radius: 14px; box-shadow: 0 6px 28px rgba(0,0,0,0.5); }

  /* ---- اینترو ---- */
  #intro {
    position: absolute; inset: 0; z-index: 20; overflow: hidden; border-radius: 14px;
    background: linear-gradient(180deg,#1a2634,#0d1117 70%);
    display: flex; align-items: center; justify-content: center;
  }
  #introRoad {
    position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
    width: 60%; height: 100%; background: repeating-linear-gradient(#3a3a3a,#3a3a3a 90%,#464646 100%);
  }
  #introCar {
    position: absolute; bottom: 30%; font-size: 46px; filter: drop-shadow(0 6px 10px rgba(0,0,0,0.5));
    animation: driveIn 1.4s cubic-bezier(.2,.9,.3,1) forwards;
  }
  @keyframes driveIn {
    0% { transform: translateY(120px) scale(0.4) rotate(-6deg); opacity: 0; }
    55% { transform: translateY(0) scale(1.15) rotate(0deg); opacity: 1; }
    100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
  }
  #introTitle {
    position: absolute; top: 30%; color: #ffd23f; font-size: 26px; font-weight: bold;
    text-shadow: 0 3px 10px rgba(0,0,0,0.6); opacity: 0; animation: fadeUp 0.6s ease forwards 0.9s;
  }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(10px);} to { opacity: 1; transform: translateY(0);} }

  /* ---- لابی ---- */
  #overlay {
    position: absolute; inset: 0; border-radius: 14px; color: #fff; overflow-y: auto;
    background: radial-gradient(circle at 50% 0%, #23324a, #0d1117 75%);
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    text-align: center; z-index: 10; padding: 22px 18px 14px;
  }
  .hidden { display: none !important; }
  #overlay h1 { font-size: 24px; margin: 6px 0 2px; text-shadow: 0 2px 8px rgba(255,210,63,0.3); }
  #overlay .tagline { margin: 2px 0 14px; font-size: 13px; opacity: 0.75; }
  #topRow { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; justify-content: space-between; z-index: 12; }
  .iconBtn {
    background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); color: #fff;
    font-size: 18px; width: 38px; height: 38px; border-radius: 50%; backdrop-filter: blur(4px);
  }
  #playBtn {
    margin-top: 6px; padding: 13px 40px; font-size: 17px; border: none; border-radius: 26px;
    background: linear-gradient(135deg,#ffd23f,#ff9f1c); color: #22190a; font-weight: bold;
    box-shadow: 0 6px 16px rgba(255,159,28,0.4);
  }
  .carPreview { display: none; }
  #board {
    margin-top: 16px; font-size: 13px; width: 100%; max-width: 280px; background: rgba(255,255,255,0.06);
    border-radius: 12px; padding: 8px 4px; max-height: 150px; overflow-y: auto;
  }
  #board .boardTitle { font-weight: bold; margin-bottom: 4px; color: #ffd23f; }
  #board div.row { display: flex; justify-content: space-between; padding: 3px 10px; }

  /* ---- تنظیمات ---- */
  #settingsPanel {
    position: absolute; inset: 0; border-radius: 14px; background: rgba(10,14,20,0.95); color: #fff;
    z-index: 15; display: flex; flex-direction: column; align-items: center; padding: 20px; text-align: center;
  }
  #settingsPanel h2 { margin: 4px 0 18px; font-size: 19px; }
  .settingRow { width: 100%; max-width: 280px; background: rgba(255,255,255,0.06); border-radius: 12px; padding: 12px 16px; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between; }
  .toggle { width: 46px; height: 26px; border-radius: 13px; background: #444; position: relative; border: none; }
  .toggle.on { background: #4caf50; }
  .toggle span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform 0.2s; }
  .toggle.on span { transform: translateX(-20px); }
  .colorRow { display: flex; gap: 10px; justify-content: center; margin: 8px 0 4px; flex-wrap: wrap; }
  .colorDot { width: 34px; height: 34px; border-radius: 50%; border: 3px solid transparent; }
  .colorDot.active { border-color: #ffd23f; }
  #closeSettings {
    margin-top: 10px; padding: 10px 30px; font-size: 14px; border: none; border-radius: 20px;
    background: #ffd23f; color: #222; font-weight: bold;
  }

  #soundBtn {
    position: absolute; top: 8px; left: 10px; z-index: 8; background: rgba(0,0,0,0.4); border: none;
    color: #fff; font-size: 20px; width: 38px; height: 38px; border-radius: 50%;
  }
  #levelUp {
    position: absolute; top: 45%; width: 100%; text-align: center; color: #ffd23f;
    font-size: 28px; font-weight: bold; z-index: 6; text-shadow: 0 2px 6px #000; opacity: 0; transition: opacity 0.3s;
  }
</style>
</head>
<body>
<div id="hud">امتیاز: <span id="score">0</span> &nbsp;|&nbsp; لول: <span id="level">1</span> &nbsp;|&nbsp; رکورد: <span id="best">0</span></div>
<button id="soundBtn">🔊</button>
<div id="levelUp"></div>
<canvas id="game" width="340" height="540"></canvas>

<div id="intro">
  <div id="introRoad"></div>
  <div id="introCar">🏎️</div>
  <div id="introTitle">جاده سه‌لاین</div>
</div>

<div id="overlay" class="hidden">
  <div id="topRow">
    <button class="iconBtn" id="settingsOpenBtn">⚙️</button>
    <div></div>
  </div>
  <h1>🏎️ جاده سه‌لاین</h1>
  <canvas id="previewCanvas" width="70" height="100" style="margin:4px 0;"></canvas>
  <p class="tagline">با ضربه به چپ یا راست صفحه لاین عوض کن — هر ۲۰۰ امتیاز یک لول سخت‌تر میشه</p>
  <button id="playBtn">شروع بازی</button>
  <div id="board"><div class="boardTitle">برترین‌ها</div></div>
</div>

<div id="settingsPanel" class="hidden">
  <h2>⚙️ تنظیمات</h2>
  <div class="settingRow">
    <span>صدا</span>
    <button class="toggle" id="soundToggle"><span></span></button>
  </div>
  <p style="margin:4px 0 8px; font-size:13px; opacity:0.8;">رنگ ماشین</p>
  <div class="colorRow" id="colorRow"></div>
  <button id="closeSettings">بستن</button>
</div>

<script>
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const user = tg?.initDataUnsafe?.user || { id: 0, first_name: "مهمان" };
const chatInstance = tg?.initDataUnsafe?.chat_instance || null;

// ---- صدا (Web Audio, بدون فایل خارجی) ----
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
  crash: () => beep(120, 0.35, 'sawtooth'),
  levelUp: () => { beep(600, 0.12); setTimeout(() => beep(900, 0.15), 100); },
  pass: () => beep(300, 0.05),
  engine: () => beep(200, 0.5, 'sawtooth')
};

const soundBtn = document.getElementById('soundBtn');
const soundToggle = document.getElementById('soundToggle');
function setSound(on) {
  soundOn = on;
  soundBtn.textContent = soundOn ? '🔊' : '🔇';
  soundToggle.classList.toggle('on', soundOn);
  saveProfile({ soundOn });
}
soundBtn.addEventListener('click', () => setSound(!soundOn));
soundToggle.addEventListener('click', () => setSound(!soundOn));

// ---- پروفایل و رنگ ماشین ----
const CAR_PALETTE = ['#2e7dff', '#e63946', '#ffb703', '#6a994e', '#8338ec', '#ff6b9d', '#1a1a1a', '#ffffff'];
let playerCarColor = '#2e7dff';
const colorRow = document.getElementById('colorRow');
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');
function paintPreview() {
  previewCtx.clearRect(0, 0, 70, 100);
  drawCar(35, 55, 34, 56, playerCarColor, true, previewCtx);
}
CAR_PALETTE.forEach(c => {
  const dot = document.createElement('div');
  dot.className = 'colorDot';
  dot.style.background = c;
  dot.addEventListener('click', () => {
    playerCarColor = c;
    [...colorRow.children].forEach(d => d.classList.remove('active'));
    dot.classList.add('active');
    saveProfile({ carColor: c });
    paintPreview();
  });
  colorRow.appendChild(dot);
});

async function loadProfile() {
  try {
    const res = await fetch(\`/api/profile?user_id=\${user.id}&name=\${encodeURIComponent(user.first_name || 'بازیکن')}\`);
    const p = await res.json();
    soundOn = p.soundOn !== false;
    soundBtn.textContent = soundOn ? '🔊' : '🔇';
    soundToggle.classList.toggle('on', soundOn);
    playerCarColor = p.carColor || '#2e7dff';
    [...colorRow.children].forEach((d, i) => d.classList.toggle('active', CAR_PALETTE[i] === playerCarColor));
    paintPreview();
  } catch (e) {}
}
async function saveProfile(fields) {
  try {
    await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, name: user.first_name || 'بازیکن', ...fields })
    });
  } catch (e) {}
}
loadProfile();

document.getElementById('settingsOpenBtn').addEventListener('click', () => {
  document.getElementById('settingsPanel').classList.remove('hidden');
});
document.getElementById('closeSettings').addEventListener('click', () => {
  document.getElementById('settingsPanel').classList.add('hidden');
});

// ---- اینترو ----
setTimeout(() => {
  document.getElementById('intro').classList.add('hidden');
  document.getElementById('overlay').classList.remove('hidden');
  sfx.engine();
}, 1500);

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

let car, obstacles, props, score, level, running, speed, spawnTimer, spawnInterval, propTimer, roadOffset, roadScrollTotal, smokeParticles;
const CAR_COLORS = ['#e63946', '#3a86ff', '#ffb703', '#6a994e', '#8338ec'];

const asphaltSpecks = [];
for (let i = 0; i < 45; i++) {
  asphaltSpecks.push({
    x: ROAD_MARGIN + Math.random() * (W - ROAD_MARGIN * 2),
    y: Math.random() * H,
    r: 1 + Math.random() * 2,
    speedMul: 1
  });
}

function laneX(lane) { return ROAD_MARGIN + lane * LANE_W + LANE_W / 2; }

function resetGame() {
  car = { lane: 1, w: 38, h: 62, y: H - 110 };
  obstacles = [];
  props = [];
  smokeParticles = [];
  score = 0;
  level = 1;
  speed = 3.4;
  spawnInterval = 78;
  spawnTimer = 40;
  propTimer = 20;
  roadOffset = 0;
  roadScrollTotal = 0;
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
  const roll = Math.random();
  const type = roll < 0.4 ? 'tree' : roll < 0.75 ? 'house' : 'lamp';
  const x = side === 'left' ? 10 + Math.random() * (ROAD_MARGIN - 40) : W - 10 - Math.random() * (ROAD_MARGIN - 40);
  props.push({ x, y: -60, type, side });
}

function spawnSmoke(x, y, vy) {
  smokeParticles.push({
    x: x + (Math.random() - 0.5) * 10,
    y, vy: vy * 0.35,
    r: 3 + Math.random() * 2,
    life: 22 + Math.random() * 10,
    maxLife: 30
  });
}

function showLevelUp() {
  levelUpEl.textContent = 'لول ' + level + '!';
  levelUpEl.style.opacity = '1';
  setTimeout(() => { levelUpEl.style.opacity = '0'; }, 900);
}

function update() {
  if (!running) return;

  roadOffset = (roadOffset + speed) % 44;
  roadScrollTotal += speed;

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

  if (Math.random() < 0.6) spawnSmoke(laneX(car.lane), car.y + car.h / 2, speed);
  for (const o of obstacles) {
    if (Math.random() < 0.4) spawnSmoke(laneX(o.lane), o.y - o.h / 2, -speed);
  }
  for (let i = smokeParticles.length - 1; i >= 0; i--) {
    const s = smokeParticles[i];
    s.y += s.vy;
    s.life -= 1;
    s.r += 0.15;
    if (s.life <= 0) smokeParticles.splice(i, 1);
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
    sfx.levelUp();
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

function drawHouse(x, y) {
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

function drawLamp(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#555';
  ctx.fillRect(-2, -4, 4, 22);
  ctx.fillStyle = '#ffe27a';
  ctx.beginPath();
  ctx.arc(0, -8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,226,122,0.25)';
  ctx.beginPath();
  ctx.arc(0, -8, 12, 0, Math.PI * 2);
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

  // بافت آسفالت (خرده‌های تصادفی ثابت که با جاده حرکت می‌کنن)
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < asphaltSpecks.length; i++) {
    const s = asphaltSpecks[i];
    const y = (s.y + roadScrollTotal * s.speedMul) % H;
    ctx.beginPath();
    ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }

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

  if (level >= 3) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x = ROAD_MARGIN + 8 + i * ((W - ROAD_MARGIN * 2 - 16) / 4);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 30);
      ctx.stroke();
    }
  }
}

function drawCar(x, y, w, h, body, isPlayer, targetCtx) {
  const c = targetCtx || ctx;
  c.save();
  c.translate(x, y);

  const shadowGrad = c.createRadialGradient(0, h * 0.42, 2, 0, h * 0.42, w * 0.6);
  shadowGrad.addColorStop(0, 'rgba(0,0,0,0.35)');
  shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = shadowGrad;
  c.beginPath();
  c.ellipse(0, h * 0.42, w * 0.6, 10, 0, 0, Math.PI * 2);
  c.fill();

  const grad = c.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, shade(body, -25));
  grad.addColorStop(0.5, body);
  grad.addColorStop(1, shade(body, -25));

  c.fillStyle = grad;
  roundRectOn(c, -w / 2, -h / 2, w, h, 10);
  c.fill();

  c.fillStyle = 'rgba(30,40,60,0.85)';
  roundRectOn(c, -w / 2 + 5, -h / 2 + 8, w - 10, h * 0.32, 6);
  c.fill();

  c.fillStyle = isPlayer ? '#ffe27a' : '#ffdede';
  c.fillRect(-w / 2 + 4, -h / 2 + 2, 6, 5);
  c.fillRect(w / 2 - 10, -h / 2 + 2, 6, 5);

  c.fillStyle = '#c0392b';
  c.fillRect(-w / 2 + 4, h / 2 - 7, 6, 5);
  c.fillRect(w / 2 - 10, h / 2 - 7, 6, 5);

  c.fillStyle = '#1a1a1a';
  c.fillRect(-w / 2 - 2, -h * 0.28, 4, 14);
  c.fillRect(w / 2 - 2, -h * 0.28, 4, 14);
  c.fillRect(-w / 2 - 2, h * 0.1, 4, 14);
  c.fillRect(w / 2 - 2, h * 0.1, 4, 14);

  c.restore();
}

function roundRectOn(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
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

function drawSmoke() {
  for (const s of smokeParticles) {
    const alpha = Math.max(0, s.life / s.maxLife) * 0.35;
    ctx.fillStyle = \`rgba(200,200,200,${alpha})\`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw() {
  drawGrass();
  drawRoad();
  drawSmoke();

  for (const p of props) {
    if (p.type === 'tree') drawTree(p.x, p.y);
    else if (p.type === 'lamp') drawLamp(p.x, p.y);
    else drawHouse(p.x, p.y);
  }

  for (const o of obstacles) {
    drawCar(laneX(o.lane), o.y, o.w, o.h, o.color, false);
  }

  drawCar(laneX(car.lane), car.y, car.w, car.h, playerCarColor, true);
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
      body: JSON.stringify({ game: 'racing', user_id: user.id, name: user.first_name || 'بازیکن', score, chat_instance: chatInstance })
    });
  } catch (e) {}
  loadLeaderboard();
}

async function loadLeaderboard() {
  try {
    const qs = chatInstance ? \`&chat_instance=\${encodeURIComponent(chatInstance)}\` : '';
    const res = await fetch(\`/api/leaderboard?game=racing\${qs}\`);
    const data = await res.json();
    const title = chatInstance ? '🏆 برترین‌های این گروه' : '🏆 برترین‌ها';
    boardEl.innerHTML = \`<div class="boardTitle">\${title}</div>\` + data.map((d, i) =>
      \`<div class="row"><span>\${i+1}. \${d.name}</span><span>\${d.score}</span></div>\`).join('');
  } catch (e) {}
}

document.getElementById('playBtn').addEventListener('click', () => {
  overlay.classList.add('hidden');
  resetGame();
  loop();
});

paintPreview();
loadLeaderboard();
</script>
</body>
</html>`;
export const MORRIS_HTML = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>آسیاب</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script>window.__BOT_USERNAME__ = "__BOT_USERNAME_PLACEHOLDER__";</script>
<style>
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body {
    margin: 0; padding: 0; background: #1a1410; font-family: Tahoma, sans-serif; color: #fff;
    display: flex; flex-direction: column; align-items: center; height: 100vh; overflow: hidden; touch-action: manipulation;
  }
  .screen { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; text-align: center; }
  .hidden { display: none !important; }
  h1 { font-size: 22px; margin: 4px 0 16px; }
  .menuBtn {
    width: 100%; max-width: 300px; padding: 15px; margin: 7px 0; border: none; border-radius: 14px;
    background: linear-gradient(135deg,#3a2f26,#2a2119); color: #fff; font-size: 15px; font-weight: bold;
    display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid rgba(255,255,255,0.08);
  }
  .menuBtn .ic { font-size: 20px; }
  #status { margin: 10px 0; font-size: 14px; opacity: 0.85; min-height: 20px; }
  #boardWrap { position: relative; width: 300px; height: 300px; margin: 10px auto; }
  svg { width: 300px; height: 300px; }
  .pt { cursor: pointer; }
  #hud2 { display: flex; justify-content: space-between; width: 300px; margin-bottom: 6px; font-size: 13px; }
  .backBtn {
    position: absolute; top: 10px; left: 10px; background: rgba(255,255,255,0.1); border: none; color: #fff;
    width: 34px; height: 34px; border-radius: 50%; font-size: 16px; z-index: 20;
  }
  #waitBox { margin-top: 14px; font-size: 13px; opacity: 0.8; }
  .spinner { width: 26px; height: 26px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #ffd23f; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 10px auto; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #shareBox { margin-top: 10px; font-size: 12px; word-break: break-all; opacity: 0.7; }
  .shareBtn { margin-top: 10px; padding: 10px 22px; border: none; border-radius: 20px; background: #ffd23f; color: #222; font-weight: bold; }
  #resultBox { margin-top: 14px; font-size: 17px; font-weight: bold; }
  #playAgainBtn { margin-top: 12px; padding: 11px 26px; border: none; border-radius: 20px; background: #ffd23f; color: #222; font-weight: bold; }
</style>
</head>
<body>

<!-- منوی اصلی -->
<div class="screen" id="menuScreen">
  <h1>⚪⚫ آسیاب (نه‌مرد)</h1>
  <button class="menuBtn" id="btnBot"><span class="ic">🤖</span> بازی با ربات</button>
  <button class="menuBtn" id="btnFriend"><span class="ic">👥</span> بازی با دوستان</button>
  <button class="menuBtn" id="btnRandom"><span class="ic">🎲</span> بازی با ناشناس رندوم</button>
</div>

<!-- انتظار برای دوست -->
<div class="screen hidden" id="waitFriendScreen">
  <button class="backBtn" id="backFromWaitFriend">🔙</button>
  <h1>👥 بازی با دوستان</h1>
  <div class="spinner"></div>
  <p>منتظر پیوستن دوستت...</p>
  <button class="shareBtn" id="shareLinkBtn">ارسال دعوت‌نامه</button>
</div>

<!-- انتظار برای رندوم -->
<div class="screen hidden" id="waitRandomScreen">
  <button class="backBtn" id="backFromWaitRandom">🔙</button>
  <h1>🎲 در حال پیدا کردن حریف...</h1>
  <div class="spinner"></div>
  <div id="waitBox">چند لحظه صبر کن</div>
</div>

<!-- صفحه بازی -->
<div class="screen hidden" id="gameScreen">
  <button class="backBtn" id="backFromGame">🔙</button>
  <h1 id="gameTitle">⚪⚫ آسیاب</h1>
  <div id="hud2">
    <span id="p1Label">⚪ ...</span>
    <span id="p2Label">⚫ ...</span>
  </div>
  <div id="status">در حال شروع...</div>
  <div id="boardWrap">
    <svg viewBox="0 0 300 300" id="boardSvg"></svg>
  </div>
  <div id="resultBox"></div>
  <button class="hidden" id="playAgainBtn">بازی دوباره</button>
</div>

<script>
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const user = tg?.initDataUnsafe?.user || { id: Math.floor(Math.random()*1e9), first_name: "مهمان" };

// ================= تعریف تخته آسیاب =================
const POS = [
  [30,30],[150,30],[270,30],
  [270,150],[270,270],[150,270],
  [30,270],[30,150],
  [75,75],[150,75],[225,75],
  [225,150],[225,225],[150,225],
  [75,225],[75,150],
  [120,120],[150,120],[180,120],
  [180,150],[180,180],[150,180],
  [120,180],[120,150]
];
const ADJ = {
  0:[1,7], 1:[0,2,9], 2:[1,3], 3:[2,4,11], 4:[3,5], 5:[4,6,13], 6:[5,7], 7:[0,6,15],
  8:[9,15], 9:[8,10,1,17], 10:[9,11], 11:[10,12,3,19], 12:[11,13], 13:[12,14,5,21], 14:[13,15], 15:[8,14,7,23],
  16:[17,23], 17:[16,18,9], 18:[17,19], 19:[18,20,11], 20:[19,21], 21:[20,22,13], 22:[21,23], 23:[22,16,15]
};
const MILLS = [
  [0,1,2],[2,3,4],[4,5,6],[6,7,0],
  [8,9,10],[10,11,12],[12,13,14],[14,15,8],
  [16,17,18],[18,19,20],[20,21,22],[22,23,16],
  [1,9,17],[3,11,19],[5,13,21],[7,15,23]
];

function millsAt(idx) { return MILLS.filter(m => m.includes(idx)); }
function isMillFormed(board, idx, player) {
  return millsAt(idx).some(m => m.every(i => board[i] === player));
}
function allMillLinesFor(board, player) {
  const result = new Set();
  for (const m of MILLS) if (m.every(i => board[i] === player)) m.forEach(i => result.add(i));
  return result;
}

// ================= صدا =================
let soundOn = true;
let actx = null;
function beep(freq, dur, type) {
  if (!soundOn) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(); const g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq; g.gain.value = 0.08;
    o.connect(g); g.connect(actx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  place: () => beep(400, 0.1),
  mill: () => { beep(700, 0.12); setTimeout(() => beep(1000, 0.15), 90); },
  win: () => { beep(600,0.15); setTimeout(()=>beep(800,0.15),150); setTimeout(()=>beep(1100,0.2),300); },
  lose: () => beep(150, 0.4, 'sawtooth')
};
fetch(\`/api/profile?user_id=\${user.id}&name=\${encodeURIComponent(user.first_name||'بازیکن')}\`)
  .then(r => r.json()).then(p => { soundOn = p.soundOn !== false; }).catch(()=>{});

// ================= وضعیت کلی =================
let mode = null; // 'bot' | 'friend' | 'random'
let myRole = 'p1'; // نقش من در این بازی
let roomId = null;
let state = null;
let pollTimer = null;
let matchPollTimer = null;

const menuScreen = document.getElementById('menuScreen');
const waitFriendScreen = document.getElementById('waitFriendScreen');
const waitRandomScreen = document.getElementById('waitRandomScreen');
const gameScreen = document.getElementById('gameScreen');
const statusEl = document.getElementById('status');
const p1Label = document.getElementById('p1Label');
const p2Label = document.getElementById('p2Label');
const resultBox = document.getElementById('resultBox');
const playAgainBtn = document.getElementById('playAgainBtn');
const gameTitle = document.getElementById('gameTitle');

function showScreen(el) {
  [menuScreen, waitFriendScreen, waitRandomScreen, gameScreen].forEach(s => s.classList.add('hidden'));
  el.classList.remove('hidden');
}

function newLocalState() {
  return {
    board: Array(24).fill(null),
    players: { p1: { id: user.id, name: user.first_name || 'بازیکن' }, p2: { id: 'BOT', name: '🤖 ربات' } },
    turn: 'p1',
    phase: 'placing',
    piecesLeft: { p1: 9, p2: 9 },
    placed: { p1: 0, p2: 0 },
    status: 'playing',
    selected: null,
    removing: false
  };
}

// ================= شروع بازی با ربات =================
document.getElementById('btnBot').addEventListener('click', () => {
  mode = 'bot'; myRole = 'p1'; roomId = null;
  state = newLocalState();
  startGameUI();
});

// ================= بازی با دوستان =================
document.getElementById('btnFriend').addEventListener('click', async () => {
  showScreen(waitFriendScreen);
  const res = await fetch('/api/morris/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: user.id, name: user.first_name || 'بازیکن' })
  });
  const data = await res.json();
  roomId = data.room_id;
  mode = 'friend'; myRole = 'p1'; state = data;
  pollTimer = setInterval(pollFriendRoom, 1500);
});

document.getElementById('shareLinkBtn').addEventListener('click', () => {
  const botUsername = window.__BOT_USERNAME__ || '';
  const link = \`https://t.me/\${botUsername}?start=morris_\${roomId}\`;
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(\`https://t.me/share/url?url=\${encodeURIComponent(link)}&text=\${encodeURIComponent('بیا آسیاب بازی کنیم! ⚪⚫')}\`);
  } else {
    window.open(\`https://t.me/share/url?url=\${encodeURIComponent(link)}&text=\${encodeURIComponent('بیا آسیاب بازی کنیم!')}\`, '_blank');
  }
});

async function pollFriendRoom() {
  const res = await fetch(\`/api/morris/state?room_id=\${roomId}\`);
  const data = await res.json();
  if (data.players && data.players.p2) {
    clearInterval(pollTimer);
    state = data;
    startGameUI();
  }
}

document.getElementById('backFromWaitFriend').addEventListener('click', () => {
  clearInterval(pollTimer);
  showScreen(menuScreen);
});

// ================= بازی با ناشناس رندوم =================
document.getElementById('btnRandom').addEventListener('click', async () => {
  showScreen(waitRandomScreen);
  const res = await fetch('/api/morris/matchmake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: user.id, name: user.first_name || 'بازیکن' })
  });
  const data = await res.json();
  if (data.matched) {
    roomId = data.room_id; mode = 'random'; myRole = 'p2';
    const s = await (await fetch(\`/api/morris/state?room_id=\${roomId}\`)).json();
    state = s;
    startGameUI();
  } else {
    matchPollTimer = setInterval(pollRandomMatch, 1800);
  }
});

async function pollRandomMatch() {
  const res = await fetch('/api/morris/matchmake_poll', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: user.id })
  });
  const data = await res.json();
  if (data.matched) {
    clearInterval(matchPollTimer);
    roomId = data.room_id; mode = 'random'; myRole = 'p1';
    const s = await (await fetch(\`/api/morris/state?room_id=\${roomId}\`)).json();
    state = s;
    startGameUI();
  }
}

document.getElementById('backFromWaitRandom').addEventListener('click', async () => {
  clearInterval(matchPollTimer);
  await fetch('/api/morris/cancel_matchmake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: user.id })
  });
  showScreen(menuScreen);
});

document.getElementById('backFromGame').addEventListener('click', () => {
  clearInterval(pollTimer);
  showScreen(menuScreen);
});

playAgainBtn.addEventListener('click', () => {
  resultBox.textContent = '';
  playAgainBtn.classList.add('hidden');
  if (mode === 'bot') {
    state = newLocalState();
    renderBoard();
    updateStatus();
  } else {
    showScreen(menuScreen);
  }
});

// ================= رندر تخته (SVG) =================
const svg = document.getElementById('boardSvg');
function buildBoardSvg() {
  let html = '';
  for (const [a, list] of Object.entries(ADJ)) {
    for (const b of list) {
      if (Number(a) < b) {
        html += \`<line x1="\${POS[a][0]}" y1="\${POS[a][1]}" x2="\${POS[b][0]}" y2="\${POS[b][1]}" stroke="#8a6d4a" stroke-width="3"/>\`;
      }
    }
  }
  for (let i = 0; i < 24; i++) {
    html += \`<circle class="pt" data-i="\${i}" cx="\${POS[i][0]}" cy="\${POS[i][1]}" r="15" fill="transparent" stroke="none"/>\`;
  }
  svg.innerHTML = html + '<g id="pieces"></g>';
  [...svg.querySelectorAll('.pt')].forEach(el => {
    el.addEventListener('click', () => onPointClick(Number(el.dataset.i)));
  });
}

function renderBoard() {
  const piecesG = document.getElementById('pieces');
  let html = '';
  const millGlow = state.status === 'playing' ? null : null;
  for (let i = 0; i < 24; i++) {
    const val = state.board[i];
    const [x, y] = POS[i];
    if (val) {
      const color = val === 'p1' ? '#f4f1ea' : '#2b2b2b';
      const stroke = val === 'p1' ? '#c9c2ac' : '#000';
      const sel = state.selected === i ? ' stroke="#ffd23f" stroke-width="4"' : \` stroke="\${stroke}" stroke-width="2"\`;
      html += \`<circle cx="\${x}" cy="\${y}" r="12" fill="\${color}"\${sel}/>\`;
    } else {
      const highlight = (state.selected !== null && ADJ[state.selected].includes(i)) || (state.phase !== 'placing' && state.selected === null && false);
      html += \`<circle cx="\${x}" cy="\${y}" r="6" fill="\${highlight ? 'rgba(255,210,63,0.6)' : '#8a6d4a'}"/>\`;
    }
  }
  piecesG.innerHTML = html;
}

// ================= منطق آسیاب =================
function myTurn() { return state.turn === myRole || mode === 'bot' && state.turn === 'p1'; }

function legalDestinations(from) {
  if (state.phase === 'flying' && countPieces(state.turn) === 3) {
    return state.board.map((v,i)=>v?null:i).filter(i=>i!==null);
  }
  return ADJ[from].filter(i => !state.board[i]);
}

function countPieces(player) {
  return state.board.filter(v => v === player).length;
}

function opponentOf(p) { return p === 'p1' ? 'p2' : 'p1'; }

async function onPointClick(i) {
  if (state.status !== 'playing') return;
  if (!myTurn() && mode !== 'bot') return;
  if (mode === 'bot' && state.turn !== 'p1') return;

  if (state.removing) {
    tryRemove(i);
    return;
  }

  if (state.phase === 'placing') {
    if (state.board[i]) return;
    placePiece(i);
    return;
  }

  // moving / flying
  if (state.selected === null) {
    if (state.board[i] === state.turn) { state.selected = i; renderBoard(); }
    return;
  } else {
    if (i === state.selected) { state.selected = null; renderBoard(); return; }
    if (state.board[i]) {
      if (state.board[i] === state.turn) { state.selected = i; renderBoard(); }
      return;
    }
    const dests = legalDestinations(state.selected);
    if (!dests.includes(i)) return;
    movePiece(state.selected, i);
  }
}

function placePiece(i) {
  state.board[i] = state.turn;
  state.placed[state.turn]++;
  sfx.place();
  const formed = isMillFormed(state.board, i, state.turn);
  if (formed) {
    sfx.mill();
    state.removing = true;
    statusEl.textContent = (state.turn === myRole || mode==='bot' && state.turn==='p1' ? 'آسیاب ساختی! ' : '') + 'یه مهره حریف رو حذف کن';
    renderBoard();
    if (mode === 'bot' && state.turn === 'p2') { setTimeout(botRemovePiece, 500); }
    commitIfNeeded();
    return;
  }
  advanceAfterAction();
}

function movePiece(from, to) {
  state.board[to] = state.turn;
  state.board[from] = null;
  state.selected = null;
  sfx.place();
  const formed = isMillFormed(state.board, to, state.turn);
  if (formed) {
    sfx.mill();
    state.removing = true;
    statusEl.textContent = 'آسیاب ساختی! یه مهره حریف رو حذف کن';
    renderBoard();
    if (mode === 'bot' && state.turn === 'p2') { setTimeout(botRemovePiece, 500); }
    commitIfNeeded();
    return;
  }
  advanceAfterAction();
}

function removablePieces(player) {
  const opp = opponentOf(player);
  const all = state.board.map((v,i)=>v===opp?i:null).filter(i=>i!==null);
  const millSet = allMillLinesFor(state.board, opp);
  const free = all.filter(i => !millSet.has(i));
  return free.length ? free : all;
}

function tryRemove(i) {
  if (state.board[i] !== opponentOf(state.turn)) return;
  const allowed = removablePieces(state.turn);
  if (!allowed.includes(i)) return;
  state.board[i] = null;
  state.piecesLeft[opponentOf(state.turn)]--;
  state.removing = false;
  checkWinAndAdvance();
}

function botRemovePiece() {
  const allowed = removablePieces('p2');
  const pick = allowed[Math.floor(Math.random() * allowed.length)];
  state.board[pick] = null;
  state.piecesLeft['p1']--;
  state.removing = false;
  checkWinAndAdvance();
}

function checkWinAndAdvance() {
  const loser = opponentOf(state.turn);
  if (state.piecesLeft[loser] < 3) {
    endGame(state.turn);
    return;
  }
  advanceAfterAction();
}

function advanceAfterAction() {
  const totalPlaced = state.placed.p1 + state.placed.p2;
  if (totalPlaced >= 18 && state.phase === 'placing') {
    state.phase = 'moving';
  }
  // بررسی گیر افتادن حریف بعدی
  const nextPlayer = opponentOf(state.turn);
  state.turn = nextPlayer;
  if (state.phase !== 'placing') {
    if (countPieces(nextPlayer) === 3) state.phase = 'flying'; else if (state.phase==='flying' && countPieces(nextPlayer) > 3) state.phase = 'moving';
    if (!hasAnyMove(nextPlayer)) { endGame(opponentOf(nextPlayer)); return; }
  }
  renderBoard();
  updateStatus();
  commitIfNeeded();
  if (mode === 'bot' && state.turn === 'p2' && state.status === 'playing') {
    setTimeout(botMove, 600);
  }
}

function hasAnyMove(player) {
  if (state.phase === 'placing') return true;
  if (countPieces(player) === 3) return state.board.some(v => !v);
  const mine = state.board.map((v,i)=>v===player?i:null).filter(i=>i!==null);
  return mine.some(i => ADJ[i].some(j => !state.board[j]));
}

function endGame(winner) {
  state.status = 'finished';
  state.winner = winner;
  renderBoard();
  const iWon = (mode === 'bot' && winner === 'p1') || (mode !== 'bot' && winner === myRole);
  resultBox.textContent = iWon ? '🎉 بردی! +۱۰ امتیاز' : (winner ? '😔 باختی' : '🤝 مساوی');
  if (iWon) sfx.win(); else sfx.lose();
  statusEl.textContent = 'بازی تمام شد';
  playAgainBtn.classList.remove('hidden');
  commitIfNeeded(true);
}

function updateStatus() {
  if (state.status === 'finished') return;
  const names = { p1: state.players.p1?.name || '...', p2: state.players.p2?.name || '...' };
  const turnName = names[state.turn];
  const phaseTxt = state.phase === 'placing' ? 'چیدن مهره' : state.phase === 'flying' ? 'پرواز' : 'حرکت';
  statusEl.textContent = \`نوبت: \${turnName} (\${phaseTxt})\`;
  p1Label.textContent = '⚪ ' + names.p1 + (state.turn==='p1' ? ' ◀' : '');
  p2Label.textContent = '⚫ ' + names.p2 + (state.turn==='p2' ? ' ◀' : '');
}

// ================= هوش مصنوعی ربات =================
function botMove() {
  if (state.status !== 'playing') return;
  if (state.phase === 'placing') {
    const empties = state.board.map((v,i)=>v?null:i).filter(i=>i!==null);
    let choice = findMillMove(empties, 'p2') ?? findMillMove(empties, 'p1') ?? preferJunction(empties);
    placePiece(choice);
    return;
  }
  const mine = state.board.map((v,i)=>v==='p2'?i:null).filter(i=>i!==null);
  let best = null;
  for (const from of mine) {
    const dests = legalDestinations(from);
    for (const to of dests) {
      const backup = state.board[from];
      state.board[from] = null; state.board[to] = 'p2';
      const formsMill = isMillFormed(state.board, to, 'p2');
      state.board[from] = backup; state.board[to] = null;
      if (formsMill) { best = { from, to }; break; }
    }
    if (best) break;
  }
  if (!best) {
    // بلاک کردن آسیاب حریف
    const oppMine = state.board.map((v,i)=>v==='p1'?i:null).filter(i=>i!==null);
    outer:
    for (const from of mine) {
      const dests = legalDestinations(from);
      for (const to of dests) {
        const wouldBlock = MILLS.some(m => m.includes(to) && m.filter(x=>state.board[x]==='p1').length===2 && m.includes(to));
        if (wouldBlock) { best = { from, to }; break outer; }
      }
    }
  }
  if (!best) {
    const options = [];
    for (const from of mine) {
      for (const to of legalDestinations(from)) options.push({ from, to });
    }
    best = options[Math.floor(Math.random()*options.length)];
  }
  if (best) movePiece(best.from, best.to);
}

function findMillMove(empties, forPlayer) {
  for (const i of empties) {
    const backup = state.board[i];
    state.board[i] = forPlayer;
    const forms = isMillFormed(state.board, i, forPlayer);
    state.board[i] = backup;
    if (forms) return i;
  }
  return null;
}
function preferJunction(empties) {
  const junctions = [1,3,5,7,9,11,13,15,17,19,21,23];
  const pref = empties.filter(i => junctions.includes(i));
  const pool = pref.length ? pref : empties;
  return pool[Math.floor(Math.random()*pool.length)];
}

// ================= همگام‌سازی چندنفره =================
function commitIfNeeded(force) {
  if (mode === 'bot') return;
  pushState();
}

async function pushState() {
  try {
    const res = await fetch('/api/morris/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, user_id: user.id, newState: state })
    });
    if (res.status === 409) {
      const data = await res.json();
      state = data.state;
      renderBoard(); updateStatus();
    }
  } catch (e) {}
}

async function pollGameState() {
  if (!roomId || state.status === 'finished') return;
  try {
    const res = await fetch(\`/api/morris/state?room_id=\${roomId}\`);
    const data = await res.json();
    if (data.updatedAt && (!state.updatedAt || data.updatedAt > state.updatedAt)) {
      const wasFinished = state.status === 'finished';
      state = data;
      renderBoard(); updateStatus();
      if (state.status === 'finished' && !wasFinished) {
        const iWon = state.winner === myRole;
        resultBox.textContent = iWon ? '🎉 بردی! +۱۰ امتیاز' : '😔 باختی';
        if (iWon) sfx.win(); else sfx.lose();
        playAgainBtn.classList.remove('hidden');
      }
    }
  } catch (e) {}
}

function startGameUI() {
  showScreen(gameScreen);
  buildBoardSvg();
  renderBoard();
  updateStatus();
  resultBox.textContent = '';
  playAgainBtn.classList.add('hidden');
  gameTitle.textContent = mode === 'bot' ? '🤖 آسیاب با ربات' : mode === 'friend' ? '👥 آسیاب با دوست' : '🎲 آسیاب رندوم';
  if (mode !== 'bot') {
    clearInterval(pollTimer);
    pollTimer = setInterval(pollGameState, 1300);
  }
}

// ================= پیوستن خودکار از طریق لینک دعوت =================
(async function checkInviteLink() {
  const params = new URLSearchParams(window.location.search);
  const invitedRoom = params.get('room');
  if (!invitedRoom) return;
  showScreen(waitFriendScreen);
  statusEl.textContent = '';
  document.querySelector('#waitFriendScreen p').textContent = 'در حال پیوستن به بازی...';
  document.getElementById('shareLinkBtn').classList.add('hidden');
  const res = await fetch('/api/morris/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: invitedRoom, user_id: user.id, name: user.first_name || 'بازیکن' })
  });
  const data = await res.json();
  if (data.error) {
    showScreen(menuScreen);
    return;
  }
  roomId = invitedRoom;
  mode = 'friend';
  myRole = String(data.players.p1.id) === String(user.id) ? 'p1' : 'p2';
  state = data;
  startGameUI();
})();
</script>
</body>
</html>`;
// ================= تنظیمات =================
// این مقادیر رو در Cloudflare Workers -> Settings -> Variables تعریف کن:
// BOT_TOKEN     = توکن ربات از @BotFather
// BASE_URL      = آدرس ورکر (مثلا https://mybot.username.workers.dev)
// BOT_USERNAME  = یوزرنیم ربات بدون @ (مثلا mygamebot123_bot) - برای لینک دعوت دوستان
// KV binding    = یک KV namespace با نام GAMEDB بساز و به این ورکر وصل کن

const RANKS = [
  'سرباز صفر', 'سرباز دوم', 'سرباز یکم', 'سرجوخه', 'گروهبان دوم',
  'گروهبان یکم', 'استوار دوم', 'استوار یکم', 'ستوان دوم', 'ستوان یکم',
  'سروان', 'سرگرد', 'سرهنگ دوم', 'سرهنگ', 'سرتیپ دوم',
  'سرتیپ', 'سپهبد', 'ارتشبد'
];

function getRank(points) {
  const idx = Math.min(RANKS.length - 1, Math.floor(points / 100));
  return { title: RANKS[idx], level: idx + 1, nextAt: (idx + 1) * 100 };
}

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
      if (url.pathname === '/game/morris') {
        const html = MORRIS_HTML.replace('__BOT_USERNAME_PLACEHOLDER__', env.BOT_USERNAME || '');
        return new Response(html, { headers: { 'content-type': 'text/html;charset=utf-8' } });
      }
      if (url.pathname === '/api/morris/create' && request.method === 'POST') {
        return await morrisCreate(request, env);
      }
      if (url.pathname === '/api/morris/join' && request.method === 'POST') {
        return await morrisJoin(request, env);
      }
      if (url.pathname === '/api/morris/state') {
        return await morrisState(request, env, url);
      }
      if (url.pathname === '/api/morris/move' && request.method === 'POST') {
        return await morrisMove(request, env);
      }
      if (url.pathname === '/api/morris/matchmake' && request.method === 'POST') {
        return await morrisMatchmake(request, env);
      }
      if (url.pathname === '/api/morris/matchmake_poll' && request.method === 'POST') {
        return await morrisMatchmakePoll(request, env);
      }
      if (url.pathname === '/api/morris/cancel_matchmake' && request.method === 'POST') {
        return await morrisCancelMatchmake(request, env);
      }
      if (url.pathname === '/api/score' && request.method === 'POST') {
        return await saveScore(request, env);
      }
      if (url.pathname === '/api/leaderboard') {
        return await getLeaderboard(request, env, url);
      }
      if (url.pathname === '/api/profile' && request.method === 'GET') {
        return await apiGetProfile(request, env, url);
      }
      if (url.pathname === '/api/profile' && request.method === 'POST') {
        return await apiUpdateProfile(request, env);
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

// ================= پروفایل کاربر =================
async function getProfile(env, userId, name) {
  const key = `profile:${userId}`;
  let p = await env.GAMEDB.get(key, 'json');
  if (!p) {
    p = { id: userId, name: name || 'بازیکن', points: 0, wins: 0, soundOn: true, carColor: '#2e7dff' };
    await env.GAMEDB.put(key, JSON.stringify(p));
  } else if (name && p.name !== name) {
    p.name = name;
    await env.GAMEDB.put(key, JSON.stringify(p));
  }
  return p;
}

async function saveProfile(env, profile) {
  await env.GAMEDB.put(`profile:${profile.id}`, JSON.stringify(profile));
}

async function awardPoints(env, userId, name, points) {
  const p = await getProfile(env, userId, name);
  p.points += points;
  p.wins += 1;
  await saveProfile(env, p);
  return p;
}

async function getTopPlayers(env, limit) {
  const list = await env.GAMEDB.list({ prefix: 'profile:' });
  const entries = [];
  for (const k of list.keys) {
    const val = await env.GAMEDB.get(k.name, 'json');
    if (val) entries.push(val);
  }
  entries.sort((a, b) => b.points - a.points);
  return entries.slice(0, limit || 10);
}

async function apiGetProfile(request, env, url) {
  const userId = url.searchParams.get('user_id');
  const name = url.searchParams.get('name');
  if (!userId) return new Response('bad request', { status: 400 });
  const p = await getProfile(env, userId, name);
  return new Response(JSON.stringify(p), { headers: { 'content-type': 'application/json' } });
}

async function apiUpdateProfile(request, env) {
  const body = await request.json();
  const { user_id, name, soundOn, carColor } = body;
  if (!user_id) return new Response('bad request', { status: 400 });
  const p = await getProfile(env, user_id, name);
  if (typeof soundOn === 'boolean') p.soundOn = soundOn;
  if (typeof carColor === 'string') p.carColor = carColor;
  await saveProfile(env, p);
  return new Response(JSON.stringify(p), { headers: { 'content-type': 'application/json' } });
}

// ================= دوستان =================
async function getFriends(env, userId) {
  const list = await env.GAMEDB.get(`friends:${userId}`, 'json');
  return list || [];
}

async function addFriendPair(env, userId, userName, friendId, friendName) {
  if (String(userId) === String(friendId)) return;
  const a = await getFriends(env, userId);
  if (!a.find(f => String(f.id) === String(friendId))) {
    a.push({ id: friendId, name: friendName });
    await env.GAMEDB.put(`friends:${userId}`, JSON.stringify(a));
  }
  const b = await getFriends(env, friendId);
  if (!b.find(f => String(f.id) === String(userId))) {
    b.push({ id: userId, name: userName });
    await env.GAMEDB.put(`friends:${friendId}`, JSON.stringify(b));
  }
}

// ================= امتیازها و لیدربورد بازی‌ها =================
async function saveScore(request, env) {
  const body = await request.json();
  const { game, user_id, name, score, chat_instance } = body;
  if (!game || !user_id || typeof score !== 'number') {
    return new Response('bad request', { status: 400 });
  }
  const key = `score:${game}:${user_id}`;
  const existing = await env.GAMEDB.get(key, 'json');
  if (!existing || score > existing.score) {
    await env.GAMEDB.put(key, JSON.stringify({ name, score, user_id }));
  }
  if (chat_instance) {
    const gKey = `score:${game}:group:${chat_instance}:${user_id}`;
    const gExisting = await env.GAMEDB.get(gKey, 'json');
    if (!gExisting || score > gExisting.score) {
      await env.GAMEDB.put(gKey, JSON.stringify({ name, score, user_id }));
    }
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
}

async function getLeaderboard(request, env, url) {
  const game = url.searchParams.get('game') || 'runner';
  const chatInstance = url.searchParams.get('chat_instance');
  const prefix = chatInstance ? `score:${game}:group:${chatInstance}:` : `score:${game}:`;
  const list = await env.GAMEDB.list({ prefix });
  const entries = [];
  for (const k of list.keys) {
    // وقتی چت-اینستنس نداریم، کلیدهای گروهی رو حساب نکن
    if (!chatInstance && k.name.includes(':group:')) continue;
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
  const from = msg.from;

  // دعوت دوست از طریق لینک: /start friend_12345
  if (text.startsWith('/start friend_')) {
    const friendId = text.replace('/start friend_', '').trim();
    await getProfile(env, from.id, from.first_name);
    const friendProfile = await getProfile(env, friendId, null);
    await addFriendPair(env, from.id, from.first_name || 'بازیکن', friendId, friendProfile.name);
    await tg(env, 'sendMessage', { chat_id: chatId, text: `✅ تو و ${friendProfile.name} حالا با هم دوستید!` });
    await tg(env, 'sendMessage', { chat_id: friendId, text: `✅ ${from.first_name || 'یک بازیکن'} رو به لیست دوستات اضافه شد!` });
    await sendGameMenu(chatId, env);
    return new Response('ok');
  }

  // دعوت به بازی آسیاب: /start morris_ROOMID
  if (text.startsWith('/start morris_')) {
    const roomId = text.replace('/start morris_', '').trim();
    await getProfile(env, from.id, from.first_name);
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: '⚪⚫ یه دوست تو رو به بازی آسیاب دعوت کرده!',
      reply_markup: { inline_keyboard: [[{ text: '🎮 پیوستن به بازی', web_app: { url: `${env.BASE_URL}/game/morris?room=${roomId}` } }]] }
    });
    return new Response('ok');
  }

  if (text === '/start' || text === '/games' || text === 'بازی‌ها') {
    await getProfile(env, from.id, from.first_name);
    await sendGameMenu(chatId, env);
    return new Response('ok');
  }

  if (text === '/آسیاب' || text === '/morris') {
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: '⚪⚫ برای شروع بازی آسیاب دکمه زیر رو بزن:',
      reply_markup: { inline_keyboard: [[{ text: '⚪⚫ باز کردن آسیاب', web_app: { url: `${env.BASE_URL}/game/morris` } }]] }
    });
    return new Response('ok');
  }

  if (text === '/پروفایل' || text === '/profile') {
    await sendProfile(chatId, from, env);
    return new Response('ok');
  }

  if (text === '/دوستان' || text === '/friends') {
    await sendFriendsList(chatId, from, env);
    return new Response('ok');
  }

  if (text === '/برترین‌ها' || text === '/top') {
    await sendTopPlayers(chatId, env);
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
    text: '🎮 سلام! یکی از بازی‌ها یا بخش‌ها رو انتخاب کن:',
    reply_markup: {
      inline_keyboard: [
        [{ text: '⚪⚫ آسیاب (نه‌مرد)', web_app: { url: `${env.BASE_URL}/game/morris` } }],
        [{ text: '🏃 بدو بدو و پرش', web_app: { url: `${env.BASE_URL}/game/runner` } }],
        [{ text: '🏎️ جاده سه‌لاین', web_app: { url: `${env.BASE_URL}/game/racing` } }],
        [{ text: '👤 پروفایل من', callback_data: 'menu:profile' }, { text: '👥 دوستان', callback_data: 'menu:friends' }],
        [{ text: '🏆 برترین بازیکنان', callback_data: 'menu:top' }]
      ]
    }
  });
}

// ================= پروفایل / دوستان / برترین‌ها (پیام‌ها) =================
async function sendProfile(chatId, from, env) {
  const p = await getProfile(env, from.id, from.first_name);
  const rank = getRank(p.points);
  const top = await getTopPlayers(env, 100);
  const position = top.findIndex(t => String(t.id) === String(p.id));
  const medal = position === 0 ? ' 🥇' : position === 1 ? ' 🥈' : position === 2 ? ' 🥉' : '';

  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: `👤 پروفایل ${p.name}${medal}\n\n🎖️ درجه: ${rank.title}\n⭐ امتیاز: ${p.points}\n🏆 بردها: ${p.wins}\n📊 تا درجه بعدی: ${Math.max(0, rank.nextAt - p.points)} امتیاز`,
    reply_markup: { inline_keyboard: [[{ text: '🔙 منوی اصلی', callback_data: 'menu:back' }]] }
  });
}

async function sendFriendsList(chatId, from, env) {
  await getProfile(env, from.id, from.first_name);
  const friends = await getFriends(env, from.id);
  const inviteLink = env.BOT_USERNAME
    ? `https://t.me/${env.BOT_USERNAME}?start=friend_${from.id}`
    : null;

  let text = '👥 لیست دوستان تو:\n\n';
  text += friends.length
    ? friends.map((f, i) => `${i + 1}. ${f.name}`).join('\n')
    : 'هنوز دوستی اضافه نکردی.';

  const buttons = [];
  if (inviteLink) {
    buttons.push([{ text: '➕ دعوت دوست جدید', url: `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('بیا با هم بازی کنیم! 🎮')}` }]);
  }
  buttons.push([{ text: '🔙 منوی اصلی', callback_data: 'menu:back' }]);

  await tg(env, 'sendMessage', { chat_id: chatId, text, reply_markup: { inline_keyboard: buttons } });
}

async function sendTopPlayers(chatId, env) {
  const top = await getTopPlayers(env, 10);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((p, i) => {
    const rank = getRank(p.points);
    const medal = medals[i] || `${i + 1}.`;
    return `${medal} ${p.name} — ${p.points} امتیاز (${rank.title})`;
  });
  await tg(env, 'sendMessage', {
    chat_id: chatId,
    text: '🏆 برترین بازیکنان:\n\n' + (lines.length ? lines.join('\n') : 'هنوز کسی امتیازی نداره.'),
    reply_markup: { inline_keyboard: [[{ text: '🔙 منوی اصلی', callback_data: 'menu:back' }]] }
  });
}

// ================= بازی آسیاب (Nine Men's Morris) - چندنفره با پولینگ =================
function randomRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function emptyMorrisBoard() { return Array(24).fill(null); }

async function morrisCreate(request, env) {
  const body = await request.json();
  const { user_id, name } = body;
  if (!user_id) return new Response('bad request', { status: 400 });
  await getProfile(env, user_id, name);
  const roomId = randomRoomId();
  const state = {
    room_id: roomId,
    board: emptyMorrisBoard(),
    players: { p1: { id: user_id, name: name || 'بازیکن ۱' }, p2: null },
    turn: 'p1',
    phase: 'placing',
    piecesLeft: { p1: 9, p2: 9 },
    placed: { p1: 0, p2: 0 },
    status: 'waiting',
    updatedAt: Date.now()
  };
  await env.GAMEDB.put(`morris:${roomId}`, JSON.stringify(state), { expirationTtl: 3600 });
  return new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } });
}

async function morrisJoin(request, env) {
  const body = await request.json();
  const { room_id, user_id, name } = body;
  if (!room_id || !user_id) return new Response('bad request', { status: 400 });
  await getProfile(env, user_id, name);
  const state = await env.GAMEDB.get(`morris:${room_id}`, 'json');
  if (!state) return new Response(JSON.stringify({ error: 'room_not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  if (!state.players.p2 && String(state.players.p1.id) !== String(user_id)) {
    state.players.p2 = { id: user_id, name: name || 'بازیکن ۲' };
    state.status = 'playing';
    state.updatedAt = Date.now();
    await env.GAMEDB.put(`morris:${room_id}`, JSON.stringify(state), { expirationTtl: 3600 });
  }
  return new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } });
}

async function morrisState(request, env, url) {
  const roomId = url.searchParams.get('room_id');
  if (!roomId) return new Response('bad request', { status: 400 });
  const state = await env.GAMEDB.get(`morris:${roomId}`, 'json');
  if (!state) return new Response(JSON.stringify({ error: 'room_not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json' } });
}

async function morrisMove(request, env) {
  const body = await request.json();
  const { room_id, user_id, newState } = body;
  if (!room_id || !user_id || !newState) return new Response('bad request', { status: 400 });
  const state = await env.GAMEDB.get(`morris:${room_id}`, 'json');
  if (!state) return new Response(JSON.stringify({ error: 'room_not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });

  const currentTurnPlayer = state.players[state.turn];
  if (!currentTurnPlayer || String(currentTurnPlayer.id) !== String(user_id)) {
    return new Response(JSON.stringify({ error: 'not_your_turn', state }), { status: 409, headers: { 'content-type': 'application/json' } });
  }

  newState.room_id = room_id;
  newState.players = state.players;
  newState.updatedAt = Date.now();
  await env.GAMEDB.put(`morris:${room_id}`, JSON.stringify(newState), { expirationTtl: 3600 });

  if (newState.status === 'finished' && newState.winner) {
    const winnerPlayer = state.players[newState.winner];
    if (winnerPlayer) await awardPoints(env, winnerPlayer.id, winnerPlayer.name, 10);
  }

  return new Response(JSON.stringify(newState), { headers: { 'content-type': 'application/json' } });
}

async function morrisMatchmake(request, env) {
  const body = await request.json();
  const { user_id, name } = body;
  if (!user_id) return new Response('bad request', { status: 400 });
  await getProfile(env, user_id, name);

  const waiting = await env.GAMEDB.get('morris:queue', 'json');
  if (waiting && String(waiting.id) !== String(user_id)) {
    await env.GAMEDB.delete('morris:queue');
    const roomId = randomRoomId();
    const state = {
      room_id: roomId,
      board: emptyMorrisBoard(),
      players: { p1: { id: waiting.id, name: waiting.name }, p2: { id: user_id, name: name || 'بازیکن' } },
      turn: 'p1',
      phase: 'placing',
      piecesLeft: { p1: 9, p2: 9 },
      placed: { p1: 0, p2: 0 },
      status: 'playing',
      updatedAt: Date.now()
    };
    await env.GAMEDB.put(`morris:${roomId}`, JSON.stringify(state), { expirationTtl: 3600 });
    await env.GAMEDB.put(`morris:matched:${waiting.id}`, roomId, { expirationTtl: 120 });
    return new Response(JSON.stringify({ matched: true, room_id: roomId }), { headers: { 'content-type': 'application/json' } });
  }

  await env.GAMEDB.put('morris:queue', JSON.stringify({ id: user_id, name: name || 'بازیکن' }), { expirationTtl: 60 });
  return new Response(JSON.stringify({ matched: false, waiting: true }), { headers: { 'content-type': 'application/json' } });
}

async function morrisMatchmakePoll(request, env) {
  const body = await request.json();
  const { user_id } = body;
  if (!user_id) return new Response('bad request', { status: 400 });
  const roomId = await env.GAMEDB.get(`morris:matched:${user_id}`);
  if (roomId) {
    await env.GAMEDB.delete(`morris:matched:${user_id}`);
    return new Response(JSON.stringify({ matched: true, room_id: roomId }), { headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ matched: false }), { headers: { 'content-type': 'application/json' } });
}

async function morrisCancelMatchmake(request, env) {
  const body = await request.json();
  const { user_id } = body;
  const waiting = await env.GAMEDB.get('morris:queue', 'json');
  if (waiting && String(waiting.id) === String(user_id)) {
    await env.GAMEDB.delete('morris:queue');
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
}

async function handleCallback(cq, env) {
  const data = cq.data;
  const chatId = cq.message.chat.id;
  const from = cq.from;

  if (data === 'menu:back') {
    await sendGameMenu(chatId, env);
  } else if (data === 'menu:profile') {
    await sendProfile(chatId, from, env);
  } else if (data === 'menu:friends') {
    await sendFriendsList(chatId, from, env);
  } else if (data === 'menu:top') {
    await sendTopPlayers(chatId, env);
  }

  await tg(env, 'answerCallbackQuery', { callback_query_id: cq.id });
}
