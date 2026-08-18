/* =====================================================================
   adsmasher.js — "CORG Ad Smasher".

   It used to be a canvas in a window: its own little court, its own
   drawn ads, its own drawn dog. That was the wrong shape for it. The
   desktop *already* has popup ads and a dog you can throw through them —
   the game is that, with the ad supply turned up until it stops being
   fair, and no window in the way.

   So there is no playfield here. A round runs on the actual desktop:

     - the ads are real `.popup-ad` windows from spawnAd(), with real
       titles, real embeds, real physics (kickAd) and real breakage
       (shatterAd);
     - the dog is the real Corg you drag around the desktop, thrown by
       the same makeGuggyDraggable() that throws them the rest of the
       time;
     - the rule for breaking glass is the desktop's own and always was:
       at or above AD_SHATTER_SPEED Corg goes through the ad, below it
       Corg shoves it. Nothing here re-decides that. shatterAd() calls
       asOnAdShattered() and this file keeps score.

   What this file owns is therefore only: the spawn ramp, the chain
   scoring, the lose condition, and the HUD — everything that makes a
   round a round rather than a Tuesday on the desktop.
   ===================================================================== */

/* How full the desktop has to get before the popups have won. */
const AS_MAX_ADS = 14;

/* The gap between spawns closes as the round goes on, so a round always
   ends the same way — the question is how many you got first. */
const AS_SPAWN_START_MS = 1600;
const AS_SPAWN_MIN_MS = 420;
const AS_SPAWN_RAMP_MS = 62000;   // time to reach the floor

const AS_COMBO_WINDOW_MS = 1900;  // gap that drops the chain
const AS_COMBO_CAP = 10;
const AS_BASE_POINTS = 100;

/* ------------------------------------------------------------------
   Kevbo mode.

   The default round has a hole in it: you can hold Corg down, park them
   on top of an ad and shake, and the desktop breaks itself. Kevbo's
   complaint was that this makes the game too easy and, worse, boring —
   there's no throw in it.

   So in this mode Corg can be flung but not carried. A grab lasts
   AS_KEVBO_HOLD_MS and then Corg slips out of your hands with whatever
   swing the pointer had at that moment; after a release Corg is off
   limits for AS_KEVBO_REGRAB_MS, so you can't snatch them back out of
   the air and keep swinging. What's left is aiming: line up a throw,
   watch it play out, pick the next one off the bounce.

   The two numbers are the whole mode. The hold is long enough to wind
   up a proper throw and much too short to hover; the cooldown is about
   as long as a bounce takes to come back down. Neither is enforced
   here — makeGuggyDraggable() owns the drag, so setCorgHoldLimits() in
   main.js is what actually applies them.

   Harder rounds get their own scoreboard rather than sharing one:
   a Kevbo score and a normal score aren't the same achievement, and
   the mode's multiplier would quietly poison the shared best anyway.
   ------------------------------------------------------------------ */
const AS_KEVBO_HOLD_MS = 550;
const AS_KEVBO_REGRAB_MS = 650;
const AS_KEVBO_BONUS = 1.5;

/* Corg has to be moving this fast for the glow to come on. It is
   AD_SHATTER_SPEED — read off main.js rather than copied, because a
   tutorial that disagrees with the rule is worse than no tutorial. */
function asSmashSpeed() {
    return (typeof AD_SHATTER_SPEED !== 'undefined') ? AD_SHATTER_SPEED : 1600;
}

/* ------------------------------------------------------------------
   State
   ------------------------------------------------------------------ */

let asOpen = false;
let asState = 'ready';            // ready | play | over
let asScore = 0;
let asCombo = 0;
let asBestCombo = 0;
let asSmashed = 0;
let asBest = 0;
let asKevboBest = 0;
let asKevbo = false;
let asLastSmashAt = 0;
let asRoundStart = 0;
let asSpawnTimer = 0;
let asRaf = null;
let asLastTime = 0;
let asBestLoaded = false;

/* Per-Corg position sampling for the glow, keyed off the element. A
   thrown Corg's velocity lives inside launchGuggy's closure, so the only
   honest way to know how fast one is moving from out here is to watch
   where it was last frame. */
const asCorgTracks = new WeakMap();

