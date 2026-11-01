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

// Posting-Schema (seit 01.11.2026, 3 Clips am Tag): nicht stur der älteste Clip, sondern einer, dessen
// Format zuletzt nicht dran war und der möglichst aus einem anderen Aufnahme-Durchgang stammt – so
// kommt nie zweimal dasselbe Format hintereinander und die Kamerawinkel wechseln. Bei Gleichstand
// gewinnt der ältere Clip.
export function pickPost(posts, posted, platform) {
  const open = posts.filter((post) => !post.removed && !posted[platform][post.id]);
  if (!open.length) return undefined;
  const byId = new Map(posts.map((post) => [post.id, post]));
  const recent = Object.entries(posted[platform])
    .sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)))
    .map(([id]) => byId.get(id))
    .filter(Boolean)
    .slice(0, 4);
  const recipePenalty = (recipe) => {
    const i = recent.findIndex((r) => r.recipe === recipe);
    return i < 0 ? 0 : [100, 50, 25, 12][i];
  };
  const lastSource = recent[0]?.source;
  let best;
  let bestScore = Infinity;
  open.forEach((post, age) => {
    const score = recipePenalty(post.recipe) + (lastSource && post.source === lastSource ? 10 : 0) + age * 0.01;
    if (score < bestScore) {
      best = post;
      bestScore = score;
    }
  });
  return best;
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
