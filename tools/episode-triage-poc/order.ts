/** PROTOTYPE — disposable, NOT PRODUCTION. Pure order helpers (partial-order ranks). */

/** Partial-order rank interval; null means unknown (missing/unreliable). */
export interface Rank {
  readonly lo: number;
  readonly hi: number;
}

/** Render a rank interval for reports. */
export function rankText(r: Rank | null): string {
  return r === null ? "unknown" : r.lo === r.hi ? `rank ${r.lo}` : `rank interval ${r.lo}..${r.hi}`;
}

/**
 * Partial-order rank intervals. Only reliable timestamped entries take part;
 * every unknown (missing or unreliable) widens the range: a group at
 * position p with size g and U unknowns gets [p, p+g-1+U]. Missing stays
 * missing; unreliable stays unreliable.
 */
export function rankIntervals(
  items: Array<{ key: string; ns: string | null }>,
  skip: ReadonlySet<string>,
): Map<string, Rank | null> {
  const out = new Map<string, Rank | null>();
  const present = items.filter((i) => i.ns !== null && !skip.has(i.key)) as Array<{ key: string; ns: string }>;
  present.sort((a, b) => {
    const x = BigInt(a.ns);
    const y = BigInt(b.ns);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const unknown = items.length - present.length;
  let rank = 1;
  for (let i = 0; i < present.length;) {
    let j = i + 1;
    while (j < present.length && BigInt(present[j].ns) === BigInt(present[i].ns)) j++;
    const group = present.slice(i, j);
    // Possible ranks run from p (all unknowns sort after) to p+g-1+U (all before).
    const r: Rank = { lo: rank, hi: rank + group.length - 1 + unknown };
    for (const g of group) out.set(g.key, r);
    rank += group.length;
    i = j;
  }
  for (const it of items) if (!out.has(it.key)) out.set(it.key, null);
  return out;
}