function asLoadBest() {
    if (asBestLoaded) return;
    asBestLoaded = true;
    try {
        asBest = parseInt(localStorage.getItem('corgAdSmasherBest'), 10) || 0;
        asKevboBest = parseInt(localStorage.getItem('corgAdSmasherKevboBest'), 10) || 0;
        asKevbo = localStorage.getItem('corgAdSmasherKevbo') === '1';
    } catch (e) { asBest = 0; asKevboBest = 0; asKevbo = false; }
}

/* The scoreboard for the mode currently selected. */
function asModeBest() { return asKevbo ? asKevboBest : asBest; }

function asSaveModeBest(value) {
    if (asKevbo) asKevboBest = value; else asBest = value;
    try {
        localStorage.setItem(asKevbo ? 'corgAdSmasherKevboBest' : 'corgAdSmasherBest', String(value));
    } catch (e) { /* private mode */ }
}

/* The checkbox on the card. Takes effect at the next round — the card is
   the only place it's reachable, and the card is only up between rounds. */
function asSetKevbo(on) {
    asKevbo = !!on;
    try { localStorage.setItem('corgAdSmasherKevbo', asKevbo ? '1' : '0'); } catch (e) { /* private mode */ }
    if (typeof playSound === 'function') playSound('upgrade-audio');
    asUpdateHud();
    // The card carries the rules and the best score, and the checkbox just
    // changed both of them.
    asShowCard(asState === 'over');
}

/* ------------------------------------------------------------------
   Ads
   ------------------------------------------------------------------ */

/* Only the round's own ads are cleaned up afterwards; whatever the
   clicker had already put on the desktop is the player's mess and stays
   theirs. */
function asRoundAds() {
    return Array.from(document.querySelectorAll('.popup-ad.as-round-ad'));
}

function asLiveAdCount() {
    return document.querySelectorAll('.popup-ad').length;
}

function asClearRoundAds() {
    asRoundAds().forEach((ad) => ad.remove());
}

function asSpawnRoundAd() {
    // spawnAd() is main.js's, unchanged, and `true` is the pause override:
    // a round runs with the clicker paused so its passive ads don't muddy
    // the count, but the round still needs to spawn.
    const ad = spawnAd(true);
    if (ad) ad.classList.add('as-round-ad');
}

/* The gap between spawns, closing over AS_SPAWN_RAMP_MS. */
function asSpawnInterval() {
    const t = Math.min(1, (performance.now() - asRoundStart) / AS_SPAWN_RAMP_MS);
    return AS_SPAWN_START_MS + (AS_SPAWN_MIN_MS - AS_SPAWN_START_MS) * t;
}

/* ------------------------------------------------------------------
   The radio.

   A round has music the way a shop with a radio on has music: it
   starts when the round does, plays one track after another in a
   shuffled order, wraps round when it runs out, and goes off the air
   when the round ends. Nothing about it is synced to the game — it is
   not a soundtrack, it does not react to the chain, and it sits under
   the glass breaks on purpose.

   This is the only music in the project (audio.js dropped the old
   playlist entirely), which makes it the only thing on the MUSIC
   slider — it rides musicVolume alone, and updateMusicVolume() calls
   asRadioSyncVolume() so dragging that slider mid-round is heard.
   ------------------------------------------------------------------ */

const AS_RADIO_TRACKS = [
    { file: 'music/adsmasher/08 Last Legs.mp3', title: 'Last Legs' },
    { file: 'music/adsmasher/22 LG Orbifold.mp3', title: 'LG Orbifold' },
    { file: 'music/adsmasher/23 Anti-Citizen.mp3', title: 'Anti-Citizen' },
];

let asRadioAudio = null;
let asRadioOrder = [];
let asRadioIndex = 0;
let asRadioFails = 0;

function asRadioVolume() {
    return typeof musicVolume !== 'undefined' ? musicVolume : 0.5;
}

function asRadioStart() {
    asRadioStop();
    asRadioFails = 0;

    // Shuffled per round, so the same round doesn't always open on the same
    // track. Fisher-Yates over the indices.
    asRadioOrder = AS_RADIO_TRACKS.map((_, i) => i);
    for (let i = asRadioOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [asRadioOrder[i], asRadioOrder[j]] = [asRadioOrder[j], asRadioOrder[i]];
    }
    asRadioIndex = 0;
    asRadioPlay();
}

