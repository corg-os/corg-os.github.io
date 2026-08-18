/* =====================================================================
   angrycorgs.js — "Angry Corgs".

   Pull a corgi back on a slingshot, let go, knock the popups down. Same
   shape as pong.js and flappycorg.js: one fixed logical court
   (AC_W x AC_H) with the canvas scaled to it, so every coordinate below
   is a court coordinate.

   About the physics: the boxes never rotate. They fall, they slide, they
   shove each other and they get destroyed, but a crate that ends up on
   its corner stays axis-aligned. That's a deliberate limit, not an
   oversight — proper rotating rigid bodies need a real solver, and the
   half-measure (rotating the sprite while colliding the upright box) is
   a lie that shows the moment a "tilted" beam stops something it visibly
   isn't touching. Towers here collapse into rubble rather than toppling
   like dominoes, and everything you see is what the collision sees.

   Structures are stacks of GUG crates and steel; the targets are the
   popup ads, and a level is over when every ad is gone.
   ===================================================================== */

const AC_W = 900;
const AC_H = 520;

const AC_GROUND_H = 54;
const AC_FLOOR_Y = AC_H - AC_GROUND_H;

const AC_GRAVITY = 1500;         // px/s²
const AC_AIR_DRAG = 0.06;        // e-folds per second
const AC_FRICTION = 5.5;         // ground friction, e-folds per second
const AC_RESTITUTION = 0.16;     // boxes are not bouncy
const AC_SLEEP_SPEED = 12;       // px/s under which a grounded box settles
const AC_SOLVER_PASSES = 4;      // overlap resolution sweeps per frame

// The sling. AC_PULL_MAX is how far back the band goes; the launch speed
// is that distance times AC_PULL_POWER, so aiming and power are one
// gesture, the way the original does it.
const AC_SLING_X = 122;
const AC_SLING_Y = AC_FLOOR_Y - 104;
const AC_PULL_MAX = 110;
const AC_PULL_POWER = 9.4;
const AC_CORG_R = 17;

// A hit only breaks something if it lands hard. Below this it's a shove —
// the same distinction the desktop ads make between kickAd and shatterAd.
const AC_DAMAGE_SPEED = 260;

const AC_CORGS_PER_LEVEL = 4;

/* Materials. `hp` is how much impact a block soaks before it breaks;
   `mass` decides who moves whom. Ads are the targets and are made of
   glass, so they take almost anything. */
const AC_MATERIALS = {
    crate: { hp: 190, mass: 1.0, fill: '#a9702f', edge: '#5b3a12', label: 'GUG' },
    steel: { hp: 620, mass: 2.6, fill: '#9aa3ad', edge: '#4a525c', label: '' },
    ad:    { hp: 60,  mass: 0.7, fill: '#c0c0c0', edge: '#404040', label: 'AD' },
};

/* ------------------------------------------------------------------
   Levels. Every entry is [x, y, w, h, material], with y measured from
   the ground up, because that's how you actually think about a stack.
   ------------------------------------------------------------------ */
const AC_LEVELS = [
    {
        name: 'POPUP HUT',
        blocks: [
            [560, 0, 22, 120, 'crate'],
            [700, 0, 22, 120, 'crate'],
            [548, 120, 186, 20, 'crate'],
            [600, 140, 84, 68, 'ad'],
            [590, 208, 104, 18, 'crate'],
        ],
    },
    {
        name: 'BANNER TOWER',
        blocks: [
            [520, 0, 24, 90, 'steel'],
            [640, 0, 24, 90, 'steel'],
            [508, 90, 168, 18, 'steel'],
            [530, 108, 120, 62, 'ad'],
            [520, 170, 144, 18, 'crate'],
            [548, 188, 22, 96, 'crate'],
            [644, 188, 22, 96, 'crate'],
            [536, 284, 142, 18, 'crate'],
            [566, 302, 84, 58, 'ad'],
            [740, 0, 22, 110, 'crate'],
            [740, 110, 78, 56, 'ad'],
        ],
    },
    {
        name: 'THE POPUP FARM',
        blocks: [
            [470, 0, 20, 130, 'steel'],
            [575, 0, 20, 130, 'steel'],
            [680, 0, 20, 130, 'steel'],
            [785, 0, 20, 130, 'steel'],
            [462, 130, 350, 20, 'steel'],
            [492, 150, 74, 54, 'ad'],
            [600, 150, 74, 54, 'ad'],
            [708, 150, 74, 54, 'ad'],
            [480, 204, 320, 18, 'crate'],
            [520, 222, 22, 100, 'crate'],
            [740, 222, 22, 100, 'crate'],
            [508, 322, 266, 18, 'crate'],
            [590, 340, 96, 66, 'ad'],
        ],
    },
];

