// The Velvet Vault — a top-down stealth heist.
// One thief, one museum, one Star Sapphire. Cross the gallery, dodge the
// guards' vision cones and the sweeping cameras, grab the sapphire, and slip
// out the front door before the alarm meter fills. All art is drawn in code,
// all sound is synthesized with WebAudio. No network, no assets.

'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
function rand(a, b) { return a + Math.random() * (b - a); }

// ---------------------------------------------------------------- geometry
// Walls are axis-aligned rectangles. Ray casting and line-of-sight both use
// the slab test, so vision cones stop at walls instead of passing through.

function rayHitRect(ox, oy, dx, dy, r) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) {
    if (ox < r.x || ox > r.x + r.w) return Infinity;
  } else {
    let t1 = (r.x - ox) / dx, t2 = (r.x + r.w - ox) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < r.y || oy > r.y + r.h) return Infinity;
  } else {
    let t1 = (r.y - oy) / dy, t2 = (r.y + r.h - oy) / dy;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

function rayDistance(ox, oy, angle, maxDist, rects) {
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = maxDist;
  for (const r of rects) {
    const t = rayHitRect(ox, oy, dx, dy, r);
    if (t < best) best = t;
  }
  return best;
}

function losBlocked(ax, ay, bx, by, rects) {
  const d = dist(ax, ay, bx, by);
  if (d < 1e-6) return false;
  const dx = (bx - ax) / d, dy = (by - ay) / d;
  for (const r of rects) {
    const t = rayHitRect(ax, ay, dx, dy, r);
    if (t < d - 0.5) return true;
  }
  return false;
}

function circleHitsRect(cx, cy, rad, r) {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < rad * rad;
}

// Move a circle against the wall list, sliding along walls.
function moveCircle(p, dx, dy, rad, rects) {
  let nx = p.x + dx, ny = p.y + dy;
  for (const r of rects) {
    if (circleHitsRect(nx, p.y, rad, r)) nx = p.x;
    if (circleHitsRect(p.x, ny, rad, r)) ny = p.y;
  }
  p.x = clamp(nx, rad, W - rad);
  p.y = clamp(ny, rad, H - rad);
}

// ---------------------------------------------------------------- level
// The museum: a vault room at the top, a grand gallery in the middle, and
// the front door at the bottom. Walls are solid; display cases block sight
// and movement but are low enough to hide behind.

const WALLS = [
  { x: 0, y: 0, w: W, h: 14 },            // north wall
  { x: 0, y: H - 14, w: W, h: 14 },       // south wall
  { x: 0, y: 0, w: 14, h: H },            // west wall
  { x: W - 14, y: 0, w: 14, h: H },       // east wall
  { x: 14, y: 150, w: 300, h: 14 },       // vault room south wall, west part
  { x: 646, y: 150, w: 300, h: 14 },      // vault room south wall, east part
  { x: 314, y: 14, w: 14, h: 136 },       // vault room west wall
  { x: 632, y: 14, w: 14, h: 136 },       // vault room east wall
  { x: 14, y: 330, w: 220, h: 14 },       // gallery divider west
  { x: 726, y: 330, w: 220, h: 14 },      // gallery divider east
];

const CASES = [
  { x: 120, y: 220, w: 110, h: 44 },      // display case, west gallery
  { x: 730, y: 220, w: 110, h: 44 },      // display case, east gallery
  { x: 120, y: 420, w: 110, h: 44 },      // display case, west lower
  { x: 730, y: 420, w: 110, h: 44 },      // display case, east lower
];
const SOLIDS = WALLS.concat(CASES);

// The vault pedestal and the exit door.
const VAULT = { x: 480, y: 84, r: 26 };
const EXIT = { x: 480, y: H - 14, w: 90, h: 14 };

// Patrol routes: each guard walks its waypoints and looks where it walks.
const GUARD_DEFS = [
  { x: 250, y: 420, speed: 62, route: [[250, 420], [700, 420], [700, 250], [250, 250]] },
  { x: 700, y: 500, speed: 58, route: [[700, 500], [700, 380], [250, 380], [250, 500]] },
  { x: 430, y: 250, speed: 66, route: [[430, 250], [430, 60], [560, 60], [560, 250]] },
];

// Cameras sit on walls and sweep their cone back and forth.
const CAMERA_DEFS = [
  { x: 480, y: 164, base: Math.PI / 2, sweep: 0.9, speed: 0.55, range: 210, half: 0.42 },
  { x: 60, y: 360, base: 0, sweep: 0.8, speed: 0.7, range: 200, half: 0.4 },
  { x: 900, y: 360, base: Math.PI, sweep: 0.8, speed: 0.7, range: 200, half: 0.4 },
];

const LOOT_DEFS = [
  { x: 175, y: 242, kind: 'bar', label: 'Gold bar', value: 150 },
  { x: 785, y: 242, kind: 'painting', label: 'Tiny portrait', value: 150 },
  { x: 175, y: 442, kind: 'gem', label: 'Ruby', value: 250 },
  { x: 785, y: 442, kind: 'gem', label: 'Emerald', value: 250 },
];

// ---------------------------------------------------------------- input
const keys = {};
let mouse = { x: 0, y: 0 };
let coinClick = null;

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
  if (e.key.toLowerCase() === 'r') resetGame();
  if ((e.key === 'Enter' || e.key === ' ') && state !== 'playing') startGame();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (W / r.width);
  mouse.y = (e.clientY - r.top) * (H / r.height);
});
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing') { startGame(); return; }
  const r = canvas.getBoundingClientRect();
  coinClick = {
    x: (e.clientX - r.left) * (W / r.width),
    y: (e.clientY - r.top) * (H / r.height),
  };
});

