/* =====================================================================
   flappycorg.js — "Flappy Corg".

   The one-button game: a corgi, and a corridor of GUG cans. Same
   shape as pong.js and the rest: one fixed logical court (FC_W x FC_H),
   the canvas scaled to it, and every coordinate in this file a court
   coordinate, so nothing below has to know the real window size.

   The pipes are GUG cans because the can is what this whole game is
   about; they're drawn here rather than blitted from images/gug.png so
   a can can be any height without stretching a photo of one.

   Everything is drawn in Windows 9x's own language — flat fills, two-
   pixel bevels, dithered shading, dialog boxes — through the helpers in
   win9xcanvas.js, so it looks like a program that shipped in the box
   next to Minesweeper rather than an illustration embedded in one.

   Sound is corg.wav on every flap, through the same decode-once buffer
   trick pong.js uses (fcPlayCorg): playSound() clones an <audio> per
   call, which is far too slow and too loud for a sound that fires as
   fast as you can click.
   ===================================================================== */

const FC_W = 480;
const FC_H = 640;

const FC_GRAVITY = 1750;         // px/s²
// px/s, straight up, every flap identical. Worth a rise of vy²/2g ≈ 59px —
// about one and a half Corgs, which is the ratio the original flies at. At
// -520 (where this started) a flap was nearly two body-heights and the gap
// had to be cleared by feel rather than by aim.
const FC_FLAP_VY = -455;
const FC_MAX_FALL = 900;

const FC_CORG_R = 20;            // collision circle, inscribed in the sprite
const FC_CORG_X = 130;           // Corg never moves horizontally; the world does

const FC_PIPE_W = 74;
const FC_PIPE_GAP = 178;         // vertical hole between the cans
const FC_PIPE_SPACING = 240;     // horizontal gap between pairs
const FC_PIPE_MARGIN = 70;       // closest a gap comes to the ceiling or ground
const FC_SPEED_START = 165;      // px/s the world scrolls
const FC_SPEED_MAX = 300;
const FC_SPEED_PER_POINT = 3.4;  // it gets faster the longer you last

const FC_GROUND_H = 78;
const FC_FLOOR_Y = FC_H - FC_GROUND_H;

/* ------------------------------------------------------------------
   Art
   ------------------------------------------------------------------ */

const fcCorgImg = new Image();
fcCorgImg.src = 'images/corg.png';

/* ------------------------------------------------------------------
   Sound — see the header. Identical to pgPlayCorg, deliberately: it's
   the same clip doing the same job.
   ------------------------------------------------------------------ */
let fcCorgBuffer = null;
let fcCorgLastPlay = 0;

function fcLoadCorgSound() {
    if (fcCorgBuffer || typeof audioCtx === 'undefined') return;
    fetch('sfx/corg.wav')
        .then((r) => r.arrayBuffer())
        .then((b) => audioCtx.decodeAudioData(b))
        .then((buf) => { fcCorgBuffer = buf; })
        .catch((e) => console.log('corg.wav failed to decode, falling back to <audio>.', e));
}

function fcPlayCorg(pitch) {
    const now = performance.now();
    if (now - fcCorgLastPlay < 45) return;
    fcCorgLastPlay = now;

    const vol = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    if (vol <= 0) return;

    if (!fcCorgBuffer) {
        const el = new Audio('sfx/corg.wav');
        el.volume = Math.min(1, vol);
        el.play().catch(() => {});
        return;
    }

    if (audioCtx.state === 'suspended') audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = fcCorgBuffer;
    src.playbackRate.value = (pitch || 1) + Math.random() * 0.08;
    const gain = audioCtx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(audioCtx.destination);
    src.start();
}

/* ------------------------------------------------------------------
   State
   ------------------------------------------------------------------ */

let fcCanvas = null;
let fcCtx = null;
let fcRaf = null;
let fcLastTime = 0;
let fcOpen = false;

let fcState = 'ready';           // ready | play | over
let fcPipes = [];
let fcScore = 0;
let fcBest = 0;
let fcScroll = 0;                // how far the world has travelled, for parallax
let fcDeathAt = 0;

// Corg stays upright wherever he shows up, the same way the desktop one does:
// he moves, he never turns. So there is no `rot` here and nothing writes one.
const fcCorg = { y: FC_H / 2, vy: 0 };

