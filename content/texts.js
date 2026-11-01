// Texte für die Clips: Hook im Video (oben eingeblendet), Captions, Titel, Hashtags.
// Englisch, weil das Spiel englisch ist und Roblox-Spieler aus aller Welt kommen.
// Pro Clip wird zufällig kombiniert; bereits benutzte Hooks kommen erst wieder, wenn alle durch sind.

export const HOOKS = {
  montage: [
    "POV: YOU OPENED A KEBAB EMPIRE",
    "THIS ROBLOX GAME IS TOO SATISFYING",
    "FROM 1 KEBAB TO A KEBAB EMPIRE",
    "WHEN THE KEBAB BUSINESS GOES CRAZY",
    "I CAN'T STOP PLAYING THIS",
  ],
  evolution: [
    "EVERY KEBAB MAN LEVEL 1 → 12",
    "WHICH LEVEL IS YOUR FAVORITE?",
    "THE KEBAB MAN EVOLUTION",
    "LEVEL 1 VS LEVEL 12 KEBAB MAN",
  ],
  merge: [
    "3 KEBAB MEN = 1 BETTER KEBAB MAN",
    "MERGING UNTIL LEVEL 12",
    "THE MERGE CHAIN NEVER STOPS",
    "BUY ×10 AND WATCH THIS",
  ],
  satisfying: [
    "THE MOST SATISFYING ROBLOX GAME",
    "THIS IS WEIRDLY SATISFYING",
    "ASMR BUT IT'S KEBABS",
    "COLLECT. DELIVER. GET RICH.",
  ],
  cash: [
    "FROM 0 TO MILLIONS SELLING KEBABS",
    "SELLING KEBABS MADE ME RICH",
    "HOW TO GET RICH IN KEBAB FARM",
    "THE KEBAB MONEY PRINTER",
  ],
  aerial: [
    "THE BIGGEST KEBAB FOOD COURT ON ROBLOX",
    "WELCOME TO KEBAB FARM",
    "BUILD YOUR KEBAB EMPIRE AT NIGHT",
  ],
  lineup: [
    "RATE THESE KEBAB MEN 1–10",
    "WHICH KEBAB MAN WOULD YOU PICK?",
    "THE RAREST KEBAB MAN IS AT THE END",
    "WAIT FOR LEVEL 12…",
  ],
  speedrun: [
    "KEBAB FARM SPEEDRUN",
    "0 TO LEVEL 12 IN 10 SECONDS",
    "HOW FAST CAN YOU GET RICH?",
    "THE FASTEST KEBAB EMPIRE EVER",
  ],
  grind: [
    "JUST ONE MORE ROUND…",
    "WHEN THE KEBAB GRIND HITS",
    "POV: YOU RUN A KEBAB SHOP",
    "COLLECT. SELL. REPEAT.",
  ],
};

const LINES = {
  montage: [
    "Build your own kebab empire 🥙🔥",
    "Kebab Men drop kebabs, you get rich 💸",
    "This is what a kebab empire looks like 🥙👑",
  ],
  evolution: [
    "Level 1 to Level 12 – which Kebab Man do you have? 🥙",
    "Every level looks different 👀 How far did you get?",
    "The Kebab Man glow-up is real ✨",
  ],
  merge: [
    "Merge 3 identical Kebab Men into a stronger one ✨",
    "One ×10 purchase, a whole merge chain 🤯",
    "Merge, merge, merge… Level 12 unlocked 🔓",
  ],
  satisfying: [
    "Kebabs everywhere 🥙🥙🥙",
    "Collecting kebabs never gets old 😌",
    "The most satisfying part of the day 🥙",
  ],
  cash: [
    "Deliver kebabs, collect the cash, buy more Kebab Men 💰",
    "Kebab business is booming 📈",
    "Cash goes brrr 💸🥙",
  ],
  lineup: [
    "Every Kebab Man looks different – which one is your favorite? 🥙",
    "From Level 1 to Level 12 👀",
    "The lineup gets better every level ✨",
  ],
  speedrun: [
    "Collect, sell, buy, merge – in seconds ⚡",
    "Kebab empire speedrun 🥙⚡",
    "Blink and you miss the merge 👀",
  ],
  grind: [
    "The daily kebab grind 🥙😌",
    "Collect the kebabs, sell them, get rich 💸",
    "Running a kebab shop on Roblox hits different 🥙",
  ],
  aerial: [
    "A glowing night-time food court full of kebab shops 🌃🥙",
    "Your plot, your kebab shop, your empire 🏙️",
    "Kebab Farm at night hits different 🌙",
  ],
};

const QUESTIONS = [
  "What level is your best Kebab Man?",
  "Would you play this? 👇",
  "Rate this kebab empire 1–10 👇",
  "Tag a friend who loves kebab 🥙",
  "Who's building the biggest kebab empire? 👀",
];

const CORE_TAGS = ["#roblox", "#kebabfarm", "#robloxgames"];
const EXTRA_TAGS = [
  "#kebab",
  "#doner",
  "#döner",
  "#tycoon",
  "#robloxtycoon",
  "#idlegame",
  "#mergegame",
  "#gaming",
  "#robloxedit",
  "#satisfying",
  "#foodgame",
];

function pick(arr, random) {
  return arr[Math.floor(random() * arr.length)];
}

function shuffle(arr, random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Hook wählen, der für dieses Rezept am längsten nicht dran war
export function chooseHook(recipe, usedHooks, random) {
  const pool = HOOKS[recipe] || HOOKS.montage;
  const fresh = pool.filter((h) => !usedHooks.includes(h));
  return pick(fresh.length ? fresh : pool, random);
}

export function captions(recipe, hook, game, random) {
  const line = pick(LINES[recipe] || LINES.montage, random);
  const question = pick(QUESTIONS, random);
  const extra = shuffle(EXTRA_TAGS, random);
  const play = `🎮 Play ${game.name} on Roblox – search "${game.name}"`;

  const igTags = [...CORE_TAGS, ...extra.slice(0, 7)].join(" ");
  const ttTags = [...CORE_TAGS, ...extra.slice(0, 2)].join(" ");
  const titleBase = hook.charAt(0) + hook.slice(1).toLowerCase();

  return {
    captions: {
      instagram: `${line}\n\n${question}\n\n${play} (link in bio)\n\n${igTags}`,
      tiktok: `${line} ${question}\n${play}\n${ttTags}`,
    },
    youtube: {
      title: `${titleBase} 🥙 #Shorts #roblox`.slice(0, 100),
      description: `${line}\n\n${question}\n\n🎮 Play ${game.name} on Roblox: ${game.url}\n\n#Shorts ${[...CORE_TAGS, ...extra.slice(0, 4)].join(" ")}`,
      tags: ["roblox", "kebab farm", "roblox games", "kebab", "doner", "tycoon", "merge game", "idle game", "shorts"],
    },
  };
}
