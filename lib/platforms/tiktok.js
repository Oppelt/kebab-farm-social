// TikTok über die Content Posting API.
// mode "direct": postet direkt öffentlich – erst möglich, wenn die App das TikTok-Audit bestanden hat
//                (vorher nimmt TikTok nur private Posts von privaten Konten an).
// mode "inbox":  schickt das Video als Entwurf in die TikTok-App (Benachrichtigung), dort nur noch
//                "Posten" tippen – Überbrückung bis zum Audit.
import { fetchJson, form, loadVideo, log, sleep } from "../util.js";

const API = "https://open.tiktokapis.com/v2";

export async function refresh(tok) {
  if ((tok.expiresAt || 0) - Date.now() > 10 * 60 * 1000) return false;
  const { body } = await fetchJson(
    `${API}/oauth/token/`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({
        client_key: tok.clientKey,
        client_secret: tok.clientSecret,
        grant_type: "refresh_token",
        refresh_token: tok.refreshToken,
      }),
    },
    "TikTok-Token erneuern",
  );
  if (!body.access_token) throw new Error(`TikTok-Token erneuern: ${JSON.stringify(body)}`);
  tok.accessToken = body.access_token;
  tok.expiresAt = Date.now() + body.expires_in * 1000;
  tok.refreshToken = body.refresh_token || tok.refreshToken;
  if (body.refresh_expires_in) tok.refreshExpiresAt = Date.now() + body.refresh_expires_in * 1000;
  return true;
}

async function call(tok, path, payload, what) {
  const { body } = await fetchJson(
    `${API}${path}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${tok.accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
      body: payload ? JSON.stringify(payload) : undefined,
    },
    what,
  );
  if (body.error && body.error.code !== "ok") throw new Error(`${what}: ${body.error.code} – ${body.error.message}`);
  return body.data;
}

export async function publish(post, { config, tokens, dryRun }) {
  const tok = tokens.tiktok;
  if (!tok?.refreshToken) throw new Error("TikTok ist nicht verbunden (npm run setup -- tiktok)");
  const settings = config.platforms.tiktok;
  const mode = settings.mode || "inbox";
  if (dryRun) {
    log(`TikTok ${mode} (Probelauf):`, post.captions.tiktok.split("\n")[0]);
    return { dryRun: true };
  }
  const changed = await refresh(tok);
  const video = await loadVideo(post, config);
  const source_info = { source: "FILE_UPLOAD", video_size: video.length, chunk_size: video.length, total_chunk_count: 1 };
  if (video.length > 64 * 1024 * 1024) throw new Error("Video ist größer als 64 MB");

  let init;
  if (mode === "direct") {
    const creator = await call(tok, "/post/publish/creator_info/query/", null, "TikTok-Kontoinfo");
    const privacy = settings.privacyLevel || "PUBLIC_TO_EVERYONE";
    if (!creator.privacy_level_options?.includes(privacy)) {
      throw new Error(
        `TikTok erlaubt "${privacy}" gerade nicht (möglich: ${creator.privacy_level_options?.join(", ")}). ` +
          "Vor dem Audit geht nur privat – dann in config.json tiktok.mode auf \"inbox\" stellen.",
      );
    }
    init = await call(
      tok,
      "/post/publish/video/init/",
      {
        post_info: {
          title: post.captions.tiktok.slice(0, 2200),
          privacy_level: privacy,
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: post.coverMs || 1000,
        },
        source_info,
      },
      "TikTok-Post starten",
    );
  } else {
    init = await call(tok, "/post/publish/inbox/video/init/", { source_info }, "TikTok-Entwurf starten");
  }

  const put = await fetch(init.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(video.length),
      "Content-Range": `bytes 0-${video.length - 1}/${video.length}`,
    },
    body: video,
  });
  if (!put.ok) throw new Error(`TikTok-Upload fehlgeschlagen (HTTP ${put.status}): ${await put.text()}`);

  // Warten, bis TikTok fertig ist (max. ~5 Minuten)
  let status = "PROCESSING_UPLOAD";
  let data;
  for (let i = 0; i < 30; i++) {
    await sleep(10000);
    data = await call(tok, "/post/publish/status/fetch/", { publish_id: init.publish_id }, "TikTok-Status");
    status = data.status;
    if (status === "FAILED") throw new Error(`TikTok: Veröffentlichung fehlgeschlagen (${data.fail_reason})`);
    if (status === "PUBLISH_COMPLETE" || status === "SEND_TO_USER_INBOX") break;
  }
  if (status !== "PUBLISH_COMPLETE" && status !== "SEND_TO_USER_INBOX") {
    throw new Error(`TikTok ist nach 5 Minuten nicht fertig (Status ${status}, publish_id ${init.publish_id})`);
  }
  const id = data.publicaly_available_post_id?.[0] || data.publicly_available_post_id?.[0];
  return { id: id ? String(id) : init.publish_id, status, tokensChanged: changed, inbox: mode !== "direct" };
}
