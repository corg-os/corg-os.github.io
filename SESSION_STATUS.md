# Session Status

## Kevbo mode, windows that move, and Corgpilot (latest pass)

Three unrelated things, all shipped and all driven in a real browser before
being called done (headless Chromium against `node server.js`).

### Kevbo mode — Ad Smasher

Kevbo's complaint: you could hold Corg down, park him on an ad and shake, and
the desktop broke itself. Too easy, and there's no *throw* in it.

So Ad Smasher has a mode where Corg can be flung but not carried. A checkbox on
the start card (or **K**), remembered in `localStorage` under
`corgAdSmasherKevbo`:

- a grab lasts **550ms** (`AS_KEVBO_HOLD_MS`) and then Corg slips out of your
  hands with whatever swing the pointer had at that instant — the same release
  as letting go, just not your decision;
- after any release he's off limits for **650ms** (`AS_KEVBO_REGRAB_MS`), so you
  can't snatch him back out of the air and keep swinging;
- every ad is worth **1.5x**, on its own scoreboard
  (`corgAdSmasherKevboBest` — a Kevbo score and a normal score aren't the same
  achievement).

**Where the rule actually lives.** Not in `adsmasher.js`: only the drag closure
in `makeGuggyDraggable()` can end a drag that's already running, so `main.js`
owns it and exposes `setCorgHoldLimits(holdMs, regrabMs)`. A hold expires by
calling its own `closeDragElement()` off a timer. Both numbers are 0 outside a
round, and `asStartRound` / `asEndRound` / `asAbortRound` are what set and clear
them — outside Ad Smasher, Corg is yours to carry around the desktop as always.

Corg hitting the ground has a sound now: `playCorgDropSfx()` in `audio.js`
(`sfx/concrete_break3.wav`), fired from the hold timer's own callback rather
than from `closeDragElement()`. That distinction is the whole point — letting
go yourself goes through the same function, and that is a throw, not a drop.
Like the glass, it's a direct `new Audio()` rather than a `playSound()` id: the
game's own effect, identical on every theme, and two Corgs can land at once.

The feedback is two classes, in `style.css`: `.corg-slipping` wriggles for
exactly `--corg-hold-ms` (set from the same constant that arms the timer, so the
wriggle *is* the countdown), and `.corg-spent` greys him out during the
cooldown so a refused grab reads as a rule rather than a dropped click.

### CORG_Clicker and Black_Market_Shop can be dragged

They were the only two windows on the desktop that couldn't move, because
they aren't floating windows at all — they're flex children of
`#main-content-wrapper`.

`undockWindow()` in `main.js` handles it: the first time you drag one by its
titlebar (or grab its resize grip), it's measured where it stands, switched to
`position: fixed` at exactly those coordinates — so nothing visibly jumps — and
a hidden `.window-dock-placeholder` of the same size takes its slot in the row.
**The placeholder is the point**: without it the other column snaps out to fill
the gap, and dragging one window would resize the other. Markup opts in with
`.dockable-window`; clicking either window raises it (`bringWindowToFront`).

**The placeholder copies the window's `flex`, not just its pixels** — and that
is a fix, not a detail. It used to hold a frozen pixel width, so if you dragged
CORG_Clicker while the shop was closed, the placeholder pinned the *entire*
width of the row open. "Run Black_Market_Shop.dll" then opened the shop at
`x: 1280` on a 1280px viewport: fully off the right-hand edge, which read as
the button doing nothing at all. Now `undockWindow()` copies the window's
computed `flex` onto the placeholder (and `.window-dock-placeholder` has
`min-width: 0` so it can give the room back), the row still splits 2:1 the
moment the shop reappears, and nothing jumps at the moment of undocking
either.

**And the shop leaves the column when the clicker does** —
`floatShopBesideClicker()` in `main.js`, called from `openShop()`. The flex
copy above puts the shop's column back where it belongs; this is the other half
of "Black_Market_Shop won't launch if you move CORG_Clicker". An undocked
window is `position: fixed` with a z-index above everything still docked, so
with the clicker dragged out over the right of the screen, the shop's column
opened *underneath* it — open, laid out, and invisible, which is
indistinguishable from the button doing nothing. So an undocked clicker now
gets an undocked shop, parked to its right (or its left, if there's no room),
clamped to the viewport and raised above it. Reopening one you have already
dragged somewhere leaves it where you put it and only raises it.

Below 800px nothing undocks — there the shop is a full-screen sheet and the
clicker fills what's left, and neither is a window you'd want to drag around a
phone.

### Corgpilot — CORGOS 11 only

Every Windows 11 has an AI button that opens a panel, thinks for a moment and
writes an answer out a word at a time. This is that, and the answer is always
corg. `corgpilot.js` + the `.corgpilot-window` styles; launchers are the
taskbar button, a desktop icon and a pinned Start-menu tile, hidden on every
other theme by `.win11-only` (the positive twin of `.retro-only`). The icon
everywhere — launchers, titlebar, header, message avatars, the empty state —
is `images/corgpilot.png`, the Copilot mark with a corgi inside it.

The theatre is the whole feature. A question gets a typing indicator and a
0.9–2.2s stall with the status line cycling through lines picked to match what
you asked ("Running the corg linter" for code, "Finding a rhyme for corg" for a
poem), a **"Thought for 1.6s"** drawer you can open, and then an answer that
streams a few characters at a time at a wobbling rate, pausing at commas and
full stops, with a caret that travels with the cursor.

**What comes out depends on what went in.** `CP_INTENTS` matches the question
against seven shapes — code, how-to, comparison, creative, math, summary, live
— and each one picks its own blocks, status lines and follow-up chips. So a
"vs" question gets a comparison table, "how do I install..." gets numbered
steps and a tip callout, "write me a poem" gets verse. The blocks available are
paragraphs (with bolded phrases and inline `corg()` mid-sentence), headings,
bulleted and numbered lists, code blocks with a language tag and a copy button,
tables, blockquotes, callouts and verse. A finished answer grows source cards,
a `corg-4o · 148 tokens · 2.1s` footer, and a hover-revealed action bar (copy,
thumbs, regenerate — regenerate throws the answer away and asks again without
echoing the question twice). Three follow-up chips sit above the composer, in
plain English, because they are the UI rather than the answer.

**The word becomes the dog.** Everywhere else on the desktop the corgify
observer turns "corg" into `images/corg.png` on sight, and the panel still opts
out of that (`data-no-corg`) for the reason it always did: a global observer
rewriting the text mid-stream fights the typing loop over the same node and
stalls the reply at one character. So the panel does the substitution itself,
per line, the moment that line finishes typing — you watch the word get typed
and then turn into a picture of him. Code blocks and backticked identifiers are
exempt; a program made of dogs is not readable. The launchers keep the normal
treatment, so the app is "🐕pilot" out on the desktop and "Corgpilot" inside
its own window.

**He barks every time he writes the word**, not once per answer:
`cpBarkFor()` counts the "corg"s that have actually landed in the element it
is typing into and fires `playSound('corg-audio')` (`sfx/corg.wav`) for each
new one, so an answer comes out as corg, corg, corg, corg for as long as it is
writing — roughly 40 barks over 7s at the default speed. The clip is 0.46s, so
they pile onto each other on purpose. `CP_BARK_GAP_MS` (55ms) is the only
restraint and exists solely so the fast model doesn't ask the browser for
thirty overlapping clips a second, which comes out as one flat noise instead of
as spam; set it to 0 for the flat noise. `corg-audio` is deliberately not in
the win11 sound overrides, so it survives the theme that silences the click and
window-open sounds.

**It does not use AI. It uses corg** — and the panel says so. The disclaimer
read "Corgpilot uses AI. It only says corg", which was both a lie and the one
piece of text in the window still spelled out while every answer above it had
turned into pictures of him. It now reads "Corgpilot does not use AI. It uses
corg", and `cpCorgifyChrome()` gives it, the greeting and the starter cards the
same treatment the answers get. `CP_CORG_RE` also matches the desktop's own
pattern now (`/corg/gi`, tail left behind) rather than eating whole words, so
"Corgpilot" reads as the dog followed by "pilot" in here exactly as it does on
the launchers outside. Only the composer stays spelled out: an `<input>` can't
hold a picture.

**A code block only ever answers a code question.** The default shape used to
deal one out on a 0.18 roll for anything at all, so "write a poem about
rootbeer" could come back as a fenced program — which is the tell that the
shapes are picked at random rather than picked for you. Now `cpAllowCode` is
set for the length of one `cpBuildReply()` and is true only when the question
matched the `code` intent; it gates the fenced block *and* the backticked
`corg()` that used to turn up mid-sentence in any answer, and the maths
callout's answer is bold rather than monospace. Checked across 40 generated
answers per prompt: zero code, fenced or inline, for "what is a corg?", a poem,
a summary, a comparison, a how-to or the weather; one block every time for "fix
my code" and "write a python script".

**Four models, in a picker in the header.** `corg-4o` (balanced, the default),
`corgmini 4.6 flash` (fastest), `corgnet 5` (frontier) and `cork 4.5`
(reasoning). Nothing behind them differs, because there is nothing behind them
— what differs is how the faking feels: `think` scales the stall, `speed` the
typing interval, `depth` the length of the answer and the number of sources,
and `reasons` opens the thinking drawer on arrival and fills it with more
working. So flash answers in under a second and says less, and cork stalls for
five, shows its working and comes back with four sources. The choice persists
in `localStorage` under `corgpilotModel`, the footer under each answer names
the model that wrote it, and switching mid-answer finishes the one in flight
first.

Nothing here talks to anything — no model, no network, no key. Two more things
worth knowing about the stream: every element is built up front but born
`.cp-pending` (display:none) and revealed by the first job that writes into it,
so you never see an empty "3." or a blank callout sitting below the cursor; and
the typing loop counts its own progress rather than measuring the DOM, so
nothing else rewriting the panel can derail it. **Send** becomes **Stop**
mid-answer (which fills every outstanding line in at once rather than
abandoning them half written), **New chat** wipes the transcript back to the
empty state, and Escape closes the window.

### The Start menu drops back into the taskbar

11's Start menu rose out of the taskbar and then vanished on the way out. The
CSS for the drop was already there (`.win11-start-menu.closing` +
`win11SlideDown`) with a comment saying `toggleStartMenu()` sets the class —
and nothing ever did, so closing was a cut. `hideStartMenu()` in `main.js` is
the missing half: it adds `.closing`, waits for `animationend` (with a timer as
the backstop, because that event never fires if the animation is dropped) and
only then sets `display: none`. The outside-click handler goes through it too.

`showStartMenu()` is its opposite number, and it hides/reflows/shows on purpose:
the rise is an animation on the element itself, so re-opening a menu that is
still closing would otherwise snap into place with no rise at all. Both
animations now travel 96px with a slight scale off `transform-origin: 50% 100%`
— it grows out of the taskbar edge rather than sliding past it. Reduced motion
skips straight to hidden, and the 95/XP/7 menus are unchanged (they never
animated).

### Corgpilot's taskbar mark

`images/corgpilot.png` is a rounded blob with transparent padding baked into
the file, so it always renders a size smaller than the flat square icons next
to it — at 16px it looked like a mistake, at 22px it still sat small. The
`.corgpilot-btn-icon` rule now draws it at 27px with a -4px vertical margin,
which matches the weight of a 16px flat icon and still clears the 36px button.

### "Life or bath for dry cat"

Type it anywhere — the desktop, a Corgpilot prompt, Notepad — and the video
opens in a new tab. The buffer at the bottom of `main.js` only takes letters,
so capitals, spaces and quotation marks make no difference and the phrase is
found inside whatever else you were typing; `window.open()` runs inside the
keydown, so it counts as a user gesture and no popup blocker eats it.

## HOPECON_Tracker.exe

The hopecon scale is a real thing people made up: five bands for how close
Half-Life 3 feels this week, from "the announcement trailer is up" down to
"cancelled, do not look outside". `images/hopecon.png` is that chart, and it is
the app — the tracker's whole job is to point at the band we are on and say so.
**We are on 3**: someone heard a rumour from someone at a yacht thing.
`hopecon.js` + the `.hopecon-window` styles + `images/hopecon.svg` for the
icon; desktop icon, Start-menu entry and pinned 11 tile, on every theme.

**It was rebuilt to stop looking like a dashboard.** The first pass had four
gauges inventing decimals on a timer, a status feed writing itself, a ticking
clock and a pulsing level ladder — all of it generated, none of it about
anything, which is exactly the smell of a page nobody actually made. What
replaced it is the sort of page a person makes for one fact they care about too
much: the chart, the band marked on it, the clip, a log, and a line admitting
nobody official is behind any of it. Nothing ticks. The one moving part is the
"Check again" button, which really does go and look, takes a moment about it,
and comes back with 3 — and the log only grows when you press it.

**It tracks the hopecon, not hopecon news.** The rebuild still seeded the log
with four dated entries — a rumour from a guy at a yacht thing, strings
resurfacing in a branch, two check-ins — and a "held at 3 for 157 days"
counter. All of that was the app inventing events and presenting them as things
that happened, which is the same failure as the gauges, just wearing a date. It
is gone: the panel under the clip is now **CHECKS**, it starts empty, and the
only thing that ever writes to it is you pressing the button. What the levels
*mean* stays, because that is the scale itself rather than a report.

**The band markers are percentages of the artwork**, measured off the PNG by
row variance rather than by eye (1024x2048; band 3 is 41.02% down and 17.19%
tall). The four bands we aren't on are dimmed, the one we are on is left bright
and outlined with a "WE ARE HERE" tag, and hovering the chart lifts the dimming
so you can read the whole scale. This only works because `.hc-chart` carries
the image's own 1:2 aspect ratio and the image fills it corner to corner —
letterbox the picture inside a box of some other shape and every marker drifts
by however much empty space ends up above it, which is what the first attempt
did. Squeeze the window too short and the box squashes rather than
letterboxing: the picture goes slightly short, the markers stay put.

VCR OSD Mono (already in `fonts/`) for the numerals and labels, Half-Life
orange on near-black, 1px borders, no gradients.

**The clip is two files on purpose.** `videos/hopecon3.mp4` as delivered is
HEVC at 2534x1080 and 43MB, and most browsers won't decode HEVC at all (Chrome
only where the OS hands it a hardware decoder) — the panel was a black
rectangle in headless Chromium until the encode was checked.
`videos/hopecon3-h264.mp4` is the same clip in H.264 at 1280 wide and 4.8MB,
listed first in the `<video>`; the original is the second `<source>` and the
browser takes whichever it can play. It starts when the window opens (unmuted,
at `musicVolume`, falling back to muted if a browser refuses the sound) and
stops when it closes. `hopeconStop()` is wired into `shutDown()`, because that
hides every `.screen-overlay` behind the app's back, and a video still playing
inside a hidden window is a haunting.

