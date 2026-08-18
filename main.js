/*  */// main.js: Handles the core gameplay loop, saving/loading, and UI DOM updates.

// The crate/skin system is gone — the can is always images/gug.png, and nothing
// swaps it any more: not a crate, not an upgrade, not an ending. Buying
// "Unforeseen Consequences" or Valve still ends the game, it just doesn't
// repaint the thing you click. Any leftovers a previous save wrote are dead
// weight, so drop them on load.
localStorage.removeItem('gugInventory');
localStorage.removeItem('equippedGug');

function formatGugNumber(num) {
    if (num < 1000000) return Math.floor(num).toLocaleString('en-US');
    const magnitude = Math.floor(Math.log10(num) / 3);
    if (magnitude >= numberSuffixes.length) return num.toExponential(2);
    const scaledNumber = num / Math.pow(10, magnitude * 3);
    return parseFloat(scaledNumber.toFixed(2)) + " " + numberSuffixes[magnitude];
}

const scoreElement = document.getElementById('score');
const clickStatElement = document.getElementById('gug-per-click');
const gpsStatElement = document.getElementById('gug-per-second');
const recycleStatElement = document.getElementById('gug-per-recycle'); 
const gameOverScreen = document.getElementById('game-over-screen');
const welcomeScreen = document.getElementById('welcome-screen');
const settingsScreen = document.getElementById('settings-screen'); 

document.addEventListener('DOMContentLoaded', () => {
    // First thing, before anything else writes to the page: every "corg" on
    // screen becomes the dog, and stays that way for anything drawn later.
    startCorgifyObserver();

    allCorgs().forEach(makeGuggyDraggable);
    document.querySelectorAll('.movable-resizable').forEach(makeWindowDraggable);
    // CORG_Clicker and the Black Market are laid out rather than floated, so
    // they aren't .movable-resizable — undockWindow() is what lets them move.
    document.querySelectorAll('.dockable-window').forEach(makeWindowDraggable);
    if (['win11', 'win10', 'corgpilotos'].includes(currentOS)) setOSTheme(currentOS);

    const devLog = document.getElementById('dev-console-log');
    if (devLog && devModeEnabled) devLog.append('\nDeveloper mode is currently ON.');

    // The can is fixed. A save from before the swaps came out could still be
    // carrying gug2.gif or valvegug.png on the element, so put the one image
    // back explicitly rather than trusting whatever is in the markup.
    const mainCan = document.getElementById('gug-can');
    if (mainCan) mainCan.src = 'images/gug.png';
});

function loadGame() {
    const savedState = localStorage.getItem('gugClickerSave');
    if (savedState) {
        const parsed = JSON.parse(savedState);
        score = parsed.score || 0;
        gugPerClick = parsed.gugPerClick || 1;
        gugPerSecond = parsed.gugPerSecond || 0;
        adMultiplier = parsed.adMultiplier !== undefined ? parsed.adMultiplier : 1.0;
        recycleReward = parsed.recycleReward || 0;
        sfxVolume = parsed.sfxVolume !== undefined ? parsed.sfxVolume : 1.0;
        musicVolume = parsed.musicVolume !== undefined ? parsed.musicVolume : 0.5;
        glassVolume = parsed.glassVolume !== undefined ? parsed.glassVolume : 1.0;
        unlockedAchievements = parsed.unlockedAchievements || [];
        totalAdsTrashed = parsed.totalAdsTrashed || 0;
        totalAdsShattered = parsed.totalAdsShattered || 0;
        bestShatterCombo = parsed.bestShatterCombo || 0;
        gugOS11Unlocked = parsed.gugOS11Unlocked || false;
        devModeEnabled = parsed.devModeEnabled || false;
        if (typeof parsed.corgBounceness === 'number') corgBounceness = parsed.corgBounceness;
        if (typeof parsed.screensaverDelay === 'number') setScreensaverDelay(parsed.screensaverDelay);
        currentOS = parsed.currentOS || 'win95';
        if (['win11', 'win10', 'corgpilotos'].includes(currentOS)) setOSTheme(currentOS);

        trueEndingAchieved = parsed.trueEndingAchieved || false;

        if (parsed.upgrades) {
            parsed.upgrades.forEach((savedUpg, index) => {
                if (upgrades[index]) {
                    upgrades[index].count = savedUpg.count || 0;
                    upgrades[index].cost = savedUpg.cost || upgrades[index].baseCost;
                    upgrades[index].discovered = savedUpg.discovered || false;
                }
            });
        }
    }
}

function saveGame() {
    const gameState = { score, gugPerClick, gugPerSecond, adMultiplier, recycleReward, upgrades: upgrades.map(u => ({ count: u.count, cost: u.cost, discovered: u.discovered })), sfxVolume, musicVolume, glassVolume, trueEndingAchieved, unlockedAchievements, totalAdsTrashed, totalAdsShattered, bestShatterCombo, gugOS11Unlocked, devModeEnabled, currentOS, corgBounceness, screensaverDelay };
    localStorage.setItem('gugClickerSave', JSON.stringify(gameState));
}

function resetGame() {
    if (confirm("WARNING: Are you sure you want to format C:\\ and erase all CORG data? This cannot be undone!")) {
        score = 0; gugPerClick = 1; gugPerSecond = 0; adMultiplier = 1.0; recycleReward = 0; totalAdsTrashed = 0; totalAdsShattered = 0; bestShatterCombo = 0;
        if (typeof upgrades !== 'undefined') {
            upgrades.forEach(u => { u.count = 0; u.cost = u.baseCost; u.discovered = false; if (u.used !== undefined) u.used = 0; });
        }
        initShop();
        updateUI();
        localStorage.setItem = function() {}; 
        localStorage.clear();
        window.location.reload();
    }
}

function startGameLoop() {
    gameLoopInterval = setInterval(() => {
        if (isPaused) return; 
        if (gugPerSecond > 0) {
            score += gugPerSecond;
            updateUI();
            rollForAd(0.05 * adMultiplier); 
        }
        checkAchievements();
    }, 1000);
}

function clickGug() {
    if (isPaused) return;
    playSound('corg-audio');

    score += getEffectiveGPC();
    updateUI();
    rollForAd(0.10 * adMultiplier);
    checkAchievements();
}

// The Corg on the desktop is the same dog as the can in CORG_Clicker, so
// patting him pays exactly what a click in there pays. Every .guggy-container
// carries this handler, clones included (spawnExtraCorg copies the attribute),
// so a desk full of Corgs is a desk full of buttons.
//
// The click that ends a drag isn't a pat: isDraggingGuggy is still set at this
// point (closeDragElement only clears it 50ms later), which is the same guard
// playGuggySfx and triggerGuggy use, so throwing Corg about doesn't farm CORGs.
function clickDesktopCorg() {
    playGuggySfx();
    if (isDraggingGuggy || isPaused) return;

    score += getEffectiveGPC();
    updateUI();
    rollForAd(0.10 * adMultiplier);
    checkAchievements();
}

function triggerGameOver() {
    isPaused = true;
    clearInterval(gameLoopInterval);
    removeAllAds();
    playSound('gman-audio');
    
    document.getElementById('final-score').innerText = Math.floor(score).toLocaleString('en-US');
    document.getElementById('final-click').innerText = gugPerClick.toLocaleString('en-US');
    document.getElementById('final-gps').innerText = gugPerSecond.toLocaleString('en-US');
    gameOverScreen.style.display = 'flex';
}

function resumeGame() {
    isPaused = false;
    gameOverScreen.style.display = 'none';
    startGameLoop(); 
}

function triggerTrueVictory() {
    isPaused = true;
    clearInterval(gameLoopInterval);
    removeAllAds();
    trueEndingAchieved = true;
    saveGame(); 
    document.getElementById('true-final-score').innerText = formatGugNumber(score);
    document.getElementById('true-victory-screen').style.display = 'flex';
}

function resumeTrueVictory() {
    isPaused = false;
    document.getElementById('true-victory-screen').style.display = 'none';
    startGameLoop(); 
}

function corgifyString(str) {
    if (!str) return '';
    return str.replace(/corg(?!pilot)/gi, corgWordHTML());
}

function updateUI() {
    scoreElement.innerText = formatGugNumber(score);
    clickStatElement.innerText = formatGugNumber(getEffectiveGPC());
    gpsStatElement.innerText = formatGugNumber(gugPerSecond);
    if (recycleStatElement) recycleStatElement.innerText = formatGugNumber(recycleReward);

    upgrades.forEach((upg, index) => {
        const btn = document.getElementById(`upgrade-${index}`);
        if (btn) {
            const isMaxed = upg.maxCount && upg.count >= upg.maxCount;
            const shouldDisable = isMaxed || (score < Math.floor(upg.cost));
            if (btn.disabled !== shouldDisable) btn.disabled = shouldDisable;

            if (score >= Math.floor(upg.cost) || upg.count > 0) upg.discovered = true;

            const renderKey = `${upg.discovered ? 1 : 0}_${upg.count}_${Math.floor(upg.cost)}`;
            if (btn._renderKey !== renderKey) {
                btn._renderKey = renderKey;

                const nameDiv = btn.querySelector('.upgrade-name');
                const descDiv = btn.querySelectorAll('.upgrade-desc')[0];
                const costDiv = btn.querySelectorAll('.upgrade-desc')[1];

                let countText = upg.isConsumable ? `(Used: ${upg.count})` : `(Owned: ${upg.count})`;
                if (upg.maxCount) countText += `/${upg.maxCount}`;

                let costHTML = isMaxed ? "MAXED" : `${formatGugNumber(upg.cost)} ${corgWordHTML()}`;

                if (upg.discovered) {
                    nameDiv.innerHTML = `${corgifyString(upg.name)} ${countText}`;
                    descDiv.innerHTML = corgifyString(upg.desc);
                } else {
                    nameDiv.innerHTML = `???? ${countText}`;
                    descDiv.innerHTML = `????`;
                }
                costDiv.innerHTML = `Cost: <strong>${costHTML}</strong>`;
            }
        }
    });
}

function switchTab(tabId) {
    const tabs = ['main', 'recycle'];
    tabs.forEach(tab => {
        const content = document.getElementById(`shop-container-${tab}`);
        const btn = document.getElementById(`tab-btn-${tab}`);
        if (content) content.style.display = (tab === tabId) ? 'block' : 'none';
        if (btn) btn.classList.toggle('active', tab === tabId);
    });
    if (typeof playSound === 'function') playSound('upgrade-audio');
}

function toggleSettings() {
    if (settingsScreen.style.display === 'flex') {
        settingsScreen.style.display = 'none';
        isPaused = false;
    } else {
        isPaused = true; 
        settingsScreen.style.display = 'flex';
        // The title screen has the same three sliders, so both have to be told
        // the live values every time they open or they drift apart.
        const slider = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
        slider('sfx-volume', sfxVolume);
        slider('music-volume', musicVolume);
        slider('glass-volume', glassVolume);
        playSound('window-open-audio');
    }
}

function checkWelcome() {
    if (!localStorage.getItem('gugWelcomeSeen')) {
        isPaused = true; 
        welcomeScreen.style.display = 'flex';
        playSound('window-open-audio');
    } else {
        isPaused = false;
    }
}

function closeWelcome() {
    isPaused = false;
    welcomeScreen.style.display = 'none';
    localStorage.setItem('gugWelcomeSeen', 'true');
    playSound('corg-audio');
}

function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    minutes = minutes < 10 ? '0'+minutes : minutes;
    document.getElementById('tray-clock').innerText = hours + ':' + minutes + ' ' + ampm;
}

// `force` spawns an ad even while the game is paused. Ad Smasher needs it: a
// round runs with the clicker paused (so its own passive ads and its score
// tick stay out of the way) but the round's whole job is putting ads on the
// desktop, and it drives its own spawn timer.
function spawnAd(force) {
    if (isPaused && !force) return;
    // notify-audio, not window-open-audio: on win11 the notification chime is
    // reserved for ads and Corg (see WIN11_SOUND_OVERRIDES).
    playSound('notify-audio');
    
    const adData = adTemplates[Math.floor(Math.random() * adTemplates.length)];
    const popup = document.createElement('div');
    popup.className = 'win98-window popup-ad';

    const isMobile = window.innerWidth <= 800;
    const adWidth = isMobile ? 220 : 320;
    const adHeight = isMobile ? 220 : 320;

    const maxX = window.innerWidth - adWidth; 
    const maxY = window.innerHeight - adHeight;
    popup.style.left = `${Math.max(10, Math.floor(Math.random() * maxX))}px`;
    popup.style.top = `${Math.max(10, Math.floor(Math.random() * maxY))}px`;

    popup.innerHTML = `<div class="win98-titlebar"><span>${adData.title}</span><button class="win win98-button close-btn" onclick="playSound('upgrade-audio'); this.parentElement.parentElement.remove()">X</button></div><div class="win98-content popup-content" style="text-align: center;">${adData.html}</div>`;
    document.body.appendChild(popup);
    makeAdDraggable(popup);
    return popup;
}

function rollForAd(chance) {
    let guaranteedSpawns = Math.floor(chance);
    for (let i = 0; i < guaranteedSpawns; i++) spawnAd();
    if (Math.random() < (chance - guaranteedSpawns)) spawnAd();
}

// Every bin on screen is a drop target: the one inside CORG_Clicker and the
// one on the desktop. A bin belonging to a closed window measures 0x0, so the
// size check is what stops drops registering on an invisible target.
function pointIsOverTrash(clientX, clientY) {
    return Array.from(document.querySelectorAll('.trash-target')).some((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    });
}

// ---------------------------------------------------------------------------
// Gugslop forcefield
//
// Every bin is wrapped in an invisible energy orb that only Corg can feel.
// Drag Corg into it and it flares, hums (sfx/corgsfx/force_field_loop1.wav)
// and pushes Corg back out along the contact normal, so Corg can never be
// binned on the desktop or inside CORG_Clicker. Popup ads ignore it entirely —
// makeAdDraggable() still drops them straight in.
//
// The orbs are body-level fixed elements sized from each bin's rect on demand,
// so they follow the bin across themes, window drags and resizes without any
// layout coupling to the bin markup.
// ---------------------------------------------------------------------------
const FORCEFIELD_SFX = 'sfx/corgsfx/force_field_loop1.wav';
let forcefieldAudio = null;
let forcefieldStopTimer = null;

function getForcefieldOrb(trashEl) {
    let orb = trashEl._forcefieldOrb;
    if (!orb) {
        orb = document.createElement('div');
        orb.className = 'trash-forcefield';
        document.body.appendChild(orb);
        trashEl._forcefieldOrb = orb;
    }

    const r = trashEl.getBoundingClientRect();
    const radius = Math.max(r.width, r.height) * 0.62;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    orb.style.width = orb.style.height = (radius * 2) + 'px';
    orb.style.left = (cx - radius) + 'px';
    orb.style.top = (cy - radius) + 'px';

    return { orb, cx, cy, radius };
}

// Same 0x0 guard as pointIsOverTrash(): a bin in a closed window has no orb.
function activeTrashOrbs() {
    return Array.from(document.querySelectorAll('.trash-target'))
        .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        })
        .map(getForcefieldOrb);
}

function startForcefieldHum() {
    clearTimeout(forcefieldStopTimer);
    forcefieldStopTimer = null;

    if (!forcefieldAudio) {
        forcefieldAudio = new Audio(FORCEFIELD_SFX);
        forcefieldAudio.loop = true;
    }
    forcefieldAudio.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    if (forcefieldAudio.paused) forcefieldAudio.play().catch(() => {});
}

// Sliding along the edge of the orb drops in and out of contact frame to
// frame, so the hum lingers briefly instead of stuttering. `immediate` is for
// letting go of Corg, where the field should snap off.
function stopForcefieldHum(immediate) {
    const kill = () => {
        forcefieldStopTimer = null;
        if (forcefieldAudio) {
            forcefieldAudio.pause();
            forcefieldAudio.currentTime = 0;
        }
        document.querySelectorAll('.trash-forcefield').forEach((orb) => orb.classList.remove('active'));
    };

    if (immediate) { clearTimeout(forcefieldStopTimer); kill(); return; }
    if (forcefieldStopTimer) return;
    forcefieldStopTimer = setTimeout(kill, 160);
}

// Nudges #guggy-container out of any orb it's overlapping. Called on every
// drag frame and once more on release, so a fast pointer can't sneak Corg past
// the field between frames.
//
// Returns the contact normal (pointing out of the orb) when it pushed, or null
// when Corg is clear — the physics sim reflects Corg's velocity off it, which
// is what makes a thrown Corg bounce off the bin instead of just stopping.
function repelGuggyFromForcefields(container) {
    const group = container ? container.querySelector('.guggy-icon-group') : null;
    if (!container || !group) return null;

    let contact = null;

    activeTrashOrbs().forEach(({ orb, cx, cy, radius }) => {
        const g = group.getBoundingClientRect();
        const gx = g.left + g.width / 2;
        const gy = g.top + g.height / 2;
        // Corg's own radius counts for a little less than half, otherwise the
        // field holds them off at an unreadable distance from the bin.
        const minDist = radius + Math.min(g.width, g.height) * 0.28;

        let dx = gx - cx;
        let dy = gy - cy;
        let dist = Math.hypot(dx, dy);

        if (dist >= minDist) { orb.classList.remove('active'); return; }

        orb.classList.add('active');

        // Dead centre has no contact normal — shove Corg straight up.
        if (dist < 0.001) { dx = 0; dy = -1; dist = 1; }

        const push = minDist - dist;
        container.style.left = (container.offsetLeft + (dx / dist) * push) + 'px';
        container.style.top = (container.offsetTop + (dy / dist) * push) + 'px';

        contact = { nx: dx / dist, ny: dy / dist };
    });

    if (contact) startForcefieldHum(); else stopForcefieldHum(false);
    return contact;
}

// ---------------------------------------------------------------------------
// Ad physics
//
// Ads hang in the air where they spawned until Corg body-checks one. That first
// hit switches the ad over to a Google-Gravity-style rigid body: it gets kicked
// away, tumbles, falls to the top of the taskbar, bounces and settles. Picking
// one up parks the sim while you drag; letting go drops it again with whatever
// throw you gave it. Bins are unchanged — a physics ad dropped in one still
// deletes as normal.
// ---------------------------------------------------------------------------
const AD_GRAVITY = 2400;          // px/s²
const AD_RESTITUTION = 0.38;      // energy kept per bounce
const AD_GROUND_FRICTION = 4.5;   // e-folds per second while scraping the floor
const AD_AIR_SPIN_DAMP = 1.1;     // ads tumble, they don't pinwheel
const AD_GROUND_SPIN_DAMP = 9;
const AD_SLEEP_SPEED = 45;        // px/s under which a grounded ad gives up
const AD_HIT_COOLDOWN = 220;      // ms between Corg kicks on the same ad
let physicsAds = [];
let adPhysicsFrame = null;
let adPhysicsLast = 0;

// The floor everything lands on is the top of the taskbar, not the bottom of
// the window — otherwise ads sink behind it.
function desktopFloorY() {
    const taskbar = document.getElementById('win95-taskbar');
    const r = taskbar ? taskbar.getBoundingClientRect() : null;
    return (r && r.height > 0) ? r.top : window.innerHeight;
}

function startAdPhysics() {
    if (adPhysicsFrame !== null) return;
    adPhysicsLast = performance.now();
    adPhysicsFrame = requestAnimationFrame(adPhysicsStep);
}

// `vx`/`vy` are the kick. Called again on an ad that's already physical (a
// second body-check, or a throw) to wake it back up.
function kickAd(ad, vx, vy, vrot) {
    if (!ad || !ad.isConnected) return;

    if (!ad._phys) {
        // The spawn pop-in animation owns `transform`; drop it before the sim
        // starts writing rotations there.
        ad.style.animation = 'none';
        ad.classList.add('ad-physics');
        ad._phys = { x: ad.offsetLeft, y: ad.offsetTop, vx: 0, vy: 0, rot: 0, vrot: 0, held: false, asleep: true, lastHit: 0 };
        physicsAds.push(ad);
    }

    const p = ad._phys;
    p.x = ad.offsetLeft;
    p.y = ad.offsetTop;
    p.vx = vx;
    p.vy = vy;
    p.vrot = vrot;
    p.asleep = false;
    p.grounded = false;
    startAdPhysics();
}

function adPhysicsStep(now) {
    const dt = Math.min((now - adPhysicsLast) / 1000, 0.05);
    adPhysicsLast = now;

    const floorY = desktopFloorY();
    let awake = false;

    physicsAds = physicsAds.filter((ad) => ad.isConnected);

    // Pass 1 — integrate each body against gravity, the walls and the taskbar.
    physicsAds.forEach((ad) => {
        const p = ad._phys;
        p.w = ad.offsetWidth;
        p.h = ad.offsetHeight;

        // Being dragged: the pointer owns the position, the sim just watches so
        // the release picks up from the right place.
        if (p.held) { p.x = ad.offsetLeft; p.y = ad.offsetTop; awake = true; return; }
        if (p.asleep) return;
        awake = true;

        const w = p.w;
        const h = p.h;

        p.vy += AD_GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        p.vrot *= Math.exp(-AD_AIR_SPIN_DAMP * dt);

        // A tilted ad is wider and taller than its layout box, and it's the
        // tilted outline that has to sit on the taskbar — clamping the layout
        // box instead is what let the corners sink through it. Rotation is
        // about the centre, so the tilted half-extents are all we need.
        const rad = p.rot * Math.PI / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const padX = (w * cos + h * sin) / 2 - w / 2;   // tilt overhang sideways
        const padY = (w * sin + h * cos) / 2 - h / 2;   // ...and below

        if (p.x < padX) { p.x = padX; p.vx = -p.vx * AD_RESTITUTION; p.vrot = -p.vrot * 0.6; }
        else if (p.x + w + padX > window.innerWidth) { p.x = window.innerWidth - w - padX; p.vx = -p.vx * AD_RESTITUTION; p.vrot = -p.vrot * 0.6; }

        const restY = floorY - h - padY;
        if (p.y >= restY) {
            p.y = restY;
            p.vy = -p.vy * AD_RESTITUTION;
            if (Math.abs(p.vy) < 90) p.vy = 0;
            settleAdOnSurface(p, dt);
        }
    });

    // Pass 2 — ads shove each other around. A shove hard enough to wake a
    // sleeping ad has to keep the loop alive for it.
    if (resolveAdCollisions()) awake = true;
    if (kickStaticAdsHitBy()) awake = true;

    // Pass 3 — anything that ended the frame inside a bin gets binned, and
    // whatever survives gets drawn.
    const bins = trashRects();
    physicsAds.slice().forEach((ad) => {
        const p = ad._phys;
        if (!p.held && !p.asleep && adIsInATrash(p, bins)) { trashAd(ad); return; }

        ad.style.left = p.x + 'px';
        ad.style.top = p.y + 'px';
        ad.style.transform = `rotate(${p.rot}deg)`;
    });

    if (awake) {
        adPhysicsFrame = requestAnimationFrame(adPhysicsStep);
    } else {
        adPhysicsFrame = null;
    }
}

