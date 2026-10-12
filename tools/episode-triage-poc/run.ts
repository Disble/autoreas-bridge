/** PROTOTYPE — disposable, NOT PRODUCTION. Single-command CLI: capture, replay, report. */
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { analyze } from "./analyze.ts";
import { captureDir, resolveSampleDir } from "./collect.ts";
import { SCENARIOS, type Scenario } from "./cases.ts";
import { buildReport, type ReportBlock } from "./report.ts";
import type { Snapshot, TriageResult } from "./types.ts";

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};
const has = (name: string): boolean => args.includes(name);

function fail(lines: string[]): never {
  for (const l of lines) console.error(l);
  process.exit(1);
}

interface CheckOutcome {
  readonly ok: boolean;
  readonly messages: string[];
}

/** Validate one scenario result against its explicit known-case annotations. */
export function checkScenario(sc: Scenario, result: TriageResult): CheckOutcome {
  const messages: string[] = [];
  let ok = true;
  const byName = new Map(result.verdicts.map((v) => [v.basename, v]));
  for (const e of sc.expect) {
    const v = byName.get(e.file);
    if (!v) {
      ok = false;
      messages.push(`FAIL ${sc.id}: expected file ${e.file} missing from verdicts`);
      continue;
    }
    if (v.verdict !== e.verdict) {
      ok = false;
      messages.push(`FAIL ${sc.id} ${e.file}: verdict ${v.verdict} != expected ${e.verdict}`);
    } else {
      messages.push(`ok ${sc.id} ${e.file}: ${v.verdict}${v.episode !== undefined ? ` ep${v.episode}` : ""}`);
    }
    if (e.episode !== undefined && v.episode !== e.episode) {
      ok = false;
      messages.push(`FAIL ${sc.id} ${e.file}: episode ${v.episode} != expected ${e.episode}`);
    }
    if (e.birthRank !== undefined && v.birthRank !== e.birthRank) {
      ok = false;
      messages.push(`FAIL ${sc.id} ${e.file}: birthRank "${v.birthRank}" != expected "${e.birthRank}"`);
    }
    for (const a of e.alternativesInclude ?? []) {
      if (!(v.alternatives ?? []).includes(a)) {
        ok = false;
        messages.push(`FAIL ${sc.id} ${e.file}: alternatives [${(v.alternatives ?? []).join(",")}] missing ${a}`);
      }
    }
  }
  if (sc.check === "no-accepted") {
    const accepted = result.verdicts.filter((v) => v.episode !== undefined);
    if (accepted.length > 0 || Object.keys(result.assignments).length > 0) {
      ok = false;
      messages.push(`FAIL ${sc.id}: accepted episodes exist (${accepted.map((v) => `${v.basename}=${v.episode}`).join(", ")}); assignments ${JSON.stringify(result.assignments)}`);
    } else {
      messages.push(`ok ${sc.id}: nothing accepted, map empty`);
    }
  }
  if (sc.check === "permutation-stable") {
    const reversed: Snapshot = { ...sc.snapshot, entries: [...sc.snapshot.entries].reverse() };
    const before = JSON.stringify(reversed.entries);
    const again = analyze(reversed, sc.id);
    const canon = (r: TriageResult): string =>
      JSON.stringify(r.verdicts.map((v) => [v.basename, v.verdict, v.episode ?? null, v.alternatives ?? null]));
    if (canon(again) !== canon(result)) {
      ok = false;
      messages.push(`FAIL ${sc.id}: permuted input changed canonically sorted results`);
    } else {
      messages.push(`ok ${sc.id}: permutation-stable`);
    }
    if (JSON.stringify(reversed.entries) !== before) {
      ok = false;
      messages.push(`FAIL ${sc.id}: analyze() mutated its input`);
    } else {
      messages.push(`ok ${sc.id}: input unchanged`);
    }
  }
  if (sc.check === "fractional-progress-unavailable") {
    const line = result.pendingCompatibility.join(" ");
    if (!/expected-next unavailable/i.test(line)) {
      ok = false;
      messages.push(`FAIL ${sc.id}: fractional progress produced an expected-next`);
    } else {
      messages.push(`ok ${sc.id}: expected-next unavailable`);
    }
  }
  if (sc.expectNext !== undefined) {
    const got = result.nextSelection;
    const want = sc.expectNext;
    const same = want === null
      ? got === null
      : got !== null && got.episode === want.episode && got.basename === want.basename;
    if (!same) {
      ok = false;
      messages.push(`FAIL ${sc.id}: nextSelection ${JSON.stringify(got)} != expected ${JSON.stringify(want)}`);
    } else {
      messages.push(`ok ${sc.id}: nextSelection ${want === null ? "abstain" : `${want.episode}=${want.basename}`}`);
    }
    if (typeof result.nextReason !== "string" || result.nextReason.length === 0) {
      ok = false;
      messages.push(`FAIL ${sc.id}: nextReason missing`);
    }
  }
  // Disclosure regression: every needle must appear BOTH in the nextReason
  // and in the selected file's own assumptions/support (never via the id).
  if (sc.expectReasonIncludes !== undefined && sc.expectReasonIncludes.length > 0) {
    const sel = result.nextSelection;
    const selVerdict = sel !== null ? result.verdicts.find((v) => v.basename === sel.basename) : undefined;
    const perFile = selVerdict !== undefined ? [...selVerdict.assumptions, ...selVerdict.support].join(" ") : "";
    for (const needle of sc.expectReasonIncludes) {
      if (!result.nextReason.includes(needle)) {
        ok = false;
        messages.push(`FAIL ${sc.id}: nextReason missing disclosure "${needle}"`);
      } else {
        messages.push(`ok ${sc.id}: nextReason discloses "${needle}"`);
      }
      if (selVerdict === undefined || !perFile.includes(needle)) {
        ok = false;
        messages.push(`FAIL ${sc.id}: selected file text missing disclosure "${needle}"`);
      } else {
        messages.push(`ok ${sc.id}: selected file discloses "${needle}"`);
      }
    }
  }
  return { ok, messages };
}