/* ------------------------------------------------------------------
   Art
   ------------------------------------------------------------------ */

const acCorgImg = new Image();
acCorgImg.src = 'images/corg.png';

/* Sound: corg.wav on every impact, decoded once and fired as buffer
   sources, exactly as pong.js does it — playSound() clones an <audio>
   per call, which is far too slow for a collapsing tower. */
let acCorgBuffer = null;
let acCorgLastPlay = 0;

function acLoadCorgSound() {
    if (acCorgBuffer || typeof audioCtx === 'undefined') return;
    fetch('sfx/corg.wav')
        .then((r) => r.arrayBuffer())
        .then((b) => audioCtx.decodeAudioData(b))
        .then((buf) => { acCorgBuffer = buf; })
        .catch((e) => console.log('corg.wav failed to decode, falling back to <audio>.', e));
}

function acPlayCorg(strength) {
    const now = performance.now();
    if (now - acCorgLastPlay < 55) return;
    acCorgLastPlay = now;

    const base = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    const vol = Math.min(1, 0.28 + strength / 1100) * base;
    if (vol <= 0) return;

    if (!acCorgBuffer) {
        const el = new Audio('sfx/corg.wav');
        el.volume = Math.min(1, vol);
        el.play().catch(() => {});
        return;
    }

    if (audioCtx.state === 'suspended') audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = acCorgBuffer;
    src.playbackRate.value = 0.88 + Math.min(0.4, strength / 1500) + Math.random() * 0.1;
    const gain = audioCtx.createGain();
    gain.gain.value = vol;
    src.connect(gain);
    gain.connect(audioCtx.destination);
    src.start();
}

/* ------------------------------------------------------------------
   State
   ------------------------------------------------------------------ */

let acCanvas = null;
let acCtx = null;
let acRaf = null;
let acLastTime = 0;
let acOpen = false;

let acState = 'ready';           // ready | aim | fly | settle | cleared | failed
let acLevel = 0;
let acBlocks = [];
let acDebris = [];
let acBall = null;               // the corgi in flight
let acCorgsLeft = AC_CORGS_PER_LEVEL;
let acScore = 0;
let acBest = 0;
let acTrail = [];                // where the last shot went, kept as an aid
let acSettleTimer = 0;
let acPull = null;               // {x, y} while dragging the sling

/* ------------------------------------------------------------------
   Level setup
   ------------------------------------------------------------------ */

function acLoadLevel(index) {
    acLevel = ((index % AC_LEVELS.length) + AC_LEVELS.length) % AC_LEVELS.length;
    const level = AC_LEVELS[acLevel];

    acBlocks = level.blocks.map(([x, yUp, w, h, mat]) => ({
        x, y: AC_FLOOR_Y - yUp - h, w, h,
        vx: 0, vy: 0,
        mat,
        hp: AC_MATERIALS[mat].hp,
        maxHp: AC_MATERIALS[mat].hp,
        resting: true,
    }));

    acDebris = [];
    acTrail = [];
    acBall = null;
    acCorgsLeft = AC_CORGS_PER_LEVEL;
    acState = 'aim';
    acUpdateHud();
}

function acAdsLeft() {
    return acBlocks.filter((b) => b.mat === 'ad').length;
}

/* ------------------------------------------------------------------
   Physics
   ------------------------------------------------------------------ */

function acMass(b) { return AC_MATERIALS[b.mat].mass * (b.w * b.h) / 4000; }

// Damage from an impact. Below AC_DAMAGE_SPEED nothing breaks, so a block
// nudged along the ground survives and a block hit by a corgi does not.
function acDamage(b, speed, hitX, hitY) {
    if (speed < AC_DAMAGE_SPEED) return;
    b.hp -= (speed - AC_DAMAGE_SPEED) * 0.55;
    if (b.hp > 0) return;

    acBreak(b, hitX, hitY);
}

function acBreak(b, hitX, hitY) {
    const i = acBlocks.indexOf(b);
    if (i < 0) return;
    acBlocks.splice(i, 1);

    const mat = AC_MATERIALS[b.mat];
    // Points: the ads are the objective, so they're worth most; everything
    // else is worth something because collapsing the structure is progress.
    acScore += (b.mat === 'ad') ? 1000 : 150;

    const pieces = b.mat === 'ad' ? 12 : 8;
    for (let i2 = 0; i2 < pieces; i2++) {
        const px = b.x + Math.random() * b.w;
        const py = b.y + Math.random() * b.h;
        const away = Math.atan2(py - (hitY ?? b.y + b.h / 2), px - (hitX ?? b.x + b.w / 2));
        const burst = 140 + Math.random() * 260;
        acDebris.push({
            x: px, y: py,
            vx: Math.cos(away) * burst + (Math.random() - 0.5) * 120,
            vy: Math.sin(away) * burst - 140 - Math.random() * 120,
            size: 4 + Math.random() * 7,
            rot: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 12,
            fill: mat.fill,
            born: performance.now(),
        });
    }

    if (b.mat === 'ad' && typeof playGlassBreakSfx === 'function') playGlassBreakSfx();
    else acPlayCorg(600);

    acUpdateHud();
}

