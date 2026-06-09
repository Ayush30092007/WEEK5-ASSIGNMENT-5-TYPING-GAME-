// =============================================
//   COSMIC TYPER — game.js
// =============================================

// ---------- DOM References ----------
const arena      = document.getElementById('arena');
const ship       = document.getElementById('ship');
const laser      = document.getElementById('laser');
const explosion  = document.getElementById('explosion');
const scoreEl    = document.getElementById('score-val');
const streakEl   = document.getElementById('streak-val');
const bestEl     = document.getElementById('best-val');
const livesRow   = document.getElementById('lives-row');
const levelBadge = document.getElementById('level-badge');
const msgOverlay = document.getElementById('msg-overlay');
const msgTitle   = document.getElementById('msg-title');
const msgSub     = document.getElementById('msg-sub');
const msgBtn     = document.getElementById('msg-btn');
const typeInput  = document.getElementById('type-input');
const comboFlash = document.getElementById('combo-flash');
const shieldBar  = document.getElementById('shield-bar');
const accuracyEl = document.getElementById('accuracy-val');
const wpmEl      = document.getElementById('wpm-val');

const correctSound = new Audio("sounds/correct.mp3");
const wrongSound   = new Audio("sounds/wrong.mp3");
const finishSound  = new Audio("sounds/finish.mp3");

// ---------- Word Banks (harder each level) ----------
const WORD_BANKS = [
  ['star', 'moon', 'sun', 'mars', 'orbit', 'rock', 'ice'],
  ['comet', 'nebula', 'quasar', 'pulsar', 'photon', 'warp', 'nova'],
  ['asteroid', 'supernova', 'blackhole', 'lightyear', 'antimatter', 'quantum', 'cosmos'],
  ['interstellar', 'gravitational', 'electromagnetic', 'spectroscopy', 'astrophysics']
];

const COLORS = ['#e8674a', '#4ac8e8', '#b86ae8', '#e8c44a', '#6ae880', '#e87ab0'];
const SHAPES = [
  { br: '40% 60% 55% 45% / 50% 45% 55% 50%' },
  { br: '55% 45% 60% 40% / 45% 55% 50% 50%' },
  { br: '50% 50% 60% 40% / 40% 60% 55% 45%' }
];

// ---------- Game State ----------
let state = {
  running:      false,
  paused:       false,
  score:        0,
  lives:        3,
  level:        1,
  streak:       0,
  best:         0,
  shipY:        50,
  asteroids:    [],
  spawnTimer:   0,
  levelTimer:   0,
  animFrame:    null,
  lastTime:     0,
  correctWords: 0,
  totalAttempts: 0,
  startTime:    0
};

// ---------- Helper: pick a random word for the current level ----------
function randWord(level) {
  const tier = Math.min(level - 1, WORD_BANKS.length - 1);
  const bank = WORD_BANKS[tier];
  return bank[Math.floor(Math.random() * bank.length)];
}

// ---------- Update lives hearts in HUD ----------
function updateLives() {
  livesRow.innerHTML = '';
  for (let i = 0; i < state.lives; i++)
    livesRow.innerHTML += '<span class="life">❤️</span>';
  for (let i = state.lives; i < 3; i++)
    livesRow.innerHTML += '<span class="life" style="opacity:0.2">🖤</span>';
}

// ---------- Refresh all HUD numbers ----------
function updateHUD() {
  scoreEl.textContent  = state.score;
  streakEl.textContent = 'x' + state.streak;
  bestEl.textContent   = state.best;
  levelBadge.textContent = 'Level ' + state.level;

  const accuracy = state.totalAttempts === 0
    ? 100
    : Math.round((state.correctWords / state.totalAttempts) * 100);
  accuracyEl.textContent = accuracy + '%';

  const minutes = (Date.now() - state.startTime) / 60000;
  const wpm = minutes > 0 ? Math.round(state.correctWords / minutes) : 0;
  wpmEl.textContent = wpm;

  const pct = (state.lives / 3) * 100;
  shieldBar.style.width      = pct + '%';
  shieldBar.style.background = state.lives > 1 ? '#3af' : '#e84a4a';
}

// ---------- Spawn a new asteroid ----------
function spawnAsteroid() {
  const word     = randWord(state.level);
  const colorIdx = Math.floor(Math.random() * COLORS.length);
  const shapeIdx = Math.floor(Math.random() * SHAPES.length);
  const speed    = 38 + state.level * 12 + Math.random() * 20;
  const yPct     = 10 + Math.random() * 60;

  const el    = document.createElement('div');
  el.className = 'asteroid';
  el.style.top = yPct + '%';

  const shape = document.createElement('div');
  shape.className        = 'ast-shape';
  shape.style.background   = COLORS[colorIdx];
  shape.style.borderRadius = SHAPES[shapeIdx].br;
  shape.style.boxShadow    = `0 0 12px ${COLORS[colorIdx]}66`;

  const lbl = document.createElement('div');
  lbl.className   = 'ast-label';
  lbl.textContent = word;

  el.appendChild(shape);
  el.appendChild(lbl);
  arena.appendChild(el);

  const obj = {
    el,
    word,
    yPct,
    speed,
    x: arena.offsetWidth + 20
  };
  state.asteroids.push(obj);
  return obj;
}

