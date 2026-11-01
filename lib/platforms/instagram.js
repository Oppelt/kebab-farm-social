// Instagram Reels (Business-/Creator-Konto). Zwei Arten von Zugang:
//  - host "facebook": System-User-Token aus dem Business-Portfolio (neue Meta-Apps, "Unified login"),
//    läuft nie ab, API auf graph.facebook.com
//  - sonst: Token aus "Instagram Login" (ältere Apps), 60 Tage gültig, API auf graph.instagram.com
// Instagram holt das Video selbst von einer öffentlichen URL (GitHub Pages).
// Ablauf: Container anlegen → warten bis FINISHED → veröffentlichen.
import { fetchJson, form, log, mediaUrl, sleep } from "../util.js";

const DAY = 24 * 3600 * 1000;

export function base(config, tok) {
  const host = tok?.host === "facebook" ? "graph.facebook.com" : "graph.instagram.com";
  return `https://${host}/${config.platforms.instagram.apiVersion || "v24.0"}`;
}

// Langlebiges Token (60 Tage) rechtzeitig erneuern. Geht erst, wenn es mindestens 24 h alt ist.
export async function refresh(tok) {
  if (tok.neverExpires) return false;
  const left = (tok.expiresAt || 0) - Date.now();
  const age = Date.now() - (tok.issuedAt || 0);
  if (left > 20 * DAY || age < DAY) return false;
  const { body } = await fetchJson(
    `https://graph.instagram.com/refresh_access_token?${form({ grant_type: "ig_refresh_token", access_token: tok.accessToken })}`,
    {},
    "Instagram-Token erneuern",
  );
  tok.accessToken = body.access_token;
  tok.issuedAt = Date.now();
  tok.expiresAt = Date.now() + body.expires_in * 1000;
  log("Instagram: Token erneuert, gültig bis", new Date(tok.expiresAt).toISOString().slice(0, 10));
  return true;
}

export async function publish(post, { config, tokens, dryRun }) {
  const tok = tokens.instagram;
  if (!tok?.accessToken || !tok.userId) throw new Error("Instagram ist nicht verbunden (npm run setup -- instagram)");
  const changed = await refresh(tok);
  const url = mediaUrl(post, config);
  const caption = post.captions.instagram;
  if (dryRun) {
    log("Instagram (Probelauf):", url, "|", caption.split("\n")[0]);
    return { dryRun: true, tokensChanged: changed };
  }

  // Ist das Video schon über Pages erreichbar? (Pages braucht nach dem Hochladen 1–2 Minuten)
  const head = await fetch(url, { method: "HEAD" });
  if (!head.ok) throw new Error(`Video auf GitHub Pages nicht erreichbar (${head.status}): ${url}`);

  const api = base(config, tok);
  const { body: container } = await fetchJson(
    `${api}/${tok.userId}/media`,
    {
      method: "POST",
      body: form({
        media_type: "REELS",
        video_url: url,
        caption,
        share_to_feed: "true",
        access_token: tok.accessToken,
      }),
    },
    "Instagram-Container anlegen",
  );

  // Instagram verarbeitet das Video: bis zu 10 Minuten warten
  let status = "IN_PROGRESS";
  for (let i = 0; i < 60 && status === "IN_PROGRESS"; i++) {
    await sleep(10000);
    const { body } = await fetchJson(
      `${api}/${container.id}?${form({ fields: "status_code,status", access_token: tok.accessToken })}`,
      {},
      "Instagram-Status",
    );
    status = body.status_code;
    if (status === "ERROR" || status === "EXPIRED") throw new Error(`Instagram lehnt das Video ab: ${body.status}`);
  }
  if (status !== "FINISHED") throw new Error(`Instagram ist nach 10 Minuten nicht fertig (Status ${status})`);

  const { body: done } = await fetchJson(
    `${api}/${tok.userId}/media_publish`,
    { method: "POST", body: form({ creation_id: container.id, access_token: tok.accessToken }) },
    "Instagram veröffentlichen",
  );
  let permalink;
  try {
    const { body } = await fetchJson(
      `${api}/${done.id}?${form({ fields: "permalink", access_token: tok.accessToken })}`,
    );
    permalink = body.permalink;
  } catch {}
  return { id: done.id, url: permalink, tokensChanged: changed };
}
