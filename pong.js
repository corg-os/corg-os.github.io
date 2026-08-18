/* =====================================================================
   pong.js — "CORG Pong", the 1972 table-tennis game with a corgi where
   the square ball should be.

   Only reachable while a retro theme is up: the desktop icon and the
   start-menu entry carry .retro-only, which style.css shows for 95 and XP
   and hides on 7 and 11 — the same gate the old Pinball table used, since
   a bundled time-waster is a retro-Windows joke either way.

   The court is simulated in one fixed logical space, PG_W x PG_H, and the
   canvas is scaled to that — so every coordinate below is a court
   coordinate and nothing has to care about the window's real size.
   ===================================================================== */

const PG_W = 800;
const PG_H = 520;

// The two paddles are literally two lines: PG_PADDLE_W is their thickness.
const PG_PADDLE_W = 10;
const PG_PADDLE_H = 108;
const PG_PADDLE_INSET = 32;     // distance from the paddle's line to its wall
const PG_PLAYER_SPEED = 620;    // keyboard travel, px/sec

// The ball is a whole corgi, not a dot with a corgi in it — PG_BALL_R is the
// half-width of the picture, which is why it's a third of a paddle across.
const PG_BALL_R = 42;
const PG_SERVE_SPEED = 400;
const PG_SPEEDUP = 1.045;       // per paddle hit — a rally gets faster, not harder
const PG_MAX_SPEED = 1050;
const PG_MAX_BOUNCE_ANGLE = Math.PI / 3.4;   // off the paddle edge, ~53 degrees
const PG_SUBSTEPS = 4;          // anti-tunnelling: the paddles are thin

const PG_WIN_SCORE = 11;

// The CPU is deliberately beatable: it only starts tracking once the ball is
// coming back at it, and it can't move faster than this.
const PG_CPU_SPEED = 500;
const PG_CPU_REACT_X = PG_W * 0.42;

let pgCanvas = null;
let pgCtx = null;
let pgRaf = null;
let pgLastTime = 0;
let pgOpen = false;

let pgBall = null;
let pgState = 'serve';          // serve | play | over
let pgPlayerScore = 0;
let pgCpuScore = 0;
let pgRally = 0;
let pgBestRally = 0;
let pgServeToPlayer = true;
let pgMessage = '';
let pgMessageUntil = 0;

let pgPlayerY = (PG_H - PG_PADDLE_H) / 2;
let pgCpuY = (PG_H - PG_PADDLE_H) / 2;
let pgCpuTargetY = pgCpuY;

const pgKeys = { up: false, down: false };
// Set by mouse/touch on the canvas; null means the keyboard is driving.
let pgPointerY = null;

// The ball is corg.png drawn whole — no circular clip, no crop. The collision
// circle is inscribed in the picture, so the ball plays as round even though
// what you see is the entire dog.
const pgCorgImg = new Image();
pgCorgImg.src = 'images/corg.png';

/* ------------------------------------------------------------------
   Sound. Every bounce plays corg.wav, so this can't go through
   playSound() — that clones an <audio> element per call, which is far
   too slow and too loud during a fast rally. The clip is decoded once
   and fired as buffer sources instead, with the gain and pitch varying
   by impact speed.
   ------------------------------------------------------------------ */
let pgCorgBuffer = null;
let pgCorgLastPlay = 0;

function pgLoadCorgSound() {
    if (pgCorgBuffer || typeof audioCtx === 'undefined') return;
    fetch('sfx/corg.wav')
        .then((r) => r.arrayBuffer())
        .then((b) => audioCtx.decodeAudioData(b))
        .then((buf) => { pgCorgBuffer = buf; })
        .catch((e) => console.log('corg.wav failed to decode, falling back to <audio>.', e));
}

