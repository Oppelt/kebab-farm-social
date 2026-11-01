// Einrichtung, Schritt für Schritt im Terminal:
//   npm run setup               GitHub verbinden (Repo, Schlüssel, erste Videos hochladen)
//   npm run setup -- instagram  Instagram verbinden
//   npm run setup -- youtube    YouTube verbinden
//   npm run setup -- tiktok     TikTok verbinden
//   npm run setup -- check      prüfen, ob alle Verbindungen funktionieren (postet nichts)
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { createInterface } from "node:readline/promises";
import { commitAndPush, git, hasRemote, tryGit } from "../lib/git.js";
import * as queue from "../lib/queue.js";
import { getKey, loadTokens, newKey, saveKeyLocally, saveTokens } from "../lib/secrets.js";
import { fetchJson, form, p, writeJson } from "../lib/util.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (q) => (await rl.question(`\n${q}\n> `)).trim();
const say = (...a) => console.log(...a);
const open = (url) => spawn("rundll32", ["url.dll,FileProtocolHandler", url], { stdio: "ignore", detached: true });
const copy = (text) => spawnSync("clip", { input: text });

const { config } = queue.load();
const saveConfig = () => writeJson(queue.files.config, config);
const redirect = () => `${config.mediaBaseUrl}/callback.html`;

function needGithub() {
  if (!config.mediaBaseUrl || !hasRemote()) {
    say("Zuerst GitHub einrichten: npm run setup");
    process.exit(1);
  }
}

