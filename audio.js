// audio.js: Manages most (NOT ALL) sound effects and volume settings.
//
// There is no background music any more — no playlist, no per-song bookkeeping
// and no streamer-safe substitute — so everything below is one-shot sound. The
// one exception lives elsewhere: Ad Smasher's radio (adsmasher.js) runs its own
// three-track rotation for the length of a round. It is the only thing on
// updateMusicVolume() at the bottom of this file.
//
// Three volumes, deliberately independent rather than nested (see data.js):
// sfxVolume for everything here, musicVolume for the radio, glassVolume for the
// breaks — which are loud enough, and divisive enough, to want their own dial.

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

var currentGuggyVoice = null;

// Win11 theme swaps some win95-era chrome sounds for real Windows 11 system
// sounds. Two are deliberately silent there because Windows 11 doesn't chime
// at you for them: 'upgrade-audio' (every button click) and
// 'window-open-audio' (every window/panel opening).
//
// The notification chime is reserved for the two things that are actually
// notifications: Corg piping up and an ad popping out. Both call
// 'notify-audio', which is the same windowopen.mp3 on every other theme.
//
// **These all come out of `sounds/dm/`, and that matters.** The sound pack's
// `sounds/` folder is a straight Media-folder dump, and a Windows 11 Media
// folder still holds the *Vista/7-era* sound scheme for legacy events — which
// is why the theme sounded like Windows 7 for everything but the boot jingle.
// `sounds/dm/` ("design modern") is the redesigned Windows 11 set that the OS
// actually plays, and it's genuinely different audio, not a re-encode (the
// two versions of a given file have different PCM data). This is the same
// trap the boot sound fell into: prefer `dm/` for any sound added here.
const WIN11_SOUND_OVERRIDES = {
    'upgrade-audio': null,
    'window-open-audio': null,
    'notify-audio': "sfx/Windows11_sounds_b22000/sounds/dm/Windows Notify System Generic.wav",
    // dm/ has no Critical Stop — modern Windows plays the Foreground sound for
    // message boxes and alerts, so that's what an error is here.
    'error-audio': "sfx/Windows11_sounds_b22000/sounds/dm/Windows Foreground.wav",
    // ...and no Recycle either; Hardware Remove is the closest dm sound for
    // "that thing is gone now".
    'recycle-audio': "sfx/Windows11_sounds_b22000/sounds/dm/Windows Hardware Remove.wav",
    // 'achievement-audio' is deliberately absent: sfx/achievement.wav is the
    // game's own sound, not a Windows one, so there's nothing to correct.
};

// XP and 7 get the same treatment, off their own sound packs. The mapping is
// the real scheme-event mapping in each OS, not a vibe: a button is Menu
// Command, a window appearing is Restore Up, a popup/assistant is the balloon
// tip, binning something is Empty Recycle Bin, and an error is Critical Stop
// (which is what a Windows message box with a red icon actually plays).
//
// Unlike win11 nothing is silenced here: XP and 7 both really did chime for
// menus and windows, and the whole joke of those themes is that they're noisy.
const WINXP_SOUND_OVERRIDES = {
    'upgrade-audio': "sfx/winxp/xpmenu.wav",
    'window-open-audio': "sfx/winxp/xprestor.wav",
    'notify-audio': "sfx/winxp/xpballn.wav",
    'error-audio': "sfx/winxp/xpcrtstp.wav",
    'recycle-audio': "sfx/winxp/xprecycl.wav",
};

const WIN7_SOUND_OVERRIDES = {
    'upgrade-audio': "sfx/win7/Windows Menu Command.wav",
    'window-open-audio': "sfx/win7/Windows Restore.wav",
    'notify-audio': "sfx/win7/Windows Balloon.wav",
    'error-audio': "sfx/win7/Windows Critical Stop.wav",
    'recycle-audio': "sfx/win7/Windows Recycle.wav",
};

const WIN10_SOUND_OVERRIDES = {
    'upgrade-audio': null,
    'window-open-audio': null,
    'notify-audio': "sfx/win10/Windows Notify System Generic.wav",
    'error-audio': "sfx/win10/Windows Background.wav",
    'recycle-audio': null,
};