// `strength` is the impact speed, so a screamer off the paddle edge yelps
// louder and higher than a lazy bounce off the top wall.
function pgPlayCorg(strength) {
    const now = performance.now();
    if (now - pgCorgLastPlay < 45) return;   // a corner rattle shouldn't buzz
    pgCorgLastPlay = now;

    const base = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    const vol = Math.min(1, 0.25 + strength / 900) * base;
    if (vol <= 0) return;

    if (!pgCorgBuffer) {
        const el = new Audio('sfx/corg.wav');
        el.volume = Math.min(1, vol);
        el.play().catch(() => {});
        return;
    }

    if (audioCtx.state === 'suspended') audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = pgCorgBuffer;
    // Harder hits yelp higher, plus a little jitter so repeats don't phase.
    src.playbackRate.value = 0.9 + Math.min(0.35, strength / 1600) + Math.random() * 0.1;
    const gain = audioCtx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(audioCtx.destination);
    src.start();
}

/* ------------------------------------------------------------------
   Game state
   ------------------------------------------------------------------ */

function pgSay(text, ms) {
    pgMessage = text;
    pgMessageUntil = performance.now() + (ms || 1400);
}

function pgNewGame() {
    pgPlayerScore = 0;
    pgCpuScore = 0;
    pgRally = 0;
    pgServeToPlayer = true;
    pgPlayerY = (PG_H - PG_PADDLE_H) / 2;
    pgCpuY = (PG_H - PG_PADDLE_H) / 2;
    pgCpuTargetY = pgCpuY;
    pgSeatBall();
    pgState = 'serve';
    pgUpdateHud();
}

// The ball waits on the serving side's paddle until Space; that way a point
// never restarts under a player who isn't looking at the screen yet.
function pgSeatBall() {
    pgBall = {
        x: pgServeToPlayer ? PG_PADDLE_INSET + PG_PADDLE_W + PG_BALL_R + 4
                           : PG_W - PG_PADDLE_INSET - PG_PADDLE_W - PG_BALL_R - 4,
        y: PG_H / 2,
        vx: 0,
        vy: 0,
    };
}

function pgServe() {
    if (pgState !== 'serve' || !pgBall) return;
    // Serve angle is shallow — a serve that leaves at 45 degrees spends the
    // first second bouncing off the walls instead of crossing the court.
    const angle = (Math.random() * 0.5 - 0.25);
    const dir = pgServeToPlayer ? 1 : -1;
    pgBall.vx = Math.cos(angle) * PG_SERVE_SPEED * dir;
    pgBall.vy = Math.sin(angle) * PG_SERVE_SPEED;
    pgState = 'play';
    pgRally = 0;
    pgPlayCorg(PG_SERVE_SPEED);
}

function pgPoint(toPlayer) {
    if (toPlayer) pgPlayerScore++; else pgCpuScore++;

    if (pgRally > pgBestRally) {
        pgBestRally = pgRally;
        try { localStorage.setItem('corgPongBestRally', String(pgBestRally)); } catch (e) { /* private mode */ }
    }
    pgRally = 0;

    // Loser serves, which is both the real rule and the merciful one.
    pgServeToPlayer = !toPlayer;
    pgSeatBall();

    if (pgPlayerScore >= PG_WIN_SCORE || pgCpuScore >= PG_WIN_SCORE) {
        pgState = 'over';
    } else {
        pgState = 'serve';
        pgSay(toPlayer ? 'your point' : 'CPU point', 1100);
    }
    pgUpdateHud();
}

/* ------------------------------------------------------------------
   Simulation
   ------------------------------------------------------------------ */

function pgClampPaddle(y) {
    return Math.max(0, Math.min(PG_H - PG_PADDLE_H, y));
}

function pgStepPlayer(dt) {
    // The pointer wins while it's on the canvas: it was moved more recently
    // than any key, and mixing the two just fights the player.
    if (pgPointerY !== null) {
        pgPlayerY = pgClampPaddle(pgPointerY - PG_PADDLE_H / 2);
        return;
    }
    if (pgKeys.up) pgPlayerY -= PG_PLAYER_SPEED * dt;
    if (pgKeys.down) pgPlayerY += PG_PLAYER_SPEED * dt;
    pgPlayerY = pgClampPaddle(pgPlayerY);
}

