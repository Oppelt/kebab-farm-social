// Zugangsdaten (App-Schlüssel + Tokens aller Plattformen) liegen verschlüsselt in state/tokens.enc.
// Der Schlüssel (TOKEN_KEY, 32 Byte Base64) liegt nur lokal in local/.env und als GitHub-Secret.
// So kann der GitHub-Workflow erneuerte Tokens zurückschreiben, ohne dass etwas im Klartext im Repo liegt.
import crypto from "node:crypto";
import fs from "node:fs";
import { p } from "./util.js";

export const TOKENS_FILE = p("state", "tokens.enc");
const ENV_FILE = p("local", ".env");

export function newKey() {
  return crypto.randomBytes(32).toString("base64");
}

export function getKey() {
  let key = process.env.TOKEN_KEY;
  if (!key && fs.existsSync(ENV_FILE)) {
    const m = fs.readFileSync(ENV_FILE, "utf8").match(/^TOKEN_KEY=(.+)$/m);
    if (m) key = m[1].trim();
  }
  if (!key) return null;
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) throw new Error("TOKEN_KEY ist ungültig (muss 32 Byte Base64 sein)");
  return buf;
}

export function saveKeyLocally(keyB64) {
  fs.mkdirSync(p("local"), { recursive: true });
  fs.writeFileSync(ENV_FILE, `TOKEN_KEY=${keyB64}\n`);
}

export function encrypt(obj, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  return JSON.stringify(
    { v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") },
    null,
    2,
  );
}

export function decrypt(text, key) {
  const box = JSON.parse(text);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(box.data, "base64")), decipher.final()]);
  return JSON.parse(plain.toString("utf8"));
}

export function loadTokens(key = getKey()) {
  if (!key) throw new Error("TOKEN_KEY fehlt (GitHub-Secret bzw. local/.env)");
  if (!fs.existsSync(TOKENS_FILE)) return {};
  return decrypt(fs.readFileSync(TOKENS_FILE, "utf8"), key);
}

export function saveTokens(tokens, key = getKey()) {
  fs.writeFileSync(TOKENS_FILE, encrypt(tokens, key) + "\n");
}
