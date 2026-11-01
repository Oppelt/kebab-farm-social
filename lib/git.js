import { execFileSync } from "node:child_process";
import { ROOT } from "./util.js";

export function git(args, { cwd = ROOT, quiet = false } = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", quiet ? "ignore" : "inherit"],
  }).trim();
}

export function tryGit(args, opts) {
  try {
    return git(args, { quiet: true, ...opts });
  } catch {
    return null;
  }
}

export function hasRemote() {
  return !!tryGit(["remote", "get-url", "origin"]);
}

// Lokalen Stand mit GitHub abgleichen (der Workflow schreibt dort jeden Tag posted.json)
export function pullMain() {
  if (!hasRemote() || !tryGit(["ls-remote", "--heads", "origin", "main"])) return;
  tryGit(["pull", "-q", "--rebase", "--autostash", "origin", "main"]);
}

export function commitAndPush(paths, message) {
  git(["add", ...paths]);
  if (tryGit(["diff", "--cached", "--quiet"]) === null) {
    git(["commit", "-q", "-m", message]);
  }
  if (hasRemote()) {
    // Beim allerersten Hochladen gibt es auf GitHub noch keinen Branch main
    if (tryGit(["ls-remote", "--heads", "origin", "main"])) git(["pull", "-q", "--rebase", "--autostash", "origin", "main"]);
    git(["push", "-q", "-u", "origin", "HEAD:main"]);
  }
}