function pgStepCpu(dt) {
    if (!pgBall) return;

    if (pgState === 'play' && pgBall.vx > 0 && pgBall.x > PG_CPU_REACT_X) {
        // Aim at where the ball will be, not where it is — but with a bias
        // that grows as the rally does, so the CPU drifts off a fast ball.
        const slip = Math.min(26, pgRally * 2.2);
        pgCpuTargetY = pgBall.y - PG_PADDLE_H / 2 + (pgCpuTargetOffset() * slip);
    } else if (pgState !== 'play') {
        pgCpuTargetY = (PG_H - PG_PADDLE_H) / 2;
    }

    const target = pgClampPaddle(pgCpuTargetY);
    const delta = target - pgCpuY;
    const step = PG_CPU_SPEED * dt;
    pgCpuY = pgClampPaddle(Math.abs(delta) <= step ? target : pgCpuY + Math.sign(delta) * step);
}

// One stable per-rally wobble, so the CPU's error doesn't jitter frame to
// frame (which would average out to no error at all).
function pgCpuTargetOffset() {
    return Math.sin(pgRally * 2.4);
}

function pgStepBall(dt) {
    if (!pgBall || pgState !== 'play') return;
    const b = pgBall;

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // Top and bottom walls.
    if (b.y - PG_BALL_R < 0 && b.vy < 0) {
        b.y = PG_BALL_R;
        b.vy = -b.vy;
        pgPlayCorg(Math.abs(b.vy));
    } else if (b.y + PG_BALL_R > PG_H && b.vy > 0) {
        b.y = PG_H - PG_BALL_R;
        b.vy = -b.vy;
        pgPlayCorg(Math.abs(b.vy));
    }

    pgHitPaddle(b, PG_PADDLE_INSET, pgPlayerY, 1);
    pgHitPaddle(b, PG_W - PG_PADDLE_INSET - PG_PADDLE_W, pgCpuY, -1);

    // Past a paddle and off the court: the other side scores.
    if (b.x + PG_BALL_R < 0) pgPoint(false);
    else if (b.x - PG_BALL_R > PG_W) pgPoint(true);
}

// `dir` is the direction the ball leaves in: +1 for the left paddle, -1 for
// the right one. Only a ball travelling into the paddle can hit it, so a ball
// that has already got behind one doesn't get batted back out.
function pgHitPaddle(b, px, py, dir) {
    if (dir > 0 ? b.vx >= 0 : b.vx <= 0) return;

    const face = dir > 0 ? px + PG_PADDLE_W : px;
    const overlapX = dir > 0 ? (b.x - PG_BALL_R <= face && b.x >= px - PG_BALL_R)
                             : (b.x + PG_BALL_R >= face && b.x <= px + PG_PADDLE_W + PG_BALL_R);
    if (!overlapX) return;
    if (b.y + PG_BALL_R < py || b.y - PG_BALL_R > py + PG_PADDLE_H) return;

    // Where on the paddle it landed, -1 (top) .. 1 (bottom), sets the angle —
    // this is the whole game: the paddle aims, it doesn't just reflect.
    const hit = ((b.y - (py + PG_PADDLE_H / 2)) / (PG_PADDLE_H / 2));
    const clamped = Math.max(-1, Math.min(1, hit));
    const angle = clamped * PG_MAX_BOUNCE_ANGLE;

    const speed = Math.min(PG_MAX_SPEED, Math.hypot(b.vx, b.vy) * PG_SPEEDUP);
    b.vx = Math.cos(angle) * speed * dir;
    b.vy = Math.sin(angle) * speed;
    b.x = dir > 0 ? face + PG_BALL_R : face - PG_BALL_R;

    pgRally++;
    pgPlayCorg(speed);
}

/* ------------------------------------------------------------------
   Drawing
   ------------------------------------------------------------------ */

/* The court is deliberately plain: black ground, a white net, two white bars.
   That's the whole of 1972 Pong, and it's the right backdrop for a ball that is
   a photograph of a dog — the ghost scores, the tinted paddles and the ring
   around the ball that used to be here were all competing with it. The scores
   live in the HUD above the canvas, which is the only place they're needed. */
function pgDrawCourt() {
    const ctx = pgCtx;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, PG_W, PG_H);

    // Dashed net, the one piece of furniture the original had.
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    ctx.setLineDash([18, 18]);
    ctx.beginPath();
    ctx.moveTo(PG_W / 2, 0);
    ctx.lineTo(PG_W / 2, PG_H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fff';
    ctx.fillRect(PG_PADDLE_INSET, pgPlayerY, PG_PADDLE_W, PG_PADDLE_H);
    ctx.fillRect(PG_W - PG_PADDLE_INSET - PG_PADDLE_W, pgCpuY, PG_PADDLE_W, PG_PADDLE_H);
}