// ---------------------------------------------------------------- audio
// Everything is synthesized: a tiny WebAudio helper, no audio files.
let audioCtx = null;
function audio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function beep(freq, dur, type, vol, when) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + (when || 0);
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol || 0.08, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const sfx = {
  pickup() { beep(880, 0.12, 'sine', 0.09); beep(1320, 0.16, 'sine', 0.07, 0.07); },
  coin() { beep(1568, 0.08, 'triangle', 0.08); beep(2093, 0.1, 'triangle', 0.06, 0.06); },
  crack() { beep(440, 0.1, 'square', 0.05); beep(554, 0.1, 'square', 0.05, 0.09); beep(659, 0.14, 'square', 0.05, 0.18); },
  alert() { beep(220, 0.25, 'sawtooth', 0.07); beep(330, 0.25, 'sawtooth', 0.07, 0.12); },
  caught() { beep(196, 0.4, 'sawtooth', 0.09); beep(147, 0.6, 'sawtooth', 0.09, 0.3); },
  win() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.09, i * 0.13)); },
  step() { beep(90 + Math.random() * 30, 0.05, 'sine', 0.02); },
};

// ---------------------------------------------------------------- state
let state = 'title'; // title | playing | win | busted
let player, guards, cameras, loot, coins, thrownCoin;
let alarm, score, sapphire, sapphireProgress, timeSec, message, messageT;
let alarmSounded, stepT, winT;

function freshGuards() {
  return GUARD_DEFS.map((d) => ({
    x: d.x, y: d.y, speed: d.speed, route: d.route,
    wp: 1, dir: angleTo(d.x, d.y, d.route[1][0], d.route[1][1]),
    mode: 'patrol', // patrol | investigate | chase | search
    target: null, waitT: 0, searchT: 0, seenT: 0,
  }));
}
function freshCameras() {
  return CAMERA_DEFS.map((d) => ({ ...d, t: rand(0, 6), dir: d.base }));
}
function freshLoot() {
  return LOOT_DEFS.map((d) => ({ ...d, taken: false }));
}

function resetGame() {
  player = { x: 480, y: 540, r: 12, speed: 165, sneaking: false, face: -Math.PI / 2 };
  guards = freshGuards();
  cameras = freshCameras();
  loot = freshLoot();
  coins = 3;
  thrownCoin = null;
  alarm = 0;
  score = 0;
  sapphire = false;
  sapphireProgress = 0;
  timeSec = 0;
  message = '';
  messageT = 0;
  alarmSounded = false;
  stepT = 0;
  winT = 0;
  state = 'playing';
  audio();
}
function startGame() { resetGame(); }
resetGame();
state = 'title';

function setMessage(text, secs) {
  message = text;
  messageT = secs || 3;
}

function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + String(ss).padStart(2, '0');
}

