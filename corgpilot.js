/* =====================================================================
   corgpilot.js — "Corgpilot", the assistant CORGOS 11 ships with.

   Every Windows 11 has an AI button in the taskbar that opens a side
   panel, thinks about your question for a moment, and then writes an
   answer out a word at a time. This is that, with one difference: the
   answer is always corg.

   The joke only lands if the theatre around it is right, so the theatre
   is the whole file. A question gets:

     - a model picker in the header — corg-4o, corgmini 4.6 flash,
       corgnet 5, cork 4.5 — where the model decides how long the stall
       is, how fast the words come out, how long the answer runs and
       whether it shows its working;
     - a bark for every "corg" it writes, which at this typing rate is
       most of what you hear;
     - a typing indicator and a status line cycling through the things a
       real assistant says while it stalls, picked to match what you
       asked ("Running the corg linter", "Finding a rhyme for corg");
     - a collapsed "Thought for 2.4s" panel, because they all show their
       working now;
     - an answer that streams in character by character, at a rate that
       wobbles the way a token stream does, pausing at punctuation, with
       a caret blinking at the end of it;
     - the shape of a real answer, chosen from what you asked for — an
       opening line, a heading, a bulleted list, a comparison table, a
       callout, a bolded conclusion, source cards underneath, and — only
       if you asked about code — a code block with a language tag and a
       copy button;
     - a row of message actions (copy, thumbs, regenerate), a token
       count, three follow-up questions, and the disclaimer, because
       they all have one.

   Every word inside that shape is "corg" — and once a line has finished
   typing it stops being the word and becomes the dog: cpCorgify() swaps
   every "corg" in the finished line for `images/corg.png`, the same
   substitution the rest of the desktop does, held back until the line
   is written so it can't fight the typing loop over the same text node.
   Code blocks are exempt; you can't read a program made of dogs.

   Nothing here talks to anything: there is no model, no network, no
   key. It is a sentence generator with one word in its vocabulary, and
   the fake generating is the entire feature.

   CORGOS 11 only — the launchers are hidden on every other theme by
   `.win11-only` in style.css, the same way `.retro-only` hides Pong on
   the ones that never shipped it.
   ===================================================================== */

const CP_ICON = 'images/corgpilot.png';   // the Copilot mark, made of dog
const CP_CORG_IMG = 'images/corg.png';    // what the word turns into

/* The model picker.

   Four models, and the only thing that separates them is how the fake
   generating feels: `think` stretches the stall, `speed` scales the
   typing interval, `depth` makes the answer longer or shorter (more
   list items, more sources, an extra block on the big one), and
   `reasons` opens the thinking drawer on arrival and fills it with more
   working. Which is, give or take, the only thing that separates the
   real ones from each other on a question you already know the answer
   to. */
const CP_MODELS = [
    {
        id: 'corg-4o', name: 'corg-4o', tag: 'Balanced',
        blurb: 'The one it ships with. Good at corg.',
        think: 1, speed: 1, depth: 0,
    },
    {
        id: 'corgmini-4.6-flash', name: 'corgmini 4.6 flash', tag: 'Fastest',
        blurb: 'Answers before you have finished asking. Says less.',
        think: 0.35, speed: 0.45, depth: -1,
    },
    {
        id: 'corgnet-5', name: 'corgnet 5', tag: 'Frontier',
        blurb: 'Longer answers, more sources, more corg per corg.',
        think: 1.6, speed: 1.15, depth: 1,
    },
    {
        id: 'cork-4.5', name: 'cork 4.5', tag: 'Reasoning',
        blurb: 'Thinks out loud, at length, before saying corg.',
        think: 2.6, speed: 1.05, depth: 0, reasons: true,
    },
];

const CP_MODEL_KEY = 'corgpilotModel';
let cpModel = CP_MODELS[0];

let cpOpen = false;
let cpBusy = false;          // a reply is thinking or streaming
let cpTypeTimer = null;
let cpThinkTimer = null;
let cpStatusTimer = null;
let cpQueue = [];            // remaining {el, text} typing jobs
let cpGreeted = false;
let cpTypingRow = null;      // the three-dots row, while it's up
let cpLastQuestion = '';
let cpStreamStartedAt = 0;   // for the "1.9s" in the footer

/* How long the stall lasts, and how fast the answer comes out. Both are
   ranges: a fixed pause reads as a `setTimeout`, which is exactly what
   it is, and a fixed typing rate reads as a teleprinter rather than a
   model. */
const CP_THINK_MIN_MS = 900;
const CP_THINK_MAX_MS = 2200;
const CP_TYPE_MIN_MS = 9;
const CP_TYPE_MAX_MS = 26;
/* An extra beat at the end of a clause. A stream that never breathes is
   the thing that gives away a `setTimeout` loop. */
const CP_PAUSE_COMMA_MS = 55;
const CP_PAUSE_STOP_MS = 130;

/* He says every word out loud as he writes it, which at this typing rate
   is a stream of barks — the point of it. The gap is the only restraint,
   and it is deliberately shorter than the 0.46s clip: barks are meant to
   pile onto each other. It exists only so a fast model landing a word
   every 30ms doesn't ask the browser for thirty clips a second, which
   comes out as one flat noise rather than as spam. Set it to 0 for that
   flat noise. */
const CP_BARK_GAP_MS = 55;
let cpLastBarkAt = 0;

/* ------------------------------------------------------------------
   Intents

   What you asked for decides what you get back — the same way the real
   one hands you a code block for a code question and a table for a
   comparison. `re` picks the intent, `status` is what it claims to be
   doing during the stall, `followups` are the three chips underneath.
   ------------------------------------------------------------------ */
