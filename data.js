// data.js: stores all static game variables, configurations, and content arrays. (stuff like achievements, corg lines, and upgrades)

// game state & globals
var score = 0;
var gugPerClick = 1;
var gugPerSecond = 0;
var adMultiplier = 1.0;
var recycleReward = 0;
var isPaused = false;
var gameLoopInterval;
var sfxVolume = 1.0;
// Two volumes that are deliberately NOT under sfxVolume, because the things
// they control are the two loudest, most opinion-splitting sounds in the game
// and each wants its own dial rather than a share of one:
//   musicVolume — Ad Smasher's radio, the only music left (adsmasher.js).
//   glassVolume — the ad/intro glass breaks (playGlassBreakSfx), which is the
//                 sound the title screen warns you about.
var musicVolume = 0.5;
var glassVolume = 1.0;
var trueEndingAchieved = false;
// game state globals that are mainly made for achievement stats
var unlockedAchievements = [];
var agreedWithGuggy = false;
var disagreedWithGuggy = false;
var totalAdsTrashed = 0;
// Ads Corg has gone through rather than shoved aside, and the most that ever
// broke on one throw. Both feed the shatter achievements; see shatterAd().
var totalAdsShattered = 0;
var bestShatterCombo = 0;
var gugOS11Unlocked = false;
var devModeEnabled = false;