## Two more OSes

The boot menu is six capsules now. Both new entries are `OS_THEMES` +
`BOOT_OPTIONS` entries and a block of `style.css`, the same as the four that
were already there.

### CORGOS 10 — flat, square, one accent

Written from scratch. `tvillarete/win10-replica` was suggested as the source
and was checked first: **it publishes no licence**, so there is no grant to
copy anything from it, and nothing of its is here — see `THIRD_PARTY.md`. The
theme is 10's own three decisions (everything a rectangle, everything near-white
or near-black, one accent blue doing all the highlighting), the Start mark and
wallpaper under `images/win10/` are drawn for this project, and the square
90-degree corner is load-bearing: 7 is glass, 11 is rounded, and the hard
corner is what dates 10 between them.

Its sounds are the win7 pack, which is correct rather than lazy — 10 shipped
the Vista/7 scheme unchanged — and `bootSound`, `logonSound` and
`shutdownSound` are all `null`, because Microsoft switched the boot jingle off
in 8 and never switched it back on. **Booting CORGOS 10 is silent on purpose.**

### CORGOS COPILOT — 11, with the assistant in every socket

Modern Windows keeps finding new places to put Copilot, so this theme takes it
to the end of the line: there is one app, it is on every icon, and whatever you
launch you get it. The body wears `win11-theme` *and* `corgpilot-theme`
(`bodyClass` is a list now), so everything 11 styles it styles too and the
extra block only holds the joke.

The rest is `applyCorgpilotOS()` in `main.js`, in two reversible halves,
because switching OS re-themes the live desktop rather than reloading the page:

- **the paint** — every launcher's icon becomes the Corgpilot mark and every
  label becomes "Corgpilot", with the original stashed in a `data-corg-was-*`
  attribute so leaving the theme puts it all back. Desktop icons and menu
  entries label themselves with a `<span>`; taskbar buttons use a bare text
  node, and missing that left half the desktop still wearing its old names.
- **the wiring** — one capture-phase click handler that swallows launcher
  clicks and opens Corgpilot instead, before the inline `onclick` can run. That
  is what makes it work without touching two dozen `toggle*` functions. It is
  open-or-focus rather than a toggle, because with every icon opening the same
  app a second click would otherwise close it.

`isWin11Shell()` is the other half of the trick: the Start menu, and anything
else picking a shell by `currentOS === 'win11'`, has to count CORGOS COPILOT as
an 11 or it opens the 95 menu on an 11 desktop.

## COEP vs. the embeds, and a title screen that can be heard

Three things that were all, underneath, the same bug: the page is served
cross-origin-isolated (`COOP: same-origin` + `COEP: credentialless`, because
Half-Life's WASM threads need `SharedArrayBuffer`), and a COEP document refuses
to frame anything that doesn't declare COEP itself — which is every third-party
embed on the web.

- **The YouTube ads play again.** The VNN player ads in `data.js` were blocked,
  blank frames on any host that sends the isolation headers (`node server.js`
  and Netlify; the live Cloudflare deploy currently sends none, which is why
  they still worked there). The fix is the `credentialless` attribute on the
  iframe — the escape hatch designed for exactly this, loading the embed in a
  cookie-less context instead of refusing it. Switched to `youtube-nocookie.com`
  to match, since the frame gets no cookies either way.

- **Corg Explorer stops being told it's an iframe.** Stripping
  `X-Frame-Options`/CSP off the upstream *response* only ever covered one of the
  three ways a site refuses to be framed. Now, in all three copies of the proxy
  (`server.js`, `netlify/functions/gugexplorer-proxy.mjs`, `_worker.js` — one
  contract, keep them in sync):
  - `stripFramingMeta()` removes the same policies declared as
    `<meta http-equiv>`. A meta CSP is honoured exactly like the header, and one
    carrying a `script-src` also killed the proxy's own injected shims, which
    turned "framed site" into "blank page". `http-equiv="refresh"` goes with
    them — it points at the real URL, so it bounced the frame out of the proxy
    and into a direct, blocked load.
  - `relaxNestedFrames()` puts `credentialless` on every `<iframe>` inside a
    proxied page, so embeds within a proxied site aren't blocked the way the
    ads were.
  - `UNFRAME_SHIM` runs before the page's own scripts and hides the framing from
    the checks that look at `frameElement` and `parent`. `top` is
    `[LegacyUnforgeable]` and can't be shadowed, so a page comparing `top` with
    `window` can still tell — the sandbox is what makes that harmless.
  - **The Explorer iframe dropped `allow-same-origin`.** Proxied pages are
    served from our own origin, so with it they were same-origin with the game:
    `frameElement` pointed straight at the element, `top` was readable, and
    anything that got through could have reached the desktop and the save. Every
    proxied page now runs on an opaque origin. What that costs, the proxy pays
    back: CORS headers (plus an `OPTIONS` short-circuit) on its own responses so
    the fetch/XHR shim still works, and in-memory `localStorage` /
    `sessionStorage` / `document.cookie` stand-ins in the shim, because in an
    opaque origin those *throw* rather than read empty and a great many sites
    touch one of them in their first inline script.

- **The title screen makes noise before you click a button.** `PLAY`'s rollover
  sound was silent until you'd pressed something, because `initAudioOnInteraction()`
  was defined and never called, and the only unlock it would have armed was a
  `click` on `<body>`. It's now called from `main.js`'s init and armed on
  `pointerdown`/`mousedown`/`touchstart`/`keydown` in the capture phase, anywhere
  on the page. The menu's two sounds are also decoded up front and played as
  buffer sources off the running context rather than a fresh `new Audio()` per
  hover, so they land while the cursor is still on the button.
  - A hover is not a user gesture, and no browser will play anything before one,
    so hovering a freshly loaded title screen genuinely cannot make a sound.
    That's what the new `#mm-audio-hint` line ("click anywhere to enable sound")
    is for; it fades out for good on the first press.

- **Note on the live site:** `https://gugclicker.com/gugexplorer-proxy` answers
  404 and the site sends no COOP/COEP headers, which means the deployed build
  isn't running `_worker.js` — so the in-game browser is offline there and
  Half-Life has no `SharedArrayBuffer`. That's a deploy problem, not a code one:
  Pages needs `_worker.js` at the root of the *deployed* directory (advanced
  mode), and it ignores `netlify.toml` and, in advanced mode, `_headers` too.

## index.html — what's what

`index.html` carries no comments; anything worth saying about the markup is
here instead, keyed by the element it's about. (It's the one file whose
comments are visible to anyone who opens the page and hits inspect element.)

**Desktop icons** (`#desktop-icons`)
- `toggleHalfLife()` — Half-Life is its own app: no storefront in front of it,
  the icon on the desktop is the game and it opens the game.
- `.retro-only` on Pong — a bundled time-waster is an old-Windows thing
  (Microsoft stopped shipping them after XP), so it's hidden on 7 and 11.
- Ad Smasher, Flappy Corg and Angry Corgs are the game's *own* games rather
  than bundled Windows ones, so no `.retro-only`: they're on every theme. Ad
  Smasher is played on the desktop itself, so its "window" is only a scoreboard.
- `spawnExtraCorg()` — no upper limit; the only rule is that the last Corg
  can't be deleted (see `removeCorg`).
- `#desktop-trashcan` — same drop target as the bin inside CORG_Clicker;
  `makeAdDraggable()` checks every `.trash-target`.