const CP_INTENTS = [
    {
        id: 'code',
        re: /\b(code|coding|fix|error|bug|debug|script|function|compile|build|refactor|python|javascript|css|regex)\b/i,
        status: ['Reading your code', 'Checking corg syntax', 'Running the corg linter', 'Writing a fix'],
        followups: ['Explain this line by line', 'Write tests for it', 'Can you make it faster?'],
    },
    {
        id: 'howto',
        re: /\b(how (do|to|can)|install|set ?up|configure|enable|steps|tutorial)\b/i,
        status: ['Finding the steps', 'Checking the corg docs', 'Reviewing 6 sources', 'Writing it up'],
        followups: ['What if step 2 fails?', 'Is there a shorter way?', 'Show me the commands'],
    },
    {
        id: 'compare',
        re: /\b(vs\.?|versus|compare|comparison|difference|better|which one)\b/i,
        status: ['Gathering both sides', 'Comparing corg to corg', 'Weighing the trade-offs', 'Building a table'],
        followups: ['Which would you pick?', 'Compare the pricing', 'Add a third option'],
    },
    {
        id: 'creative',
        re: /\b(poem|haiku|song|lyric|story|joke|rhyme|write me|limerick)\b/i,
        status: ['Feeling inspired', 'Finding a rhyme for corg', 'Drafting a verse', 'Polishing it'],
        followups: ['Make it rhyme more', 'Write a second verse', 'Now do it as a haiku'],
    },
    {
        id: 'math',
        re: /(\d\s*[+\-*/x]\s*\d|\b(math|calculate|solve|equation|how many|percent|average)\b)/i,
        status: ['Parsing the numbers', 'Doing the corg', 'Checking my working', 'Rounding'],
        followups: ['Show your working', 'What if I double it?', 'Convert that to corg'],
    },
    {
        id: 'summary',
        re: /\b(summari[sz]e|tl;?dr|explain|what (is|are|was)|who (is|was)|define|meaning|overview)\b/i,
        status: ['Reading the document', 'Reviewing 4 sources', 'Pulling out the key points', 'Summarising'],
        followups: ['Make it shorter', 'What did I miss?', 'Give me the long version'],
    },
    {
        id: 'live',
        re: /\b(weather|forecast|temperature|time|date|news|stock|score)\b/i,
        status: ['Checking live corg', 'Contacting corg.com', 'Reading the latest corg', 'Almost there'],
        followups: ['What about tomorrow?', 'Set a reminder', 'Show me the week'],
    },
];

const CP_STATUS_DEFAULT = [
    'Understanding your request',
    'Searching the web for corg',
    'Reviewing 4 sources',
    'Consulting corg',
    'Generating a response',
];

const CP_FOLLOWUP_DEFAULT = ['Tell me more', 'Can you shorten that?', 'Why corg?'];

/* Starters, so an empty panel isn't an empty box. */
const CP_SUGGESTIONS = [
    { icon: '📄', title: 'Summarise this document', sub: 'The one you never opened' },
    { icon: '🍺', title: 'Write a poem about rootbeer', sub: 'Four lines, one word' },
    { icon: '🐕', title: 'What is a corg?', sub: 'Ask the expert' },
    { icon: '🛠️', title: 'Fix my code', sub: 'It compiles somewhere' },
];

/* ------------------------------------------------------------------
   The vocabulary
   ------------------------------------------------------------------ */

/* Set for the length of one cpBuildReply(): true only when the question was
   about code. Nothing formatted as code — no fenced block, no backticked
   identifier — is allowed into an answer while this is false, because a
   monospace `corg()` dropped into an answer about rootbeer is the tell that
   the shapes are being picked at random. */
let cpAllowCode = false;

function cpPick(list) { return list[Math.floor(Math.random() * list.length)]; }
function cpRange(min, max) { return min + Math.random() * (max - min); }
function cpChance(p) { return Math.random() < p; }
function cpInt(min, max) { return Math.round(cpRange(min, max)); }

/* One word, capitalised or not, sometimes stretched or pluralised the
   way someone typing it would. */