// ---------------------------------------------------------------- update
function playerSeenBy(viewer, range, halfAngle) {
  const d = dist(viewer.x, viewer.y, player.x, player.y);
  const effRange = player.sneaking ? range * 0.55 : range;
  if (d > effRange) return 0;
  const a = angleTo(viewer.x, viewer.y, player.x, player.y);
  if (Math.abs(angDiff(a, viewer.dir)) > halfAngle) return 0;
  if (losBlocked(viewer.x, viewer.y, player.x, player.y, SOLIDS)) return 0;
  // Closer and more centered in the cone means faster detection.
  const closeness = 1 - d / effRange;
  const center = 1 - Math.abs(angDiff(a, viewer.dir)) / halfAngle;
  return 0.35 + 0.65 * closeness * center;
}

function update(dt) {
  if (state !== 'playing') return;
  timeSec += dt;
  if (messageT > 0) messageT -= dt;

  // --- player movement
  let mx = 0, my = 0;
  if (keys['w'] || keys['arrowup']) my -= 1;
  if (keys['s'] || keys['arrowdown']) my += 1;
  if (keys['a'] || keys['arrowleft']) mx -= 1;
  if (keys['d'] || keys['arrowright']) mx += 1;
  const moving = mx !== 0 || my !== 0;
  player.sneaking = !!(keys['shift']);
  const speed = player.speed * (player.sneaking ? 0.58 : 1);
  if (moving) {
    const len = Math.hypot(mx, my);
    const nx = (mx / len) * speed * dt, ny = (my / len) * speed * dt;
    moveCircle(player, nx, ny, player.r, SOLIDS);
    player.face = Math.atan2(ny, nx);
    stepT -= dt;
    if (stepT <= 0) { sfx.step(); stepT = player.sneaking ? 0.55 : 0.34; }
  }

  // --- throw a coin to distract guards
  if (coinClick) {
    const c = coinClick;
    coinClick = null;
    if (coins > 0) {
      coins -= 1;
      thrownCoin = { x: c.x, y: c.y, t: 0 };
      sfx.coin();
      for (const g of guards) {
        if (g.mode !== 'chase' && dist(g.x, g.y, c.x, c.y) < 260) {
          g.mode = 'investigate';
          g.target = { x: c.x, y: c.y };
        }
      }
      setMessage('Coin tossed. A guard goes to look.', 2.5);
    } else {
      setMessage('Out of coins.', 1.5);
    }
  }

  // --- cameras sweep
  for (const cam of cameras) {
    cam.t += dt;
    cam.dir = cam.base + Math.sin(cam.t * cam.speed) * cam.sweep;
  }

  // --- detection: guards and cameras feed the alarm meter
  let seen = 0;
  for (const g of guards) seen = Math.max(seen, playerSeenBy(g, 175, 0.62));
  for (const cam of cameras) seen = Math.max(seen, playerSeenBy(cam, cam.range, cam.half));
  if (seen > 0) {
    const before = alarm;
    alarm = Math.min(100, alarm + seen * 46 * dt);
    if (before < 55 && alarm >= 55 && !alarmSounded) {
      alarmSounded = true;
      sfx.alert();
      setMessage('SPOTTED! Break line of sight!', 2.5);
    }
  } else {
    alarm = Math.max(0, alarm - 9 * dt);
    if (alarm < 40) alarmSounded = false;
  }

  // --- guards: patrol, investigate a coin, chase when the alarm is full
  const alarmed = alarm >= 100;
  for (const g of guards) {
    if (alarmed) g.mode = 'chase';
    else if (g.mode === 'chase') g.mode = 'search';
    if (g.mode === 'patrol') {
      const wp = g.route[g.wp];
      const d = dist(g.x, g.y, wp[0], wp[1]);
      if (d < 6) {
        g.wp = (g.wp + 1) % g.route.length;
      } else {
        const a = angleTo(g.x, g.y, wp[0], wp[1]);
        g.dir = a;
        moveCircle(g, Math.cos(a) * g.speed * dt, Math.sin(a) * g.speed * dt, 12, SOLIDS);
      }
    } else if (g.mode === 'investigate' && g.target) {
      const d = dist(g.x, g.y, g.target.x, g.target.y);
      if (d < 10) {
        g.waitT += dt;
        if (g.waitT > 2.2) { g.mode = 'patrol'; g.target = null; g.waitT = 0; }
      } else {
        const a = angleTo(g.x, g.y, g.target.x, g.target.y);
        g.dir = a;
        moveCircle(g, Math.cos(a) * g.speed * 1.15 * dt, Math.sin(a) * g.speed * 1.15 * dt, 12, SOLIDS);
      }
    } else if (g.mode === 'chase') {
      const a = angleTo(g.x, g.y, player.x, player.y);
      g.dir = a;
      moveCircle(g, Math.cos(a) * g.speed * 1.55 * dt, Math.sin(a) * g.speed * 1.55 * dt, 12, SOLIDS);
      if (dist(g.x, g.y, player.x, player.y) < 26) {
        state = 'busted';
        sfx.caught();
      }
    } else if (g.mode === 'search') {
      g.searchT += dt;
      g.dir += dt * 1.6;
      if (g.searchT > 4) { g.mode = 'patrol'; g.searchT = 0; }
    }
  }

  // --- small loot: walk over it to pocket it
  for (const l of loot) {
    if (!l.taken && dist(player.x, player.y, l.x, l.y) < 26) {
      l.taken = true;
      score += l.value;
      sfx.pickup();
      setMessage(l.label + ' pocketed. +$' + l.value, 2);
    }
  }

  // --- the Star Sapphire: hold E beside the pedestal to crack it
  const nearVault = dist(player.x, player.y, VAULT.x, VAULT.y) < VAULT.r + 34;
  if (!sapphire && nearVault && keys['e']) {
    sapphireProgress += dt / 1.6;
    if (sapphireProgress >= 1) {
      sapphire = true;
      score += 1000;
      sfx.crack();
      setMessage('STAR SAPPHIRE secured! Get to the front door!', 4);
    }
  } else if (!sapphire) {
    sapphireProgress = Math.max(0, sapphireProgress - dt / 2);
  }

  // --- win: reach the front door with the sapphire
  if (sapphire && player.y > H - 40 && Math.abs(player.x - 480) < 55) {
    state = 'win';
    winT = timeSec;
    sfx.win();
  }
}