/* ------------------------------------------------------------------
   Pipes
   ------------------------------------------------------------------ */

// The gap wanders rather than being uniformly random: a purely random
// next-gap can jump ceiling-to-floor between two pairs, which is only
// clearable by luck. Each gap is placed within reach of the last.
function fcNextGapY(prevGapY) {
    const min = FC_PIPE_MARGIN + FC_PIPE_GAP / 2;
    const max = FC_FLOOR_Y - FC_PIPE_MARGIN - FC_PIPE_GAP / 2;
    if (prevGapY == null) return (min + max) / 2;

    const reach = 132;
    const lo = Math.max(min, prevGapY - reach);
    const hi = Math.min(max, prevGapY + reach);
    return lo + Math.random() * (hi - lo);
}

function fcAddPipe(x) {
    const prev = fcPipes.length ? fcPipes[fcPipes.length - 1].gapY : null;
    fcPipes.push({ x, gapY: fcNextGapY(prev), scored: false });
}

function fcSpeed() {
    return Math.min(FC_SPEED_MAX, FC_SPEED_START + fcScore * FC_SPEED_PER_POINT);
}

function fcStepPipes(dt) {
    const dx = fcSpeed() * dt;
    fcScroll += dx;

    fcPipes.forEach((p) => { p.x -= dx; });

    // Scoring is on the trailing edge: the point is for having got through,
    // not for having reached.
    fcPipes.forEach((p) => {
        if (!p.scored && p.x + FC_PIPE_W < FC_CORG_X - FC_CORG_R) {
            p.scored = true;
            fcScore++;
            fcPlayCorg(1.25);
        }
    });

    while (fcPipes.length && fcPipes[0].x + FC_PIPE_W < -40) fcPipes.shift();

    const last = fcPipes[fcPipes.length - 1];
    if (!last || last.x < FC_W - FC_PIPE_SPACING) {
        fcAddPipe(last ? last.x + FC_PIPE_SPACING : FC_W + 60);
    }
}

/* ------------------------------------------------------------------
   Corg
   ------------------------------------------------------------------ */

function fcFlap() {
    fcCorg.vy = FC_FLAP_VY;
    fcPlayCorg(1);
}

function fcStepCorg(dt) {
    fcCorg.vy = Math.min(FC_MAX_FALL, fcCorg.vy + FC_GRAVITY * dt);
    fcCorg.y += fcCorg.vy * dt;

    // The ceiling is a wall, not a kill: hitting it in a one-button game is
    // usually the flap that saved you, and dying for it feels like a cheat.
    if (fcCorg.y < FC_CORG_R) { fcCorg.y = FC_CORG_R; fcCorg.vy = 0; }
}

// Circle against the two boxes of a pair. Returns true on any contact.
function fcHitsPipe(p) {
    const gapTop = p.gapY - FC_PIPE_GAP / 2;
    const gapBottom = p.gapY + FC_PIPE_GAP / 2;

    // Horizontally clear of this pair entirely.
    if (FC_CORG_X + FC_CORG_R < p.x || FC_CORG_X - FC_CORG_R > p.x + FC_PIPE_W) return false;

    // Inside the column: the only safe place is the gap, allowing for the
    // nearest-point test on the two corners of the hole.
    const nx = Math.max(p.x, Math.min(FC_CORG_X, p.x + FC_PIPE_W));
    for (const [top, bottom] of [[-1000, gapTop], [gapBottom, FC_H + 1000]]) {
        const ny = Math.max(top, Math.min(fcCorg.y, bottom));
        const dx = FC_CORG_X - nx;
        const dy = fcCorg.y - ny;
        if (dx * dx + dy * dy <= FC_CORG_R * FC_CORG_R) return true;
    }
    return false;
}

function fcCheckDeath() {
    if (fcCorg.y + FC_CORG_R >= FC_FLOOR_Y) {
        fcCorg.y = FC_FLOOR_Y - FC_CORG_R;
        fcGameOver();
        return;
    }
    for (const p of fcPipes) {
        if (fcHitsPipe(p)) { fcGameOver(); return; }
    }
}

/* ------------------------------------------------------------------
   Round
   ------------------------------------------------------------------ */

