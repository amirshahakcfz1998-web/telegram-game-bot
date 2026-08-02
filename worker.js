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
    margin: 0; padding: 0; background: linear-gradient(#87CEEB, #d9f2ff);
    font-family: Tahoma, sans-serif; display: flex; flex-direction: column;
    align-items: center; justify-content: center; height: 100vh; overflow: hidden; touch-action: manipulation;
  }
  #hud { position: absolute; top: 10px; width: 100%; text-align: center; color: #333; font-weight: bold; font-size: 18px; z-index: 5; }
  canvas { background: #fff; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); touch-action: manipulation; }
  #overlay {
    position: absolute; inset: 0; background: rgba(0,0,0,0.55); color: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; z-index: 10; padding: 20px;
  }
  #overlay h1 { font-size: 24px; margin-bottom: 6px; }
  #overlay p { margin: 4px 0; font-size: 15px; }
  #overlay button {
    margin-top: 16px; padding: 12px 28px; font-size: 16px; border: none; border-radius: 24px;
    background: #ff5a5f; color: #fff; font-weight: bold;
  }
  .hidden { display: none !important; }
  #board { margin-top: 12px; font-size: 13px; opacity: 0.9; max-height: 140px; overflow-y: auto; width: 90%; }
  #board div { display: flex; justify-content: space-between; padding: 2px 10px; }
</style>
</head>
<body>
<div id="hud">امتیاز: <span id="score">0</span> &nbsp;|&nbsp; رکورد: <span id="best">0</span></div>
<canvas id="game" width="360" height="500"></canvas>
<div id="overlay">
  <h1>🏃 بدو بدو و پرش</h1>
  <p>برای پرش روی صفحه ضربه بزن</p>
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
const bestEl = document.getElementById('best');
const boardEl = document.getElementById('board');

let W = canvas.width, H = canvas.height;
const GROUND_Y = H - 60;

let player, obstacles, speed, score, running, gravity, jumpCount;
let best = Number(localStorage.getItem('runner_best') || 0);
bestEl.textContent = best;

function resetGame() {
  player = { x: 60, y: GROUND_Y - 40, w: 34, h: 40, vy: 0, jumping: false };
  obstacles = [];
  speed = 5;
  score = 0;
  running = true;
  spawnTimer = 0;
}

let spawnTimer = 0;

function spawnObstacle() {
  const h = 30 + Math.random() * 30;
  obstacles.push({ x: W + 10, y: GROUND_Y - h, w: 24, h: h });
}

function jump() {
  if (!running) return;
  if (!player.jumping) {
    player.vy = -13;
    player.jumping = true;
  }
}

canvas.addEventListener('touchstart', (e) => { e.preventDefault(); jump(); }, { passive: false });
canvas.addEventListener('mousedown', jump);
document.addEventListener('keydown', (e) => { if (e.code === 'Space') jump(); });

function update() {
  if (!running) return;

  player.vy += 0.7;
  player.y += player.vy;
  if (player.y >= GROUND_Y - player.h) {
    player.y = GROUND_Y - player.h;
    player.vy = 0;
    player.jumping = false;
  }

  spawnTimer--;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = Math.max(35, 70 - Math.floor(score / 10));
  }

  speed = 5 + score / 100;

  for (let i = obstacles.length - 1; i >= 0; i--) {
    obstacles[i].x -= speed;
    if (obstacles[i].x + obstacles[i].w < 0) obstacles.splice(i, 1);
  }

  for (const o of obstacles) {
    if (player.x < o.x + o.w && player.x + player.w > o.x &&
        player.y < o.y + o.h && player.y + player.h > o.y) {
      endGame();
      return;
    }
  }

  score += 1;
  scoreEl.textContent = score;
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#eef6ff';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.fillStyle = '#5a8f3c';
  ctx.fillRect(0, GROUND_Y, W, 6);

  ctx.fillStyle = '#ff5a5f';
  ctx.fillRect(player.x, player.y, player.w, player.h);

  ctx.fillStyle = '#334';
  for (const o of obstacles) ctx.fillRect(o.x, o.y, o.w, o.h);
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
  overlay.querySelector('h1').textContent = '🏁 امتیاز: ' + score;
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
    margin: 0; padding: 0; background: #222; font-family: Tahoma, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; overflow: hidden; touch-action: manipulation;
  }
  #hud { position: absolute; top: 10px; width: 100%; text-align: center; color: #fff; font-weight: bold; font-size: 16px; z-index: 5; }
  canvas { background: #444; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
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
<canvas id="game" width="320" height="520"></canvas>
<div id="overlay">
  <h1>🏎️ جاده سه‌لاین</h1>
  <p>با ضربه به چپ یا راست صفحه لاین عوض کن</p>
  <p>هر ۱۰۰ امتیاز یک لول سخت‌تر میشه</p>
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
const ROAD_MARGIN = 20;
const LANE_W = (W - ROAD_MARGIN * 2) / LANES;

let best = Number(localStorage.getItem('racing_best') || 0);
bestEl.textContent = best;

let car, obstacles, score, level, running, speed, spawnTimer, spawnInterval;

function laneX(lane) { return ROAD_MARGIN + lane * LANE_W + LANE_W / 2; }

function resetGame() {
  car = { lane: 1, w: 36, h: 60, y: H - 100 };
  obstacles = [];
  score = 0;
  level = 1;
  speed = 3.2;
  spawnInterval = 75;
  spawnTimer = 0;
  running = true;
  levelEl.textContent = level;
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
  obstacles.push({ lane, y: -80, w: 36, h: 60, passed: false });
}

let roadOffset = 0;

function showLevelUp() {
  levelUpEl.textContent = 'لول ' + level + '!';
  levelUpEl.style.opacity = '1';
  setTimeout(() => { levelUpEl.style.opacity = '0'; }, 900);
}

function update() {
  if (!running) return;

  roadOffset = (roadOffset + speed) % 40;

  spawnTimer--;
  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = spawnInterval;
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

  const newLevel = Math.floor(score / 100) + 1;
  if (newLevel !== level) {
    level = newLevel;
    levelEl.textContent = level;
    speed = 3.2 + (level - 1) * 0.9;
    spawnInterval = Math.max(28, 75 - (level - 1) * 6);
    showLevelUp();
  }

  const carX = laneX(car.lane) - car.w / 2;
  for (const o of obstacles) {
    const ox = laneX(o.lane) - o.w / 2;
    if (car.lane === o.lane &&
        car.y < o.y + o.h && car.y + car.h > o.y) {
      endGame();
      return;
    }
  }

  score += 1;
  scoreEl.textContent = score;
}

function drawCar(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(x + 4, y + 6, w - 8, h * 0.35);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(ROAD_MARGIN, 0, W - ROAD_MARGIN * 2, H);

  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 16]);
  for (let l = 1; l < LANES; l++) {
    const x = ROAD_MARGIN + l * LANE_W;
    ctx.beginPath();
    ctx.moveTo(x, -40 + roadOffset);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const o of obstacles) {
    drawCar(laneX(o.lane) - o.w / 2, o.y, o.w, o.h, '#e63946');
  }

  drawCar(laneX(car.lane) - car.w / 2, car.y, car.w, car.h, '#3fa9f5');
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

  return new Response('ok');
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
