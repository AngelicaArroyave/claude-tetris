'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#f06292', // + - pink
  '#a1887f', // U - brown
  '#4db6ac', // Y - teal
  '#fff176', // single - gold
  '#9e9e9e', // hollow 3x3 - gray
  '#ff5252', // bomba
  '#ffee58', // rayo
  '#e040fb', // tinte
  '#7e57c2', // gravedad
  '#b3e5fc', // congelar
  '#ffffff', // comodín (solo en tablero)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + (pentominó)
  [[9,0,9],[9,9,9],[0,0,0]],                  // U (pentominó)
  [[0,0,0,0],[10,10,10,10],[0,10,0,0],[0,0,0,0]], // Y (pentominó)
  [[11]],                                      // single 1x1 (recompensa)
  [[12,12,12],[12,0,12],[12,12,12]],          // hueca 3x3 (reto)
  [[13]], [[14]], [[15]], [[16]], [[17]],     // power-ups 1x1
  [[18]],                                      // comodín
];

const STANDARD_COUNT = 7;
const PENTOMINOES = [8, 9, 10];
const SINGLE = 11;
const HOLLOW = 12;
const PENTO_CHANCE = 0.08;
const HOLLOW_CHANCE = 0.03;

const BOMB = 13;
const RAY = 14;
const TINT = 15;
const GRAVITY = 16;
const FREEZE = 17;
const WILDCARD = 18;
const POWERUPS = [BOMB, RAY, TINT, GRAVITY, FREEZE];
const POWER_ICONS = { 13: '💣', 14: '⚡', 15: '🎨', 16: '⬇️', 17: '❄️', 18: '★' };
const POWER_NAMES = { 13: '💣 BOMBA', 14: '⚡ RAYO', 15: '🎨 TINTE', 16: '⬇️ GRAVEDAD', 17: '❄️ CONGELAR' };
const POWERUP_EVERY = 5;
const FREEZE_MS = 5000;
const WILDCARD_BONUS = 50;
const MSG_MS = 1200;

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

const THEME_KEY = 'tetris-theme';
let gridColor = '#22222e';
let highlightColor = 'rgba(255,255,255,0.12)';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, rewardPending, powerupPending, freezeMs, effectMsg, effectMsgMs;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const roll = Math.random();
  let type;
  if (roll < HOLLOW_CHANCE) type = HOLLOW;
  else if (roll < HOLLOW_CHANCE + PENTO_CHANCE) type = PENTOMINOES[Math.floor(Math.random() * PENTOMINOES.length)];
  else type = Math.floor(Math.random() * STANDARD_COUNT) + 1;
  return makePiece(type);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  let wildcards = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      wildcards += board[r].filter(v => v === WILDCARD).length;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    if (cleared === 4) rewardPending = true;
    if (Math.floor((lines + cleared) / POWERUP_EVERY) > Math.floor(lines / POWERUP_EVERY)) powerupPending = true;
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    if (wildcards) {
      score += wildcards * WILDCARD_BONUS * level;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (board[r][c] === WILDCARD) board[r][c] = 0;
    }
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function showMsg(text) {
  effectMsg = text;
  effectMsgMs = MSG_MS;
}

function bomb(x, y) {
  for (let r = y - 1; r <= y + 1; r++)
    for (let c = x - 1; c <= x + 1; c++)
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) board[r][c] = 0;
}

function ray(x, y) {
  for (let r = 0; r < ROWS; r++) board[r][x] = 0;
  board.splice(y, 1);
  board.unshift(new Array(COLS).fill(0));
}

function tint(x, y) {
  let target = y + 1 < ROWS ? board[y + 1][x] : 0;
  if (!target || target >= WILDCARD) {
    const counts = {};
    let best = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const v = board[r][c];
        if (!v || v === WILDCARD) continue;
        counts[v] = (counts[v] || 0) + 1;
        if (!best || counts[v] > counts[best]) best = v;
      }
    target = best;
  }
  if (!target) return;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === target) board[r][c] = WILDCARD;
}

function compactGravity() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        const v = board[r][c];
        board[r][c] = 0;
        board[write][c] = v;
        write--;
      }
    }
  }
}

function applyPowerUp(piece) {
  const { x, y, type } = piece;
  showMsg(POWER_NAMES[type]);
  if (type === BOMB) bomb(x, y);
  else if (type === RAY) ray(x, y);
  else if (type === TINT) tint(x, y);
  else if (type === GRAVITY) compactGravity();
  // FREEZE se activa en spawn(); no deja bloque
}

function lockPiece() {
  if (POWERUPS.includes(current.type)) applyPowerUp(current);
  else merge();
  clearLines();
  spawn();
}

function spawn() {
  if (rewardPending) {
    current = makePiece(SINGLE);
    rewardPending = false;
  } else {
    current = next;
    if (powerupPending) {
      next = makePiece(POWERUPS[Math.floor(Math.random() * POWERUPS.length)]);
      powerupPending = false;
    } else {
      next = randomPiece();
    }
  }
  if (current.type === FREEZE) {
    freezeMs = FREEZE_MS;
    showMsg(POWER_NAMES[FREEZE]);
  }
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = highlightColor;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  const icon = POWER_ICONS[colorIndex];
  if (icon) {
    context.globalAlpha = alpha ?? 1;
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = colorIndex === WILDCARD ? '#555' : '#000';
    context.fillText(icon, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // En game over la pieza actual colisiona (nunca se colocó): no dibujarla
  if (gameOver) return;

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);

  drawOverlayFx();
}

function drawOverlayFx() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (freezeMs > 0) {
    ctx.fillStyle = 'rgba(100,181,246,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e1f5fe';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`❄️ ${(freezeMs / 1000).toFixed(1)}s`, canvas.width / 2, 24);
  }
  if (effectMsgMs > 0) {
    ctx.globalAlpha = Math.min(1, effectMsgMs / 400);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.font = 'bold 28px sans-serif';
    ctx.strokeText(effectMsg, canvas.width / 2, canvas.height / 2);
    ctx.fillText(effectMsg, canvas.width / 2, canvas.height / 2);
    ctx.globalAlpha = 1;
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  draw(); // estado final real (por teclado el loop no redibuja)
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  if (effectMsgMs > 0) effectMsgMs -= dt;
  if (freezeMs > 0) freezeMs = Math.max(0, freezeMs - dt);
  else dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  // endGame() puede haberse llamado durante este frame (vía lockPiece→spawn):
  // cancelAnimationFrame no cancela el frame en curso, así que no reprogramar.
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  rewardPending = false;
  powerupPending = false;
  freezeMs = 0;
  effectMsg = '';
  effectMsgMs = 0;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function setTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeToggle.setAttribute('aria-label', isLight ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  themeToggle.textContent = isLight ? '🌙 Oscuro' : '☀️ Claro';
  try { localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark'); } catch (e) { /* ignorar */ }

  const styles = getComputedStyle(document.documentElement);
  gridColor = styles.getPropertyValue('--grid').trim() || gridColor;
  highlightColor = styles.getPropertyValue('--highlight').trim() || highlightColor;

  // Redibujar (necesario en pausa / game over, donde el loop está detenido)
  if (current) draw();
  if (next) drawNext();
}

themeToggle.addEventListener('click', e => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  // Clic de ratón: soltar el foco para que Space siga haciendo caída rápida
  if (e.detail > 0) themeToggle.blur();
});

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { /* ignorar */ }
setTheme(savedTheme);

init();
