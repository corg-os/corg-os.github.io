# Third-party assets and styles

## GUGOS 7 theme — nainemom/win7

- **Source:** https://github.com/nainemom/win7
- **License:** Apache License 2.0

Used in `style.css` under `body.win7-theme` (window gradients, Aero titlebar
glow, taskbar/tray gradients, window-button styling — taken from
`src/C:/Windows/system/components/Window.vue` and `.../components/Taskbar/*.vue`),
plus these assets:

| In this project | Upstream path |
| --- | --- |
| `images/win7/wallpaper.jpg` | `src/C:/Windows/system/wallpapers/01.jpg` |
| `images/win7/orb.png` | `src/C:/Windows/system/orb/normal.png` |
| `images/win7/close.png`, `maximize.png`, `minimize.png` | `src/C:/Windows/system/window/` |
| `sfx/win7/startup.mp3`, `error.mp3` | `src/C:/Windows/system/sounds/` |

## CORGOS 10 theme — nothing borrowed

`tvillarete/win10-replica` was suggested as the source for this theme, and it
was checked: **the repository publishes no licence at all**, which means no
grant to copy, modify or redistribute any of it. So none of its CSS, markup,
JavaScript or images are used here, and the theme was written from scratch
against Windows 10's own look — square corners, near-white windows, a
near-black taskbar, one accent blue (`#0078d7`).

The two assets it needs are drawn for this project:
`images/win10/start.svg` (the four-pane mark) and
`images/win10/wallpaper.svg`. Its sounds are the win7 pack already credited
above, which is correct rather than lazy: Windows 10 shipped the Vista/7 sound
scheme unchanged, and it has no startup, logon or shutdown sound at all —
which is why booting CORGOS 10 is silent.

## GUGOS XP theme — ShizukuIchi/winXP

- **Source:** https://github.com/ShizukuIchi/winXP
- **License:** MIT — Copyright (c) 2019 Shizuku Yang

Used in `style.css` under `body.winxp-theme` (Luna titlebar gradient, taskbar
and system-tray gradients — taken from `src/WinXP/Windows/index.js` and
`src/WinXP/Footer/index.js`), plus these assets:

| In this project | Upstream path |
| --- | --- |
| `images/winxp/start.png` | `src/assets/windowsIcons/start.png` |
| `images/winxp/paint.png`, `paint16.png` | `src/assets/windowsIcons/680(32x32).png`, `680(16x16).png` |
| `images/winxp/notepad.png`, `notepad16.png` | `src/assets/windowsIcons/327(32x32).png`, `327(16x16).png` |
| `images/winxp/minesweeper/*` | `src/assets/minesweeper/` (digits, numbers, mines, flag, faces) |
| `sfx/winxp/error.wav` | `src/assets/sounds/error.wav` |

The bundled Minesweeper's tile bevels and grid borders also follow the
measurements in `src/WinXP/apps/Minesweeper/MinesweeperView.js` (covered tiles
are CSS bevels there, not sprites — the sprites are only the numbers, mines and
flags). The game logic itself is our own implementation.

`images/winxp/wallpaper.jpg` is the Bliss wallpaper the upstream project
hotlinks from `i.imgur.com/Zk6TR5k.jpg`; it is stored locally here so the theme
works offline and isn't blocked by the server's cross-origin isolation headers.

## Steam 2003 UI — Tecate/steam-2003

- **Source:** https://github.com/Tecate/steam-2003

Assets under `images/steam2003/` and the olive/khaki styling they came with.
The in-game Steam window this dressed is **gone** — Half-Life and the other
games are standalone apps now — and all that survives of it is the developer
console in Control Panel (`.corg-console-*` in `style.css`), which still uses
the scrollbar arrows (`scroll-up.png`, `scroll-down.png`). The rest of the
folder is unreferenced.

## Valve sounds (dropped in by the project owner)

| File | Used by |
| --- | --- |
| `sfx/deck_ui_default_activation.wav`, `sfx/deck_ui_tab_transition_01.wav` | the SteamOS gaming-mode boot menu — moving along the shelf and booting |
| `sfx/ads/glass_sheet_break1-3.wav` | an ad shattering on the desktop — which is also what Ad Smasher scores off |
| `sfx/corgsfx/force_field_loop1.wav` | the Gugslop forcefield around each bin |
| `music/adsmasher/08 Last Legs.mp3`, `22 LG Orbifold.mp3`, `23 Anti-Citizen.mp3` | Ad Smasher's radio — shuffled and played for the length of a round |

Same footing as the Microsoft artwork below: these are Valve's own files, used
here as sounds for this project's own UI. `images/adsmasher.svg` is ours.

The three radio tracks are the only music in the project; everything else in
`music/` is unreferenced (see SESSION_STATUS.md).

## Mouse cursors

Both sets ship with a `readme.txt` from the original download; both are
released to the public domain by their authors.

| In this project | Set | Author / source |
| --- | --- | --- |
| `cursor/win-95-xp/` | Original Windows 95/98 cursors — used by GUGOS 95 **and** GUGOS XP | darix555, http://www.rw-designer.com/cursor-set/win-95-98 |
| `cursor/windows-7/` | Windows 7 (Full Collection) — used by GUGOS 7 | Minecraft2.0, http://www.rw-designer.com/cursor-set/windows-7-full-collection |

`cursor/win-95-xp/beam-fixed.cur` is ours, not upstream: the set's own
`Beam.cur` is a blank file (every pixel transparent), so the text cursor is a
hand-drawn 1-bit I-beam in the same style.

`busy.gif`, `working-in-background.gif` and their `*-frame1.cur` companions are
derived from the set's two `.ani` files by `scratch/ani2gif.py` — same artwork,
a container browsers can actually load.

## Note on the OS themes

These are **themes of this project's own desktop**, not embedded copies of the
upstream apps — the styling and assets above are applied to GUG Clicker's own
windows, taskbar and buttons. The upstream projects are not redistributed or
executed here.

## OS icons

**Microsoft artwork** (dropped in by the project owner — these are Microsoft's
own icons, used here the same way the winXP/win7 theme assets already are):

| File | Used by |
| --- | --- |
| `images/explorer95.svg`, `images/controlpanel95.svg` | Corg Explorer / Control Panel on CORGOS 95 |
| `images/winxp/winxpexplorer.webp`, `images/winxp/controlpanelxp.webp` | ditto on CORGOS XP |
| `images/win7/win7explorer.svg`, `images/win7/Control_Panel_7.webp` | ditto on CORGOS 7 |
| `images/win11/win11browser.png` | Corg Explorer on CORGOS 11 |
| `images/winxp/login.jpg`, `images/win7/loginbackground.jpg`, `images/win11/loginwallpaper.jpg` | the per-OS login screens |

**Original SVGs drawn for this project** — era-flavoured approximations, no
Microsoft files were copied. Use and modify them freely:

| File | Used by |
| --- | --- |
| `images/osicons/shutdown-win95.svg`, `-winxp.svg`, `-win7.svg` | the shared start menu's Shut Down item |
| `images/osicons/power-win11.svg` | the win11 start-menu power button |
