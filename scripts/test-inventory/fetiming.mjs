// Joins Vitest JSON timings to inventory rows. Usage: node fetiming.mjs
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

const here = pathToFileURL(`${process.cwd()}/`);
const inv = JSON.parse(readFileSync(new URL("inventory.json", here), "utf8"));
const vt = JSON.parse(readFileSync(new URL("vitest.json", here), "utf8"));
const norm = (p) => p.replaceAll("\\", "/").replace(/^.*?\/frontend\//i, "frontend/");

const byPath = new Map();
for (const f of vt.testResults) {
  const cases = f.assertionResults.map((a) => ({ t: a.title, ms: a.duration ?? 0, s: a.status }));
  byPath.set(norm(f.name), {
    fileMs: f.endTime - f.startTime,
    caseMs: cases.reduce((a, c) => a + c.ms, 0),
    cases: cases.length,
    skipped: cases.filter((c) => c.s !== "passed" && c.s !== "failed").length,
    failed: cases.filter((c) => c.s === "failed").length,
    slowest: cases.sort((a, b) => b.ms - a.ms).slice(0, 3).map((c) => `${c.t}=${Math.round(c.ms)}`),
  });
}
let unmatched = 0;
for (const r of inv) {
  if (r.area !== "frontend") continue;
  const m = byPath.get(r.path);
  if (!m) { unmatched++; continue; }
  r.seconds = +(m.fileMs / 1000).toFixed(2);
  r.caseSeconds = +(m.caseMs / 1000).toFixed(2);
  r.runCases = m.cases; r.skipped = m.skipped; r.failed = m.failed; r.slowest = m.slowest;
}
writeFileSync(new URL("inventory.json", here), JSON.stringify(inv, null, 1));

const fe = inv.filter((r) => r.area === "frontend" && r.seconds !== undefined);
const tot = (k) => fe.reduce((a, r) => a + r[k], 0).toFixed(1);
console.log(`files=${byPath.size} unmatchedInventory=${unmatched} sumFileSeconds=${tot("seconds")} sumCaseSeconds=${tot("caseSeconds")} failed=${fe.reduce((a, r) => a + r.failed, 0)} skipped=${fe.reduce((a, r) => a + r.skipped, 0)}`);
console.log("== top files (fileSec caseSec cases)");
fe.sort((a, b) => b.seconds - a.seconds).slice(0, 25).forEach((r) => console.log(String(r.seconds).padStart(6), String(r.caseSeconds).padStart(6), String(r.runCases).padStart(4), r.path.replace("frontend/src/", "")));
const b = { "<0.5": 0, "<1": 0, "<2": 0, "<5": 0, ">=5": 0 };
for (const r of fe) b[r.seconds < 0.5 ? "<0.5" : r.seconds < 1 ? "<1" : r.seconds < 2 ? "<2" : r.seconds < 5 ? "<5" : ">=5"]++;
console.log("== file buckets (s)", JSON.stringify(b));
