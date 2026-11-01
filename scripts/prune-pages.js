// Entfernt Videos, die überall gepostet sind, aus dem Branch gh-pages (GitHub Pages).
// gh-pages hat immer nur einen einzigen Commit, damit das Repo durch Videos nicht wächst.
// Aufruf im Workflow nach post.js; lokal geht es auch (braucht git-Zugang zum Repo).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as queue from "../lib/queue.js";
import { log, ROOT } from "../lib/util.js";

const git = (args, cwd = ROOT) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

const { posts } = queue.load();
const keep = new Set(posts.filter((post) => !post.removed).map((post) => post.file));

git(["fetch", "--depth=1", "origin", "gh-pages"]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pages-"));
git(["worktree", "add", "--detach", dir, "FETCH_HEAD"]);
try {
  const mediaDir = path.join(dir, "media");
  const files = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : [];
  const drop = files.filter((f) => f.endsWith(".mp4") && !keep.has(f));
  if (!drop.length) {
    log("gh-pages: nichts zu entfernen.");
  } else {
    for (const f of drop) fs.rmSync(path.join(mediaDir, f));
    git(["checkout", "--orphan", "pages-tmp"], dir);
    git(["add", "-A"], dir);
    git(["commit", "-q", "-m", "Medien für die Warteschlange"], dir);
    git(["push", "-q", "-f", "origin", "HEAD:gh-pages"], dir);
    log(`gh-pages: ${drop.length} gepostete(s) Video(s) entfernt.`);
  }
} finally {
  git(["worktree", "remove", "--force", dir]);
  try {
    git(["branch", "-D", "pages-tmp"]);
  } catch {}
}
