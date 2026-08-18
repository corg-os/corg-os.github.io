/* =====================================================================
   win9xcanvas.js — Windows 9x chrome, drawn on a canvas.

   Flappy Corg and Angry Corgs are supposed to look like programs that
   shipped with this operating system, next to Minesweeper and Pong —
   not like two illustrations that happen to be embedded in it. What
   makes a 9x program look like one is very specific and very cheap to
   reproduce:

     - flat fills. No gradients anywhere except the title bar, which is
       the one place Windows itself used one.
     - a two-pixel bevel on everything: white and light grey on the top
       and left, dark grey and black on the bottom and right (reversed
       for a sunken control). That bevel is the whole visual language.
     - 50% checkerboard dither instead of a soft blend, because 16
       colours is what there was.
     - the desktop teal, #008080.

   So these are the primitives, kept in one file rather than copied into
   each game, because two hand-copied bevel routines drift apart within a
   week and then only one of the two games looks like Windows.
   ===================================================================== */

const W9X = {
    face: '#c0c0c0',        // the grey everything is made of
    light: '#dfdfdf',       // inner highlight
    white: '#ffffff',       // outer highlight
    shadow: '#808080',      // inner shade
    dark: '#000000',        // outer shade
    navy: '#000080',        // active title bar, left end
    navyLight: '#1084d0',   // active title bar, right end
    teal: '#008080',        // the desktop
    tealLight: '#0a9a9a',
    text: '#000000',
    textLight: '#ffffff',
    disabled: '#808080',
};

/* The typeface is whichever one the OS you booted uses — MS Sans Serif on 95,
   Tahoma on XP, Segoe UI on 7 and 11 — because a program's text is the most
   obvious place it either belongs to its operating system or doesn't. Each
   theme sets that font on <body>, so it's read from there rather than kept as
   a second list here that would have to be updated alongside the first.

   Cached against the body's class list, which is what setOSTheme() changes:
   getComputedStyle is a layout read, and this is called several times a frame
   by every canvas dialog on screen. */
const W9X_FONT_FALLBACK = 'Tahoma, "MS Sans Serif", sans-serif';
let w9xFontKey = null;
let w9xFontValue = W9X_FONT_FALLBACK;

function w9xFont() {
    const key = document.body ? document.body.className : '';
    if (key !== w9xFontKey) {
        w9xFontKey = key;
        const family = document.body ? getComputedStyle(document.body).fontFamily : '';
        w9xFontValue = family || W9X_FONT_FALLBACK;
    }
    return w9xFontValue;
}

/* The bevel. Two pixels: outer then inner, each with a light and a dark
   side. `raised` is a button or a panel edge; `!raised` is a well, a
   text box, or anything the eye should read as cut into the surface. */
function win9xBevel(ctx, x, y, w, h, raised, fill) {
    if (fill !== null) {
        ctx.fillStyle = fill || W9X.face;
        ctx.fillRect(x, y, w, h);
    }

    const outerTL = raised ? W9X.white : W9X.shadow;
    const outerBR = raised ? W9X.dark : W9X.white;
    const innerTL = raised ? W9X.light : W9X.dark;
    const innerBR = raised ? W9X.shadow : W9X.light;

    const edge = (color, px, py, pw, ph) => { ctx.fillStyle = color; ctx.fillRect(px, py, pw, ph); };

    edge(outerTL, x, y, w, 1);
    edge(outerTL, x, y, 1, h);
    edge(outerBR, x, y + h - 1, w, 1);
    edge(outerBR, x + w - 1, y, 1, h);

    edge(innerTL, x + 1, y + 1, w - 2, 1);
    edge(innerTL, x + 1, y + 1, 1, h - 2);
    edge(innerBR, x + 1, y + h - 2, w - 2, 1);
    edge(innerBR, x + w - 2, y + 1, 1, h - 2);
}

/* 50% checkerboard between two colours — the dither Windows used
   everywhere it wanted a tone it didn't have. Built once per colour pair
   and cached, because building a pattern per frame is the expensive way
   to draw a flat rectangle. */
const w9xDitherCache = new Map();

function win9xDither(ctx, x, y, w, h, colorA, colorB, size) {
    const px = size || 2;
    const key = `${colorA}|${colorB}|${px}`;
    let pattern = w9xDitherCache.get(key);

    if (!pattern) {
        const tile = document.createElement('canvas');
        tile.width = tile.height = px * 2;
        const g = tile.getContext('2d');
        g.fillStyle = colorA;
        g.fillRect(0, 0, px * 2, px * 2);
        g.fillStyle = colorB;
        g.fillRect(0, 0, px, px);
        g.fillRect(px, px, px, px);
        pattern = ctx.createPattern(tile, 'repeat');
        w9xDitherCache.set(key, pattern);
    }

    ctx.save();
    ctx.fillStyle = pattern;
    // The pattern is anchored to the canvas origin, so a rect drawn
    // anywhere still lines up with every other dithered rect.
    ctx.fillRect(x, y, w, h);
    ctx.restore();
}

/* A dialog: grey panel, bevel, title bar with the close box. Returns the
   content rectangle so the caller can lay out inside it without knowing
   the chrome's dimensions. */
function win9xDialog(ctx, x, y, w, h, title) {
    win9xBevel(ctx, x, y, w, h, true);

    const barH = 18;
    const bar = ctx.createLinearGradient(x + 3, 0, x + w - 3, 0);
    bar.addColorStop(0, W9X.navy);
    bar.addColorStop(1, W9X.navyLight);
    ctx.fillStyle = bar;
    ctx.fillRect(x + 3, y + 3, w - 6, barH);

    ctx.fillStyle = W9X.textLight;
    ctx.font = `bold 11px ${w9xFont()}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, x + 6, y + 3 + barH / 2 + 1);

    // The close box. Decoration — these dialogs are dismissed by playing.
    const bx = x + w - 3 - barH + 2;
    win9xBevel(ctx, bx, y + 5, barH - 4, barH - 4, true);
    ctx.strokeStyle = W9X.dark;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx + 4, y + 9); ctx.lineTo(bx + barH - 8, y + barH - 1);
    ctx.moveTo(bx + barH - 8, y + 9); ctx.lineTo(bx + 4, y + barH - 1);
    ctx.stroke();

    return { x: x + 6, y: y + 3 + barH + 6, w: w - 12, h: h - barH - 15 };
}

/* A push button, centred label, optionally shown pressed. */
function win9xButton(ctx, x, y, w, h, label, pressed) {
    win9xBevel(ctx, x, y, w, h, !pressed);
    ctx.fillStyle = W9X.text;
    ctx.font = `bold 12px ${w9xFont()}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2 + (pressed ? 1 : 0), y + h / 2 + 1 + (pressed ? 1 : 0));
}

/* A sunken readout — the status-bar field a 9x program puts a number in. */
function win9xField(ctx, x, y, w, h, text, align) {
    win9xBevel(ctx, x, y, w, h, false, W9X.face);
    ctx.fillStyle = W9X.text;
    ctx.font = `bold 12px ${w9xFont()}`;
    ctx.textBaseline = 'middle';
    if (align === 'center') {
        ctx.textAlign = 'center';
        ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    } else {
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 5, y + h / 2 + 1);
    }
}
