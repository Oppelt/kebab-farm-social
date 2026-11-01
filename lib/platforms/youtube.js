// YouTube Shorts über die YouTube Data API v3 (videos.insert, resumable Upload).
// Hochformat ≤ 3 Minuten wird von YouTube automatisch als Short einsortiert.
// Wichtig: Solange das Google-Cloud-Projekt das YouTube-API-Audit nicht bestanden hat, macht YouTube
// jedes hochgeladene Video privat – deshalb ist YouTube in config.json bis zum Audit ausgeschaltet.
import { fetchJson, form, loadVideo, log } from "../util.js";

async function accessToken(tok) {
  const { body } = await fetchJson(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: form({
        client_id: tok.clientId,
        client_secret: tok.clientSecret,
        refresh_token: tok.refreshToken,
        grant_type: "refresh_token",
      }),
    },
    "YouTube-Anmeldung",
  );
  return body.access_token;
}

export async function publish(post, { config, tokens, dryRun }) {
  const tok = tokens.youtube;
  if (!tok?.refreshToken) throw new Error("YouTube ist nicht verbunden (npm run setup -- youtube)");
  const yt = post.youtube;
  if (dryRun) {
    log("YouTube (Probelauf):", yt.title);
    return { dryRun: true };
  }
  const token = await accessToken(tok);
  const video = await loadVideo(post, config);

  const meta = {
    snippet: {
      title: yt.title.slice(0, 100),
      description: yt.description,
      tags: yt.tags,
      categoryId: "20", // Gaming
      defaultLanguage: config.language || "en",
      defaultAudioLanguage: config.language || "en",
    },
    status: {
      privacyStatus: config.platforms.youtube.privacyStatus || "public",
      selfDeclaredMadeForKids: false,
    },
  };
  const init = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(video.length),
      },
      body: JSON.stringify(meta),
    },
  );
  if (!init.ok) throw new Error(`YouTube-Upload starten fehlgeschlagen (HTTP ${init.status}): ${await init.text()}`);
  const uploadUrl = init.headers.get("location");

  const { body } = await fetchJson(
    uploadUrl,
    { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(video.length) }, body: video },
    "YouTube-Upload",
  );
  return { id: body.id, url: `https://youtube.com/shorts/${body.id}` };
}