function acStepBlocks(dt) {
    // Integrate.
    acBlocks.forEach((b) => {
        if (b.resting) return;
        b.vy += AC_GRAVITY * dt;
        b.vx *= Math.max(0, 1 - AC_AIR_DRAG * dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
    });

    // Ground, walls.
    acBlocks.forEach((b) => {
        if (b.y + b.h > AC_FLOOR_Y) {
            const impact = b.vy;
            b.y = AC_FLOOR_Y - b.h;
            b.vy = -b.vy * AC_RESTITUTION;
            if (Math.abs(b.vy) < 60) b.vy = 0;
            b.vx *= Math.max(0, 1 - AC_FRICTION * dt);
            if (impact > 300) { acDamage(b, impact, b.x + b.w / 2, AC_FLOOR_Y); acPlayCorg(impact); }
        }
        if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx) * AC_RESTITUTION; }
        if (b.x + b.w > AC_W) { b.x = AC_W - b.w; b.vx = -Math.abs(b.vx) * AC_RESTITUTION; }
    });

    // Overlap resolution. Several cheap sweeps beat one expensive solve for
    // a pile this small, and stacks settle within a frame or two.
    for (let pass = 0; pass < AC_SOLVER_PASSES; pass++) acResolveOverlaps(dt);

    // Sleep: a box that is grounded (or resting on something grounded) and
    // barely moving stops being simulated, which is what stops a settled
    // tower from shivering forever.
    acBlocks.forEach((b) => {
        const slow = Math.hypot(b.vx, b.vy) < AC_SLEEP_SPEED;
        const supported = (b.y + b.h >= AC_FLOOR_Y - 0.6) || acHasSupport(b);
        b.resting = slow && supported;
        if (b.resting) { b.vx = 0; b.vy = 0; }
    });
}

// Is something solid directly under this box? Only used for sleeping, so a
// 2px probe under the footprint is enough.
function acHasSupport(b) {
    for (const o of acBlocks) {
        if (o === b) continue;
        if (o.x + o.w <= b.x + 1 || o.x >= b.x + b.w - 1) continue;
        if (o.y > b.y + b.h + 2.5 || o.y < b.y + b.h - 2.5) continue;
        return true;
    }
    return false;
}

function acResolveOverlaps(dt) {
    for (let i = 0; i < acBlocks.length; i++) {
        for (let j = i + 1; j < acBlocks.length; j++) {
            const a = acBlocks[i];
            const b = acBlocks[j];

            const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            if (ox <= 0) continue;
            const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (oy <= 0) continue;

            // Separate along whichever axis is shallower — the usual
            // minimum-translation choice, and the reason a box landing on a
            // box is pushed up rather than sideways.
            let nx = 0, ny = 0, depth;
            if (ox < oy) {
                nx = (a.x + a.w / 2 < b.x + b.w / 2) ? -1 : 1;
                depth = ox;
            } else {
                ny = (a.y + a.h / 2 < b.y + b.h / 2) ? -1 : 1;
                depth = oy;
            }

            const ma = acMass(a), mb = acMass(b);
            const total = ma + mb;
            // A resting box is treated as infinitely heavy, so a stack has
            // something to stand on instead of sinking into its own base.
            const aShare = a.resting ? 0 : (b.resting ? 1 : mb / total);
            const bShare = b.resting ? 0 : (a.resting ? 1 : ma / total);

            a.x += nx * depth * aShare;
            a.y += ny * depth * aShare;
            b.x -= nx * depth * bShare;
            b.y -= ny * depth * bShare;

            // Impulse along the contact normal.
            const rvx = a.vx - b.vx;
            const rvy = a.vy - b.vy;
            const along = rvx * nx + rvy * ny;
            if (along > 0) continue;   // already separating

            const impulse = -(1 + AC_RESTITUTION) * along / (1 / ma + 1 / mb);
            if (!a.resting) { a.vx += (impulse / ma) * nx; a.vy += (impulse / ma) * ny; }
            if (!b.resting) { b.vx -= (impulse / mb) * nx; b.vy -= (impulse / mb) * ny; }

            const speed = Math.abs(along);
            if (speed > AC_DAMAGE_SPEED) {
                const cx = Math.max(a.x, b.x) + ox / 2;
                const cy = Math.max(a.y, b.y) + oy / 2;
                acPlayCorg(speed);
                acDamage(a, speed, cx, cy);
                acDamage(b, speed, cx, cy);
            }

            if (speed > AC_SLEEP_SPEED * 2) { a.resting = false; b.resting = false; }
        }
    }
}