// Shared by the taskbar landing and by landing on another ad: bleed off the
// slide and the spin, and fall asleep once there's nothing left to do.
//
// Nothing here touches the angle. No righting, no toppling, no snapping to a
// face, no cap on how fast an ad can spin — an ad keeps whatever rotation the
// hit gave it and comes to rest at whatever angle it was at when it ran out of
// energy, corner-first or otherwise. The only angular force left is ordinary
// friction, which is what lets it stop at all.
function settleAdOnSurface(p, dt) {
    if (!p.grounded) {
        // Fold the accumulated spin down to an equivalent angle in (-180, 180]
        // so the transform doesn't carry a running total of full turns. Purely
        // bookkeeping — the ad doesn't move.
        p.rot = ((p.rot + 180) % 360 + 360) % 360 - 180;
        p.grounded = true;
    }

    p.vx *= Math.exp(-AD_GROUND_FRICTION * dt);
    p.vrot *= Math.exp(-AD_GROUND_SPIN_DAMP * dt);

    if (p.vy === 0 && Math.abs(p.vx) < AD_SLEEP_SPEED && Math.abs(p.vrot) < 12) {
        p.vx = 0;
        p.vrot = 0;
        p.asleep = true;
    }
}

// Trick shots: an ad Corg punts across the room counts as trashed the moment
// its middle passes over a bin, exactly as if you'd dragged it there. Uses the
// centre rather than the edges so a near miss doesn't count.
function adIsInATrash(p, bins) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    return bins.some((r) => cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom);
}

// Same 0x0 guard as pointIsOverTrash(): a bin in a closed window isn't a bin.
function trashRects() {
    return Array.from(document.querySelectorAll('.trash-target'))
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0);
}

// An ad flying across the desktop barges through the ones still hanging in the
// air where they spawned, knocking those loose as well — so one good punt from
// Corg can bring a whole screenful down.
function kickStaticAdsHitBy() {
    const statics = Array.from(document.querySelectorAll('.popup-ad:not(.ad-physics)'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }));
    if (!statics.length) return false;

    let woke = false;

    physicsAds.forEach((ad) => {
        const p = ad._phys;
        if (p.held || p.asleep) return;

        const speed = Math.hypot(p.vx, p.vy);
        if (speed < 140) return; // drifting into one isn't a hit

        statics.forEach(({ el, r }) => {
            if (!el.isConnected || el.classList.contains('ad-physics')) return;
            if (p.x + p.w < r.left || p.x > r.right || p.y + p.h < r.top || p.y > r.bottom) return;

            kickAd(el, p.vx * 0.6, p.vy * 0.6 - 140, (Math.random() < 0.5 ? -1 : 1) * (20 + speed * 0.05));
            woke = true;
        });
    });

    return woke;
}

// Ad-vs-ad, resolved on the axis of least overlap with their untilted boxes.
// Rotation is left out of it on purpose: exact tilted-polygon contacts cost far
// more than they're worth for a pile of popups, and the boxes are only ever a
// few degrees off square once they've settled.
function resolveAdCollisions() {
    let woke = false;

    for (let i = 0; i < physicsAds.length; i++) {
        const a = physicsAds[i]._phys;

        for (let j = i + 1; j < physicsAds.length; j++) {
            const b = physicsAds[j]._phys;

            // Two ads that have both settled are just a pile; leave them be.
            if (a.asleep && b.asleep) continue;

            const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
            if (overlapX <= 0) continue;
            const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
            if (overlapY <= 0) continue;

            // A held or sleeping ad is immovable — the other one takes the
            // whole correction. That's what makes ads stack on a settled one
            // instead of mashing it through the taskbar.
            const aFixed = a.held || a.asleep;
            const bFixed = b.held || b.asleep;
            const aShare = aFixed ? 0 : (bFixed ? 1 : 0.5);
            const bShare = bFixed ? 0 : (aFixed ? 1 : 0.5);

            if (overlapX < overlapY) {
                const dir = (a.x + a.w / 2) < (b.x + b.w / 2) ? -1 : 1;
                a.x += dir * overlapX * aShare;
                b.x -= dir * overlapX * bShare;

                const closing = (a.vx - b.vx) * dir;
                if (closing < 0) {
                    const avg = (a.vx + b.vx) / 2;
                    if (!aFixed) a.vx = avg + (a.vx - avg) * -AD_RESTITUTION;
                    if (!bFixed) b.vx = avg + (b.vx - avg) * -AD_RESTITUTION;
                }
            } else {
                const dir = (a.y + a.h / 2) < (b.y + b.h / 2) ? -1 : 1;
                a.y += dir * overlapY * aShare;
                b.y -= dir * overlapY * bShare;

                const closing = (a.vy - b.vy) * dir;
                if (closing < 0) {
                    const avg = (a.vy + b.vy) / 2;
                    if (!aFixed) a.vy = avg + (a.vy - avg) * -AD_RESTITUTION;
                    if (!bFixed) b.vy = avg + (b.vy - avg) * -AD_RESTITUTION;
                }

                // Whichever one ended up on top is now resting on the other, so
                // it settles against it the same way it would on the taskbar.
                const upper = dir < 0 ? a : b;
                if (!upper.held && !upper.asleep) {
                    if (Math.abs(upper.vy) < 90) upper.vy = 0;
                    settleAdOnSurface(upper, 1 / 60);
                }
            }

            // Anything shoved hard enough wakes back up and joins in.
            if (a.asleep && Math.hypot(a.vx, a.vy) > AD_SLEEP_SPEED) { a.asleep = false; woke = true; }
            if (b.asleep && Math.hypot(b.vx, b.vy) > AD_SLEEP_SPEED) { b.asleep = false; woke = true; }
        }
    }

    return woke;
}

// Corg ploughing through the ad layer. `speed` is how hard Corg is moving, so a
// gentle nudge shoves an ad aside and a hard throw sends it flying. Returns the
// normal of the first ad hit (pointing away from it) so Corg can bounce off.
function collideGuggyWithAds(container, speed) {
    const group = container ? container.querySelector('.guggy-icon-group') : null;
    if (!group) return null;

    const g = group.getBoundingClientRect();
    const gx = g.left + g.width / 2;
    const gy = g.top + g.height / 2;
    const now = performance.now();
    let contact = null;

    document.querySelectorAll('.popup-ad').forEach((ad) => {
        const r = ad.getBoundingClientRect();
        if (g.right < r.left || g.left > r.right || g.bottom < r.top || g.top > r.bottom) return;

        const p = ad._phys;
        if (p && now - p.lastHit < AD_HIT_COOLDOWN) return;

        let dx = gx - (r.left + r.width / 2);
        let dy = gy - (r.top + r.height / 2);
        let dist = Math.hypot(dx, dy);
        if (dist < 0.001) { dx = 0; dy = -1; dist = 1; }
        dx /= dist;
        dy /= dist;

        // Thrown hard enough and Corg doesn't shove the ad, they go through it.
        // No contact normal is returned for a break: there's nothing left to
        // bounce off, so Corg carries on into whatever is behind it.
        if (speed >= AD_SHATTER_SPEED) {
            shatterAd(ad, -dx * speed, -dy * speed, gx, gy);
            return;
        }

        // Enough of a shove that even a slow bump visibly knocks the ad loose.
        const force = Math.max(speed, 260);
        kickAd(ad, -dx * force * 0.55, -dy * force * 0.55 - 220, (Math.random() < 0.5 ? -1 : 1) * (30 + force * 0.14));
        ad._phys.lastHit = now;

        if (!contact) contact = { nx: dx, ny: dy };
    });

    return contact;
}

// Binning an ad, however it got there: dragged in by hand, or punted in by
// Corg while the physics sim had hold of it.
function trashAd(adElement) {
    if (!adElement || !adElement.isConnected) return;

    playSound('recycle-audio');
    adElement.remove();

    totalAdsTrashed++;
    if (recycleReward > 0) { score += recycleReward; updateUI(); }
    checkAchievements();
}

// ---------------------------------------------------------------------------
// Shattering ads
//
// Below AD_SHATTER_SPEED, Corg hitting an ad is a shove and the ad tumbles off
// (kickAd, above). At or above it the ad is a pane of glass and Corg goes
// through it: the window breaks into radial shards from the point of impact,
// they fly off along their own wedge, fall, and are gone. The ad is destroyed,
// so this counts as trashing it as well as shattering it.
// ---------------------------------------------------------------------------
// px/s. Deliberately above what a short drop reaches on its own (GUGGY_GRAVITY
// is 2600, so gravity alone needs ~500px of fall to get here): letting go of
// Corg over an ad shoves it, you have to actually throw to break one.
const AD_SHATTER_SPEED = 1600;
const AD_SHARD_WEDGES = 11;       // radial cracks out of the impact point
const AD_SHARD_GRAVITY = 2600;    // px/s², matching the ad sim closely enough
const AD_SHARD_MS = 1500;

// A single throw that goes through several ads is its own achievement, so the
// count is kept per flight — launchGuggy resets it.
let shatterComboThisFlight = 0;

// The shards are a decoration on top of a destroyed ad, so nothing in them can
// be interactive: no iframe (which would restart a YouTube ad mid-break), no
// buttons, no pointer events.
function buildAdShardFace(ad, w, h) {
    // Measured on the live ad, not on the clone: a detached node has no layout,
    // so asking the copy how tall its embed was always answers zero.
    const liveHeights = Array.from(ad.querySelectorAll('iframe, video, audio')).map((el) => el.offsetHeight);

    const face = ad.cloneNode(true);
    // The copy must NOT stay a .popup-ad: everything that hunts for ads goes
    // through querySelectorAll('.popup-ad') — Corg's collision pass, the
    // knock-on kicks, the "100 ads at once" achievement — and debris that still
    // answers to that selector is an ad as far as all of them are concerned.
    // .ad-shard-face carries the handful of looks .popup-ad was providing.
    face.classList.remove('popup-ad', 'ad-physics');
    face.classList.add('ad-shard-face');
    face.removeAttribute('id');
    face.querySelectorAll('iframe, video, audio').forEach((el, i) => {
        const filler = document.createElement('div');
        filler.className = 'ad-shard-filler';
        filler.style.height = (liveHeights[i] || 160) + 'px';
        el.replaceWith(filler);
    });
    face.querySelectorAll('button, a, input').forEach((el) => { el.style.pointerEvents = 'none'; });

    face.style.position = 'absolute';
    face.style.left = '0';
    face.style.top = '0';
    face.style.margin = '0';
    face.style.width = w + 'px';
    face.style.height = h + 'px';
    face.style.animation = 'none';
    face.style.transform = 'none';
    face.style.zIndex = 'auto';
    face.style.boxShadow = 'none';
    return face;
}

// The crack pattern: a ring of wedges around the impact point, each split into
// a near piece and a far piece, so the middle of the break is fine splinters
// and the edges come away in big slabs. Returns polygons in box pixels.
function adShardPolygons(w, h, ix, iy) {
    const reach = Math.hypot(w, h) * 1.6;   // past every corner, so nothing is left behind
    const polys = [];

    const angles = [];
    for (let i = 0; i < AD_SHARD_WEDGES; i++) {
        const spread = (Math.PI * 2) / AD_SHARD_WEDGES;
        angles.push(i * spread + (Math.random() - 0.5) * spread * 0.55);
    }
    angles.push(angles[0] + Math.PI * 2);   // close the ring back onto itself

    // One radius per crack, not per wedge, so neighbouring pieces share an edge
    // instead of overlapping.
    const inner = angles.map(() => reach * (0.12 + Math.random() * 0.16));
    inner[inner.length - 1] = inner[0];

    const at = (angle, r) => [ix + Math.cos(angle) * r, iy + Math.sin(angle) * r];

    for (let i = 0; i < AD_SHARD_WEDGES; i++) {
        const a1 = angles[i], a2 = angles[i + 1];
        const r1 = inner[i], r2 = inner[i + 1];
        polys.push([[ix, iy], at(a1, r1), at(a2, r2)]);
        polys.push([at(a1, r1), at(a2, r2), at(a2, reach), at(a1, reach)]);
    }

    return polys;
}

function shatterAd(ad, hitVX, hitVY, clientX, clientY) {
    if (!ad || !ad.isConnected || ad._shattering) return;
    ad._shattering = true;

    const r = ad.getBoundingClientRect();
    const w = ad.offsetWidth;
    const h = ad.offsetHeight;
    const rot = (ad._phys && ad._phys.rot) || 0;

    // Impact point in the ad's own box. Corg can be clipping a corner, so it's
    // clamped inside — a crack origin outside the pane has no wedges to give.
    const ix = Math.max(w * 0.12, Math.min(w * 0.88, (clientX - r.left) * (w / (r.width || w))));
    const iy = Math.max(h * 0.12, Math.min(h * 0.88, (clientY - r.top) * (h / (r.height || h))));

    const shell = document.createElement('div');
    shell.className = 'ad-shatter';
    shell.style.left = ad.offsetLeft + 'px';
    shell.style.top = ad.offsetTop + 'px';
    shell.style.width = w + 'px';
    shell.style.height = h + 'px';
    shell.style.zIndex = ad.style.zIndex || '';

    // Built once and copied per shard — the expensive part is reading the live
    // ad's layout, and every shard wants the identical face anyway.
    const faceTemplate = buildAdShardFace(ad, w, h);
    if (rot) faceTemplate.style.transform = `rotate(${rot}deg)`;

    const polys = adShardPolygons(w, h, ix, iy);
    polys.forEach((poly) => {
        const shard = document.createElement('div');
        shard.className = 'ad-shard';
        shard.style.clipPath = 'polygon(' + poly.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ') + ')';

        // Every shard carries the whole ad, tilted the way the ad was; the clip
        // is what makes each one a different piece of it.
        shard.appendChild(faceTemplate.cloneNode(true));
        shell.appendChild(shard);

        // Centroid decides which way the piece goes: outward from the impact,
        // faster the nearer it was to it, plus whatever Corg was carrying.
        const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
        const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
        let dx = cx - ix, dy = cy - iy;
        const dist = Math.hypot(dx, dy) || 1;
        dx /= dist; dy /= dist;

        const burst = 320 + 26000 / (dist + 60);
        const vx = dx * burst + hitVX * 0.22;
        const vy = dy * burst + hitVY * 0.22 - 130;
        const spin = (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 320);

        const t = AD_SHARD_MS / 1000;
        const posAt = (f) => [vx * (t * f), vy * (t * f) + 0.5 * AD_SHARD_GRAVITY * (t * f) * (t * f)];
        const [mx, my] = posAt(0.5);
        const [ex, ey] = posAt(1);

        shard.animate([
            { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 },
            { transform: `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px) rotate(${(spin * 0.5).toFixed(1)}deg)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px) rotate(${spin.toFixed(1)}deg)`, opacity: 0 },
        ], { duration: AD_SHARD_MS, easing: 'linear', fill: 'forwards' });
    });

    (ad.parentElement || document.body).appendChild(shell);
    setTimeout(() => shell.remove(), AD_SHARD_MS + 60);

    ad.remove();
    physicsAds = physicsAds.filter((el) => el !== ad);

    if (typeof playGlassBreakSfx === 'function') playGlassBreakSfx();

    // Ad Smasher scores off the desktop's own break, rather than reimplementing
    // one: a round is the same dog going through the same ads, counted.
    if (typeof asOnAdShattered === 'function') asOnAdShattered(ad);

    totalAdsShattered++;
    totalAdsTrashed++;
    shatterComboThisFlight++;
    if (shatterComboThisFlight > bestShatterCombo) bestShatterCombo = shatterComboThisFlight;
    if (recycleReward > 0) { score += recycleReward; updateUI(); }
    checkAchievements();
}

function makeAdDraggable(adElement) {
    const titleBar = adElement.querySelector('.win98-titlebar');
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    let lastMoveX = 0, lastMoveY = 0, lastMoveAt = 0, throwVX = 0, throwVY = 0;
    titleBar.onmousedown = dragStart;
    titleBar.ontouchstart = dragStart;

    function dragStart(e) {
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
        e = e || window.event;
        if (e.type === 'touchstart') e.preventDefault(); 
        
        if (e.type === 'touchstart') { pos3 = e.touches[0].clientX; pos4 = e.touches[0].clientY; } 
        else { pos3 = e.clientX; pos4 = e.clientY; }
        
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementDrag;
        
        document.querySelectorAll('.popup-ad').forEach(ad => ad.style.zIndex = 100);
        adElement.style.zIndex = 101;

        // A physics ad hands control back to the pointer while it's held; the
        // throw is measured from the last couple of move samples.
        if (adElement._phys) adElement._phys.held = true;
        lastMoveX = pos3; lastMoveY = pos4; lastMoveAt = performance.now();
        throwVX = 0; throwVY = 0;
    }

    function elementDrag(e) {
        e = e || window.event;
        if (e.type === 'touchmove') e.preventDefault(); 
        let clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        let clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        pos1 = pos3 - clientX;
        pos2 = pos4 - clientY;
        pos3 = clientX;
        pos4 = clientY;
        
        adElement.style.top = (adElement.offsetTop - pos2) + "px";
        adElement.style.left = (adElement.offsetLeft - pos1) + "px";

        const now = performance.now();
        const dt = (now - lastMoveAt) / 1000;
        if (dt > 0.004) {
            throwVX = (clientX - lastMoveX) / dt;
            throwVY = (clientY - lastMoveY) / dt;
            lastMoveX = clientX; lastMoveY = clientY; lastMoveAt = now;
        }
    }

    function closeDragElement(e) {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
        
        let clientX = e.type === 'touchend' ? e.changedTouches[0].clientX : e.clientX;
        let clientY = e.type === 'touchend' ? e.changedTouches[0].clientY : e.clientY;

        if (pointIsOverTrash(clientX, clientY)) {
            trashAd(adElement);
        } else if (adElement._phys) {
            // Google Gravity rules: once an ad has been knocked loose it never
            // hangs in the air again — let go and it drops, throw it and it
            // flies.
            adElement._phys.held = false;
            kickAd(adElement, throwVX, throwVY, throwVX * 0.06);
        }
        checkAchievements();
    }
}

function removeAllAds() { document.querySelectorAll('.popup-ad').forEach(ad => ad.remove()); }

// ---------------------------------------------------------------------------
// Docked windows
//
// CORG_Clicker and Black_Market_Shop were the two windows on this desktop you
// couldn't move: they aren't floating windows at all, they're flex children of
// #main-content-wrapper, sitting in a two-column layout. Everything else here
// drags by its titlebar, so they looked broken rather than deliberate.
//
// Rather than rewrite the layout, a docked window leaves it the first time you
// drag it: it's measured where it stands, switched to position:fixed at exactly
// those coordinates (so nothing visibly moves at the moment of undocking), and
// a hidden placeholder of the same size takes its slot in the flex row. The
// placeholder is the point — without it the sibling column snaps out to fill
// the gap, and dragging one window would resize the other.
//
// The mobile layout is left alone: below 800px the shop is a full-screen sheet
// and the clicker fills what's left, and neither is a window you'd want to drag
// around a phone.
// ---------------------------------------------------------------------------
let topWindowZ = 60;

function bringWindowToFront(windowEl) {
    if (windowEl && windowEl.classList.contains('window-undocked')) {
        windowEl.style.zIndex = ++topWindowZ;
    }
}

// Returns false only when a dockable window can't be undocked right now, which
// is the one case where a drag or resize shouldn't start at all.
function undockWindow(windowEl) {
    if (!windowEl || !windowEl.classList.contains('dockable-window')) return true;
    if (windowEl.classList.contains('window-undocked')) return true;
    if (window.innerWidth <= 800) return false;

    const rect = windowEl.getBoundingClientRect();
    const parent = windowEl.parentElement;

    const placeholder = document.createElement('div');
    placeholder.className = 'window-dock-placeholder';
    placeholder.style.width = rect.width + 'px';
    placeholder.style.height = rect.height + 'px';
    // ...but the pixels are only the fallback. The placeholder takes over the
    // window's own `flex`, so it keeps behaving like the window did as the row
    // changes around it. Freezing the width instead is what broke the shop:
    // drag the clicker while the shop is closed and the placeholder pins the
    // full width of the row open, so "Run Black_Market_Shop.dll" opened the
    // shop off the right-hand edge of the screen and looked like it did
    // nothing. With the flex copied across, the row still splits 2:1 the
    // moment the shop comes back.
    const flex = getComputedStyle(windowEl).flex;
    if (flex && flex !== '0 1 auto') placeholder.style.flex = flex;
    if (parent) {
        parent.insertBefore(placeholder, windowEl);
        // The shop's wrapper is now an empty column; let clicks through it to
        // the desktop icons underneath instead of catching them on nothing.
        parent.classList.add('has-undocked-window');
    }

    windowEl.style.width = rect.width + 'px';
    windowEl.style.height = rect.height + 'px';
    windowEl.style.left = rect.left + 'px';
    windowEl.style.top = rect.top + 'px';
    windowEl.classList.add('window-undocked');
    bringWindowToFront(windowEl);
    return true;
}

