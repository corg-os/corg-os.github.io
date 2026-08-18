/* =====================================================================
   hopecon.js — HOPECON_Tracker.exe

   The hopecon scale is a real thing people made up: five bands for how
   close Half-Life 3 feels this week, from "the announcement trailer is
   up" down to "cancelled, do not look outside". `images/hopecon.png` is
   that chart, and it is the app — the tracker's whole job is to point
   at the band we are on and say so.

   **We are on 3.** That is the entire content of this window: the
   chart, the band we are on marked on it, the clip, and a line at the
   bottom admitting nobody official is behind any of it.

   It tracks the hopecon. It does not report hopecon *news* — there are
   no dated entries about what somebody heard, no drifting gauges, no
   feed writing itself, because all of that would be the app making
   things up and presenting them as what happened. The only moving part
   is the check button, which really does go and look, takes a moment
   about it, and comes back with 3; the list underneath it holds the
   checks you made and nothing else.

   The broadcast panel plays the hopecon-3 clip. It starts when you open
   the window and stops when you close it.

   **The video is two files on purpose.** `videos/hopecon3.mp4` as
   delivered is HEVC, which most browsers won't decode (Chrome only will
   where the OS hands it a hardware decoder), so the panel would have
   been a black rectangle on most machines. `videos/hopecon3-h264.mp4`
   is the same clip in H.264 and is listed first in index.html; the
   original is the second <source> and the browser takes whichever it
   can play.

   Every theme gets this one (no `.win11-only`).
   ===================================================================== */

const HC_LEVEL = 3;              // the current hopecon. It is 3.
const HC_CHART = 'images/hopecon.png';

/* The five bands, counted the way the chart counts: 1 is the trailer, 5
   is the funeral. `band` is where that band sits in hopecon.png, as a
   percentage of the image, so the markers land on the artwork rather
   than on a redrawing of it — swap the chart for a taller one and these
   are the only numbers that need touching. */
const HC_LEVELS = [
    {
        n: 1, name: 'ANNOUNCEMENT TRAILER',
        note: 'It is up. It is real. Nobody is at work today.',
        band: { top: 1.56, height: 18.46 },
    },
    {
        n: 2, name: "IT'S HAPPENING SOON ENOUGH",
        note: 'Someone with a channel says be ready. They seem sure.',
        band: { top: 21.97, height: 17.09 },
    },
    {
        n: 3, name: 'A GUY HEARD SOMETHING',
        note: 'Secondhand rumour, no source, quoted everywhere by morning.',
        band: { top: 41.02, height: 17.19 },
    },
    {
        n: 4, name: 'STRINGS IN THE CODE',
        note: 'Names in a branch nobody was meant to read. Could mean anything.',
        band: { top: 58.59, height: 19.04 },
    },
    {
        n: 5, name: 'CANCELLED',
        note: 'It is raining. Do not look outside.',
        band: { top: 79.20, height: 19.14 },
    },
];

let hcChecking = false;

function hcCurrent() {
    return HC_LEVELS.find((l) => l.n === HC_LEVEL) || HC_LEVELS[2];
}

function hcStamp() {
    const d = new Date();
    const two = (n) => String(n).padStart(2, '0');
    return two(d.getHours()) + ':' + two(d.getMinutes());
}

/* ------------------------------------------------------------------
   The chart

   The image is the scale. Every band gets a box laid over its slice of
   it: the four we are not on are dimmed out, and the one we are on is
   left bright, outlined, and labelled.
   ------------------------------------------------------------------ */

function hcRenderChart() {
    const chart = document.getElementById('hopecon-chart');
    if (!chart) return;

    chart.innerHTML = '';

    const img = document.createElement('img');
    img.className = 'hc-chart-img';
    img.src = HC_CHART;
    img.alt = 'The hopecon scale, one to five';
    chart.appendChild(img);

    HC_LEVELS.forEach((level) => {
        const box = document.createElement('div');
        box.className = 'hc-band' + (level.n === HC_LEVEL ? ' hc-band-on' : '');
        box.style.top = level.band.top + '%';
        box.style.height = level.band.height + '%';
        box.title = 'HOPECON ' + level.n + ' — ' + level.name;

        if (level.n === HC_LEVEL) {
            const tag = document.createElement('span');
            tag.className = 'hc-band-tag';
            tag.textContent = 'WE ARE HERE';
            box.appendChild(tag);
        }

        chart.appendChild(box);
    });
}

