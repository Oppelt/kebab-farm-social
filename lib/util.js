// Kleine Helfer: JSON-Dateien, Pfade, HTTP mit lesbaren Fehlern.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const p = (...parts) => path.join(ROOT, ...parts);

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (fallback !== undefined && err.code === "ENOENT") return fallback;
    throw err;
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function log(...args) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
}

// fetch, das bei HTTP-Fehlern mit Status + Antworttext abbricht und JSON zurückgibt
export async function fetchJson(url, options = {}, what = "Anfrage") {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`${what} fehlgeschlagen (HTTP ${res.status}): ${text.slice(0, 600)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return { body, res };
}

export function form(obj) {
  return new URLSearchParams(Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)));
}

// Lädt ein Video (lokale Datei oder öffentliche URL) als Buffer
export async function loadVideo(post, config) {
  const local = p("local", "media", post.file);
  if (fs.existsSync(local)) return fs.readFileSync(local);
  const url = mediaUrl(post, config);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Video nicht abrufbar (${res.status}): ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export function mediaUrl(post, config) {
  if (!config.mediaBaseUrl) throw new Error("config.json: mediaBaseUrl fehlt (wird bei npm run setup gesetzt)");
  return `${config.mediaBaseUrl.replace(/\/$/, "")}/media/${post.file}`;
}