- `.guggy-icon-group` has no desktop label: the label was itself a small corg
  picture (the `.corg-word` rule), so Corg came with a miniature Corg stuck to
  his feet. The dog is the icon.

**Shop** — `#tab-btn-gambling` is a fake tab: no panel of its own, never goes
active, it just puts the gambling warning back up.

**Overlays**
- `#gameapp-screen` — the shell every installed game runs in. No storefront
  wrapped around them any more: each is an app that opens straight into itself,
  and the titlebar takes the launched game's own icon and name, so Half-Life is
  a Half-Life window rather than a tab in something else.
- `#gugexplorer-iframe` — the sandbox has **no `allow-same-origin`, and that is
  deliberate**; the full reasoning is in the pass above.
- `#settings-screen` carries the same two extra dials the title screen has.
  Both windows write to the same globals and re-read them when they open, so
  neither can drift. Streamer Mode is gone with the music — its whole job was
  swapping the copyrighted playlist for a safe track, and there is no playlist.
- `.achievements-body` — the panel, heading and rows are styled from
  `style.css` rather than inline, so each OS theme can dress the window as its
  own era instead of leaving CORGOS 95 bevels on an XP / 7 / 11 desktop.
- `#minesweeper-screen` — movable but not resizable (`.no-resize`): the board is
  a fixed grid of fixed cells, so there is exactly one right size for it.
  `.mine-board` shrinks to the grid's width and is centred, so the board doesn't
  sit left-aligned inside the window's 220px min-width, and the HUD tracks the
  grid's width.
- `#pong-screen`, `#flappycorg-screen`, `#angrycorgs-screen` — the playfield is
  one canvas drawn in its own coordinates by the matching `.js`; everything
  around it is window chrome. Angry Corgs is slingshot left, popups right.
- `#adsmasher-screen` — the game is played on the desktop, not in a window, so
  this is only a scoreboard and a card. The overlay is `pointer-events: none`:
  everything under it (the ads, Corg, the bin) has to stay grabbable, because
  that IS the game. `#as-radio` only shows while a round is playing something,
  because that's the only time there's a station.
- `#login-screen` — per-OS, shown between the boot splash and the desktop;
  contents built by `showLoginScreen()` to match the booted theme.

**Title screen** (`#main-menu-screen`)
- Shown before anything else; PLAY runs the intro cutscene. Every button carries
  the shell's own hover/click sounds (`menuHoverSfx` / `menuClickSfx`) rather
  than `playSound()` ids, because no OS has booted yet — there's no theme to
  sound like.
- `.mm-wordmark` — the dog and the "OS" together are the wordmark, [corg]OS, the
  same way the boot manager's status bar and every install disc write it. The
  letters sit at the dog's left, i.e. our right, so it reads in that order.
- The dev toggle lives inside SETTINGS, so the menu itself is only PLAY and
  SETTINGS. The three dials are three because what they control is genuinely
  separate — the radio, everything else, and the glass, which is the loudest
  sound in the game and the one the footer warns about. All three write through
  to the Control Panel's copies of the same sliders.
- `.main-menu-warning` — the intro ends with a screenful of glass going and the
  ads break the same way all game. Said here rather than in a dialog nobody
  reads: this is the last screen before the noise.
- `.main-menu-version` — out of the way in the corner, the way a build number is.

**Intro / boot**
- `#intro-video-screen` — the video plays, holds on its last frame, and Corg
  comes through it from the middle of the screen using the desktop's own
  pane-of-glass break (`shatterAd`'s shards and its `glass_sheet_break` takes),
  aimed at the video instead of an ad. He says corg, and it fades to the boot
  manager. `#intro-shards` is where the shards of the frozen frame land.
- `#setup-screen` — the "Windows Setup"-style screen where Corg introduces
  himself. **Not in the flow any more**: the intro cutscene replaced it and
  nothing calls `startSetupSequence()`. Kept, markup and code both, because it's
  a whole finished scene and putting it back is one call.
- `#boot-menu-screen` — picks which OS theme to start into, dressed as SteamOS
  gaming mode (status bar, shelf of capsules, controller legend), because
  picking what to boot off a shelf of big artwork is exactly what that UI is
  for. Capsule art is the CSS install media (floppy / CD / DVD / USB).
  `#boot-os-list` is filled by `showBootMenu()`: one capsule per OS, in a fixed
  row that never moves, scrolls or resizes when you point at it — see
  `bootLayoutShelf()` for why that matters. The mouse hint is said before the
  controller legend because the mouse is the primary input here.

**Scripts** — `win9xcanvas.js` is the Windows chrome drawn on a canvas (the
bevels, the dither, the dialog boxes) that Flappy Corg and Angry Corgs are built
out of.

## Status bars, XP's apps everywhere, no music (previous pass)

- **The scoreboards are Windows status bars.** Flappy Corg, Angry Corgs and Ad
  Smasher all wore a black-and-gold arcade marquee: monospaced, navy panes,
  amber digits. It was the last thing insisting these were something other than
  programs — the canvas below it is bevels and dialog boxes, and the bar above
  it was a cabinet. They're grey now, with the window's own face, sunken panes,
  label left and value right in plain black in the OS's font. Same construction
  as Minesweeper's header a few hundred lines up in `style.css`, because it's
  the same part of the same kind of window.
  - **Pong got it too.** It wasn't asked for, but three of the four game
    windows changing would have moved the odd-one-out from three windows to
    one; it's the same ten lines of CSS.
  - Ad Smasher's start/over card came with them: a grey dialog panel with a
    push button rather than a translucent dark card with a neon-green CTA, and
    the chain shout is a small grey plaque instead of glowing text.
  - `font-variant-numeric: tabular-nums` stands in for the monospace, which is
    all the monospace was really doing — keeping a counter from shoving its
    label about as it counts.

- **Minesweeper, Paint and Notepad are on every theme.** They were `.xp-only`.
  There was no reason a corgi's Windows 11 shouldn't ship the three best things
  on the desktop. The class itself stays in `style.css` as the hook for
  anything that genuinely belongs to one era — `.retro-only` is still doing
  exactly that for Pong, which is a joke about Microsoft dropping the bundled
  games after XP and only works if it stays gated.
  - That's 14 desktop icons on 95 and XP; the second-column wrap from the last
    pass absorbs them with nothing over the taskbar.

- **Minesweeper can't be resized.** `makeWindowDraggable()` now skips
  `addResizeGrip()` for `.no-resize`, and the Minesweeper window carries it.
  The board is a fixed grid of fixed cells, so the window has exactly one
  correct size and dragging it larger only added grey. The real one couldn't be
  resized either. It still drags by its titlebar.

- **The music is gone.** Not muted — removed. *(Since superseded in one place
  only: Ad Smasher's radio, three tracks in `music/adsmasher/`, on its own
  `musicVolume` slider. Everything below still holds — none of the old playlist
  machinery came back, and the radio is self-contained in `adsmasher.js`.)*
  - Deleted: `musicPlaylist` and the five tracks it cycled, `TRUE_ENDING_MUSIC`,
    the `#bgm-audio` element, `streamerAudio`, `playNextSong()`,
    `resumePlaylistMusic()`, `playTrueEndingMusic()`, `updateBGMVolume()`,
    `bgmVolume`, `bgmMuted`, `currentSongIndex`, both music sliders (Control
    Panel and the title screen), and every `.play()`/`.pause()` pair scattered
    through `loadGame`, `checkWelcome`, `closeWelcome`, `triggerGameOver`,
    `resumeGame`, `resumeTrueVictory` and `shutDown`. `bgmMuted`,
    `bgmVolume` and `currentSongIndex` are out of the save object too; an old
    save carrying them is simply ignored.
  - **Streamer Mode went with it.** Its entire job was swapping the
    copyrighted playlist for a safe track (`branescan.flac`); with no playlist
    there is nothing to swap, so `toggleStreamerMode()`, `isStreamerMode` and
    the Control Panel button are gone.
  - `initAudioOnInteraction()` survives with one job left: the first click
    resumes the suspended `AudioContext`, without which the buffer-source
    effects (Corg's yelp in the games, the glass breaks) are silent the first
    time they fire.
  - **Sound effects are untouched** — the desktop still clicks, chimes, breaks
    glass and corgs at you, and the volume slider for them stays.
  - **Two scripted one-shots were kept** and are worth knowing about, because
    they are songs: the setup screen's `guggycansong.mp3` (which also *drives*
    that sequence — its `ended` is what advances it) and the G-Man ending
    sound. Say the word and the setup song goes too, with a timer in its place.
  - The files under `music/` are left on disk; nothing references them now.
  - Verified per theme with the network log: zero requests to `/music/` on a
    full boot with the first-interaction click.

## The wordmark, aiming past the window edge, the OS's own font

- **The main menu says [corg]OS.** An `OS` after the dog, in `.mm-wordmark`.
  It is positioned *out of flow* inside a box the size of the picture, not laid
  out beside it: side-by-side centres the pair, which shoves the dog off to the
  left of the PLAY/SETTINGS column underneath him. Its `left`/`bottom` are
  percentages because the picture is fluid, and both are measured against the
  dog rather than his generously transparent bounding box — level with his
  feet, tucked in at his flank.

- **Angry Corgs can be aimed past the edge of the window.** `mousemove` and
  `touchmove` were bound to the canvas, so a full draw — which routinely pulls
  the cursor out of the court and often out of the window — simply stopped
  being heard at the canvas edge: the band froze wherever you crossed it and
  the shot went somewhere you hadn't aimed. That was the whole reason it was
  hard to aim. Both are on the **document** now, alongside the `mouseup` that
  already was; `acPointerMove`/`acPointerUp` no-op unless a pull is in
  progress, so listening that widely costs nothing.
  - `window.blur` calls the new **`acCancelPull()`**, not `acPointerUp()`:
    alt-tabbing mid-draw should put the corgi back in the sling, not fire a
    shot you never let go of — and not leave the band stuck at full stretch.
  - Verified by pressing on the sling and dragging to a cursor position outside
    the window entirely (client x = -50): the pull tracks the whole way and the
    release fires, on all four themes.

- **The games are set in the booted OS's own typeface.** MS Sans Serif on 95,
  Tahoma on XP, Segoe UI on 7 and 11. `W9X_FONT` was a fixed stack; it's now
  **`w9xFont()`**, which reads `font-family` off `<body>` — where each theme
  already declares it — so there is one list of fonts in the project rather
  than two that have to be kept in step. Cached against `document.body
  .className` (what `setOSTheme()` changes), because `getComputedStyle` is a
  layout read and every canvas dialog asks for this several times a frame.
  - The two games' HUD readouts dropped their fixed `Courier New` for the same
    reason and now inherit the body font, keeping `font-variant-numeric:
    tabular-nums`, which is the only thing the monospace was really buying.
  - Verified per theme: `w9xFont()` matches the computed body font on 95, XP, 7
    and 11.

## Boot menu stops running away, the games look like Windows

- **The boot shelf no longer moves, and that is the fix.** The previous pass
  gave it hover-to-select on top of a hero capsule that widened and a track
  that slid to re-centre itself. Those two things together made the middle two
  OSes impossible to pick: hovering selected a capsule, the selection re-laid
  out the shelf, the new layout pulled a *different* capsule under a stationary
  cursor, that one selected in turn, and the row bolted sideways under your
  hand. **A layout that moves in response to being pointed at cannot be pointed
  at.**
  - The four capsules are a fixed row now — `flex: 1 1 0` with a max-width, so
    they share the shelf and shrink together instead of overflowing it. Every
    one is captioned all the time (you have to be able to read a tile *before*
    you point at it), and selection is a highlight: white outline, full
    saturation, the green BOOT pill. Nothing changes size or position.
  - `bootCentreTrack()`, `bootFollowSelection()`, `.deck-track`, the arrows and
    `bootWheelHandler()` are all deleted with the scroller they existed to
    drive. The wheel handler was the other half of the "scrolls fast" problem:
    one notch of a real mouse wheel is a `deltaY` of ~100 against a 40px step,
    so every notch jumped two OSes.
  - `.boot-media`'s scale moved from an inline style written by
    `bootLayoutShelf()` into CSS. A transform doesn't affect layout, so the
    highlighted disc growing slightly can't push its neighbours around.
  - Verified by hovering each capsule in turn at 1440, 1280, 1024 and 820 and
    diffing every capsule's box before and after: nothing moves, hovering slot
    N selects exactly N, all four stay fully on screen, and a single click on
    the middle capsule boots CORGOS 7.

- **XP's desktop icons fit again.** XP carries the most apps (its three bundled
  ones plus everything else) and the column ran straight through the taskbar
  once the two new games were added. `#desktop-icons` is `flex-flow: column
  wrap` with a `bottom` of `calc(var(--taskbar-height) + 14px)`, so icons flow
  into a second column exactly like Windows does. `bottom` rather than a height
  is what gives the container a definite size for wrapping to work against, and
  keying it to `--taskbar-height` means each theme clears its own taskbar. All
  14 of XP's icons now sit in two columns with nothing overlapping the taskbar.