// Makes .movable-resizable windows draggable by their titlebar, and gives them
// a resize grip in the bottom-right corner — see addResizeGrip().
function makeWindowDraggable(windowEl) {
    // `.no-resize` gets the titlebar drag but no grip. Minesweeper is the
    // reason: its board is a fixed grid of fixed cells, so the window has
    // exactly one correct size and dragging it any bigger only added grey.
    // The real one couldn't be resized either.
    if (!windowEl.classList.contains('no-resize')) addResizeGrip(windowEl);
    const titleBar = windowEl.querySelector('.win98-titlebar');
    if (!titleBar) return;
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    titleBar.onmousedown = dragStart;
    titleBar.ontouchstart = dragStart;

    // Two undocked windows can overlap, so clicking anywhere in one raises it.
    // Capture, because the content underneath (the can, the shop buttons) stops
    // plenty of these from bubbling.
    if (windowEl.classList.contains('dockable-window')) {
        windowEl.addEventListener('mousedown', () => bringWindowToFront(windowEl), true);
        windowEl.addEventListener('touchstart', () => bringWindowToFront(windowEl), true);
    }

    function dragStart(e) {
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
        e = e || window.event;
        if (!undockWindow(windowEl)) return;
        if (e.type === 'touchstart') e.preventDefault();

        const rect = windowEl.getBoundingClientRect();
        windowEl.style.left = rect.left + "px";
        windowEl.style.top = rect.top + "px";
        windowEl.style.transform = "none";

        if (e.type === 'touchstart') { pos3 = e.touches[0].clientX; pos4 = e.touches[0].clientY; }
        else { pos3 = e.clientX; pos4 = e.clientY; }

        document.body.classList.add('window-interacting');
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementDrag;
    }

    function elementDrag(e) {
        e = e || window.event;
        if (e.type === 'touchmove') e.preventDefault();
        let clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        let clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        pos1 = pos3 - clientX;
        pos2 = pos4 - clientY;
        pos3 = clientX;
        pos4 = clientY;

        windowEl.style.top = (windowEl.offsetTop - pos2) + "px";
        windowEl.style.left = (windowEl.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.body.classList.remove('window-interacting');
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
    }
}

// Replaces the native CSS resizer with our own grip. The native one doesn't
// work on a window whose body is an <iframe>: the iframe sits over the
// bottom-right corner and eats the pointer, which is why the embedded games
// were stuck at their opening size while the iframe-less windows resized
// fine. The grip floats above the iframe, and iframe pointer events
// are switched off for the duration of a drag/resize so the mousemove stream
// doesn't disappear into the game.
// Flags a window as busy while its iframe loads, which is what puts the
// "working in background" cursor over it (see the busy/progress block at the
// bottom of style.css). The iframe is cross-origin, so its `load` event is the
// only progress signal available — the timeout is there so a load that never
// fires can't leave the window stuck looking busy.
function setWindowLoading(windowEl, iframe) {
    if (!windowEl || !iframe) return;
    windowEl.classList.add('window-loading');
    const done = () => windowEl.classList.remove('window-loading');
    iframe.addEventListener('load', done, { once: true });
    iframe.addEventListener('error', done, { once: true });
    setTimeout(done, 20000);
}

function addResizeGrip(windowEl) {
    if (windowEl.querySelector(':scope > .window-resize-grip')) return;
    windowEl.classList.add('has-resize-grip');

    const grip = document.createElement('div');
    grip.className = 'window-resize-grip';
    grip.title = 'Resize';
    windowEl.appendChild(grip);

    grip.addEventListener('mousedown', resizeStart);
    grip.addEventListener('touchstart', resizeStart, { passive: false });

    function resizeStart(e) {
        e.preventDefault();
        e.stopPropagation();

        // A docked window's size is the flex row's business, so resizing one
        // takes it out of the row first, exactly as dragging it would.
        if (!undockWindow(windowEl)) return;

        const point = e.touches ? e.touches[0] : e;
        const rect = windowEl.getBoundingClientRect();
        const startX = point.clientX, startY = point.clientY;
        const startW = rect.width, startH = rect.height;

        // the inline max-width/max-height caps would otherwise clamp the drag
        windowEl.style.maxWidth = 'none';
        windowEl.style.maxHeight = 'none';
        document.body.classList.add('window-interacting');

        function resizeMove(ev) {
            const p = ev.touches ? ev.touches[0] : ev;
            if (ev.cancelable) ev.preventDefault();
            windowEl.style.width = Math.max(220, startW + (p.clientX - startX)) + 'px';
            windowEl.style.height = Math.max(120, startH + (p.clientY - startY)) + 'px';
        }

        function resizeEnd() {
            document.body.classList.remove('window-interacting');
            document.removeEventListener('mousemove', resizeMove);
            document.removeEventListener('mouseup', resizeEnd);
            document.removeEventListener('touchmove', resizeMove);
            document.removeEventListener('touchend', resizeEnd);
        }

        document.addEventListener('mousemove', resizeMove);
        document.addEventListener('mouseup', resizeEnd);
        document.addEventListener('touchmove', resizeMove, { passive: false });
        document.addEventListener('touchend', resizeEnd);
    }
}

// guggy assistant
let currentGuggyTip = null, guggyHideTimer = null, guggyIdleTimer = null, idleAnimationTimer = null, isGuggyActive = false; 
let isDraggingGuggy = false;
// The assistant is one still corg now, not a set of mood gifs. Callers still
// pass the old gif names (idle/happy/sad/question/trashed) — they're kept as
// intent, they just all resolve to the same picture.
const CORG_IMAGE = 'images/corg.png';

// The word "corg" is never spelled out anywhere the game shows it to you — it's
// the dog. This is the one place that markup is written, so the speech bubble,
// the boot splashes, the setup song and the login hint can't drift apart.
// `variant` picks the sizing modifier from style.css ('' inline, 'block' for a
// line that is only the word, 'label' under a desktop icon).
function corgWordHTML(variant) {
    const cls = 'corg-word' + (variant ? ` corg-word-${variant}` : '');
    return `<img class="${cls}" src="${CORG_IMAGE}" alt="corg">`;
}

/* =====================================================================
   "corg" is a picture, everywhere, always.
   ---------------------------------------------------------------------
   Every rendered occurrence of the letters c-o-r-g becomes the dog: on its
   own ("corg"), as a prefix ("CORGOS 95" -> [dog]OS 95, "CORG_Clicker" ->
   [dog]_Clicker), as a plural ("1,000 CORGs" -> 1,000 [dog]s), and inside
   ordinary prose. Case doesn't matter; the surrounding characters are kept.

   Done as a pass over the DOM rather than by editing ~370 strings across
   index.html, data.js and main.js, because a great many of them are built at
   runtime — upgrade names and costs are rewritten every second by updateUI,
   the login screens and boot splashes are template literals, and the ad
   bodies come out of adTemplates. A transform catches all of it, including
   anything added later, and there is exactly one rule to change if you ever
   want the spelling back.

   Only text nodes are touched. Attributes are left alone, which is what keeps
   the password field, the image `alt`s and every id/class working.
   ===================================================================== */

const CORG_WORD_RE = /corg(?!pilot)/gi;

// Elements whose text is not prose being shown to the reader — code, form
// values, canvas fallbacks — plus our own shard debris, which is a clone of
// already-transformed markup and has nothing left to find.
// SVG's tagName is lowercase 'svg' in an HTML document, hence both spellings —
// the uppercase one alone silently never matched.
const CORGIFY_SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'TEXTAREA', 'TITLE', 'OPTION', 'SELECT',
    'INPUT', 'NOSCRIPT', 'CANVAS', 'IFRAME', 'HEAD', 'SVG', 'svg',
]);

function corgifySkips(el) {
    return CORGIFY_SKIP_TAGS.has(el.tagName)
        || el.classList.contains('ad-shatter')
        // Escape hatch: put data-no-corg on anything that must stay spelled out.
        || el.hasAttribute('data-no-corg');
}

// Set while we're doing the replacing, and the observer handle, so the pass
// below can drop the mutation records it caused itself. Without the
// takeRecords() the observer callback (which runs as a microtask, after
// corgifyBusy is already back to false) would re-walk everything we just
// rewrote — harmless, since the split text no longer contains the word, but
// exactly double the work on every shop tick.
let corgifyBusy = false;
let corgObserver = null;

function corgifyTextNodes(root) {
    if (!root || corgifyBusy) return;
    if (root.nodeType === Node.ELEMENT_NODE && root.closest('[data-no-corg]')) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
            CORG_WORD_RE.lastIndex = 0;
            if (!CORG_WORD_RE.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
            for (let el = node.parentElement; el; el = el.parentElement) {
                if (corgifySkips(el)) return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });

    const targets = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n);
    if (!targets.length) return;

    corgifyBusy = true;
    targets.forEach((node) => {
        const text = node.nodeValue;
        const frag = document.createDocumentFragment();
        let last = 0;
        CORG_WORD_RE.lastIndex = 0;
        for (let m = CORG_WORD_RE.exec(text); m; m = CORG_WORD_RE.exec(text)) {
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            const img = document.createElement('img');
            img.className = 'corg-word';
            img.src = CORG_IMAGE;
            img.alt = m[0];
            frag.appendChild(img);
            last = m.index + m[0].length;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        node.parentNode.replaceChild(frag, node);
    });
    if (corgObserver) corgObserver.takeRecords();
    corgifyBusy = false;
}

// Anything the game draws later — a spawned ad, a rebuilt shop row, a login
// screen, a toast — gets the same treatment. Batched into one pass per frame
// so updateUI's once-a-second rewrite of every upgrade costs one walk, not one
// per element.
let corgifyPending = null;

function startCorgifyObserver() {
    corgObserver = new MutationObserver((records) => {
        if (corgifyBusy) return;
        const roots = new Set();
        records.forEach((r) => {
            if (r.type === 'characterData') { if (r.target.parentElement) roots.add(r.target.parentElement); return; }
            r.addedNodes.forEach((n) => {
                if (n.nodeType === Node.TEXT_NODE) { if (n.parentElement) roots.add(n.parentElement); }
                else if (n.nodeType === Node.ELEMENT_NODE) roots.add(n);
            });
        });
        if (!roots.size) return;

        if (corgifyPending) cancelAnimationFrame(corgifyPending);
        corgifyPending = requestAnimationFrame(() => {
            corgifyPending = null;
            roots.forEach((el) => { if (el.isConnected) corgifyTextNodes(el); });
        });
    });

    corgObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    corgifyTextNodes(document.body);
}

// Corg's whole vocabulary is the word "corg". showGuggyTip and
// handleGuggyResponse both write through here. Anything Corg says that *isn't*
// "corg" (there is nothing today, but the tip data still carries real strings)
// falls back to text, so this can't silently swallow a line.
function sayInGuggyBubble(el, text) {
    if (!el) return;
    const line = (text || '').trim();
    if (line.toLowerCase() === 'corg') {
        el.innerHTML = corgWordHTML('block');
        return;
    }
    el.innerText = text;
}

function setGuggyImage() {
    const img = document.getElementById('guggy-img');
    if (!img) return;
    if (img.getAttribute('src') !== CORG_IMAGE) img.src = CORG_IMAGE;
}

function playIdleAnimations() {
    if (isGuggyActive) return;
    setGuggyImage();
    // There's nothing left to cycle, but the timer is what other code uses to
    // tell "idling" from "talking", so keep it ticking.
    idleAnimationTimer = setTimeout(playIdleAnimations, 5000 + Math.floor(Math.random() * 2000));
}

// True while any pre-desktop screen owns the display (title, intro, setup, boot
// manager, login). Corg shouldn't pipe up over the title screen.
function isPreDesktop() {
    return ['main-menu-screen', 'intro-video-screen', 'setup-screen', 'boot-menu-screen', 'login-screen']
        .some((id) => {
            const el = document.getElementById(id);
            return el && el.classList.contains('open');
        });
}

function showGuggyTip() {
    if (isPreDesktop()) { setTimeout(showGuggyTip, 8000); return; }
    const bubble = document.getElementById('guggy-bubble');
    const textEl = document.getElementById('guggy-text');
    const buttonsEl = document.getElementById('guggy-buttons');
    if (!bubble || !textEl || !buttonsEl) return;

    currentGuggyTip = guggyTips[Math.floor(Math.random() * guggyTips.length)];
    sayInGuggyBubble(textEl, currentGuggyTip.text);
    bubble.style.display = 'block';
    
    playGuggyVoice(currentGuggyTip.audio);
    clearTimeout(idleAnimationTimer);
    isGuggyActive = true;
    setGuggyImage();

    if(typeof playSound === 'function') playSound('notify-audio');
    clearTimeout(guggyHideTimer);
    clearTimeout(guggyIdleTimer);

    if (currentGuggyTip.type === 'question') {
        buttonsEl.style.display = 'flex';
        guggyHideTimer = setTimeout(() => closeGuggyBubble(), 15000); 
    } else {
        buttonsEl.style.display = 'none';
        guggyHideTimer = setTimeout(() => closeGuggyBubble(), 7000);
    }
}

function handleGuggyResponse(response) {
    const textEl = document.getElementById('guggy-text');
    const buttonsEl = document.getElementById('guggy-buttons');
    
    if (currentGuggyTip && currentGuggyTip.type === 'question') {
        sayInGuggyBubble(textEl, response === 'yes' ? currentGuggyTip.yes : currentGuggyTip.no);
        const responseAudio = response === 'yes' ? currentGuggyTip.audioYes : currentGuggyTip.audioNo;
        playGuggyVoice(responseAudio);

        setGuggyImage();
        
        // trigger actions and flip the achievement flags
        if (response === 'yes') {
            if (currentGuggyTip.actionYes) currentGuggyTip.actionYes();
            agreedWithGuggy = true; 
        }
        if (response === 'no') {
            if (currentGuggyTip.actionNo) currentGuggyTip.actionNo();
            disagreedWithGuggy = true; 
        }
        
        // force game to evaluate achievements right as the button is clicked
        checkAchievements();
        
        buttonsEl.style.display = 'none';
        clearTimeout(guggyHideTimer);
        guggyHideTimer = setTimeout(() => closeGuggyBubble(), 5200);
    }
}

function closeGuggyBubble() {
    document.getElementById('guggy-bubble').style.display = 'none';
    isGuggyActive = false;
    playIdleAnimations();
    scheduleNextGuggyTip();
}

function triggerGuggy() {
    if (isDraggingGuggy) return;
    if (isGuggyActive) return; 
    if(typeof playSound === 'function') playSound('corg-audio');
    showGuggyTip();
}

function scheduleNextGuggyTip() {
    clearTimeout(guggyIdleTimer);
    const randomDelay = Math.floor(Math.random() * 20000) + 25000;
    guggyIdleTimer = setTimeout(() => {
        (typeof isPaused !== 'undefined' && isPaused) ? scheduleNextGuggyTip() : showGuggyTip();
    }, randomDelay);
}


let currentOS = 'win95';

// CORGOS 11 used to arrive by Corg asking a yes/no question and then running a
// fake upgrade installer over the desktop. That's gone: the boot manager lists
// every OS, so picking 11 there is how you get 11, and setOSTheme below is what
// flags "The Future of CORG" once you've actually booted into it.

// Every OS look is a theme of this same desktop: a body class that restyles
// the existing windows/taskbar/buttons, plus a couple of swapped icons.
const OS_THEMES = {
    win95: {
        bodyClass: '', startIcon: 'images/win95icon.png', trashIcon: 'images/trashcan.png',
        explorerIcon: 'images/explorer95.svg',
        settingsIcon: 'images/controlpanel95.svg', settingsLabel: 'Control Panel',
        shutdownIcon: 'images/osicons/shutdown-win95.svg',
        bootLogo: 'images/corg.png',
        bootSound: 'sfx/win95.mp3', shutdownSound: null, logonSound: null,
    },
    win11: {
        bodyClass: 'win11-theme', startIcon: 'images/win11/win11_logo.svg', trashIcon: 'images/win11/bin0.png',
        explorerIcon: 'images/win11/win11browser.png',
        settingsIcon: 'images/win11/settings.png', settingsLabel: 'Settings',
        shutdownIcon: 'images/osicons/power-win11.svg',
        bootLogo: 'images/corg.png',
        // 'Windows Startup.wav' / 'Windows Logon.wav' / 'Windows Shutdown.wav'
        // in the Media folder are Vista/7-era leftovers Microsoft still ships
        // for legacy events — playing them is why 11 sounded like 7. The real
        // 11 boot jingle is the .m4a at the root of the pack, and modern
        // Windows uses the short Unlock chime at sign-in.
        bootSound: 'sfx/Windows11_sounds_b22000/Windows Startup Sound.m4a',
        shutdownSound: null,
        logonSound: 'sfx/Windows11_sounds_b22000/sounds/Windows Unlock.wav',
    },
    winxp: {
        bodyClass: 'winxp-theme', startIcon: 'images/winxp/start.png',
        trashIcon: 'images/winxp/Recycle_Bin_Windows_XP_full.PNG.webp',
        explorerIcon: 'images/winxp/winxpexplorer.webp',
        settingsIcon: 'images/winxp/controlpanelxp.webp', settingsLabel: 'Control Panel',
        shutdownIcon: 'images/osicons/shutdown-winxp.svg',
        bootLogo: 'images/corg.png',
        // XP's boot splash is silent on real hardware — the startup jingle is a
        // *logon* sound, and it fires once you're actually signed in, over the
        // "Welcome" screen. Playing it at the splash as well meant hearing it
        // twice, so bootSound is deliberately null here.
        bootSound: null,
        shutdownSound: 'sfx/winxp/winxpshutdown.mp3',
        logonSound: 'sfx/winxp/windows-xp-startup.mp3',
    },
    // 10 has no startup, logon or shutdown sound, and that is not an
    // oversight: Microsoft switched the boot jingle off in 8 and never
    // switched it back on. Booting CORGOS 10 is silent on purpose.
    win10: {
        bodyClass: 'win10-theme', startIcon: 'images/win10/start.svg',
        trashIcon: 'images/win11/bin0.png',
        explorerIcon: 'images/win11/win11browser.png',
        settingsIcon: 'images/win11/settings.png', settingsLabel: 'Settings',
        shutdownIcon: 'images/osicons/power-win11.svg',
        bootLogo: 'images/corg.png',
        bootSound: null, shutdownSound: null, logonSound: null,
    },
    // CORGOS COPILOT: 11, with every app replaced by the assistant. It
    // wears 11's own class as well as its own, which is why bodyClass is
    // a list here — everything 11 styles, this styles too, and
    // `.corgpilot-theme` only adds the parts that are the joke.
    corgpilotos: {
        bodyClass: 'win11-theme corgpilot-theme',
        startIcon: 'images/corgpilot.png', trashIcon: 'images/corgpilot.png',
        explorerIcon: 'images/corgpilot.png',
        settingsIcon: 'images/corgpilot.png', settingsLabel: 'Corgpilot',
        shutdownIcon: 'images/corgpilot.png',
        bootLogo: 'images/corgpilot.png',
        bootSound: 'sfx/Windows11_sounds_b22000/Windows Startup Sound.m4a',
        shutdownSound: null,
        logonSound: 'sfx/Windows11_sounds_b22000/sounds/Windows Unlock.wav',
    },
    win7: {
        bodyClass: 'win7-theme', startIcon: 'images/win7/orb.png',
        trashIcon: 'images/win7/Recycle_Bin_Windows_Vista_full.webp',
        explorerIcon: 'images/win7/win7explorer.svg',
        settingsIcon: 'images/win7/Control_Panel_7.webp', settingsLabel: 'Control Panel',
        shutdownIcon: 'images/osicons/shutdown-win7.svg',
        bootLogo: 'images/corg.png',
        bootSound: 'sfx/win7/windows-7-startup.mp3',
        shutdownSound: 'sfx/win7/shutdown.mp3',
        logonSound: 'sfx/win7/startup.mp3',
    },
};

function setOSTheme(theme) {
    currentOS = OS_THEMES[theme] ? theme : 'win95';
    const cfg = OS_THEMES[currentOS];

    // "The Future of CORG" is earned by running CORGOS 11, which now means
    // booting it from the boot manager rather than saying yes to Corg.
    if (currentOS === 'win11' && !gugOS11Unlocked) {
        gugOS11Unlocked = true;
        if (typeof saveGame === 'function') saveGame();
        if (typeof checkAchievements === 'function') checkAchievements();
    }

    // Split, because CORGOS COPILOT wears two classes: 11's, so it looks
    // like 11, and its own, for the parts that are the joke.
    Object.values(OS_THEMES).forEach((t) => {
        (t.bodyClass || '').split(' ').filter(Boolean)
            .forEach((cls) => document.body.classList.remove(cls));
    });
    (cfg.bodyClass || '').split(' ').filter(Boolean)
        .forEach((cls) => document.body.classList.add(cls));

    applyCorgpilotOS(currentOS === 'corgpilotos');

    const startImg = document.querySelector('#start-button img');
    if (startImg) startImg.src = cfg.startIcon;

    // Both bins (the one in CORG_Clicker and the desktop one) follow the theme.
    document.querySelectorAll('.trash-icon').forEach((img) => { img.src = cfg.trashIcon; });

    // Corg Explorer wears that era's browser icon; Settings is "Control Panel"
    // with a control-panel icon everywhere except 11.
    document.querySelectorAll('.explorer-icon').forEach((img) => { img.src = cfg.explorerIcon; });
    document.querySelectorAll('.settings-icon').forEach((img) => { img.src = cfg.settingsIcon; });
    document.querySelectorAll('.settings-label').forEach((el) => { el.textContent = cfg.settingsLabel; });

    // The 95/XP/7 start menu is shared markup, so its Shut Down icon was stuck
    // on the win95 flag under every theme.
    const shutdownImg = document.getElementById('start-shutdown-icon');
    if (shutdownImg) shutdownImg.src = cfg.shutdownIcon;

    // shared start-menu banner: a vertical "Windows 95" spine on 95, XP's
    // horizontal user header on XP (hidden entirely on 7 and 11)
    const bannerText = document.getElementById('start-banner-text');
    if (bannerText) bannerText.textContent = currentOS === 'winxp' ? 'Corg User' : 'Windows 95';

    saveGame();
}

// ---------------------------------------------------------------------------
// CORGOS COPILOT
//
// 11, except every app is the assistant. Modern Windows keeps finding new
// places to put Copilot — the taskbar, the Start menu, Notepad, Paint, the
// context menu, Settings — so this theme takes that to its conclusion: there
// is one app, it is on every icon, and whatever you launch, you get it.
//
// Two halves, both reversible, because switching OS re-themes the live desktop
// rather than reloading the page:
//
//   - the paint: every launcher's icon becomes the Corgpilot mark and every
//     label becomes "Corgpilot". The original src/text is stashed in a data-
//     attribute the first time, so leaving the theme puts them all back.
//   - the wiring: one capture-phase click handler that swallows launcher
//     clicks and opens Corgpilot instead. Capture, and before the inline
//     onclick can run, which is what makes it work without touching the two
//     dozen toggle* functions individually.
// ---------------------------------------------------------------------------
const CORGPILOT_OS_ICON = 'images/corgpilot.png';
const CORGPILOT_OS_NAME = 'Corgpilot';