async function bundleCore(): Promise<string> {
  const out = await Bun.build({
    entrypoints: ["tools/episode-triage-poc/browser-core.ts"],
    bundle: true,
    minify: false,
    target: "browser",
    format: "iife",
  });
  if (!out.success) fail(["bundle failed", ...out.logs.map(String)]);
  return await out.outputs[0].text();
}

function writeOutputs(jsonPath: string | null, htmlPath: string | null, payload: unknown, html: string): void {
  if (jsonPath) {
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
    console.log(`wrote ${jsonPath}`);
  }
  if (htmlPath) {
    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, html);
    console.log(`wrote ${htmlPath}`);
  }
}

async function cmdDemo(): Promise<void> {
  const blocks: ReportBlock[] = [];
  const payload: Array<{ scenario: string; snapshot: Snapshot; result: TriageResult }> = [];
  let allOk = true;
  for (const sc of SCENARIOS) {
    const result = analyze(sc.snapshot, sc.id);
    payload.push({ scenario: sc.id, snapshot: sc.snapshot, result });
    blocks.push({ id: sc.id, title: sc.title, description: sc.description, snapshot: sc.snapshot, result });
    if (has("--validate")) {
      const c = checkScenario(sc, result);
      for (const m of c.messages) console.log(m);
      if (!c.ok) allOk = false;
    } else {
      console.log(`${sc.id}: ${result.verdicts.length} verdicts`);
    }
  }
  const bundle = await bundleCore();
  const html = buildReport(
    "Episode-recognition triage PoC — synthetic demo",
    "Can deterministic joint triage (labels + creation/modification order + explicit convention) place episodes without AI, name-first matching, or invented weights?",
    blocks,
    bundle,
  );
  writeOutputs(flag("--json"), flag("--out"), { snapshots: payload }, html);
  if (has("--validate") && !allOk) fail(["demo validation FAILED"]);
  console.log("demo validation passed");
}

