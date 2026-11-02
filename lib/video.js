// ffmpeg-Bausteine: Einstellungen aus Aufnahmen herauslösen und daraus Hochkant-Clips bauen.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const W = 1080;
const H = 1920;
const FPS = 30;

export function ffmpeg(args, cwd) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`ffmpeg fehlgeschlagen: ${r.stderr || r.error}`);
  return r;
}

export function duration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], {
    encoding: "utf8",
  });
  return parseFloat(r.stdout);
}

export function dimensions(file) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  const [w, h] = r.stdout.trim().split(",").map(Number);
  return { w, h };
}

// Farben: Alles wird als BT.709 (HD-Standard) gespeichert und so gekennzeichnet – so zeigen Handys,
// Instagram und TikTok exakt die Farben aus dem Spiel. Ältere Aufnahmen (bis 02.11.2026) wurden mit
// der BT.601-Formel umgerechnet und nicht gekennzeichnet → Handys zeigten sie röter/orangestichig.
export const COLOR_TAGS = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

export function colorSpace(file) {
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_space", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return r.stdout.trim();
}

// Filter, der eine ungekennzeichnete (BT.601-)Datei in BT.709 umrechnet; null, wenn schon BT.709
export function toBt709(file) {
  if (colorSpace(file) === "bt709") return null;
  return "colorspace=all=bt709:ispace=bt470bg:itrc=bt709:iprimaries=bt709:irange=tv:range=tv:format=yuv420p";
}

// Schwarze Abschnitte finden (Film-Modus blendet zwischen den Einstellungen kurz auf Schwarz)
export function blackSegments(file, minDur = 0.15) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", file, "-vf", `blackdetect=d=${minDur}:pix_th=0.12:pic_th=0.97`, "-an", "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const out = [];
  for (const m of r.stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)) {
    out.push({ start: parseFloat(m[1]), end: parseFloat(m[2]) });
  }
  return out;
}

// Die hellen Stücke zwischen den schwarzen = die Einstellungen
export function shotsBetweenBlack(file, minShot = 0.6) {
  const total = duration(file);
  const blacks = blackSegments(file);
  const shots = [];
  let cursor = 0;
  for (const b of blacks) {
    if (b.start - cursor >= minShot) shots.push({ start: cursor, end: b.start });
    cursor = b.end;
  }
  if (total - cursor >= minShot) shots.push({ start: cursor, end: total });
  return shots;
}