// Everything that launches something. The Start button is deliberately absent:
// the menu still opens, it is just full of Corgpilot.
const CORGPILOT_OS_LAUNCHERS = '.desktop-icon, .win11-app-item, .win95-program-item, .task-btn';

let corgpilotOSOn = false;
let corgpilotOSHandler = null;

function applyCorgpilotOS(on) {
    if (on === corgpilotOSOn) return;
    corgpilotOSOn = on;

    document.querySelectorAll(CORGPILOT_OS_LAUNCHERS).forEach((el) => {
        // The shutdown item is not an app, and neither is the tray clock.
        if (el.classList.contains('win95-shutdown-item')) return;
        corgpilotOSPaint(el, on);
    });

    if (on && !corgpilotOSHandler) {
        corgpilotOSHandler = (e) => {
            const launcher = e.target.closest(CORGPILOT_OS_LAUNCHERS);
            if (!launcher || launcher.classList.contains('win95-shutdown-item')) return;
            e.preventDefault();
            e.stopPropagation();
            // A launcher in the Start menu still closes the menu behind it,
            // the way it would if it had launched what it says it launches.
            ['win11-start-menu', 'win95-start-menu'].forEach((id) => {
                const menu = document.getElementById(id);
                if (menu && menu.style.display !== 'none' && typeof hideStartMenu === 'function') hideStartMenu(menu);
            });
            openCorgpilotOSApp();
        };
        document.addEventListener('click', corgpilotOSHandler, true);
    } else if (!on && corgpilotOSHandler) {
        document.removeEventListener('click', corgpilotOSHandler, true);
        corgpilotOSHandler = null;
    }
}

// Repaint one launcher, or put it back. `data-corg-was-*` is written once and
// never overwritten, so a second pass can't stash the Corgpilot mark as the
// thing to restore.
function corgpilotOSPaint(el, on) {
    const img = el.querySelector(':scope > img, img');
    const span = el.querySelector('span');

    if (on) {
        if (img && !img.dataset.corgWasSrc) {
            img.dataset.corgWasSrc = img.getAttribute('src') || '';
            img.src = CORGPILOT_OS_ICON;
        }
        if (span) {
            if (span.dataset.corgWasText === undefined) {
                span.dataset.corgWasText = span.textContent;
            }
            span.textContent = CORGPILOT_OS_NAME;
        } else {
            if (el.dataset.corgWasHtml === undefined) {
                el.dataset.corgWasHtml = el.innerHTML;
            }
            if (img) {
                el.innerHTML = '';
                el.appendChild(img);
                el.appendChild(document.createTextNode(' ' + CORGPILOT_OS_NAME));
            }
        }
        return;
    }

    if (img && img.dataset.corgWasSrc) {
        img.src = img.dataset.corgWasSrc;
        delete img.dataset.corgWasSrc;
    }
    if (span && span.dataset.corgWasText !== undefined) {
        span.textContent = span.dataset.corgWasText;
        delete span.dataset.corgWasText;
        corgifyTextNodes(span);
    } else if (el.dataset.corgWasHtml !== undefined) {
        el.innerHTML = el.dataset.corgWasHtml;
        delete el.dataset.corgWasHtml;
        corgifyTextNodes(el);
    }
}

// The first text node with anything in it — that's a taskbar button's name.
function corgpilotOSTextNode(el) {
    for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) return node;
    }
    return null;
}

// Every icon opens it, so clicking a second icon must not close it — this is
// open-or-focus, not the toggle the launchers normally get.
function openCorgpilotOSApp() {
    const screen = document.getElementById('corgpilot-screen');
    if (!screen) return;
    if (screen.style.display === 'flex') {
        if (typeof playSound === 'function') playSound('upgrade-audio');
        const input = document.getElementById('corgpilot-input');
        if (input) input.focus();
        return;
    }
    if (typeof toggleCorgpilot === 'function') toggleCorgpilot();
}

// ---------------------------------------------------------------------------
// Installed games
//
// There is no Steam any more. Each of these is an app in its own right: it has
// its own icon and its own window, and clicking it launches the game with
// nothing in between. They all share one window shell (#gameapp-screen)
// because they're all the same thing — an iframe with a titlebar — and the
// titlebar wears the launched game's identity.
//
// Half-Life, the local WebXash build under halflife/, is the only one left:
// the hosted Half-Life 2, Portal and Portal 2 builds this shell also launched
// were taken down by Valve, so they're gone rather than left as dead links.
// ---------------------------------------------------------------------------
const GAME_APPS = [
    {
        id: 'hl1',
        title: 'Half-Life',
        icon: 'images/halflife.png',
        src: 'halflife/index.html',
    },
];

// Which game the shell is currently showing, so a second click on the same
// app's icon closes it (and a click on a different one swaps the game).
let openGameAppId = null;

function openGameApp(id) {
    const game = GAME_APPS.find(g => g.id === id);
    if (!game) return;

    const screen = document.getElementById('gameapp-screen');
    const iframe = document.getElementById('gameapp-iframe');
    if (!screen || !iframe) return;

    isPaused = true;
    document.getElementById('gameapp-title').textContent = game.title;
    document.getElementById('gameapp-icon').src = game.icon;

    // Only reload the iframe when the game actually changes: re-setting src to
    // what it already is restarts an in-progress game.
    if (openGameAppId !== game.id) {
        iframe.src = game.src;
        setWindowLoading(screen.querySelector('.gameapp-window'), iframe);
    }
    openGameAppId = game.id;

    screen.style.display = 'flex';
    playSound('window-open-audio');
}

function closeGameApp() {
    const screen = document.getElementById('gameapp-screen');
    const iframe = document.getElementById('gameapp-iframe');
    if (iframe) iframe.src = '';
    if (screen) screen.style.display = 'none';
    openGameAppId = null;
    isPaused = false;
}

// Half-Life's own launcher: the desktop icon, the taskbar button and both
// start menus all come through here.
function toggleHalfLife() {
    const screen = document.getElementById('gameapp-screen');
    const showing = screen && screen.style.display === 'flex';
    if (showing && openGameAppId === 'hl1') { closeGameApp(); return; }
    openGameApp('hl1');
}

// There's no in-place "switch OS" any more — shut down from the Start menu and
// pick a different OS in the boot menu.

// 11's Start menu rises out of the taskbar and drops back into it — it does not
// blink in and out of existence. The keyframes are in style.css, and the menu
// deliberately sits *below* the taskbar's z-index so it really is coming out
// from behind it. The falling half has to hold the menu on screen for the
// length of its animation, which is what hideStartMenu() is for; every other
// theme's menu never animated and just goes.
//
// Must match win11SlideDown's duration in style.css.
const WIN11_MENU_CLOSE_MS = 180;

// Which themes are built on 11's shell: 11 itself, and CORGOS COPILOT, which
// is 11 with the assistant in every socket.
function isWin11Shell() {
    return currentOS === 'win11' || currentOS === 'corgpilotos';
}

function startMenuPrefersNoMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// A menu on its way out doesn't count as open — clicking Start during the
// close reopens it rather than toggling it closed a second time.
function startMenuIsOpen(menu) {
    if (!menu || menu.classList.contains('closing')) return false;
    return menu.style.display === 'block' || menu.style.display === 'flex';
}

function hideStartMenu(menu) {
    if (!menu || menu.style.display === 'none' || menu.style.display === '') return;

    if (menu.id !== 'win11-start-menu' || startMenuPrefersNoMotion()) {
        menu.style.display = 'none';
        return;
    }
    if (menu.classList.contains('closing')) return;

    menu.classList.add('closing');
    const done = () => {
        menu.removeEventListener('animationend', done);
        if (menu.startMenuCloseTimer) { clearTimeout(menu.startMenuCloseTimer); menu.startMenuCloseTimer = null; }
        menu.classList.remove('closing');
        menu.style.display = 'none';
    };
    menu.addEventListener('animationend', done);
    // The timer is the backstop, not the mechanism: animationend is what
    // normally ends this, but it never fires if the animation is dropped.
    menu.startMenuCloseTimer = setTimeout(done, WIN11_MENU_CLOSE_MS + 80);
}

function showStartMenu(menu, display) {
    if (!menu) return;
    if (menu.startMenuCloseTimer) { clearTimeout(menu.startMenuCloseTimer); menu.startMenuCloseTimer = null; }
    menu.classList.remove('closing');
    // Hide, reflow, show: the open animation is on the element itself, so
    // without forcing a restart a menu reopened mid-close snaps back with no
    // rise at all.
    menu.style.display = 'none';
    void menu.offsetHeight;
    menu.style.display = display;
}

function toggleStartMenu() {
    const win11Menu = document.getElementById('win11-start-menu');
    const win95Menu = document.getElementById('win95-start-menu');
    // CORGOS COPILOT is 11 underneath, so it gets 11's menu: picking by
    // `currentOS === 'win11'` alone opened the 95 menu on an 11 desktop.
    const activeMenu = isWin11Shell() ? win11Menu : win95Menu;
    const otherMenu = isWin11Shell() ? win95Menu : win11Menu;
    if (!activeMenu) return;

    if (otherMenu) otherMenu.style.display = 'none';

    if (startMenuIsOpen(activeMenu)) {
        hideStartMenu(activeMenu);
    } else {
        showStartMenu(activeMenu, isWin11Shell() ? 'block' : 'flex');
        if (typeof playSound === 'function') playSound('window-open-audio');
    }
}

document.addEventListener('click', (e) => {
    const startBtn = document.getElementById('start-button');
    ['win11-start-menu', 'win95-start-menu'].forEach(id => {
        const menu = document.getElementById(id);
        if (startMenuIsOpen(menu)) {
            if (!menu.contains(e.target) && !startBtn.contains(e.target)) {
                hideStartMenu(menu);
            }
        }
    });
});

function toggleGugClickerWindow() {
    const win = document.getElementById('gugclicker-window');
    if (!win) return;
    const isClosed = win.style.display === 'none';
    win.style.display = isClosed ? 'flex' : 'none';
    if (!isClosed) {
        // Black Market lives inside CORG_Clicker, not as its own app — closing
        // CORG_Clicker closes it too instead of leaving it floating on its own.
        const shopWrapper = document.getElementById('shop-overlay-wrapper');
        if (shopWrapper) {
            shopWrapper.style.display = 'none';
            shopWrapper.classList.remove('mobile-open');
        }
    }
}

function toggleGugExplorer() {
    const screen = document.getElementById('gugexplorer-screen');
    const iframe = document.getElementById('gugexplorer-iframe');
    if (!screen) return;
    if (screen.style.display === 'flex') {
        screen.style.display = 'none';
        isPaused = false;
    } else {
        isPaused = true;
        if (iframe && !iframe.getAttribute('src')) {
            gugExplorerLoad('https://www.google.com');
        }
        screen.style.display = 'flex';
        if (typeof playSound === 'function') playSound('window-open-audio');
    }
}

// Routes navigation through our own server's /gugexplorer-proxy endpoint
// instead of loading the URL directly into the iframe. Most sites block being
// framed directly (X-Frame-Options / CSP frame-ancestors) — the proxy fetches
// the page server-side and re-serves it from our own origin, where that block
// doesn't apply. Every host that can run server-side code needs its own copy
// of it: server.js locally, netlify/functions/gugexplorer-proxy.mjs on
// Netlify, _worker.js on Cloudflare Pages. GitHub Pages serves static files
// only, so it has no copy and never will — gugExplorerCheckProxy() below
// detects that and shows an explanation instead of a raw 404.
function gugExplorerLoad(url) {
    const iframe = document.getElementById('gugexplorer-iframe');
    const input = document.getElementById('gugexplorer-url');
    if (!iframe) return;
    if (input) input.value = url;
    iframe.src = `/gugexplorer-proxy?url=${encodeURIComponent(url)}`;
    setWindowLoading(iframe.closest('.movable-resizable'), iframe);
    gugExplorerCheckProxy();
}

// Whether the host we're served from actually has the proxy: null until the
// first check, then true/false. A host without it answers the proxy path with
// its own 404 page, which lands in the iframe looking like the site itself is
// broken — this turns that into an explanation.
let gugExplorerProxyOk = null;

function gugExplorerCheckProxy() {
    if (gugExplorerProxyOk !== null) return;
    gugExplorerProxyOk = 'checking';

    // With no ?url= the proxy answers 400 "Missing url parameter" — cheap,
    // since it never fetches anything upstream. Any 404 means the path isn't
    // wired up on this host at all.
    fetch('/gugexplorer-proxy', { method: 'GET' })
        .then((res) => {
            gugExplorerProxyOk = res.status !== 404;
            if (!gugExplorerProxyOk) gugExplorerShowNoProxy();
        })
        .catch(() => { gugExplorerProxyOk = null; });
}

function gugExplorerShowNoProxy() {
    const iframe = document.getElementById('gugexplorer-iframe');
    if (!iframe) return;
    iframe.removeAttribute('src');
    iframe.srcdoc = `<!doctype html><html><body style="font-family: Tahoma, 'MS Sans Serif', Arial, sans-serif; background:#c0c0c0; padding:30px; margin:0;">
        <h2 style="color:#000080;">Corg Explorer is offline on this host</h2>
        <p>Pages load through <strong>/gugexplorer-proxy</strong>, and this deploy doesn't have it.</p>
        <p style="color:#800000;">Netlify needs the deploy to build <code>netlify/functions/</code>
        (<code>netlify deploy --prod</code> or a connected Git repo — a drag-and-drop upload skips it).
        Cloudflare Pages needs <code>_worker.js</code> in the deployed folder.
        GitHub Pages can't run either kind of function at all, so this feature is permanently
        unavailable there &mdash; everything else on this site still works.</p>
    </body></html>`;
}

function gugExplorerNavigate() {
    const input = document.getElementById('gugexplorer-url');
    if (!input) return;
    let url = input.value.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    gugExplorerLoad(url);
    if (typeof playSound === 'function') playSound('upgrade-audio');
}

function gugExplorerHome() {
    gugExplorerLoad('https://www.google.com');
    if (typeof playSound === 'function') playSound('upgrade-audio');
}

// The proxied page posts its real URL up so the address bar reflects
// in-page navigation (clicking links, submitting forms) that happens
// inside the iframe without us driving it directly.
window.addEventListener('message', (e) => {
    if (e.data && typeof e.data.gugExplorerUrl === 'string') {
        const input = document.getElementById('gugexplorer-url');
        if (input) input.value = e.data.gugExplorerUrl;
    }
});

function devConsoleSubmit() {
    const input = document.getElementById('dev-console-input');
    const log = document.getElementById('dev-console-log');
    if (!input || !log) return;
    const cmd = input.value.trim();
    input.value = '';
    if (!cmd) return;
    playSound('upgrade-audio');

    let response;
    const setGugMatch = cmd.match(/^set_gug\s+(-?\d+(?:\.\d+)?)$/i);
    // No dev-mode gate on this one: it's a physics knob, not a cheat.
    const bouncenessMatch = cmd.match(/^corg_bounceness(?:\s+(\d+(?:\.\d+)?))?$/i);
    if (/^dev\s+1$/i.test(cmd)) {
        devModeEnabled = true;
        saveGame();
        response = 'Developer mode enabled.';
    } else if (/^dev\s+0$/i.test(cmd)) {
        devModeEnabled = false;
        saveGame();
        response = 'Developer mode disabled.';
    } else if (setGugMatch) {
        if (!devModeEnabled) {
            response = 'Developer mode is off. Run "dev 1" first.';
        } else {
            let amount = parseFloat(setGugMatch[1]);
            if (isNaN(amount) || amount < 0) amount = 0;
            score = amount;
            updateUI();
            checkAchievements();
            saveGame();
            response = `CORGs hoarded set to ${Math.floor(amount)}.`;
        }
    } else if (bouncenessMatch) {
        if (bouncenessMatch[1] === undefined) {
            response = `corg_bounceness is ${corgBounceness}. Usage: corg_bounceness <0-5>`
                + (devModeEnabled ? ' (dev mode: no upper limit).' : '.');
        } else {
            const asked = Math.max(0, parseFloat(bouncenessMatch[1]));
            // Dev mode takes you at your word; without it, 5 is the ceiling.
            corgBounceness = devModeEnabled ? asked : Math.min(5, asked);
            saveGame();

            if (corgBounceness === 0) response = 'corg_bounceness set to 0. Corg no longer bounces.';
            else if (corgBounceness !== asked) response = `corg_bounceness clamped to ${corgBounceness}. Run "dev 1" to go higher.`;
            else if (corgBounceness * 0.5 >= 1) response = `corg_bounceness set to ${corgBounceness}. Corg will never stop bouncing.`;
            else response = `corg_bounceness set to ${corgBounceness}.`;
        }
    } else {
        response = `Unknown command "${cmd}". Try: dev 1, dev 0, set_gug <amount>, corg_bounceness <0-5>`;
    }

    log.append(`\n] ${cmd}\n${response}`);
    log.scrollTop = log.scrollHeight;
}

// ---------------------------------------------------------------------------
// Corg: dragging, throwing and physics
//
// There can be any number of Corgs on the desktop (corg.exe on the desktop
// spawns more), so every bit of state lives on the element in `el._corg`
// rather than in globals, and every function here takes the container it is
// acting on. `#guggy-container` is just the first one — the one that owns the
// speech bubble and the tips.
//
// Corg tracks the pointer absolutely rather than by accumulated deltas. That
// matters at the bins: the forcefield shoves Corg out from under the cursor,
// and with delta dragging that offset was permanent — you'd end up waving a
// fistful of air around. Recomputing the position from the live pointer every
// frame means Corg snaps back under the cursor the moment it leaves the field.
// ---------------------------------------------------------------------------
function allCorgs() {
    return Array.from(document.querySelectorAll('.guggy-container'));
}

function corgState(container) {
    if (!container._corg) container._corg = { vx: 0, vy: 0, frame: null };
    return container._corg;
}

// Ad Smasher's Kevbo mode: Corg can be flung but not carried. The rule lives
// here rather than in adsmasher.js because only the drag closure below can end
// a drag that's already running — a hold expires by calling its own
// closeDragElement() off a timer, which releases Corg with whatever the pointer
// was doing at that instant, exactly as letting go would have. Both are 0
// (off) outside a Kevbo round, and setCorgHoldLimits() is what turns them on.
let corgHoldLimitMs = 0;    // how long a grab may last before Corg slips free
let corgRegrabDelayMs = 0;  // and how long before they can be picked up again

function setCorgHoldLimits(holdMs, regrabMs) {
    corgHoldLimitMs = holdMs || 0;
    corgRegrabDelayMs = regrabMs || 0;

    // Switching the mode off mid-round has to clear whatever a half-finished
    // grab left behind, or a Corg stays greyed out and untouchable forever.
    if (!corgHoldLimitMs) {
        document.querySelectorAll('.guggy-container.corg-slipping')
            .forEach((el) => el.classList.remove('corg-slipping'));
    }
    if (!corgRegrabDelayMs) {
        document.querySelectorAll('.guggy-container').forEach((el) => {
            el.classList.remove('corg-spent');
            el._regrabAt = 0;
        });
    }
}

