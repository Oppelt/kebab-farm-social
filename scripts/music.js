// Erzeugt eigene, lizenzfreie Beats für die Clips (komplett hier synthetisiert, keine Samples).
// Ergebnis: local/music/<name>.wav – make-clips.js ruft das bei Bedarf automatisch auf.
//   node scripts/music.js        alle Beats neu erzeugen
import fs from "node:fs";
import { p } from "../lib/util.js";

const SR = 44100;
const TWO_PI = Math.PI * 2;

// Phrygisch-dominant (orientalisch, passt zum Döner) und Moll
const SCALES = {
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

function noteFreq(rootHz, scale, degree, octave = 0) {
  const s = SCALES[scale];
  const n = s.length;
  const o = Math.floor(degree / n);
  const semis = s[((degree % n) + n) % n] + 12 * (o + octave);
  return rootHz * 2 ** (semis / 12);
}

// Zufall mit festem Startwert, damit jeder Beat bei jedem Aufruf gleich klingt
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

class Mix {
  constructor(seconds) {
    this.L = new Float32Array(Math.ceil(seconds * SR));
    this.R = new Float32Array(this.L.length);
  }
  add(start, dur, fn, gain = 1, pan = 0) {
    const i0 = Math.floor(start * SR);
    const n = Math.floor(dur * SR);
    const gl = gain * Math.min(1, 1 - pan);
    const gr = gain * Math.min(1, 1 + pan);
    for (let i = 0; i < n && i0 + i < this.L.length; i++) {
      const v = fn(i / SR);
      this.L[i0 + i] += v * gl;
      this.R[i0 + i] += v * gr;
    }
  }
}

// ---- Instrumente: fn(t) → Sample ----
function kick(punch = 1) {
  let phase = 0;
  return (t) => {
    const f = 42 + 120 * Math.exp(-t * 28 * punch);
    phase += (TWO_PI * f) / SR;
    const click = t < 0.004 ? (1 - t / 0.004) * 0.6 : 0;
    return Math.tanh(1.6 * Math.sin(phase) * Math.exp(-t * 5.5)) + click;
  };
}

function bass808(freq, len, glideFrom) {
  let phase = 0;
  return (t) => {
    const f = glideFrom ? freq + (glideFrom - freq) * Math.exp(-t * 18) : freq;
    phase += (TWO_PI * f) / SR;
    const env = Math.min(1, t / 0.005) * (t < len ? 1 : Math.exp(-(t - len) * 25)) * Math.exp(-t * 1.2);
    return Math.tanh(2.2 * Math.sin(phase)) * env;
  };
}

function noiseHit(random, decay, tone = 0.5) {
  let lp = 0;
  return (t) => {
    const w = random() * 2 - 1;
    lp += (w - lp) * tone;
    return (w - lp) * Math.exp(-t * decay); // Hochpass-Rauschen
  };
}

function clap(random) {
  let bp = 0;
  let lp = 0;
  return (t) => {
    const w = random() * 2 - 1;
    lp += (w - lp) * 0.35;
    bp += (lp - bp) * 0.08;
    const hp = lp - bp;
    // drei schnelle Stöße, dann Ausklang
    const bursts = t < 0.03 ? (Math.floor(t / 0.01) % 2 === 0 ? 1 : 0.4) : Math.exp(-(t - 0.03) * 18);
    return hp * bursts * 2.2;
  };
}

function pluck(freq, bright = 1) {
  return (t) => {
    let v = 0;
    for (let h = 1; h <= 9; h++) {
      v += (Math.sin(TWO_PI * freq * h * t) / h) * Math.exp(-t * (3 + h * 2.2 * bright));
    }
    return v * 0.55 * Math.min(1, t / 0.003);
  };
}

function cowbell(freq) {
  const f2 = freq * 1.48;
  return (t) => {
    let v = 0;
    for (const f of [freq, f2]) {
      for (let h = 1; h <= 5; h += 2) v += Math.sin(TWO_PI * f * h * t) / h;
    }
    return Math.tanh(v * 0.9) * (0.65 * Math.exp(-t * 9) + 0.35 * Math.exp(-t * 3)) * Math.min(1, t / 0.002);
  };
}

function pad(freq) {
  return (t) => {
    let v = 0;
    for (const d of [-0.12, 0, 0.11]) {
      const f = freq * 2 ** (d / 12);
      v += Math.sin(TWO_PI * f * t) + 0.3 * Math.sin(TWO_PI * f * 2 * t);
    }
    return v * 0.18;
  };
}

// Echo (punktierte Achtel) auf eine Spur
function addDelay(mix, src, delaySec, feedback, wet) {
  const d = Math.floor(delaySec * SR);
  for (const ch of ["L", "R"]) {
    const a = src[ch];
    const out = mix[ch];
    const buf = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) {
      buf[i] = a[i] + (i >= d ? buf[i - d] * feedback : 0);
      out[i] += a[i] + (i >= d ? buf[i - d] * wet : 0);
    }
  }
}