function asRadioPlay() {
    if (!asRadioOrder.length) return;

    const track = AS_RADIO_TRACKS[asRadioOrder[asRadioIndex % asRadioOrder.length]];
    if (!track) return;

    // encodeURI because the filenames are the track numbers and titles they
    // arrived with, spaces and all.
    asRadioAudio = new Audio(encodeURI(track.file));
    asRadioAudio.volume = asRadioVolume();
    asRadioAudio.onended = asRadioNext;
    // A track that won't load shouldn't take the station off the air — skip to
    // the next one. asRadioFails is what stops that becoming a spin if none of
    // them load.
    asRadioAudio.onerror = asRadioNext;
    asRadioAudio.onplaying = () => { asRadioFails = 0; };
    asRadioAudio.play().catch(() => { });

    asRadioShow(track.title);
}

function asRadioNext() {
    if (asState !== 'play') return;
    if (++asRadioFails > AS_RADIO_TRACKS.length) { asRadioStop(); return; }
    asRadioIndex++;
    asRadioPlay();
}

function asRadioStop() {
    if (asRadioAudio) {
        asRadioAudio.onended = null;
        asRadioAudio.onerror = null;
        asRadioAudio.onplaying = null;
        asRadioAudio.pause();
        asRadioAudio = null;
    }
    asRadioShow(null);
}

/* The SOUND slider moved while a round is running. Called from
   updateSFXVolume() in audio.js. */
function asRadioSyncVolume() {
    if (asRadioAudio) asRadioAudio.volume = asRadioVolume();
}

function asRadioShow(title) {
    const el = document.getElementById('as-radio');
    if (el) el.classList.toggle('on', !!title);
    const name = document.getElementById('as-radio-track');
    if (name) name.textContent = title || '';
}

/* ------------------------------------------------------------------
   Scoring. Called by shatterAd() in main.js for every ad broken,
   whether a round is running or not — so the first thing it does is
   check whether one is.
   ------------------------------------------------------------------ */

function asOnAdShattered() {
    if (asState !== 'play') return;

    const now = performance.now();
    asCombo = (now - asLastSmashAt <= AS_COMBO_WINDOW_MS) ? asCombo + 1 : 1;
    asLastSmashAt = now;
    if (asCombo > asBestCombo) asBestCombo = asCombo;

    // The chain is the scoring: each ad in it is worth one more multiple
    // than the last, capped so a lucky pile-up isn't the whole round. A
    // Kevbo ad is worth more because a Kevbo ad is harder to reach.
    asScore += Math.round(AS_BASE_POINTS * Math.min(asCombo, AS_COMBO_CAP)
        * (asKevbo ? AS_KEVBO_BONUS : 1));
    asSmashed++;

    if (asCombo >= 3) asFlash(`x${Math.min(asCombo, AS_COMBO_CAP)} CHAIN`);
    asUpdateHud();
}

let asFlashTimer = null;
function asFlash(text) {
    const el = document.getElementById('as-flash');
    if (!el) return;
    el.textContent = text;
    el.classList.add('on');
    if (asFlashTimer) clearTimeout(asFlashTimer);
    asFlashTimer = setTimeout(() => el.classList.remove('on'), 900);
}

/* ------------------------------------------------------------------
   The glow
   ------------------------------------------------------------------ */

/* Every Corg on the desktop, sampled frame to frame: the ones moving
   fast enough to break glass light up. This is the whole tutorial, and
   it's the reason the threshold is read from AD_SHATTER_SPEED rather
   than kept here — the light has to mean exactly what the collision
   means. */
function asUpdateCorgGlow(dt) {
    if (dt <= 0) return;
    const threshold = asSmashSpeed();

    document.querySelectorAll('.guggy-icon-group').forEach((group) => {
        const r = group.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;

        const last = asCorgTracks.get(group);
        asCorgTracks.set(group, { x, y });
        if (!last) return;

        const speed = Math.hypot(x - last.x, y - last.y) / dt;
        // Only during a round: outside one the desktop shouldn't start
        // flashing every time Corg is thrown.
        group.classList.toggle('corg-hot', asState === 'play' && speed >= threshold);
    });
}

function asClearCorgGlow() {
    document.querySelectorAll('.guggy-icon-group.corg-hot')
        .forEach((el) => el.classList.remove('corg-hot'));
}

