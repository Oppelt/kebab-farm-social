// Selbsttest ohne Internet: Verschlüsselung, Warteschlange und die Abläufe der drei Plattformen gegen
// nachgebaute APIs (fetch wird ersetzt). Aufruf: npm test
import assert from "node:assert/strict";
import * as instagram from "../lib/platforms/instagram.js";
import * as tiktok from "../lib/platforms/tiktok.js";
import * as youtube from "../lib/platforms/youtube.js";
import * as queue from "../lib/queue.js";
import { decrypt, encrypt, newKey } from "../lib/secrets.js";

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log("✓", name);
  } catch (e) {
    failures++;
    console.log("✗", name, "\n   ", e.message);
  }
}

// --- nachgebaute APIs ---
const calls = [];
function mockFetch(routes) {
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    calls.push({ url: u, method: opts.method || "GET", body: opts.body });
    for (const [pattern, handler] of routes) {
      if (u.includes(pattern)) {
        const r = typeof handler === "function" ? handler(u, opts) : handler;
        const body = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {});
        return new Response(r.bin ?? body, { status: r.status ?? 200, headers: r.headers ?? {} });
      }
    }
    throw new Error(`Unerwartete Anfrage: ${u}`);
  };
}
const sleep0 = globalThis.setTimeout;
// Wartezeiten im Test überspringen
globalThis.setTimeout = (fn, _ms, ...a) => sleep0(fn, 0, ...a);

const config = {
  mediaBaseUrl: "https://example.github.io/kfs",
  language: "en",
  platforms: {
    instagram: { enabled: true, apiVersion: "v24.0" },
    youtube: { enabled: true, privacyStatus: "public" },
    tiktok: { enabled: true, mode: "direct", privacyLevel: "PUBLIC_TO_EVERYONE" },
  },
};
const post = {
  id: "kf-test",
  file: "kf-test.mp4",
  captions: { instagram: "Hallo IG #roblox", tiktok: "Hallo TT #roblox" },
  youtube: { title: "Test #Shorts", description: "d", tags: ["roblox"] },
};
const video = Buffer.alloc(1024 * 10, 1);

await test("Verschlüsselung hin und zurück", () => {
  const key = Buffer.from(newKey(), "base64");
  const data = { a: 1, b: "ü🥙" };
  assert.deepEqual(decrypt(encrypt(data, key), key), data);
  const other = Buffer.from(newKey(), "base64");
  assert.throws(() => decrypt(encrypt(data, key), other));
});

await test("Warteschlange: nächster Clip, erledigt-Markierung", () => {
  const posts = [{ id: "a" }, { id: "b" }, { id: "c", removed: true }];
  const posted = { instagram: { a: {} }, youtube: {}, tiktok: {} };
  const cfg = { platforms: { instagram: { enabled: true }, youtube: { enabled: false }, tiktok: { enabled: false } } };
  assert.equal(queue.nextPost(posts, posted, "instagram").id, "b");
  assert.equal(queue.remaining(posts, posted, "instagram"), 1);
  const done = queue.markDone(posts, posted, cfg);
  assert.deepEqual(done.map((x) => x.id), ["a"]);
  assert.equal(posts[0].removed, true);
});