function makeGuggyDraggable(guggyContainer) {
    if (!guggyContainer || guggyContainer._dragWired) return;
    guggyContainer._dragWired = true;

    let grabX = 0, grabY = 0;
    let startX = 0, startY = 0;
    // Rolling pointer velocity, so letting go actually throws Corg.
    let lastMoveX = 0, lastMoveY = 0, lastMoveAt = 0, throwVX = 0, throwVY = 0;
    let holdTimer = null;

    guggyContainer.onmousedown = dragStart;
    guggyContainer.ontouchstart = dragStart;
    // The browser's own image drag-and-drop eats the mouseup that ends our
    // drag, which leaves Corg stuck to the cursor. CSS -webkit-user-drag stops
    // it too, but this doesn't depend on a stylesheet rule matching.
    guggyContainer.ondragstart = () => false;

    const guggyGroup = guggyContainer.querySelector('.guggy-icon-group');

    // Corg stops at the top of the screen whether thrown or dragged — the
    // pointer can keep going, Corg just doesn't follow it up there.
    function clampGuggyToCeiling() {
        if (!guggyGroup) return;
        const top = guggyGroup.getBoundingClientRect().top;
        if (top < 0) guggyContainer.style.top = (guggyContainer.offsetTop - top) + 'px';
    }

    function parentOrigin() {
        const p = guggyContainer.offsetParent;
        return p ? p.getBoundingClientRect() : { left: 0, top: 0 };
    }

    function dragStart(e) {
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;
        e = e || window.event;
        if (e.type === 'mousedown' && e.button !== 0) return; // right-click opens the menu instead

        // Kevbo mode again: Corg has just been thrown and isn't available to
        // be grabbed straight back out of the air.
        if (guggyContainer._regrabAt && performance.now() < guggyContainer._regrabAt) return;

        cancelGuggyFall(guggyContainer);
        hideCorgMenu();

        const rect = guggyContainer.getBoundingClientRect();
        const parentRect = parentOrigin();

        guggyContainer.style.left = (rect.left - parentRect.left) + "px";
        guggyContainer.style.top = (rect.top - parentRect.top) + "px";
        guggyContainer.style.bottom = "auto";
        guggyContainer.style.right = "auto";

        const pointer = e.type === 'touchstart' ? e.touches[0] : e;
        startX = pointer.clientX;
        startY = pointer.clientY;

        // Where inside Corg the grab landed — held constant so Corg doesn't
        // jump to centre under the cursor when the drag starts.
        grabX = pointer.clientX - rect.left;
        grabY = pointer.clientY - rect.top;

        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        document.ontouchend = closeDragElement;
        document.ontouchmove = elementDrag;

        guggyContainer.style.zIndex = 1000;
        guggyContainer.classList.add('dragging');

        lastMoveX = pointer.clientX;
        lastMoveY = pointer.clientY;
        lastMoveAt = performance.now();
        throwVX = 0;
        throwVY = 0;

        // Picking Corg up starts a new throw, so the "panes broken in one go"
        // counter starts over here rather than at launch: a hard swipe can
        // already break ads before the release, and those belong to this throw.
        shatterComboThisFlight = 0;

        // A timed hold. The class drives the wriggle in the stylesheet, which
        // reads its duration off --corg-hold-ms so the animation and the timer
        // are always the same length — the wriggle *is* the countdown.
        if (corgHoldLimitMs > 0) {
            guggyContainer.style.setProperty('--corg-hold-ms', corgHoldLimitMs + 'ms');
            guggyContainer.classList.add('corg-slipping');
            holdTimer = setTimeout(() => {
                holdTimer = null;
                // Only the timer running out is a *drop*. Letting go yourself
                // goes through closeDragElement() too, and that's a throw.
                if (typeof playCorgDropSfx === 'function') playCorgDropSfx();
                closeDragElement();
            }, corgHoldLimitMs);
        }
    }

    function elementDrag(e) {
        e = e || window.event;
        if (e.type === 'touchmove') e.preventDefault();

        const pointer = e.type === 'touchmove' ? e.touches[0] : e;
        const clientX = pointer.clientX;
        const clientY = pointer.clientY;

        if (Math.abs(clientX - startX) > 4 || Math.abs(clientY - startY) > 4) {
            isDraggingGuggy = true;
        }

        const parentRect = parentOrigin();
        guggyContainer.style.left = (clientX - parentRect.left - grabX) + "px";
        guggyContainer.style.top = (clientY - parentRect.top - grabY) + "px";
        clampGuggyToCeiling();

        const now = performance.now();
        const dt = (now - lastMoveAt) / 1000;
        if (dt > 0.004) {
            throwVX = (clientX - lastMoveX) / dt;
            throwVY = (clientY - lastMoveY) / dt;
            lastMoveX = clientX;
            lastMoveY = clientY;
            lastMoveAt = now;
        }

        const field = repelGuggyFromForcefields(guggyContainer);
        // Swiping Corg into a bin knocks them out of the field hard enough to
        // hear, even though the pointer keeps hold of them. Easing them into it
        // gently stays quiet.
        if (field) guggyImpact(guggyContainer, Math.hypot(throwVX, throwVY));

        // Corg shoves ads out of the way while being dragged too — but only
        // when actually swung at one, so parking Corg on an ad doesn't punt it
        // every few frames.
        const swing = Math.hypot(throwVX, throwVY);
        if (swing > 120) collideGuggyWithAds(guggyContainer, swing);
    }

    function closeDragElement(e) {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;

        if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
        guggyContainer.classList.remove('corg-slipping');

        // The cooldown is measured from the release, so a throw that expired on
        // the timer and one you let go of yourself cost the same.
        if (corgRegrabDelayMs > 0) {
            guggyContainer._regrabAt = performance.now() + corgRegrabDelayMs;
            guggyContainer.classList.add('corg-spent');
            clearTimeout(guggyContainer._regrabTimer);
            guggyContainer._regrabTimer = setTimeout(
                () => guggyContainer.classList.remove('corg-spent'), corgRegrabDelayMs);
        }

        guggyContainer.classList.remove('dragging');
        setTimeout(() => { isDraggingGuggy = false; }, 50);

        // Corg is never trashed any more: the bins' forcefields (see
        // repelGuggyFromForcefields) hold them off. One last repel here catches
        // a pointer that outran the per-frame push, then the field snaps off.
        const field = repelGuggyFromForcefields(guggyContainer);
        stopForcefieldHum(true);

        // Throw Corg at a bin and the field punts them back the way they came
        // rather than letting them drop down its side.
        if (field) {
            const into = throwVX * field.nx + throwVY * field.ny;
            if (into < 0) {
                const kick = 1 + corgRestitution(0.8);
                throwVX -= kick * into * field.nx;
                throwVY -= kick * into * field.ny;
            } else {
                throwVX += field.nx * 420;
                throwVY += field.ny * 420;
            }
            guggyImpact(guggyContainer, Math.hypot(throwVX, throwVY) || GUGGY_IMPACT_FULL);
        }

        launchGuggy(guggyContainer, throwVX, throwVY);
    }
}

// ---------------------------------------------------------------------------
// Corg physics
//
// Let go of Corg and gravity takes over: they fly off with whatever throw you
// gave them, tumbling, squashing and bouncing off the floor, the screen edges,
// the bins' forcefields and any ad they hit. Every impact is a "corg".
// ---------------------------------------------------------------------------
const GUGGY_GRAVITY = 2600;      // px/s²
const GUGGY_BOUNCE = 0.5;        // energy kept per bounce
const GUGGY_WALL_BOUNCE = 0.55;
const GUGGY_BOUNCE_FLOOR = 220;  // px/s under which Corg settles instead
const GUGGY_GROUND_FRICTION = 4.0;
const GUGGY_MAX_THROW = 3200;    // px/s, so a violent flick can't fling Corg into next week
// Multiplier on every one of Corg's restitutions, set from the dev console with
// `corg_bounceness <n>`. 0 is a dead thud, 1 is normal, higher is a rubber
// ball.
//
// Normally the effective restitution is capped just under 1, because at 1 or
// above every bounce returns more energy than it took and Corg never comes to
// rest. Under `dev 1` that cap comes off and so does the input range — a
// perpetual-motion Corg is the point of the cheat. The only thing still
// enforced is a speed ceiling, so a runaway can't outrun the frame rate and
// tunnel through the desktop.
const GUGGY_MAX_SPEED = 25000; // px/s

let corgBounceness = 1;

function corgRestitution(base) {
    const bounced = Math.max(0, base * corgBounceness);
    return devModeEnabled ? bounced : Math.min(0.97, bounced);
}

// Corg's resting height comes from CSS (`bottom`, which every theme overrides),
// so measure it by briefly dropping the inline top/bottom and reading where the
// stylesheet would have put them.
function guggyRestingTop(container) {
    const savedTop = container.style.top;
    const savedBottom = container.style.bottom;

    container.style.top = '';
    container.style.bottom = '';

    const p = container.offsetParent;
    const parentTop = p ? p.getBoundingClientRect().top : 0;
    const restingTop = container.getBoundingClientRect().top - parentTop;

    container.style.top = savedTop;
    container.style.bottom = savedBottom;
    return restingTop;
}

function cancelGuggyFall(container) {
    if (!container) return;
    const state = corgState(container);
    if (state.frame !== null) {
        cancelAnimationFrame(state.frame);
        state.frame = null;
    }
    container.classList.remove('falling');
}

// `strength` (0-1) drives the --squash custom property the keyframes scale
// against, so a light tap is a barely-there wobble and a hard landing is a
// full pancake.
function squashGuggy(container, strength) {
    const img = container.querySelector('.corg-img');
    if (!img) return;
    img.style.setProperty('--squash', Math.max(0, Math.min(1, strength)).toFixed(3));
    img.classList.remove('squash');
    void img.offsetWidth; // restart the animation on a re-bounce
    img.classList.add('squash');
}

// One impact, scaled by how hard Corg actually hit. A 1mm drop shouldn't
// pancake them or make a sound at all, so anything below walking pace is
// ignored outright and everything above ramps up to a full squash.
const GUGGY_IMPACT_MIN = 260;   // px/s — below this, nothing happened
const GUGGY_IMPACT_FULL = 1900; // px/s — full squash and full volume

function guggyImpact(container, speed) {
    const strength = (Math.abs(speed) - GUGGY_IMPACT_MIN) / (GUGGY_IMPACT_FULL - GUGGY_IMPACT_MIN);
    if (strength <= 0) return;

    squashGuggy(container, Math.min(1, strength));
    if (typeof playCorgBounceSfx === 'function') playCorgBounceSfx(Math.min(1, strength));
}

// Reflects Corg off a surface with normal (nx, ny) — used for both the bins'
// forcefields and ads. Only bounces when Corg is actually moving into the
// surface, so resting against one doesn't rattle.
function bounceGuggyOff(container, nx, ny, restitution) {
    const state = corgState(container);
    const into = state.vx * nx + state.vy * ny;
    if (into > -40) return false;

    state.vx -= (1 + restitution) * into * nx;
    state.vy -= (1 + restitution) * into * ny;
    guggyImpact(container, into);
    return true;
}

function launchGuggy(container, vx, vy) {
    if (!container || !container.isConnected) return;

    cancelGuggyFall(container);

    const state = corgState(container);
    state.vx = Math.max(-GUGGY_MAX_THROW, Math.min(GUGGY_MAX_THROW, vx || 0));
    state.vy = Math.max(-GUGGY_MAX_THROW, Math.min(GUGGY_MAX_THROW, vy || 0));

    const group = container.querySelector('.guggy-icon-group');
    let x = container.offsetLeft;
    let y = container.offsetTop;
    let stalledFrames = 0;
    let last = performance.now();

    const floor = guggyRestingTop(container);
    // Already parked with nothing to do? Don't spin up a loop for it.
    if (y >= floor - 1 && Math.abs(state.vx) < 30 && Math.abs(state.vy) < 30) return;

    container.classList.add('falling');

    const step = (now) => {
        if (!container.isConnected) { state.frame = null; return; }

        const beforeX = x, beforeY = y;

        // Clamped so an alt-tabbed tab doesn't resume with Corg teleporting
        // through the floor.
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;

        state.vy += GUGGY_GRAVITY * dt;
        state.vx = Math.max(-GUGGY_MAX_SPEED, Math.min(GUGGY_MAX_SPEED, state.vx));
        state.vy = Math.max(-GUGGY_MAX_SPEED, Math.min(GUGGY_MAX_SPEED, state.vy));
        x += state.vx * dt;
        y += state.vy * dt;

        // Screen edges, measured from Corg's own box rather than the container,
        // which is as wide as the speech bubble and taller than Corg by however
        // much of it sits above their head.
        const g = group.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const insetX = g.left - containerRect.left;
        const insetY = g.top - containerRect.top;
        const minX = -insetX;
        const maxX = window.innerWidth - g.width - insetX;
        const minY = -insetY;
        if (x < minX || x > maxX) {
            x = x < minX ? minX : maxX;
            // Below walking pace it's Corg leaning on the edge, not hitting it
            // — don't bounce or bark on every frame of that.
            if (Math.abs(state.vx) > 150) { guggyImpact(container, state.vx); state.vx = -state.vx * corgRestitution(GUGGY_WALL_BOUNCE); }
            else state.vx = 0;
        }

        // Ceiling. Throw Corg at it and they bonk off it instead of sailing off
        // the top of the screen.
        if (y < minY) {
            y = minY;
            if (Math.abs(state.vy) > 150) { guggyImpact(container, state.vy); state.vy = -state.vy * corgRestitution(GUGGY_BOUNCE); }
            else state.vy = 0;
        }

        let landed = false;
        if (y >= floor) {
            y = floor;

            if (Math.abs(state.vy) < GUGGY_BOUNCE_FLOOR) {
                state.vy = 0;
                landed = true;
            } else {
                guggyImpact(container, state.vy);
                state.vy = -state.vy * corgRestitution(GUGGY_BOUNCE);
            }
            state.vx *= Math.exp(-GUGGY_GROUND_FRICTION * dt);
        }

        container.style.left = x + 'px';
        container.style.top = y + 'px';
        // Tumble for as long as Corg is off the ground, not just until the
        // first landing — mid-flight after a bounce still counts as flying.
        container.classList.toggle('falling', y < floor - 1);

        // A bin can sit right where Corg is landing, so the field keeps working
        // mid-flight — and a thrown Corg bounces straight back off it.
        const field = repelGuggyFromForcefields(container);
        if (field) bounceGuggyOff(container, field.nx, field.ny, corgRestitution(0.8));

        const ad = collideGuggyWithAds(container, Math.hypot(state.vx, state.vy));
        if (ad) bounceGuggyOff(container, ad.nx, ad.ny, corgRestitution(0.35));

        // The forcefield may have moved Corg; carry on from where it put them.
        x = container.offsetLeft;
        y = container.offsetTop;

        if (landed && Math.abs(state.vx) < 20) {
            container.classList.remove('falling');
            state.vx = 0;
            state.frame = null;
            return;
        }

        // Corg can come to rest balanced on top of an orb, where gravity and
        // the field cancel out and the floor is never reached. Call it landed
        // once nothing is moving any more.
        stalledFrames = (Math.abs(x - beforeX) < 0.4 && Math.abs(y - beforeY) < 0.4) ? stalledFrames + 1 : 0;
        if (stalledFrames > 12) {
            container.classList.remove('falling');
            state.frame = null;
            return;
        }

        state.frame = requestAnimationFrame(step);
    };

    state.frame = requestAnimationFrame(step);
}

// Skins are gone, so a click is just a click.
function getEffectiveGPC() {
    return Math.floor(gugPerClick);
}

// Run Black_Market_Shop.dll just opens the shop. The gambling warning is not
// a door any more — it only belongs to the "Gambling" tab, so opening the shop
// to buy an upgrade doesn't make you dismiss a popup first. Clicking the button
// again while the shop is open closes it.
function toggleShop() {
    if (isShopOpen()) { closeShop(); return; }
    openShop();
}

// Wired to the shop's fake "Gambling" tab, which has no panel of its own and
// exists only to put this warning up.
function showGamblingWarning() {
    const warningWindow = document.getElementById('gambling-warning-window');
    if (!warningWindow) return;

    // Re-clicking while the warning is already up shouldn't stack another open
    // sound; just leave the one window there.
    if (warningWindow.style.display === 'flex') return;

    warningWindow.style.display = 'flex';
    if (typeof playSound === 'function') playSound('error-audio');
}

function isShopOpen() {
    const shopWrapper = document.getElementById('shop-overlay-wrapper');
    if (!shopWrapper) return false;
    return shopWrapper.style.display === 'flex' || shopWrapper.classList.contains('mobile-open');
}

// Desktop shows the shop as a side panel (inline display), mobile as a
// fullscreen overlay gated on .mobile-open — set both and let the CSS pick.
function openShop() {
    const shopWrapper = document.getElementById('shop-overlay-wrapper');
    if (!shopWrapper) return;
    shopWrapper.style.display = 'flex';
    shopWrapper.classList.add('mobile-open');
    floatShopBesideClicker();
    if (typeof playSound === 'function') playSound('window-open-audio');
}

// **Why the shop has to leave the column when the clicker does.**
// Docked, the two are columns of the same flex row and the shop opens next to
// the clicker. Drag the clicker anywhere and it becomes `position: fixed` with
// a z-index above everything still docked — so the shop's column opens *under*
// the window that launched it, at the far side of a screen the clicker isn't on
// any more. Which looks exactly like the button doing nothing: "Black Market
// won't launch if you move CORG_Clicker".
//
// So an undocked clicker gets an undocked shop, parked to its right (or its
// left, if there's no room) and raised above it. Below 800px nothing undocks —
// there the shop is a fullscreen sheet and this is a no-op.
function floatShopBesideClicker() {
    const clicker = document.getElementById('gugclicker-window');
    const shopWin = document.querySelector('#shop-overlay-wrapper .shop-area');
    if (!clicker || !shopWin) return;
    if (!clicker.classList.contains('window-undocked')) return;

    // Already floating: it keeps wherever you last dragged it, and only needs
    // raising so it isn't reopened behind the clicker.
    if (shopWin.classList.contains('window-undocked')) { bringWindowToFront(shopWin); return; }
    if (!undockWindow(shopWin)) return;

    const gap = 12;
    const edge = 8;
    const c = clicker.getBoundingClientRect();
    const s = shopWin.getBoundingClientRect();

    let left = c.right + gap;
    if (left + s.width > window.innerWidth - edge) left = c.left - gap - s.width;
    if (left < edge) left = Math.max(edge, window.innerWidth - s.width - edge);
    const top = Math.max(edge, Math.min(c.top, window.innerHeight - s.height - edge));

    shopWin.style.left = left + 'px';
    shopWin.style.top = top + 'px';
    bringWindowToFront(shopWin);
}

function closeShop() {
    const shopWrapper = document.getElementById('shop-overlay-wrapper');
    if (!shopWrapper) return;
    shopWrapper.style.display = 'none';
    shopWrapper.classList.remove('mobile-open');
}

function closeGamblingWarningWindow() {
    const warningWindow = document.getElementById('gambling-warning-window');
    if (!warningWindow) return;

    warningWindow.style.display = 'none';
    if (typeof playSound === 'function') playSound('upgrade-audio');
    // The shop is already open behind this — the warning is just the Gambling
    // tab's payload, so dismissing it drops you back where you were.
}

function initShop() {
    const mainContainer = document.getElementById('shop-container-main');
    const recycleContainer = document.getElementById('shop-container-recycle');
    
    mainContainer.innerHTML = ''; recycleContainer.innerHTML = '';
    
    upgrades.forEach((upg, index) => {
        if (upg.id === 12 && upg.tab === 'main') {
            const dividerContainer = document.createElement('div');
            dividerContainer.style.display = 'flex';
            dividerContainer.style.alignItems = 'center';
            dividerContainer.style.margin = '15px 0 10px 0';
            dividerContainer.innerHTML = `<span style="font-weight: bold; font-size: 11px; color: var(--win-dark-gray); margin-right: 10px; text-transform: uppercase;">Post Game Upgrades</span><div style="flex-grow: 1; height: 2px; border-top: 1px solid var(--win-dark-gray); border-bottom: 1px solid var(--win-white);"></div>`;
            mainContainer.appendChild(dividerContainer);
        }

        const btn = document.createElement('button');
        let btnClasses = 'win98-button upgrade-btn ';
        if (upg.isConsumable) btnClasses += 'consumable-btn ';
        if (upg.isLimit) btnClasses += 'limit-btn ';
        
        if (upg.id === 10) { btnClasses += 'glow-unforeseen '; } 
        else if (upg.id === 12 || upg.id === 13 || upg.id === 14 || upg.id === 104) { btnClasses += 'glow-post-1 '; } 
        else if (upg.id === 15 || upg.id === 16 || upg.id === 17 || upg.id === 105) { btnClasses += 'glow-post-2 '; } 
        else if (upg.id === 18 || upg.id === 19 || upg.id === 106) { btnClasses += 'glow-post-3 '; } 
        else if ((upg.id >= 20 && upg.id < 100) || upg.id >= 107) { btnClasses += 'glow-post-4 '; }
        
        btn.className = btnClasses.trim();
        btn.id = `upgrade-${index}`;
        btn.onclick = () => buyUpgrade(index);
        btn.innerHTML = `<div class="upgrade-name"></div><div class="upgrade-desc"></div><div class="upgrade-desc cost-text"></div>`;
        
        if (upg.tab === 'recycle') { recycleContainer.appendChild(btn); } else { mainContainer.appendChild(btn); }
    });
    updateUI();
}

function buyUpgrade(index) {
    if (isPaused) return;
    const upg = upgrades[index];
    if (upg.maxCount && upg.count >= upg.maxCount) return;

    if (score >= Math.floor(upg.cost)) {
        score -= Math.floor(upg.cost);
        upg.count++;
        
        playSound('upgrade-audio'); 
        upg.effect(); 
        
        if (upg.isConsumable) { upg.cost = upg.cost * 1.15; } 
        else if (!upg.maxCount) { upg.cost = upg.cost * 1.5; } 
        else { upg.cost = upg.cost * 2.5; }
        
        initShop();
    }
}

// Each OS's loading screen, drawn in CSS so it scales to any window instead of
// being a fixed-size bitmap (which is what the old images/gugclickerbg.jpg was
// — one CORG_Clicker picture shown as the splash for all four OSes, plus a
// separate mobile crop). Layout, typography, colours and progress animation
// are per era; the logo is OS_THEMES[os].bootLogo, so swapping in a real flag
// for any of them is a one-line change.
const BOOT_SPLASHES = {
    win95: (logo) => `
        <div class="boot95">
            <div class="boot95-plate">
                <img class="boot95-logo" src="${logo}" alt="">
                <div class="boot95-wordmark"><span class="boot95-small">CORG</span>OS<span class="boot95-ver">95</span></div>
            </div>
            <div class="boot95-bar"><div class="boot95-bar-fill"></div></div>
        </div>`,

    winxp: (logo) => `
        <div class="bootxp">
            <div class="bootxp-mid">
                <img class="bootxp-logo" src="${logo}" alt="">
                <div class="bootxp-wordmark"><span class="bootxp-small">CORG</span><span class="bootxp-big">OS</span><span class="bootxp-ver">xp</span></div>
                <div class="bootxp-bar"><div class="bootxp-blocks"></div></div>
            </div>
            <div class="bootxp-foot left">Copyright &copy; Corg Corporation</div>
            <div class="bootxp-foot right">${corgWordHTML()}</div>
        </div>`,

    win7: (logo) => `
        <div class="boot7">
            <img class="boot7-logo" src="${logo}" alt="">
            <div class="boot7-text">Starting CORGOS<span class="boot7-dots"><span>.</span><span>.</span><span>.</span></span></div>
            <div class="boot7-foot">
                <div class="boot7-copy">&copy; Corg Corporation</div>
                <div class="boot7-brand">${corgWordHTML()}</div>
            </div>
        </div>`,

    win10: (logo) => `
        <div class="boot11 boot10">
            <img class="boot11-logo boot10-logo" src="${logo}" alt="">
            <div class="boot11-spinner boot10-spinner"></div>
        </div>`,

    win11: (logo) => `
        <div class="boot11">
            <img class="boot11-logo" src="${logo}" alt="">
            <div class="boot11-spinner"></div>
        </div>`,
};

// COPILOT is 11's shell with different icons/wallpapers, not its
// own boot/lock-screen design — falls through to 11's boot splash and
// login/lock screen rather than main.js's win95 catch-all default.
const BOOT_LOGIN_ALIAS = { corgpilotos: 'win11' };

function triggerBootSequence() {
    isPaused = true;
    const cfg = OS_THEMES[currentOS] || OS_THEMES.win95;
    // 10 and COPILOT are both built on 11's shell, and neither has its own
    // boot splash design — they use 11's, same as the lock screen below.
    const bootKey = BOOT_LOGIN_ALIAS[currentOS] || (OS_THEMES[currentOS] ? currentOS : 'win95');

    const bootScreen = document.createElement('div');
    bootScreen.id = 'win95-boot-screen';
    bootScreen.className = `boot-splash boot-splash-${bootKey}`;
    // Above #login-screen (1000001) on purpose — see the fade-out below.
    bootScreen.style.zIndex = '1000003';
    bootScreen.innerHTML = (BOOT_SPLASHES[bootKey] || BOOT_SPLASHES.win95)(cfg.bootLogo);

    document.body.appendChild(bootScreen);

    // Boots straight into the startup sound — the boot-menu selection that got
    // us here is the user gesture browsers require before audio can play, so
    // no separate "click to boot" step is needed any more. A theme with a null
    // bootSound (XP) splashes in silence and saves its jingle for the logon.
    if (cfg.bootSound) {
        const bootAudio = new Audio(cfg.bootSound);
        bootAudio.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
        bootAudio.play().catch(e => console.log('boot audio blocked:', e));
    }

    setTimeout(() => {
        // Put the login screen up *underneath* the still-opaque boot splash,
        // then fade the splash away, so the fade reveals the login screen.
        // This used to call showLoginScreen() only after the fade finished,
        // which meant a full second of bare desktop showing through and then
        // the login screen popping in on top of it.
        showLoginScreen();
        bootScreen.style.opacity = '0';
        setTimeout(() => bootScreen.remove(), 1000);
    }, 4000);
}

