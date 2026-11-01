// Baut aus Gameplay-Aufnahmen fertige Hochkant-Clips mit Musik, Texten und Captions und stellt sie
// in die Warteschlange (posts.json).
//   node scripts/make-clips.js ingest <aufnahme.mp4>   Einstellungen herauslösen (Film-Modus /film clips)
//   node scripts/make-clips.js build [--count=N]       neue Clips aus dem Material bauen
//   node scripts/make-clips.js auto <aufnahme.mp4>     beides + hochladen (macht Aufnahme.cmd)
import fs from "node:fs";
import path from "node:path";
import { captions, chooseHook } from "../content/texts.js";
import { RECIPES, SHOT_TAGS } from "../content/recipes.js";
import { pullMain } from "../lib/git.js";
import * as queue from "../lib/queue.js";
import { log, p, readJson, writeJson } from "../lib/util.js";
import { blackSegments, compose, extractShot, shotsBetweenBlack } from "../lib/video.js";
import { track } from "./music.js";

const MATERIAL = p("local", "material");
const MEDIA = p("local", "media");

function rng(seed) {
  let s = 0;
  for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

// ---------- Material ----------
export function ingest(file) {
  const base = path.basename(file);
  const legacy = readJson(p("content", "legacy.json"))[base];
  const name = legacy ? path.parse(base).name : `rec-${stamp()}`;
  const dir = path.join(MATERIAL, name);
  if (fs.existsSync(path.join(dir, "shots.json"))) {
    log(`Material ${name} gibt es schon.`);
    return name;
  }
  fs.mkdirSync(dir, { recursive: true });

  let ranges;
  if (legacy) {
    ranges = legacy;
  } else {
    // Film-Modus: Anfang und Ende sind lange Schwarzphasen, dazwischen kurze Trenner
    const blacks = blackSegments(file);
    const long = blacks.filter((b) => b.end - b.start >= 1.1);
    if (long.length < 2) throw new Error("Kein Film in der Aufnahme gefunden (keine Schwarzphasen am Anfang/Ende). Lief /film clips?");
    // der längste helle Bereich zwischen zwei langen Schwarzphasen ist der Film
    let best = null;
    for (let i = 0; i < long.length - 1; i++) {
      const span = long[i + 1].start - long[i].end;
      if (!best || span > best.end - best.start) best = { start: long[i].end, end: long[i + 1].start };
    }
    const shots = shotsBetweenBlack(file, 0.5).filter((s) => s.start >= best.start - 0.05 && s.end <= best.end + 0.05);
    const tagged = shots.length === SHOT_TAGS.length;
    if (!tagged) log(`Hinweis: ${shots.length} Einstellungen gefunden, erwartet ${SHOT_TAGS.length} – Zuordnung unsicher.`);
    ranges = shots.map((s, i) => ({ ...s, tag: tagged ? SHOT_TAGS[i] : "any" }));
  }

  const shots = ranges.map((r, i) => {
    const out = path.join(dir, `${String(i + 1).padStart(2, "0")}-${r.tag}.mp4`);
    const { duration: d } = extractShot(file, r.start, r.end, out);
    return { file: path.relative(dir, out), tag: r.tag, duration: d };
  });
  writeJson(path.join(dir, "shots.json"), { name, source: file, createdAt: new Date().toISOString(), shots, used: {} });
  log(`Material ${name}: ${shots.length} Einstellungen.`);
  return name;
}

function materials() {
  if (!fs.existsSync(MATERIAL)) return [];
  return fs
    .readdirSync(MATERIAL)
    .filter((d) => fs.existsSync(path.join(MATERIAL, d, "shots.json")))
    .map((d) => ({ dir: path.join(MATERIAL, d), ...readJson(path.join(MATERIAL, d, "shots.json")) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // neueste zuerst
}

// ---------- Schnittplan ----------
function plan(material, recipeName, random) {
  const recipe = RECIPES[recipeName];
  const musicName = recipe.music[Math.floor(random() * recipe.music.length)];
  const music = track(musicName);
  const beat = music.beat;
  const segments = [];
  const usedShots = new Set();

  for (const step of recipe.steps) {
    let candidates = [];
    for (const tag of step.tags) {
      candidates = material.shots.filter((s) => s.tag === tag);
      if (candidates.length) break;
    }
    if (!candidates.length) continue;
    let shot = step.pick !== undefined ? candidates[step.pick] : candidates[Math.floor(random() * candidates.length)];
    if (!shot) continue;
    // dieselbe Einstellung nicht zweimal hintereinander verwenden
    if (usedShots.has(shot.file)) continue;
    usedShots.add(shot.file);

    let dur = step.beats * beat;
    let speed = step.speed || 1;
    const avail = shot.duration;
    if (step.part === "all") speed = avail / dur;
    speed = Math.min(2.6, Math.max(0.75, speed));
    const EPS = 1e-6;
    if (dur * speed > avail + EPS) {
      speed = Math.max(0.75, avail / dur);
      if (dur * speed > avail + EPS) {
        // Einstellung zu kurz: weniger Beats (nie mehr als im Rezept)
        const beats = Math.min(step.beats - 1, Math.floor(avail / 0.75 / beat));
        if (beats < 2) continue;
        dur = beats * beat;
        speed = Math.min(speed, avail / dur);
      }
    }
    const srcDur = Math.min(avail, dur * speed);
    const slack = avail - srcDur;
    const from =
      step.part === "start" ? 0 : step.part === "end" ? slack : step.part === "mid" ? slack / 2 : slack * random();
    segments.push({ file: path.join(material.dir, shot.file), from, srcDur, dur, punch: !!step.punch, label: step.label });
  }
  if (segments.length < 2) return null;
  const total = segments.reduce((a, s) => a + s.dur, 0);
  if (total < 6) return null;
  return { segments, music: music.file, musicName };
}

// ---------- Clips bauen ----------
export function build({ count = 99, only } = {}) {
  const { config, posts } = queue.load();
  const usedHooks = posts.slice(-20).map((x) => x.hook);
  const made = [];
  fs.mkdirSync(MEDIA, { recursive: true });

  for (const material of materials()) {
    if (only && material.name !== only) continue;
    for (const recipeName of Object.keys(RECIPES)) {
      if (made.length >= count) break;
      if (material.used[recipeName]) continue;
      const id = `kf-${stamp()}-${recipeName}`;
      const random = rng(id);
      const cut = plan(material, recipeName, random);
      if (!cut) {
        material.used[recipeName] = "nicht genug Material";
        continue;
      }
      const hook = chooseHook(recipeName, usedHooks, random);
      usedHooks.push(hook);
      const file = `${id}.mp4`;
      log(`Baue ${file} (${material.name}, ${cut.musicName}) …`);
      const { duration: d } = compose(
        {
          segments: cut.segments,
          hook,
          music: cut.music,
          endCard: { title: config.game.name.toUpperCase(), sub: "PLAY NOW ON ROBLOX" },
        },
        path.join(MEDIA, file),
        p("local", "work", id),
      );
      fs.rmSync(p("local", "work", id), { recursive: true, force: true });
      const texts = captions(recipeName, hook, config.game, random);
      const post = {
        id,
        file,
        recipe: recipeName,
        source: material.name,
        music: cut.musicName,
        hook,
        durationSec: Math.round(d * 10) / 10,
        coverMs: 1000,
        createdAt: new Date().toISOString(),
        ...texts,
      };
      posts.push(post);
      made.push(post);
      material.used[recipeName] = id;
      const { dir, ...rest } = material;
      writeJson(path.join(dir, "shots.json"), rest);
      queue.savePosts(posts); // nach jedem Clip speichern
    }
  }
  log(`${made.length} neue(r) Clip(s). In der Warteschlange: ${posts.filter((x) => !x.removed).length}.`);
  return made;
}

// ---------- Aufruf ----------
if (process.argv[1]?.endsWith("make-clips.js")) {
  const [cmd, arg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const count = Number(process.argv.find((a) => a.startsWith("--count="))?.split("=")[1]) || undefined;
  if (cmd === "ingest") ingest(arg);
  else if (cmd === "build") build({ count });
  else if (cmd === "auto") {
    pullMain(); // erst den Stand von GitHub holen, damit posts.json nicht kollidiert
    const name = ingest(arg);
    const made = build({ only: name, count });
    if (made.length && !process.argv.includes("--no-publish")) {
      const { publish } = await import("./publish.js");
      await publish();
    }
  } else {
    console.log("Aufruf: node scripts/make-clips.js ingest|build|auto [datei] [--count=N]");
  }
}

