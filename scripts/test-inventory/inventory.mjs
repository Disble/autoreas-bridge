// Static test inventory: one row per test file with language, module, dates, size and traits.
// Usage: node inventory.mjs <repoRoot> <outJson>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [root, out] = process.argv.slice(2);
const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 1 << 30 });

const isTest = (p) => /_test\.go$/.test(p) || /^frontend\/.*\.test\.(ts|tsx|mjs)$/.test(p);
const files = git(["ls-files"]).split("\n").filter(isTest);

// One oldest-first history pass with rename detection, so a renamed file keeps its origin date.
const origin = new Map();
const last = new Map();
const commits = new Map();
let date = "";
for (const line of git(["log", "--reverse", "-M", "--name-status", "--format=@%as", "--", "*_test.go", "frontend/*.test.ts", "frontend/*.test.tsx", "frontend/*.test.mjs"]).split("\n")) {
  if (line.startsWith("@")) { date = line.slice(1); continue; }
  const parts = line.split("\t");
  if (parts.length < 2) continue;
  const status = parts[0];
  if (status.startsWith("R")) {
    const [, from, to] = parts;
    origin.set(to, origin.get(from) ?? date);
    commits.set(to, (commits.get(from) ?? 0) + 1);
    last.set(to, date);
  } else {
    const p = parts[1];
    if (status === "D") continue;
    if (!origin.has(p) || status === "A") origin.set(p, origin.get(p) ?? date);
    commits.set(p, (commits.get(p) ?? 0) + 1);
    last.set(p, date);
  }
}

const count = (src, re) => (src.match(re) || []).length;

function moduleOf(p) {
  const s = p.split("/");
  if (p.startsWith("frontend/")) {
    if (s[1] === "scripts") return { area: "frontend", context: "fe-scripts", module: "frontend/scripts" };
    if (s[2] === "features" || s[2] === "shared") return { area: "frontend", context: `${s[2]}/${s[3]}`, module: s.slice(0, Math.min(s.length - 1, 5)).join("/") };
    return { area: "frontend", context: s[2] ?? "src", module: s.slice(0, s.length - 1).join("/") };
  }
  const dir = s.slice(0, -1).join("/") || ".";
  if (s[0] === "internal") return { area: "go", context: s[1], module: dir };
  return { area: "go", context: s.length > 1 ? `${s[0]}/${s[1]}` : "root", module: dir };
}

const rows = files.map((p) => {
  const src = readFileSync(join(root, p), "utf8");
  const lines = src.split("\n").length;
  const m = moduleOf(p);
  const go = p.endsWith(".go");
  const traits = go
    ? {
        sqlite: /sqlite|sql\.Open|OpenTestDB|openTestDB|newTestStore|store\.Open/i.test(src),
        tempdir: /t\.TempDir\(|os\.MkdirTemp/.test(src),
        sourceScan: /filepath\.(Walk|WalkDir)|os\.ReadFile\([^)]*\.(go|md|ya?ml|json|tsx?)"/.test(src) || /go\/(ast|parser)/.test(src),
        http: /httptest\./.test(src),
        exec: /exec\.Command/.test(src),
        sleep: /time\.Sleep\(/.test(src),
        parallel: /t\.Parallel\(\)/.test(src),
        fixture: /testdata/.test(src),
        webview: /webview2/i.test(src),
      }
    : {
        render: /\brender(Hook)?\(|@testing-library/.test(src),
        userEvent: /userEvent|fireEvent/.test(src),
        fakeTimers: /useFakeTimers/.test(src),
        waitFor: /waitFor\(|findBy/.test(src),
        mocks: count(src, /vi\.mock\(/g),
        sourceScan: /readFileSync|readdirSync|globSync|import\.meta\.glob/.test(src),
        sleep: /setTimeout\(|new Promise\(\s*\(?r(esolve)?\)?\s*=>\s*setTimeout/.test(src),
      };
  const cases = go
    ? { tests: count(src, /^func (Test|Fuzz)\w*\(/gm), benches: count(src, /^func Benchmark/gm), subtests: count(src, /\bt\.Run\(/g) }
    : { tests: count(src, /^\s*(it|test)(\.each\([^)]*\))?(\.(skip|only|todo))?\(/gm), describes: count(src, /^\s*describe(\.each)?\(/gm) };
  return { path: p, lang: go ? "go" : p.endsWith(".tsx") ? "tsx" : p.endsWith(".mjs") ? "mjs" : "ts", ...m, origin: origin.get(p) ?? null, lastChange: last.get(p) ?? null, commits: commits.get(p) ?? 0, lines, ...cases, traits };
});

writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(`rows=${rows.length} missingOrigin=${rows.filter((r) => !r.origin).length}`);