// The whole picture, upright. Nothing clips it and nothing outlines it: the
// dog *is* the ball. Drawn at its own aspect ratio so it isn't squashed, with
// the collision circle (radius PG_BALL_R) inscribed in it. Corg never turns
// here for the same reason he never turns on the desktop — he stays the right
// way up wherever the game puts him.
function pgDrawBall() {
    if (!pgBall) return;
    const ctx = pgCtx;

    ctx.save();
    ctx.translate(pgBall.x, pgBall.y);

    if (pgCorgImg.complete && pgCorgImg.naturalWidth) {
        const scale = (PG_BALL_R * 2) / Math.max(pgCorgImg.naturalWidth, pgCorgImg.naturalHeight);
        const w = pgCorgImg.naturalWidth * scale;
        const h = pgCorgImg.naturalHeight * scale;
        ctx.drawImage(pgCorgImg, -w / 2, -h / 2, w, h);
    } else {
        // Only until the image lands — a plain square, the way Pong's ball was.
        ctx.fillStyle = '#fff';
        ctx.fillRect(-PG_BALL_R, -PG_BALL_R, PG_BALL_R * 2, PG_BALL_R * 2);
    }

    ctx.restore();
}

function pgDrawOverlay() {
    const ctx = pgCtx;
    ctx.textAlign = 'center';

    if (pgMessage && performance.now() < pgMessageUntil) {
        ctx.font = 'bold 20px "Courier New", monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(pgMessage, PG_W / 2, PG_H - 74);
    }

    if (pgState === 'serve') {
        ctx.font = 'bold 15px "Courier New", monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(pgServeToPlayer ? 'press SPACE to serve' : 'press SPACE — CPU serves',
                     PG_W / 2, PG_H - 40);
    }

    if (pgState === 'over') {
        const won = pgPlayerScore > pgCpuScore;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, PG_H / 2 - 62, PG_W, 124);
        ctx.font = 'bold 34px "Courier New", monospace';
        ctx.fillStyle = '#fff';
        ctx.fillText(won ? 'YOU WIN' : 'CPU WINS', PG_W / 2, PG_H / 2 - 16);
        ctx.font = 'bold 17px "Courier New", monospace';
        ctx.fillText(`${pgPlayerScore} — ${pgCpuScore}`, PG_W / 2, PG_H / 2 + 14);
        ctx.fillText('press ENTER for a new game', PG_W / 2, PG_H / 2 + 46);
    }
}

function pgUpdateHud() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('pong-player', String(pgPlayerScore));
    set('pong-cpu', String(pgCpuScore));
    set('pong-rally', String(pgRally));
    set('pong-best', String(pgBestRally));
}

/* ------------------------------------------------------------------
   Loop
   ------------------------------------------------------------------ */

function pgFrame(now) {
    if (!pgOpen) return;
    // First frame after opening has no previous timestamp, and a tab that was
    // in the background hands back a huge delta — either would fling the ball
    // through a paddle, so the step is clamped.
    let dt = pgLastTime ? (now - pgLastTime) / 1000 : 0;
    pgLastTime = now;
    dt = Math.min(dt, 0.05);

    const sub = dt / PG_SUBSTEPS;
    for (let i = 0; i < PG_SUBSTEPS; i++) {
        pgStepPlayer(sub);
        pgStepCpu(sub);
        pgStepBall(sub);
    }

    // A waiting ball rides the serving paddle, so the serve goes where the
    // server is pointing.
    if (pgState === 'serve' && pgBall) {
        pgBall.y = (pgServeToPlayer ? pgPlayerY : pgCpuY) + PG_PADDLE_H / 2;
    }

    pgCtx.setTransform(pgCanvas.width / PG_W, 0, 0, pgCanvas.height / PG_H, 0, 0);
    pgDrawCourt();
    pgDrawBall();
    pgDrawOverlay();
    pgUpdateHud();

    pgRaf = requestAnimationFrame(pgFrame);
}

