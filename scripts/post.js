// Postet den nächsten Clip auf jeder eingeschalteten Plattform. Läuft täglich im GitHub-Workflow.
//   node scripts/post.js              echt posten
//   node scripts/post.js --dry-run    nur anzeigen, was gepostet würde
//   node scripts/post.js --only=instagram
import fs from "node:fs";
import * as instagram from "../lib/platforms/instagram.js";
import * as tiktok from "../lib/platforms/tiktok.js";
import * as youtube from "../lib/platforms/youtube.js";
import * as queue from "../lib/queue.js";
import { getKey, loadTokens, saveTokens } from "../lib/secrets.js";
import { log } from "../lib/util.js";

const posters = { instagram, youtube, tiktok };
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];

const { config, posts, posted } = queue.load();
const key = getKey();
const tokens = key ? loadTokens(key) : {};
if (!key && !dryRun) {
  console.error("TOKEN_KEY fehlt – ohne Schlüssel kann nicht gepostet werden.");
  process.exit(1);
}

let platforms = queue.enabledPlatforms(config);
if (only) platforms = platforms.filter((pl) => pl === only);
if (!platforms.length) log("Keine Plattform eingeschaltet (config.json → platforms.*.enabled).");

const errors = [];
const tokensBefore = JSON.stringify(tokens);
for (const platform of platforms) {
  const post = queue.nextPost(posts, posted, platform);
  if (!post) {
    errors.push(`${platform}: Warteschlange leer – keine Clips mehr. Neue Aufnahme machen (Aufnahme.cmd).`);
    continue;
  }
  log(`${platform}: poste ${post.id} (${post.recipe})`);
  try {
    const result = await posters[platform].publish(post, { config, tokens, dryRun });
    if (dryRun) continue;
    posted[platform][post.id] = { at: new Date().toISOString(), id: result.id, url: result.url, status: result.status };
    fs.appendFileSync(
      queue.files.history,
      JSON.stringify({ at: new Date().toISOString(), platform, post: post.id, ...result }) + "\n",
    );
    log(`${platform}: fertig ✓ ${result.url || result.id || ""}${result.inbox ? " (Entwurf in der TikTok-App)" : ""}`);
  } catch (err) {
    errors.push(`${platform}: ${err.message}`);
    log(`${platform}: FEHLER – ${err.message}`);
  }
}

if (!dryRun) {
  const done = queue.markDone(posts, posted, config);
  for (const post of done) log(`${post.id}: überall gepostet → Datei wird aus GitHub Pages entfernt`);
  queue.savePosts(posts);
  queue.savePosted(posted);
  // Auch nach einem Fehler speichern: TikTok gibt beim Erneuern evtl. ein neues Refresh-Token aus
  if (key && JSON.stringify(tokens) !== tokensBefore) saveTokens(tokens, key);
}

// Wenig Nachschub? → Issue im Repo (GitHub schickt dir dazu eine Mail)
const primary = queue.enabledPlatforms(config)[0];
if (primary) {
  const left = queue.remaining(posts, posted, primary);
  log(`Noch ${left} Clip(s) in der Warteschlange (${primary}).`);
  if (left <= (config.lowQueueWarning ?? 3) && !dryRun) await warnLowQueue(left);
}

if (errors.length) {
  console.error("\nFehler:\n- " + errors.join("\n- "));
  // Exit-Code 1 → GitHub markiert den Lauf rot und schickt eine Mail
  process.exitCode = 1;
}

async function warnLowQueue(left) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return;
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  try {
    const open = await (await fetch(`https://api.github.com/repos/${repo}/issues?state=open&labels=nachschub`, { headers })).json();
    if (Array.isArray(open) && open.length) return;
    await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: `Clip-Nachschub: nur noch ${left} Clip(s) übrig`,
        labels: ["nachschub"],
        body:
          "Die Warteschlange ist fast leer.\n\n" +
          "1. Doppelklick auf **Aufnahme.cmd** im Ordner KebabFarmSocial\n" +
          "2. Roblox (Kebab Farm) im Vollbild öffnen und im Chat `/film clips` tippen\n\n" +
          "Der Rest (Schneiden, Texte, Hochladen) läuft automatisch. Dieses Issue schließt sich nicht von selbst – einfach schließen, wenn erledigt.",
      }),
    });
    log("Issue „Clip-Nachschub“ angelegt.");
  } catch (err) {
    log("Issue konnte nicht angelegt werden:", err.message);
  }
}