// Eine Einstellung als 1080×1920-Datei speichern. Querformat wird mittig auf 9:16 zugeschnitten.
export function extractShot(src, start, end, out) {
  const { w, h } = dimensions(src);
  const landscape = w / h > 9 / 16 + 0.01;
  // 2 Bilder Abstand zum Schwarz, damit keine Überblendung mitkommt
  const a = start + 2 / FPS;
  const d = Math.max(0.2, end - start - 4 / FPS);
  const vf = [
    toBt709(src),
    "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
    landscape ? "crop=trunc(ih*9/16/2)*2:ih:(iw-ow)/2:0" : null,
    `scale=${W}:${H}:flags=lanczos`,
    landscape ? "unsharp=5:5:0.6" : null,
    `fps=${FPS}`,
    "setsar=1",
  ]
    .filter(Boolean)
    .join(",");
  ffmpeg(["-ss", a.toFixed(3), "-i", src, "-t", d.toFixed(3), "-vf", vf, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-pix_fmt", "yuv420p", ...COLOR_TAGS, out]);
  return { file: out, duration: d };
}

// Text auf gleichmäßig lange Zeilen umbrechen (drawtext kann das nicht selbst)
export function wrap(text, max = 16) {
  const words = text.split(/\s+/);
  const greedy = (limit) => {
    const lines = [];
    let line = "";
    for (const word of words) {
      if (line && (line + " " + word).length > limit) {
        lines.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push(line);
    return lines;
  };
  const n = greedy(max).length;
  // kleinste Zeilenbreite, die noch dieselbe Zeilenzahl ergibt → keine einzelnen Wörter in der letzten Zeile
  let best = greedy(max);
  for (let limit = max - 1; limit >= 6; limit--) {
    const lines = greedy(limit);
    if (lines.length > n) break;
    best = lines;
  }
  return best.join("\n");
}

// Clip zusammenbauen.
// plan = { segments: [{ file, from, srcDur, dur, punch, label }], hook, music, musicOffset, endCard: {title, sub} }
export function compose(plan, out, workDir) {
  fs.mkdirSync(workDir, { recursive: true });
  fs.copyFileSync(fontPath("seguibl.ttf"), path.join(workDir, "font.ttf"));
  fs.copyFileSync(fontPath("arialbd.ttf"), path.join(workDir, "font2.ttf"));

  const inputs = [];
  const inputIndex = new Map();
  const idx = (file) => {
    if (!inputIndex.has(file)) {
      inputIndex.set(file, inputs.length);
      inputs.push(file);
    }
    return inputIndex.get(file);
  };

  const chains = [];
  let total = 0;
  const labels = [];
  plan.segments.forEach((s, i) => {
    const speed = s.srcDur / s.dur;
    const parts = [
      toBt709(s.file),
      "setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv",
      `trim=start=${s.from.toFixed(3)}:duration=${s.srcDur.toFixed(3)}`,
      `setpts=(PTS-STARTPTS)/${speed.toFixed(4)}`,
      `fps=${FPS}`,
      `trim=duration=${s.dur.toFixed(3)}`,
    ];
    if (s.punch) {
      // Zoom-Stoß: startet 18 % näher und geht in 8 Bildern zurück
      parts.push(
        `zoompan=z='if(lt(on,8),1.18-0.18*on/8,1)':d=1:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':s=${W}x${H}:fps=${FPS}`,
      );
    }
    parts.push("setsar=1");
    chains.push(`[${idx(s.file)}:v]${parts.filter(Boolean).join(",")}[v${i}]`);
    if (s.label) labels.push({ text: s.label, at: total + Math.min(0.4, s.dur / 3), dur: Math.min(1.6, s.dur * 0.7) });
    total += s.dur;
  });
  const n = plan.segments.length;
  chains.push(`${plan.segments.map((_, i) => `[v${i}]`).join("")}concat=n=${n}:v=1:a=0[base]`);

  // Texte als Dateien (kein Escaping-Ärger)
  fs.writeFileSync(path.join(workDir, "hook.txt"), wrap(plan.hook, 15));
  const draws = [];
  const hookEnd = Math.min(3.2, total * 0.3);
  // Hook oben, gelb mit dickem Rand, springt rein
  draws.push(
    `drawtext=fontfile=font.ttf:textfile=hook.txt:text_align=C:x=(w-text_w)/2:y=h*0.2:` +
      `fontsize='96*min(1,0.55+t*5)':fontcolor=0xFFD23F:borderw=11:bordercolor=black:line_spacing=4:` +
      `box=1:boxcolor=black@0.35:boxborderw=28:` +
      `shadowcolor=black@0.6:shadowx=0:shadowy=8:enable='lt(t,${hookEnd.toFixed(2)})'`,
  );
  labels.forEach((l, i) => {
    fs.writeFileSync(path.join(workDir, `label${i}.txt`), l.text);
    const t0 = l.at.toFixed(2);
    draws.push(
      `drawtext=fontfile=font.ttf:textfile=label${i}.txt:x=(w-text_w)/2:y=h*0.42:` +
        `fontsize='150*min(1,0.5+(t-${t0})*6)':fontcolor=white:borderw=12:bordercolor=0xE63946:` +
        `enable='between(t,${t0},${(l.at + l.dur).toFixed(2)})'`,
    );
  });
  // Abspann: abdunkeln + Spielname + "Play on Roblox"
  const endDur = Math.min(2, total * 0.18);
  const e0 = (total - endDur).toFixed(2);
  fs.writeFileSync(path.join(workDir, "end1.txt"), plan.endCard.title);
  fs.writeFileSync(path.join(workDir, "end2.txt"), plan.endCard.sub);
  // Abdunkeln nur über die Helligkeit (drawbox mit Transparenz macht das Bild grau)
  draws.push(`lutyuv=y=val*0.42:enable='gte(t,${e0})'`);
  draws.push(
    `drawtext=fontfile=font.ttf:textfile=end1.txt:x=(w-text_w)/2:y=h*0.36:fontsize='132*min(1,0.5+(t-${e0})*5)':` +
      `fontcolor=0xFFD23F:borderw=12:bordercolor=black:enable='gte(t,${e0})'`,
  );
  draws.push(
    `drawtext=fontfile=font2.ttf:textfile=end2.txt:x=(w-text_w)/2:y=h*0.36+175:fontsize=62:` +
      `fontcolor=white:borderw=6:bordercolor=black:alpha='min(1,max(0,(t-${e0}-0.25)*4))':enable='gte(t,${e0})'`,
  );
  chains.push(`[base]${draws.join(",")},format=yuv420p[v]`);

  const m = inputs.length;
  const fadeStart = Math.max(0, total - 0.8).toFixed(2);
  chains.push(
    `[${m}:a]atrim=start=${(plan.musicOffset || 0).toFixed(3)}:duration=${total.toFixed(3)},asetpts=PTS-STARTPTS,` +
      `afade=t=out:st=${fadeStart}:d=0.8,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`,
  );

  fs.writeFileSync(path.join(workDir, "graph.txt"), chains.join(";\n"));
  const args = [];
  for (const f of inputs) args.push("-i", path.resolve(f));
  args.push("-i", path.resolve(plan.music));
  args.push(
    "-/filter_complex", "graph.txt",
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high",
    "-maxrate", "9M", "-bufsize", "18M", "-r", String(FPS), "-g", String(FPS * 2),
    ...COLOR_TAGS,
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart",
    "-t", total.toFixed(3),
    path.resolve(out),
  );
  ffmpeg(args, workDir);
  return { duration: total };
}

function fontPath(name) {
  const f = path.join(process.env.WINDIR || "C:\\Windows", "Fonts", name);
  if (fs.existsSync(f)) return f;
  throw new Error(`Schrift fehlt: ${f}`);
}