/* ------------------------------------------------------------------
   The corgi in flight
   ------------------------------------------------------------------ */

function acLaunch(vx, vy) {
    acBall = { x: AC_SLING_X, y: AC_SLING_Y, vx, vy, bounces: 0, born: performance.now() };
    acTrail = [];
    acCorgsLeft--;
    acState = 'fly';
    acPlayCorg(Math.hypot(vx, vy));
    acUpdateHud();
}

function acStepBall(dt) {
    const b = acBall;
    if (!b) return;

    b.vy += AC_GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (acTrail.length === 0 || Math.hypot(b.x - acTrail[acTrail.length - 1].x,
                                           b.y - acTrail[acTrail.length - 1].y) > 14) {
        acTrail.push({ x: b.x, y: b.y });
        if (acTrail.length > 120) acTrail.shift();
    }

    // Ground.
    if (b.y + AC_CORG_R > AC_FLOOR_Y) {
        b.y = AC_FLOOR_Y - AC_CORG_R;
        if (b.vy > 0) {
            if (b.vy > 120) acPlayCorg(b.vy);
            b.vy = -b.vy * 0.34;
            b.vx *= 0.72;
            b.bounces++;
        }
    }

    // Blocks: circle against box, nearest-point.
    acBlocks.slice().forEach((blk) => {
        const nx = Math.max(blk.x, Math.min(b.x, blk.x + blk.w));
        const ny = Math.max(blk.y, Math.min(b.y, blk.y + blk.h));
        let dx = b.x - nx;
        let dy = b.y - ny;
        let dist = Math.hypot(dx, dy);
        if (dist > AC_CORG_R) return;
        if (dist < 0.001) { dx = 0; dy = -1; dist = 1; }
        dx /= dist; dy /= dist;

        const speed = Math.hypot(b.vx, b.vy);

        // Push the block along the contact normal, weighted by how heavy it
        // is: the corgi bowls a crate over and barely troubles a steel beam.
        const m = acMass(blk);
        blk.resting = false;
        blk.vx += (-dx * speed * 0.85) / m * 0.5;
        blk.vy += (-dy * speed * 0.85) / m * 0.5 - 40;

        acPlayCorg(speed);
        acDamage(blk, speed, nx, ny);

        // The corgi keeps going, slowed and deflected. A hard shot that
        // destroys what it hits passes through, which is what makes a good
        // opening shot worth several bad ones.
        b.x = nx + dx * AC_CORG_R;
        b.y = ny + dy * AC_CORG_R;
        const along = b.vx * dx + b.vy * dy;
        if (along < 0) {
            b.vx -= 1.35 * along * dx;
            b.vy -= 1.35 * along * dy;
        }
        b.vx *= 0.62;
        b.vy *= 0.62;
        b.bounces++;
    });

    if (b.x < -60 || b.x > AC_W + 60) { acBall = null; acEndShot(); return; }

    // Come to rest: rolling slowly on the ground for long enough ends the
    // shot, so a dribbled corgi doesn't stall the level forever.
    const slow = Math.hypot(b.vx, b.vy) < 45 && b.y + AC_CORG_R >= AC_FLOOR_Y - 1;
    if (slow || performance.now() - b.born > 9000) { acBall = null; acEndShot(); }
}

function acEndShot() {
    acState = 'settle';
    acSettleTimer = 0;
}

/* Everything has stopped moving: decide what happens next. */
function acAfterSettle() {
    if (acAdsLeft() === 0) {
        acState = 'cleared';
        // Unspent corgs are worth keeping, so there's a reason to do it in
        // one shot rather than four.
        acScore += acCorgsLeft * 500;
        if (acScore > acBest) {
            acBest = acScore;
            try { localStorage.setItem('corgAngryBest', String(acBest)); } catch (e) { /* private mode */ }
        }
        if (typeof playSound === 'function') playSound('achievement-audio');
    } else if (acCorgsLeft <= 0) {
        acState = 'failed';
        if (typeof playSound === 'function') playSound('error-audio');
    } else {
        acState = 'aim';
    }
    acUpdateHud();
}

function acStepDebris(dt) {
    const now = performance.now();
    for (let i = acDebris.length - 1; i >= 0; i--) {
        const d = acDebris[i];
        if (now - d.born > 1600) { acDebris.splice(i, 1); continue; }
        d.vy += AC_GRAVITY * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.rot += d.spin * dt;
        if (d.y > AC_FLOOR_Y) { d.y = AC_FLOOR_Y; d.vy *= -0.3; d.vx *= 0.7; d.spin *= 0.7; }
    }
}

function acWorldIsStill() {
    if (acBall) return false;
    if (acBlocks.some((b) => !b.resting)) return false;
    return true;
}