- **The cans and crates say GUG, not CORG.** That's the brand on the actual
  can. (Note that HTML can't be used for these: the corgify pass turns the
  letters c-o-r-g into the dog, and canvas text isn't touched by it, so a
  canvas is the one place a brand name has to be spelled right by hand.)

- **Both new games are drawn as Windows programs.** They were two smooth
  illustrations that happened to be embedded in an operating system — gradient
  skies, soft parallax hills, round fluffy clouds, translucent dark cards. Now
  they look like they shipped in the box next to Minesweeper.
  - New **`win9xcanvas.js`**: the 9x visual language as canvas primitives —
    `win9xBevel()` (the two-pixel white/grey/dark-grey/black frame that
    *is* the look, raised or sunken), `win9xDither()` (50% checkerboard, the
    only shading a 16-colour palette had, with the pattern cached per colour
    pair), `win9xDialog()`, `win9xButton()`, `win9xField()`, and the `W9X`
    palette. In one file rather than copied into each game, because two
    hand-copied bevel routines drift apart within a week and then only one of
    the two games looks like Windows.
  - Flat fills everywhere; the only gradient left in either game is the title
    bar, which is the one place Windows itself used one. Sky is the desktop
    teal `#008080`, dithered one shade lighter across **the whole sky** — a
    dithered band leaves a hard seam across the screen that reads as a bug
    rather than as a horizon. Clouds are bevelled grey slabs, the ground is a
    raised panel, the aim guide is square pips.
  - Every card is a real dialog box with a title bar, a close box and a push
    button: in this operating system, that is what tells you something.
  - Angry Corgs' crates carry the GUG wordmark at a size taken from the
    shorter side, turned sideways on a tall post — most of the structure is
    beams and posts, and a crate you can't read GUG on is just a plank. The
    waiting corgis moved to a row on the ground behind the sling; as a stack
    beside it, a full draw landed the pulled dog on top of them.

## No more Steam, two new games, Ad Smasher on the desktop

- **Steam is gone; Half-Life is its own app.** `toggleSteam()`,
  `steamInitLibrary()`, `steamPlayGame()`, `steamStopGame()`, `STEAM_GAMES` and
  the whole `#steam-screen` (library window + "Now Playing" window) are
  deleted. In their place is **`GAME_APPS`** and one shared window shell,
  `#gameapp-screen`, whose titlebar takes the launched game's own icon and
  name -- so a Half-Life window *is* a Half-Life window, not a tab inside a
  storefront.
  - `toggleHalfLife()` is the entry point, and Half-Life is what has a desktop
    icon, a taskbar button (`.halflife-btn`, was `.steam-btn`) and an entry in
    both start menus. **HL2, Portal and Portal 2 survive** as start-menu-only
    entries calling `openGameApp('<id>')`; Portal keeps its `openInNewTab`
    flag, because that host still refuses to be embedded.
  - `openGameApp()` **only re-assigns `iframe.src` when the game changes** --
    re-setting src to what it already is restarts a game in progress, which is
    what re-opening the window used to do.
  - The olive/khaki Steam skin was also the developer console's skin, so those
    rules were kept and renamed **`.steam-2003-*` to `.corg-console-*`**;
    everything that only dressed the storefront (`.steam-2003-window`,
    `-titlebar`, `-list`, `-section-header`, `#steam-play-iframe`) is deleted.
    `images/steam2003/` is now down to two scrollbar arrows, and
    `images/steam.png` is unreferenced.

- **Ad Smasher is played on the OS desktop now.** It used to be a canvas in a
  window with its own drawn ads and its own drawn dog -- a second, worse copy
  of something the desktop already does. `adsmasher.js` is rewritten around the
  real thing:
  - the ads are real `.popup-ad` windows from `spawnAd()`, with real titles,
    real embeds, real physics (`kickAd`) and real breakage (`shatterAd`);
  - the dog is the real Corg, thrown by the same `makeGuggyDraggable()` that
    throws them the rest of the time;
  - **the rule for breaking glass is the desktop's own** -- at or above
    `AD_SHATTER_SPEED` Corg goes through an ad, below it Corg shoves it.
    Nothing in the game re-decides that. `shatterAd()` calls the new
    **`asOnAdShattered()`** and adsmasher.js only keeps score.
  - So what the file still owns is the spawn ramp (`AS_SPAWN_START_MS` down to
    `AS_SPAWN_MIN_MS` over 62s), the chain scoring, the lose condition
    (`AS_MAX_ADS` = 14 popups on screen at once) and the HUD.
  - Two small hooks in main.js: **`spawnAd(force)`** takes a pause override (a
    round runs with the clicker paused so its passive ad rolls and score tick
    stay out of the way, but the round still has to spawn) and now **returns
    the popup**, so round ads can be tagged `.as-round-ad` and cleaned up
    afterwards without touching ads the player already had.
  - The HUD (`#adsmasher-screen`) is `pointer-events: none` over the whole
    screen, with only the scoreboard bar and the start/over card opting back
    in -- everything underneath it has to stay grabbable, because everything
    underneath it *is* the game.
  - **`.corg-hot`** is the tutorial: adsmasher.js samples every Corg's position
    frame to frame and lights up the ones moving fast enough to break glass.
    The threshold is read off `AD_SHATTER_SPEED` rather than copied, because a
    light that disagrees with the collision rule is worse than no light.
  - **The radio.** A round has music the way a shop with a radio on does. The
    three tracks in `music/adsmasher/` (`AS_RADIO_TRACKS`) are shuffled per
    round, played one after another, wrapped round at the end of the list, and
    stopped when the round ends (`asRadioStart` in `asStartRound`,
    `asRadioStop` in `asEndRound` and `asAbortRound`). Nothing about it is
    synced to the game -- it isn't a soundtrack and it doesn't react to the
    chain. Notes:
    - **This is the only music left in the project** (audio.js dropped the old
      playlist), which makes it the only thing on the MUSIC slider: it rides
      `musicVolume` alone, and `updateMusicVolume()` calls
      **`asRadioSyncVolume()`** so dragging that slider mid-round is heard.
    - The filenames keep their track numbers and spaces, so the `Audio` src goes
      through `encodeURI()`.
    - A track that won't load skips to the next rather than taking the station
      off the air; `asRadioFails` stops that becoming a spin if none of them
      load.
    - `#as-radio` in the smash bar is the now-playing readout. It only shows
      while something is playing, and is hidden under 800px wide.

- **Flappy Corg** (`flappycorg.js`, `images/flappycorg.svg`,
  `#flappycorg-screen`, `.flap-*`). Pong's shape: one fixed court
  (`FC_W`x`FC_H` = 480x640) with a devicePixelRatio backing store, one button
  for everything.
  - The pipes are **CORG cans**, drawn rather than blitted so a can can be any
    height without stretching a photo of one; the lip goes at the end facing
    the gap, so a top can hangs and a bottom can stands.
  - Gaps **wander instead of being uniformly random** (`fcNextGapY` places each
    one within 132px of the last): a purely random next-gap can jump
    ceiling-to-floor between two pairs, which is only clearable by luck.
  - The ceiling is a wall, not a kill. Dying to the flap that saved you reads
    as a cheat.
  - `FC_FLAP_VY` is **-455, not -520**: a flap is worth a rise of about one and
    a half Corgs, the ratio the original flies at. At -520 it was nearly two
    body-heights and the gap had to be cleared by feel rather than by aim.
    Verified by autoplaying a bot at the gap centre -- 9 seconds, 5 cans, the
    scroll speed ramping 165 to 182 px/s.

- **Angry Corgs** (`angrycorgs.js`, `images/angrycorgs.svg`,
  `#angrycorgs-screen`, `.angry-*`). Slingshot on the left, stacks of CORG
  crates and steel on the right, popups as the targets; three levels, four
  corgis each, and the level ends when every ad is gone.
  - **The boxes never rotate**, deliberately. Proper rotating rigid bodies need
    a real solver, and the half-measure -- rotating the sprite while colliding
    the upright box -- is a lie that shows the moment a "tilted" beam stops
    something it visibly isn't touching. Towers collapse into rubble rather
    than toppling like dominoes, and everything you see is what the collision
    sees.
  - The solver is four cheap minimum-translation sweeps a frame
    (`acResolveOverlaps`) plus sleeping: **a resting box is treated as
    infinitely heavy**, which is what gives a stack something to stand on
    instead of sinking into its own base. `dt` is clamped tighter here (0.033)
    than in the other games -- one long step lets the pile interpenetrate far
    enough that the solver launches it apart getting it out again.
  - Damage needs speed (`AC_DAMAGE_SPEED`), the same shove-vs-shatter
    distinction the desktop ads make; blocks darken as their hp goes.
  - The aim guide is integrated with **the same gravity the shot uses**, so it
    can't disagree with it. `mouseup` is bound on the document, not the canvas:
    letting go outside the court is the normal way to fire a big shot.
  - The fork is drawn wider than the corgi sitting in it (and one band goes in
    front of the dog, one behind) or the whole thing reads as a fence post.