function cpWord(capital) {
    const r = Math.random();
    let w = 'corg';
    if (r > 0.96) w = 'corgg';
    else if (r > 0.92) w = 'corgo';
    else if (r > 0.87) w = 'corgs';
    return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

/* A sentence's worth. Punctuation is what makes a row of identical
   words scan as prose instead of as a stuck key. */
function cpSentence(minWords, maxWords) {
    const n = cpInt(minWords, maxWords);
    let out = '';
    for (let i = 0; i < n; i++) {
        out += (i === 0) ? cpWord(true) : cpWord(false);
        const last = i === n - 1;
        if (last) out += cpPick(['.', '.', '.', '.', '!', ' — corg.']);
        else out += cpPick([' ', ' ', ' ', ' ', ', ', ' ']);
    }
    return out;
}

/* A phrase with no full stop: headings, table cells, verse lines. */
function cpPhrase(minWords, maxWords) {
    const n = cpInt(minWords, maxWords);
    const words = [];
    for (let i = 0; i < n; i++) words.push(cpWord(i === 0));
    return words.join(' ');
}

/* A paragraph, as runs rather than as one string: a real answer bolds
   its own conclusion and drops the odd identifier into backticks, and
   those have to be separate elements so the stream can type into each
   in turn. */
function cpProse(minWords, maxWords) {
    const runs = [{ text: cpSentence(minWords, maxWords) }];
    if (cpChance(0.4)) {
        runs.push({ text: ' ' });
        runs.push({ text: cpPhrase(2, 4), style: 'b' });
        runs.push({ text: cpPick([' — corg.', ', corg.', '.']) });
    }
    if (cpAllowCode && cpChance(0.28)) {
        runs.push({ text: ' ' + cpPick(['Use', 'Try', 'Call', 'Prefer']) + ' ' });
        runs.push({ text: cpWord(false) + '()', style: 'code' });
        runs.push({ text: ' ' + cpSentence(3, 8) });
    }
    return runs;
}

/* Corg-only programs. They compile in no language, but they have the
   silhouette of one — that's the whole requirement — and the language
   tag on the block is what sells which one. */
const CP_CODE_SAMPLES = [
    {
        lang: 'javascript',
        text: [
            'function corg(corg = "corg") {',
            '    const corgs = corg.split("").map(() => "corg");',
            '    if (!corgs.length) throw new Error("corg");',
            '    return corgs.join(" ") ?? "corg";',
            '}',
            '',
            'console.log(corg("corg")); // corg corg corg corg',
        ].join('\n'),
    },
    {
        lang: 'python',
        text: [
            'def corg(corg: str = "corg") -> str:',
            '    """corg corg, corg corg corg."""',
            '    return " ".join(corg for _ in range(4))',
            '',
            'if __name__ == "__main__":',
            '    print(corg())  # corg corg corg corg',
        ].join('\n'),
    },
    {
        lang: 'bash',
        text: [
            '$ npm install corg --save',
            '+ corg@4.0.4',
            '$ corg --corg --no-corg',
            'corg: corg corg (corg)',
        ].join('\n'),
    },
    {
        lang: 'css',
        text: [
            '.corg {',
            '    display: corg;',
            '    color: var(--corg, #c04g00);',
            '    corg: corg corg;',
            '}',
        ].join('\n'),
    },
];

function cpCodeBlock(question) {
    if (/\bpython\b/i.test(question)) return CP_CODE_SAMPLES[1];
    if (/\b(css|style|styles|theme)\b/i.test(question)) return CP_CODE_SAMPLES[3];
    if (/\b(install|npm|terminal|command|shell)\b/i.test(question)) return CP_CODE_SAMPLES[2];
    return cpPick(CP_CODE_SAMPLES);
}

/* A comparison table, which is the shape every assistant reaches for
   the moment you put "vs" in a question. */
function cpTableBlock() {
    const rows = [];
    const n = cpInt(3, 4);
    for (let i = 0; i < n; i++) {
        rows.push([
            cpPhrase(1, 2),
            cpChance(0.35) ? '✓ corg' : cpPhrase(1, 3),
            cpChance(0.35) ? '✗ corg' : cpPhrase(1, 3),
        ]);
    }
    return { type: 'table', head: ['Corg', 'Corg', 'Corgo'], rows };
}

function cpVerseBlock() {
    const lines = [];
    const n = cpInt(4, 6);
    for (let i = 0; i < n; i++) lines.push(cpPhrase(3, 7) + (i % 2 ? ',' : ''));
    return { type: 'verse', lines };
}

/* ------------------------------------------------------------------
   The answer

   Open, enumerate, show, conclude. The structure is borrowed wholesale
   from the real thing, because the structure is what sells it.
   ------------------------------------------------------------------ */

function cpIntentFor(question) {
    return CP_INTENTS.find((intent) => intent.re.test(question)) || null;
}

function cpBuildReply(question) {
    const intent = cpIntentFor(question);
    cpAllowCode = !!intent && intent.id === 'code';
    const depth = cpModel.depth || 0;
    const blocks = [{ type: 'p', runs: depth < 0 ? cpProse(4, 8) : cpProse(5, 13) }];

    const list = (type) => {
        const items = [];
        const n = Math.max(2, cpInt(3, 5) + depth);
        for (let i = 0; i < n; i++) items.push(cpProse(3, 9));
        return { type, items };
    };

    switch (intent && intent.id) {
        case 'code':
            blocks.push({ type: 'code', ...cpCodeBlock(question) });
            blocks.push({ type: 'h', text: cpPhrase(2, 4) });
            blocks.push(list('ol'));
            break;
        case 'howto':
            blocks.push({ type: 'h', text: cpPhrase(2, 4) });
            blocks.push(list('ol'));
            blocks.push({ type: 'callout', icon: '💡', runs: [{ text: 'Tip: ', style: 'b' }, { text: cpSentence(5, 10) }] });
            break;
        case 'compare':
            blocks.push(cpTableBlock());
            break;
        case 'creative':
            blocks.push(cpVerseBlock());
            break;
        case 'math':
            blocks.push(list('ol'));
            blocks.push({ type: 'callout', icon: '🧮', runs: [{ text: 'Answer: ', style: 'b' }, { text: 'corg.', style: 'b' }] });
            break;
        case 'summary':
            blocks.push({ type: 'h', text: cpPhrase(2, 4) });
            blocks.push(list('ul'));
            if (cpChance(0.5)) blocks.push({ type: 'quote', text: cpSentence(6, 12) });
            break;
        case 'live':
            blocks.push({ type: 'callout', icon: '📡', runs: [{ text: 'Live: ', style: 'b' }, { text: cpSentence(4, 8) }] });
            blocks.push(list('ul'));
            break;
        default: {
            // No code block in here on purpose: an answer arrives as a
            // fenced program only when the question was about one.
            const roll = Math.random();
            if (roll < 0.4) {
                blocks.push({ type: 'h', text: cpPhrase(2, 4) });
                blocks.push(list('ul'));
            } else if (roll < 0.7) {
                blocks.push(list('ol'));
            } else if (roll < 0.87) {
                blocks.push(cpTableBlock());
            } else {
                blocks.push({ type: 'quote', text: cpSentence(6, 12) });
            }
        }
    }

    // The frontier model earns its stall with one more block; the mini one
    // stops as soon as it has answered.
    if (depth > 0) {
        blocks.push(cpChance(0.5)
            ? { type: 'quote', text: cpSentence(6, 12) }
            : { type: 'callout', icon: '📌', runs: [{ text: 'Worth noting: ', style: 'b' }, { text: cpSentence(5, 10) }] });
    }
    if (depth >= 0) blocks.push({ type: 'p', runs: cpProse(5, 11) });

    return {
        blocks,
        intent,
        thoughts: cpThoughts(intent),
        followups: (intent && intent.followups) || CP_FOLLOWUP_DEFAULT,
    };
}

/* The reasoning panel. Short, clipped, present tense — the register
   every "show thinking" drawer is written in. */
function cpThoughts(intent) {
    const lines = [intent
        ? 'The user is asking about corg. Corg corg corg.'
        : 'The user wants corg. Corg corg, corg corg corg.'];
    // A reasoning model shows its working, and its working is longer.
    const n = cpInt(2, 3) + (cpModel.reasons ? 4 : 0);
    for (let i = 0; i < n; i++) lines.push(cpSentence(5, 12));
    if (cpModel.reasons) lines.push('Wait — corg. Let me check that. Corg corg corg corg.');
    lines.push('I should answer with corg.');
    return lines;
}

/* Citations. Corgpilot cites its sources, and its sources are corg. */
const CP_HOSTS = [
    { host: 'corg.com', title: 'Corg — the official corg' },
    { host: 'en.corgpedia.org', title: 'Corg (disambiguation)' },
    { host: 'docs.corg.dev', title: 'corg() · API reference' },
    { host: 'reddit.com/r/corg', title: 'Is this corg? [OC]' },
    { host: 'gugclicker.com', title: 'GUG_Clicker — corg' },
    { host: 'stackoverflow.com', title: 'Why does corg return corg?' },
];

function cpSources() {
    const n = Math.min(CP_HOSTS.length, Math.max(1, cpInt(2, 4) + (cpModel.depth || 0)));
    const picked = [];
    while (picked.length < n) {
        const src = cpPick(CP_HOSTS);
        if (!picked.some((p) => p.host === src.host)) picked.push(src);
    }
    return picked;
}

/* ------------------------------------------------------------------
   corg -> the dog

   The rest of the desktop swaps the word for a picture of him on sight,
   and the panel opts out of that (`data-no-corg` in index.html) because
   a global observer rewriting the text mid-stream fights the typing
   loop over the same node. So the panel does its own, on its own
   schedule: a line is corgified only once it has finished typing, which
   is why you get to watch the word appear and then turn into a dog.
   ------------------------------------------------------------------ */

/* The same pattern the rest of the desktop uses (CORG_WORD_RE in main.js):
   just the four letters, tail left behind. That is what makes "Corgpilot"
   read as 🐕pilot on the launchers and in here, rather than the whole word
   vanishing into one picture. */
const CP_CORG_RE = /corg(?!pilot)/gi;

function cpCorgify(el) {
    if (!el || el.dataset.corgified === '1') return;
    el.dataset.corgified = '1';

    const text = el.textContent;
    CP_CORG_RE.lastIndex = 0;
    if (!text || !CP_CORG_RE.test(text)) { CP_CORG_RE.lastIndex = 0; return; }
    CP_CORG_RE.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0;
    for (let m = CP_CORG_RE.exec(text); m; m = CP_CORG_RE.exec(text)) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const img = document.createElement('img');
        img.className = 'corg-word cp-corg';
        img.src = CP_CORG_IMG;
        img.alt = m[0];
        frag.appendChild(img);
        last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

    el.textContent = '';
    el.appendChild(frag);
}

/* ------------------------------------------------------------------
   Transcript
   ------------------------------------------------------------------ */

function cpLog() { return document.getElementById('corgpilot-log'); }

function cpScroll() {
    const log = cpLog();
    if (log) log.scrollTop = log.scrollHeight;
}

function cpClock() {
    try {
        return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

/* One transcript row. The bot side gets the avatar and a name/time line
   above the bubble, the user side is a bare bubble on the right — the
   asymmetry every chat UI has. */
function cpAddRow(who) {
    const log = cpLog();
    if (!log) return null;

    const row = document.createElement('div');
    row.className = 'cp-row cp-' + who;

    const col = document.createElement('div');
    col.className = 'cp-col';

    if (who === 'bot') {
        const avatar = document.createElement('img');
        avatar.className = 'cp-avatar';
        avatar.src = CP_ICON;
        avatar.alt = '';
        row.appendChild(avatar);

        const head = document.createElement('div');
        head.className = 'cp-msghead';
        const name = document.createElement('span');
        name.className = 'cp-name';
        name.textContent = 'Corgpilot';
        const time = document.createElement('span');
        time.className = 'cp-time';
        time.textContent = cpClock();
        head.appendChild(name);
        head.appendChild(time);
        col.appendChild(head);
    }

    const bubble = document.createElement('div');
    bubble.className = 'cp-bubble';
    col.appendChild(bubble);
    row.appendChild(col);

    log.appendChild(row);
    cpScroll();
    return { row, bubble };
}

function cpSay(who, text) {
    const made = cpAddRow(who);
    if (made && text) made.bubble.textContent = text;
    cpScroll();
    return made;
}

/* The three dots, while it is pretending to think. A separate row that
   gets thrown away when the real one starts, rather than a bubble that
   morphs: the real one does the same, and a row appearing is easier to
   follow than one changing shape underneath you. */
function cpShowTyping() {
    cpHideTyping();
    const made = cpAddRow('bot');
    if (!made) return;
    made.bubble.classList.add('cp-typingbubble');
    const dots = document.createElement('div');
    dots.className = 'cp-typing';
    for (let i = 0; i < 3; i++) dots.appendChild(document.createElement('span'));
    made.bubble.appendChild(dots);
    cpTypingRow = made.row;
    cpScroll();
}

function cpHideTyping() {
    if (cpTypingRow) { cpTypingRow.remove(); cpTypingRow = null; }
}

/* ------------------------------------------------------------------
   Asking
   ------------------------------------------------------------------ */

function cpSend() {
    // Mid-answer the button is a stop button, exactly as it is in the
    // real thing.
    if (cpBusy) { cpFinishNow(); return; }

    const input = document.getElementById('corgpilot-input');
    if (!input) return;
    const question = input.value.trim();
    if (!question) return;

    input.value = '';
    cpSubmit(question, true);
}

/* One path for a new question and for a regenerate — the only
   difference is whether the question is echoed into the transcript
   again. */
function cpSubmit(question, echo) {
    cpLastQuestion = question;
    cpClearWelcome();
    cpHideSuggestions();
    if (echo) cpSay('user', question);
    cpSetBusy(true);
    cpShowTyping();

    // The stall. Nothing is happening during it — that is the point of it.
    const intent = cpIntentFor(question);
    const lines = (intent && intent.status) || CP_STATUS_DEFAULT;
    let statusIndex = 0;
    cpShowStatus(lines[0]);
    cpStatusTimer = setInterval(() => {
        statusIndex = (statusIndex + 1) % lines.length;
        cpShowStatus(lines[statusIndex]);
    }, 750);

    const thinkMs = cpRange(CP_THINK_MIN_MS, CP_THINK_MAX_MS) * (cpModel.think || 1);
    cpThinkTimer = setTimeout(() => {
        cpThinkTimer = null;
        cpStopStatus();
        cpHideTyping();
        cpStreamReply(cpBuildReply(question), question, thinkMs);
    }, thinkMs);
}

function cpAsk(text) {
    if (cpBusy) return;
    const input = document.getElementById('corgpilot-input');
    if (input) input.value = '';
    cpSubmit(text, true);
}

function cpKeyDown(e) {
    // Enter sends, Escape closes the panel; it's an <input>, so there is
    // no third key that matters.
    if (e.key === 'Enter') { e.preventDefault(); cpSend(); }
    else if (e.key === 'Escape') { e.preventDefault(); toggleCorgpilot(); }
}

/* ------------------------------------------------------------------
   The stream
   ------------------------------------------------------------------ */

/* An inline run becomes its own element so the stream can type into
   each in turn — that's what lets a sentence bold its last three words
   or drop an identifier into backticks while it is still being
   written. */
function cpRunElement(run) {
    if (run.style === 'b') return document.createElement('strong');
    if (run.style === 'i') return document.createElement('em');
    if (run.style === 'code') {
        const el = document.createElement('code');
        el.className = 'cp-inlinecode';
        return el;
    }
    return document.createElement('span');
}

/* Nothing is shown before the stream reaches it. Every element a job
   writes into is created up front — that's what keeps the queue simple
   — but an empty list item, an empty callout and a bare "3." sitting
   below the cursor give away that the whole answer already exists. So
   each one is born `.cp-pending` (display:none) and is revealed by the
   first job that writes into it, which is how a real stream looks: the
   shape arrives as the text does. */
function cpPend(elements) {
    elements.forEach((el) => { if (el) el.classList.add('cp-pending'); });
    return elements;
}

function cpQueueText(el, text, opts) {
    cpQueue.push(Object.assign({ el, text }, opts || {}));
}

function cpQueueRuns(parent, runs, extraReveal) {
    runs.forEach((run, i) => {
        const el = cpRunElement(run);
        parent.appendChild(el);
        // Backticked identifiers are exempt from the substitution for the
        // same reason the code blocks are: `corg()` is a name, and a name
        // made of dogs is not a name.
        cpQueueText(el, run.text, {
            noCorg: run.style === 'code',
            reveal: i === 0 ? cpPend((extraReveal || []).concat([parent])) : null,
        });
    });
}

/* Blocks become empty elements up front and a queue of typing jobs; one
   timer walks the queue, so the answer builds top to bottom the way a
   streamed one does. */
function cpStreamReply(reply, question, thinkMs) {
    const made = cpAddRow('bot');
    if (!made) { cpSetBusy(false); return; }

    const bubble = made.bubble;
    bubble.classList.add('cp-streaming');
    made.row.dataset.question = question;
    cpQueue = [];
    cpStreamStartedAt = Date.now();

    // The reasoning drawer, above the answer and already filled in:
    // thinking is what happened during the stall, not during the stream.
    cpAddThoughts(bubble, reply.thoughts, thinkMs);

    const body = document.createElement('div');
    body.className = 'cp-body';
    bubble.appendChild(body);

    reply.blocks.forEach((block) => {
        if (block.type === 'p') {
            const p = document.createElement('p');
            body.appendChild(p);
            cpQueueRuns(p, block.runs);
        } else if (block.type === 'h') {
            const h = document.createElement('h4');
            body.appendChild(h);
            cpQueueText(h, block.text, { reveal: cpPend([h]) });
        } else if (block.type === 'ul' || block.type === 'ol') {
            const list = document.createElement(block.type);
            body.appendChild(list);
            cpPend([list]);
            block.items.forEach((runs, i) => {
                const li = document.createElement('li');
                list.appendChild(li);
                cpQueueRuns(li, runs, i === 0 ? [list] : []);
            });
        } else if (block.type === 'code') {
            body.appendChild(cpCodeElement(block));
        } else if (block.type === 'table') {
            cpQueueTable(body, block);
        } else if (block.type === 'quote') {
            const q = document.createElement('blockquote');
            q.className = 'cp-quote';
            body.appendChild(q);
            cpQueueText(q, block.text, { reveal: cpPend([q]) });
        } else if (block.type === 'callout') {
            const box = document.createElement('div');
            box.className = 'cp-callout';
            const icon = document.createElement('span');
            icon.className = 'cp-callout-icon';
            icon.textContent = block.icon || '💡';
            const text = document.createElement('div');
            text.className = 'cp-callout-text';
            box.appendChild(icon);
            box.appendChild(text);
            body.appendChild(box);
            cpQueueRuns(text, block.runs, [box]);
        } else if (block.type === 'verse') {
            const verse = document.createElement('div');
            verse.className = 'cp-verse';
            body.appendChild(verse);
            block.lines.forEach((line, i) => {
                const div = document.createElement('div');
                verse.appendChild(div);
                cpQueueText(div, line, { reveal: cpPend(i === 0 ? [verse, div] : [div]) });
            });
        }
    });

    bubble.dataset.plain = cpReplyToText(reply.blocks);
    cpTypeNext(bubble);
}

/* A code block, with the language tag and copy button every real one
   has. The code is the one thing exempt from the corg substitution —
   you can't read a program made of dogs. */
function cpCodeElement(block) {
    const wrap = document.createElement('div');
    wrap.className = 'cp-codeblock';

    const bar = document.createElement('div');
    bar.className = 'cp-codebar';
    const lang = document.createElement('span');
    lang.className = 'cp-codelang';
    lang.textContent = block.lang || 'text';
    const copy = document.createElement('button');
    copy.className = 'cp-codecopy';
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.onclick = () => cpCopy(block.text, copy);
    bar.appendChild(lang);
    bar.appendChild(copy);

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    pre.appendChild(code);

    wrap.appendChild(bar);
    wrap.appendChild(pre);
    cpQueueText(code, block.text, { noCorg: true, reveal: cpPend([wrap]) });
    return wrap;
}

function cpQueueTable(body, block) {
    const wrap = document.createElement('div');
    wrap.className = 'cp-tablewrap';
    const table = document.createElement('table');
    table.className = 'cp-table';

    const thead = document.createElement('thead');
    const hrow = document.createElement('tr');
    block.head.forEach((cell, i) => {
        const th = document.createElement('th');
        hrow.appendChild(th);
        cpQueueText(th, cell, { reveal: i === 0 ? cpPend([wrap, hrow]) : null });
    });
    thead.appendChild(hrow);

    const tbody = document.createElement('tbody');
    block.rows.forEach((cells) => {
        const tr = document.createElement('tr');
        cells.forEach((cell, i) => {
            const td = document.createElement('td');
            tr.appendChild(td);
            cpQueueText(td, cell, { reveal: i === 0 ? cpPend([tr]) : null });
        });
        tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    body.appendChild(wrap);
}

/* The "Thought for 2.4s" drawer, collapsed, above the answer. The
   number is the stall it actually just did, which is the only honest
   figure in the whole panel. */
function cpAddThoughts(bubble, lines, thinkMs) {
    const box = document.createElement('div');
    box.className = 'cp-think';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'cp-think-head';
    const caret = document.createElement('span');
    caret.className = 'cp-think-caret';
    caret.textContent = '›';
    const label = document.createElement('span');
    label.textContent = 'Thought for ' + (thinkMs / 1000).toFixed(1) + 's';
    head.appendChild(caret);
    head.appendChild(label);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'cp-think-body';
    lines.forEach((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        cpCorgify(p);
        bodyEl.appendChild(p);
    });

    head.onclick = () => {
        box.classList.toggle('open');
        if (typeof playSound === 'function') playSound('upgrade-audio');
        cpScroll();
    };
    // A reasoning model shows you the reasoning without being asked.
    if (cpModel.reasons) box.classList.add('open');

    box.appendChild(head);
    box.appendChild(bodyEl);
    bubble.appendChild(box);
}

function cpTypeNext(bubble) {
    const job = cpQueue[0];
    if (!job) { cpFinishReply(bubble); return; }

    // Whatever this job writes into becomes visible now, and the caret
    // moves onto it — a caret pinned to the end of the bubble blinks
    // below the text it is supposed to be writing.
    if (job.reveal) {
        job.reveal.forEach((el) => el.classList.remove('cp-pending'));
        job.reveal = null;
    }
    cpMoveCaret(job.el);

    // Two or three characters a tick, at a wobbling interval: one at a
    // time is too slow to read as a stream and too even to read as one.
    // How far along we are is counted here rather than read back off the
    // element — the panel is data-no-corg now, but a job that measures its
    // own progress can't be derailed by anything else rewriting the DOM.
    job.i = (job.i || 0) + 1 + Math.floor(Math.random() * 3);
    job.el.textContent = job.text.slice(0, job.i);
    if (!job.noCorg) cpBarkFor(job);
    cpScroll();

    // A beat at the end of a clause, so the stream breathes.
    let wait = cpRange(CP_TYPE_MIN_MS, CP_TYPE_MAX_MS) * (cpModel.speed || 1);
    const at = job.text.charAt(Math.min(job.i, job.text.length) - 1);
    if (at === ',' || at === '\n') wait += CP_PAUSE_COMMA_MS;
    else if (at === '.' || at === '!' || at === '?') wait += CP_PAUSE_STOP_MS;

    if (job.i >= job.text.length) {
        // Written, so it stops being the word and becomes the dog.
        if (!job.noCorg) cpCorgify(job.el);
        cpQueue.shift();
    }

    cpTypeTimer = setTimeout(() => cpTypeNext(bubble), wait);
}

/* One bark per "corg" as it lands. The job counts the words it has
   already said out loud, so a tick that completes a word barks once and
   a tick that lands mid-word doesn't — and the gap keeps a fast model
   from stacking a dozen clips on top of each other. Code blocks are
   silent for the same reason they stay spelled out: nobody reads a
   program aloud. */
function cpBarkFor(job) {
    const said = (job.text.slice(0, job.i).match(CP_CORG_RE) || []).length;
    CP_CORG_RE.lastIndex = 0;
    if (said <= (job.said || 0)) return;
    job.said = said;

    const now = Date.now();
    if (now - cpLastBarkAt < CP_BARK_GAP_MS) return;
    cpLastBarkAt = now;
    if (typeof playSound === 'function') playSound('corg-audio');
}

/* The blinking block, on whichever element is being written into. */
let cpCaretEl = null;

function cpMoveCaret(el) {
    if (cpCaretEl === el) return;
    if (cpCaretEl) cpCaretEl.classList.remove('cp-caret');
    cpCaretEl = el;
    if (el) el.classList.add('cp-caret');
}

/* The stop button, and also what closing the window does: every
   outstanding job is filled in at once rather than abandoned half
   written. */
function cpFinishNow() {
    if (cpThinkTimer) { clearTimeout(cpThinkTimer); cpThinkTimer = null; }
    cpStopStatus();
    cpHideTyping();
    if (cpTypeTimer) { clearTimeout(cpTypeTimer); cpTypeTimer = null; }

    const bubble = document.querySelector('#corgpilot-log .cp-bubble.cp-streaming');
    cpQueue.forEach((job) => {
        if (job.reveal) job.reveal.forEach((el) => el.classList.remove('cp-pending'));
        job.el.textContent = job.text;
        if (!job.noCorg) cpCorgify(job.el);
    });
    // Filling a stopped answer in all at once is one action, not fifty
    // words, so it doesn't bark fifty times.
    cpQueue = [];

    if (bubble) cpFinishReply(bubble);
    else cpSetBusy(false);
}

function cpFinishReply(bubble) {
    if (cpTypeTimer) { clearTimeout(cpTypeTimer); cpTypeTimer = null; }
    cpMoveCaret(null);
    bubble.classList.remove('cp-streaming');

    const plain = bubble.dataset.plain || '';
    const row = bubble.closest('.cp-row');
    const question = (row && row.dataset.question) || cpLastQuestion;

    cpAddSources(bubble);
    cpAddStats(bubble, plain);
    cpAddActions(bubble, plain, question);

    cpSetBusy(false);
    cpRenderFollowups(question);
    cpScroll();
}

function cpAddSources(bubble) {
    const wrap = document.createElement('div');
    wrap.className = 'cp-sources';

    const label = document.createElement('div');
    label.className = 'cp-sources-label';
    label.textContent = 'Sources';
    wrap.appendChild(label);

    const list = document.createElement('div');
    list.className = 'cp-source-list';
    cpSources().forEach((src, i) => {
        const chip = document.createElement('span');
        chip.className = 'cp-source';

        const num = document.createElement('span');
        num.className = 'cp-source-num';
        num.textContent = String(i + 1);

        const text = document.createElement('span');
        text.className = 'cp-source-text';
        const title = document.createElement('span');
        title.className = 'cp-source-title';
        title.textContent = src.title;
        cpCorgify(title);
        const host = document.createElement('span');
        host.className = 'cp-source-host';
        host.textContent = src.host;

        text.appendChild(title);
        text.appendChild(host);
        chip.appendChild(num);
        chip.appendChild(text);
        list.appendChild(chip);
    });

    wrap.appendChild(list);
    bubble.appendChild(wrap);
}

/* The footer every assistant grew: which model answered, what it cost
   you in tokens, how long it took. All three are made up, and the
   seconds are the only one that is actually measured. */
function cpAddStats(bubble, plain) {
    const stats = document.createElement('div');
    stats.className = 'cp-stats';
    const secs = Math.max(0.1, (Date.now() - cpStreamStartedAt) / 1000);
    const tokens = Math.max(1, Math.round(plain.length / 4));
    stats.textContent = cpModel.name + ' · ' + tokens + ' tokens · ' + secs.toFixed(1) + 's';
    bubble.appendChild(stats);
}

function cpAddActions(bubble, plain, question) {
    const bar = document.createElement('div');
    bar.className = 'cp-actions';

    const copy = cpActionButton('⧉', 'Copy', 'Copy answer');
    copy.onclick = () => cpCopy(plain, copy);
    bar.appendChild(copy);

    const up = cpActionButton('👍', '', 'Good response');
    const down = cpActionButton('👎', '', 'Bad response');
    up.onclick = () => cpVote(up, down);
    down.onclick = () => cpVote(down, up);
    bar.appendChild(up);
    bar.appendChild(down);

    const again = cpActionButton('↻', '', 'Regenerate');
    again.onclick = () => cpRegenerate(bubble, question);
    bar.appendChild(again);

    bubble.appendChild(bar);
}

function cpActionButton(icon, label, title) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cp-action';
    btn.title = title;
    btn.setAttribute('aria-label', title);

    const ic = document.createElement('span');
    ic.className = 'cp-action-icon';
    ic.textContent = icon;
    btn.appendChild(ic);

    if (label) {
        const tx = document.createElement('span');
        tx.className = 'cp-action-label';
        tx.textContent = label;
        btn.appendChild(tx);
    }
    return btn;
}

/* Copy, with the label flip that tells you it worked. Falls back to a
   throwaway textarea, because `navigator.clipboard` needs a secure
   context and this desktop gets opened off a file:// URL as often as
   not. */
function cpCopy(text, btn) {
    const done = () => {
        const label = btn && (btn.querySelector('.cp-action-label') || btn);
        if (!label) return;
        const was = label.textContent;
        label.textContent = 'Copied';
        btn.classList.add('cp-done');
        setTimeout(() => { label.textContent = was; btn.classList.remove('cp-done'); }, 1400);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => cpCopyFallback(text, done));
    } else {
        cpCopyFallback(text, done);
    }
    if (typeof playSound === 'function') playSound('upgrade-audio');
}

function cpCopyFallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* nothing else to try */ }
    ta.remove();
}

function cpVote(picked, other) {
    other.classList.remove('cp-on');
    picked.classList.toggle('cp-on');
    if (typeof playSound === 'function') playSound('upgrade-audio');
}

/* Regenerate throws the answer away and asks again, without echoing the
   question a second time — same as the real one. */
function cpRegenerate(bubble, question) {
    if (cpBusy || !question) return;
    const row = bubble.closest('.cp-row');
    if (row) row.remove();
    cpSubmit(question, false);
}

/* What the copy button hands over: the answer as text, which is the one
   place the word stays the word. */
function cpReplyToText(blocks) {
    const runsText = (runs) => runs.map((r) => r.text).join('');
    const out = [];
    blocks.forEach((block) => {
        if (block.type === 'p') out.push(runsText(block.runs));
        else if (block.type === 'h') out.push(block.text);
        else if (block.type === 'ul') block.items.forEach((r) => out.push('- ' + runsText(r)));
        else if (block.type === 'ol') block.items.forEach((r, i) => out.push((i + 1) + '. ' + runsText(r)));
        else if (block.type === 'code') out.push('```' + (block.lang || '') + '\n' + block.text + '\n```');
        else if (block.type === 'quote') out.push('> ' + block.text);
        else if (block.type === 'callout') out.push(runsText(block.runs));
        else if (block.type === 'verse') out.push(block.lines.join('\n'));
        else if (block.type === 'table') {
            out.push(block.head.join(' | '));
            block.rows.forEach((cells) => out.push(cells.join(' | ')));
        }
    });
    return out.join('\n\n');
}

/* ------------------------------------------------------------------
   Chrome
   ------------------------------------------------------------------ */

const CP_SEND_ICON = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">'
    + '<path fill="currentColor" d="M8 1.6 13.4 7l-1.1 1.1L8.8 4.6V14h-1.6V4.6L3.7 8.1 2.6 7z"/></svg>';
const CP_STOP_ICON = '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">'
    + '<rect fill="currentColor" x="4" y="4" width="8" height="8" rx="1.5"/></svg>';

function cpSetBusy(busy) {
    cpBusy = busy;
    const btn = document.getElementById('corgpilot-send');
    if (btn) {
        btn.innerHTML = busy ? CP_STOP_ICON : CP_SEND_ICON;
        btn.title = busy ? 'Stop generating' : 'Send';
        btn.setAttribute('aria-label', btn.title);
        btn.classList.toggle('cp-stopping', busy);
    }
    const input = document.getElementById('corgpilot-input');
    if (input) input.placeholder = busy ? 'Corgpilot is replying...' : 'Ask Corgpilot anything';
    const win = document.querySelector('.corgpilot-window');
    if (win) win.classList.toggle('cp-working', busy);
}

function cpShowStatus(text) {
    const el = document.getElementById('corgpilot-status');
    if (!el) return;
    const label = el.querySelector('.cp-status-text');
    if (label) label.textContent = text;
    else el.textContent = text;
    el.classList.add('on');
}

function cpStopStatus() {
    if (cpStatusTimer) { clearInterval(cpStatusTimer); cpStatusTimer = null; }
    const el = document.getElementById('corgpilot-status');
    if (el) el.classList.remove('on');
}

function cpHideSuggestions() {
    const el = document.getElementById('corgpilot-suggestions');
    if (el) { el.innerHTML = ''; el.style.display = 'none'; }
}

/* The three follow-ups under a finished answer. Written in plain
   English on purpose: they're the only thing in the panel that isn't
   corg, which is what makes them read as the UI rather than as the
   answer. */
function cpRenderFollowups(question) {
    const el = document.getElementById('corgpilot-suggestions');
    if (!el) return;
    const intent = cpIntentFor(question || '');
    const list = (intent && intent.followups) || CP_FOLLOWUP_DEFAULT;

    el.innerHTML = '';
    list.forEach((text) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'cp-chip';
        chip.textContent = text;
        chip.onclick = () => cpAsk(text);
        el.appendChild(chip);
    });
    el.style.display = 'flex';
}

