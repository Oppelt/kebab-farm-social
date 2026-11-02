// Nimmt den Bildschirm auf (nur den mittleren Hochkant-Streifen, wie ihn der Film-Modus filmt),
// bis Enter gedrückt wird oder die Zeit um ist, und baut danach automatisch die Clips.
// Start: Doppelklick auf Aufnahme.cmd → zu Roblox wechseln → im Chat /film clips
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { p } from "../lib/util.js";

// "/film clips 3" dauert gut 2 Minuten (3 Durchgänge à ca. 46 s) – Puffer fürs Hin- und Herwechseln
const MAX_SECONDS = Number(process.argv[2]) || 330;
const dir = p("local", "recordings");
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const parts = [];
let stopped = false;
let current = null;

console.log(`
  ┌──────────────────────────────────────────────────────────┐
  │  AUFNAHME LÄUFT (höchstens ${String(MAX_SECONDS).padEnd(3)} Sekunden)                   │
  │                                                          │
  │  1. Zu Roblox wechseln (Kebab Farm, am besten Vollbild)  │
  │  2. Im Chat eintippen:  /film clips 3                    │
  │  3. Warten, bis alle 3 Filme vorbei sind (gut 2 Min.)    │
  │  4. Hierher zurück und Enter drücken                     │
  └──────────────────────────────────────────────────────────┘
`);

const rl = createInterface({ input: process.stdin });
rl.on("line", () => {
  stopped = true;
  current?.stdin.write("q");
});

const end = Date.now() + MAX_SECONDS * 1000;
const timer = setInterval(() => {
  if (Date.now() >= end) {
    stopped = true;
    current?.stdin.write("q");
  }
}, 500);

// ddagrab bricht ab, wenn Roblox in den Vollbildmodus wechselt → dann einfach neue Datei anfangen
while (!stopped && Date.now() < end) {
  const out = path.join(dir, `rec-${stamp}-${parts.length + 1}.mp4`);
  const left = Math.max(1, Math.round((end - Date.now()) / 1000));
  await new Promise((resolve) => {
    current = spawn(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "ddagrab=framerate=30:draw_mouse=0",
        "-t", String(left),
        "-vf", "hwdownload,format=bgra,crop=trunc(ih*9/16/2)*2:ih:(iw-ow)/2:0,scale=1080:1920:flags=bicubic:out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
        out,
      ],
      { stdio: ["pipe", "inherit", "inherit"] },
    );
    current.on("exit", resolve);
  });
  current = null;
  if (fs.existsSync(out) && fs.statSync(out).size > 50000) parts.push(out);
  if (!stopped) await new Promise((r) => setTimeout(r, 700));
}
clearInterval(timer);
rl.close();

if (!parts.length) {
  console.log("Keine Aufnahme entstanden.");
  process.exit(1);
}
let final = parts[0];
if (parts.length > 1) {
  final = path.join(dir, `rec-${stamp}.mp4`);
  const list = path.join(dir, `rec-${stamp}.txt`);
  fs.writeFileSync(list, parts.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", final]);
  for (const f of [...parts, list]) fs.rmSync(f);
}
console.log(`\n✓ Aufnahme gespeichert: ${final}\n\nBaue jetzt die Clips (dauert ein paar Minuten) …\n`);

const r = spawnSync(process.execPath, [p("scripts", "make-clips.js"), "auto", final], { stdio: "inherit" });
process.exit(r.status ?? 1);