- **The boot menu is usable with a mouse, and the hero is centred.**
  - **Hover selects, click boots.** It used to take two clicks -- one to
    select, one to confirm -- which was the mouse paying for a gamepad's
    problem. Now `bootHover()` selects whatever the cursor is over, so by the
    time you click you cannot boot something you weren't reading, and
    `bootPick()` is gone. The hero also carries a green **BOOT** pill, because
    a tile that boots on click has to look like a button or the first click
    feels like a mistake.
  - Arrows either side of the shelf (`bootMoveSelection`), a wheel handler
    (`bootWheelHandler`, accumulating small trackpad deltas so a fling is
    steps and not a scroll), `role="button"`/`tabindex` on each capsule.
  - **The centring fix.** The shelf was a `flex-start` scroller, so the row
    grew rightwards from the left edge and the hero sat wherever its
    neighbours left it -- with the last OS (CORGOS 11) selected it ended up
    against the right edge with a screen's worth of nothing beside it. The
    shelf is now a fixed viewport with a `.deck-track` inside it, and
    **`bootCentreTrack()` translates the track so the hero is dead centre**,
    for every OS at every width.
    - The capsule widths shrank (`clamp(74px, 8.4vw, 128px)`, hero
      `clamp(280px, 38vw, 480px)`) so the three that aren't selected fit in
      the half-width beside the centred hero: verified all four fully on
      screen at 1440, 1280 and 1024, with only the far end clipping at phone
      widths.
    - `bootFollowSelection()` recomputes the offset **every frame while the
      capsule width transition is running** rather than animating the track
      separately -- two animations racing each other is what makes a carousel
      look loose. It's four elements; the cost is nothing.
  - The `STEAM` pill in the legend now reads `CORGOS`.

## Ad Smasher, gaming-mode boot menu, no more can swaps

> The Ad Smasher described below was the **canvas-in-a-window** version, with
> its own court, its own drawn ads and its own drawn dog. It is superseded: the
> game is played on the desktop now (see the section above), and `AS_W`/`AS_H`,
> `AS_AD_ART`, `asRenderAdFace()`, `asSpawnShards()` and the rest of the
> drawing no longer exist. The boot-menu notes below are still accurate except
> for the shelf's layout and input, which the section above replaces.

- **The small Corg under Corg is gone.** The desktop Corg's
  `.win98-desktop-label` was a `.corg-word` image — i.e. the caption under the
  dog was a second, tiny dog. Removed from `index.html`; clones pick it up
  automatically because `spawnExtraCorg()` copies the original. The
  `.win98-desktop-label` rule stays in `style.css` (the desktop icons use it).
- **CORG_Clicker never repaints the can.** The last of the skin system is out:
  `localStorage['equippedGug']` is no longer written, read, or restored, and
  neither ending swaps `#gug-can` any more — buying **Unforeseen Consequences**
  (upgrade 10) and **Buy Valve Software** (upgrade 21) still trigger
  `triggerGameOver()` / `triggerTrueVictory()`, they just leave `images/gug.png`
  on screen. `DOMContentLoaded` forces the src back, so an old save carrying
  `gug2.gif` or `valvegug.png` corrects itself on next load.
- **New minigame: CORG Ad Smasher** (`adsmasher.js`, `images/adsmasher.svg`,
  `#adsmasher-screen`, `.smash-*` in `style.css`). Same shape as Pong —
  `toggleAdSmasher()`, `isPaused`, one fixed court (`AS_W`x`AS_H` = 900x560)
  with a devicePixelRatio backing store — but **not** `.retro-only`: it's the
  game's own app, so it's on the desktop and in both start menus on every theme.
  - Popups spawn, drift and bounce around the court. Corg follows the mouse
    (or WASD/arrows). **Speed is what breaks glass:** at or above
    `AS_SMASH_SPEED` (780 px/s) the ad shatters, below it Corg just shoves it —
    the same rule the desktop ads follow (`AD_SHATTER_SPEED` / `kickAd`). Corg
    glows while he's moving fast enough, which is the whole tutorial.
  - The break is `shatterAd()`'s radial-wedge pattern redone for canvas: each
    ad renders once into an offscreen canvas, so a shard is one clip plus one
    `drawImage`. Sound is `playGlassBreakSfx()` from `audio.js`, unchanged.
  - Chains: smash again inside `AS_COMBO_WINDOW_MS` and the multiplier climbs
    (capped x10). The spawn gap closes over ~60s, so every round ends the same
    way — `AS_MAX_ADS` (14) on screen is **POPUP OVERLOAD**. Best score lives in
    `localStorage['corgAdSmasherBest']`.
  - Art is a **subset** of `images/ads/` on purpose (`AS_AD_ART`, 9 entries):
    the folder is ~30MB and several posters are 4MB GIFs, which is fine for one
    popup an hour and not for one a second. Fetched on first open only.
- **The boot menu is SteamOS gaming mode now.** Same job, same entry points
  (`showBootMenu()` / `bootInto()`), new dress: a status bar (corg avatar, real
  clock), a shelf of capsules, and a `STEAM | MENU ... A BOOT  B BACK` legend
  pinned to the bottom. The coverflow carousel is gone — `bootLayoutCarousel()`
  is replaced by **`bootLayoutShelf()`**, and the selected capsule widens into
  the hero (the width transition is CSS, which is why the layout function only
  sets state).
  - **The 3D install media survived the reskin untouched.** The floppy, CD, DVD
    and USB stick are still the CSS objects, now used as capsule artwork; they
    keep their `.boot-media.selected` hooks (idle float, spinning disc, blinking
    LED). Only the frame around them changed.
  - **Deck sounds**, as provided: `sfx/deck_ui_tab_transition_01.wav` on every
    move, `sfx/deck_ui_default_activation.wav` on boot. Deliberately **not**
    `playSound()` ids — the boot menu sits outside every OS theme and must not
    pick up that theme's sound overrides.
  - Dead CSS removed with it: `.boot-menu-inner`, `.boot-menu-title`,
    `.boot-caption`, `.boot-carousel*`, `.boot-stage*` and the `--bootmgr-*`
    variables.

## Pong replaces Pinball, proxy on Cloudflare, Black Market un-gated

- **Pinball is gone; the retro app is now "CORG Pong".** `pinball.js` and
  `images/pinball.svg` are deleted, replaced by `pong.js` + `images/pong.svg`,
  with `#pong-screen` in `index.html` and a `/* Pong */` block in `style.css`.
  Entry point is `togglePong()` and it keeps the whole Pinball shape: the
  `.retro-only` gate (95/XP only), `isPaused`, `window-open-audio`, a fixed
  logical court (`PG_W`x`PG_H` = 640x400) with the canvas scaled to it, and a
  devicePixelRatio-sized backing store.
  - **Two lines and a corgi**, as asked: the paddles are `fillRect`s
    `PG_PADDLE_W` (7px) wide, and the ball is `images/corgicon.png` clipped to
    a circle, spinning at a rate taken from its horizontal speed.
  - Where the ball lands on the paddle sets the return angle (up to
    `PG_MAX_BOUNCE_ANGLE`, ~53°) and every hit multiplies speed by
    `PG_SPEEDUP` up to `PG_MAX_SPEED`. First to 11. Loser serves, and the
    waiting ball rides the serving paddle so the serve goes where you're
    pointing.
  - The CPU is beatable **by design**: it only reacts once the ball is past
    `PG_CPU_REACT_X` coming at it, tops out at `PG_CPU_SPEED`, and takes a
    tracking error that grows with the rally length (`pgCpuTargetOffset()` is
    a function of the rally count, not of the frame, so it doesn't average
    itself away).
  - **Keyboard and pointer both drive the paddle** — ↑/↓ or W/S, or just move
    the mouse over the court; a tap serves, so it's playable on a phone
    (`touch-action: none` on the canvas so the page doesn't scroll with the
    finger).
  - `pgPlayCorg()` is `pbPlayCorg()` unchanged — `sfx/corg.wav` decoded once
    and fired as buffer sources, never through `playSound()`.
  - Verified headlessly the same way the table was (stub `document`/`Image`/
    `Audio`, step `pgStepBall` directly): rallies of 18–31 against a
    perfect-tracking player, points score on both sides, and the ball never
    leaves the court vertically.
- **The Black Market no longer opens a popup.** `toggleShop()` used to put the
  gambling warning up every single time and only open the shop once you
  dismissed it. It opens the shop directly now; the warning belongs solely to
  the fake **Gambling** tab, and `closeGamblingWarningWindow()` just closes it
  (the shop is already open behind it).
- **The in-game browser on the deployed site.** `gugclicker.com` is served by
  **Cloudflare Pages**, which reads neither `netlify.toml` nor
  `netlify/functions/` — so it had no `/gugexplorer-proxy` at all and none of
  the COOP/COEP headers Half-Life needs. New **`_worker.js`** at the repo root
  puts Pages in advanced mode: it answers the proxy paths and passes everything
  else to `env.ASSETS`, adding the isolation headers and the `.cur`/`.ani` MIME
  types on the way out. **There are now three copies of the proxy — `server.js`,
  `netlify/functions/gugexplorer-proxy.mjs`, `_worker.js` — one contract; keep
  them in sync.**
  - On `corgos.netlify.app` the function **isn't deployed**: its `.mjs` source
    is served as a static file and both function routes 404, which is what a
    drag-and-drop upload does (no bundler runs). Deploy with
    `npx netlify deploy --prod` or a connected Git repo. The `netlify.toml`
    redirects also lost `force = true`, which would otherwise beat the
    function's own `config.path` route.
  - Client side, `gugExplorerCheckProxy()` probes `/gugexplorer-proxy` with no
    `?url=` once per session (the proxy answers 400 without fetching anything;
    a host without it 404s) and swaps in an explanation instead of leaving the
    host's 404 page sitting in the iframe looking like a broken site.

## Pinball — "3D Corgball: CORG Cadet" (superseded by Pong, above)

- **New app: a Space Cadet pinball table with a corgi for a ball.** All of it
  lives in `pinball.js` (a new file, loaded after `main.js`), the window markup
  in `index.html`, and a `/* Pinball */` block in `style.css`. Entry point is
  `togglePinball()`, which follows the Minesweeper pattern: sets `isPaused`,
  shows `#pinball-screen`, and plays `window-open-audio`.
- **It only exists on 95 and XP**, because Windows dropped Pinball after XP.
  The launchers carry a new **`.retro-only`** class. win95's `bodyClass` is
  `''` — the base stylesheet *is* 95 — so there's no positive class to hang
  it on, and the rule is written as
  `body:not(.win7-theme):not(.win11-theme)`, the same negation the retro
  cursor rules at the bottom of `style.css` already use. Verified in a
  browser across all four themes: visible on 95/XP, `display: none` on 7/11.
- **Every bounce plays `sfx/corg.wav`.** It deliberately does *not* go through
  `playSound()` — that clones an `<audio>` element per call, which is far too
  slow and too loud for a ball rattling around the bumpers. `pbPlayCorg()`
  decodes the clip once into an AudioBuffer and fires buffer sources, with
  gain and playback rate scaled by impact speed, a 45ms floor between sounds,
  and a 55px/s impact threshold so resting contacts stay quiet. Falls back to
  `new Audio()` until the decode lands.
- **The ball sprite is `images/corgicon.png`, not `corg.png`** — the latter is
  the whole dog, and clipped to an 11px circle you get a crop of its middle.