function codeFrom(pasted) {
  try {
    return new URL(pasted).searchParams.get("code")?.replace(/#_$/, "");
  } catch {
    return pasted.replace(/#_$/, "");
  }
}

function store(platform, data, enable) {
  const key = getKey();
  const tokens = loadTokens(key);
  tokens[platform] = { ...tokens[platform], ...data };
  saveTokens(tokens, key);
  if (enable !== undefined) config.platforms[platform].enabled = enable;
  saveConfig();
  commitAndPush(["state/tokens.enc", "config.json"], `${platform} verbunden`);
}

// ---------------- GitHub ----------------
async function github() {
  say("=== GitHub einrichten ===");
  if (!tryGit(["rev-parse", "--git-dir"])) {
    git(["init", "-q", "-b", "main"]);
    say("✓ Git-Repo angelegt");
  }
  let key = getKey();
  if (!key) {
    const k = newKey();
    saveKeyLocally(k);
    key = getKey();
    say("✓ Neuer Schlüssel erzeugt (local/.env – niemals teilen)");
  }
  const keyB64 = key.toString("base64");

  if (!hasRemote()) {
    const url = await ask(
      "Lege auf github.com ein neues, ÖFFENTLICHES, leeres Repo an (z. B. kebab-farm-social) und füge hier seine Adresse ein\n(z. B. https://github.com/DEINNAME/kebab-farm-social):",
    );
    const m = url.match(/github\.com[/:]([^/]+)\/([^/.\s]+)/);
    if (!m) throw new Error("Das ist keine GitHub-Repo-Adresse.");
    const [, owner, repo] = m;
    git(["remote", "add", "origin", `https://github.com/${owner}/${repo}.git`]);
    config.repo = `${owner}/${repo}`;
    config.mediaBaseUrl = `https://${owner.toLowerCase()}.github.io/${repo}`;
    saveConfig();
  }
  say("\nLade alles zu GitHub hoch (beim ersten Mal öffnet sich ein GitHub-Anmeldefenster) …");
  commitAndPush(["."], "Kebab Farm Social eingerichtet");
  const { publish } = await import("./publish.js");
  await publish();

  const repoUrl = `https://github.com/${config.repo}`;
  copy(keyB64);
  say(`
✓ Hochgeladen. Jetzt noch 2 Klicks auf GitHub:

1) Geheimen Schlüssel eintragen – die Seite öffnet sich gleich.
   Name:  TOKEN_KEY
   Wert:  (ist schon in der Zwischenablage → Strg+V)  ${keyB64.slice(0, 6)}…
   → "Add secret"

2) GitHub Pages einschalten – die zweite Seite:
   Source: "Deploy from a branch", Branch: gh-pages, Ordner: / (root) → Save
`);
  await ask("Enter drücken, um die beiden Seiten zu öffnen …");
  open(`${repoUrl}/settings/secrets/actions/new`);
  open(`${repoUrl}/settings/pages`);
  say(`Webseite (nach 1–2 Minuten): ${config.mediaBaseUrl}/`);
}

// ---------------- Instagram ----------------
// Neue Meta-Apps (seit 2026) haben kein "Instagram Login" mehr, sondern "Unified login" über ein
// Business-Portfolio. Am einfachsten: System-User im Business-Portfolio, dem das Instagram-Konto und
// die App zugewiesen sind → Token mit instagram_basic + instagram_content_publish, "läuft nie ab".
async function instagram() {
  say(`=== Instagram verbinden ===
Du brauchst den System-User-Token aus dem Business-Portfolio (Unternehmenseinstellungen →
Systemnutzer → Token generieren, Ablauf "Nie", Berechtigungen instagram_basic +
instagram_content_publish).`);
  const token = (await ask("Token einfügen (Rechtsklick) und Enter:")).replace(/\s+/g, "");
  const v = config.platforms.instagram.apiVersion || "v24.0";
  const g = `https://graph.facebook.com/${v}`;

  // Welches Instagram-Konto darf der Token? → steht in den "granular_scopes" des Tokens
  let igId;
  try {
    const { body } = await fetchJson(`${g}/debug_token?${form({ input_token: token, access_token: token })}`, {}, "Token prüfen");
    const scopes = body.data?.granular_scopes || [];
    igId = scopes.find((s) => s.scope === "instagram_content_publish")?.target_ids?.[0];
    if (!scopes.some((s) => s.scope === "instagram_content_publish")) {
      throw new Error("Dem Token fehlt die Berechtigung instagram_content_publish.");
    }
  } catch (e) {
    say(`Hinweis: ${e.message}`);
  }
  if (!igId) {
    igId = await ask("Instagram-Konto-ID nicht automatisch gefunden. Bitte die ID des Instagram-Kontos einfügen\n(Unternehmenseinstellungen → Konten → Instagram-Konten → kebabfarm.roblox):");
  }
  const { body: me } = await fetchJson(
    `${g}/${igId}?${form({ fields: "username,name", access_token: token })}`,
    {},
    "Instagram-Konto lesen",
  );
  const { body: limit } = await fetchJson(
    `${g}/${igId}/content_publishing_limit?${form({ fields: "quota_usage,config", access_token: token })}`,
    {},
    "Veröffentlichungs-Kontingent lesen",
  );
  store("instagram", { host: "facebook", accessToken: token, neverExpires: true, userId: igId, username: me.username }, true);
  const quota = limit.data?.[0]?.config?.quota_total;
  say(`✓ Instagram verbunden: @${me.username}${quota ? ` (bis zu ${quota} Posts pro Tag erlaubt)` : ""}. Ab jetzt postet der Workflow täglich dort.`);
}

// ---------------- YouTube ----------------
async function youtube() {
  say(`=== YouTube verbinden ===
Voraussetzung: Google-Cloud-Projekt mit "YouTube Data API v3", OAuth-Zustimmungsbildschirm auf
"In Produktion" (sonst läuft die Anmeldung nach 7 Tagen ab) und ein OAuth-Client vom Typ "Desktop-App".`);
  const clientId = await ask("OAuth-Client-ID:");
  const clientSecret = await ask("OAuth-Clientschlüssel (Client Secret):");
  const port = 53682;
  const redirectUri = `http://127.0.0.1:${port}/`;
  const state = crypto.randomBytes(8).toString("hex");
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, redirectUri);
      if (u.searchParams.get("state") !== state) return res.end();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h2 style='font-family:sans-serif'>✓ Fertig – du kannst dieses Fenster schließen.</h2>");
      server.close();
      u.searchParams.get("code") ? resolve(u.searchParams.get("code")) : reject(new Error(u.searchParams.get("error")));
    });
    server.listen(port, "127.0.0.1", () => {
      open(
        "https://accounts.google.com/o/oauth2/v2/auth?" +
          form({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
            access_type: "offline",
            prompt: "consent",
            state,
          }),
      );
      say("Browser geöffnet – mit dem YouTube-Konto von Kebab Farm anmelden und erlauben …");
    });
  });
  const { body } = await fetchJson(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: form({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    },
    "YouTube-Anmeldung",
  );
  if (!body.refresh_token) throw new Error("Google hat kein Refresh-Token geliefert – bitte nochmal versuchen.");
  const audited = /^j/i.test(await ask("Hat Google das YouTube-API-Audit schon bestätigt? (j/n)"));
  store("youtube", { clientId, clientSecret, refreshToken: body.refresh_token }, audited);
  say(
    audited
      ? "✓ YouTube verbunden und eingeschaltet."
      : "✓ YouTube verbunden, bleibt aber AUS bis zum Audit (sonst wären alle Videos privat).\n  Nach dem Audit: npm run setup -- enable youtube",
  );
}