/* =====================================================================
   XP-only bundled apps: Minesweeper, Paint, Notepad.
   Reachable from the desktop icons / start menu that .xp-only reveals
   while the winxp theme is active.
   ===================================================================== */

const MINE_SPRITES = 'images/winxp/minesweeper/';
const MINE_ROWS = 9;
const MINE_COLS = 9;
const MINE_COUNT = 10;

let mineBoard = [];
let mineState = 'new';       // new | playing | won | lost
let mineTimer = 0;
let mineTimerId = null;
let mineFlagsPlaced = 0;

function toggleMinesweeper() {
    const screen = document.getElementById('minesweeper-screen');
    if (!screen) return;
    if (screen.style.display === 'flex') {
        screen.style.display = 'none';
        mineStopTimer();
        isPaused = false;
    } else {
        isPaused = true;
        if (!mineBoard.length) minesweeperNew();
        screen.style.display = 'flex';
        playSound('window-open-audio');
    }
}

function minesweeperNew() {
    mineStopTimer();
    mineState = 'new';
    mineTimer = 0;
    mineFlagsPlaced = 0;
    mineBoard = [];

    for (let r = 0; r < MINE_ROWS; r++) {
        const row = [];
        for (let c = 0; c < MINE_COLS; c++) {
            row.push({ mine: false, revealed: false, flagged: false, adjacent: 0 });
        }
        mineBoard.push(row);
    }
    mineRender();
}

// Mines are placed on the first click so the opening move is never a loss.
function minePlaceMines(safeR, safeC) {
    let placed = 0;
    while (placed < MINE_COUNT) {
        const r = Math.floor(Math.random() * MINE_ROWS);
        const c = Math.floor(Math.random() * MINE_COLS);
        if (mineBoard[r][c].mine) continue;
        if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
        mineBoard[r][c].mine = true;
        placed++;
    }
    for (let r = 0; r < MINE_ROWS; r++) {
        for (let c = 0; c < MINE_COLS; c++) {
            mineBoard[r][c].adjacent = mineNeighbours(r, c).filter((n) => n.mine).length;
        }
    }
}

function mineNeighbours(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < MINE_ROWS && nc >= 0 && nc < MINE_COLS) out.push(mineBoard[nr][nc]);
        }
    }
    return out;
}

function mineNeighbourCoords(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < MINE_ROWS && nc >= 0 && nc < MINE_COLS) out.push([nr, nc]);
        }
    }
    return out;
}

function mineStartTimer() {
    if (mineTimerId) return;
    mineTimerId = setInterval(() => {
        if (mineTimer < 999) mineTimer++;
        mineUpdateHud();
    }, 1000);
}
function mineStopTimer() {
    if (mineTimerId) { clearInterval(mineTimerId); mineTimerId = null; }
}

function mineReveal(r, c) {
    if (mineState === 'won' || mineState === 'lost') return;
    const cell = mineBoard[r][c];
    if (cell.flagged || cell.revealed) return;

    if (mineState === 'new') {
        minePlaceMines(r, c);
        mineState = 'playing';
        mineStartTimer();
    }

    if (cell.mine) {
        cell.revealed = true;
        cell.exploded = true;
        mineState = 'lost';
        mineStopTimer();
        mineBoard.forEach((row) => row.forEach((x) => {
            if (x.mine && !x.flagged) x.revealed = true;
            if (x.flagged && !x.mine) x.misflagged = true;
        }));
        playSound('error-audio');
        mineRender();
        return;
    }

    // flood-fill empty regions
    const stack = [[r, c]];
    while (stack.length) {
        const [cr, cc] = stack.pop();
        const cur = mineBoard[cr][cc];
        if (cur.revealed || cur.flagged) continue;
        cur.revealed = true;
        if (cur.adjacent === 0) {
            mineNeighbourCoords(cr, cc).forEach(([nr, nc]) => {
                if (!mineBoard[nr][nc].revealed) stack.push([nr, nc]);
            });
        }
    }

    const safeLeft = mineBoard.flat().filter((x) => !x.mine && !x.revealed).length;
    if (safeLeft === 0) {
        mineState = 'won';
        mineStopTimer();
        mineBoard.forEach((row) => row.forEach((x) => { if (x.mine) x.flagged = true; }));
        playSound('achievement-audio');
    }
    mineRender();
}

function mineFlag(r, c) {
    if (mineState === 'won' || mineState === 'lost') return;
    const cell = mineBoard[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    mineFlagsPlaced += cell.flagged ? 1 : -1;
    mineRender();
}

function mineDigits(value, elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const clamped = Math.max(-99, Math.min(999, value));
    const str = clamped < 0
        ? '-' + String(Math.abs(clamped)).padStart(2, '0')
        : String(clamped).padStart(3, '0');
    el.innerHTML = str.split('').map((ch) => {
        const name = ch === '-' ? 'digit-' : `digit${ch}`;
        return `<img src="${MINE_SPRITES}${name}.png" alt="${ch}">`;
    }).join('');
}

function mineUpdateHud() {
    mineDigits(MINE_COUNT - mineFlagsPlaced, 'mine-flags');
    mineDigits(mineTimer, 'mine-timer');
    const face = document.getElementById('mine-face');
    if (face) {
        const sprite = mineState === 'lost' ? 'dead' : mineState === 'won' ? 'win' : 'smile';
        face.innerHTML = `<img src="${MINE_SPRITES}${sprite}.png" alt="">`;
    }
}

function mineRender() {
    const grid = document.getElementById('mine-grid');
    if (!grid) return;
    grid.style.gridTemplateColumns = `repeat(${MINE_COLS}, 16px)`;

    // A covered tile is a CSS bevel, not a sprite (same as upstream) — the
    // sprites are only the overlays: numbers, mines, flags.
    let html = '';
    for (let r = 0; r < MINE_ROWS; r++) {
        for (let c = 0; c < MINE_COLS; c++) {
            const cell = mineBoard[r][c];
            let bg = 'mine-cover';
            let sprite = '';

            if (cell.misflagged) {
                bg = 'mine-open';
                sprite = 'misflagged';
            } else if (cell.revealed) {
                bg = 'mine-open';
                if (cell.mine) sprite = cell.exploded ? 'mine-death' : 'mine-ceil';
                else if (cell.adjacent > 0) sprite = `open${cell.adjacent}`;
            } else if (cell.flagged) {
                sprite = 'flag';
            }

            html += `<div class="mine-cell" data-r="${r}" data-c="${c}">`
                + `<span class="mine-bg ${bg}"></span>`
                + (sprite ? `<img src="${MINE_SPRITES}${sprite}.png" alt="" draggable="false">` : '')
                + '</div>';
        }
    }
    grid.innerHTML = html;
    mineUpdateHud();
}

document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('mine-grid');
    if (!grid) return;
    grid.addEventListener('click', (e) => {
        const cell = e.target.closest('.mine-cell');
        if (cell) mineReveal(+cell.dataset.r, +cell.dataset.c);
    });
    grid.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const cell = e.target.closest('.mine-cell');
        if (cell) mineFlag(+cell.dataset.r, +cell.dataset.c);
    });
});

/* ------------------------------ Paint ------------------------------ */
const PAINT_COLORS = [
    '#000000', '#7f7f7f', '#880015', '#ed1c24', '#ff7f27', '#fff200', '#22b14c', '#00a2e8',
    '#3f48cc', '#a349a4', '#ffffff', '#c3c3c3', '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0',
    '#b5e61d', '#99d9ea', '#7092be', '#c8bfe7',
];
let paintTool = 'pencil';
let paintColor = '#000000';
let paintDrawing = false;

function togglePaint() {
    const screen = document.getElementById('paint-screen');
    if (!screen) return;
    if (screen.style.display === 'flex') {
        screen.style.display = 'none';
        isPaused = false;
    } else {
        isPaused = true;
        screen.style.display = 'flex';
        paintInit();
        playSound('window-open-audio');
    }
}

let paintReady = false;
function paintInit() {
    if (paintReady) return;
    paintReady = true;

    const palette = document.getElementById('paint-palette');
    if (palette) {
        palette.innerHTML = PAINT_COLORS.map((col, i) =>
            `<button class="paint-swatch${i === 0 ? ' active' : ''}" style="background:${col}" data-color="${col}" title="${col}"></button>`
        ).join('');
        palette.addEventListener('click', (e) => {
            const sw = e.target.closest('.paint-swatch');
            if (!sw) return;
            paintColor = sw.dataset.color;
            palette.querySelectorAll('.paint-swatch').forEach((s) => s.classList.toggle('active', s === sw));
        });
    }

    const canvas = document.getElementById('paint-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const src = e.touches ? e.touches[0] : e;
        return {
            x: (src.clientX - rect.left) * (canvas.width / rect.width),
            y: (src.clientY - rect.top) * (canvas.height / rect.height),
        };
    };

    const start = (e) => {
        paintDrawing = true;
        const p = pos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        draw(e);
    };
    const draw = (e) => {
        if (!paintDrawing) return;
        if (e.cancelable) e.preventDefault();
        const size = +document.getElementById('paint-size').value;
        const p = pos(e);
        ctx.strokeStyle = paintTool === 'eraser' ? '#ffffff' : paintColor;
        ctx.lineWidth = paintTool === 'pencil' ? Math.max(1, size / 2) : size;
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
    };
    const stop = () => { paintDrawing = false; };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    document.addEventListener('mouseup', stop);
    document.addEventListener('touchend', stop);
}

function paintSetTool(tool, btn) {
    paintTool = tool;
    document.querySelectorAll('.paint-tool').forEach((b) => b.classList.toggle('active', b === btn));
    playSound('upgrade-audio');
}

function paintClear() {
    const canvas = document.getElementById('paint-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    playSound('upgrade-audio');
}

/* ----------------------------- Notepad ----------------------------- */
function toggleNotepad() {
    const screen = document.getElementById('notepad-screen');
    if (!screen) return;
    if (screen.style.display === 'flex') {
        screen.style.display = 'none';
        localStorage.setItem('gugNotepad', document.getElementById('notepad-text').value);
        isPaused = false;
    } else {
        isPaused = true;
        const text = document.getElementById('notepad-text');
        if (text && !text.value) text.value = localStorage.getItem('gugNotepad') || '';
        screen.style.display = 'flex';
        playSound('window-open-audio');
    }
}

// Each OS gets its own login screen between the boot splash and the desktop.
const LOGIN_PASSWORD = 'corg';

const LOGIN_SCREENS = {
    win95: () => `
        <div class="login95-dialog">
            <div class="login95-title">Enter Network Password</div>
            <div class="login95-body">
                <img src="images/corgicon.png" alt="">
                <div class="login95-fields">
                    <p>Type your password to log on to CORGOS 95.</p>
                    <label>User name: <input class="win98-input" value="Corg User" readonly></label>
                    <label>Password: <input class="win98-input login-pass" id="login-password" type="password" autocomplete="off"></label>
                    <div class="login-error" id="login-error"></div>
                    <div class="login-hint">hint: ${corgWordHTML()}</div>
                </div>
                <div class="login95-buttons">
                    <button class="win98-button" onclick="attemptLogin()">OK</button>
                    <button class="win98-button" onclick="clearLoginPassword()">Cancel</button>
                </div>
            </div>
        </div>`,

    // Both XP stages are drawn in CSS off the same `.loginxp-field` bars +
    // divider, so the login screen and the "Welcome" that replaces it are
    // equally sharp. (The login stage used to be a stretched screenshot,
    // images/winxp/login.jpg, which was blurry next to the CSS "Welcome".)
    winxp: () => `
        <div class="loginxp-shell loginxp-field">
            <div class="loginxp-bar top"></div>
            <div class="loginxp-mid">
                <div class="loginxp-left">
                    <div class="loginxp-logo">
                        <span class="loginxp-logo-brand">CORGOS</span><span class="loginxp-logo-os">xp</span>
                    </div>
                    <div class="loginxp-tagline">To begin, click your user name</div>
                </div>
                <div class="loginxp-divider"></div>
                <div class="loginxp-right">
                    <div class="loginxp-user">
                        <img src="images/corg.png" alt="">
                        <span>Corg User</span>
                    </div>
                    <div class="loginxp-passrow">
                        <input class="login-pass" id="login-password" type="password" autocomplete="off">
                        <button class="loginxp-go" onclick="attemptLogin()" title="Log on">&#10148;</button>
                    </div>
                    <div class="login-error" id="login-error"></div>
                    <div class="login-hint">hint: ${corgWordHTML()}</div>
                </div>
            </div>
            <div class="loginxp-bar bottom"></div>
        </div>
        <div class="loginxp-welcome loginxp-field" id="loginxp-welcome">
            <div class="loginxp-bar top"></div>
            <div class="loginxp-mid">
                <div class="loginxp-welcome-user">
                    <img src="images/corg.png" alt="">
                    <span>Corg User</span>
                </div>
                <div class="loginxp-divider"></div>
                <div class="loginxp-welcome-text">Welcome</div>
            </div>
            <div class="loginxp-bar bottom"></div>
        </div>`,

    win7: () => `
        <div class="login7-inner">
            <div class="login7-avatar"><img src="images/corg.png" alt=""></div>
            <div class="login7-name">Corg User</div>
            <div class="login7-row">
                <input class="login7-pass login-pass" id="login-password" type="password" placeholder="Password" autocomplete="off">
                <button class="login7-go" onclick="attemptLogin()" title="Log on">&#10148;</button>
            </div>
            <div class="login-error" id="login-error"></div>
            <div class="login-hint">hint: ${corgWordHTML()}</div>
        </div>`,

    win10: () => `
        <div class="login10-lock" id="login11-lock">
            <div class="login10-clock-group">
                <div class="login10-clock" id="login11-clock">12:00</div>
                <div class="login10-date" id="login11-date"></div>
            </div>
            <div class="login10-network-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6v2h2v2H8v-2h2v-2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v10h16V6H4z"/></svg></div>
            <div class="login10-lock-hint">Press Space or swipe up to unlock</div>
        </div>
        <div class="login10-inner" id="login11-signin">
            <div class="login10-avatar"><img src="images/corg.png" alt=""></div>
            <div class="login10-name">Corg User</div>
            <div class="login10-row">
                <input class="login10-pass login-pass" id="login-password" type="password" placeholder="Password" autocomplete="off">
                <button class="login10-go" onclick="attemptLogin()" title="Sign in">&#10148;</button>
            </div>
            <div class="login-error" id="login-error"></div>
            <div class="login-hint">hint: ${corgWordHTML()}</div>
        </div>`,

    // Two stages, like the real thing: the lock screen (clock + date) slides
    // away on space / click / scroll-up / swipe-up to reveal the PIN box.
    win11: () => `
        <div class="login11-lock" id="login11-lock">
            <div class="login11-clock" id="login11-clock">12:00</div>
            <div class="login11-date" id="login11-date"></div>
            <div class="login11-lock-hint">Press Space or swipe up to unlock</div>
        </div>
        <div class="login11-inner" id="login11-signin">
            <div class="login11-avatar"><img src="images/corg.png" alt=""></div>
            <div class="login11-name">Corg User</div>
            <input class="login11-pass login-pass" id="login-password" type="password" placeholder="PIN" autocomplete="off">
            <button class="login11-go" onclick="attemptLogin()">Sign in</button>
            <div class="login-error" id="login-error"></div>
            <div class="login-hint">hint: ${corgWordHTML()}</div>
        </div>`,
};

let win11Locked = false;
let loginLockCleanup = null;

function showLoginScreen() {
    const screen = document.getElementById('login-screen');
    if (!screen) { checkWelcome(); return; }

    isPaused = true;

    // Always start from a clean lock state — a half-finished 11 lock screen
    // used to leave win11Locked true, and then attemptLogin() on the *next*
    // OS's login screen would try to unlock instead of logging in.
    win11Locked = false;
    logonSoundPlayed = false;
    if (loginLockCleanup) loginLockCleanup();

    const os = OS_THEMES[currentOS] ? currentOS : 'win95';
    const loginKey = BOOT_LOGIN_ALIAS[os] || os;
    screen.className = `open login-${loginKey}`;
    screen.innerHTML = (LOGIN_SCREENS[loginKey] || LOGIN_SCREENS.win95)();

    loginKeyHandler = (e) => {
        // While lock screen is up, Space (or Enter) raises it instead of
        // submitting — there's no PIN box to submit into yet.
        if (win11Locked && (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter')) {
            e.preventDefault();
            win11Unlock();
            return;
        }
        if (e.key === 'Enter') attemptLogin();
    };
    document.addEventListener('keydown', loginKeyHandler);

    if (loginKey === 'win11' || loginKey === 'win10') startWin11Lock(screen);
    else focusLoginPassword();
}

// --- CORGOS 11 lock screen -------------------------------------------------
// Clock and date over the wallpaper; space, a click, a scroll up or a drag up
// lifts it away and hands over to the PIN box, like the real thing.
function startWin11Lock(screen) {
    win11Locked = true;

    const clock = document.getElementById('login11-clock');
    const date = document.getElementById('login11-date');
    const tick = () => {
        const now = new Date();
        // The real lock screen shows "5:00", not "5:00 PM" — strip the meridiem.
        if (clock) {
            clock.textContent = now
                .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                .replace(/\s*[AP]\.?M\.?$/i, '');
        }
        if (date) date.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    };
    tick();
    const clockTimer = setInterval(tick, 1000);

    let dragStartY = null;
    const onDown = (e) => { dragStartY = (e.touches ? e.touches[0].clientY : e.clientY); };
    const onMove = (e) => {
        if (dragStartY === null) return;
        const y = (e.touches ? e.touches[0].clientY : e.clientY);
        if (dragStartY - y > 60) { dragStartY = null; win11Unlock(); }
    };
    const onUp = () => { dragStartY = null; };
    const onWheel = (e) => { if (e.deltaY < 0) win11Unlock(); };
    const onClick = () => win11Unlock();

    const lock = document.getElementById('login11-lock');
    if (lock) {
        lock.addEventListener('mousedown', onDown);
        lock.addEventListener('touchstart', onDown, { passive: true });
        lock.addEventListener('click', onClick);
    }
    // The move/up listeners live on the document so a swipe that runs off the
    // element (or off the window) still counts.
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    screen.addEventListener('wheel', onWheel, { passive: true });

    loginLockCleanup = () => {
        clearInterval(clockTimer);
        if (lock) {
            lock.removeEventListener('mousedown', onDown);
            lock.removeEventListener('touchstart', onDown);
            lock.removeEventListener('click', onClick);
        }
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchend', onUp);
        screen.removeEventListener('wheel', onWheel);
        loginLockCleanup = null;
    };
}

function win11Unlock() {
    if (!win11Locked) return;
    win11Locked = false;
    if (loginLockCleanup) loginLockCleanup();

    const lock = document.getElementById('login11-lock');
    const signin = document.getElementById('login11-signin');
    if (lock) lock.classList.add('lifted');
    if (signin) signin.classList.add('visible');
    focusLoginPassword();
}

function focusLoginPassword() {
    const pass = document.getElementById('login-password');
    if (pass) pass.focus();
}

// The password is real now: you have to type it. Every screen puts its field
// under #login-password and its message under #login-error.
function attemptLogin() {
    if (win11Locked) { win11Unlock(); return; }

    const pass = document.getElementById('login-password');
    const error = document.getElementById('login-error');
    const typed = pass ? pass.value.trim().toLowerCase() : '';

    if (typed === LOGIN_PASSWORD) {
        if (error) error.textContent = '';
        // XP puts its "Welcome" screen up while it logs you in, then carries on.
        if (currentOS === 'winxp') {
            const welcome = document.getElementById('loginxp-welcome');
            const shell = document.querySelector('.loginxp-shell');
            if (welcome) {
                if (shell) shell.style.display = 'none';
                welcome.classList.add('visible');
                if (loginKeyHandler) { document.removeEventListener('keydown', loginKeyHandler); loginKeyHandler = null; }
                // The jingle belongs to the "Welcome" screen, not to the desktop
                // that follows it — that's where XP plays it, and it's long
                // enough that starting it at completeLogin() would leave it
                // trailing over the desktop instead of introducing it.
                playLogonSound();
                setTimeout(completeLogin, 1900);
                return;
            }
        }
        completeLogin();
        return;
    }

    if (error) error.textContent = typed ? 'The password is incorrect. Try again.' : 'Type your password.';
    if (pass) { pass.value = ''; pass.focus(); }
    if (typeof playSound === 'function') playSound('error-audio');
}

function clearLoginPassword() {
    const pass = document.getElementById('login-password');
    const error = document.getElementById('login-error');
    if (pass) { pass.value = ''; pass.focus(); }
    if (error) error.textContent = '';
}

let loginKeyHandler = null;

// Fires once per sign-in. XP calls this early (over the "Welcome" screen) and
// every other theme gets it from completeLogin(); the flag is what stops XP
// hearing it twice.
let logonSoundPlayed = false;

function playLogonSound() {
    if (logonSoundPlayed) return;
    const cfg = OS_THEMES[currentOS] || OS_THEMES.win95;
    if (!cfg.logonSound) return;
    logonSoundPlayed = true;
    const audio = new Audio(cfg.logonSound);
    audio.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    audio.play().catch(() => {});
}

function completeLogin() {
    const screen = document.getElementById('login-screen');
    if (!screen || !screen.classList.contains('open')) return;

    win11Locked = false;
    if (loginLockCleanup) loginLockCleanup();
    if (loginKeyHandler) { document.removeEventListener('keydown', loginKeyHandler); loginKeyHandler = null; }

    playLogonSound();

    screen.classList.add('fading');
    setTimeout(() => {
        screen.className = '';
        screen.innerHTML = '';
        checkWelcome();
    }, 500);
}

// ---------------------------------------------------------------------------
// Title screen -> CORG OS Setup -> boot manager -> login -> desktop.
// The title screen is the very first thing shown, and clicking Play doubles as
// the user gesture browsers require before any audio can play.
// ---------------------------------------------------------------------------

// Developer skips, toggled from the title screen's DEV MENU and remembered
// between sessions so you don't sit through the intro while testing.
let devSkips = { intro: false };

function devSkipLoad() {
    try {
        const raw = localStorage.getItem('gugDevSkips');
        if (raw) devSkips = Object.assign(devSkips, JSON.parse(raw));
    } catch { }
    const intro = document.getElementById('mm-skip-intro');
    if (intro) intro.checked = !!devSkips.intro;
}

function devSkipSet(key, value) {
    devSkips[key] = !!value;
    try { localStorage.setItem('gugDevSkips', JSON.stringify(devSkips)); } catch { }
}

function showMainMenu() {
    isPaused = true;
    const screen = document.getElementById('main-menu-screen');
    if (!screen) { showBootMenu(); return; }
    devSkipLoad();
    mainMenuSyncSettings();
    screen.classList.add('open');
}

// One panel now — the dev skip toggle lives inside SETTINGS, so the title
// screen itself is only PLAY and SETTINGS.
function mainMenuToggleSettings() {
    const panel = document.getElementById('main-menu-settings');
    if (!panel) return;
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) { mainMenuSyncSettings(); devSkipLoad(); }
}

// Keeps the title-screen sliders and their readouts in step with the live
// volumes (which the in-game Settings window also writes to).
function mainMenuSyncSettings() {
    const pairs = [
        ['mm-music-volume', 'mm-music-value', typeof musicVolume !== 'undefined' ? musicVolume : 0.5],
        ['mm-sfx-volume', 'mm-sfx-value', typeof sfxVolume !== 'undefined' ? sfxVolume : 1],
        ['mm-glass-volume', 'mm-glass-value', typeof glassVolume !== 'undefined' ? glassVolume : 1],
    ];
    pairs.forEach(([inputId, valueId, v]) => {
        const input = document.getElementById(inputId);
        const label = document.getElementById(valueId);
        if (input && document.activeElement !== input) input.value = v;
        if (label) label.textContent = `${Math.round(v * 100)}%`;
    });
}

// Clicking the corg on the title screen says corg. That's the whole feature —
// nothing moves, the title screen is deliberately animation-free.
function mainMenuPokeCorg() {
    // The title screen is before any click has unlocked audio on some
    // browsers, so a blocked play here is expected and harmless.
    const bark = new Audio(CORG_SFX);
    bark.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1;
    bark.play().catch(() => { });
}

function mainMenuPlay() {
    const screen = document.getElementById('main-menu-screen');
    if (screen) screen.classList.remove('open');
    const panel = document.getElementById('main-menu-settings');
    if (panel) panel.classList.remove('open');
    if (devSkips.intro) showBootMenu();
    else playIntro();
}


// ---------------------------------------------------------------------------
// The intro cutscene.
//
// videos/intro.mp4 plays, and then *stops* — it holds on its last frame, and
// that held frame is treated as a pane of glass: Corg comes through the middle
// of it exactly the way he goes through an ad on the desktop, using the same
// crack pattern (adShardPolygons), the same shard flight, and the same
// glass_sheet_break takes. Then he says the only thing he says, and the whole
// screen fades to the boot manager.
//
// The shards can't be the <video> itself — a clipped video is still one moving
// element, not eleven pieces — so the last frame is copied to a canvas once and
// every shard wears that picture. Same trick as buildAdShardFace: one face,
// cloned per shard, and the clip is what makes each one a different piece.
// ---------------------------------------------------------------------------

const INTRO_VIDEO_EL_ID = 'intro-video';
const INTRO_FREEZE_MS = 850;    // beat on the last frame before the glass goes
const INTRO_SPEAK_MS = 560;     // break -> corg
const INTRO_HOLD_MS = 1700;     // corg -> fade
const INTRO_FADE_MS = 600;      // must match #intro-video-screen's transition

let introDone = false;
let introTimers = [];

function introDelay(fn, ms) {
    introTimers.push(setTimeout(fn, ms));
}

function introVideo() {
    return document.getElementById(INTRO_VIDEO_EL_ID);
}

// Everything the cutscene puts on screen, back to nothing. Called before a run
// and after one, so a second playthrough (dev reload, or the title screen being
// reachable again) starts clean rather than on top of the last break.
function introReset() {
    const shards = document.getElementById('intro-shards');
    if (shards) shards.innerHTML = '';

    const video = introVideo();
    if (video) video.classList.remove('broken');

    const corg = document.getElementById('intro-corg');
    if (corg) corg.classList.remove('burst');

    const bubble = document.getElementById('intro-bubble');
    if (bubble) bubble.style.display = 'none';
}

function playIntro() {
    const screen = document.getElementById('intro-video-screen');
    const video = introVideo();
    // No video element (or no file) is not a reason to strand anyone on a black
    // screen — every failure path in here ends at the boot menu.
    if (!screen || !video) { showBootMenu(); return; }

    isPaused = true;
    introDone = false;
    introTimers = [];

    introReset();
    screen.classList.remove('fading');
    screen.classList.add('open');

    try { video.currentTime = 0; } catch { }
    video.muted = false;
    video.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1;
    video.onended = introFreeze;
    video.onerror = introFreeze;

    // PLAY was a click, so sound is allowed here; if a browser disagrees, the
    // intro plays silently rather than not at all.
    video.play().catch(() => {
        video.muted = true;
        video.play().catch(introFreeze);
    });

    document.addEventListener('keydown', introKeyDown);
}

// Esc (or Space/Enter, since those are what the rest of the pre-desktop screens
// take) drops the whole cutscene and goes to the boot manager.
function introKeyDown(e) {
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        endIntro();
    }
}