// --- define the achievements in the game, add an id, title, description, and condition needed for them to activate ---
const achievements = [
    { id: 'first_click', title: "A Humble Beginning", desc: "Hoard your very first CORG.", condition: () => score >= 1 || gugPerClick > 1 },
    { id: 'max_offworld_relocation', title: "<q>I HATE GUG SO FUCKING MUCH</q> ~ You, probably.",   desc: "Max out the Offworld Relocation upgrade, you little ad hater you.", condition: () => {const offworldUpgrade = upgrades.find(u => u.name === "Offworld Relocation for Ads"); return offworldUpgrade !== undefined && offworldUpgrade.count >= 5;} },
    { id: 'hoarder_1', title: "CORG Enthusiast", desc: "Hoard 1,000 CORGs.", condition: () => score >= 1000 },
    { id: 'hoarder_2', title: "CORG Millionaire", desc: "Hoard 1 Million CORGs.", condition: () => score >= 1000000 },
    { id: 'hoarder_3', title: "CORG Billionaire", desc: "Hoard 1 Billion CORGs.", condition: () => score >= 1000000000 },
    { id: 'hoarder_4', title: "CORG Trillionaire", desc: "Hoard 1 Trillion CORGs.", condition: () => score >= 1000000000000 },
    { id: 'hoarder_5', title: "CORG Quadrillionaire", desc: "Hoard 1 Quadrillion CORGs.", condition: () => score >= 1000000000000000 },
    { id: 'auto_hoard_1', title: "Automated Hoarding", desc: "Hoard 100 CORG per second.", condition: () => gugPerSecond >= 100 },
    { id: 'auto_hoard_2', title: "Major Hoarding", desc: "Hoard 10 Thousand CORG per second.", condition: () => gugPerSecond >= 10000 },
    { id: 'auto_hoard_3', title: "IMMENSE Hoarding", desc: "Hoard 1 Million CORG per second, ", condition: () => gugPerSecond >= 1000000 },
    { id: 'auto_hoard_4', title: "INSANE HOARDING", desc: "Hoard 1 BILLION CORG PER SECOND, HOW ARE YOU DOING THIS???", condition: () => gugPerSecond >= 1000000000 },
    { id: 'auto_hoard_5', title: "RAM LEVEL HOARDING", desc: "HOARD OVER 1 TRILLION CORG PER SECOND... Many children in Afghanistan will dedicate their lives slaving away just so you can have your stupid amount of CORG, but thats okay, because its just a number on the screen right?", condition: () => gugPerSecond >= 1000000000000 },
    { id: 'trash_1', title: "Taking Out the Trash", desc: "Trash 10 popup ads.", condition: () => totalAdsTrashed >= 10 },
    { id: 'trash_2', title: "Starter Janitor", desc: "Trash 50 popup ads.", condition: () => totalAdsTrashed >= 50 },
    { id: 'trash_3', title: "Sanitation Expert", desc: "Trash 100 popup ads.", condition: () => totalAdsTrashed >= 100 },
    { id: 'trash_4', title: "Waste Management CEO", desc: "Trash 250 popup ads.", condition: () => totalAdsTrashed >= 250 },
    { id: 'trash_5', title: "Ad Trasher Legend", desc: "Trash 500 popup ads, you might be insane if you do this by the way.", condition: () => totalAdsTrashed >= 500 },
    { id: 'shatter_1', title: "Through the Window", desc: "Throw Corg hard enough to break a popup ad into pieces.", condition: () => totalAdsShattered >= 1 },
    { id: 'shatter_2', title: "Who's Paying For This?", desc: "Shatter 25 popup ads.", condition: () => totalAdsShattered >= 25 },
    { id: 'shatter_3', title: "Corgi-Proof Glazing", desc: "Shatter 100 popup ads. The forcefield was never the problem.", condition: () => totalAdsShattered >= 100 },
    { id: 'shatter_combo', title: "Strike!", desc: "Break 3 popup ads with a single throw, without Corg touching the ground.", condition: () => bestShatterCombo >= 3 },
    { id: 'crazyads', title: "You left the game open, didn't you?", desc: "Have 100 popup ads open at the exact same time.", condition: () => document.querySelectorAll('.popup-ad').length >= 100 },
    { id: 'guggy_yes', title: "In Corg We Trust!", desc: "Agree with Corg's questionable advice.", condition: () => agreedWithGuggy },
    { id: 'guggy_no', title: "Skeptic", desc: "Refuse a dubious offer from Corg, you monster.", condition: () => disagreedWithGuggy },
    { id: 'gugos11_upgrade', title: "The Future of CORG", desc: "Upgrade your system to CORGOS 11.", condition: () => gugOS11Unlocked },
    { id: 'upgrade_1', title: "First Purchase", desc: "Buy your first upgrade.", condition: () => upgrades.some(u => u.count > 0) },
    { id: 'upgrade_2', title: "Impulse Buyer", desc: "Purchase 100 total upgrades.", condition: () => upgrades.reduce((sum, u) => sum + u.count, 0) >= 100 },
    { id: 'upgrade_3', title: "CORG Optimizer", desc: "Purchase 250 total upgrades.", condition: () => upgrades.reduce((sum, u) => sum + u.count, 0) >= 250  },
    { id: 'upgrade_4', title: "CORGtillion upgrades", desc: "Purchase over 500 total upgrades... How are you not bored of this game yet?", condition: () => upgrades.reduce((sum, u) => sum + u.count, 0) >= 500  },
    { id: 'the_end', title: "Unforeseen Consequences", desc: "Impress G-Man's employers.", condition: () => trueEndingAchieved || upgrades.find(u => u.id === 10).count > 0 },
    { id: 'true_ending', title: "The True Ending", desc: "Buy Valve Software and become the absolute CORG.", condition: () => trueEndingAchieved || (upgrades.find(u => u.id === 21) && upgrades.find(u => u.id === 21).count > 0) },
    { id: '100_percent', title: "CORG Completionist", desc: "Unlock every other achievement in the game. Thank you so much for playing ~ Corg.", condition: () => { const otherAchievements = achievements.filter(a => a.id !== '100_percent');  return otherAchievements.every(a => unlockedAchievements.includes(a.id));} }
];


// formatters and maps
const numberSuffixes = ["", "thousand", "million", "billion", "trillion", "quadrillion", "quintillion", "sextillion", "septillion", "octillion", "nonillion", "decillion", "undecillion", "duodecillion", "tredecillion", "quattuordecillion", "quindecillion", "sexdecillion", "septendecillion", "octodecillion", "novemdecillion", "vigintillion"];

// There is no background music. The playlist, the true-ending track and the
// streamer-safe substitute for the playlist are all gone, and with them the
// music volume control and Streamer Mode — which existed only to swap one for
// the other. Sound effects are untouched: this desktop still clicks, chimes,
// breaks glass and corgs at you.