await test("Instagram: Container → warten → veröffentlichen", async () => {
  calls.length = 0;
  let polls = 0;
  mockFetch([
    ["example.github.io", { body: "" }],
    ["/media_publish", { body: { id: "M1" } }],
    ["/123/media", (u, o) => {
      const b = new URLSearchParams(o.body);
      assert.equal(b.get("media_type"), "REELS");
      assert.equal(b.get("video_url"), "https://example.github.io/kfs/media/kf-test.mp4");
      return { body: { id: "C1" } };
    }],
    ["/C1?", () => ({ body: { status_code: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" } })],
    ["/M1?", { body: { permalink: "https://instagram.com/reel/x" } }],
  ]);
  const tokens = { instagram: { accessToken: "t", userId: "123", issuedAt: Date.now(), expiresAt: Date.now() + 50 * 864e5 } };
  const r = await instagram.publish(post, { config, tokens });
  assert.equal(r.id, "M1");
  assert.equal(r.url, "https://instagram.com/reel/x");
});

await test("Instagram: Token wird rechtzeitig erneuert", async () => {
  mockFetch([["refresh_access_token", { body: { access_token: "neu", expires_in: 5184000 } }]]);
  const tok = { accessToken: "alt", issuedAt: Date.now() - 50 * 864e5, expiresAt: Date.now() + 10 * 864e5 };
  assert.equal(await instagram.refresh(tok), true);
  assert.equal(tok.accessToken, "neu");
  const fresh = { accessToken: "x", issuedAt: Date.now() - 2 * 864e5, expiresAt: Date.now() + 58 * 864e5 };
  assert.equal(await instagram.refresh(fresh), false);
});

await test("Instagram: Fehler bei abgelehntem Video", async () => {
  mockFetch([
    ["example.github.io", { body: "" }],
    ["/123/media", { body: { id: "C2" } }],
    ["/C2?", { body: { status_code: "ERROR", status: "Error: video format" } }],
  ]);
  const tokens = { instagram: { accessToken: "t", userId: "123", issuedAt: Date.now(), expiresAt: Date.now() + 50 * 864e5 } };
  await assert.rejects(instagram.publish(post, { config, tokens }), /lehnt das Video ab/);
});

await test("YouTube: Token → resumable Upload", async () => {
  mockFetch([
    ["example.github.io", { bin: video }],
    ["oauth2.googleapis.com/token", { body: { access_token: "A" } }],
    ["upload/youtube/v3/videos", (u, o) => {
      const meta = JSON.parse(o.body);
      assert.equal(meta.status.privacyStatus, "public");
      assert.equal(meta.snippet.categoryId, "20");
      assert.equal(o.headers["X-Upload-Content-Length"], String(video.length));
      return { body: {}, headers: { location: "https://upload.example/session1" } };
    }],
    ["upload.example/session1", (u, o) => {
      assert.equal(o.method, "PUT");
      return { body: { id: "YT1" } };
    }],
  ]);
  const r = await youtube.publish(post, { config, tokens: { youtube: { clientId: "c", clientSecret: "s", refreshToken: "r" } } });
  assert.equal(r.url, "https://youtube.com/shorts/YT1");
});

await test("TikTok direct: Kontoinfo → Init → Upload → Status", async () => {
  let status = 0;
  mockFetch([
    ["example.github.io", { bin: video }],
    ["creator_info/query", { body: { data: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] }, error: { code: "ok" } } }],
    ["/post/publish/video/init/", (u, o) => {
      const b = JSON.parse(o.body);
      assert.equal(b.post_info.privacy_level, "PUBLIC_TO_EVERYONE");
      assert.equal(b.source_info.video_size, video.length);
      assert.equal(b.source_info.total_chunk_count, 1);
      return { body: { data: { publish_id: "P1", upload_url: "https://upload.tiktok.example/1" }, error: { code: "ok" } } };
    }],
    ["upload.tiktok.example", (u, o) => {
      assert.equal(o.headers["Content-Range"], `bytes 0-${video.length - 1}/${video.length}`);
      return { body: "" };
    }],
    ["status/fetch", () => ({
      body: { data: ++status < 2 ? { status: "PROCESSING_UPLOAD" } : { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [7123] }, error: { code: "ok" } },
    })],
  ]);
  const tokens = { tiktok: { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600e3, clientKey: "k", clientSecret: "s" } };
  const r = await tiktok.publish(post, { config, tokens });
  assert.equal(r.id, "7123");
});

await test("TikTok: vor dem Audit (nur privat) klare Fehlermeldung", async () => {
  mockFetch([
    ["example.github.io", { bin: video }],
    ["creator_info/query", { body: { data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } } }],
  ]);
  const tokens = { tiktok: { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 3600e3 } };
  await assert.rejects(tiktok.publish(post, { config, tokens }), /inbox/);
});

await test("TikTok inbox: Entwurf + Token-Erneuerung", async () => {
  mockFetch([
    ["oauth/token", { body: { access_token: "neu", expires_in: 86400, refresh_token: "r2", refresh_expires_in: 31536000 } }],
    ["example.github.io", { bin: video }],
    ["/inbox/video/init/", { body: { data: { publish_id: "P2", upload_url: "https://upload.tiktok.example/2" }, error: { code: "ok" } } }],
    ["upload.tiktok.example", { body: "" }],
    ["status/fetch", { body: { data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok" } } }],
  ]);
  const tokens = { tiktok: { accessToken: "alt", refreshToken: "r", expiresAt: Date.now() - 1000, clientKey: "k", clientSecret: "s" } };
  const r = await tiktok.publish(post, { config: { ...config, platforms: { ...config.platforms, tiktok: { mode: "inbox" } } }, tokens });
  assert.equal(r.inbox, true);
  assert.equal(tokens.tiktok.refreshToken, "r2");
});

console.log(failures ? `\n${failures} Test(s) fehlgeschlagen` : "\nAlle Tests bestanden.");
process.exitCode = failures ? 1 : 0;