/* ------------------------------------------------------------------
   Drawing
   ------------------------------------------------------------------ */

function acDrawBackdrop() {
    const ctx = acCtx;

    // Desktop teal, dithered lighter at the top. Flat, hard-edged, sixteen
    // colours — the same sky Flappy Corg flies in, for the same reason.
    ctx.fillStyle = W9X.teal;
    ctx.fillRect(0, 0, AC_W, AC_H);
    // The whole sky, not a band of it: a band leaves a hard seam across the
    // screen that reads as a bug rather than as a horizon.
    win9xDither(ctx, 0, 0, AC_W, AC_FLOOR_Y, W9X.teal, W9X.tealLight);

    // Blocky clouds: flat light-grey slabs with one bevel, not soft blobs.
    ctx.globalAlpha = 0.45;
    [[120, 70], [400, 46], [640, 84], [810, 54]].forEach(([x, y]) => {
        win9xBevel(ctx, x, y, 86, 18, true, W9X.light);
        win9xBevel(ctx, x + 20, y - 12, 50, 14, true, W9X.light);
    });
    ctx.globalAlpha = 1;

    // The ground is a raised grey panel with a sunken strip along the top —
    // a 9x status bar, laid on its back.
    win9xBevel(ctx, -2, AC_FLOOR_Y, AC_W + 4, AC_GROUND_H + 4, true);
    win9xBevel(ctx, 6, AC_FLOOR_Y + 6, AC_W - 12, AC_GROUND_H - 14, false, W9X.face);

    ctx.fillStyle = W9X.shadow;
    for (let x = 14; x < AC_W - 14; x += 16) {
        ctx.fillRect(x, AC_FLOOR_Y + 12, 8, 2);
    }
}

function acDrawBlock(b) {
    const ctx = acCtx;

    if (b.mat === 'ad') {
        // The targets are drawn as the popups they are: a 9x window with a
        // title bar and a close box.
        win9xBevel(ctx, b.x, b.y, b.w, b.h, true);

        const barH = Math.min(16, Math.max(9, b.h * 0.26));
        const bar = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
        bar.addColorStop(0, W9X.navy);
        bar.addColorStop(1, W9X.navyLight);
        ctx.fillStyle = bar;
        ctx.fillRect(b.x + 3, b.y + 3, b.w - 6, barH);

        win9xBevel(ctx, b.x + b.w - 3 - barH, b.y + 4, barH - 2, barH - 2, true);

        const wellY = b.y + barH + 6;
        const wellH = Math.max(0, b.h - barH - 11);
        if (wellH > 6) {
            win9xBevel(ctx, b.x + 5, wellY, b.w - 10, wellH, false, W9X.white);
            ctx.fillStyle = W9X.navy;
            ctx.font = 'bold ' + Math.min(15, wellH * 0.6) + 'px ' + w9xFont();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('AD', b.x + b.w / 2, wellY + wellH / 2 + 1);
        }
    } else if (b.mat === 'crate') {
        // A crate of GUG: a raised panel with the wordmark on it and a
        // cross-brace, all flat.
        win9xBevel(ctx, b.x, b.y, b.w, b.h, true, '#a9702f');
        ctx.strokeStyle = '#7a4d18';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x + 4, b.y + 4); ctx.lineTo(b.x + b.w - 4, b.y + b.h - 4);
        ctx.moveTo(b.x + b.w - 4, b.y + 4); ctx.lineTo(b.x + 4, b.y + b.h - 4);
        ctx.stroke();

        // The wordmark goes on any crate with room for it — and most of them
        // are beams and posts, so the size comes off the shorter side rather
        // than being fixed. A crate you can't read GUG on is just a plank.
        const label = Math.min(15, b.h - 8, b.w / 3.4);
        if (label >= 8) {
            ctx.font = 'bold ' + Math.floor(label) + 'px ' + w9xFont();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.save();
            // A tall, narrow post carries it sideways, like a real crate would.
            if (b.h > b.w * 1.6) {
                ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
                ctx.rotate(-Math.PI / 2);
                ctx.fillStyle = '#4a2c0a';
                ctx.fillText('GUG', 1, 2);
                ctx.fillStyle = '#ffd34d';
                ctx.fillText('GUG', 0, 1);
            } else {
                ctx.fillStyle = '#4a2c0a';
                ctx.fillText('GUG', b.x + b.w / 2 + 1, b.y + b.h / 2 + 2);
                ctx.fillStyle = '#ffd34d';
                ctx.fillText('GUG', b.x + b.w / 2, b.y + b.h / 2 + 1);
            }
            ctx.restore();
        }
    } else {
        // Steel: the plain raised grey panel, with a hatched face.
        win9xBevel(ctx, b.x, b.y, b.w, b.h, true, '#9aa3ad');
        win9xDither(ctx, b.x + 3, b.y + 3, Math.max(0, b.w - 6), Math.max(0, b.h - 6),
                    '#9aa3ad', '#b6bec6');
    }

    // Damage: the block darkens as its hp goes, so you can see which part of
    // a structure is nearly gone before it breaks. Dithered, not a wash of
    // alpha — there is no half-transparent black in this palette.
    const wear = 1 - b.hp / b.maxHp;
    if (wear > 0.25) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.55, wear * 0.7);
        win9xDither(ctx, b.x + 2, b.y + 2, Math.max(0, b.w - 4), Math.max(0, b.h - 4),
                    'rgba(0,0,0,0)', '#000000');
        ctx.restore();
    }
}