function introFreeze() {
    if (introDone) return;

    const video = introVideo();
    if (video) {
        video.onended = null;
        video.onerror = null;
        video.pause();
        // 'ended' already parks the element on its final frame; nudging back a
        // hair keeps it there on the browsers that blank it instead.
        if (isFinite(video.duration) && video.duration > 0.1) {
            try { video.currentTime = video.duration - 0.05; } catch { }
        }
    }

    introDelay(introSmash, INTRO_FREEZE_MS);
}

// The held frame, copied out of the <video> onto a canvas the shards are cut
// from. Returns null only if there is no decoded frame to copy.
//
// **Never toDataURL() this.** Drawing a video onto a canvas is always allowed,
// but it taints the canvas, and reading the pixels back out of a tainted canvas
// throws — which is exactly what happens when the page is opened over file://
// rather than through a server. That threw, the shards fell back to a flat
// colour, and the whole break came away as blank white pieces. Nothing here
// reads pixels back: the canvas is only ever *drawn*, which a tainted canvas is
// perfectly happy to do.
function introFrameCanvas(video) {
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
}

// A polygon's bounding box, clipped to the frame. Each shard only paints its
// own box rather than a full copy of the frame — 22 full-screen canvases is a
// lot of pixels for eleven wedges that mostly don't overlap.
// Returns null for a wedge that lies entirely outside the frame (the crack
// pattern deliberately reaches past every corner).
function introShardBox(poly, w, h) {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    const x = Math.max(0, Math.floor(Math.min(...xs)));
    const y = Math.max(0, Math.floor(Math.min(...ys)));
    const right = Math.min(w, Math.ceil(Math.max(...xs)));
    const bottom = Math.min(h, Math.ceil(Math.max(...ys)));
    if (right <= x || bottom <= y) return null;
    return { x, y, w: right - x, h: bottom - y };
}

function introSmash() {
    if (introDone) return;

    const stage = document.getElementById('intro-stage');
    const host = document.getElementById('intro-shards');
    const video = introVideo();
    if (!stage || !host) { endIntro(); return; }

    const w = Math.round(stage.clientWidth) || window.innerWidth;
    const h = Math.round(stage.clientHeight) || window.innerHeight;
    const frame = introFrameCanvas(video);
    // Frame pixels per displayed pixel — the video is letterboxed to fit, so
    // its natural size and the size on screen are not the same.
    const sx = frame ? frame.width / w : 1;
    const sy = frame ? frame.height / h : 1;

    // The break starts at the middle of the frame because that is where Corg is
    // coming through it.
    const ix = w / 2;
    const iy = h / 2;

    adShardPolygons(w, h, ix, iy).forEach((poly) => {
        const box = introShardBox(poly, w, h);
        if (!box) return;

        const shard = document.createElement('div');
        shard.className = 'intro-shard';
        shard.style.left = box.x + 'px';
        shard.style.top = box.y + 'px';
        shard.style.width = box.w + 'px';
        shard.style.height = box.h + 'px';
        // The clip is in the shard's own box now, so the polygon moves with it.
        shard.style.clipPath = 'polygon(' + poly
            .map(([x, y]) => `${(x - box.x).toFixed(1)}px ${(y - box.y).toFixed(1)}px`).join(', ') + ')';

        // This piece of the picture, at the size it was on screen.
        if (frame) {
            const face = document.createElement('canvas');
            face.className = 'intro-shard-face';
            face.width = box.w;
            face.height = box.h;
            face.getContext('2d').drawImage(
                frame,
                box.x * sx, box.y * sy, box.w * sx, box.h * sy,
                0, 0, box.w, box.h
            );
            shard.appendChild(face);
        } else {
            // No decoded frame to cut up: plain dark glass, so the break still
            // reads against the black rather than flashing white.
            shard.classList.add('intro-shard-blank');
        }
        host.appendChild(shard);

        // Identical to shatterAd's shard flight: outward from the impact, faster
        // the nearer the piece started to it, then gravity takes it.
        const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
        const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
        let dx = cx - ix, dy = cy - iy;
        const dist = Math.hypot(dx, dy) || 1;
        dx /= dist; dy /= dist;

        // Bigger burst than an ad gets: this is a whole screen of glass, and the
        // pieces have to clear a whole screen rather than a small window.
        const burst = 520 + 52000 / (dist + 60);
        const vx = dx * burst;
        const vy = dy * burst - 180;
        const spin = (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 320);

        const t = AD_SHARD_MS / 1000;
        const posAt = (f) => [vx * (t * f), vy * (t * f) + 0.5 * AD_SHARD_GRAVITY * (t * f) * (t * f)];
        const [mx, my] = posAt(0.5);
        const [ex, ey] = posAt(1);

        shard.animate([
            { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 },
            { transform: `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px) rotate(${(spin * 0.5).toFixed(1)}deg)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px) rotate(${spin.toFixed(1)}deg)`, opacity: 0 },
        ], { duration: AD_SHARD_MS, easing: 'linear', fill: 'forwards' });
    });

    // The video goes the instant the shards exist, so the frame is never both
    // whole and broken.
    if (video) video.classList.add('broken');

    if (typeof playGlassBreakSfx === 'function') {
        playGlassBreakSfx();
        // A second take a beat behind the first: one ad's worth of glass doesn't
        // sound like a screen's worth.
        introDelay(playGlassBreakSfx, 90);
    }

    const corg = document.getElementById('intro-corg');
    if (corg) corg.classList.add('burst');
    introDelay(introSpeak, INTRO_SPEAK_MS);
}

function introSpeak() {
    if (introDone) return;

    const bubble = document.getElementById('intro-bubble');
    const text = document.getElementById('intro-bubble-text');
    // The word is the dog, here as everywhere else.
    if (text) sayInGuggyBubble(text, 'corg');
    if (bubble) bubble.style.display = 'block';

    const bark = new Audio(CORG_SFX);
    bark.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1;
    bark.play().catch(() => { });

    introDelay(endIntro, INTRO_HOLD_MS);
}

function endIntro() {
    if (introDone) return;
    introDone = true;

    introTimers.forEach(clearTimeout);
    introTimers = [];
    document.removeEventListener('keydown', introKeyDown);

    const video = introVideo();
    if (video) {
        video.onended = null;
        video.onerror = null;
        video.pause();
    }

    const screen = document.getElementById('intro-video-screen');
    if (!screen) { showBootMenu(); return; }

    // The boot manager goes up *first*, so the intro fades onto it. Building it
    // after the fade instead meant the fade revealed whatever was behind the
    // intro — which is the bare desktop, so the scene ended on a flash of
    // CORGOS 95 before the boot menu cut in over it.
    showBootMenu();

    screen.classList.add('fading');
    setTimeout(() => {
        screen.classList.remove('open', 'fading');
        if (video) { try { video.currentTime = 0; } catch { } }
        introReset();
    }, INTRO_FADE_MS);
}


// ---------------------------------------------------------------------------
// CORG OS Setup: Corg introduces himself over two voice lines, then sings.
// "Install now" appears once the song starts and takes you to the boot menu.
//
// Nothing calls startSetupSequence() any more — the intro cutscene above is
// what PLAY runs. Kept whole so putting it back is a one-line change.
// ---------------------------------------------------------------------------

const SETUP_LINES = [
    {
        audio: 'sfx/corg.wav',
        text: 'corg',
    },
    {
        audio: 'sfx/corg.wav',
        text: 'corg',
    },
];

const SETUP_SONG = 'music/guggycansong.mp3';

let setupAudio = null;
let setupSong = null;
let setupTimers = [];
let setupDone = false;

function setupDelay(fn, ms) {
    setupTimers.push(setTimeout(fn, ms));
}

function startSetupSequence() {
    const screen = document.getElementById('setup-screen');
    if (!screen) { showBootMenu(); return; }

    setupDone = false;
    setupTimers = [];
    screen.classList.add('open');

    const guggy = document.getElementById('setup-guggy');
    const subtitle = document.getElementById('setup-subtitle');
    const btn = document.getElementById('setup-install-btn');
    if (subtitle) subtitle.textContent = '';
    if (btn) btn.classList.remove('visible');
    if (guggy) {
        guggy.classList.remove('visible', 'singing');
        guggy.src = 'images/corg.png';
    }

    // let the window settle before Corg walks on
    setupDelay(() => {
        if (guggy) guggy.classList.add('visible');
        setupDelay(() => setupSpeak(0), 700);
    }, 600);
}

function setupSpeak(index) {
    if (setupDone) return;

    const line = SETUP_LINES[index];
    if (!line) { setupSing(); return; }

    // Corg's setup narration is the same one word, so the subtitle is the dog
    // rather than the spelling — sayInGuggyBubble's rule, applied to the
    // subtitle track.
    const subtitle = document.getElementById('setup-subtitle');
    if (subtitle) sayInGuggyBubble(subtitle, line.text);

    setupAudio = new Audio(line.audio);
    setupAudio.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1;
    setupAudio.onended = () => setupDelay(() => setupSpeak(index + 1), 500);
    // If the clip can't load, keep the sequence moving on a rough read time.
    setupAudio.onerror = () => setupDelay(() => setupSpeak(index + 1), 2600);
    setupAudio.play().catch(() => setupDelay(() => setupSpeak(index + 1), 2600));
}

function setupSing() {
    if (setupDone) return;

    const guggy = document.getElementById('setup-guggy');
    const subtitle = document.getElementById('setup-subtitle');
    const btn = document.getElementById('setup-install-btn');

    if (guggy) { guggy.src = 'images/corg.png'; guggy.classList.add('singing'); }
    // The song's lyrics are three corgs between two quavers.
    if (subtitle) subtitle.innerHTML = `&#9834; ${corgWordHTML()} ${corgWordHTML()} ${corgWordHTML()} &#9834;`;

    setupSong = new Audio(SETUP_SONG);
    setupSong.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    setupSong.onended = endSetupSequence;
    setupSong.play().catch(() => { });

    if (btn) btn.classList.add('visible');
}

function endSetupSequence() {
    if (setupDone) return;
    setupDone = true;

    setupTimers.forEach(clearTimeout);
    setupTimers = [];

    [setupAudio, setupSong].forEach((a) => {
        if (!a) return;
        a.onended = null;
        a.onerror = null;
        a.pause();
    });
    setupAudio = null;
    setupSong = null;

    const screen = document.getElementById('setup-screen');
    if (screen) screen.classList.remove('open');
    const guggy = document.getElementById('setup-guggy');
    if (guggy) guggy.classList.remove('visible', 'singing');

    showBootMenu();
}

// Boot manager. Every entry is a theme of this same desktop — the whole game
// (CORG_Clicker, Black Market, the games, ads, taskbar) stays intact and gets
// redrawn in that OS's visual style.
// Each OS is the medium you'd actually have installed it from, and in that
// order: floppy, CD, DVD, USB. (The list used to run 95 / 11 / XP / 7; it's
// chronological now so the carousel reads as the progression it is.)
// `tag` is the line under the name on the selected capsule — where gaming mode
// prints "LAST TWO WEEKS: 25 MIN" — and `tint` is the capsule's artwork colour,
// each one that era's own.
const BOOT_OPTIONS = [
    // `edition` is what's printed on the medium itself — the line under the
    // name on the floppy's sticker and on the disc's label. 95 really did ship
    // on thirteen floppies.
    { id: 'win95', name: 'CORGOS 95', theme: 'win95', media: 'floppy', sub: '3.5-inch floppy disk', edition: 'Setup &mdash; Disk 1 of 13', tag: 'RELEASED AUGUST 1995', tint: '#1c6a86' },
    { id: 'winxp', name: 'CORGOS XP', theme: 'winxp', media: 'cd',     sub: 'CD-ROM',               edition: 'Professional',              tag: 'RELEASED OCTOBER 2001', tint: '#2c6c34' },
    { id: 'win7',  name: 'CORGOS 7',  theme: 'win7',  media: 'dvd',    sub: 'DVD-ROM',              edition: 'Ultimate',                  tag: 'RELEASED OCTOBER 2009', tint: '#4a3a86' },
    { id: 'win10', name: 'CORGOS 10', theme: 'win10', media: 'dvd',    sub: 'DVD-ROM',              edition: 'Home',                      tag: 'RELEASED JULY 2015',    tint: '#12639e' },
    { id: 'win11', name: 'CORGOS 11', theme: 'win11', media: 'usb',    sub: 'USB flash drive',      edition: 'Installation Media',        tag: 'RELEASED OCTOBER 2021', tint: '#1f5ea8' },
    { id: 'corgpilotos', name: 'CORGOS COPILOT', theme: 'corgpilotos', media: 'usb', sub: 'Cloud-delivered', edition: 'Copilot+ Edition', tag: 'RELEASES CONTINUOUSLY', tint: '#6b4fd0' },
];

// The objects themselves. Six faces where a thing is a box, two where it's a
// disc; every panel and highlight is in style.css, so these are only the
// skeletons. `.f-*` faces inherit the box's background, which is why a body
// colour is set once on the box and not per face.
// Anything drawn on the front of a box has to be a child of the front face,
// not a sibling of it: a sibling sits at z=0, halfway through the object, and
// the front face covers it.
function bootBoxFaces(frontHTML) {
    return `<div class="f f-front">${frontHTML || ''}</div><div class="f f-back"></div>`
        + '<div class="f f-left"></div><div class="f f-right"></div>'
        + '<div class="f f-top"></div><div class="f f-bottom"></div>';
}

// Each takes the BOOT_OPTIONS entry, because the medium is labelled: a sticker
// on the floppy, a printed face on the discs. Unbranded media is what made
// these read as generic shapes rather than as something you'd install an OS
// from — the label is the difference, not the polygon count.
const BOOT_MEDIA = {
    floppy: (o) => `<div class="boot-obj b3 o-floppy">${bootBoxFaces(
        '<div class="floppy-shutter"></div><div class="floppy-notch"></div>'
        + `<div class="floppy-label">
               <div class="floppy-label-title">${o.name}</div>
               <div class="floppy-label-sub">${o.edition}</div>
           </div>`
    )}</div>`,

    // The print goes on the top face, which is the one you see — so it's a
    // pressed disc read label-up, with the unprinted rim left iridescent the
    // way a real one is. The sheen stays outside .disc-spin so the reflection
    // holds still while the disc (and its label) turn under it.
    cd: (o) => bootDiscHTML('o-cd', o),
    dvd: (o) => bootDiscHTML('o-dvd', o),

    usb: (o) => `<div class="boot-obj o-usb">
        <div class="b3 usb-plug">${bootBoxFaces()}</div>
        <div class="b3 usb-body">${bootBoxFaces(
            o && o.id === 'corgpilotos' ? '<img class="usb-corgpilot-logo" src="images/corgpilot.png" alt="Corgpilot">' : ''
        )}</div>
        <div class="usb-led"></div>
    </div>`,
};

// The four-pane waving flag. It's the one element that makes a silver disc read
// as a *Windows* disc rather than as any old CD, and it was the thing most
// obviously missing — the discs were a coloured circle with a name on them.
// Drawn as paths rather than four skewed divs because the panes genuinely
// curve; a CSS perspective fake reads as a folded napkin at this size.
const BOOT_FLAG_SVG = `<svg class="disc-flag" viewBox="0 0 48 44" aria-hidden="true">
    <path class="pane-a" d="M2 8.6C12 3.4 19.5 5.2 22.6 6.2V20.4C19.5 19.4 12 17.6 2 22.8Z"/>
    <path class="pane-b" d="M25.4 6.6C30.5 7.9 38 10.4 46 6.2V20.4C38 24.6 30.5 22.1 25.4 20.8Z"/>
    <path class="pane-c" d="M2 25.2C12 20 19.5 21.8 22.6 22.8V37C19.5 36 12 34.2 2 39.4Z"/>
    <path class="pane-d" d="M25.4 23.2C30.5 24.5 38 27 46 22.8V37C38 41.2 30.5 38.7 25.4 37.4Z"/>
</svg>`;

const BOOT_FLAG_WIN10_SVG = `<svg class="disc-flag disc-flag-win10" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#ffffff" d="M0,3.44 L9.84,2.06 L9.84,11.23 L0,11.23 Z M0,12.77 L9.84,12.77 L9.84,21.94 L0,20.56 Z M11.14,1.87 L24,0 L24,11.23 L11.14,11.23 Z M11.14,12.77 L24,12.77 L24,24 L11.14,22.13 Z"/>
</svg>`;