/* ------------------------------------------------------------------
   Input. Listeners live on the document only while the court is open, so
   the clicker's own keyboard shortcuts aren't shadowed the rest of the time.
   ------------------------------------------------------------------ */

function pgKeyDown(e) {
    if (!pgOpen) return;
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { pgKeys.up = true; pgPointerY = null; e.preventDefault(); }
    if (k === 'ArrowDown' || k === 's' || k === 'S') { pgKeys.down = true; pgPointerY = null; e.preventDefault(); }
    if (k === ' ') {
        e.preventDefault();
        pgServe();
    }
    if (k === 'Enter' && pgState === 'over') pgNewGame();
    if (k === 'Escape') togglePong();
}

function pgKeyUp(e) {
    if (!pgOpen) return;
    const k = e.key;
    if (k === 'ArrowUp' || k === 'w' || k === 'W') { pgKeys.up = false; e.preventDefault(); }
    if (k === 'ArrowDown' || k === 's' || k === 'S') { pgKeys.down = false; e.preventDefault(); }
}

// Mouse and touch drive the paddle directly — the canvas is scaled to the
// window, so the pointer's client position has to come back through that
// scale to be a court coordinate.
function pgPointerMove(e) {
    if (!pgCanvas) return;
    const rect = pgCanvas.getBoundingClientRect();
    if (!rect.height) return;
    const point = e.touches && e.touches.length ? e.touches[0] : e;
    pgPointerY = ((point.clientY - rect.top) / rect.height) * PG_H;
    if (e.cancelable) e.preventDefault();
}

function pgPointerLeave() {
    pgPointerY = null;
}

// A tap on the court serves, so the game is playable without a keyboard.
function pgPointerDown(e) {
    pgPointerMove(e);
    if (pgState === 'serve') pgServe();
    else if (pgState === 'over') pgNewGame();
}

/* ------------------------------------------------------------------
   Open / close
   ------------------------------------------------------------------ */

function togglePong() {
    const screen = document.getElementById('pong-screen');
    if (!screen) return;

    if (screen.style.display === 'flex') {
        screen.style.display = 'none';
        pgOpen = false;
        if (pgRaf) { cancelAnimationFrame(pgRaf); pgRaf = null; }
        document.removeEventListener('keydown', pgKeyDown);
        document.removeEventListener('keyup', pgKeyUp);
        pgKeys.up = pgKeys.down = false;
        pgPointerY = null;
        if (typeof isPaused !== 'undefined') isPaused = false;
        return;
    }

    if (typeof isPaused !== 'undefined') isPaused = true;
    screen.style.display = 'flex';
    playSound('window-open-audio');

    pgCanvas = document.getElementById('pong-canvas');
    if (!pgCanvas) return;
    pgCtx = pgCanvas.getContext('2d');

    // Back the canvas at device resolution so the court isn't soft on a
    // high-DPI screen; the drawing code keeps working in court coordinates
    // because pgFrame sets the scale transform every frame.
    const dpr = window.devicePixelRatio || 1;
    pgCanvas.width = PG_W * dpr;
    pgCanvas.height = PG_H * dpr;

    if (!pgCanvas.dataset.pgBound) {
        pgCanvas.addEventListener('mousemove', pgPointerMove);
        pgCanvas.addEventListener('mouseleave', pgPointerLeave);
        pgCanvas.addEventListener('mousedown', pgPointerDown);
        pgCanvas.addEventListener('touchstart', pgPointerDown, { passive: false });
        pgCanvas.addEventListener('touchmove', pgPointerMove, { passive: false });
        pgCanvas.dataset.pgBound = '1';
        try { pgBestRally = parseInt(localStorage.getItem('corgPongBestRally'), 10) || 0; } catch (e) { pgBestRally = 0; }
    }
    pgLoadCorgSound();

    if (!pgBall || pgState === 'over') pgNewGame();

    pgOpen = true;
    pgLastTime = 0;
    document.addEventListener('keydown', pgKeyDown);
    document.addEventListener('keyup', pgKeyUp);
    pgRaf = requestAnimationFrame(pgFrame);
}