function acDrawSling() {
    const ctx = acCtx;
    const baseY = AC_FLOOR_Y;

    // Flat, hard-edged posts rather than round strokes: bevelled bars, the
    // same way every other solid thing on this screen is drawn.
    win9xBevel(ctx, AC_SLING_X - 6, AC_SLING_Y + 10, 12, baseY - AC_SLING_Y - 10, true, '#8b5a2b');

    const forkX = 30, forkTop = AC_SLING_Y - 30;
    win9xBevel(ctx, AC_SLING_X - forkX - 5, forkTop, 11, 46, true, '#8b5a2b');
    win9xBevel(ctx, AC_SLING_X + forkX - 6, forkTop, 11, 46, true, '#8b5a2b');
    win9xBevel(ctx, AC_SLING_X - forkX - 5, AC_SLING_Y + 8, forkX * 2 + 11, 11, true, '#8b5a2b');

    // The band, drawn to wherever the corgi currently is. The far prong's band
    // goes behind the dog and the near one in front, so the dog is visibly
    // held in the sling rather than floating before it.
    const seat = acPull ? acPull : { x: AC_SLING_X, y: AC_SLING_Y };
    if (acState === 'aim') {
        const band = (fromX) => {
            ctx.strokeStyle = '#2a1503';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(fromX, forkTop + 6);
            ctx.lineTo(seat.x, seat.y);
            ctx.stroke();
        };
        band(AC_SLING_X + forkX);
        acDrawCorgAt(seat.x, seat.y);
        band(AC_SLING_X - forkX);
    }
}

// The dotted arc of where the shot will go, integrated with the same gravity
// the shot uses so it cannot disagree with it.
function acDrawAimGuide() {
    if (!acPull) return;
    const ctx = acCtx;
    const v = acPullVelocity();

    let x = AC_SLING_X, y = AC_SLING_Y, sx = v[0], sy = v[1];
    const step = 1 / 60;
    for (let i = 0; i < 130; i++) {
        sy += AC_GRAVITY * step;
        x += sx * step;
        y += sy * step;
        if (y > AC_FLOOR_Y || x > AC_W) break;
        if (i % 6 === 0) {
            // Square pips, not circles: a small hard block is what a dotted
            // line was made of here.
            ctx.fillStyle = W9X.dark;
            ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
            ctx.fillStyle = W9X.white;
            ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
        }
    }
}

// Corg is drawn upright everywhere he appears — in the sling, in flight and
// waiting in the queue — matching the desktop Corg, who moves but never turns.
function acDrawCorgAt(x, y) {
    const ctx = acCtx;
    ctx.save();
    ctx.translate(x, y);
    if (acCorgImg.complete && acCorgImg.naturalWidth) {
        const scale = (AC_CORG_R * 2.5) / Math.max(acCorgImg.naturalWidth, acCorgImg.naturalHeight);
        const w = acCorgImg.naturalWidth * scale;
        const h = acCorgImg.naturalHeight * scale;
        ctx.drawImage(acCorgImg, -w / 2, -h / 2, w, h);
    } else {
        ctx.fillStyle = '#e08a2e';
        ctx.fillRect(-AC_CORG_R, -AC_CORG_R, AC_CORG_R * 2, AC_CORG_R * 2);
    }
    ctx.restore();
}

function acDrawTrail() {
    if (acTrail.length < 2) return;
    const ctx = acCtx;
    ctx.fillStyle = W9X.white;
    acTrail.forEach((p) => {
        ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
    });
}

function acDrawDebris() {
    const ctx = acCtx;
    const now = performance.now();
    acDebris.forEach((d) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - ((now - d.born) / 1600) ** 2);
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.fillStyle = d.fill;
        ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
        ctx.restore();
    });
}

// The corgis still in the sling's queue, waiting their turn. A row on the
// ground behind the slingshot: they used to be a stack beside it, which the
// pulled-back dog landed on top of at anything like a full draw.
function acDrawQueue() {
    const waiting = Math.max(0, acCorgsLeft - (acState === 'aim' ? 1 : 0));
    for (let i = 0; i < waiting; i++) {
        acDrawCorgAt(26 + i * 26, AC_FLOOR_Y - 14);
    }
}

