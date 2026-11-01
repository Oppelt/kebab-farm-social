// Schnitt-Rezepte: welche Einstellungen in welcher Reihenfolge, wie lang (in Beats der Musik) und wie
// schnell. `tags` = welche Einstellungen passen (die erste vorhandene gewinnt). Gibt es keine, fällt
// der Schritt weg. Einstellungen aus der Aufnahme (/film clips), Reihenfolge siehe SHOT_TAGS.
//   speed  Wiedergabegeschwindigkeit (1.5 = schneller)
//   part   welcher Teil der Einstellung: start | mid | end | all (ganze Einstellung, Tempo passt sich an)
//   punch  kurzer Zoom-Stoß beim Schnitt
//   label  kurzer Text in der Bildmitte (z. B. beim neuen Level)

// Reihenfolge der Einstellungen im Film-Modus "/film clips" (Film.client.lua → clipsFilm)
export const SHOT_TAGS = [
  "drops",
  "collect",
  "deliver",
  "cash",
  "aerial",
  "buy",
  "merge",
  "row",
  "close",
  "close",
  "close",
  "collect2",
  "outro",
];

export const RECIPES = {
  montage: {
    music: ["hijaz_trap", "doner_phonk"],
    steps: [
      { tags: ["drops", "aerial"], beats: 4, speed: 1.4, part: "end" },
      { tags: ["collect"], beats: 4, speed: 1.2 },
      { tags: ["deliver"], beats: 4, speed: 1.3, part: "end", punch: true },
      { tags: ["cash"], beats: 4, speed: 1.2, punch: true },
      { tags: ["buy", "walk"], beats: 4, speed: 1.6, part: "end" },
      { tags: ["merge"], beats: 8, speed: 1, punch: true, label: "NEW LEVEL!" },
      { tags: ["row"], beats: 8, speed: 1.7, part: "all" },
      { tags: ["outro"], beats: 4, speed: 1 },
    ],
  },
  evolution: {
    music: ["grill_house"],
    steps: [
      { tags: ["row"], beats: 16, part: "all" },
      { tags: ["close"], beats: 4, speed: 1, punch: true, pick: 0 },
      { tags: ["close"], beats: 4, speed: 1, punch: true, pick: 1 },
      { tags: ["merge"], beats: 8, speed: 1, punch: true, label: "LEVEL UP!" },
      { tags: ["outro"], beats: 4, speed: 1 },
    ],
  },
  merge: {
    music: ["doner_phonk"],
    steps: [
      { tags: ["buy", "walk"], beats: 6, speed: 1.4, part: "end" },
      { tags: ["merge"], beats: 10, speed: 0.9, punch: true, label: "MERGE!" },
      { tags: ["close", "row"], beats: 8, speed: 1.8, punch: true },
      { tags: ["outro"], beats: 6, speed: 1 },
    ],
  },
  satisfying: {
    music: ["chill_kebab"],
    steps: [
      { tags: ["drops"], beats: 4, speed: 1 },
      { tags: ["collect"], beats: 4, speed: 1, part: "start" },
      { tags: ["collect2"], beats: 4, speed: 1 },
      { tags: ["deliver"], beats: 4, speed: 1, part: "end" },
      { tags: ["cash"], beats: 3, speed: 1 },
      { tags: ["aerial"], beats: 5, speed: 1, part: "mid" },
      { tags: ["outro"], beats: 3, speed: 1 },
    ],
  },
  cash: {
    music: ["hijaz_trap"],
    steps: [
      { tags: ["deliver"], beats: 4, speed: 1.2, part: "end", punch: true },
      { tags: ["cash"], beats: 6, speed: 1, punch: true, label: "CASH!" },
      { tags: ["buy", "walk"], beats: 4, speed: 1.6, part: "end" },
      { tags: ["merge"], beats: 6, speed: 1, punch: true },
      { tags: ["row"], beats: 6, speed: 2.2, part: "all" },
      { tags: ["outro"], beats: 4, speed: 1 },
    ],
  },
  aerial: {
    music: ["grill_house", "hijaz_trap"],
    steps: [
      { tags: ["aerial"], beats: 10, part: "all" },
      { tags: ["row"], beats: 8, speed: 1.8, part: "all" },
      { tags: ["outro"], beats: 6, speed: 1 },
    ],
  },
};