- The table is simulated in a fixed `PB_W`x`PB_H` (400x660) space and the
  canvas is scaled to it, so every coordinate in the file is a table
  coordinate. Backing store is sized at `devicePixelRatio` on open; `pbFrame`
  re-applies the scale transform each frame.
- **Three geometry traps, all found by simulating the table headlessly rather
  than by playing it** (the harness stubs `document`/`Image`/`audioCtx` and
  steps `pbStepBall` directly — worth rebuilding if you touch the physics):
  - The ball starts *inside* the "returned down the lane" zone, so a launch
    re-seated on its own first step and no ball ever left the lane. The
    re-seat test needs `ball.vy >= 0`.
  - The plunger was far too weak: the lane exit is ~460px above it, needing
    ~1070px/s under this gravity, and the old launch topped out at 1210 — so
    **94% of launches never reached the playfield**. Now 1090 + 470*charge,
    with `PB_MAX_SPEED` raised to 1700 so a full pull isn't clamped.
  - A one-way gate at the lane exit made a pocket between itself and the dome
    that **80% of balls bounced around in indefinitely**. Removed — the dome
    ellipse already turns a ball left where its normal points down-and-left,
    which is what the real table's curved top rail does. `pbWall()` still
    supports `oneWay: 'down'` if it's ever wanted elsewhere.
  - Where it landed: with no flippers touched, 198/200 balls drain, median
    life 4.5s; with a tapping bot, 148/200 drain over 6.7s and score 3x as
    much. No stuck balls, and the ball never escapes the table at max speed.
- Slingshots are drawn as **red rubber between two posts, not flipper-yellow** —
  in yellow they read as a second pair of flippers, which is the wrong thing
  to tell the player.
- `images/pinball.svg` is a new original icon (no Microsoft asset was used).

## Real win11 sounds, per-OS boot splashes, lock-screen clock (earlier pass)

- **CORGOS 11 was still playing Windows 7 sounds for everything but the boot
  jingle**, and the reason is the same trap the boot sound fell into. The
  `sfx/Windows11_sounds_b22000/sounds/` folder is a straight Media-folder dump,
  and a real Windows 11 Media folder *still holds the Vista/7-era sound scheme*
  for legacy events. **`sounds/dm/` ("design modern") is the actual Windows 11
  set** — verified different audio, not a re-encode: the PCM data of
  `Windows Foreground.wav`, `Windows Notify System Generic.wav` and
  `Windows Background.wav` differs between the two folders. Every
  `WIN11_SOUND_OVERRIDES` entry points at `dm/` now. **Prefer `dm/` for
  anything added there.**
  - `dm/` has no Critical Stop or Recycle, so errors use `dm/Windows
    Foreground.wav` (what modern Windows plays for message boxes) and the bin
    uses `dm/Windows Hardware Remove.wav`.
  - `logonSound` stays on `sounds/Windows Unlock.wav` — that one arrived in
    Windows 8, so it isn't a 7 leftover, and `dm/` has no equivalent.
  - `achievement-audio` is still deliberately un-overridden: `sfx/achievement.wav`
    is the game's own sound, not a Windows one.
- **The boot splash is each OS's own loading screen.** It used to be one
  bitmap — `images/gugclickerbg.jpg`, a CORG_Clicker picture — shown for all
  four OSes, plus `gugclickerbgmobile.jpg` for narrow screens. `BOOT_SPLASHES`
  in `main.js` + a `.boot-splash-<os>` block in `style.css` now draw a per-era
  screen in CSS, so they scale to any window and the mobile crop isn't needed:
  - **95** — logo plate on the cloudy blue sky, chunked progress bar
  - **XP** — black field, CORGOS xp wordmark, the three blue blocks marching
    across a rounded bar, copyright bottom-left
  - **7** — glowing mark, "Starting CORGOS..." with animating dots
  - **11** — logo and a spinner
  - The mark is `OS_THEMES[os].bootLogo`, `images/corg.png` on all four, so
    dropping a real per-era flag in is a one-line change per theme.
  - Both old jpgs are unreferenced but still on disk.
- **The CORGOS 11 lock-screen clock was wrong** next to a real one: it was
  thin-weight, vertically centred, and printed the AM/PM. It's semibold, sits
  in the upper third (`padding-top: 12vh`), the date under it is bold, and
  `startWin11Lock()` strips the meridiem so it reads "1:47" like Windows does.
  The "press Space" hint isn't part of the real screen at all, so it moved out
  of the clock block to the bottom of the screen.

## Netlify deploy, XP login sharpness, Minesweeper centring (earlier pass)

- **The in-game browser works on `*.netlify.app` now.** Corg Explorer loads
  every page through `/gugexplorer-proxy`, which was only ever implemented in
  `server.js` — Netlify publishes the static files and nothing else, so that
  path 404'd and the browser showed a "Not found" page for everything. The
  proxy is ported to `netlify/functions/gugexplorer-proxy.mjs` (Functions v2,
  Fetch API) and `netlify.toml` routes `/gugexplorer-proxy` and
  `/gugexplorer-proxy/*` to it. **The two implementations share a contract —
  `?url=<absolute>` for links/POST forms/fetch/XHR, `/<encoded origin+path>`
  for GET forms — so keep them in sync if you touch either.** The function
  also caps the response at 6MB and times out at 9s (Netlify kills a sync
  function at 10s), so a slow site gets the styled error page rather than a 502.
- `netlify.toml` also ships the **cross-origin isolation headers**
  (`COOP: same-origin` + `COEP: credentialless` + `CORP: cross-origin`) that
  `buildHeaders()` sets locally — without them Half-Life has no
  SharedArrayBuffer on the deployed site — plus `.cur`/`.ani` MIME types, which
  Netlify otherwise serves as `application/octet-stream` (a cursor with the
  wrong Content-Type is silently ignored).
- **The XP login screen is drawn in CSS instead of being a screenshot.**
  `images/winxp/login.jpg` is a 12KB shot, and stretched to `100% 100%`
  full-bleed it was visibly blurry — right next to the crisp CSS-drawn
  "Welcome" that replaces it. Both stages now share one `.loginxp-field`
  (bars, divider, blue gradient), so they're equally sharp and cut cleanly
  between each other. The login stage draws its own CORGOS xp wordmark and
  "To begin, click your user name". `login.jpg` is unreferenced but still on
  disk.
- **Minesweeper is centred.** `.movable-resizable` has `min-width: 220px` and
  the 9x9 board is only ~150px wide, so the board hugged the left edge of its
  window. A new `.mine-board` wrapper (`width: fit-content; margin: 0 auto`)
  holds the HUD and the grid at one width and centres them together.
- **The Black Market has a fake "Gambling" tab.** It has no panel of its own
  and never goes active — `switchTab()`'s `tabs` array is untouched, so it
  can't hide the real panels — it just calls the new `showGamblingWarning()`
  and puts the warning popup back up. `toggleShop()` calls the same function
  now instead of inlining it.
- The title-screen footer reads **`a CORG production`** (was `a TMV production`).

## Real Microsoft icons, login screens (earlier pass)

- **The placeholder Explorer/Control Panel SVGs are gone**, replaced by the
  real icons dropped into the repo: `explorer95.svg` + `controlpanel95.svg`,
  `winxp/winxpexplorer.webp` + `winxp/controlpanelxp.webp`,
  `win7/win7explorer.svg` + `win7/Control_Panel_7.webp`, and
  `win11/win11browser.png`. `images/osicons/` now holds only the four Shut
  Down / power glyphs, which are still originals — no Microsoft equivalents
  were supplied for those.
- **CORGOS 11 stopped sounding like Windows 7.** `Windows Startup.wav`,
  `Windows Logon.wav` and `Windows Shutdown.wav` in the Media folder are
  Vista/7-era files Microsoft still ships for legacy events — playing them was
  the bug. Boot now uses the real 11 jingle,
  `Windows11_sounds_b22000/Windows Startup Sound.m4a` (at the *root* of the
  pack, not in `sounds/`), and sign-in uses the short `Windows Unlock.wav`.
  **Shutdown on 11 is silent**, which is what real Windows 11 does; point
  `shutdownSound` at `Windows Logoff Sound.wav` if you'd rather hear something.
  `server.js` gained `.m4a`, `.webp` and `.flac` MIME types.
- **Per-OS login backgrounds.** 7 and 11 get `loginbackground.jpg` /
  `loginwallpaper.jpg` as clean full-bleed wallpapers (their heavy blur/tint
  overlays were dialled back so the art shows through).
  - **XP was different**: it used `winxp/login.jpg`, a shot of the whole
    welcome screen, with only the user tile and password box overlaid on top.
    Superseded — see the sharpness note in the latest pass; XP draws both
    stages in CSS now.
- **XP shows "Welcome" after you type the password**, like the real thing: the
  login column is hidden, a full-screen XP-blue field with the orange-edged
  bars and a centred "Welcome" comes up for 1.9s, then it carries on into the
  desktop.
- **CORGOS 11 has a real lock screen.** Clock + date over the wallpaper, and
  **Space, Enter, a click, a scroll up, or a drag up (60px)** lifts it away to
  reveal the PIN box. `startWin11Lock()` / `win11Unlock()`; the drag listeners
  live on the document so a swipe that runs off the element still counts.
  `showLoginScreen()` resets `win11Locked` and tears down any previous lock
  listeners — leaving it set meant `attemptLogin()` on the *next* OS's login
  screen tried to unlock instead of logging in.

## Per-OS chrome, a real password, Gugslop

- **Every OS gets its own icons.** New `OS_THEMES` fields — `explorerIcon`,
  `settingsIcon`, `settingsLabel`, `shutdownIcon` — applied by `setOSTheme()`
  to `.explorer-icon` / `.settings-icon` / `.settings-label` /
  `#start-shutdown-icon`. The icons are original SVGs in `images/osicons/`
  (see `THIRD_PARTY.md`); nothing was copied from Microsoft.
  - **Corg Explorer** wears that era's browser: the flat 95/98 IE "e", the
    glossy XP one, the Aero 7 one, and a flat Fluent swirl on 11.
  - **Settings is "Control Panel"** with a control-panel icon on 95 / XP / 7,
    and stays **"Settings"** with the Fluent gear on 11. The relabel covers the
    desktop icon, the start menu, the taskbar button and the Settings window's
    own titlebar. `.settings-btn` went 90px -> 118px because "Control Panel"
    wrapped to two lines in the taskbar.
  - **Shut Down** used the win95 flag under *every* theme, because 95/XP/7
    share one start menu. It's now a per-era shutdown icon.
  - **The win11 power button** was the Settings gear with a `hue-rotate` filter
    on it. It's an actual power glyph now.
- **The login password is real, and it's `corg`.** The fields aren't readonly
  any more: `attemptLogin()` compares the trimmed, lowercased input against
  `LOGIN_PASSWORD` and only then calls `completeLogin()`; a wrong one clears
  the box, plays `error-audio` and prints under `#login-error`. All four
  screens expose the field as `#login-password` (XP gained a password row, it
  had none). **Each screen shows a `hint: corg` line** — without it a fresh
  player is just locked out. Delete `.login-hint` from `LOGIN_SCREENS` if you'd
  rather they work for it. On 95, Cancel now clears the box instead of logging
  you straight in.