function acDrawOverlay() {
    const ctx = acCtx;
    if (acState !== 'ready' && acState !== 'cleared' && acState !== 'failed') return;

    // Between levels the game tells you what happened the way this operating
    // system tells you anything: a dialog box with a button on it.
    const w = 400, h = 176;
    const x = Math.round((AC_W - w) / 2);
    const y = Math.round(AC_H / 2 - h / 2);
    const inner = win9xDialog(ctx, x, y, w, h, 'Angry Corgs');

    let heading, lines, button;
    if (acState === 'ready') {
        heading = 'Angry Corgs';
        lines = ['Drag back from the slingshot and let go.',
                 'Knock down every popup on the screen.',
                 'Four corgis a level. Spare ones are worth points.'];
        button = 'Start';
    } else if (acState === 'cleared') {
        heading = 'Level cleared';
        lines = [AC_LEVELS[acLevel].name + ', with ' + acCorgsLeft +
                 ' corgi' + (acCorgsLeft === 1 ? '' : 's') + ' to spare.',
                 'Score: ' + acScore.toLocaleString('en-US') +
                 '.   Best: ' + acBest.toLocaleString('en-US') + '.'];
        button = 'Next level';
    } else {
        heading = 'Out of corgis';
        const n = acAdsLeft();
        lines = [n + ' popup' + (n === 1 ? ' is' : 's are') + ' still standing.'];
        button = 'Try again';
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = W9X.text;

    ctx.font = 'bold 15px ' + w9xFont();
    ctx.fillText(heading, AC_W / 2, inner.y + 20);

    ctx.font = '12px ' + w9xFont();
    lines.forEach((line, i) => ctx.fillText(line, AC_W / 2, inner.y + 44 + i * 17));

    win9xButton(ctx, AC_W / 2 - 56, y + h - 40, 112, 24, button, false);
}

function acUpdateHud() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('ac-level', AC_LEVELS[acLevel] ? AC_LEVELS[acLevel].name : '-');
    set('ac-score', acScore.toLocaleString('en-US'));
    set('ac-corgs', String(Math.max(0, acCorgsLeft)));
    set('ac-ads', String(acAdsLeft()));
    set('ac-best', acBest.toLocaleString('en-US'));

    const corgsEl = document.getElementById('ac-corgs');
    if (corgsEl) corgsEl.classList.toggle('ac-danger', acCorgsLeft <= 1 && acState !== 'cleared');
}

/* ------------------------------------------------------------------
   Loop
   ------------------------------------------------------------------ */

function acFrame(now) {
    if (!acOpen) return;

    let dt = acLastTime ? (now - acLastTime) / 1000 : 0;
    acLastTime = now;
    // A tighter clamp than the other games use: this one has a stack of
    // boxes resting on each other, and one long step lets them interpenetrate
    // far enough that the solver launches the pile apart getting them out.
    dt = Math.min(dt, 0.033);

    if (acState === 'fly') acStepBall(dt);
    if (acState !== 'ready') acStepBlocks(dt);
    acStepDebris(dt);

    if (acState === 'settle') {
        acSettleTimer += dt;
        // A short grace period as well as stillness, so a tower that is
        // mid-collapse but momentarily balanced doesn't end the shot early.
        if (acWorldIsStill() && acSettleTimer > 0.6) acAfterSettle();
        if (acSettleTimer > 8) acAfterSettle();
    }

    acCtx.setTransform(acCanvas.width / AC_W, 0, 0, acCanvas.height / AC_H, 0, 0);
    acDrawBackdrop();
    acDrawTrail();
    acBlocks.forEach(acDrawBlock);
    acDrawDebris();
    acDrawSling();
    acDrawAimGuide();
    acDrawQueue();
    if (acBall) acDrawCorgAt(acBall.x, acBall.y);
    acDrawOverlay();
    acUpdateHud();

    acRaf = requestAnimationFrame(acFrame);
}

/* ------------------------------------------------------------------
   Input
   ------------------------------------------------------------------ */

// Pull vector → launch velocity. Backwards from the sling, capped at
// AC_PULL_MAX, so aim and power are the one gesture.
function acPullVelocity() {
    if (!acPull) return [0, 0];
    const dx = AC_SLING_X - acPull.x;
    const dy = AC_SLING_Y - acPull.y;
    return [dx * AC_PULL_POWER, dy * AC_PULL_POWER];
}

function acCourtPoint(e) {
    const rect = acCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const p = e.touches && e.touches.length ? e.touches[0] : e;
    return {
        x: ((p.clientX - rect.left) / rect.width) * AC_W,
        y: ((p.clientY - rect.top) / rect.height) * AC_H,
    };
}