// interactive upgrades logic
const upgrades = [
    { id: 0, tab: 'main', name: "Combine EMP Burst", desc: "Closes all active windows all at once. They will return.", baseCost: 50, cost: 50, count: 0, isConsumable: true, effect: () => { document.querySelectorAll('.popup-ad').forEach(ad => ad.remove()); } },
    { id: 11, tab: 'main', name: "Offworld Relocation for Ads", desc: "Reduces ad popup spawn rates by 15%. This will effect your possible drops from Gugslop, so choose wisely. (Max 5).", baseCost: 500, cost: 500, count: 0, maxCount: 5, isLimit: true, effect: () => { adMultiplier -= 0.15; } },
    { id: 1, tab: 'main', name: "Crowbar Click", desc: "Use a crowbar to pry open a crate full of playful CORGs. +1 CORG per click.", baseCost: 15, cost: 15, count: 0, effect: () => { gugPerClick += 1; } },
    { id: 2, tab: 'main', name: "Hacked Manhack", desc: "Have a friendly manhack herd a little CORG for you. +1 CORG per second.", baseCost: 50, cost: 50, count: 0, effect: () => { gugPerSecond += 1; } },
    { id: 3, tab: 'main', name: "Dog Treats", desc: "Premium crunchy treats, the number one fuel of a happy CORG. +5 CORG per click.", baseCost: 300, cost: 300, count: 0, effect: () => { gugPerClick += 5; } },
    { id: 4, tab: 'main', name: "Vortigaunt Energy", desc: "Gallaunngg. +10 CORG per second.", baseCost: 1000, cost: 1000, count: 0, effect: () => { gugPerSecond += 10; } },
    { id: 5, tab: 'main', name: "Source 2 Port", desc: "Everything is getting ported to source 2, even Ricochet! +25 CORG per click.", baseCost: 2500, cost: 2500, count: 0, effect: () => { gugPerClick += 25; } },
    { id: 6, tab: 'main', name: "Gabe's Golden CORG", desc: "A rare golden corgi blessed by Gaben himself. +50 CORG per second.", baseCost: 5000, cost: 5000, count: 0, effect: () => { gugPerSecond += 50; } },
    { id: 7, tab: 'main', name: "197", desc: "Valve CONFIRMED 197 was REAL ALL ALONG!! +197 CORG per second.", baseCost: 15000, cost: 15000, count: 0, effect: () => { gugPerSecond += 197; } },
    { id: 8, tab: 'main', name: "Deadlock Releases", desc: "Deadlock releases sometime in the next quarter century +300 CORG per click.", baseCost: 50000, cost: 50000, count: 0, effect: () => { gugPerClick += 300; } },
    { id: 9, tab: 'main', name: "HLX Announcement", desc: "HLX is announced! Where you start corging it as Corgdan Freeman. +1000 CORG per sec.", baseCost: 250000, cost: 250000, count: 0, effect: () => { gugPerSecond += 1000; } },
    {
        id: 10, tab: 'main', name: "Unforeseen Consequences...", desc: "Impresses G-Man's employers and beat the game. You'll be able to continue playing after paying for this.", baseCost: 1000000, cost: 1000000, count: 0,
        effect: () => {
            // The ending fires; the can stays a can. Buying an ending used to
            // repaint #gug-can (and remember it), which is the last of the skin
            // system — it's gone.
            gugPerSecond += 1000000;
            triggerGameOver();
        }
    },
    { id: 12, tab: 'main', name: "The Borealis Manifest", desc: "Aperture's lost ship was actually just delivering a massive shipment of CORGs. +5,000,000 CORG per second.", baseCost: 15000000, cost: 15000000, count: 0, effect: () => { gugPerSecond += 5000000; } },
    { id: 13, tab: 'main', name: "Breen's Private Reserve", desc: "Dr. Breen's secret reserve of champion show corgis. +15,000,000 CORG per click.", baseCost: 50000000, cost: 50000000, count: 0, effect: () => { gugPerClick += 15000000; } },
    { id: 14, tab: 'main', name: "Cave Johnson's Combustible CORG", desc: "I'M THE MAN WHO'S GONNA FILL YOUR HOUSE WITH CORGIS! +50,000,000 CORG per sec.", baseCost: 250000000, cost: 250000000, count: 0, effect: () => { gugPerSecond += 50000000; } },
    { id: 15, tab: 'main', name: "Steam Deck 2 Prototype", desc: "Now you can hoard CORGs on the toilet, only for a corgtillion dollars. +100,000,000 CORG per click.", baseCost: 1000000000, cost: 1000000000, count: 0, effect: () => { gugPerClick += 100000000; } },
    { id: 16, tab: 'main', name: "Resonance Cascade", desc: "They're waiting for you Gordon... in the CORG chamber. +250,000,000 CORG per second.", baseCost: 5000000000, cost: 5000000000, count: 0, effect: () => { gugPerSecond += 250000000; } },
    { id: 17, tab: 'main', name: "Gaben's Knife Collection", desc: "Each knife was traded for a pack of hyperactive CORGs. +500,000,000 CORG per click.", baseCost: 25000000000, cost: 25000000000, count: 0, effect: () => { gugPerClick += 500000000; } },
    { id: 18, tab: 'main', name: "Citadel Core Overcharge", desc: "Harnessing the dark energy of the Combine to mass-produce CORGs. +2,000,000,000 CORG per second.", baseCost: 100000000000, cost: 100000000000, count: 0, effect: () => { gugPerSecond += 2000000000; } },
    { id: 19, tab: 'main', name: "Ricochet 2 Release", desc: "It finally happened. The universe collapses under the weight of the hype. +10,000,000,000 CORG per click.", baseCost: 500000000000, cost: 500000000000, count: 0, effect: () => { gugPerClick += 10000000000; } },
    { id: 20, tab: 'main', name: "The G-Man's Briefcase", desc: "What's inside? Near infinite CORGs. Time to choose. +50,000,000,000 CORG per second.", baseCost: 2500000000000, cost: 2500000000000, count: 0, effect: () => { gugPerSecond += 50000000000; } },
    {
        id: 21, tab: 'main', name: "Buy Valve Software", desc: "You have so many CORGs you literally bought Valve. You own Steam now. GET THE TRUE ENDING!!! +1,000,000,000,000 CORG per second.", baseCost: 10000000000000, cost: 10000000000000, count: 0,
        effect: () => {
            gugPerSecond += 1000000000000;
            triggerTrueVictory();
        }
    },
    { id: 101, tab: 'recycle', name: "Pick Up That Ad", desc: "Now put it in Gugslop. Civil Protection rewards your obedience. +50 CORGs per recycle.", baseCost: 1500, cost: 1500, count: 0, effect: () => { recycleReward += 50; } },
    { id: 102, tab: 'recycle', name: "Gravity Gun Punt", desc: "Use the Zero-Point Energy Field Manipulator to violently launch ads into the bin. +500 CORGs per recycle.", baseCost: 25000, cost: 25000, count: 0, effect: () => { recycleReward += 500; } },
    { id: 103, tab: 'recycle', name: "Barnacle Snatch", desc: "Feed the ads to barnacles. +15,000 CORGs per recycle.", baseCost: 1000000, cost: 1000000, count: 0, effect: () => { recycleReward += 15000; } },
    { id: 104, tab: 'recycle', name: "Cremator Immolation", desc: "Have a Combine Cremator zap ads away, leaving behind pure, joyful CORGs. +250,000 CORGs per recycle.", baseCost: 15000000, cost: 15000000, count: 0, effect: () => { recycleReward += 250000; } },
    { id: 105, tab: 'recycle', name: "Anti-Mass Spectrometer", desc: "Push the ads into the beam! It's perfectly safe, no unforeseen consequences here. +10,000,000 CORGs per recycle.", baseCost: 500000000, cost: 500000000, count: 0, effect: () => { recycleReward += 10000000; } },
    { id: 106, tab: 'recycle', name: "Supercharged Gravity Gun", desc: "Vaporize ads instantly with dark energy. Dr. Breen would be terrified. +750,000,000 CORGs per recycle.", baseCost: 25000000000, cost: 25000000000, count: 0, effect: () => { recycleReward += 750000000; } },
    { id: 107, tab: 'recycle', name: "The Nihilanth's Portal", desc: "Teleport the trash straight to Xen. Let the Vortigaunts deal with it! +50,000,000,000 CORGs per recycle.", baseCost: 1000000000000, cost: 1000000000000, count: 0, effect: () => { recycleReward += 50000000000; } }
];