/* ------------------------------------------------------------------
   The model picker
   ------------------------------------------------------------------ */

function cpModelById(id) {
    return CP_MODELS.find((m) => m.id === id) || CP_MODELS[0];
}

function cpLoadModel() {
    let saved = null;
    try { saved = localStorage.getItem(CP_MODEL_KEY); } catch (e) { /* private mode */ }
    cpModel = cpModelById(saved);
    cpPaintModel();
}

function cpPaintModel() {
    const name = document.getElementById('corgpilot-model-name');
    if (name) name.textContent = cpModel.name;
}

/* The dropdown is built fresh each time it opens: it is four rows, and
   rebuilding is cheaper than keeping the ticks in sync. */
function cpToggleModelMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('corgpilot-model-menu');
    if (!menu) return;

    if (menu.style.display === 'block') { cpCloseModelMenu(); return; }

    menu.innerHTML = '';
    CP_MODELS.forEach((model) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'cp-model-item' + (model.id === cpModel.id ? ' cp-on' : '');

        const tick = document.createElement('span');
        tick.className = 'cp-model-tick';
        tick.textContent = model.id === cpModel.id ? '✓' : '';

        const text = document.createElement('span');
        text.className = 'cp-model-text';
        const top = document.createElement('span');
        top.className = 'cp-model-name';
        top.textContent = model.name;
        const tag = document.createElement('span');
        tag.className = 'cp-model-tag';
        tag.textContent = model.tag;
        const blurb = document.createElement('span');
        blurb.className = 'cp-model-blurb';
        blurb.textContent = model.blurb;
        top.appendChild(tag);
        text.appendChild(top);
        text.appendChild(blurb);

        row.appendChild(tick);
        row.appendChild(text);
        row.onclick = (ev) => { ev.stopPropagation(); cpSetModel(model.id); };
        menu.appendChild(row);
    });

    menu.style.display = 'block';
    if (typeof playSound === 'function') playSound('upgrade-audio');
    setTimeout(() => document.addEventListener('click', cpCloseModelMenu, { once: true }), 0);
}