/* ------------------------------------------------------------------
   Round
   ------------------------------------------------------------------ */

function asStartRound() {
    asClearRoundAds();
    // The desktop starts empty, so the count on the HUD is the round's
    // own doing and the lose condition is fair.
    if (typeof removeAllAds === 'function') removeAllAds();

    asScore = 0;
    asCombo = 0;
    asBestCombo = 0;
    asSmashed = 0;
    asLastSmashAt = 0;
    asRoundStart = performance.now();
    asSpawnTimer = 0;
    asState = 'play';

    // Paused: the clicker's own ad rolls and its per-second score would
    // both be running underneath the round otherwise. Dragging and
    // throwing Corg doesn't care about isPaused, which is what makes this
    // possible at all.
    if (typeof isPaused !== 'undefined') isPaused = true;

    // Kevbo's rule is a property of the drag, not of the game, so it goes on
    // at the start of the round and comes off at the end of it — outside a
    // round Corg is yours to carry around the desktop as always.
    if (typeof setCorgHoldLimits === 'function') {
        setCorgHoldLimits(asKevbo ? AS_KEVBO_HOLD_MS : 0, asKevbo ? AS_KEVBO_REGRAB_MS : 0);
    }

    asShowCard(false);
    asFlash(asKevbo ? 'NO HOLDING. FLING HIM.' : 'SMASH THEM ALL');
    asUpdateHud();
    asRadioStart();
    asStartLoop();
}

function asEndRound() {
    asState = 'over';
    asClearCorgGlow();
    if (typeof setCorgHoldLimits === 'function') setCorgHoldLimits(0, 0);
    // The radio goes off with the round: the game-over card wants the error
    // sound heard, not a chorus under it.
    asRadioStop();
    if (asScore > asModeBest()) asSaveModeBest(asScore);
    if (typeof playSound === 'function') playSound('error-audio');
    asShowCard(true);
    asUpdateHud();
}

/* Leaving the game entirely: the desktop goes back to how it was. Also
   called by shutDown() in main.js, which is why it's global. */
function asAbortRound() {
    asState = 'ready';
    asStopLoop();
    asRadioStop();
    asClearCorgGlow();
    if (typeof setCorgHoldLimits === 'function') setCorgHoldLimits(0, 0);
    asClearRoundAds();
    const screen = document.getElementById('adsmasher-screen');
    if (screen) screen.style.display = 'none';
    asOpen = false;
    if (typeof isPaused !== 'undefined') isPaused = false;
}

/* ------------------------------------------------------------------
   Loop. There's no drawing to do — the desktop draws itself — so this
   is only the spawn timer, the chain's expiry, the lose check and the
   glow sampling.
   ------------------------------------------------------------------ */

function asStartLoop() {
    if (asRaf !== null) return;
    asLastTime = 0;
    asRaf = requestAnimationFrame(asFrame);
}

function asStopLoop() {
    if (asRaf !== null) { cancelAnimationFrame(asRaf); asRaf = null; }
}

function asFrame(now) {
    if (!asOpen) { asRaf = null; return; }

    // The first frame has no previous timestamp and a backgrounded tab
    // hands back a huge one; either would dump a fistful of ads at once.
    let dt = asLastTime ? (now - asLastTime) / 1000 : 0;
    asLastTime = now;
    dt = Math.min(dt, 0.05);

    if (asState === 'play') {
        asSpawnTimer -= dt * 1000;
        if (asSpawnTimer <= 0) {
            asSpawnRoundAd();
            asSpawnTimer = asSpawnInterval();
            asUpdateHud();
        }
        if (now - asLastSmashAt > AS_COMBO_WINDOW_MS && asCombo !== 0) {
            asCombo = 0;
            asUpdateHud();
        }
        if (asLiveAdCount() >= AS_MAX_ADS) asEndRound();
    }

    asUpdateCorgGlow(dt);

    asRaf = requestAnimationFrame(asFrame);
}

/* ------------------------------------------------------------------
   HUD
   ------------------------------------------------------------------ */