// ---------------- TikTok ----------------
async function tiktok() {
  needGithub();
  say(`=== TikTok verbinden ===
Voraussetzung: App bei developers.tiktok.com mit "Login Kit" + "Content Posting API".
Bei Login Kit diese Redirect-URI eintragen:
  ${redirect()}`);
  const clientKey = await ask("Client Key:");
  const clientSecret = await ask("Client Secret:");
  const state = crypto.randomBytes(8).toString("hex");
  open(
    "https://www.tiktok.com/v2/auth/authorize/?" +
      form({
        client_key: clientKey,
        scope: "user.info.basic,video.upload,video.publish",
        response_type: "code",
        redirect_uri: redirect(),
        state,
      }),
  );
  const code = codeFrom(await ask("Im Browser anmelden und erlauben. Danach den Text von der Seite „Fast geschafft“ hier einfügen:"));
  const { body } = await fetchJson(
    "https://open.tiktokapis.com/v2/oauth/token/",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ client_key: clientKey, client_secret: clientSecret, code: decodeURIComponent(code), grant_type: "authorization_code", redirect_uri: redirect() }),
    },
    "TikTok-Anmeldung",
  );
  if (!body.access_token) throw new Error(`TikTok-Anmeldung: ${JSON.stringify(body)}`);
  store(
    "tiktok",
    {
      clientKey,
      clientSecret,
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: Date.now() + body.expires_in * 1000,
      refreshExpiresAt: Date.now() + body.refresh_expires_in * 1000,
      openId: body.open_id,
    },
    true,
  );
  say(`✓ TikTok verbunden (Modus "${config.platforms.tiktok.mode}").`);
}

// ---------------- Prüfen ----------------
async function check() {
  const tokens = loadTokens();
  const before = JSON.stringify(tokens);
  const row = (name, ok, info) => say(`${ok ? "✓" : "✗"} ${name.padEnd(10)} ${info}`);
  const on = (pl) => (config.platforms[pl].enabled ? "an" : "aus");
  if (tokens.instagram) {
    try {
      const { refresh } = await import("../lib/platforms/instagram.js");
      await refresh(tokens.instagram);
      const t = tokens.instagram;
      const { base } = await import("../lib/platforms/instagram.js");
      const who = t.host === "facebook" ? t.userId : "me";
      const { body } = await fetchJson(`${base(config, t)}/${who}?${form({ fields: "username", access_token: t.accessToken })}`);
      const days = t.neverExpires ? "läuft nie ab" : `Token noch ${Math.round((t.expiresAt - Date.now()) / 864e5)} Tage (wird automatisch erneuert)`;
      row("Instagram", true, `@${body.username}, ${days} – ${on("instagram")}`);
    } catch (e) {
      row("Instagram", false, e.message);
    }
  } else row("Instagram", false, "nicht verbunden");
  if (tokens.youtube) {
    try {
      const { body: t } = await fetchJson("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: form({ client_id: tokens.youtube.clientId, client_secret: tokens.youtube.clientSecret, refresh_token: tokens.youtube.refreshToken, grant_type: "refresh_token" }),
      });
      const { body } = await fetchJson("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: { Authorization: `Bearer ${t.access_token}` },
      });
      row("YouTube", true, `${body.items?.[0]?.snippet?.title || "?"} – ${on("youtube")}`);
    } catch (e) {
      row("YouTube", false, e.message);
    }
  } else row("YouTube", false, "nicht verbunden");
  if (tokens.tiktok) {
    try {
      const { refresh } = await import("../lib/platforms/tiktok.js");
      await refresh(tokens.tiktok);
      const { body } = await fetchJson("https://open.tiktokapis.com/v2/user/info/?fields=display_name", {
        headers: { Authorization: `Bearer ${tokens.tiktok.accessToken}` },
      });
      row("TikTok", true, `${body.data?.user?.display_name || "?"} – ${on("tiktok")}, Modus ${config.platforms.tiktok.mode}`);
    } catch (e) {
      row("TikTok", false, e.message);
    }
  } else row("TikTok", false, "nicht verbunden");
  // Erneuerte Tokens sofort hochladen, sonst arbeitet der Workflow mit veralteten
  if (JSON.stringify(tokens) !== before) {
    saveTokens(tokens);
    commitAndPush(["state/tokens.enc"], "Tokens erneuert");
  }
}

async function enable(platform, value = true) {
  if (!queue.PLATFORMS.includes(platform)) throw new Error(`Unbekannt: ${platform}`);
  config.platforms[platform].enabled = value;
  saveConfig();
  commitAndPush(["config.json"], `${platform} ${value ? "eingeschaltet" : "ausgeschaltet"}`);
  say(`✓ ${platform} ${value ? "eingeschaltet" : "ausgeschaltet"}.`);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (!cmd || cmd === "github") await github();
  else if (cmd === "instagram") await instagram();
  else if (cmd === "youtube") await youtube();
  else if (cmd === "tiktok") await tiktok();
  else if (cmd === "check") await check();
  else if (cmd === "enable") await enable(arg, true);
  else if (cmd === "disable") await enable(arg, false);
  else if (cmd === "tiktok-direct") {
    config.platforms.tiktok.mode = "direct";
    await enable("tiktok", true);
  } else say("Unbekannter Befehl. Möglich: github, instagram, youtube, tiktok, check, enable <plattform>, disable <plattform>, tiktok-direct");
} catch (e) {
  console.error("\n✗ " + e.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