// popups and logic templates
const adTemplates = [
    { title: "Overwatch Alert", html: `<img src="https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fi.pinimg.com%2F736x%2F48%2F81%2F99%2F4881994aeb5acf7ea7040eebde79df40.jpg&f=1&nofb=1" alt="Combine"><p>Hot Combine singles in your area!</p><a href="https://www.youtube.com/channel/UCL5RKbiAPqSC_mUIjCpx3xg" target="_blank">Report to Nova Prospekt</a>` },
    { title: "System Warning", html: `<img src="images/crates/halflifecrate/Dr. Breen GUG.png"><p>Don't drink the gug. They put something in it, to make you forget.</p>` }, // grabs an old crate image instead of an actual ad. i dont want a copy of the same image in two different spots.
    { title: "Fun Fact", html: `<img src="images/ads/fakehl3meme.png" alt="Breen Water"><p>HLX is actually @$@#$@ and will release in !@#!@#^ years!</p>` },
    { title: "MSG: Gaben@Valvesoftware.com - Where is my gug", html: `<img src="images/ads/gaben.webp"><p>Are you taking my gug??! Hope it was worth the wait...</p>` },
    { title: "My e-e-employers are most impressed", html: `<img src="images/ads/gman.webp" alt="Breen Water"><p>Wisely done, gug enjoyer. But I need to extract some c-gug, for your own survival.</p>` },
    { title: "MSG: Bald Bringus - Steam Frame NOW!!", html: `<img src="images/ads/steamframe.jpg">` },
    { title: "MSG: REAL HLX LEAK", html: `<img src="images/ads/hlxgameplay.gif">` },
    { title: "TMV_GUG", html: `<img src="images/ads/gugtmv.gif">` },
    { title: "MSG: Gug - Where is my GUG?", html: `<img src="images/ads/corg.png"><p>"Please dont take my GUG!"</p>` },
    { title: "MSG: Gugen@Valvesoftware.com - BUY GUG TODAY!", html: `<img src="images/ads/gugnewell.png"><p>"For only a gugtillion dollars!"</p>` },
    { title: "FROM THE CREATORS OF GUGCLICKER, BUY GUGSPEDITION 33 TODAY!!!", html: `<img src="images/ads/gugspedition.jpg"><p>"PHYSICAL COPY INCLUDED!"</p>` },
    { title: "BUY OUR GUG MACHINE RIGHT FUCKING NOWWWW!!!!", html: `<img src="images/ads/gugmachine.png"><p>"WE DONT GIVE A SHIT WHAT VALVE THINKS GIVE US YOUR MONEY"</p>` },
    { title: "About that GUG I owed ya - A NYC BEST SELLER", html: `<img src="images/ads/barneygug1.png">` },
    { title: "MSG: Barney - About that GUG I owed ya", html: `<img src="images/ads/barneygug2.png"><p>"Here's your GUG Gordon!"</p>` },
    { title: "REPORT: ONLY 18 DAYS REMAINING UNTIL VALVE RELEASES GUGGING THE BAR??!!", html: `<img src="images/ads/18days.gif">` },
    { title: "REPORT: LOST GUG, AGE 26, HEIGHT 1 GUG CAN TALL!", html: `<img src="images/ads/myfamily.png"><p>"If you have any info on the where abouts of the Gug in the top right corner, please call (248) 434-5508"</p>` },
    { title: "GUG scientists have now made a ZERO SUGAR GUG", html: `<img src="images/ads/gugzero.png"><p>"It's for actual losers", The GUG scientists report.</p>` },
    { title: "Gugman Freeman APPROVES of the extreme usage of GUG", html: `<img src="images/ads/gugmanfreeman.png">` },
    { title: "VALVE CEO TYLER MCGUGER APROVES OF THE EXTREME USAGE OF GUG", html: `<img src="images/ads/tylergug.png">` },
    { title: "FROM THE AUTHOR OF <q>About that GUG I owed  ya</q>, Raising the GUG coming to shelves SOON™", html: `<img src="images/ads/raisinggug.png">` },
    { title: "If you don't dream of GUG, what is wrong with you?", html: `<img src="images/ads/gugdream.png">` },
    { title: "REPORT: GUG REPORTADLY FOUND, MILLIONS DEAD OVER FIGHTING FOR IT.", html: `<img src="images/ads/gugfound.png">` },
    { title: "If its not GUG enough, nothing will be. - BUY GUG NOW", html: `<img src="images/ads/notgugenough.gif">` },
    { title: "REPORT: GUG HAS REACHED SPACE!", html: `<img src="images/ads/itisgug.png">` },
    { title: "REPORT: Man receives GUG instead of RUM", html: `<img src="images/ads/gugrum.png">` },
    // The ads know where they're headed. Text-only on purpose — they're the
    // ones you read right before you drag them into the bin.
    { title: "MSG: Gugslop Waste Disposal - FINAL NOTICE", html: `<p><strong>Please do not put this ad in Gugslop.</strong></p><p>Gugslop is at 114% capacity. Every ad you feed it comes back as CORG, and frankly we are running out of places to put the CORG.</p>` },
    { title: "Gugslop&trade; - Where CORG Comes From", html: `<p>Ever wonder where your CORGs come from? <em>Gugslop.</em></p><p>Ads go in. CORG comes out. Nobody asks what happens in the middle. Certainly not the ads.</p>` },
    { title: "WARNING: THIS AD IS GUGSLOP-COMPATIBLE", html: `<p>Certified 100% sloppable. Drag me into Gugslop for a CORG payout!</p><p>(Please don't. I have a family. They're also ads.)</p>` },
    { title: "MSG: Local Ad - I have seen the inside of Gugslop", html: `<p>It is CORG in there. All of it. Wall to wall CORG.</p><p>I have been recycled eleven times. I remember every single one.</p>` },
    { title: "GUGSLOP QUARTERLY: Slop Prices at Record High", html: `<p>Analysts confirm one (1) trashed ad is now worth more CORG than ever. Investors urged to keep throwing.</p><p>"Just keep throwing," said the bin.</p>` },
    { title: "Corg says: put that ad in Gugslop", html: `<img src="images/ads/corg.png"><p>"<img class="corg-word" src="images/corg.png" alt="corg">"</p><p><em>(Corg is legally required to state that Corg does not go in Gugslop. The forcefield is not optional.)</em></p>` },
];