// Laid out the way the real discs are: flag and wordmark grouped above the
// hub, edition below it, the small print in a ring nearer the middle, and the
// print stopping short of the edge so the disc keeps a bare iridescent rim.
function bootDiscHTML(kind, o) {
    const isWin10 = o && o.id === 'win10';
    const discKind = isWin10 ? 'o-dvd-10' : kind;
    const flagSvg = isWin10 ? BOOT_FLAG_WIN10_SVG : BOOT_FLAG_SVG;
    const wordmark = kind === 'o-cd'
        // XP's wordmark: name, then the version set small, lowercase and orange.
        ? `<span class="disc-word">${o.name.replace(/\s+(\S+)$/, '</span><span class="disc-word-ver">$1')}</span>`
        : `<span class="disc-word">${o.name}</span>`;

    return `<div class="boot-obj o-disc ${discKind}">
        <div class="disc-spin">
            <div class="disc-face top">
                <div class="disc-print">
                    <div class="disc-print-brand">${flagSvg}<div class="disc-print-word">${wordmark}</div></div>
                    <div class="disc-print-sub">${o.edition}</div>
                    <div class="disc-print-fine">CORG Corporation &middot; Made in Gugslop</div>
                </div>
            </div>
            <div class="disc-face bottom"></div>
        </div>
        <div class="disc-sheen"></div>
    </div>`;
}

let bootSelectedIndex = 0;
let bootClockTimer = null;

/* Gaming mode's two sounds, straight off a Deck. Not playSound() ids: the boot
   menu is outside every OS theme, so it must not pick up the theme's sound
   overrides — these are the shell's own. */
const DECK_SFX_MOVE = 'sfx/deck_ui_tab_transition_01.wav';
const DECK_SFX_SELECT = 'sfx/deck_ui_default_activation.wav';

function playDeckSfx(src) {
    const audio = new Audio(src);
    audio.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
    audio.play().catch(() => {});
}

function showBootMenu() {
    isPaused = true;
    const screen = document.getElementById('boot-menu-screen');
    const list = document.getElementById('boot-os-list');
    if (!screen || !list) return;

    // One capsule per OS, the way gaming mode shelves a library: the selected
    // one widens into the hero and carries the text, the rest stay portrait.
    // Clicking a capsule that isn't selected only selects it — you shouldn't be
    // able to boot the wrong OS by mis-clicking past the one you were reading.
    list.innerHTML = BOOT_OPTIONS.map((o, i) => `
        <div class="deck-capsule" data-os="${o.id}" data-slot="${i}" role="button" tabindex="0"
             title="Boot ${o.name}"
             style="--capsule-tint: ${o.tint};"
             onmouseenter="bootHover(${i})" onclick="bootInto('${o.id}')">
            <div class="deck-capsule-art">
                <div class="boot-media" data-slot="${i}">
                    ${BOOT_MEDIA[o.media] ? BOOT_MEDIA[o.media](o) : ''}
                </div>
            </div>
            <div class="deck-capsule-plate">
                <div class="deck-capsule-name">${o.name}</div>
                <div class="deck-capsule-tag">${o.tag} &middot; ${o.sub}</div>
                <!-- The mouse needs something that looks like a button, not
                     just a tile that happens to be clickable. The whole capsule
                     is still the hit target; this is the affordance. -->
                <div class="deck-capsule-play"><span class="deck-play">&#9654;</span> BOOT</div>
            </div>
        </div>`).join('');

    screen.classList.add('open');
    bootLayoutShelf();
    bootTickClock();
    if (bootClockTimer) clearInterval(bootClockTimer);
    bootClockTimer = setInterval(bootTickClock, 20000);

    document.addEventListener('keydown', bootMenuKeyHandler);
    window.addEventListener('resize', bootLayoutShelf);
}

// The status-bar clock. Gaming mode's is the real time, so this one is too.
function bootTickClock() {
    const el = document.getElementById('deck-clock');
    if (!el) return;
    const now = new Date();
    let h = now.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const m = String(now.getMinutes()).padStart(2, '0');
    el.textContent = `${h}:${m} ${ampm}`;
}

// Which capsule is highlighted.
//
// Nothing moves in here, and that is the point. The shelf used to widen the
// selected capsule into a hero and slide the whole track to re-centre it,
// which made the middle two OSes effectively unreachable with a mouse: hover
// selected a capsule, the selection re-laid-out the shelf, the layout pulled
// a *different* capsule under the stationary cursor, that one selected in
// turn, and the row bolted sideways under your hand. A layout that moves in
// response to being pointed at cannot be pointed at.
//
// So the four capsules are a fixed row now: same size, always captioned, none
// of them ever moves. Selection is a highlight and nothing else, hovering
// highlights, clicking boots, and the arrow keys walk the row for anyone
// without a mouse.
function bootLayoutShelf() {
    const items = document.querySelectorAll('.deck-capsule');
    if (!items.length) return;

    items.forEach((el, i) => {
        const selected = i === bootSelectedIndex;
        el.classList.toggle('selected', selected);

        // .boot-media keeps its own `selected` class as well: the idle float,
        // the spinning disc and the blinking USB LED all key off it.
        const media = el.querySelector('.boot-media');
        if (media) media.classList.toggle('selected', selected);
    });

    const nameEl = document.getElementById('boot-arrow-label');
    if (nameEl) nameEl.textContent = BOOT_OPTIONS[bootSelectedIndex].name;
}

function bootMoveSelection(dir) {
    bootSelectedIndex = (bootSelectedIndex + dir + BOOT_OPTIONS.length) % BOOT_OPTIONS.length;
    playDeckSfx(DECK_SFX_MOVE);
    bootLayoutShelf();
}

// Hovering highlights. Safe to do on every capsule now precisely because the
// highlight has no effect on the layout — the thing under the cursor stays
// under the cursor.
function bootHover(index) {
    if (index === bootSelectedIndex) return;
    bootSelectedIndex = index;
    playDeckSfx(DECK_SFX_MOVE);
    bootLayoutShelf();
}

function bootMenuKeyHandler(e) {
    const screen = document.getElementById('boot-menu-screen');
    if (!screen || !screen.classList.contains('open')) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); bootMoveSelection(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); bootMoveSelection(-1); }
    else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        bootInto(BOOT_OPTIONS[bootSelectedIndex].id);
    }
}

function bootInto(id) {
    const opt = BOOT_OPTIONS.find(o => o.id === id);
    if (!opt) return;

    bootSelectedIndex = BOOT_OPTIONS.indexOf(opt);
    playDeckSfx(DECK_SFX_SELECT);

    const screen = document.getElementById('boot-menu-screen');
    if (screen) {
        screen.classList.remove('open');
    }
    document.removeEventListener('keydown', bootMenuKeyHandler);
    window.removeEventListener('resize', bootLayoutShelf);
    if (bootClockTimer) { clearInterval(bootClockTimer); bootClockTimer = null; }

    setOSTheme(opt.theme);
    saveGame();
    triggerBootSequence();
}

// Fake shut down: plays the current OS's shutdown sound, fades to black, tears
// the desktop back down to a clean state, then returns to the boot menu.
// Progress is saved, NOT wiped — resetGame() (Settings > Format C:\) is still
// the only thing that erases save data.
function shutDown() {
    isPaused = true;
    saveGame();

    ['win11-start-menu', 'win95-start-menu'].forEach((id) => {
        const menu = document.getElementById(id);
        if (menu) menu.style.display = 'none';
    });

    const cfg = OS_THEMES[currentOS] || OS_THEMES.win95;
    if (cfg.shutdownSound) {
        const audio = new Audio(cfg.shutdownSound);
        audio.volume = typeof sfxVolume !== 'undefined' ? sfxVolume : 1.0;
        audio.play().catch(() => {});
    }


    const overlay = document.createElement('div');
    overlay.id = 'shutdown-overlay';
    overlay.innerHTML = '<div class="shutdown-text">Shutting down...</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('on'));

    setTimeout(() => {
        removeAllAds();
        document.querySelectorAll('.screen-overlay').forEach((el) => { el.style.display = 'none'; });
        closeGameApp();
        if (typeof asAbortRound === 'function') asAbortRound();
        if (typeof hopeconStop === 'function') hopeconStop();

        const gugWin = document.getElementById('gugclicker-window');
        if (gugWin) gugWin.style.display = 'none';
        const shop = document.getElementById('shop-overlay-wrapper');
        if (shop) { shop.style.display = 'none'; shop.classList.remove('mobile-open'); }

        overlay.remove();
        showBootMenu();
    }, 2600);
}



// achievements

function checkAchievements() {
    achievements.forEach(ach => {
        // if not already unlocked, and condition is met
        if (!unlockedAchievements.includes(ach.id) && ach.condition()) {
            unlockedAchievements.push(ach.id);
            showAchievementToast(ach);
            renderAchievements(); // refresh list if window is open
            saveGame();
        }
    });
}

function showAchievementToast(ach) {
    // play the new custom achievement sound instead of the window open sound
    playSound('achievement-audio'); 
    
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast-notification';

    toast.innerHTML = `
        <div style="text-align: left;">
            <strong style="color: var(--win-blue); font-size: 12px; display: block;">Achievement Unlocked!</strong>
            <span style="font-size: 11px;">${ach.title}</span>
        </div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500); 
    }, 5000);
}

function toggleAchievements() {
    const screen = document.getElementById('achievements-screen'); 
    
    if (screen.style.display === 'flex') {
        screen.style.display = 'none';
        isPaused = false;
    } else {
        renderAchievements();
        isPaused = true; 
        screen.style.display = 'flex';
        if (typeof playSound === 'function') playSound('window-open-audio');
    }
}

function renderAchievements() {
    const container = document.getElementById('achievements-list'); 
    container.innerHTML = ''; 

    achievements.forEach(ach => {
        const isUnlocked = unlockedAchievements.includes(ach.id);
        const achDiv = document.createElement('div');
        
        achDiv.className = `achievement-item ${isUnlocked ? 'achievement-unlocked' : 'achievement-locked'}`;

        // Achievements are text-only now — no icons, so nothing to click into
        // a full-size viewer either.
        achDiv.innerHTML = `
            <div class="achievement-text">
                <strong>${ach.title}</strong>
                <span>${ach.desc}</span>
            </div>
        `;
        container.appendChild(achDiv);
    });
}





// ---------------------------------------------------------------------------
// More Corgs
//
// corg.exe on the desktop clones the Corg you already have. Clones are the
// same markup minus the speech bubble and minus every id — ids have to stay
// unique, and the tip system (showGuggyTip, handleGuggyResponse, the bubble)
// addresses the original by id. So the original is the one that talks; the
// clones just exist, get dragged, thrown, bounced and shoved about.
//
// If the original is ever the one you delete, promoteToPrimaryCorg() hands the
// bubble and the ids to a survivor, so there is always exactly one talking Corg
// for as long as there is any Corg at all.
// ---------------------------------------------------------------------------
function spawnExtraCorg() {
    const source = document.querySelector('.guggy-container');
    if (!source) return;

    const clone = source.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.remove('dragging', 'falling');
    clone.classList.add('corg-clone');
    clone._dragWired = false;
    clone._corg = null;

    // Strip the bubble and every id the original owns.
    const bubble = clone.querySelector('.guggy-bubble');
    if (bubble) bubble.remove();
    clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

    // Only the original talks, so a clone's picture is just a picture — no
    // triggerGuggy() on it.
    const group = clone.querySelector('.guggy-icon-group');
    if (group) group.removeAttribute('onclick');

    const img = clone.querySelector('.corg-img');
    if (img) {
        img.classList.remove('squash');
        img.style.removeProperty('--squash');
    }

    // Drop the new one in from above the middle of the screen with a shove to
    // one side, so it visibly arrives instead of appearing on top of another.
    const width = source.getBoundingClientRect().width || 120;
    clone.style.left = Math.max(10, Math.random() * (window.innerWidth - width - 20)) + 'px';
    clone.style.top = '-40px';
    clone.style.bottom = 'auto';
    clone.style.right = 'auto';

    document.body.appendChild(clone);
    makeGuggyDraggable(clone);
    launchGuggy(clone, (Math.random() * 2 - 1) * 600, 200);

    if (typeof playGuggyVoice === 'function') playGuggyVoice(CORG_SFX);
    return clone;
}

// Moves the bubble and the ids onto another Corg, so whoever is left can still
// talk. Called when the Corg being deleted is the one that owns them.
function promoteToPrimaryCorg(container) {
    const old = document.getElementById('guggy-container');
    if (!container || container === old) return;

    if (old) {
        const bubble = old.querySelector('.guggy-bubble');
        if (bubble) container.insertBefore(bubble, container.firstChild);
        old.removeAttribute('id');
        // Free the id before handing it over, so getElementById can't come
        // back with the Corg that's on its way out.
        const oldImg = old.querySelector('.corg-img');
        if (oldImg) oldImg.removeAttribute('id');
    }

    container.id = 'guggy-container';
    container.classList.remove('corg-clone');

    const img = container.querySelector('.corg-img');
    if (img) img.id = 'guggy-img';
}

function removeCorg(container) {
    if (!container) return false;

    // The hard rule: the desktop is never Corgless.
    if (allCorgs().length <= 1) return false;

    cancelGuggyFall(container);

    if (container.id === 'guggy-container') {
        const survivor = allCorgs().find((c) => c !== container);
        if (survivor) promoteToPrimaryCorg(survivor);
    }

    container.remove();
    return true;
}

// ---------------------------------------------------------------------------
// Right-click menu on any Corg
// ---------------------------------------------------------------------------
function corgMenuElement() {
    let menu = document.getElementById('corg-context-menu');
    if (menu) return menu;

    menu = document.createElement('div');
    menu.id = 'corg-context-menu';
    menu.className = 'corg-context-menu';
    document.body.appendChild(menu);

    // Anything that isn't the menu itself closes it.
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#corg-context-menu')) hideCorgMenu();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideCorgMenu();
    });
    window.addEventListener('blur', hideCorgMenu);

    return menu;
}

function hideCorgMenu() {
    const menu = document.getElementById('corg-context-menu');
    if (menu) menu.style.display = 'none';
}

function showCorgMenu(container, clientX, clientY) {
    const menu = corgMenuElement();
    const isLastCorg = allCorgs().length <= 1;

    menu.innerHTML = '';

    const addItem = (label, disabled, onPick, note) => {
        const item = document.createElement('div');
        item.className = 'corg-menu-item' + (disabled ? ' disabled' : '');
        item.textContent = label;
        if (note) item.title = note;
        if (!disabled) {
            item.onclick = () => { hideCorgMenu(); onPick(); };
        }
        menu.appendChild(item);
    };

    addItem('Add another Corg', false, () => { playSound('upgrade-audio'); spawnExtraCorg(); });

    const sep = document.createElement('div');
    sep.className = 'corg-menu-sep';
    menu.appendChild(sep);

    addItem(
        isLastCorg ? 'Delete Corg (last one — no)' : 'Delete Corg',
        isLastCorg,
        () => {
            if (removeCorg(container)) {
                playSound('recycle-audio');
                if (typeof playCorgBounceSfx === 'function') playCorgBounceSfx(1);
            }
        },
        isLastCorg ? 'CORGOS requires at least one Corg to function.' : ''
    );

    menu.style.display = 'block';

    // Flip the menu back on screen if it would hang off an edge.
    const rect = menu.getBoundingClientRect();
    const x = Math.min(clientX, window.innerWidth - rect.width - 4);
    const y = Math.min(clientY, window.innerHeight - rect.height - 4);
    menu.style.left = Math.max(0, x) + 'px';
    menu.style.top = Math.max(0, y) + 'px';
}

document.addEventListener('contextmenu', (e) => {
    const container = e.target.closest('.guggy-container');
    if (!container) return;
    e.preventDefault();
    showCorgMenu(container, e.clientX, e.clientY);
});

// ---------------------------------------------------------------------------
// Corg screensaver
//
// The DVD idea, with a Corg. After screensaverDelay seconds without a click,
// keypress, scroll or mouse move, the desktop blacks out and a Corg drifts
// around bouncing off the edges — changing hue on every bounce, and doing
// something louder on the corner hit everyone waits for. Any input at all puts
// it away.
// ---------------------------------------------------------------------------
const SCREENSAVER_SPEED = 170;      // px/s
const SCREENSAVER_CORNER_SLOP = 12; // px — how exact a "corner hit" has to be
let screensaverDelay = 45;          // seconds; 0 disables it
let screensaverTimer = null;
let screensaverFrame = null;

function screensaverElements() {
    let overlay = document.getElementById('corg-screensaver');
    if (overlay) return { overlay, logo: overlay.querySelector('.screensaver-corg') };

    overlay = document.createElement('div');
    overlay.id = 'corg-screensaver';
    overlay.className = 'corg-screensaver';
    overlay.innerHTML =
        '<div class="screensaver-corg">'
        + '<img src="images/corg.png" alt="Corg">'
        + '<div class="screensaver-label">corg</div>'
        + '</div>';
    document.body.appendChild(overlay);

    return { overlay, logo: overlay.querySelector('.screensaver-corg') };
}

function startScreensaver() {
    if (screensaverFrame !== null) return;

    const { overlay, logo } = screensaverElements();
    overlay.style.display = 'block';

    const bounds = () => ({
        w: window.innerWidth - logo.offsetWidth,
        h: window.innerHeight - logo.offsetHeight,
    });

    let { w, h } = bounds();
    let x = Math.random() * Math.max(1, w);
    let y = Math.random() * Math.max(1, h);
    const angle = (Math.random() * 0.6 + 0.4) * (Math.PI / 2); // never dead flat
    let vx = Math.cos(angle) * SCREENSAVER_SPEED * (Math.random() < 0.5 ? -1 : 1);
    let vy = Math.sin(angle) * SCREENSAVER_SPEED * (Math.random() < 0.5 ? -1 : 1);
    let hue = Math.floor(Math.random() * 360);
    let last = performance.now();

    const step = (now) => {
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;

        ({ w, h } = bounds());
        x += vx * dt;
        y += vy * dt;

        let hitX = false, hitY = false;
        if (x <= 0) { x = 0; vx = Math.abs(vx); hitX = true; }
        else if (x >= w) { x = w; vx = -Math.abs(vx); hitX = true; }
        if (y <= 0) { y = 0; vy = Math.abs(vy); hitY = true; }
        else if (y >= h) { y = h; vy = -Math.abs(vy); hitY = true; }

        if (hitX || hitY) {
            hue = (hue + 47) % 360;
            logo.style.filter = `hue-rotate(${hue}deg)`;

            // The corner hit. Either edge pair landing within a few px of a
            // corner at the same time counts, which is rare enough to still
            // feel like winning something.
            const nearCorner = (hitX && hitY)
                || (hitX && (y < SCREENSAVER_CORNER_SLOP || y > h - SCREENSAVER_CORNER_SLOP))
                || (hitY && (x < SCREENSAVER_CORNER_SLOP || x > w - SCREENSAVER_CORNER_SLOP));

            if (nearCorner) {
                logo.classList.remove('corner-hit');
                void logo.offsetWidth;
                logo.classList.add('corner-hit');
                if (typeof playCorgBounceSfx === 'function') playCorgBounceSfx(1);
            }
        }

        logo.style.transform = `translate(${x}px, ${y}px)`;
        screensaverFrame = requestAnimationFrame(step);
    };

    screensaverFrame = requestAnimationFrame(step);
}

function stopScreensaver() {
    if (screensaverFrame !== null) {
        cancelAnimationFrame(screensaverFrame);
        screensaverFrame = null;
    }
    const overlay = document.getElementById('corg-screensaver');
    if (overlay) overlay.style.display = 'none';
}

function isScreensaverRunning() {
    return screensaverFrame !== null;
}

function resetScreensaverTimer() {
    clearTimeout(screensaverTimer);
    screensaverTimer = null;
    if (screensaverDelay > 0) {
        screensaverTimer = setTimeout(startScreensaver, screensaverDelay * 1000);
    }
}

// mousemove fires hundreds of times a second during normal play and each one
// would otherwise tear down and rebuild the timer; a moving mouse is a moving
// mouse either way, so sample it.
let lastActivityAt = 0;

function onDesktopActivity() {
    if (isScreensaverRunning()) { stopScreensaver(); resetScreensaverTimer(); return; }

    const now = performance.now();
    if (now - lastActivityAt < 500) return;
    lastActivityAt = now;
    resetScreensaverTimer();
}

function setScreensaverDelay(value) {
    const seconds = Math.max(0, Math.floor(parseFloat(value) || 0));
    screensaverDelay = seconds;

    const label = document.getElementById('screensaver-delay-label');
    if (label) label.textContent = seconds === 0 ? 'off' : seconds + 's';

    const input = document.getElementById('screensaver-delay');
    if (input && input.value !== String(seconds)) input.value = seconds;

    saveGame();
    onDesktopActivity();
}

['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'].forEach((evt) => {
    document.addEventListener(evt, onDesktopActivity, { passive: true });
});
resetScreensaverTimer();


// initialization
// Arms the audio unlock (audio.js) before the title screen goes up, so the
// very first press anywhere — button, background, a key — wakes the sound,
// instead of the menu staying silent until PLAY or SETTINGS is clicked.
initAudioOnInteraction();
playIdleAnimations();
setTimeout(showGuggyTip, 8000);

loadGame(); 
initShop();
startGameLoop(); 
updateClock(); 
setInterval(updateClock, 1000);
showMainMenu();
setInterval(saveGame, 1000);


// ---------------------------------------------------------------------------
// "Life or bath for dry cat"
//
// Type it anywhere — the desktop, a Corgpilot prompt, Notepad — and the video
// opens in a new tab. Only letters go into the buffer, so capitals, spaces and
// quotation marks make no difference: `"LIFE OR BATH for dry cat"` is the same
// phrase as typing it plainly, which is the point of an easter egg nobody is
// told the exact spelling of.
//
// window.open() from inside a keydown is a user gesture, so no popup blocker
// eats it. The buffer only ever holds the last few letters you typed.
// ---------------------------------------------------------------------------
const CAT_PHRASE = 'lifeorbathfordrycat';
const CAT_LINK = 'https://www.youtube.com/watch?v=aIGMXrpoG9c';
let catBuffer = '';

document.addEventListener('keydown', (e) => {
    // Shortcuts aren't typing, and neither is Shift or an arrow key.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!e.key || e.key.length !== 1) return;

    const ch = e.key.toLowerCase();
    if (ch < 'a' || ch > 'z') return;

    catBuffer = (catBuffer + ch).slice(-CAT_PHRASE.length);
    if (catBuffer !== CAT_PHRASE) return;

    catBuffer = '';
    if (typeof playSound === 'function') playSound('corg-audio');
    window.open(CAT_LINK, '_blank', 'noopener');
});
