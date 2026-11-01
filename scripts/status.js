// Überblick: Was ist gepostet, was kommt als Nächstes, wie viele Clips sind noch da?
import fs from "node:fs";
import * as queue from "../lib/queue.js";

const { config, posts, posted } = queue.load();
const line = (s = "") => console.log(s);

line("KEBAB FARM – POSTING-STATUS");
line("═".repeat(44));
for (const pl of queue.PLATFORMS) {
  const c = config.platforms[pl];
  const on = c.enabled ? "AN " : "aus";
  const extra = pl === "tiktok" ? ` (Modus ${c.mode})` : "";
  const left = queue.remaining(posts, posted, pl);
  const done = Object.keys(posted[pl]).length;
  line(`${pl.padEnd(10)} ${on}${extra.padEnd(16)} gepostet: ${String(done).padStart(3)}   offen: ${left}`);
}
line();
line("Täglich um 17:00 (Winterzeit) bzw. 18:00 (Sommerzeit) kommt der nächste Clip.");
line();
line("Nächste Clips:");
const on = queue.enabledPlatforms(config);
const next = posts.filter((x) => !x.removed && (!on.length || on.some((pl) => !posted[pl][x.id])));
for (const x of next.slice(0, 8)) line(`  • ${x.id}  ${x.durationSec}s  „${x.hook}“`);
if (!next.length) line("  (keine – neue Aufnahme machen: Aufnahme.cmd)");

if (fs.existsSync(queue.files.history)) {
  const hist = fs.readFileSync(queue.files.history, "utf8").trim().split("\n").filter(Boolean).slice(-6);
  if (hist.length) {
    line();
    line("Zuletzt gepostet:");
    for (const h of hist.map((l) => JSON.parse(l))) line(`  ${h.at.slice(0, 16).replace("T", " ")}  ${h.platform.padEnd(9)} ${h.url || h.id || ""}`);
  }
}
if (config.repo) {
  line();
  line(`Läufe & Fehler: https://github.com/${config.repo}/actions`);
}