function acClampPull(p) {
    const dx = p.x - AC_SLING_X;
    const dy = p.y - AC_SLING_Y;
    const dist = Math.hypot(dx, dy);
    if (dist <= AC_PULL_MAX) return { x: p.x, y: p.y };
    return {
        x: AC_SLING_X + (dx / dist) * AC_PULL_MAX,
        y: AC_SLING_Y + (dy / dist) * AC_PULL_MAX,
    };
}

function acPointerDown(e) {
    if (e.cancelable) e.preventDefault();

    if (acState === 'ready') { acScore = 0; acLoadLevel(0); return; }
    if (acState === 'cleared') { acLoadLevel(acLevel + 1); return; }
    if (acState === 'failed') { acScore = 0; acLoadLevel(acLevel); return; }
    if (acState !== 'aim') return;

    const p = acCourtPoint(e);
    if (!p) return;
    acPull = acClampPull(p);
}

function acPointerMove(e) {
    if (!acPull || acState !== 'aim') return;
    if (e.cancelable) e.preventDefault();
    const p = acCourtPoint(e);
    if (p) acPull = acClampPull(p);
}

// Put the corgi back without spending it.
function acCancelPull() {
    acPull = null;
}

function acPointerUp() {
    if (!acPull || acState !== 'aim') { acPull = null; return; }
    const [vx, vy] = acPullVelocity();
    acPull = null;
    // A tap with no pull isn't a shot; it shouldn't cost a corgi.
    if (Math.hypot(vx, vy) < 120) return;
    acLaunch(vx, vy);
}

function acKeyDown(e) {
    if (!acOpen) return;
    if (e.key === 'Escape') { toggleAngryCorgs(); return; }
    if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (acState === 'ready') { acScore = 0; acLoadLevel(0); }
        else if (acState === 'cleared') acLoadLevel(acLevel + 1);
        else if (acState === 'failed') { acScore = 0; acLoadLevel(acLevel); }
    }
    // Skipping a level you can't be bothered with, and restarting one you've
    // made a mess of.
    if (e.key === 'r' || e.key === 'R') { acScore = 0; acLoadLevel(acLevel); }
    if (e.key === 'n' || e.key === 'N') acLoadLevel(acLevel + 1);
}

/* ------------------------------------------------------------------
   Open / close
   ------------------------------------------------------------------ */

function toggleAngryCorgs() {
    const screen = document.getElementById('angrycorgs-screen');
    if (!screen) return;

    if (screen.style.display === 'flex') {
        screen.style.display = 'none';
        acOpen = false;
        if (acRaf) { cancelAnimationFrame(acRaf); acRaf = null; }
        document.removeEventListener('keydown', acKeyDown);
        acPull = null;
        if (typeof isPaused !== 'undefined') isPaused = false;
        return;
    }

    if (typeof isPaused !== 'undefined') isPaused = true;
    screen.style.display = 'flex';
    playSound('window-open-audio');

    acCanvas = document.getElementById('angrycorgs-canvas');
    if (!acCanvas) return;
    acCtx = acCanvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    acCanvas.width = AC_W * dpr;
    acCanvas.height = AC_H * dpr;

    if (!acCanvas.dataset.acBound) {
        acCanvas.addEventListener('mousedown', acPointerDown);
        acCanvas.addEventListener('touchstart', acPointerDown, { passive: false });

        // Move and release are on the *document*, not the canvas. A full draw
        // pulls the cursor well past the court — often past the window — and
        // when these were bound to the canvas the drag simply stopped being
        // heard at its edge: the band froze wherever you crossed it and the
        // shot went somewhere you hadn't aimed. acPointerMove/Up do nothing
        // unless a pull is in progress, so listening this widely is free.
        document.addEventListener('mousemove', acPointerMove);
        document.addEventListener('touchmove', acPointerMove, { passive: false });
        document.addEventListener('mouseup', acPointerUp);
        document.addEventListener('touchend', acPointerUp);
        // A drag that leaves the browser entirely (alt-tab, another app) puts
        // the corgi back in the sling rather than firing a shot you never let
        // go of — and rather than leaving the band stuck at full stretch.
        window.addEventListener('blur', acCancelPull);
        acCanvas.dataset.acBound = '1';
        try { acBest = parseInt(localStorage.getItem('corgAngryBest'), 10) || 0; } catch (e) { acBest = 0; }
    }
    acLoadCorgSound();

    if (acState === 'cleared' || acState === 'failed') acState = 'ready';
    if (acState === 'ready') { acBlocks = []; acDebris = []; acTrail = []; acBall = null; }

    acOpen = true;
    acLastTime = 0;
    acUpdateHud();
    document.addEventListener('keydown', acKeyDown);
    acRaf = requestAnimationFrame(acFrame);
}