function hcRenderReadout() {
    const level = hcCurrent();

    const big = document.getElementById('hopecon-level');
    if (big) big.textContent = String(HC_LEVEL);
    const name = document.getElementById('hopecon-level-name');
    if (name) name.textContent = level.name;
    const note = document.getElementById('hopecon-level-note');
    if (note) note.textContent = level.note;
}

/* The checks list only ever holds checks you actually made, this session.
   It started out seeded with four dated entries about rumours and code
   leaks, and that was the tracker reporting news it had made up. It
   tracks the hopecon; it doesn't tell you what happened. */
/* The checks list only ever holds checks you actually made, this session.
   It started out seeded with four dated entries about rumours and code
   leaks, and that was the tracker reporting news it had invented. It
   tracks the hopecon; it doesn't tell you what happened. */
function hcAddLog(when, text, fresh) {
    const log = document.getElementById('hopecon-log');
    if (!log) return;

    const line = document.createElement('div');
    line.className = 'hc-log-line' + (fresh ? ' hc-log-new' : '');

    const date = document.createElement('span');
    date.className = 'hc-log-date';
    date.textContent = when;

    const body = document.createElement('span');
    body.textContent = text;

    line.appendChild(date);
    line.appendChild(body);
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
}

function hcSetChecked(text) {
    const el = document.getElementById('hopecon-checked');
    if (el) el.textContent = text;
}

/* ------------------------------------------------------------------
   The clip
   ------------------------------------------------------------------ */

function hcVideo() { return document.getElementById('hopecon-video'); }

function hcPlayBroadcast() {
    const video = hcVideo();
    if (!video) return;

    video.loop = true;
    video.muted = false;
    video.volume = typeof musicVolume !== 'undefined' ? musicVolume : 0.5;
    try { video.currentTime = 0; } catch (e) { /* not seekable yet */ }

    // Opening the window was a click, so sound is allowed; a browser that
    // disagrees gets it muted rather than not at all.
    video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
    });
    hcPaintMute();
}

function hcStopBroadcast() {
    const video = hcVideo();
    if (!video) return;
    video.pause();
    try { video.currentTime = 0; } catch (e) { /* fine */ }
}

function hopeconReplay() {
    const video = hcVideo();
    if (!video) return;
    try { video.currentTime = 0; } catch (e) { /* fine */ }
    video.play().catch(() => {});
    if (typeof playSound === 'function') playSound('upgrade-audio');
}

function hopeconToggleMute() {
    const video = hcVideo();
    if (!video) return;
    video.muted = !video.muted;
    hcPaintMute();
    if (typeof playSound === 'function') playSound('upgrade-audio');
}

function hcPaintMute() {
    const btn = document.getElementById('hopecon-mute');
    const video = hcVideo();
    if (btn && video) btn.textContent = video.muted ? 'Sound on' : 'Sound off';
}

/* ------------------------------------------------------------------
   Re-checking

   The only thing in here that moves. It goes and looks, it takes a
   moment, and it tells you the hopecon is 3.
   ------------------------------------------------------------------ */

function hopeconRefresh() {
    if (hcChecking) return;
    hcChecking = true;

    const btn = document.getElementById('hopecon-refresh');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }
    hcSetChecked('Checking...');
    if (typeof playSound === 'function') playSound('upgrade-audio');

    setTimeout(() => {
        hcChecking = false;
        if (btn) { btn.disabled = false; btn.textContent = 'Check again'; }
        hcSetChecked('Last checked ' + hcStamp() + '.');
        hcAddLog(hcStamp(), 'Still 3.', true);
        hcRenderReadout();
        if (typeof playSound === 'function') playSound('notify-audio');
    }, 1400 + Math.random() * 900);
}

/* ------------------------------------------------------------------
   Open / close
   ------------------------------------------------------------------ */

/* Everything off, including the clip. shutDown() calls this, since it
   hides every .screen-overlay behind our back and a video still playing
   inside a hidden window is a haunting. */
function hopeconStop() {
    hcStopBroadcast();
}

function toggleHopecon() {
    const screen = document.getElementById('hopecon-screen');
    if (!screen) return;

    // The displayed state, not a flag of our own — same reason as every
    // other app here: shutDown() can hide the screen without telling us.
    if (screen.style.display === 'flex') {
        hopeconStop();
        screen.style.display = 'none';
        if (typeof isPaused !== 'undefined') isPaused = false;
        return;
    }

    if (typeof isPaused !== 'undefined') isPaused = true;
    screen.style.display = 'flex';

    hcRenderChart();
    hcRenderReadout();
    hcSetChecked('Last checked ' + hcStamp() + '.');
    hcPlayBroadcast();

    if (typeof playSound === 'function') playSound('window-open-audio');
}