- **The bin is "Gugslop"**, on the desktop as well as in CORG_Clicker. The new
  `#desktop-trashcan` is a real drop target: `pointIsOverTrash()` tests every
  `.trash-target`, so ads *and* Corg can be dropped in either bin. A bin inside
  a closed window measures 0x0, which is what stops drops registering on it.
  The shop tab, the bin label, the tooltips and the upgrade/achievement copy
  all say Gugslop now.
- **Win11 stopped chiming at every click.** `window-open-audio` is silent on 11
  (like `upgrade-audio` already was), and the notification sound moved to a new
  `notify-audio` id used by exactly two things: Corg starting to talk, and an
  ad popping out. On every other theme `notify-audio` is the same
  `windowopen.mp3` as before, so nothing changed off win11. `achievement-audio`
  lost its win11 override too, so achievements use `sfx/achievement.wav`.
- Corg's trashed/untrashed barks were still full English sentences from before
  the rebrand — they're `corg` now, like every other line.

## Corg is the mascot now

- **Every Guggy image is one corg picture.** `images/corg.png` (a transparent
  cutout, generated from `images/gug.png`, which someone had already swapped to
  a corgi) replaces `gugidle.gif` / `gughappy.gif` / `gugtrashed.png`
  everywhere: the desktop assistant, the setup screen, all four login-screen
  avatars, the win11 start-menu profile, and the trashed-in-the-recycle-bin
  state. `images/corgicon.png` (64px) replaces `guggyicon.png` as the app icon,
  favicon, taskbar/start-menu icon and achievement fallback.
  - `setGuggyImage()` no longer takes a gif name — there are no moods left, so
    every caller (idle / question / happy / sad) resolves to the same picture,
    and `guggyGifDurations` is gone. `playIdleAnimations()` keeps its timer
    because other code uses it to tell "idling" from "talking".
  - `#guggy-img` lost `image-rendering: pixelated` — that was for the old pixel
    gifs and made a photo look chewed up.
  - The old `images/guggy/*.gif` and `sfx/guggysfx/` files are still on disk,
    just unreferenced.
- **"Guggy User" is "Corg User"** on all four login screens, and their dummy
  password is `corg` instead of `gug`.
- **`sfx/gug.mp3` is no longer on disk**, so the two `playSound('gug-audio')`
  calls (closing the welcome dialog, and waking Corg up) were silently doing
  nothing. They play `corg-audio` now and the dead `<audio id="gug-audio">`
  element is gone. Every asset referenced by the HTML and JS was checked
  against the server — all 86 resolve.

## CORG rebrand, skins removed, Black Market gated

- **Everything the player reads now says CORG.** Window titles, the score
  line, upgrade names and descriptions, achievements, ad popups, the login
  screens, the boot menu (CORGOS 95/11/XP/7), the setup screen and the title
  screen. **Only visible text was renamed** — asset paths (`images/gug.png`,
  `music/*.mp3`, `images/guggy/*`), DOM ids (`#gug-can`, `#gugclicker-window`),
  function/variable names (`gugPerSecond`, `toggleGugClickerWindow`) and the
  localStorage save keys (`gugClickerSave`, `equippedGug`) are untouched, so
  existing saves still load and no asset 404s.
- **Guggy is Corg, and Corg only says "corg".** Every tip, every question and
  both answers in `guggyTips` are the string `corg`, and every one of them is
  voiced by `sfx/corg.wav` — `playGuggyVoice()` ignores the per-line filename
  now, and `playGuggySfx()` (clicking Corg) plays the same file instead of
  rolling one of the 16 `guggyclicksounds`. The two setup-screen intro lines
  are `corg` too. The questions' `actionYes`/`actionNo` payloads are unchanged,
  so they still do what they always did; you just can't tell which is which.
  Clicking the can already played `corg-audio`.
- **The whole crate/skin system is gone.** Deleted: `skinDatabase`,
  `skinMusicMap`, `skinSfxMap`, `RARITIES`, `RARITY_CLICK_BOOSTS`,
  `playerInventory`, `rollForSkin`, `openCrate`, `closeUnboxing`,
  `addToInventory`, `renderInventory`, `saveInventory`, the `grantSkin` /
  `grantAllSkins` dev commands, the unboxing + crate-gif markup, the roulette /
  inventory CSS, the crate sound elements, and the six crate/skin achievements
  (29 achievements left). `getEffectiveGPC()` is now just `gugPerClick` — the
  rarity click boost went with the rarities. Stale `gugInventory` in
  localStorage is cleared on load.
  - The can can still change, but only along the story: `gug.png` ->
    `gug2.gif` (Unforeseen Consequences) -> `valvegug.png` (Buy Valve). Any
    other saved can falls back to `gug.png`.
  - `checkSkinMusic()` is replaced by `resumePlaylistMusic()`; the one secret
    track worth keeping, `finalvictory.mp3`, is now played directly by
    `playTrueEndingMusic()` when you buy Valve.
- **The gambling warning is the door to the Black Market.** Clicking Run
  Black_Market_Shop.dll puts the warning up (with `error-audio`, and
  re-clicking while it's up is a no-op rather than restacking it); dismissing
  the warning with either X or Close is what actually opens the shop. Clicking
  the button again while the shop is open closes it.
  - `toggleShop()` / `openShop()` / `closeShop()` / `isShopOpen()` split the
    job up. `openShop()` sets both the inline `display: flex` (desktop side
    panel) and the `.mobile-open` class (mobile fullscreen overlay) and lets
    the CSS pick; `closeShop()` clears both. The shop's titlebar X calls
    `closeShop()` directly — it used to call `toggleShop()`, which would just
    have reopened the warning.

## Windows, cursors and the OS switch

- **No more dimming when a window opens.** `.screen-overlay` is transparent and
  `pointer-events: none`, with `> *` back to `auto`, so an open app window
  floats over a live desktop instead of a black sheet. The genuinely modal
  screens keep the old backdrop via a `modal-dim` class: win11 upgrade,
  welcome, game over, true victory, achievement image viewer, unboxing.
- **Every window resizes from a real grip.** The native CSS `resize: both`
  corner is gone (`.movable-resizable.has-resize-grip { resize: none }`);
  `addResizeGrip()` appends a `.window-resize-grip` to each window instead.
  This is what fixes Half-Life 2 and Portal 2: their window is a full-bleed
  `<iframe>`, which swallowed the pointer over the native resizer, so those two
  were stuck at their opening size. During any drag or resize the body gets
  `window-interacting`, which sets `iframe { pointer-events: none }` — without
  it the mousemove stream vanishes into the game the moment the pointer crosses
  the iframe (dragging those windows by the titlebar was broken for the same
  reason).
- **"Switch OS" is gone** from the Settings window, the win95/XP/7 Start menu
  and the win11 Start menu, along with `toggleOSTheme()`. Shut Down -> boot menu
  is the only way to change OS now. `gugOS11Unlocked` still exists (it's saved
  and used by the win11 upgrade event); it just no longer gates a button.
- **Per-OS mouse cursors** (`cursor/`, public domain — see `THIRD_PARTY.md`).
  95 and XP share the win95/98 set, 7 uses the Windows 7 set, 11 keeps the
  host system's cursors. Rules live in one block at the bottom of `style.css`,
  keyed on `body:not(.win7-theme):not(.win11-theme)` (95/XP) and
  `body.win7-theme`, and are `!important` so they beat the per-component
  `cursor:` declarations scattered through the file.
  - Covered: arrow, hand, I-beam, move, not-allowed, precision (Paint canvas),
    diagonal resize (the window grip), and the hourglass on the shutdown
    overlay.
  - **The Windows 7 `.ani` cursors are now usable.** No browser loads `.ani`,
    so `scratch/ani2gif.py` unpacks each one (RIFF `fram` list = one `.cur` per
    frame, `rate` chunk = jiffies per frame) and re-packs it as an animated GIF
    plus a first-frame `.cur` fallback. 18 frames, 33ms each. **Firefox
    animates a GIF cursor; Chrome, Edge and Safari show the first frame only**
    — right picture, no spin. Nothing can be done about that from CSS; a
    genuinely animated cursor in Chrome would mean hiding the real one and
    following the mouse with a positioned `<img>`.
  - Where they're used: `busy.gif` over the shutdown overlay on 7 (the
    hourglass does that job on 95/XP), and `working-in-background.gif` over a
    window whose iframe is still loading — `setWindowLoading()` puts a
    `window-loading` class on the Steam play window and Gug Explorer until the
    iframe's `load` fires (20s timeout so a load that never fires can't leave
    the window stuck busy). 95/XP use their arrow-and-CD `Cursor_17.cur` there.
  - The 95 set's `Beam.cur` is a blank file (all pixels transparent), so text
    fields use `cursor/win-95-xp/beam-fixed.cur`, a hand-drawn replacement.
  - `server.js` now serves `.cur`/`.ani` with a MIME type.

## Done
- Movable/resizable windows, Half-Life icon swap, Gug Explorer proxy fixes (GET forms, fetch/XHR shimming)
- Steam app rebuilt to match the real `steam-2003` look (Library-only window)
- 4 games wired: Half-Life (local), Half-Life 2, Portal (opens in new tab — blocks iframe embedding), Portal 2
- Win11 real system sounds wired in (fixed a server bug where filenames with spaces 404'd)
- Dev console in Settings (`dev 1` / `dev 0`, `set_gug <n>`) replacing the old checkbox
- GUG_Clicker starts closed by default; Black Market folded into it (no longer a standalone app), fixed the softlock (its open button was `display:none` on desktop)
- Fixed desktop icons rendering under vs. over open windows (flex stacking-context issue)
- Win11 ads fade/slide/scale in (`win11AdPopUp`) instead of the snappy win95 `popIn`

## OS themes — four of them
All four are **themes of this same desktop**: the whole game (GUG_Clicker, Black
Market, Steam, ads, taskbar, Guggy) stays intact and just gets redrawn.
Driven by `OS_THEMES` in `main.js` + a `body.<x>-theme` class in `style.css`.

| Boot entry | Body class | Look |
| --- | --- | --- |
| GUGOS 95 | *(none)* | original win95 chrome |
| GUGOS 11 | `win11-theme` | Fluent / acrylic |
| GUGOS XP | `winxp-theme` | Luna blue + Bliss wallpaper |
| GUGOS 7 | `win7-theme` | Aero glass + orb taskbar |

The XP and 7 styles/assets came out of the two repos' actual source (gradients
copied from their components, plus their wallpapers, start button/orb, and
sounds). See `THIRD_PARTY.md` for the per-file attribution — winXP is MIT,
win7 is Apache-2.0.

Adding another theme = one entry in `OS_THEMES`, one in `BOOT_OPTIONS`, and a
`body.<x>-theme` CSS block.