function fcNewGame() {
    fcPipes = [];
    fcScore = 0;
    fcScroll = 0;
    fcCorg.y = FC_H / 2;
    fcCorg.vy = 0;
    fcAddPipe(FC_W + 60);
    fcState = 'play';
    fcFlap();
    fcUpdateHud();
}

function fcGameOver() {
    if (fcState !== 'play') return;
    fcState = 'over';
    fcDeathAt = performance.now();
    if (fcScore > fcBest) {
        fcBest = fcScore;
        try { localStorage.setItem('corgFlappyBest', String(fcBest)); } catch (e) { /* private mode */ }
    }
    if (typeof playSound === 'function') playSound('error-audio');
    fcUpdateHud();
}

/* ------------------------------------------------------------------
   Drawing
   ------------------------------------------------------------------ */

function fcDrawBackdrop() {
    const ctx = fcCtx;

    // The desktop teal, dithered one shade lighter — the way a 16-colour
    // program got a tone it didn't have. No gradient: Windows had none to
    // spend here, and a smooth sky is the single thing that would stop this
    // reading as a program that shipped in the box. The dither covers the
    // whole sky rather than a band of it, because a band leaves a hard seam
    // across the screen that looks like a bug.
    ctx.fillStyle = W9X.teal;
    ctx.fillRect(0, 0, FC_W, FC_H);
    win9xDither(ctx, 0, 0, FC_W, FC_FLOOR_Y, W9X.teal, W9X.tealLight);

    // Clouds, as blocky sunken panels rather than soft blobs. They scroll on
    // their own slower track, which is the only parallax in the game.
    const off = (fcScroll * 0.32) % 320;
    for (let i = -1; i < 3; i++) {
        const cx = i * 320 - off + 40;
        fcDrawCloud(cx, 64);
        fcDrawCloud(cx + 170, 140);
    }
}

// A 9x cloud: two flat light-grey slabs, hard-edged, one bevel.
function fcDrawCloud(x, y) {
    const ctx = fcCtx;
    ctx.globalAlpha = 0.5;
    win9xBevel(ctx, x, y, 74, 18, true, W9X.light);
    win9xBevel(ctx, x + 18, y - 12, 44, 14, true, W9X.light);
    ctx.globalAlpha = 1;
}

function fcDrawGround() {
    const ctx = fcCtx;

    // The floor is a raised grey panel — the taskbar, essentially, which is
    // what the bottom edge of a Windows screen looks like.
    win9xBevel(ctx, -2, FC_FLOOR_Y, FC_W + 4, FC_GROUND_H + 4, true);

    // Scrolling tick marks along it, so the ground reads as moving even
    // between cans. Sunken notches, drawn the way a 9x separator is.
    const off = fcScroll % 32;
    for (let x = -32; x < FC_W + 32; x += 32) {
        ctx.fillStyle = W9X.shadow;
        ctx.fillRect(Math.round(x - off) + 12, FC_FLOOR_Y + 12, 1, FC_GROUND_H - 20);
        ctx.fillStyle = W9X.white;
        ctx.fillRect(Math.round(x - off) + 13, FC_FLOOR_Y + 12, 1, FC_GROUND_H - 20);
    }
}