// ---- Beats ----
const BEATS = {
  // Trap mit orientalischer Melodie
  hijaz_trap: { bpm: 140, root: 41.2, scale: "hijaz", style: "trap", seed: 7, melody: [7, 8, 7, 5, 4, 5, 4, 1] },
  // Phonk mit Kuhglocke (schnell, hart)
  doner_phonk: { bpm: 150, root: 36.7, scale: "minor", style: "phonk", seed: 11, melody: [0, 0, 3, 0, 5, 4, 3, 2] },
  // House, gute Laune
  grill_house: { bpm: 124, root: 43.65, scale: "minor", style: "house", seed: 23, melody: [4, 2, 0, 2, 4, 4, 6, 4] },
  // Ruhiger für "satisfying"
  chill_kebab: { bpm: 92, root: 49, scale: "hijaz", style: "chill", seed: 5, melody: [4, 5, 7, 5, 4, 2, 1, 0] },
};

function render(name, b, bars = 16) {
  const step = 60 / b.bpm / 4; // Sechzehntel
  const barLen = step * 16;
  const seconds = bars * barLen + 1.5;
  const mix = new Mix(seconds);
  const lead = new Mix(seconds);
  const random = rng(b.seed);
  const prog = [0, 0, 5, 4]; // Akkordstufen pro Takt (Bass-Grundton)

  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * barLen;
    const chord = prog[bar % 4];
    const at = (s) => t0 + s * step;

    if (b.style === "house") {
      for (let s = 0; s < 16; s += 4) mix.add(at(s), 0.5, kick(1.2), 0.9);
      for (let s = 2; s < 16; s += 4) mix.add(at(s), 0.12, noiseHit(random, 35, 0.6), 0.32, 0.25);
      for (const s of [4, 12]) mix.add(at(s), 0.35, clap(random), 0.45, -0.1);
      for (let s = 2; s < 16; s += 4) {
        const f = noteFreq(b.root * 2, b.scale, chord);
        mix.add(at(s), step * 2, bass808(f, step * 1.6), 0.45);
      }
      if (bar % 2 === 1) for (let s = 0; s < 16; s += 8) lead.add(at(s), barLen / 2, pad(noteFreq(b.root * 8, b.scale, chord + 2)), 0.25, 0);
    } else if (b.style === "chill") {
      for (const s of [0, 7, 10]) mix.add(at(s), 0.6, kick(0.7), 0.7);
      for (const s of [4, 12]) mix.add(at(s), 0.4, clap(random), 0.3);
      for (let s = 0; s < 16; s += 2) mix.add(at(s), 0.06, noiseHit(random, 70, 0.5), s % 4 === 2 ? 0.2 : 0.12, 0.3);
      mix.add(t0, barLen, pad(noteFreq(b.root * 4, b.scale, chord + 2)), 0.5);
      mix.add(t0, barLen, bass808(noteFreq(b.root, b.scale, chord), barLen * 0.9), 0.5);
    } else {
      // Trap / Phonk: Halftime, Snare auf Zählzeit 3
      const kicks = b.style === "phonk" ? [0, 3, 6, 10, 11] : [0, 6, 10];
      for (const s of kicks) {
        mix.add(at(s), 0.6, kick(1), 0.85);
        const f = noteFreq(b.root, b.scale, s === 10 && bar % 2 ? chord + 2 : chord);
        mix.add(at(s), step * 4, bass808(f, step * 3.5, s === 0 ? f * 1.5 : 0), 0.6);
      }
      mix.add(at(8), 0.45, clap(random), 0.55);
      if (b.style === "phonk") mix.add(at(4), 0.3, clap(random), 0.25, 0.2);
      // Hi-Hats: Achtel, ab und zu ein Wirbel
      for (let s = 0; s < 16; s += 2) {
        const roll = bar % 4 === 3 && s >= 12;
        if (roll) for (let r = 0; r < 4; r++) mix.add(at(s) + (r * step) / 2, 0.04, noiseHit(random, 90, 0.7), 0.16, 0.3);
        else mix.add(at(s), 0.05, noiseHit(random, 80, 0.7), s % 4 === 0 ? 0.22 : 0.15, 0.3);
      }
    }

    // Melodie: Achtel-Hook (in Takt 1–2 jeder Viererphrase)
    if (b.style !== "house" || bar % 2 === 0) {
      for (let i = 0; i < 8; i++) {
        if (bar % 4 === 3 && i > 3) break; // Luft am Ende der Phrase
        const deg = b.melody[i] + (bar % 4 === 2 ? 2 : 0);
        const octave = b.style === "phonk" ? 3 : 4;
        const f = noteFreq(b.root, b.scale, deg, 0) * 2 ** octave;
        const gen = b.style === "phonk" ? cowbell(f) : pluck(f, b.style === "chill" ? 0.6 : 1);
        lead.add(at(i * 2), step * 3, gen, b.style === "phonk" ? 0.32 : 0.38, i % 2 ? 0.25 : -0.25);
      }
    }
  }

  addDelay(mix, lead, step * 3, 0.35, 0.4);

  // Master: weich begrenzen, Ende ausblenden
  let peak = 0;
  for (let i = 0; i < mix.L.length; i++) peak = Math.max(peak, Math.abs(mix.L[i]), Math.abs(mix.R[i]));
  const g = 1.4 / peak;
  const out = Buffer.alloc(44 + mix.L.length * 4);
  writeHeader(out, mix.L.length);
  for (let i = 0; i < mix.L.length; i++) {
    out.writeInt16LE(Math.round(Math.tanh(mix.L[i] * g) * 0.89 * 32767), 44 + i * 4);
    out.writeInt16LE(Math.round(Math.tanh(mix.R[i] * g) * 0.89 * 32767), 46 + i * 4);
  }
  const file = p("local", "music", `${name}.wav`);
  fs.mkdirSync(p("local", "music"), { recursive: true });
  fs.writeFileSync(file, out);
  return { file, bpm: b.bpm, beat: 60 / b.bpm };
}

function writeHeader(buf, frames) {
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + frames * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(frames * 4, 40);
}

export const TRACKS = Object.fromEntries(Object.entries(BEATS).map(([k, b]) => [k, { bpm: b.bpm }]));

// Liefert den Beat (erzeugt ihn, falls er noch nicht existiert)
export function track(name) {
  const file = p("local", "music", `${name}.wav`);
  const b = BEATS[name];
  if (!fs.existsSync(file)) return render(name, b);
  return { file, bpm: b.bpm, beat: 60 / b.bpm };
}

if (process.argv[1]?.endsWith("music.js")) {
  for (const [name, b] of Object.entries(BEATS)) {
    const r = render(name, b);
    console.log("✓", name, `${b.bpm} bpm →`, r.file);
  }
}