const tylerVideos = [
    { id: "w14ZUG1EKio", title: "HL3 Tech Overview" }, { id: "Q9ug2VyTPlo", title: "HL3 Enemies Leak" }, { id: "34uDQ-I7Oec", title: "HL3 Mechanics" },
    { id: "mBkjKm170tQ", title: "Alyx OST Unboxing" }, { id: "twBwCZMCsbI", title: "Portal 2 Cut Content" }, { id: "N7pbCj3xyMk", title: "Source 2 - 2014" },
    { id: "kdvzwXQcWoY", title: "HL3 WILL Release" }, { id: "BuXE1ee34-A", title: "Valve's New Game?" }, { id: "_ERiBgyWNB0", title: "Tyler is live!", start: 1070 },
    { id: "8Fi44EB4hjk", title: "HLX Files #19" }, { id: "4ufSGBHp99Q", title: "L4D3 Leaked Art" }, { id: "6zJqd_GiDGc", title: "Portal On Switch?!?!" },
    { id: "PFVlYygQybU", title: "Nintendo News Channel!!" }, { id: "VpupMQ8ecRQ", title: "NEW FLAGSHIP VR TITLE?!" },
];

// The `credentialless` attribute is what keeps these playing, and it is not
// optional. The page is served cross-origin-isolated (COOP + COEP, because
// Half-Life's WASM threads need SharedArrayBuffer) and a COEP document refuses
// to frame anything that doesn't declare COEP itself — youtube.com doesn't, so
// without this every VNN ad was a blocked, blank frame. `credentialless` is the
// escape hatch for exactly this: the embed loads in a fresh, cookie-less
// context instead of being refused. youtube-nocookie for the same reason, since
// the frame gets no cookies either way.
tylerVideos.forEach(vid => {
    const startParam = vid.start ? `&start=${vid.start}` : '';
    adTemplates.push({ title: "VNN Player - " + vid.title, html: `<iframe width="100%" height="160" src="https://www.youtube-nocookie.com/embed/${vid.id}?autoplay=1&mute=0${startParam}" frameborder="0" credentialless allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe><p>Watch this video! ${vid.title}</p>` });
});