// One GUG can, drawn to fill a box, flat and bevelled. `mouthAtBottom` puts
// the rim at the end facing the gap, so a top can hangs and a bottom can
// stands, the way the real thing would.
function fcDrawCan(x, y, w, h, mouthAtBottom) {
    const ctx = fcCtx;
    if (h <= 0) return;

    // Body: three flat vertical bands, dark / red / dark. A cylinder in four
    // colours, which is how everything was a cylinder in 1995.
    ctx.fillStyle = '#800000';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#c02020';
    ctx.fillRect(x + 8, y, w - 20, h);
    ctx.fillStyle = '#e06060';
    ctx.fillRect(x + 14, y, 8, h);

    // Hard edges rather than a bevel: a can is round, so the light side is a
    // stripe down it and not a frame around it.
    ctx.fillStyle = W9X.dark;
    ctx.fillRect(x, y, 1, h);
    ctx.fillRect(x + w - 1, y, 1, h);

    // Silver label bands.
    const bandY = mouthAtBottom ? y + 10 : y + h - 26;
    ctx.fillStyle = W9X.face;
    ctx.fillRect(x, bandY, w, 12);
    ctx.fillStyle = W9X.white;
    ctx.fillRect(x, bandY, w, 1);
    ctx.fillStyle = W9X.shadow;
    ctx.fillRect(x, bandY + 11, w, 1);

    // The wordmark, running down the can, on anything tall enough to hold it.
    if (h > 104) {
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = `bold 24px ${w9xFont()}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000000';
        ctx.fillText('GUG', 1, 1);
        ctx.fillStyle = '#ffd34d';
        ctx.fillText('GUG', 0, 0);
        ctx.restore();
    }

    // The rim: a wider slab at the end facing the gap.
    const lipH = 16;
    const lipY = mouthAtBottom ? y + h - lipH : y;
    win9xBevel(ctx, x - 7, lipY, w + 14, lipH, true, '#a01818');
}

function fcDrawPipes() {
    fcPipes.forEach((p) => {
        const gapTop = p.gapY - FC_PIPE_GAP / 2;
        const gapBottom = p.gapY + FC_PIPE_GAP / 2;
        fcDrawCan(p.x, 0, FC_PIPE_W, gapTop, true);
        fcDrawCan(p.x, gapBottom, FC_PIPE_W, FC_FLOOR_Y - gapBottom, false);
    });
}

function fcDrawCorg() {
    const ctx = fcCtx;
    ctx.save();
    ctx.translate(FC_CORG_X, fcCorg.y);

    if (fcCorgImg.complete && fcCorgImg.naturalWidth) {
        const scale = (FC_CORG_R * 2.4) / Math.max(fcCorgImg.naturalWidth, fcCorgImg.naturalHeight);
        const w = fcCorgImg.naturalWidth * scale;
        const h = fcCorgImg.naturalHeight * scale;
        ctx.drawImage(fcCorgImg, -w / 2, -h / 2, w, h);
    } else {
        ctx.fillStyle = '#e08a2e';
        ctx.fillRect(-FC_CORG_R, -FC_CORG_R, FC_CORG_R * 2, FC_CORG_R * 2);
    }

    // A wing that beats while Corg is climbing. Two flat triangles, tied to
    // the rise rather than to a timer, so it flaps when the flap happens.
    if (fcCorg.vy < 0) {
        const beat = Math.sin(performance.now() / 45) * 6;
        ctx.fillStyle = '#f6c07a';
        ctx.strokeStyle = '#7a3f0a';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-4, -2);
        ctx.lineTo(-22, -10 + beat);
        ctx.lineTo(-20, 6 + beat);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

function fcDrawOverlay() {
    const ctx = fcCtx;

    // The live score, in the sunken field a 9x program would put a counter in.
    if (fcState !== 'ready') {
        win9xField(ctx, FC_W / 2 - 44, 16, 88, 26, String(fcScore), 'center');
    }

    if (fcState !== 'ready' && fcState !== 'over') return;

    // The title and game-over screens are dialog boxes, because in this
    // operating system that is what tells you something.
    const w = 344, h = 168;
    const x = Math.round((FC_W - w) / 2);
    const y = Math.round(FC_H / 2 - h / 2);
    const inner = win9xDialog(ctx, x, y, w, h,
        fcState === 'ready' ? 'Flappy Corg' : 'Flappy Corg');

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = W9X.text;

    const lines = (fcState === 'ready')
        ? ['Click, or press SPACE, to flap.',
           'Fly between the GUG cans.',
           'Touch one, or the ground, and it is over.']
        : [`You cleared ${fcScore} ${fcScore === 1 ? 'can' : 'cans'}.`,
           `Best so far: ${fcBest}.`];

    ctx.font = `bold 15px ${w9xFont()}`;
    ctx.fillText(fcState === 'ready' ? 'Flappy Corg' : 'Game over', FC_W / 2, inner.y + 20);

    ctx.font = `12px ${w9xFont()}`;
    lines.forEach((line, i) => {
        ctx.fillText(line, FC_W / 2, inner.y + 44 + i * 17);
    });

    win9xButton(ctx, FC_W / 2 - 52, y + h - 40, 104, 24,
                fcState === 'ready' ? 'Start' : 'Play again', false);
}

function fcUpdateHud() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('fc-score', String(fcScore));
    set('fc-best', String(fcBest));
    set('fc-speed', Math.round(fcSpeed()) + ' px/s');
}

/* ------------------------------------------------------------------
   Loop
   ------------------------------------------------------------------ */

function fcFrame(now) {
    if (!fcOpen) return;

    // Same clamp as Pong's: the first frame has no previous timestamp and a
    // backgrounded tab hands back a huge one, either of which would teleport
    // Corg through a can.
    let dt = fcLastTime ? (now - fcLastTime) / 1000 : 0;
    fcLastTime = now;
    dt = Math.min(dt, 0.05);

    if (fcState === 'play') {
        fcStepCorg(dt);
        fcStepPipes(dt);
        fcCheckDeath();
    } else if (fcState === 'over') {
        // Corg keeps falling after the hit, and lands.
        if (fcCorg.y + FC_CORG_R < FC_FLOOR_Y) {
            fcCorg.vy = Math.min(FC_MAX_FALL, fcCorg.vy + FC_GRAVITY * dt);
            fcCorg.y = Math.min(FC_FLOOR_Y - FC_CORG_R, fcCorg.y + fcCorg.vy * dt);
        }
    }

    fcCtx.setTransform(fcCanvas.width / FC_W, 0, 0, fcCanvas.height / FC_H, 0, 0);
    fcDrawBackdrop();
    fcDrawPipes();
    fcDrawGround();
    fcDrawCorg();
    fcDrawOverlay();
    fcUpdateHud();

    fcRaf = requestAnimationFrame(fcFrame);
}

/* ------------------------------------------------------------------
   Input
   ------------------------------------------------------------------ */

// One button does everything: start, flap, restart. The restart has a short
// lockout so the click that killed you doesn't also start the next round
// before you've read the score.
function fcPress() {
    if (fcState === 'play') { fcFlap(); return; }
    if (fcState === 'ready') { fcNewGame(); return; }
    if (performance.now() - fcDeathAt > 550) fcNewGame();
}

function fcKeyDown(e) {
    if (!fcOpen) return;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'Enter') {
        e.preventDefault();
        fcPress();
    }
    if (e.key === 'Escape') toggleFlappyCorg();
}

function fcPointerDown(e) {
    if (e.cancelable) e.preventDefault();
    fcPress();
}

/* ------------------------------------------------------------------
   Open / close
   ------------------------------------------------------------------ */

function toggleFlappyCorg() {
    const screen = document.getElementById('flappycorg-screen');
    if (!screen) return;

    if (screen.style.display === 'flex') {
        screen.style.display = 'none';
        fcOpen = false;
        if (fcRaf) { cancelAnimationFrame(fcRaf); fcRaf = null; }
        document.removeEventListener('keydown', fcKeyDown);
        if (typeof isPaused !== 'undefined') isPaused = false;
        return;
    }

    if (typeof isPaused !== 'undefined') isPaused = true;
    screen.style.display = 'flex';
    playSound('window-open-audio');

    fcCanvas = document.getElementById('flappycorg-canvas');
    if (!fcCanvas) return;
    fcCtx = fcCanvas.getContext('2d');

    // Backed at device resolution so the cans aren't soft on a high-DPI
    // screen; the drawing code stays in court coordinates because fcFrame
    // sets the scale transform every frame.
    const dpr = window.devicePixelRatio || 1;
    fcCanvas.width = FC_W * dpr;
    fcCanvas.height = FC_H * dpr;

    if (!fcCanvas.dataset.fcBound) {
        fcCanvas.addEventListener('mousedown', fcPointerDown);
        fcCanvas.addEventListener('touchstart', fcPointerDown, { passive: false });
        fcCanvas.dataset.fcBound = '1';
        try { fcBest = parseInt(localStorage.getItem('corgFlappyBest'), 10) || 0; } catch (e) { fcBest = 0; }
    }
    fcLoadCorgSound();

    // A finished round leaves its score on screen until you close the window;
    // reopening starts from the title card.
    if (fcState === 'over') fcState = 'ready';
    if (fcState === 'ready') { fcPipes = []; fcCorg.y = FC_H / 2; fcCorg.vy = 0; }

    fcOpen = true;
    fcLastTime = 0;
    fcUpdateHud();
    document.addEventListener('keydown', fcKeyDown);
    fcRaf = requestAnimationFrame(fcFrame);
}