function cpCloseModelMenu() {
    const menu = document.getElementById('corgpilot-model-menu');
    if (menu) menu.style.display = 'none';
}

function cpSetModel(id) {
    const model = cpModelById(id);
    cpCloseModelMenu();
    if (model.id === cpModel.id) return;

    cpModel = model;
    try { localStorage.setItem(CP_MODEL_KEY, model.id); } catch (e) { /* private mode */ }
    cpPaintModel();
    cpNote('Switched to ' + model.name);
    if (typeof playSound === 'function') playSound('upgrade-audio');
}

/* A centred line in the transcript for something the app did rather than
   something either of you said. */
function cpNote(text) {
    const log = cpLog();
    if (!log) return;
    const note = document.createElement('div');
    note.className = 'cp-note';
    note.textContent = text;
    log.appendChild(note);
    cpScroll();
}

/* The panel's own furniture gets the same treatment as the answers: the
   disclaimer, the greeting and the starter cards all say "corg", and
   everywhere else on this desktop that word is a picture of him. Only the
   composer is left spelled out, because an <input> can't hold a picture.
   Done on open — cpCorgify() marks what it has already done, so calling
   it again is free. */
function cpCorgifyChrome() {
    const disclaimer = document.getElementById('corgpilot-disclaimer');
    if (disclaimer) cpCorgify(disclaimer);
    document.querySelectorAll('#corgpilot-screen .cp-welcome-sub, '
        + '#corgpilot-screen .cp-card-title, #corgpilot-screen .cp-card-sub')
        .forEach((el) => cpCorgify(el));
}

