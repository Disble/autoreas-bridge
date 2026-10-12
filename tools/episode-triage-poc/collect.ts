/** PROTOTYPE — disposable, NOT PRODUCTION. Read-only Windows observation adapter. */
import { readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import type { ObservedEntry } from "./types.ts";
import { VIDEO_EXTS } from "./parse.ts";

export interface CaptureDiagnostics {
  readonly dir: string;
  readonly messages: string[];
}

/** Read immediate root regular video files only. No recursion, no writes. */
export function captureDir(dir: string): { entries: ObservedEntry[]; diag: CaptureDiagnostics } {
  const messages: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (err) {
    return { entries: [], diag: { dir, messages: [`readdir failed: ${msg(err)}`] } };
  }
  const ordered = [...names].sort();
  const entries: ObservedEntry[] = [];
  for (const name of ordered) {
    const p = join(dir, name);
    let st: ReturnType<typeof statSync> | null = null;
    try {
      st = statSync(p, { bigint: true });
    } catch (err) {
      entries.push({
        path: p,
        basename: name,
        sizeBytes: null,
        birthNs: null,
        mtimeNs: null,
        errors: [`stat failed: ${msg(err)}`],
      });
      continue;
    }
    if (!st.isFile()) continue;
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    if (!VIDEO_EXTS.has(ext)) continue;
    // Actual Windows creation time via birthtimeNs. Never POSIX ctime, never
    // silent mtime substitution: failures stay null with an explicit error.
    let birth: string | null = null;
    const errs: string[] = [];
    try {
      const b = (st as unknown as { birthtimeNs: bigint }).birthtimeNs;
      birth = typeof b === "bigint" ? b.toString() : null;
      if (birth === null) errs.push("birthtimeNs unavailable on this filesystem");
    } catch (err) {
      errs.push(`birthtime read failed: ${msg(err)}`);
    }
    const mtime = (st.mtimeNs as unknown as bigint)?.toString() ?? null;
    const size = (st.size as unknown as bigint)?.toString() ?? null;
    // Before/after stat: detect files that changed while listing.
    let changed = false;
    try {
      const again = statSync(p, { bigint: true });
      if (again.size !== st.size || again.mtimeNs !== st.mtimeNs) {
        changed = true;
        errs.push("file changed during capture (size/mtime differ before/after)");
      }
    } catch {
      changed = true;
      errs.push("re-stat failed; stability unknown");
    }
    entries.push({
      path: p,
      basename: basename(p),
      sizeBytes: size,
      birthNs: birth,
      mtimeNs: mtime,
      errors: errs.length ? errs : undefined,
      changedBetweenStats: changed ? true : undefined,
    });
  }
  return { entries, diag: { dir, messages } };
}

/**
 * Resolve one of the previously discussed anime folders under D:/Anime by
 * reading directory names. Returns null with a reason instead of guessing.
 */
export function resolveSampleDir(kind: string): { dir: string | null; reason: string } {
  const root = "D:/Anime";
  let names: string[];
  try {
    names = readdirSync(root);
  } catch (err) {
    return { dir: null, reason: `cannot list ${root}: ${msg(err)}` };
  }
  const match = (pred: (n: string) => boolean): string[] => names.filter(pred);
  if (kind === "slime") {
    const want = "Tensei shitara Slime Datta Ken 4th Season";
    return names.includes(want)
      ? { dir: join(root, want), reason: "exact match" }
      : { dir: null, reason: `exact Slime folder missing under ${root}` };
  }
  if (kind === "mushoku") {
    const want = "Mushoku Tensei III Isekai Ittara Honki Dasu";
    return names.includes(want)
      ? { dir: join(root, want), reason: "exact match" }
      : { dir: null, reason: `exact Mushoku folder missing under ${root}` };
  }
  if (kind === "yani") {
    // Unique exact-title-prefix match; never fall back to an unrelated folder.
    const cands = match((n) => n.toLowerCase().startsWith("yani") || n.toLowerCase().includes("yani neko"));
    const uniq = [...new Set(cands)];
    if (uniq.length === 1) return { dir: join(root, uniq[0]), reason: `unique Yani prefix: ${uniq[0]}` };
    return { dir: null, reason: `Yani Neko folder ambiguous/missing (candidates: ${uniq.join("; ") || "none"})` };
  }
  if (kind === "datealive") {
    const cands = match((n) => {
      const l = n.toLowerCase();
      return l.includes("date a live") && (l.includes("iii") || n.includes("Ⅲ") || l.includes("3rd") || l.includes("third"));
    });
    const uniq = [...new Set(cands)];
    if (uniq.length === 1) return { dir: join(root, uniq[0]), reason: `unique DateALive III: ${uniq[0]}` };
    return { dir: null, reason: `Date a Live III ambiguous/missing (candidates: ${uniq.join("; ") || "none"})` };
  }
  return { dir: null, reason: `unknown sample kind ${kind}` };
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
