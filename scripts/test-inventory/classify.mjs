// Adds derived dimensions to inventory rows and writes inventory.csv plus a summary.
// Usage: node classify.mjs <repoRoot>
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
const here = pathToFileURL(`${process.cwd()}/`);
const inv = JSON.parse(readFileSync(new URL("inventory.json", here), "utf8"));
const tiers = JSON.parse(readFileSync(join(root, "coverage-tiers.json"), "utf8"));
const TODAY = new Date(process.env.TEST_INVENTORY_DATE ?? Date.now());

// Mirrors nodeTestInclude in frontend/vite.config.ts.
const nodeGlobs = [
  /^frontend\/src\/features\/(.*\/)?__tests__\/[^/]*\.helpers\.test\.ts$/,
  /^frontend\/src\/shared\/(.*\/)?__tests__\/[^/]*\.helpers\.test\.ts$/,
  /^frontend\/src\/shared\/store\/(.*\/)?__tests__\/[^/]*\.test\.ts$/,
  /^frontend\/src\/shared\/constants\/__tests__\/[^/]*\.test\.ts$/,
  /^frontend\/src\/shared\/contracts\/__tests__\/[^/]*\.test\.ts$/,
  /^frontend\/scripts\/__tests__\/[^/]*\.test\.mjs$/,
];

const tierOf = (p) => {
  const subject = p.replace(/\/__tests__\//, "/").replace(/\.test\.(tsx?|mjs)$/, ".$1").replace(/_test\.go$/, ".go");
  for (const f of tiers.features) {
    const o = f.overrides?.find((x) => subject.startsWith(x.path.replace(/\.tsx?$/, "")));
    if (o) return o.tier;
    if (subject.startsWith(f.path)) return f.defaultTier;
  }
  return "unclassified";
};

for (const r of inv) {
  const src = readFileSync(join(root, r.path), "utf8");
  const t = r.traits;
  if (r.area === "go") {
    r.env = "go";
    r.kind = t.webview || t.exec ? "process-integration" : t.sourceScan ? "repo-contract" : t.sqlite ? "sqlite-integration" : t.http ? "http-integration" : t.tempdir ? "filesystem" : "unit";
  } else {
    r.env = nodeGlobs.some((g) => g.test(r.path)) ? "node" : "jsdom";
    const usesDom = /\brender(Hook)?\(|document\.|window\.|screen\.|localStorage|navigator\.|HTMLElement|@testing-library/.test(src);
    r.jsdomUnused = r.env === "jsdom" && !usesDom;
    r.kind = r.path.startsWith("frontend/scripts/") || t.sourceScan ? "repo-contract" : /\brenderHook\(/.test(src) && !/\brender\(/.test(src) ? "hook" : /\brender\(/.test(src) ? (/integration/.test(r.path) ? "component-integration" : "component") : "pure";
  }
  const s = r.seconds ?? 0;
  r.speed = r.area === "go" ? (s >= 5 ? "very-slow" : s >= 1 ? "slow" : s >= 0.1 ? "medium" : "fast") : (s >= 5 ? "very-slow" : s >= 2 ? "slow" : s >= 0.5 ? "medium" : "fast");
  const ageDays = Math.round((TODAY - new Date(r.origin)) / 864e5);
  r.ageDays = ageDays;
  r.age = ageDays > 120 ? ">4mo" : ageDays > 60 ? "2-4mo" : ageDays > 30 ? "1-2mo" : "<1mo";
  r.churn = r.commits >= 8 ? "high" : r.commits >= 3 ? "medium" : "low";
  r.tier = tierOf(r.path);
  r.linesPerCase = +(r.lines / Math.max(1, r.tests + (r.subtests ?? 0))).toFixed(1);
  r.smells = [t.sleep && "real-sleep", r.jsdomUnused && "jsdom-unused", r.lines > 400 && "over-400-lines"].filter(Boolean).join("|");
}
writeFileSync(new URL("inventory.json", here), JSON.stringify(inv, null, 1));

const cols = ["path", "lang", "area", "context", "module", "env", "kind", "tier", "origin", "lastChange", "age", "commits", "churn", "lines", "tests", "subtests", "seconds", "speed", "linesPerCase", "smells", "slowest"];
const esc = (v) => { const s = Array.isArray(v) ? v.join(" ; ") : v ?? ""; return /[",\n]/.test(String(s)) ? `"${String(s).replaceAll('"', '""')}"` : s; };
writeFileSync(new URL("inventory.csv", here), [cols.join(","), ...inv.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n"));

const agg = (key, filter = () => true) => {
  const m = {};
  for (const r of inv.filter(filter)) { const k = key(r); m[k] ??= { files: 0, lines: 0, cases: 0, sec: 0 }; m[k].files++; m[k].lines += r.lines; m[k].cases += r.tests; m[k].sec += r.seconds ?? 0; }
  return Object.entries(m).sort((a, b) => b[1].sec - a[1].sec).map(([k, v]) => `${k.padEnd(28)} ${String(v.files).padStart(4)} files ${String(v.lines).padStart(6)} lines ${String(v.cases).padStart(5)} cases ${v.sec.toFixed(1).padStart(7)}s`);
};
for (const [title, key, f] of [
  ["go kind", (r) => r.kind, (r) => r.area === "go"],
  ["frontend kind", (r) => `${r.env}:${r.kind}`, (r) => r.area === "frontend"],
  ["speed", (r) => `${r.area}:${r.speed}`],
  ["age", (r) => `${r.area}:${r.age}`],
  ["churn", (r) => `${r.area}:${r.churn}`],
  ["tier", (r) => r.tier],
  ["smell jsdom-unused", (r) => r.kind, (r) => r.jsdomUnused],
  ["smell real-sleep", (r) => r.area, (r) => r.smells.includes("real-sleep")],
  ["smell over-400-lines", (r) => r.area, (r) => r.lines > 400],
]) { console.log(`== ${title}`); agg(key, f).forEach((l) => console.log(l)); }
