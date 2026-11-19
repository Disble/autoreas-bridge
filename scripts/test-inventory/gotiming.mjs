// Joins `go test -json` timings to inventory rows. Usage: node gotiming.mjs <repoRoot>
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const here = pathToFileURL(`${process.cwd()}/`);
const inv = JSON.parse(readFileSync(new URL("inventory.json", here), "utf8"));
const mod = readFileSync(join(root, "go.mod"), "utf8").match(/^module\s+(\S+)/m)[1];

const pkgElapsed = new Map();
const testElapsed = new Map(); // "pkg|TopLevelTest" -> seconds
const failures = [];
const skips = new Map();
for (const line of readFileSync(new URL("go-test.json", here), "utf8").split("\n")) {
  if (!line.startsWith("{")) continue;
  const e = JSON.parse(line);
  if (!["pass", "fail", "skip"].includes(e.Action)) continue;
  if (!e.Test) { if (e.Elapsed !== undefined) pkgElapsed.set(e.Package, e.Elapsed); if (e.Action === "fail") failures.push(e.Package); continue; }
  if (e.Action === "fail") failures.push(`${e.Package} ${e.Test}`);
  if (e.Test.includes("/")) continue;
  if (e.Action === "skip") skips.set(`${e.Package}|${e.Test}`, true);
  testElapsed.set(`${e.Package}|${e.Test}`, e.Elapsed);
}

for (const r of inv) {
  if (r.lang !== "go") continue;
  const dir = r.path.split("/").slice(0, -1).join("/");
  const pkg = dir ? `${mod}/${dir}` : mod;
  const src = readFileSync(join(root, r.path), "utf8");
  const names = [...src.matchAll(/^func ((?:Test|Fuzz)\w*)\(/gm)].map((m) => m[1]);
  // External test packages (package x_test) report under the same import path.
  const times = names.map((n) => ({ n, s: testElapsed.get(`${pkg}|${n}`) }));
  r.pkg = pkg;
  r.seconds = +times.reduce((a, t) => a + (t.s ?? 0), 0).toFixed(2);
  r.slowest = times.filter((t) => t.s !== undefined).sort((a, b) => b.s - a.s).slice(0, 3).map((t) => `${t.n}=${t.s}`);
  r.unmatched = times.filter((t) => t.s === undefined).length;
  r.skipped = names.filter((n) => skips.has(`${pkg}|${n}`)).length;
}
writeFileSync(new URL("inventory.json", here), JSON.stringify(inv, null, 1));

const pk = [...pkgElapsed].sort((a, b) => b[1] - a[1]);
const sum = pk.reduce((a, [, s]) => a + s, 0);
console.log(`packages=${pk.length} sumPkgSeconds=${sum.toFixed(1)} failures=${failures.length}`);
failures.slice(0, 20).forEach((f) => console.log("FAIL", f));
console.log("== top packages"); pk.slice(0, 20).forEach(([p, s]) => console.log(s.toFixed(1).padStart(7), p.replace(mod + "/", "")));
const tt = [...testElapsed].sort((a, b) => b[1] - a[1]);
console.log("== top tests"); tt.slice(0, 30).forEach(([k, s]) => console.log(s.toFixed(2).padStart(7), k.replace(mod + "/", "")));
const buckets = { "<0.01": 0, "<0.1": 0, "<1": 0, "<5": 0, ">=5": 0 };
for (const [, s] of tt) buckets[s < 0.01 ? "<0.01" : s < 0.1 ? "<0.1" : s < 1 ? "<1" : s < 5 ? "<5" : ">=5"]++;
console.log("== top-level test buckets", JSON.stringify(buckets), "skipped", skips.size);
console.log("unmatched test funcs:", inv.filter((r) => r.lang === "go").reduce((a, r) => a + r.unmatched, 0));