function asUpdateHud() {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    const live = asLiveAdCount();

    set('as-score', asScore.toLocaleString('en-US'));
    set('as-combo', 'x' + Math.max(1, Math.min(asCombo, AS_COMBO_CAP)));
    set('as-ads', `${live}/${AS_MAX_ADS}`);
    set('as-best', asModeBest().toLocaleString('en-US'));

    // A badge on the bar rather than another stat pane: which mode you're in
    // has to be legible at a glance mid-round, and the checkbox that sets it
    // is behind the card by then.
    const badge = document.getElementById('as-kevbo-badge');
    if (badge) badge.classList.toggle('on', asKevbo);
    const box = document.getElementById('as-kevbo');
    if (box) box.checked = asKevbo;

    // The counter turns red once the desktop is nearly full, which is the
    // only warning the game gives before the round ends.
    const adsEl = document.getElementById('as-ads');
    if (adsEl) adsEl.classList.toggle('as-danger', asState === 'play' && live >= AS_MAX_ADS - 3);
}

/* The card is the only part of the game that takes clicks — everything
   else on screen has to stay reachable, because everything else on
   screen is the game. */
function asShowCard(isOver) {
    const card = document.getElementById('as-card');
    if (!card) return;

    if (asState === 'play') { card.style.display = 'none'; return; }
    card.style.display = 'block';

    const title = document.getElementById('as-card-title');
    const body = document.getElementById('as-card-body');
    const btn = document.getElementById('as-card-btn');

    if (isOver) {
        if (title) title.textContent = 'POPUP OVERLOAD';
        if (body) {
            body.innerHTML =
                `<b>${asScore.toLocaleString('en-US')}</b> points &middot; ` +
                `${asSmashed} ads smashed &middot; best chain x${Math.min(asBestCombo, AS_COMBO_CAP)}<br>` +
                `${asKevbo ? 'Kevbo' : 'personal'} best: ${asModeBest().toLocaleString('en-US')}`;
        }
        if (btn) btn.textContent = 'PLAY AGAIN';
    } else {
        if (title) title.textContent = 'CORG AD SMASHER';
        if (body) {
            body.innerHTML =
                'Popups spawn all over your desktop. <b>Throw Corg through them.</b><br>' +
                'A small shove only pushes an ad around &mdash; throw hard and Corg glows, ' +
                'and anything he touches while he\'s glowing breaks.<br>' +
                `If you let <b>${AS_MAX_ADS}</b> ads spawn, you lose.`;
        }
        if (btn) btn.textContent = 'START';
    }

    const note = document.getElementById('as-kevbo-note');
    if (note) {
        note.innerHTML = asKevbo
            ? `<b>No holding Corg.</b> He slips your grip after ` +
              `${(AS_KEVBO_HOLD_MS / 1000).toFixed(2)}s and can't be picked back up for ` +
              `${(AS_KEVBO_REGRAB_MS / 1000).toFixed(2)}s, so every ad is a thrown one. ` +
              `Worth <b>${AS_KEVBO_BONUS}x</b> a piece, on its own scoreboard.`
            : 'Hold Corg as long as you like. Kevbo reckons that\'s too easy &mdash; ' +
              'switch this on and all you get is the throw.';
    }
}

/* Button on the card. */
function asCardAction() {
    if (typeof playSound === 'function') playSound('upgrade-audio');
    asStartRound();
}

/* ------------------------------------------------------------------
   Open / close
   ------------------------------------------------------------------ */

function asKeyDown(e) {
    if (!asOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); toggleAdSmasher(); return; }
    if ((e.key === ' ' || e.key === 'Enter') && asState !== 'play') {
        e.preventDefault();
        asStartRound();
    }
    if ((e.key === 'k' || e.key === 'K') && asState !== 'play') {
        e.preventDefault();
        asSetKevbo(!asKevbo);
        asShowCard(asState === 'over');
    }
}

function toggleAdSmasher() {
    const screen = document.getElementById('adsmasher-screen');
    if (!screen) return;

    if (asOpen) {
        document.removeEventListener('keydown', asKeyDown);
        asAbortRound();
        return;
    }

    asLoadBest();
    asOpen = true;
    asState = 'ready';
    asScore = 0;
    asCombo = 0;
    screen.style.display = 'block';
    if (typeof playSound === 'function') playSound('window-open-audio');

    // The desktop has to be reachable to be played on, so opening the game
    // doesn't pause anything — asStartRound() does that when a round
    // actually begins.
    asShowCard(false);
    asUpdateHud();
    document.addEventListener('keydown', asKeyDown);
    asStartLoop();
}