// ---------- Remove an asteroid from DOM and state ----------
function removeAsteroid(obj) {
  state.asteroids = state.asteroids.filter(a => a !== obj);
  obj.el.remove();
}

// ---------- Combo / score flash popup ----------
function showCombo(text, color = '#ffd700') {
  comboFlash.textContent   = text;
  comboFlash.style.color   = color;
  comboFlash.style.opacity = '1';
  clearTimeout(comboFlash._timer);
  comboFlash._timer = setTimeout(() => { comboFlash.style.opacity = '0'; }, 900);
}

// ---------- Animate the laser beam ----------
function fireLaser(fromY, toX, callback) {
  const shipPx = 64;
  laser.style.display = 'block';
  laser.style.left    = shipPx + 'px';
  laser.style.top     = fromY + 'px';
  laser.style.width   = (toX - shipPx) + 'px';

  clearTimeout(laser._timer);
  laser._timer = setTimeout(() => {
    laser.style.display = 'none';
    if (callback) callback();
  }, 180);
}

// ---------- Explosion burst at (x, y) ----------
function showExplosion(x, y) {
  explosion.style.left      = x + 'px';
  explosion.style.top       = y + 'px';
  explosion.style.display   = 'block';
  explosion.style.animation = 'none';
  void explosion.offsetWidth;
  explosion.style.animation = 'explode 0.35s ease-out forwards';
  setTimeout(() => { explosion.style.display = 'none'; }, 380);
}

// ---------- Attempt to fire at the typed word ----------
function tryFire() {
  if (!state.running) return;

  const typed = typeInput.value.trim().toLowerCase();
  if (!typed) return;

  // Find the best matching asteroid — exact match first, then prefix match
  // Among matches, pick the one closest to the left edge (most dangerous)
  let target = null;

  // 1. Exact match
  for (const a of state.asteroids) {
    if (a.word === typed) {
      if (!target || a.x < target.x) target = a;
    }
  }

  // 2. Prefix match (if no exact)
  if (!target) {
    for (const a of state.asteroids) {
      if (a.word.startsWith(typed)) {
        if (!target || a.x < target.x) target = a;
      }
    }
  }

  if (!target) {
    // Miss — no matching asteroid
    state.totalAttempts++;
    wrongSound.currentTime = 0;
    wrongSound.play();

    typeInput.classList.add('wrong');
    setTimeout(() => typeInput.classList.remove('wrong'), 300);

    state.streak = 0;
    updateHUD();
    return;
  }

  // Hit — aim ship and fire
  const arenaH   = arena.offsetHeight;
  const targetPx = (target.yPct / 100) * arenaH;
  state.shipY    = (targetPx / arenaH) * 100;
  ship.style.top = state.shipY + '%';

  const astCenterX = target.x + 26;

  fireLaser(targetPx - 1.5, astCenterX, () => {
    correctSound.currentTime = 0;
    correctSound.play();

    showExplosion(astCenterX, targetPx);

    const base   = target.word.length * 10 * state.level;
    const mult   = 1 + Math.floor(state.streak / 3);
    state.score += base * mult;
    state.streak++;
    state.totalAttempts++;
    state.correctWords++;

    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem('bestScore', state.best);
    }

    if (state.streak > 0 && state.streak % 3 === 0) {
      showCombo('🔥 ' + state.streak + ' streak! ×' + mult, '#ffd700');
    } else {
      showCombo('+' + base * mult, '#7affb0');
    }

    removeAsteroid(target);
    updateHUD();
  });

  typeInput.value = '';
  typeInput.classList.add('correct');
  setTimeout(() => typeInput.classList.remove('correct'), 300);
}