## Title screen — bare minimum
White page, corg, and **PLAY** / **SETTINGS** as plain black text in **Gordin**
(`fonts/gordin-regular.ttf`, `@font-face` at the top of style.css, Comic Sans
left behind it as the fallback — that's what this screen wore before). That is
the entire screen. No title wordmark, no boxes, no borders, no
buttons-that-look-like-buttons — hover just underlines.

**Three hard constraints — keep them if you touch this screen:**
- **Black and white only** (plus whatever colours are in the corg photo).
- **No animations and no transitions.** All the old keyframes
  (`mmStripeCrawl`, `mmSunspin`, `mmTitleWobble`, `mmCorgBob`, `mmCorgSpin`,
  `mmPlayPulse`) and the scanline/sunbeam/stripe `::before` / `::after`
  decorations are long gone. Don't reintroduce them.
- **Only PLAY and SETTINGS.** The DEV MENU button is gone; its "skip intro
  video" checkbox moved *inside* the SETTINGS panel, so nothing was lost.
  `mainMenuToggleDev()` / `mainMenuTogglePanel()` / `#main-menu-dev` are gone
  with it — `mainMenuToggleSettings()` is the only panel toggle now.

- Clicking the corg plays `sfx/corg.wav` (`mainMenuPokeCorg()`) — nothing
  moves and nothing else changes, per the no-animation rule.
- The screen is `justify-content: flex-start` with `margin: auto` on the inner
  block and footer: that centres them vertically when there's room, and lets a
  short window scroll instead of clipping the top off.
- The footer is `a CORG production` and, under it, the content note
  `glass breaking sfx warning` (`.main-menu-warning`) — the intro ends on a
  screenful of glass and the ads break the same way all game, so it's said on
  the last screen before the noise starts.
- `0.1 beta` sits in the bottom-right corner (`.main-menu-version`). `fixed`,
  not absolute: this screen scrolls on a short window, and a version tag that
  scrolls away isn't in the corner any more.
- **Hover and click sounds** on every button here: `menuHoverSfx()` /
  `menuClickSfx()` in audio.js, which are the same two Deck sounds the boot
  manager uses. Deliberately **not** `playSound()` ids — no OS has booted yet,
  so there is no theme whose sound overrides should apply.
- **Settings** = three sliders, `MUSIC` / `SOUND` / `GLASS`, wired to
  `updateMusicVolume` / `updateSFXVolume` / `updateGlassVolume`. The in-game
  Control Panel has the same three, both write the same globals, and both
  re-read them when they open (`toggleSettings()`, `mainMenuSyncSettings()`),
  so they can't drift.
  - The three are **independent, not nested**: glass is not a share of sfx.
    `musicVolume` (default 0.5) is Ad Smasher's radio, the only music left;
    `glassVolume` (default 1.0) is `playGlassBreakSfx()`, the loudest sound in
    the game and the one the footer warns about, so turning it down shouldn't
    mean turning everything down. Both persist in the save
    (`loadGame`/`saveGame`).
- **PLAY** goes straight to the intro cutscene. Clicking it is also the user
  gesture browsers require before audio can play.
- **DEV MENU**: "skip intro video" (`#mm-skip-intro`), remembered in
  localStorage (`gugDevSkips`, now `{ intro }`). On = PLAY goes straight to the
  boot menu.
- Under 720px tall the screen scrolls instead of clipping PLAY off the bottom.

## The intro cutscene
**PLAY runs this**, and it is what replaced CORG OS Setup in the flow:

1. `videos/intro.mp4` plays full-screen on black (`#intro-video-screen`, z-index
   1000003, above the title screen), at `sfxVolume`. If sound is blocked it
   retries muted rather than not playing.
2. On `ended` the video **holds on its last frame** (`introFreeze()` pauses and
   parks `currentTime` just short of the end), for `INTRO_FREEZE_MS`.
3. `introSmash()` breaks that held frame **like an ad**: the frame is copied to
   one master canvas (`introFrameCanvas()`), and each shard is **its own canvas
   holding its own piece of it** — sized and positioned to that polygon's
   bounding box (`introShardBox()`), clipped by a polygon from main.js's own
   `adShardPolygons()`. Same crack pattern, same shard flight, same
   `AD_SHARD_*` constants, same `playGlassBreakSfx()` takes — a second one 90ms
   behind the first, because a screen of glass isn't one ad's worth. The burst
   is bigger than an ad's (`520 + 52000/dist`): the pieces have to clear a whole
   screen.
   - A shard can't be the `<video>` itself — a clipped video is one moving
     element, not eleven pieces — which is why the frame is copied out first.
   - **Never `toDataURL()` that canvas.** Drawing a video onto a canvas is
     always allowed but taints it, and reading pixels back out of a tainted
     canvas throws — which is what happens whenever the page is opened over
     `file://` instead of through a server. The first version did exactly that,
     caught the throw, and fell back to a flat colour: the whole break came away
     as **blank white pieces**. Nothing reads pixels back now; the canvases are
     only ever drawn, which a tainted canvas is happy to do.
   - Per-shard boxes rather than 22 full-frame copies, because 22 screen-sized
     canvases is a lot of pixels for eleven wedges that mostly don't overlap.
     Wedges that fall entirely outside the frame (the pattern reaches past every
     corner on purpose) are skipped.
4. Corg bursts out of the middle of the frame (`introCorgBurst`, overshoot then
   settle) and says corg in the desktop's own `.guggy-bubble`.
5. `endIntro()` calls **`showBootMenu()` first** and *then* fades the screen
   (`INTRO_FADE_MS`, matching the CSS transition), so the intro fades onto the
   boot manager. Building the boot menu after the fade instead meant the fade
   revealed what was actually behind the intro — the bare desktop — and the
   scene ended on a flash of CORGOS 95 before the boot menu cut in over it.

**Esc / Space / Enter skips** straight to the boot menu. Every failure path in
here — no element, no file, blocked playback — ends at the boot menu rather
than on a black screen. `introReset()` clears the shards, the burst and the
bubble before and after a run, so a second playthrough starts clean.

`server.js` streams everything in **`MEDIA_EXTS`** (`.mp4 .webm .mp3 .ogg .m4a
.flac`) with Range support — 206 responses off disk, so playback starts without
downloading the whole file. Audio is in that set for a second reason: the
read-whole path sends `res.end(buffer)` with no `Content-Length`, which Node
sends chunked, and a chunked `<audio>` has **`duration === Infinity` and cannot
be seeked** — the browser treats it as a live stream that happens to stop. The
short one-shot `.wav` effects stay on the read-whole path deliberately.

## CORG OS Setup (no longer in the flow)
**Nothing calls `startSetupSequence()` any more** — the intro cutscene above
replaced it. The markup (`#setup-screen`), the CSS and the functions are all
still here and still work; putting it back is one line in `mainMenuPlay()`.
The rest of this section describes it as it stands.

A dark-blue Windows-Setup pastiche (Aero-framed "CORG OS Setup" window, CORG OS
wordmark, "Repair your computer" + copyright footer).

1. Corg fades in
2. `sfx/corg.wav`, subtitled "corg"
3. `sfx/corg.wav` again — "corg"
4. `music/guggycansong.mp3` plays, the subtitle becomes "♪ corg corg corg ♪"
   and Corg bops

**Install now** appears when the song starts and takes you to the boot menu
(stopping the song); the song ending does the same on its own. Each step
advances on the clip's `ended` event, with a timeout fallback so a failed load
can't stall the sequence — corg.wav is short, so the two spoken steps go by
fast now.

Corg's random tips are suppressed while any pre-desktop screen is up
(`isPreDesktop()`) — a tip voice line used to fire 8s after load, talking over
the title screen.

## Credits
**Removed entirely** — desktop icon, both start-menu entries, the taskbar
button, the `#credits-screen` window, `toggleCredits()`, and its CSS.

## Boot menu
Windows 8/10/11-style boot manager replacing the old "Click anywhere to boot"
screen: "Choose an operating system", tiles, selection outline, and the
"Change defaults or choose other options" footer.

- Mouse click *or* arrow-keys + Enter
- Picking an OS sets the theme, plays that OS's startup sound, runs the boot
  splash, and lands in the game
- No separate "click to boot" step any more — the menu selection is the user
  gesture browsers require before audio can play

## Login screens
Each OS gets its own login screen between the boot splash and the desktop
(`LOGIN_SCREENS` in main.js + `#login-screen.login-<os>` in style.css).

**The boot splash fades *onto* the login screen, not off it.**
`triggerBootSequence()` calls `showLoginScreen()` *before* starting the
splash's 1s opacity fade, and the splash is given `z-index: 1000003` so it
stays on top of `#login-screen` (1000001) while it fades. Previously
`showLoginScreen()` ran in the fade's completion callback, so for that whole
second you watched the bare desktop appear and then the login screen pop in
over it. If you ever change these z-indexes, keep the splash above the login
screen or the flash comes back.

The screens themselves:

- **95** — classic "Enter Network Password" dialog
- **XP** — blue welcome screen, orange bars, "click your user name" user tile
- **7** — blurred wallpaper, avatar, password box + arrow
- **11** — acrylic lock screen, round avatar, PIN + Sign in

Click (or press Enter) to log in: plays that OS's logon sound, fades out, then
hands off to the normal `checkWelcome()` flow.

Sound flow is now startup-at-boot -> logon-at-login, using the XP/Win7 startup
and shutdown files you dropped in `sfx/winxp/` and `sfx/win7/`.

## XP-only apps
The winxp theme adds three working apps, as desktop icons and start-menu
entries. They're hidden on every other theme via `.xp-only`.

- **Minesweeper** — real 9x9 / 10-mine game: first click is always safe,
  flood-fill reveal, right-click to flag, seven-segment counters, face resets,
  win/lose states with misflag marking. Uses the upstream sprite set.
- **Paint** — canvas with pencil / brush / eraser, size slider, 20-colour
  palette, clear. Mouse and touch.
- **Notepad** — textarea with a menu bar; contents persist in localStorage
  under `gugNotepad`.

## Shut down
The Start menu power button (win11) and "Shut Down..." item (95/XP/7) now do a
fake shutdown: save, play that OS's shutdown sound, fade to black, tear the
desktop back down (close windows, clear ads, stop Steam), then return to the
boot menu so you can pick a different OS.

**This does not wipe your save** — Settings > "Format C:\ (Reset All Data)" is
still the only thing that calls `resetGame()`. Both power buttons used to call
`resetGame()`, which erased everything.

## Worth knowing
- **Booting GUGOS 11 (or XP/7) from the menu bypasses the in-game win11 unlock.**
  The boot menu will start you in any theme on a fresh save. Say the word if
  you'd rather they be locked until earned.
- The winXP repo ships no startup/shutdown sounds, so GUGOS XP reuses the win95
  chime and shuts down silently. Drop mp3s in `sfx/winxp/` and repoint
  `OS_THEMES.winxp.bootSound` / `.shutdownSound`. (win95 has no shutdown sound
  either.)
- XP and 7 reuse the **shared** `#win95-start-menu` markup, just restyled per
  theme — only win11 has its own separate menu. If you restyle it, don't set
  `display: none !important` on it: `toggleStartMenu()` sets an inline
  `display`, and an `!important` none silently wins, which is exactly why the
  Start button did nothing on XP/7.
- Black Market is still a side panel of GUG_Clicker on desktop (not a floating
  window) — closing GUG_Clicker closes it too.