// ---------------------------------------------------------------- render
function drawCone(x, y, dir, half, range, color) {
  const rays = 26;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i <= rays; i++) {
    const a = dir - half + (2 * half * i) / rays;
    const d = rayDistance(x, y, a, range, SOLIDS);
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawGuard(g) {
  const alarmed = alarm >= 100;
  drawCone(g.x, g.y, g.dir, 0.62, 175, alarmed ? 'rgba(255,60,50,0.20)' : 'rgba(255,214,90,0.16)');
  // body
  ctx.beginPath();
  ctx.arc(g.x, g.y, 12, 0, TAU);
  ctx.fillStyle = alarmed ? '#a33' : '#2c4a6b';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#d8d2c0';
  ctx.stroke();
  // cap brim pointing where he looks
  ctx.beginPath();
  ctx.arc(g.x, g.y, 12, g.dir - 0.7, g.dir + 0.7);
  ctx.strokeStyle = '#d8b45a';
  ctx.lineWidth = 3;
  ctx.stroke();
  // eyes
  const ex = g.x + Math.cos(g.dir) * 5, ey = g.y + Math.sin(g.dir) * 5;
  ctx.beginPath();
  ctx.arc(ex, ey, 2.5, 0, TAU);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

function drawCamera(cam) {
  const spotted = playerSeenBy(cam, cam.range, cam.half) > 0;
  drawCone(cam.x, cam.y, cam.dir, cam.half, cam.range, spotted ? 'rgba(255,60,50,0.22)' : 'rgba(255,80,70,0.13)');
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.rotate(cam.dir);
  ctx.fillStyle = '#3a3a44';
  ctx.fillRect(-4, -5, 16, 10);
  ctx.fillStyle = spotted ? '#ff3b30' : '#ff6b5e';
  ctx.beginPath();
  ctx.arc(12, 0, 3.5, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.arc(cam.x, cam.y, 3, 0, TAU);
  ctx.fill();
}

function drawLootItem(l) {
  if (l.taken) return;
  const pulse = 1 + Math.sin(timeSec * 4 + l.x) * 0.12;
  ctx.save();
  ctx.translate(l.x, l.y);
  ctx.scale(pulse, pulse);
  if (l.kind === 'bar') {
    ctx.fillStyle = '#d8b45a';
    ctx.fillRect(-11, -6, 22, 12);
    ctx.fillStyle = '#f5d67a';
    ctx.fillRect(-11, -6, 22, 4);
  } else if (l.kind === 'painting') {
    ctx.fillStyle = '#7a5a2e';
    ctx.fillRect(-13, -10, 26, 20);
    ctx.fillStyle = '#c9a35a';
    ctx.fillRect(-10, -7, 20, 14);
    ctx.fillStyle = '#8a6a3a';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillStyle = l.kind === 'gem' && l.label === 'Emerald' ? '#37c978' : '#e0455a';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(8, 0);
    ctx.lineTo(0, 10);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '10px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(l.label, l.x, l.y + 30);
}

function drawPlayer() {
  const p = player;
  // shadow
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 8, 11, 5, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  // cloak
  ctx.beginPath();
  ctx.arc(p.x, p.y, 17, 0, TAU);
  ctx.fillStyle = 'rgba(216,180,90,0.10)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(p.x + Math.cos(p.face) * 14, p.y + Math.sin(p.face) * 14);
  ctx.lineTo(p.x + Math.cos(p.face + 2.4) * 12, p.y + Math.sin(p.face + 2.4) * 12);
  ctx.lineTo(p.x + Math.cos(p.face - 2.4) * 12, p.y + Math.sin(p.face - 2.4) * 12);
  ctx.closePath();
  ctx.fillStyle = p.sneaking ? '#5a3f7d' : '#4a3566';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 10, 0, TAU);
  ctx.fillStyle = '#4a3566';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#d8b45a';
  ctx.stroke();
  // face
  ctx.beginPath();
  ctx.arc(p.x + Math.cos(p.face) * 4, p.y + Math.sin(p.face) * 4, 4, 0, TAU);
  ctx.fillStyle = '#e8c9a0';
  ctx.fill();
  if (p.sneaking) {
    ctx.fillStyle = '#d8b45a';
    ctx.font = 'bold 9px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('SNEAK', p.x, p.y - 20);
  }
}

function drawHUD() {
  // top bar
  ctx.fillStyle = 'rgba(8,6,14,0.85)';
  ctx.fillRect(0, 0, W, 34);
  ctx.fillStyle = '#d8b45a';
  ctx.font = '13px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('ALARM', 16, 22);
  // alarm meter
  const mw = 220;
  ctx.fillStyle = '#221a12';
  ctx.fillRect(78, 10, mw, 14);
  const frac = alarm / 100;
  const grad = ctx.createLinearGradient(78, 0, 78 + mw, 0);
  grad.addColorStop(0, '#4caf50');
  grad.addColorStop(0.55, '#ffb300');
  grad.addColorStop(1, '#ff3b30');
  ctx.fillStyle = grad;
  ctx.fillRect(78, 10, mw * frac, 14);
  ctx.strokeStyle = '#d8b45a';
  ctx.lineWidth = 1;
  ctx.strokeRect(78, 10, mw, 14);
  if (alarm >= 100) {
    ctx.fillStyle = '#ff3b30';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.fillText('ALARM! RUN!', 306, 22);
  }
  ctx.fillStyle = '#e8dcc0';
  ctx.font = '13px Georgia, serif';
  ctx.fillText('Loot  $' + score.toLocaleString(), 430, 22);
  ctx.fillText('Coins  ' + coins, 560, 22);
  ctx.fillText('Time  ' + fmtTime(timeSec), 650, 22);
  ctx.fillStyle = sapphire ? '#7ee787' : '#d8b45a';
  ctx.textAlign = 'right';
  ctx.fillText(sapphire ? 'SAPPHIRE SECURED — reach the door!' : 'Objective: steal the Star Sapphire', W - 16, 22);
  ctx.textAlign = 'left';
  if (messageT > 0) {
    ctx.fillStyle = 'rgba(8,6,14,0.8)';
    ctx.fillRect(W / 2 - 220, 44, 440, 26);
    ctx.fillStyle = '#ffd76a';
    ctx.font = '14px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, W / 2, 62);
    ctx.textAlign = 'left';
  }
}

function drawScene() {
  // floor: dark marble tiles
  ctx.fillStyle = '#1b1626';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(216,180,90,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  // carpet runner down the middle
  ctx.fillStyle = 'rgba(122,30,40,0.35)';
  ctx.fillRect(440, 164, 80, H - 178);
  ctx.strokeStyle = 'rgba(216,180,90,0.35)';
  ctx.strokeRect(440, 164, 80, H - 178);

  // vault room floor
  ctx.fillStyle = 'rgba(216,180,90,0.08)';
  ctx.fillRect(328, 14, 304, 136);

  // exit door
  ctx.fillStyle = '#2e6b34';
  ctx.fillRect(EXIT.x - EXIT.w / 2, EXIT.y - 4, EXIT.w, 14);
  ctx.fillStyle = '#cfe8c0';
  ctx.font = 'bold 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', 480, H - 22);

  // display cases
  for (const c of CASES) {
    ctx.fillStyle = '#241d33';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = '#d8b45a';
    ctx.lineWidth = 2;
    ctx.strokeRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = 'rgba(216,180,90,0.18)';
    ctx.fillRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
  }

  // walls
  for (const w of WALLS) {
    ctx.fillStyle = '#3a2f4a';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#57456e';
    ctx.fillRect(w.x, w.y, w.w, 3);
  }

  // vault pedestal + Star Sapphire
  ctx.beginPath();
  ctx.arc(VAULT.x, VAULT.y, VAULT.r, 0, TAU);
  ctx.fillStyle = '#2c2438';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#d8b45a';
  ctx.stroke();
  const glow = 0.5 + Math.sin(timeSec * 3) * 0.25;
  ctx.beginPath();
  ctx.arc(VAULT.x, VAULT.y, 15 + glow * 6, 0, TAU);
  ctx.fillStyle = sapphire ? 'rgba(126,231,135,0.18)' : 'rgba(90,180,255,0.25)';
  ctx.fill();
  if (!sapphire) {
    ctx.save();
    ctx.translate(VAULT.x, VAULT.y);
    ctx.rotate(Math.sin(timeSec * 2) * 0.15);
    ctx.fillStyle = '#7ec8ff';
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(11, 0); ctx.lineTo(0, 14); ctx.lineTo(-11, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d6ecff';
    ctx.beginPath();
    ctx.moveTo(0, -14); ctx.lineTo(5, 0); ctx.lineTo(0, 5); ctx.lineTo(-5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#cfe4ff';
    ctx.font = '11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('STAR SAPPHIRE — hold E', VAULT.x, VAULT.y + 44);
    if (sapphireProgress > 0) {
      ctx.fillStyle = '#221a12';
      ctx.fillRect(VAULT.x - 40, VAULT.y + 52, 80, 8);
      ctx.fillStyle = '#7ec8ff';
      ctx.fillRect(VAULT.x - 40, VAULT.y + 52, 80 * sapphireProgress, 8);
    }
  } else {
    ctx.fillStyle = '#7ee787';
    ctx.font = '11px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('pedestal empty', VAULT.x, VAULT.y + 44);
  }

  for (const l of loot) drawLootItem(l);
  if (thrownCoin) {
    ctx.beginPath();
    ctx.arc(thrownCoin.x, thrownCoin.y, 5, 0, TAU);
    ctx.fillStyle = '#ffd76a';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    thrownCoin.t += 1 / 60;
    if (thrownCoin.t > 3) thrownCoin = null;
  }

  for (const cam of cameras) drawCamera(cam);
  for (const g of guards) drawGuard(g);
  drawPlayer();
  drawHUD();
}

function drawOverlay(title, lines, accent) {
  ctx.fillStyle = 'rgba(6,4,10,0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent || '#d8b45a';
  ctx.font = '42px Georgia, serif';
  ctx.fillText(title, W / 2, H / 2 - 70);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = '16px Georgia, serif';
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, H / 2 - 20 + i * 26));
  ctx.fillStyle = '#9a8f78';
  ctx.font = '14px Georgia, serif';
  ctx.fillText('Press Enter or click to play again  ·  R to restart', W / 2, H / 2 + 110);
  ctx.textAlign = 'left';
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawScene();
  if (state === 'title') {
    drawOverlay('THE VELVET VAULT', [
      'The Star Sapphire sits in the vault room, upstairs in the gallery.',
      'Guards patrol with torches of sight. Cameras sweep the halls.',
      'Stay out of the yellow cones. When the alarm fills, they hunt you.',
      'Sneak with Shift. Toss a coin with a click to pull a guard away.',
      'Hold E at the pedestal to crack the sapphire, then reach the EXIT.',
    ]);
  } else if (state === 'win') {
    drawOverlay('CLEAN GETAWAY', [
      'You slipped out with the Star Sapphire.',
      'Loot: $' + score.toLocaleString() + '   ·   Time: ' + fmtTime(winT),
      'The museum never knew you were there.',
    ], '#7ee787');
  } else if (state === 'busted') {
    drawOverlay('BUSTED', [
      'A guard caught you under the alarm.',
      'Loot: $' + score.toLocaleString() + '   ·   Time: ' + fmtTime(timeSec),
      'The vault keeps its sapphire. This time.',
    ], '#ff6b5e');
  }
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