async function cmdSamples(): Promise<void> {
  const kinds = ["slime", "mushoku", "yani", "datealive"] as const;
  const contexts: Record<string, Snapshot["context"]> = {
    slime: { animeTitle: "Tensei shitara Slime Datta Ken 4th Season", expectedNext: 24, progress: 23, note: "historical supplied demo context, not live DB" },
    mushoku: { animeTitle: "Mushoku Tensei III", progress: 12, note: "historical supplied demo context, not live DB" },
    yani: { animeTitle: "Yani Neko (resolved by unique prefix)", note: "current progress unknown; not invented" },
    datealive: { animeTitle: "Date a Live III (resolved uniquely)", progress: 13, note: "historical supplied demo context, not live DB" },
  };
  const blocks: ReportBlock[] = [];
  const payload: Array<{ sample: string; dir: string | null; snapshot: Snapshot; result: TriageResult }> = [];
  for (const k of kinds) {
    const r = resolveSampleDir(k);
    if (!r.dir) {
      console.log(`sample ${k}: MISSING/AMBIGUOUS — ${r.reason}`);
      const empty: Snapshot = { source: "live", capturedAt: new Date().toISOString(), entries: [], convention: null, context: contexts[k], notes: r.reason };
      const res = analyze(empty, `live-${k}`);
      payload.push({ sample: k, dir: null, snapshot: empty, result: res });
      blocks.push({ id: `live-${k}`, title: `${k} (missing)`, description: r.reason, snapshot: empty, result: res });
      continue;
    }
    const { entries, diag } = captureDir(r.dir);
    // Live collections are observed, not proven prefixes: unknown convention stays unknown.
    const snap: Snapshot = {
      source: "live",
      capturedAt: new Date().toISOString(),
      entries,
      convention: null,
      context: contexts[k],
      notes: `live capture of ${r.dir}; ${diag.messages.join("; ") || "no diagnostics"}`,
    };
    const res = analyze(snap, `live-${k}`);
    const hypo = analyze({ ...snap, convention: { completePrefixFrom1: true, noGaps: true, noExtras: true, label: "hypothetical-prefix (user must declare)" } }, `live-${k}-hypo`);
    const agree = hypo.verdicts.filter((v) => v.verdict === "corroborated").length;
    const cond = hypo.verdicts.filter((v) => v.verdict === "conditional").length;
    const conf = hypo.verdicts.filter((v) => v.verdict === "conflicting").length;
    const noted: Snapshot = { ...snap, notes: `${snap.notes}; hypothetical-prefix reading (NOT asserted): ${agree}/${hypo.verdicts.length} corroborated, ${cond} conditional, ${conf} conflicting under a user-declared prefix convention` };
    console.log(`sample ${k} hypothetical-prefix: ${agree} corroborated / ${cond} conditional / ${conf} conflicting of ${hypo.verdicts.length}`);
    console.log(`sample ${k}: ${entries.length} videos from ${r.dir} (${r.reason})`);
    for (const v of res.verdicts) {
      console.log(`  ${v.basename}: ${v.verdict}${v.episode !== undefined ? ` ep${v.episode}` : ""} [${v.birthRank}/${v.mtimeRank}]`);
    }
    payload.push({ sample: k, dir: r.dir, snapshot: noted, result: res });
    blocks.push({ id: `live-${k}`, title: `${k} live`, description: noted.notes ?? "", snapshot: noted, result: res });
  }
  const bundle = await bundleCore();
  const html = buildReport(
    "Episode-recognition triage PoC — live samples",
    "What do real Windows creation/modification observations say under the same deterministic rules, with unknown collections kept unknown?",
    blocks,
    bundle,
  );
  writeOutputs(flag("--json"), flag("--out"), { snapshots: payload }, html);
  console.log("samples captured");
}

