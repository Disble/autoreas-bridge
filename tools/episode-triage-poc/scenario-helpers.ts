/** PROTOTYPE — disposable, NOT PRODUCTION. Pure synthetic snapshot builders for guided cases. */
import type { ObservedEntry } from "./types.ts";

const H = 3_600_000_000_000n; // one hour in ns
const BASE = 1_757_890_000_000_000_000n; // fixed synthetic clock, ns
/** Fixed synthetic clock reading h hours after BASE, as an ns string. */
const ns = (h: number): string => (BASE + BigInt(h) * H).toString();

/** One synthetic observed entry with hour-offset creation/modification times. */
export function entry(
  basename: string,
  birthH: number | null,
  mtimeH: number | null,
  extra?: Partial<ObservedEntry>,
): ObservedEntry {
  return {
    path: `synthetic/${basename}`,
    basename,
    sizeBytes: "1000",
    birthNs: birthH === null ? null : ns(birthH),
    mtimeNs: mtimeH === null ? null : ns(mtimeH),
    ...extra,
  };
}

/** Declared complete-prefix convention shared by convention-bearing scenarios. */
export const PREFIX = { completePrefixFrom1: true, noGaps: true, noExtras: true, label: "explicit-initial-prefix" } as const;

/** 24-entry Slime-like set; last file carries a different stem but ordinal 24. */
export function slimeEntries(lastName: string): ObservedEntry[] {
  const out: ObservedEntry[] = [];
  for (let i = 1; i <= 23; i++) {
    const n = String(i).padStart(2, "0");
    out.push(entry(`slime-s4-${n}.mp4`, i, i));
  }
  out.push(entry(lastName, 24, 24));
  return out;
}

/** 12 canonical + 2 distinct-alternate-tail Mushoku-like set. */
export function mushokuEntries(): ObservedEntry[] {
  const out: ObservedEntry[] = [];
  for (let i = 1; i <= 12; i++) {
    out.push(entry(`mushoku-iii-${String(i).padStart(2, "0")}.mp4`, i, i));
  }
  out.push(entry(`Mushoku Tensei III alt-release - 13.mp4`, 13, 13));
  out.push(entry(`totally-different-fansub-title-14.mp4`, 14, 14));
  return out;
}

/** Yani-like 11-entry set; episode-10 file recreated after 11 (birth later, mtime retained). */
export function yaniEntries(): ObservedEntry[] {
  const out: ObservedEntry[] = [];
  for (let i = 1; i <= 9; i++) out.push(entry(`yani-${String(i).padStart(2, "0")}.mp4`, i, i));
  out.push(entry("yani-10.mp4", 30, 10)); // recreated: birth later, mtime retained
  out.push(entry("yani-11.mp4", 11, 11));
  return out;
}

/** Watched 1..3 prefix plus one opaque pending leaf (single-pending-elimination shape). */
export function prefixWatchedPlusOpaque(opaqueName: string): ObservedEntry[] {
  return [
    entry("prefix-01.mp4", 1, 1),
    entry("prefix-02.mp4", 2, 2),
    entry("prefix-03.mp4", 3, 3),
    entry(opaqueName, 4, 4),
  ];
}