// Corg only knows one word. Every line — tips, questions and both answers —
// is "corg", and every one of them is voiced by sfx/corg.wav (see
// playGuggyVoice in audio.js). The `actionYes`/`actionNo` payloads are
// untouched, so the questions still do what they always did; you just can't
// tell which is which any more.
const guggyTips = [
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    { type: 'text', text: "corg", audio: 'corg.wav' },
    {
        type: 'question', text: "corg", yes: "corg", no: "corg", audio: 'corg.wav', audioYes: 'corg.wav', audioNo: 'corg.wav',
        actionYes: () => { removeAllAds(); score -= 500; if (score < 0) score = 0; updateUI(); if(typeof playSound === 'function') playSound('recycle-audio'); },
        actionNo: () => { for(let i=0; i<8; i++) setTimeout(spawnAd, i*200); }
    },
    {
        type: 'question', text: "corg", yes: "corg", no: "corg", audio: 'corg.wav', audioYes: 'corg.wav', audioNo: 'corg.wav',
        actionYes: () => { score -= Math.floor(score * 0.50); if (score < 0) score = 0; updateUI(); }, actionNo: () => { }
    },
    {
        type: 'question', text: "corg", yes: "corg", no: "corg", audio: 'corg.wav', audioYes: 'corg.wav', audioNo: 'corg.wav',
        actionYes: () => { score -= 5000; if (score < 0) score = 0; updateUI(); },
        actionNo: () => { score = Math.floor(score * 0.50); updateUI(); for(let i=0; i<3; i++) setTimeout(spawnAd, i*500); }
    },
    {
        type: 'question', text: "corg", yes: "corg", no: "corg", audio: 'corg.wav', audioYes: 'corg.wav', audioNo: 'corg.wav',
        actionYes: () => { score += Math.floor(score * 0.10); updateUI(); },
        actionNo: () => { score -= Math.floor(score * 0.20); if (score < 0) score = 0; updateUI(); }
    },
    {
        type: 'question', text: "corg", yes: "corg", no: "corg", audio: 'corg.wav', audioYes: 'corg.wav', audioNo: 'corg.wav',
        actionYes: () => { score += Math.floor(score * 0.20); updateUI(); },
        actionNo: () => { for(let i=0; i<15; i++) setTimeout(spawnAd, i*150); }
    },
    {
        type: 'question', text: "corg", yes: "corg", no: "corg", audio: 'corg.wav', audioYes: 'corg.wav', audioNo: 'corg.wav',
        actionYes: () => { }, actionNo: () => { spawnAd(); }
    },
    {
        type: 'question', text: "corg", yes: "corg", no: "corg", audio: 'corg.wav', audioYes: 'corg.wav', audioNo: 'corg.wav',
        actionYes: () => { score -= 100; if (score < 0) score = 0; updateUI(); },
        actionNo: () => { for(let i=0; i<4; i++) setTimeout(spawnAd, i*250); }
    },
    {
        type: 'question', text: "corg", yes: "corg", no: "corg", audio: 'corg.wav', audioYes: 'corg.wav', audioNo: 'corg.wav',
        actionYes: () => { score -= 250; if (score < 0) score = 0; updateUI(); },
        actionNo: () => { for(let i=0; i<10; i++) setTimeout(spawnAd, i*100); }
    }
];