async function cmdReplay(): Promise<void> {
  const file = flag("--replay") ?? args[args.indexOf("--replay") + 1];
  if (!file) fail(["--replay <file> required"]);
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    snapshots: Array<{ snapshot: Snapshot; result: TriageResult; scenario?: string; sample?: string }>;
  };
  const list = raw.snapshots ?? (raw as unknown as { snapshot: Snapshot; result: TriageResult });
  const items = Array.isArray(list) ? list : [list];
  const blocks: ReportBlock[] = [];
  const payload: unknown[] = [];
  let allOk = true;
  const recompute = has("--recompute");
  for (const it of items) {
    const id = (it.scenario ?? it.sample ?? "replay") as string;
    const frozenBefore = JSON.stringify(it.snapshot);
    const again = analyze(it.snapshot, id);
    if (JSON.stringify(it.snapshot) !== frozenBefore) fail([`replay ${id}: analyze() mutated its input`]);
    if (!recompute) {
      payload.push({ ...it, result: again });
      const same = JSON.stringify(again.verdicts) === JSON.stringify(it.result.verdicts);
      console.log(`${same ? "ok" : "FAIL"} replay ${id}: ${same ? "deterministic match" : "MISMATCH vs recorded"}`);
      if (!same) allOk = false;
      blocks.push({ id: `replay-${id}`, title: id, description: "replay of recorded snapshot with the same analyze()", snapshot: it.snapshot, result: again });
      continue;
    }
    // Recompute mode: record old-vs-new drift, validate the NEW results for
    // consistency instead of claiming old verdicts still match.
    const driftedVerdicts = JSON.stringify(again.verdicts) !== JSON.stringify(it.result.verdicts);
    const driftedAssign = JSON.stringify(again.assignments) !== JSON.stringify(it.result.assignments);
    const drifted = driftedVerdicts || driftedAssign;
    console.log(`${drifted ? "drift" : "same"} recompute ${id}: verdicts ${driftedVerdicts ? "CHANGED vs recorded" : "unchanged"}, assignments ${driftedAssign ? "CHANGED vs recorded" : "unchanged"}`);
    const checks: string[] = [];
    let itemOk = true;
    const note = (ok: boolean, msg: string): void => {
      checks.push(`${ok ? "ok" : "FAIL"} ${msg}`);
      if (!ok) itemOk = false;
    };
    const clone: Snapshot = JSON.parse(JSON.stringify(it.snapshot)) as Snapshot;
    const twice = analyze(clone, id);
    note(JSON.stringify(twice) === JSON.stringify(again), "recompute deterministic on a deep copy");
    const reversed: Snapshot = { ...JSON.parse(JSON.stringify(it.snapshot)) as Snapshot, entries: [...it.snapshot.entries].reverse() };
    const permuted = analyze(reversed, `${id}:permuted`);
    const canon = (r: TriageResult): string => JSON.stringify({
      a: r.assignments,
      n: (r as unknown as Record<string, unknown>).nextSelection ?? null,
      v: r.verdicts.map((v) => [v.basename, v.verdict, v.episode ?? null]),
    });
    note(canon(permuted) === canon(again), "permutation-stable canonical results");
    const keys = Object.keys(again.assignments);
    const vals = Object.values(again.assignments);
    note(keys.every((k) => /^\d+$/.test(k)), "assignment keys are ordinals");
    note(new Set(vals).size === vals.length, "assignments one-to-one");
    const known = new Set(it.snapshot.entries.map((e) => e.basename));
    note(vals.every((v) => known.has(v)), "assignments name known files");
    const invalid = new Set(it.snapshot.entries.filter((e) => e.changedBetweenStats === true || (e.errors?.length ?? 0) > 0).map((e) => e.basename));
    note(!vals.some((v) => invalid.has(v)), "no invalid file accepted");
    const sel = (again as TriageResult).nextSelection;
    const selWellFormed = sel === null ||
      (Number.isInteger(sel.episode) && sel.episode > 0 && sel.basename.length > 0);
    note(selWellFormed, "nextSelection well-formed or explicit null");
    note(sel === null || again.assignments[String(sel.episode)] === sel.basename, "nextSelection matches a published assignment");
    note(sel === null || (known.has(sel.basename) && !invalid.has(sel.basename)), "nextSelection names a stable known file");
    note(typeof again.nextReason === "string" && again.nextReason.length > 0, "nextReason present");
    if (sel !== null) console.log(`  next: episode ${sel.episode} file ${sel.basename}`);
    else console.log(`  next: abstain (${again.nextReason})`);
    for (const c of checks) console.log(`  ${c}`);
    if (!itemOk) allOk = false;
    payload.push({ ...(it as object), oldResult: it.result, result: again, drifted, newChecks: checks });
    blocks.push({
      id: `replay-${id}`,
      title: id,
      description: `recompute of the recorded historical snapshot with the current pending-first analyze(). Old verdicts ${drifted ? "legitimately drifted (recorded under oldResult)" : "unchanged"}; new-result consistency checks: ${checks.filter((c) => c.startsWith("ok")).length}/${checks.length} pass.`,
      snapshot: it.snapshot,
      result: again,
    });
  }
  const bundle = await bundleCore();
  const html = buildReport(
    recompute
      ? "Episode-recognition triage PoC — recompute (pending-first)"
      : "Episode-recognition triage PoC — replay",
    recompute
      ? "Do the recorded historical snapshots resolve to useful next files under the current pending-first rules, with old-vs-new drift recorded honestly?"
      : "Does re-running analyze() over recorded snapshots reproduce the recorded verdicts exactly?",
    blocks,
    bundle,
  );
  writeOutputs(flag("--json"), flag("--out"), { snapshots: payload }, html);
  if (has("--validate") && !allOk) fail(["replay validation FAILED"]);
  console.log("replay validation passed");
}

const mode = args[0];
if (mode === "--demo") await cmdDemo();
else if (mode === "--samples") await cmdSamples();
else if (mode === "--replay") await cmdReplay();
else {
  fail(["usage:", "  bun tools/episode-triage-poc/run.ts --demo [--validate] --out <html> --json <json>", "  bun tools/episode-triage-poc/run.ts --samples --out <html> --json <json>", "  bun tools/episode-triage-poc/run.ts --replay <json> [--validate] --out <html> --json <json>"]);
}
