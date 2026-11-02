// Lädt neue Clips hoch: Warteschlange (posts.json) in den Branch main, Videos + Webseite in den Branch
// gh-pages (GitHub Pages). gh-pages hat immer nur einen Commit – das Repo wächst durch Videos nicht.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { commitAndPush, git, hasRemote, tryGit } from "../lib/git.js";
import * as queue from "../lib/queue.js";
import { log, p } from "../lib/util.js";

// replace: true → vorhandene Videos online mit der lokalen Fassung überschreiben (nach "rerender")
export async function publish({ replace = false } = {}) {
  if (!hasRemote()) {
    log("Noch kein GitHub-Repo verbunden (npm run setup) – Clips bleiben vorerst lokal in local/media.");
    return false;
  }
  commitAndPush(["posts.json", "state", "config.json"], "Neue Clips in der Warteschlange");

  const { posts } = queue.load();
  const keep = posts.filter((x) => !x.removed).map((x) => x.file);
  const remote = git(["remote", "get-url", "origin"]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kf-pages-"));
  try {
    // Bisherigen Stand holen (falls Videos von einem anderen Rechner kamen), sonst neu anfangen
    if (tryGit(["clone", "-q", "--depth=1", "--branch", "gh-pages", remote, dir], { cwd: os.tmpdir() }) === null) {
      git(["init", "-q", dir], { cwd: os.tmpdir() });
    }
    // Webseite (Startseite, Datenschutz, OAuth-Rückleitung) immer frisch
    for (const f of fs.readdirSync(p("site"))) fs.copyFileSync(p("site", f), path.join(dir, f));
    fs.writeFileSync(path.join(dir, ".nojekyll"), "");
    const mediaDir = path.join(dir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    for (const f of fs.readdirSync(mediaDir)) if (!keep.includes(f)) fs.rmSync(path.join(mediaDir, f));
    let missing = 0;
    for (const f of keep) {
      const src = p("local", "media", f);
      if (fs.existsSync(path.join(mediaDir, f)) && !(replace && fs.existsSync(src))) continue;
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(mediaDir, f));
      else missing++;
    }
    if (missing) log(`Achtung: ${missing} Video(s) fehlen lokal und online.`);

    git(["checkout", "-q", "--orphan", "neu"], { cwd: dir });
    git(["add", "-A"], { cwd: dir });
    git(["commit", "-q", "-m", "Medien für die Warteschlange"], { cwd: dir });
    git(["push", "-q", "-f", remote, "HEAD:gh-pages"], { cwd: dir });
    log(`Hochgeladen: ${keep.length} Video(s) auf GitHub Pages.`);
    return true;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith("publish.js")) await publish();