// CORGOS COPILOT is 11 wearing a different hat, so it keeps 11's sounds.
const OS_SOUND_OVERRIDES = {
    win11: WIN11_SOUND_OVERRIDES,
    corgpilotos: WIN11_SOUND_OVERRIDES,
    win10: WIN10_SOUND_OVERRIDES,
    winxp: WINXP_SOUND_OVERRIDES,
    win7: WIN7_SOUND_OVERRIDES,
    // win95 is deliberately absent: the <audio> elements in index.html *are*
    // the 95 scheme, so it's the fallback rather than an override.
};

function playSound(audioId) {
    const overrides = (typeof currentOS !== 'undefined' && OS_SOUND_OVERRIDES[currentOS]) || null;
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, audioId)) {
        const overridePath = overrides[audioId];
        if (overridePath === null) return;
        const clone = new Audio(overridePath);
        clone.volume = sfxVolume;
        clone.play().catch(e => console.log('audio playback blocked.', e));
        return;
    }

    const audioEl = document.getElementById(audioId);
    if (audioEl) {
        const clone = audioEl.cloneNode(true);
        clone.volume = sfxVolume;
        clone.play().catch(e => console.log('audio playback blocked.', e));
    }
}

// An ad taking a corgi to the face shatters like a pane of glass, and picks one
// of the three sheet-break takes at random so a screenful of ads doesn't break
// in unison. Not a playSound() id on purpose: this is the game's own effect,
// the same on every theme, and it needs the fresh <audio> per call anyway
// because several ads can go at once.
const AD_GLASS_SFX = [
    'sfx/ads/glass_sheet_break1.wav',
    'sfx/ads/glass_sheet_break2.wav',
    'sfx/ads/glass_sheet_break3.wav',
];

// Kevbo mode: Corg slipping out of your hands and hitting the ground. Its own
// call rather than a playSound() id, for the same reason the glass is — this is
// the game's own effect, identical on every theme, and it wants a fresh <audio>
// per drop because two Corgs can land at once.
const CORG_DROP_SFX = 'sfx/concrete_break3.wav';

function playCorgDropSfx() {
    const thud = new Audio(CORG_DROP_SFX);
    thud.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    thud.play().catch(e => console.log('audio playback blocked.', e));
}

// Its own volume, not a share of sfxVolume: this is the loudest thing in the
// game, it's what the title screen warns about, and someone turning it down
// shouldn't have to turn every other sound down with it.
function glassSfxVolume() {
    return typeof glassVolume !== 'undefined' ? glassVolume : 1.0;
}

function playGlassBreakSfx() {
    const src = AD_GLASS_SFX[Math.floor(Math.random() * AD_GLASS_SFX.length)];
    const shatter = new Audio(src);
    shatter.volume = glassSfxVolume();
    // A little pitch scatter on top of the three takes, so back-to-back breaks
    // in a chain reaction still don't sound like the same sample twice.
    shatter.playbackRate = 0.92 + Math.random() * 0.16;
    shatter.play().catch(() => {});
}

// Corg says one thing and one thing only.
const CORG_SFX = 'sfx/corg.wav';

function playGuggySfx() {
    if (typeof isDraggingGuggy !== 'undefined' && isDraggingGuggy) return;
    const guggyAudio = new Audio(CORG_SFX);

    const source = audioCtx.createMediaElementSource(guggyAudio);
    const gainNode = audioCtx.createGain();
    
    const baseVol = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    gainNode.gain.value = baseVol * 3.0; 

    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    window.currentGuggyAudio = guggyAudio;
    guggyAudio.play().catch(err => { if (err.name !== 'AbortError') console.log("audio error:", err); });
}

// Corg says "corg" on every impact while bouncing around the desktop. This is
// separate from playGuggySfx() on purpose: that one goes quiet mid-drag, and a
// throw is exactly when the bounces need to be heard. Throttled so a flurry of
// tiny settling bounces doesn't stack a dozen overlapping corgs.
let lastCorgBounceAt = 0;

// `strength` (0-1) is how hard the hit was — a glancing bounce is a quiet
// corg, a full-speed landing is the loud one.
function playCorgBounceSfx(strength) {
    const now = performance.now();
    if (now - lastCorgBounceAt < 110) return;
    lastCorgBounceAt = now;

    const hit = strength === undefined ? 1 : Math.max(0, Math.min(1, strength));
    const bounce = new Audio(CORG_SFX);
    bounce.volume = (typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0) * (0.35 + 0.65 * hit);
    bounce.play().catch(() => {});
}