// ---------- Main game loop ----------
function update(ts) {
  if (!state.running || state.paused) return;

  const dt = Math.min((ts - state.lastTime) / 1000, 0.1);
  state.lastTime = ts;

  const arenaW = arena.offsetWidth;
  const arenaH = arena.offsetHeight;

  // Spawn timer
  state.spawnTimer -= dt;
  const spawnInterval = Math.max(0.8, 2.8 - state.level * 0.25);
  if (state.spawnTimer <= 0) {
    spawnAsteroid();
    state.spawnTimer = spawnInterval + Math.random() * 0.8;
  }

  // Level-up timer (every 20 seconds)
  state.levelTimer += dt;
  if (state.levelTimer >= 20) {
    state.level      = Math.min(state.level + 1, 4);
    state.levelTimer = 0;
    showCombo('LEVEL ' + state.level + '!', '#3af');
  }

  // Move asteroids & highlight matches
  const typed = typeInput.value.trim().toLowerCase();

  for (let i = state.asteroids.length - 1; i >= 0; i--) {
    const a = state.asteroids[i];
    a.x -= a.speed * dt;
    a.el.style.left = a.x + 'px';

    const lbl   = a.el.querySelector('.ast-label');
    const shape = a.el.querySelector('.ast-shape');

    if (typed && a.word.startsWith(typed)) {
      lbl.innerHTML = `<span style="color:#3af">${a.word.slice(0, typed.length)}</span>${a.word.slice(typed.length)}`;
      shape.style.boxShadow = `0 0 20px ${shape.style.background}, 0 0 6px white`;
    } else {
      lbl.textContent       = a.word;
      shape.style.boxShadow = `0 0 12px ${shape.style.background}66`;
    }

    // Asteroid escaped off the left side
    if (a.x < -80) {
      removeAsteroid(a);
      state.lives--;
      state.streak = 0;
      updateLives();
      updateHUD();

      ship.style.filter = 'drop-shadow(0 0 8px #e84a4a)';
      setTimeout(() => { ship.style.filter = 'drop-shadow(0 0 8px #3af)'; }, 600);

      if (state.lives <= 0) { endGame(); return; }
    }
  }

  state.animFrame = requestAnimationFrame(update);
}

// ---------- Start / restart game ----------
function startGame() {
  state.asteroids.forEach(a => a.el.remove());

  state.asteroids    = [];
  state.score        = 0;
  state.lives        = 3;
  state.level        = 1;
  state.streak       = 0;
  state.shipY        = 50;
  state.spawnTimer   = 0;
  state.levelTimer   = 0;
  state.running      = true;
  state.paused       = false;
  state.correctWords = 0;
  state.totalAttempts = 0;
  state.startTime    = Date.now();
  state.best         = Number(localStorage.getItem('bestScore')) || 0;

  ship.style.top           = '50%';
  msgOverlay.style.display = 'none';
  arena.style.opacity      = '1';
  typeInput.value          = '';
  typeInput.focus();

  updateLives();
  updateHUD();

  state.lastTime  = performance.now();
  state.animFrame = requestAnimationFrame(update);
}

// ---------- End game ----------
function endGame() {
  state.running = false;
  cancelAnimationFrame(state.animFrame);
  finishSound.currentTime = 0;
  finishSound.play();
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('bestScore', state.best);
  }

  msgTitle.textContent = '💥 Game Over';
  msgSub.innerHTML =
    `Final Score: <strong style="color:white">${state.score}</strong><br>` +
    `Level reached: ${state.level} · Best streak: ${state.streak}<br>` +
    `<span style="color:rgba(255,255,255,0.5)">Press Enter or click to retry</span>`;
  msgBtn.textContent       = 'Play Again';
  msgOverlay.style.display = 'flex';
  updateHUD();
}

// ---------- Build star background ----------
function buildStars() {
  for (let i = 0; i < 60; i++) {
    const s    = document.createElement('div');
    s.className = 'star';
    const size  = Math.random() < 0.3 ? 2 : 1;
    s.style.cssText =
      `width:${size}px; height:${size}px;` +
      `left:${Math.random() * 100}%;` +
      `top:${Math.random() * 100}%;` +
      `animation-delay:${Math.random() * 3}s;` +
      `animation-duration:${2 + Math.random() * 3}s`;
    arena.appendChild(s);
  }
}

// ==============================================
//   KEYBOARD EVENT LISTENERS
// ==============================================

document.addEventListener('keydown', e => {
  if (!state.running) {
    if (e.key === 'Enter') startGame();
    return;
  }

  if (e.key === 'Escape') {
    typeInput.value = '';
    return;
  }

  if (e.key === '9' && document.activeElement !== typeInput) {
    state.paused = !state.paused;
    arena.style.opacity = state.paused ? '0.55' : '1';
    if (!state.paused) {
      state.lastTime = performance.now();
      requestAnimationFrame(update);
    }
    return;
  }

  if (document.activeElement !== typeInput) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.shipY = Math.max(8, state.shipY - 8);
      ship.style.top = state.shipY + '%';
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.shipY = Math.min(92, state.shipY + 8);
      ship.style.top = state.shipY + '%';
    }
  }

  if (e.key === ' ' && document.activeElement !== typeInput) {
    e.preventDefault();
    tryFire();
  }
});

document.addEventListener('keyup', e => {
  if (e.key === 'Shift') {
    // Future: release charged shot
  }
});

typeInput.addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    tryFire();
  }
});

typeInput.addEventListener('input', () => {
  if (!state.running) return;
  const typed = typeInput.value.trim().toLowerCase();
  state.asteroids.forEach(a => {
    const shape = a.el.querySelector('.ast-shape');
    if (shape) {
      if (typed.length >= 2 && a.word.startsWith(typed)) {
        shape.classList.add('highlight');
      } else {
        shape.classList.remove('highlight');
      }
    }
  });
});

msgBtn.addEventListener('click', startGame);
document.getElementById('fire-btn').addEventListener('click', tryFire);

window.onload = () => {
  buildStars();
  updateLives();
  updateHUD();
  startGame();
};