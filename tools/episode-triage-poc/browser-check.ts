/** PROTOTYPE — disposable, NOT PRODUCTION. Offline Edge/CDP semantic interaction check. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { ordinalCandidates, parseLabel } from "./parse.ts";
import { bannerOk, captureSelectorClip, dirOf, leafOf, pageState, rowsMatch, watchedSet, type PageState } from "./browser-check-helpers.ts";

const ART = "tools/episode-triage-poc/artifacts";
const PROFILE = join(ART, ".edge-profile");
const SUMMARY = join(ART, "browser-check-summary.json");
const DEADLINE_MS = 180_000;

interface ControlResult {
  [k: string]: unknown;
}
interface FileCheck {
  readonly file: string;
  loaded: boolean;
  expectedTabs: number;
  tabsClicked: number;
  tabsVerified: boolean;
  perTabSemantic: Record<string, unknown>;
  baselineDeterministic: boolean;
  rowsValidated: boolean;
  nextBanner: ControlResult;
  nextBannerShot: ControlResult;
  mask: ControlResult;
  tie: ControlResult;
  recreate: ControlResult;
  restoreExact: boolean[];
  evidence: ControlResult;
  jsExceptions: string[];
  consoleErrors: string[];
  externalRequests: string[];
}

/** Locate Windows Edge; known install locations only, no install attempts. */
function findEdge(): string | null {
  const cands = [
    process.env.EDGE_PATH,
    process.env["PROGRAMFILES(X86)"] ? `${process.env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe` : undefined,
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe` : undefined,
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe` : undefined,
  ];
  for (const c of cands) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolveP, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${what}`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolveP(v);
    }, (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

/** Minimal CDP client over Bun's builtin WebSocket. */
class Cdp {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, { ok: (v: unknown) => void; bad: (e: Error) => void }>();
  readonly events: Array<{ method: string; params: unknown }> = [];
  opened: Promise<void>;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.opened = new Promise<void>((resolveP, reject) => {
      this.ws.addEventListener("open", () => resolveP(), { once: true });
      this.ws.addEventListener("error", () => reject(new Error("cdp websocket error")), { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      let msg: { id?: number; method?: string; params?: unknown; error?: unknown; result?: unknown };
      try {
        msg = JSON.parse(String((ev as MessageEvent).data));
      } catch {
        return;
      }
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          if (msg.error) p.bad(new Error(`cdp: ${JSON.stringify(msg.error)}`));
          else p.ok(msg.result);
        }
      } else if (msg.method) {
        this.events.push({ method: msg.method, params: msg.params });
      }
    });
  }

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    return new Promise<unknown>((ok, bad) => {
      this.pending.set(id, { ok, bad });
      this.ws.send(JSON.stringify({ id, method, params: params ?? {} }));
    });
  }

  async evaluate(expr: string): Promise<unknown> {
    const r = await this.send("Runtime.evaluate", { expression: expr, returnByValue: true }) as {
      result?: { value?: unknown };
      exceptionDetails?: unknown;
    };
    if (r.exceptionDetails) throw new Error(`page exception: ${JSON.stringify(r.exceptionDetails).slice(0, 300)}`);
    return r.result?.value;
  }

  close(): void {
    this.ws.close();
  }
}

async function poll(expr: () => Promise<boolean>, ms: number, step = 250): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await expr()) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, step));
  }
  return false;
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  // Optional `--output-prefix <name>`: summary becomes
  // `artifacts/<name>-summary.json` and screenshots become
  // `artifacts/browser-check-<name>-<report>.png`, so prefixed runs never
  // overwrite prior browser-check-summary.json / browser-check-*.png.
  const prefixIdx = rawArgs.indexOf("--output-prefix");
  let prefix: string | null = null;
  if (prefixIdx >= 0) {
    prefix = rawArgs[prefixIdx + 1] ?? null;
    if (prefix === null || prefix.startsWith("--")) {
      console.error("browser-check: --output-prefix <name> required");
      process.exit(1);
    }
  }
  const files = rawArgs.filter((a, i) => i !== prefixIdx && i !== prefixIdx + 1 && !a.startsWith("--")).map((f) => resolve(f));
  if (files.length === 0) {
    console.error("usage: bun tools/episode-triage-poc/browser-check.ts <report.html> [...] [--output-prefix <name>]");
    process.exit(1);
  }
  const summaryPath = prefix === null ? SUMMARY : join(ART, `${prefix}-summary.json`);
  const shotName = (reportFile: string): string => prefix === null
    ? `browser-check-${reportFile.replace(/\.html$/, "")}.png`
    : `browser-check-${prefix}-${reportFile.replace(/\.html$/, "")}.png`;
  const bannerShotName = (reportFile: string): string => prefix === null
    ? `browser-check-${reportFile.replace(/\.html$/, "")}-nextbanner.png`
    : `browser-check-${prefix}-${reportFile.replace(/\.html$/, "")}-nextbanner.png`;
  for (const f of files) {
    if (!existsSync(f) || !f.startsWith(resolve(ART))) {
      console.error(`browser-check: refusing non-artifact file ${f}; file:// offline reports only`);
      process.exit(1);
    }
  }
  const edge = findEdge();
  if (!edge) {
    console.error("browser-check UNAVAILABLE: msedge.exe not found in known locations and EDGE_PATH unset; no install attempted");
    process.exit(1);
  }
  mkdirSync(PROFILE, { recursive: true });
  try {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(join(resolve(PROFILE), "DevToolsActivePort"));
  } catch { /* fresh profile */ }
  const deadline = setTimeout(() => {
    console.error("browser-check: global deadline exceeded");
    process.exit(1);
  }, DEADLINE_MS);

  const proc = Bun.spawn([edge, "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${resolve(PROFILE)}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-networking", "--disable-sync", "about:blank"], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const checks: FileCheck[] = [];
  const failures: string[] = [];
  try {
    const portFile = join(resolve(PROFILE), "DevToolsActivePort");
    const gotPort = await poll(async () => existsSync(portFile), 15_000);
    if (!gotPort) throw new Error("DevToolsActivePort never appeared");
    const port = Number(readFileSync(portFile, "utf8").split(/\r?\n/)[0].trim());
    if (!port) throw new Error("DevToolsActivePort unreadable");
    const list = await withTimeout(fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json() as Promise<Array<{ type: string; webSocketDebuggerUrl: string }>>), 10_000, "target list");
    const page = list.find((t) => t.type === "page");
    if (!page) throw new Error("no page target");
    const cdp = new Cdp(page.webSocketDebuggerUrl);
    await withTimeout(cdp.opened, 10_000, "cdp open");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", { urls: ["http://*", "https://*"] });
    await cdp.send("Page.enable");

    for (const f of files) {
      const name = basename(f);
      const check: FileCheck = {
        file: name, loaded: false, expectedTabs: 0, tabsClicked: 0, tabsVerified: false,
        perTabSemantic: {}, baselineDeterministic: false, rowsValidated: false, nextBanner: {}, nextBannerShot: {}, mask: {}, tie: {}, recreate: {},
        restoreExact: [], evidence: {}, jsExceptions: [], consoleErrors: [], externalRequests: [],
      };
      checks.push(check);
      const baseEvents = cdp.events.length;
      const fail = (m: string): void => {
        failures.push(`${name}: ${m}`);
      };
      await cdp.send("Page.navigate", { url: pathToFileURL(f).href });
      check.loaded = await poll(async () =>
        (await cdp.evaluate(`document.readyState === "complete" && typeof REPORT_DATA !== "undefined" && typeof TriageCore !== "undefined"`)) === true, 15_000);
      if (!check.loaded) {
        fail("page never settled with REPORT_DATA + TriageCore");
        continue;
      }
      const tabCount = Number(await cdp.evaluate(`document.querySelectorAll(".tab").length`));
      // Tab count is derived from the report's own embedded case list, not a
      // hardcoded number: every embedded case must have exactly one working tab.
      const dataLength = Number(await cdp.evaluate(`REPORT_DATA.length`));
      check.expectedTabs = dataLength;
      if (tabCount !== dataLength) fail(`tab count ${tabCount} != embedded cases ${dataLength}`);
      // Every tab: heading selects its case AND snapshot/result/rows equal
      // the SAME analyze() recompute AND the rendered next banner EQUALS the
      // full expected banner line built from the stored selection (selected:
      // episode+basename+full reason; abstention: full stored reason, never
      // a truncation). Covers Mushoku13 live, guided 13 date-inversion, and
      // unknown-context tabs; controls stay first-tab only.
      let tabsOk = true;
      let tabsSemanticOk = true;
      const perTab: Array<Record<string, unknown>> = [];
      for (let i = 0; i < tabCount; i++) {
        await cdp.evaluate(`document.querySelectorAll(".tab")[${i}].click()`);
        const got = await cdp.evaluate(`({ h: document.querySelector("#case h3") ? document.querySelector("#case h3").textContent : "",
          id: REPORT_DATA[idx].id, n: REPORT_DATA[idx].result.verdicts.length,
          rows: document.querySelectorAll("#case table tr").length - 1 })`) as { h: string; id: string; n: number; rows: number };
        check.tabsClicked++;
        const headed = String(got.h).startsWith(String(got.id)) && got.n === got.rows;
        if (!headed) tabsOk = false;
        const st = await pageState(cdp);
        const rec = await cdp.evaluate(`({ snap: REPORT_DATA[${i}].snapshot, result: REPORT_DATA[${i}].result, id: REPORT_DATA[${i}].id })`) as {
          snap: unknown; id: string; result: {
            verdicts: unknown; assignments: unknown; nextSelection: { episode: number; basename: string } | null; nextReason: string;
          };
        };
        const rr = st.res as unknown as { verdicts: unknown; assignments: unknown; nextSelection: { episode: number; basename: string } | null; nextReason: string };
        const snapSame = JSON.stringify(st.snap) === JSON.stringify(rec.snap);
        const verdictsSame = JSON.stringify(rr.verdicts) === JSON.stringify(rec.result.verdicts);
        const assignSame = JSON.stringify(rr.assignments) === JSON.stringify(rec.result.assignments);
        const selSame = JSON.stringify(rr.nextSelection) === JSON.stringify(rec.result.nextSelection);
        const reasonSame = rr.nextReason === rec.result.nextReason;
        const rowsOk = rowsMatch(st);
        const banner = String(await cdp.evaluate(`document.getElementById("nextsel") ? document.getElementById("nextsel").textContent : ""`));
        const bannerGood = bannerOk(rec.result, rr, banner);
        const tabOk = headed && snapSame && verdictsSame && assignSame && selSame && reasonSame && rowsOk && bannerGood;
        perTab.push({ id: rec.id, headed, snapSame, verdictsSame, assignSame, selSame, reasonSame, rowsOk, bannerGood });
        if (!tabOk) tabsSemanticOk = false;
      }
      check.tabsVerified = tabsOk && tabsSemanticOk && check.tabsClicked === check.expectedTabs && check.expectedTabs > 0;
      check.perTabSemantic = { total: perTab.length, passed: perTab.filter((p) => p.headed === true && p.snapSame === true && p.verdictsSame === true && p.assignSame === true && p.selSame === true && p.reasonSame === true && p.rowsOk === true && p.bannerGood === true).length, details: perTab };
      if (!check.tabsVerified) fail(`tab heading/row/semantic validation failed: ${JSON.stringify(perTab)}`);
      // Semantic suite runs on the first (Slime-like, 24-entry) case.
      await cdp.evaluate(`document.querySelectorAll(".tab")[0].click()`);
      const base = await pageState(cdp);
      const recorded = await cdp.evaluate(`REPORT_DATA[0].result`) as unknown;
      check.baselineDeterministic = JSON.stringify((base.res as unknown as { verdicts: unknown }).verdicts) ===
        JSON.stringify((recorded as { verdicts: unknown }).verdicts);
      if (!check.baselineDeterministic) fail("browser recompute differs from recorded CLI result");
      check.rowsValidated = rowsMatch(base);
      if (!check.rowsValidated) fail("baseline rendered rows differ from recomputed verdicts");
      // Next-selection banner on the first case, via the shared helper.
      {
        const rec = recorded as { nextSelection: { episode: number; basename: string } | null; nextReason: string };
        const rr = base.res as unknown as { nextSelection: { episode: number; basename: string } | null };
        const banner = String(await cdp.evaluate(`document.getElementById("nextsel") ? document.getElementById("nextsel").textContent : ""`));
        const good = bannerOk(rec, rr, banner);
        check.nextBanner = { selectionSame: JSON.stringify(rr.nextSelection) === JSON.stringify(rec.nextSelection), bannerNamesSelection: good, selected: rr.nextSelection };
        if (!good) fail("next banner does not name the recorded selection");
      }
      const baseSnap = JSON.stringify(base.snap);
      const baseRes = JSON.stringify(base.res);
      const baseHtml = base.html;
      const restore = async (): Promise<PageState> => {
        await cdp.evaluate(`document.getElementById("ctl-restore").click()`);
        return pageState(cdp);
      };
      const assertRestore = (s: PageState, where: string): void => {
        const exact = s.workingNull && JSON.stringify(s.snap) === baseSnap &&
          JSON.stringify(s.res) === baseRes && s.html === baseHtml;
        check.restoreExact.push(exact);
        if (!exact) fail(`restore after ${where} not exactly equal to baseline`);
      };
      // MASK (pending-only): watched anchors keep names/tags/paths, pending
      // files become non-numeric opaque aliases; every timestamp/size stays
      // identical and rendered fields match the recomputed result.
      await restore();
      await cdp.evaluate(`document.getElementById("ctl-mask").click()`);
      {
        const s = await pageState(cdp);
        const beforeByBase = new Map(base.snap.entries.map((e) => [String(e.basename), e]));
        const watched = watchedSet(
          base.snap.entries.map((e) => ({ basename: String(e.basename) })),
          (base.snap as unknown as { context?: { progress?: unknown } }).context?.progress,
        );
        const watchedKept = [...watched].every((b) => {
          const now = s.snap.entries.find((e) => String(e.basename) === b) as Record<string, unknown> | undefined;
          return now !== undefined && JSON.stringify(now) === JSON.stringify(beforeByBase.get(b));
        });
        const masked = s.snap.entries.filter((e) => !watched.has(String(e.basename)));
        const stems = masked.map((e) => String(e.basename).slice(0, String(e.basename).lastIndexOf(".")));
        const offenders = masked
          .map((e) => String(e.basename))
          .filter((b) => ordinalCandidates(parseLabel(b)).length > 0);
        const dirsBefore = base.snap.entries.map((e) => dirOf(String(e.path))).sort();
        const dirsAfter = s.snap.entries.map((e) => dirOf(String((e as unknown as Record<string, unknown>).path))).sort();
        const leafSame = s.snap.entries.every((e) => leafOf(String((e as unknown as Record<string, unknown>).path)) === String(e.basename));
        const tsSame = (k: string): boolean => JSON.stringify(base.snap.entries.map((e) => e[k])) ===
          JSON.stringify(s.snap.entries.map((e) => (e as Record<string, unknown>)[k]));
        const verdictByBase = (list: Array<Record<string, unknown>>): Map<string, string> =>
          new Map(list.map((v) => [String(v.basename), JSON.stringify(v)]));
        const baseVerdicts = verdictByBase(base.res.verdicts as Array<Record<string, unknown>>);
        const nowVerdicts = verdictByBase(s.res.verdicts as Array<Record<string, unknown>>);
        const watchedVerdictsSame = [...watched].filter((b) => nowVerdicts.get(b) === baseVerdicts.get(b)).length;
        const overallChanged = JSON.stringify(s.res.verdicts) !== JSON.stringify(base.res.verdicts);
        // Next-selection preservation: the resolved selection must still name
        // the masked row with the same episode ordinal as the pre-control one.
        const preSel = base.res.nextSelection;
        const postSel = s.res.nextSelection;
        const baseBases = new Set(base.snap.entries.map((e) => String(e.basename)));
        const nextEpisodeSame = preSel !== null && postSel !== null && preSel.episode === postSel.episode;
        const nextNamesMaskedRow = postSel !== null && !baseBases.has(postSel.basename);
        check.mask = {
          count: s.snap.entries.length,
          watchedCount: watched.size,
          maskedCount: masked.length,
          watchedAnchorsKept: watchedKept,
          pathLeafIsAlias: leafSame,
          noDigitsInMaskedStems: stems.every((t) => !/\d/.test(t)),
          noEpisodeTagsOnMasked: masked.every((e) => !("episodeTags" in (e as Record<string, unknown>))),
          opaqueLabels: offenders.length === 0,
          offenders,
          pathDirsKept: JSON.stringify(dirsBefore) === JSON.stringify(dirsAfter),
          creationUnchanged: tsSame("birthNs"),
          mtimeUnchanged: tsSame("mtimeNs"),
          sizeUnchanged: tsSame("sizeBytes"),
          renderedMatch: rowsMatch(s),
          watchedVerdictsSame: `${watchedVerdictsSame}/${watched.size}`,
          overallChanged,
          nextEpisodeSame,
          nextNamesMaskedRow,
        };
        const m = check.mask;
        if (!(m.watchedAnchorsKept && m.pathLeafIsAlias && m.noDigitsInMaskedStems && m.noEpisodeTagsOnMasked && m.opaqueLabels &&
          m.pathDirsKept && m.creationUnchanged && m.mtimeUnchanged && m.sizeUnchanged && m.renderedMatch &&
          watchedVerdictsSame === watched.size && m.overallChanged === true &&
          m.nextEpisodeSame === true && m.nextNamesMaskedRow === true)) {
          fail(`mask not semantic: ${JSON.stringify(m)}`);
        }
        assertRestore(await restore(), "mask");
      }
      // TIE: timestamps actually equal, intervals visible, ranks changed.
      await restore();
      await cdp.evaluate(`document.getElementById("ctl-tie").click()`);
      {
        const s = await pageState(cdp);
        const births = s.snap.entries.map((e) => String(e.birthNs));
        const mtimes = s.snap.entries.map((e) => String(e.mtimeNs));
        const ranks = s.res.verdicts.map((v) => String(v.birthRank));
        const baseRanks = base.res.verdicts.map((v) => String(v.birthRank));
        check.tie = {
          count: births.length,
          birthTimestampsEqual: births.length > 0 && births.every((b) => b === births[0]),
          mtimeTimestampsEqual: mtimes.length > 0 && mtimes.every((b) => b === mtimes[0]),
          intervalsVisible: ranks.length > 0 && ranks.every((r) => r.includes("interval")),
          ranksChanged: ranks.some((r, i) => r !== baseRanks[i]),
          renderedMatch: rowsMatch(s),
        };
        const t = check.tie;
        if (!(t.birthTimestampsEqual && t.mtimeTimestampsEqual && t.intervalsVisible && t.ranksChanged && t.renderedMatch)) {
          fail(`tie not semantic: ${JSON.stringify(t)}`);
        }
        assertRestore(await restore(), "tie");
      }
      // RECREATE: chosen creation increases, rest identical, evidence ns updates.
      await restore();
      await cdp.evaluate(`document.getElementById("ctl-recreate").click()`);
      {
        const s = await pageState(cdp);
        const n = base.snap.entries.length;
        const target = String(base.snap.entries[n - 1].basename);
        const oldNs = String(base.snap.entries[n - 1].birthNs);
        const now = s.snap.entries.find((e) => String(e.basename) === target) as Record<string, unknown> | undefined;
        const newNs = now ? String(now.birthNs) : "";
        const othersSame = base.snap.entries.slice(0, n - 1).every((e, i) =>
          JSON.stringify(e) === JSON.stringify(s.snap.entries.find((x) => String(x.basename) === String(e.basename))));
        const targetRestSame = now !== undefined && String(now.mtimeNs) === String(base.snap.entries[n - 1].mtimeNs) &&
          String(now.sizeBytes) === String(base.snap.entries[n - 1].sizeBytes);
        const evText = String(await cdp.evaluate(`Array.from(document.querySelectorAll('#case table tr')).slice(1).map(function(tr){
          return tr.children[0].textContent + '|' + tr.children[5].textContent; }).join('\\n')`));
        check.recreate = {
          target,
          increased: newNs !== "" && oldNs !== "" && BigInt(newNs) > BigInt(oldNs),
          otherEntriesUnchanged: othersSame,
          targetOtherFieldsUnchanged: targetRestSame,
          evidenceShowsNewNs: newNs !== "" && evText.includes(newNs),
          nextUnchanged: JSON.stringify(s.res.nextSelection) === JSON.stringify(base.res.nextSelection),
        };
        const r = check.recreate;
        if (!(r.increased && r.otherEntriesUnchanged && r.targetOtherFieldsUnchanged && r.evidenceShowsNewNs && r.nextUnchanged)) {
          fail(`recreate not semantic: ${JSON.stringify({ target: r.target, increased: r.increased, others: r.otherEntriesUnchanged, rest: r.targetOtherFieldsUnchanged, ev: r.evidenceShowsNewNs, next: r.nextUnchanged })}`);
        }
        assertRestore(await restore(), "recreate");
      }
      // EVIDENCE: open one file detail, prove visible body with actual support.
      {
        await cdp.evaluate(`(function(){ var tr = document.querySelectorAll('#case table tr')[1];
          tr.querySelector('summary').click(); tr.scrollIntoView({block:'center'}); })()`);
        const det = await cdp.evaluate(`(function(){ var tr = document.querySelectorAll('#case table tr')[1];
          var d = tr.querySelector('details'); return { open: d.open, text: d.textContent }; })()`) as { open: boolean; text: string };
        const firstSupport = String((recorded as { verdicts: Array<{ support: string[] }> }).verdicts[0].support[0]).slice(0, 48);
        check.evidence = {
          opened: det.open === true,
          bodyChars: String(det.text).length,
          supportVisible: String(det.text).includes(firstSupport),
        };
        try {
          const shot = await cdp.send("Page.captureScreenshot", { format: "png" }) as { data?: string };
          if (shot.data) {
            const png = join(ART, shotName(name));
            writeFileSync(png, Buffer.from(shot.data, "base64"));
            (check.evidence as Record<string, unknown>).screenshot = basename(png);
          }
        } catch {
          fail(`${name}: screenshot failed`);
        }
        const e = check.evidence;
        if (!(e.opened && (e.bodyChars as number) > 100 && e.supportVisible)) fail("evidence detail not observable");
      }
      // Dedicated cropped next-banner shot per report (first tab, recorded
      // result), so a human can see the full selected/abstention line.
      await cdp.evaluate(`document.querySelectorAll(".tab")[0].click()`);
      const bannerPng = join(ART, bannerShotName(name));
      const clip = await captureSelectorClip(cdp, "#nextsel", bannerPng);
      check.nextBannerShot = { file: basename(bannerPng), ...clip };
      if (!clip.ok) fail(`next-banner screenshot failed: ${clip.detail}`);
      for (const ev of cdp.events.slice(baseEvents)) {
        if (ev.method === "Runtime.exceptionThrown") {
          check.jsExceptions.push(JSON.stringify(ev.params).slice(0, 300));
        } else if (ev.method === "Runtime.consoleAPICalled") {
          const p = ev.params as { type?: string; args?: Array<{ value?: unknown }> };
          if (p.type === "error") check.consoleErrors.push(JSON.stringify(p.args).slice(0, 300));
        } else if (ev.method === "Log.entryAdded") {
          const p = ev.params as { entry?: { level?: string; text?: string } };
          if (p.entry?.level === "error") check.consoleErrors.push(String(p.entry.text).slice(0, 300));
        } else if (ev.method === "Network.requestWillBeSent") {
          const p = ev.params as { request?: { url?: string } };
          if (p.request?.url?.startsWith("http")) check.externalRequests.push(p.request.url);
        }
      }
      if (check.jsExceptions.length > 0) fail(`${check.jsExceptions.length} JS exceptions`);
      if (check.consoleErrors.length > 0) fail(`console errors: ${check.consoleErrors.join("; ")}`);
      if (check.externalRequests.length > 0) fail(`external requests: ${check.externalRequests.join(", ")}`);
    }
    cdp.close();
  } catch (err) {
    failures.push(err instanceof Error ? err.message : String(err));
  } finally {
    try {
      proc.kill();
    } catch { /* already exited */ }
    await withTimeout(proc.exited, 10_000, "edge exit").catch(() => {
      try {
        proc.kill(9);
      } catch { /* ignore */ }
    });
    clearTimeout(deadline);
  }
  const summary = { available: true, edge, outputPrefix: prefix, controlsScope: "mask/tie/recreate/restore controls run on the first tab only; every tab gets heading/snapshot/result/rows/full-banner semantics; one cropped next-banner screenshot per report", checks, failures };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) process.exit(1);
  console.log("browser-check passed");
}

await main();
