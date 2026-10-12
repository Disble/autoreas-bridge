/** PROTOTYPE — disposable, NOT PRODUCTION. Offline checker helpers (no triage logic). */
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import { ordinalCandidates, parseLabel } from "./parse.ts";

/** Active page snapshot/result/rows captured from the report shell. */
export interface PageState {
  readonly snap: { entries: Array<Record<string, unknown>> };
  readonly res: {
    verdicts: Array<Record<string, unknown>>;
    assignments: unknown;
    pendingCompatibility: unknown;
    globalNotes: unknown;
    globalAssumptions: unknown;
    nextSelection: { episode: number; basename: string } | null;
    nextReason: string;
  };
  readonly rows: string[][];
  readonly free: string;
  readonly workingNull: boolean;
  readonly html: string;
}

/**
 * Watched set under the SAME rule as the report shell and the core: a
 * single clear ordinal at or below integer progress is already-watched
 * context and keeps its name; everything else is pending and maskable.
 */
export function watchedSet(entries: Array<{ basename: string }>, progress: unknown): Set<string> {
  const out = new Set<string>();
  const prog = typeof progress === "number" && Number.isInteger(progress) && progress >= 0 ? progress : null;
  if (prog === null) return out;
  for (const e of entries) {
    const ords = ordinalCandidates(parseLabel(e.basename));
    if (ords.length === 1 && ords[0] <= prog) out.add(e.basename);
  }
  return out;
}

/** Rendered rows must equal the actual recomputed verdicts field by field. */
export function rowsMatch(s: PageState): boolean {
  if (s.rows.length !== s.res.verdicts.length) return false;
  return s.res.verdicts.every((v, i) => {
    const r = s.rows[i];
    return r[0] === String(v.basename) && r[1] === String(v.verdict) &&
      r[2] === (v.episode === undefined || v.episode === null ? "" : String(v.episode)) &&
      r[3] === ((v.alternatives as unknown[] | undefined) ?? []).join(",") &&
      r[4] === `${v.birthRank} / ${v.mtimeRank}`;
  });
}

/**
 * Full expected next-banner line, mirroring the report shell's banner
 * format byte for byte as textContent sees it (<br> contributes no text,
 * the space after the abstention heading is a real text node). The selected
 * form names episode+basename then carries the FULL stored reason; the
 * abstention form carries the FULL stored reason, never a truncation.
 * Compared with strict equality, not substrings.
 */
export function expectedBannerText(
  nextSelection: { episode: number; basename: string } | null,
  nextReason: string,
): string {
  if (nextSelection !== null) {
    return `Actual next: episode ${nextSelection.episode} — ${nextSelection.basename}${nextReason}`;
  }
  return `No next selection. ${nextReason}`;
}

/**
 * Next banner must equal the full expected banner line built from the
 * STORED selection (episode+basename+full reason when selected, full stored
 * reason when abstaining), and the recomputed selection must match stored.
 */
export function bannerOk(
  recorded: { nextSelection: { episode: number; basename: string } | null; nextReason: string },
  recomputed: { nextSelection: { episode: number; basename: string } | null },
  banner: string,
): boolean {
  const same = JSON.stringify(recomputed.nextSelection) === JSON.stringify(recorded.nextSelection);
  if (!same) return false;
  return banner === expectedBannerText(recorded.nextSelection, recorded.nextReason);
}

/** Directory part of a display path ("" when bare). Handles / and \\ separators. */
export function dirOf(p: string): string {
  const slash = p.lastIndexOf("/");
  const back = p.lastIndexOf("\\");
  const cut = slash > back ? slash : back;
  return cut >= 0 ? p.slice(0, cut) : "";
}

/** Leaf part of a display path. Handles / and \\ separators. */
export function leafOf(p: string): string {
  const slash = p.lastIndexOf("/");
  const back = p.lastIndexOf("\\");
  const cut = slash > back ? slash : back;
  return cut >= 0 ? p.slice(cut + 1) : p;
}

/** Minimal page surface used by the moved page-state and clip helpers. */
export interface PageDeps {
  evaluate: (expr: string) => Promise<unknown>;
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

/** Capture the actual active snapshot, recomputed result, and rendered fields. */
export async function pageState(deps: PageDeps): Promise<PageState> {
  return await deps.evaluate(`(function(){
    var snap = working || REPORT_DATA[idx].snapshot;
    var res = TriageCore.analyze(snap, REPORT_DATA[idx].id);
    var rows = Array.from(document.querySelectorAll('#case table tr')).slice(1).map(function(tr){
      return Array.from(tr.children).slice(0,5).map(function(td){ return td.textContent; });
    });
    return { snap: snap, res: res, rows: rows,
      free: document.getElementById('freeplay').textContent,
      workingNull: working === null,
      html: document.getElementById('case').innerHTML };
  })()`) as PageState;
}

/**
 * Cropped screenshot of one selector's bounding box (document-relative
 * coordinates, beyond-viewport capture so scroll position cannot clip it).
 * Returns the written basename on success, never throws.
 */
export async function captureSelectorClip(
  deps: PageDeps,
  selector: string,
  pngPath: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const rect = await deps.evaluate(`(function(){var el=document.querySelector('${selector}');if(!el)return null;el.scrollIntoView({block:'center'});var r=el.getBoundingClientRect();return {x:Math.max(0,Math.round(r.x+window.scrollX)),y:Math.max(0,Math.round(r.y+window.scrollY)),w:Math.round(r.width),h:Math.round(r.height)};})()`) as {
      x: number; y: number; w: number; h: number;
    } | null;
    if (rect === null || rect.w <= 0 || rect.h <= 0) return { ok: false, detail: "banner rect missing" };
    const shot = await deps.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
    }) as { data?: string };
    if (!shot.data) return { ok: false, detail: "empty banner shot" };
    writeFileSync(pngPath, Buffer.from(shot.data, "base64"));
    return { ok: true, detail: basename(pngPath) };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) };
  }
}