/* The empty state: the hero every assistant opens on, and four starter
   cards instead of a blank transcript. */
function cpRenderWelcome() {
    const log = cpLog();
    if (!log || log.querySelector('.cp-welcome')) return;

    const hero = document.createElement('div');
    hero.className = 'cp-welcome';

    const avatar = document.createElement('img');
    avatar.className = 'cp-welcome-avatar';
    avatar.src = CP_ICON;
    avatar.alt = '';

    const title = document.createElement('div');
    title.className = 'cp-welcome-title';
    title.textContent = 'Hi, I’m Corgpilot';

    const sub = document.createElement('div');
    sub.className = 'cp-welcome-sub';
    sub.textContent = 'Your corg companion for CORGOS 11. Ask me anything at all.';

    const cards = document.createElement('div');
    cards.className = 'cp-cards';
    CP_SUGGESTIONS.forEach((item) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'cp-card';

        const icon = document.createElement('span');
        icon.className = 'cp-card-icon';
        icon.textContent = item.icon;

        const text = document.createElement('span');
        text.className = 'cp-card-text';
        const t = document.createElement('span');
        t.className = 'cp-card-title';
        t.textContent = item.title;
        const s = document.createElement('span');
        s.className = 'cp-card-sub';
        s.textContent = item.sub;
        text.appendChild(t);
        text.appendChild(s);

        card.appendChild(icon);
        card.appendChild(text);
        card.onclick = () => cpAsk(item.title);
        cards.appendChild(card);
    });

    hero.appendChild(avatar);
    hero.appendChild(title);
    hero.appendChild(sub);
    hero.appendChild(cards);
    log.appendChild(hero);
}

