// Warteschlange: posts.json (alle Clips mit Texten) + state/posted.json (was wo schon gepostet ist).
import { p, readJson, writeJson } from "./util.js";

export const PLATFORMS = ["instagram", "youtube", "tiktok"];
export const files = {
  config: p("config.json"),
  posts: p("posts.json"),
  posted: p("state", "posted.json"),
  history: p("state", "history.jsonl"),
};

export function load() {
  const config = readJson(files.config);
  const { posts } = readJson(files.posts, { posts: [] });
  const posted = readJson(files.posted, {});
  for (const pl of PLATFORMS) posted[pl] ??= {};
  return { config, posts, posted };
}

export function enabledPlatforms(config) {
  return PLATFORMS.filter((pl) => config.platforms[pl]?.enabled);
}

// Nächster Clip für eine Plattform: der älteste, der dort noch nicht lief und noch Medien hat
export function nextPost(posts, posted, platform) {
  return posts.find((post) => !post.removed && !posted[platform][post.id]);
}

export function remaining(posts, posted, platform) {
  return posts.filter((post) => !post.removed && !posted[platform][post.id]).length;
}

// Clips, die auf allen eingeschalteten Plattformen gelaufen sind, brauchen keine Datei mehr online
export function markDone(posts, posted, config) {
  const on = enabledPlatforms(config);
  if (!on.length) return [];
  const done = [];
  for (const post of posts) {
    if (!post.removed && on.every((pl) => posted[pl][post.id])) {
      post.removed = true;
      done.push(post);
    }
  }
  return done;
}

export function savePosts(posts) {
  writeJson(files.posts, { posts });
}

export function savePosted(posted) {
  writeJson(files.posted, posted);
}