// The browser won't let anything play before the page has been interacted
// with, and the WebAudio context starts suspended for the same reason.
//
// This used to listen for `click` on <body> only, and was never actually
// called — which is why the title screen was silent until you pressed one of
// its buttons: the *first* thing most people do there is hover PLAY, and a
// hover is not a user gesture, so that sound was blocked. Now the unlock is
// armed at load on every gesture the browser accepts (pointerdown fires on
// press, before the click completes; keydown covers keyboard-only play), in
// the capture phase so nothing can swallow it, anywhere on the page rather
// than only on a button. The title screen also says so — see #mm-audio-hint
// in index.html — because no amount of code can play a sound before the
// browser has been given a gesture.
let audioUnlocked = false;

const AUDIO_UNLOCK_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'keydown'];

function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    AUDIO_UNLOCK_EVENTS.forEach(type => document.removeEventListener(type, unlockAudio, true));
    const hint = document.getElementById('mm-audio-hint');
    if (hint) hint.classList.add('mm-hint-gone');
}

function initAudioOnInteraction() {
    AUDIO_UNLOCK_EVENTS.forEach(type => document.addEventListener(type, unlockAudio, true));
    loadMenuSfxBuffers();
}

function updateSFXVolume(val) {
    sfxVolume = parseFloat(val);
    saveGame();
    if (typeof currentGuggyVoice !== 'undefined' && currentGuggyVoice) {
        currentGuggyVoice.volume = sfxVolume;
    }
}

// MUSIC. There is exactly one thing on this dial — Ad Smasher's radio — and it
// may well be playing while the slider moves, so it's told rather than just
// being created at the right volume.
function updateMusicVolume(val) {
    musicVolume = parseFloat(val);
    saveGame();
    if (typeof asRadioSyncVolume === 'function') asRadioSyncVolume();
}

// GLASS. Nothing to update live: every break is a fresh <audio> that reads
// glassSfxVolume() when it fires.
function updateGlassVolume(val) {
    glassVolume = parseFloat(val);
    saveGame();
}

// The title screen's own click and hover. Not playSound() ids: the title screen
// is outside every OS theme, so it must not pick up a theme's sound overrides —
// these are the shell's own, the same pair the boot manager (the screen it
// hands off to) uses.
const MENU_SFX_HOVER = 'sfx/main menu/buttonrollover.wav';
const MENU_SFX_CLICK = 'sfx/main menu/buttonclickrelease.wav';

// Decoded once, up front. A fresh `new Audio()` per hover goes through the
// autoplay check every single time and has to wait on the media element
// starting up, which on the title screen means the rollover sound arrives
// after the mouse has already left the button. A buffer source off the
// already-running context is immediate, and it can't be blocked once the
// context is running — which is what makes hovering work for the whole menu
// after the first press anywhere, rather than only on buttons you've clicked.
const menuSfxBuffers = {};

function loadMenuSfxBuffers() {
    [MENU_SFX_HOVER, MENU_SFX_CLICK].forEach(src => {
        if (menuSfxBuffers[src]) return;
        fetch(src)
            .then(r => r.arrayBuffer())
            .then(b => audioCtx.decodeAudioData(b))
            .then(buf => { menuSfxBuffers[src] = buf; })
            // Falls back to the <audio> path below; not worth a console error.
            .catch(() => { });
    });
}

function playMenuSfx(src) {
    const volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    const buffer = menuSfxBuffers[src];

    if (buffer && audioCtx.state === 'running') {
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        const gain = audioCtx.createGain();
        gain.gain.value = volume;
        source.connect(gain);
        gain.connect(audioCtx.destination);
        source.start(0);
        return;
    }

    // Not decoded yet (or the context is still asleep because nothing has been
    // pressed): try the media element, which is blocked before the first
    // gesture and plays after it.
    const audio = new Audio(src);
    audio.volume = volume;
    audio.play().catch(() => { });
}

function menuHoverSfx() { playMenuSfx(MENU_SFX_HOVER); }
function menuClickSfx() { playMenuSfx(MENU_SFX_CLICK); }

// Every one of Corg's lines is "corg", so every one of them is voiced by
// corg.wav — the per-line filename is ignored on purpose.
function playGuggyVoice(fileName) {
    if (!fileName) return;

    if (currentGuggyVoice) {
        currentGuggyVoice.pause();
        currentGuggyVoice.currentTime = 0;
    }

    currentGuggyVoice = new Audio(CORG_SFX);
    currentGuggyVoice.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    currentGuggyVoice.play().catch(e => console.log("guggy voice blocked:", e));
}