function cpClearWelcome() {
    const log = cpLog();
    const hero = log && log.querySelector('.cp-welcome');
    if (hero) hero.remove();
}

/* Wipes the transcript back to the empty state — Copilot's "New chat". */
function cpNewChat() {
    cpFinishNow();
    const log = cpLog();
    if (log) log.innerHTML = '';
    cpGreeted = false;
    cpHideSuggestions();
    cpGreet();
    cpCorgifyChrome();
    if (typeof playSound === 'function') playSound('upgrade-audio');
}

function cpGreet() {
    cpRenderWelcome();
    if (cpGreeted) return;
    cpGreeted = true;
    const made = cpSay('bot', '');
    if (!made) return;
    const p = document.createElement('p');
    p.textContent = 'Corg! Corg corg corg — corg?';
    cpCorgify(p);
    made.bubble.appendChild(p);
    cpScroll();
}

/* ------------------------------------------------------------------
   Open / close
   ------------------------------------------------------------------ */

function toggleCorgpilot() {
    const screen = document.getElementById('corgpilot-screen');
    if (!screen) return;

    // The displayed state, not cpOpen: shutDown() hides every .screen-overlay
    // behind our back, and a flag that disagreed with the screen would cost a
    // click to resync.
    if (screen.style.display === 'flex') {
        cpFinishNow();
        screen.style.display = 'none';
        cpOpen = false;
        if (typeof isPaused !== 'undefined') isPaused = false;
        return;
    }

    cpOpen = true;
    // Same as every other app window here: the clicker stops ticking
    // behind it rather than racking up score while you talk to a dog.
    if (typeof isPaused !== 'undefined') isPaused = true;
    screen.style.display = 'flex';
    cpLoadModel();
    cpGreet();
    cpCorgifyChrome();
    cpSetBusy(false);
    if (typeof playSound === 'function') playSound('window-open-audio');

    const input = document.getElementById('corgpilot-input');
    if (input) setTimeout(() => input.focus(), 50);
}
