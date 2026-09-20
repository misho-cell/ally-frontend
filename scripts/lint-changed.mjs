// Lint only the files this branch changed.
//
// The repo carries ~55 pre-existing ESLint errors, mostly react-hooks rules in
// screens written before the rule was enabled. Clearing them in one pass is
// the right thing to do, but not during a testing week: if something breaks
// after a change touching 55 places, the tester is holding a regression
// nobody can attribute — a ticket or the tidy-up — and that costs them a day
// and us two.
//
// So the debt is frozen rather than paid: everything new is held to zero, and
// the existing errors are cleared in one deliberate pass afterwards, as a
// lint-only commit with no behaviour change, so the diff stays readable and
// can be reverted whole.
//
// Usage: npm run lint:changed [base]   (base defaults to origin/main)

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const base = process.argv[2] ?? "origin/main";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

let range;
try {
  // The merge base, so a stale local main does not drag unrelated files in.
  range = git(["merge-base", base, "HEAD"]).trim();
} catch {
  console.error(`[lint:changed] cannot resolve ${base} — is the remote fetched?`);
  process.exit(2);
}

const changed = [
  ...git(["diff", "--name-only", "--diff-filter=ACMR", range]).split("\n"),
  // Staged and unstaged work too: the point is to catch it before it lands.
  ...git(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"]).split("\n"),
  ...git(["ls-files", "--others", "--exclude-standard"]).split("\n"),
]
  .map((f) => f.trim())
  .filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f))
  // Build output is not authored code. next build regenerates the service
  // worker into public/ on every run, and linting it reports faults nobody
  // wrote and nobody can fix — which would teach us to ignore this gate.
  .filter((f) => !f.startsWith("public/") && !f.startsWith(".next/"))
  .filter((f) => existsSync(f));

const files = [...new Set(changed)].sort();

if (files.length === 0) {
  console.log("[lint:changed] no changed JavaScript or TypeScript files");
  process.exit(0);
}

console.log(`[lint:changed] ${files.length} file(s) against ${base}`);
try {
  execFileSync("npx", ["eslint", "--max-warnings", "0", ...files], { stdio: "inherit" });
} catch {
  // eslint printed the reasons; do not bury them under a second message.
  process.exit(1);
}
console.log("[lint:changed] clean");
