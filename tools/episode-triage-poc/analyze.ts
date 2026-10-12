/** PROTOTYPE — disposable, NOT PRODUCTION. Pure deterministic triage core (pending-first iteration). */
import { hasAmbiguousMarker, ordinalCandidates, parseLabel } from "./parse.ts";
import {
  inferChronologyOrder,
  inferElimination,
  inferSinglePendingElimination,
  integerProgress,
  isReliable,
  isWatchedOrdinal,
  selectNext,
  unusableExpectedNext,
  usableNext,
} from "./pending.ts";
import type { EntryResult, ObservedEntry, Snapshot, TriageResult, Verdict } from "./types.ts";
import { rankIntervals, rankText } from "./order.ts";

/** Explicit tag ordinals with their raw source kept for visible claims. */
function tagClaims(tags: readonly string[] | undefined): Array<{ raw: string; ordinal: number }> {
  if (!tags) return [];
  const out: Array<{ raw: string; ordinal: number }> = [];
  for (const t of tags) {
    const m = t.trim().match(/^(?:ep|e|episode)?\s*(\d{1,3})$/i);
    if (m) out.push({ raw: t, ordinal: Number(m[1]) });
  }
  return out;
}

/** How an identity proposal was reached; shown in reports, never a probability. */
type Basis = "direct-number" | "recreation" | "rank-context" | "elimination" | "chronology";

/** Working proposal; assignments publish only after the global reconcile pass. */
interface Draft {
  basename: string;
  verdict: Verdict;
  episode?: number;
  basis?: Basis;
  watched?: boolean;
  alternatives?: number[];
  support: string[];
  contradictions: string[];
  assumptions: string[];
  sources: string[];
  birthRank: string;
  mtimeRank: string;
  labelSummary: string;
}

/**
 * Pure deterministic recognition seam. Pending-first: integer progress
 * partitions already-watched context away, clear pending numbers resolve
 * with no global collection gate, one opaque pending file is inferred by
 * elimination, fully opaque pending sets fall back to relative creation
 * chronology. Never mutates its input. See README rule table.
 */
export function analyze(snapshot: Snapshot, scenarioId = "snapshot"): TriageResult {
  const before = JSON.stringify(snapshot.entries);
  const rows = snapshot.entries.map((e) => ({ ...e }));
  rows.sort((a, b) => a.basename < b.basename ? -1 : a.basename > b.basename ? 1 : 0);

  const conv = snapshot.convention;
  const prefixOK = conv !== null &&
    conv.completePrefixFrom1 && conv.noGaps && conv.noExtras;
  const n = rows.length;
  // Validity gate: changed/error captures are observed but never accepted,
  // and their timestamps rank nobody. They still widen other intervals.
  const unreliable = new Set(
    rows.filter((e) => !isReliable(e)).map((e) => e.basename),
  );
  const birthRanks = rankIntervals(rows.map((e) => ({ key: e.basename, ns: e.birthNs })), unreliable);
  const mtimeRanks = rankIntervals(rows.map((e) => ({ key: e.basename, ns: e.mtimeNs })), unreliable);

  const parsed = new Map(rows.map((e) => [e.basename, parseLabel(e.basename)] as const));
  const nameOrds = (e: ObservedEntry): number[] => ordinalCandidates(parsed.get(e.basename)!);
  const allOrds = (e: ObservedEntry): number[] =>
    [...new Set([...nameOrds(e), ...tagClaims(e.episodeTags).map((t) => t.ordinal)])];
  // Duplicate ordinary labels: no two accepted assignments may share one.
  const claimCount = new Map<number, number>();
  for (const e of rows) for (const o of allOrds(e)) claimCount.set(o, (claimCount.get(o) ?? 0) + 1);

  const ctx = snapshot.context ?? {};
  const progress = integerProgress(ctx);
  const next = usableNext(ctx);
  // Disclosure, not silence: a supplied expectedNext that is not a usable
  // positive integer carries no ordinal, so derivation stays on exact
  // integer progress+1 while the reason and the selected file say so.
  const badToken = unusableExpectedNext(ctx);
  const badTokenNote = badToken !== null
    ? `supplied expectedNext ${JSON.stringify(badToken) ?? String(badToken)} was present but not a usable positive integer, so it was not used`
    : null;
  const fractionalProgress = typeof ctx.progress === "number" && !Number.isInteger(ctx.progress);

  const globalNotes: string[] = [];
  const globalAssumptions: string[] = [];

  if (conv === null) {
    globalAssumptions.push(
      "collection convention unknown: no absolute rank=>episode mapping; pending numbers, elimination, and relative pending chronology carry instead",
    );
  } else if (!prefixOK) {
    globalAssumptions.push(
      `convention "${conv.label}" is partial: absolute rank=>episode mapping disabled; pending-first rules carry instead`,
    );
  } else {
    globalAssumptions.push(
      `rank=>episode mapping allowed ONLY under declared convention "${conv.label}" (complete prefix from 1, no gaps, no extras)`,
    );
  }
  if (progress !== null) {
    globalAssumptions.push(
      `watched-first: integer progress ${progress} marks ordinals <= ${progress} as already-watched context; numbered format alone never means watched`,
    );
  } else {
    globalAssumptions.push(
      "no usable integer progress: nothing is marked watched; every file stays pending",
    );
  }
  if (unreliable.size > 0) {
    globalNotes.push(`${unreliable.size} entr${unreliable.size === 1 ? "y" : "ies"} with capture problems (${[...unreliable].join(", ")}): observed but accepted nowhere, ranking nobody`);
  }
  if (fractionalProgress) {
    globalNotes.push(
      `fractional progress ${ctx.progress} never truncates: usable next context is unavailable unless explicit expected-next is supplied`,
    );
  }
  if (typeof ctx.expectedNext === "number" && Number.isInteger(ctx.expectedNext) && ctx.expectedNext > 0) {
    globalNotes.push(`context expected-next ${ctx.expectedNext} defines what the user expects; it is not evidence that any file IS it`);
  }

  // Structural missing-slot / elimination hypotheses under convention.
  if (prefixOK) {
    const claimed = new Set<number>();
    for (const e of rows) for (const o of allOrds(e)) claimed.add(o);
    for (let m = 1; m <= n; m++) {
      if (!claimed.has(m)) globalNotes.push(`structural missing-slot hypothesis: no file claims ordinal ${m} under "${conv!.label}"`);
    }
    for (const c of claimed) {
      if (c > n) globalNotes.push(`elimination hypothesis: claimed ordinal ${c} exceeds prefix size ${n}`);
    }
  }

  // Pass 1: per-entry proposals. Nothing is published yet.
  const drafts: Draft[] = [];
  for (const e of rows) {
    const p = parsed.get(e.basename)!;
    const names = nameOrds(e);
    const tags = tagClaims(e.episodeTags);
    const ords = [...new Set([...names, ...tags.map((t) => t.ordinal)])];
    const single = ords.length === 1 ? ords[0] : null;
    const competing = ords.length > 1;
    const reliable = !unreliable.has(e.basename);
    const ambig = hasAmbiguousMarker(p);
    const br = birthRanks.get(e.basename) ?? null;
    const mr = mtimeRanks.get(e.basename) ?? null;
    const uniqueBirth = br !== null && br.lo === br.hi ? br.lo : null;
    const uniqueMtime = mr !== null && mr.lo === mr.hi ? mr.lo : null;
    const rankEp = prefixOK && uniqueBirth !== null ? uniqueBirth : null;
    const dup = single !== null && (claimCount.get(single) ?? 0) > 1;
    const recreated = e.birthNs !== null && e.mtimeNs !== null && BigInt(e.birthNs) > BigInt(e.mtimeNs);
    const mtimeExact = single !== null && mr !== null && mr.lo === single && mr.hi === single;

    const support: string[] = [];
    const contradictions: string[] = [];
    const assumptions: string[] = [];
    const sources: string[] = ["filename label grammar", "creation order", "modification order"];
    if (e.episodeTags?.length) sources.push("explicit episode tags");
    if (e.errors?.length) sources.push("collector errors");
    for (const c of p.claims) support.push(`label: ${c.note}`);
    for (const t of tags) support.push(`explicit tag "${t.raw}" claims ordinal ${t.ordinal}`);
    if (!reliable) {
      support.push("capture unreliable: timestamps excluded from ranking this and other entries");
    }
    support.push(`creation ${br === null ? "timestamp missing or unreliable" : `${rankText(br)} (ns=${e.birthNs})`}`);
    support.push(`modification ${mr === null ? "timestamp missing or unreliable" : `${rankText(mr)} (ns=${e.mtimeNs})`}`);
    if (e.changedBetweenStats) contradictions.push("file changed during capture; timestamps unstable");
    if (e.errors?.length) for (const er of e.errors) contradictions.push(`collector: ${er}`);

    const draft: Draft = {
      basename: e.basename,
      verdict: "unresolved",
      support,
      contradictions,
      assumptions,
      sources,
      birthRank: rankText(br),
      mtimeRank: rankText(mr),
      labelSummary: p.claims.map((c) => `${c.kind}:${c.raw}`).join(" | "),
    };

    if (competing) {
      // Competing claims: a named ordinal plus a differing explicit tag is
      // a conflict, never an absent label. All claims preserved, none accepted.
      draft.verdict = "conflicting";
      draft.alternatives = [...ords].sort((a, b) => a - b);
      draft.contradictions.push(
        `competing ordinal claims: filename yields [${names.join(", ") || "none"}] but explicit tags yield [${tags.map((t) => t.ordinal).join(", ")}]; kept visible, no accepted assignment`,
      );
    } else if (dup && single !== null) {
      // Duplicates: expose conflict, share no assignment.
      draft.verdict = "conflicting";
      draft.alternatives = rankEp !== null && rankEp !== single ? [single, rankEp] : [single];
      draft.contradictions.push(`duplicate label: ordinal ${single} claimed by ${claimCount.get(single)} files; no shared assignment`);
      if (rankEp !== null && rankEp !== single) draft.contradictions.push(`creation rank ${rankEp} disagrees with label ${single}`);
    } else if (ambig && single === null) {
      // Ambiguous markers without a clean single ordinal stay ambiguous.
      draft.verdict = "ambiguous";
      const eps = p.claims.flatMap((c) => c.episodes ?? []);
      if (eps.length) draft.alternatives = [...new Set(eps)];
      draft.contradictions.push("label carries fractional/range/multi/special/total-hint marker with no single ordinary reading");
    } else if (ambig && single !== null) {
      // Special-tagged ordinal (e.g. SP2): not an ordinary assignment.
      draft.verdict = "ambiguous";
      draft.alternatives = [single];
      draft.contradictions.push(`special/ambiguous marker redefines trailing ${single}; not collapsible to an ordinary ordinal`);
    } else if (!reliable) {
      // Validity gate: observed candidates stay visible, acceptance barred.
      draft.verdict = "unresolved";
      if (single !== null) draft.alternatives = [single];
      draft.assumptions.push("unreliable capture: candidate recorded, association prohibited until recapture");
    } else if (single !== null && recreated && mtimeExact) {
      // Recreation: creation later than retained mtime + mtime/label agree.
      // The retained mtime carries the ordinal; convention-independent.
      draft.verdict = "conditional";
      draft.episode = single;
      draft.basis = "recreation";
      draft.alternatives = uniqueBirth !== null && uniqueBirth !== single ? [uniqueBirth] : undefined;
      draft.assumptions.push("recreation explanation: file recreated after its predecessor; retained mtime preserves ordinal order");
      draft.support.push(`recreation evidence: birth ns=${e.birthNs} later than retained mtime ns=${e.mtimeNs}`);
      draft.support.push(`modification rank ${single} agrees with label ${single}`);
      draft.contradictions.push(`creation disagreement kept visible: birth ${rankText(br)} != label ${single}`);
    } else if (single !== null) {
      // Pending-first direct number, uniform with or without an optional
      // declared convention: a clear single ordinal identifies the file.
      // Date inversions, ties, and gaps stay visible diagnostics, never vetoes.
      draft.verdict = "corroborated";
      draft.episode = single;
      draft.basis = "direct-number";
      draft.support.push(`direct number: clear ordinal candidate ${single} carries regardless of optional convention; dates stay diagnostic`);
      if (rankEp !== null && rankEp !== single) {
        draft.contradictions.push(`creation rank ${rankEp} disagrees with label ${single}; kept visible, clear number carries`);
      }
      if (uniqueBirth !== null && uniqueMtime !== null && uniqueBirth !== uniqueMtime) {
        draft.contradictions.push(`creation rank ${uniqueBirth} disagrees with modification rank ${uniqueMtime}; kept visible, clear number carries`);
      }
      if (br === null || mr === null) {
        draft.support.push("missing timestamp is a diagnostic gap, not a contradiction of the number");
      }
      if (br !== null && mr !== null && (br.lo !== br.hi || mr.lo !== mr.hi)) {
        draft.support.push("tied rank intervals are diagnostics only; the clear number carries");
      }
    } else if (single === null && prefixOK && uniqueBirth !== null && uniqueMtime !== null && uniqueBirth !== uniqueMtime) {
      // Opaque-only timeline disagreement: an unlabeled file whose two
      // unique timelines disagree with no recreation explanation stays
      // conflicting. Clear numbers never reach this branch.
      draft.verdict = "conflicting";
      draft.alternatives = [uniqueBirth, uniqueMtime];
      draft.contradictions.push(
        `creation rank ${uniqueBirth} disagrees with modification rank ${uniqueMtime}; competing timelines stay visible`,
      );
    } else if (single === null && rankEp !== null) {
      // Rank+context under a declared convention: unlabeled file whose
      // unique creation rank matches usable next context. The claim is
      // conditional and still passes through global reconciliation, so a
      // contested next suspends every claimant instead of hiding one.
      if (next !== null && next === rankEp) {
        draft.verdict = "conditional";
        draft.episode = rankEp;
        draft.basis = "rank-context";
        draft.assumptions.push(`opaque label: rank ${rankEp} matches usable next ${next} under "${conv!.label}"`);
        draft.support.push(`timeline+structure+explicit convention point at ${rankEp}; reasons identify the convention assumption`);
      } else {
        draft.verdict = "unresolved";
        draft.alternatives = [rankEp];
        draft.assumptions.push("opaque label with rank hypothesis but no supporting usable context");
      }
    } else {
      draft.verdict = "unresolved";
      if (single !== null) draft.alternatives = [single];
      if (single === null && !ambig) draft.assumptions.push("opaque label: pending-first inference below decides");
    }
    drafts.push(draft);
  }

  // Watched-first partition: integer progress excludes already-watched
  // ordinals from pending. Format alone never marks watched.
  const byName = new Map(drafts.map((d) => [d.basename, d]));
  for (const d of drafts) {
    if (d.episode !== undefined && progress !== null && isWatchedOrdinal(d.episode, progress)) {
      d.watched = true;
      d.support.push(`watched context: ordinal ${d.episode} <= progress ${progress}; excluded from pending`);
    }
  }
  const pending = drafts.filter((d) => d.watched !== true);
  const numberedPending = pending.filter((d) => d.episode !== undefined);
  // Opaque-eligible: reliable, no identity, no ambiguity, no conflict —
  // an empty unnumbered candidate, never a typed ambiguity.
  const opaqueEligible = (d: Draft): boolean =>
    d.episode === undefined && d.verdict !== "ambiguous" && d.verdict !== "conflicting" &&
    !unreliable.has(d.basename);
  const opaquePending = pending.filter(opaqueEligible);
  const allPendingOpaque = pending.length > 0 && pending.every(opaqueEligible);
  const claimed = new Set(drafts.map((d) => d.episode).filter((e) => e !== undefined) as number[]);

  // Pass 1b: elimination. Exactly one opaque pending file beside identified
  // numbered pending siblings takes the usable next when nobody claims it.
  const elimEp = inferElimination(opaquePending.length, numberedPending.length, next, next !== null && claimed.has(next));
  if (elimEp !== null) {
    const target = opaquePending[0];
    target.verdict = "conditional";
    target.episode = elimEp;
    target.basis = "elimination";
    target.alternatives = [elimEp];
    target.assumptions.push(
      `elimination under a local consecutive-pending hypothesis: ${numberedPending.map((d) => `${d.basename}=${d.episode}`).join(", ")} identified as other-pending, so the remaining unnumbered file is ${elimEp}; no visual verification`,
    );
    target.support.push(`usable next ${elimEp} claimed by nobody; the single unnumbered pending file takes it conditionally`);
    claimed.add(elimEp);
  }

  // Pass 1b2: single-pending elimination by a complete watched prefix.
  // Convention-independent: when the usable next is known, exactly one
  // pending file remains, and the already-watched files account for every
  // ordinal 1..progress with no gap or duplicate, the lone opaque file may
  // claim the usable next conditionally under an explicit consecutive
  // assumption. A lone file without usable watched context, a contradicting
  // expectedNext, or an incomplete/duplicated watched prefix all abstain.
  // Opaque eligibility already bars unreliable, ambiguous, conflicting, and
  // numbered files, so the claimant carries no typed ambiguity or claim.
  const watchedEps = drafts
    .filter((d) => d.watched === true && d.episode !== undefined)
    .map((d) => d.episode as number);
  const singleEp = inferSinglePendingElimination(
    pending.length,
    opaquePending.length,
    next,
    next !== null && claimed.has(next),
    progress,
    ctx.expectedNext,
    watchedEps,
  );
  if (singleEp !== null) {
    const target = opaquePending[0];
    target.verdict = "conditional";
    target.episode = singleEp;
    target.basis = "elimination";
    target.alternatives = [...new Set([...(target.alternatives ?? []), singleEp])].sort((a, b) => a - b);
    target.assumptions.push(
      `single-pending elimination under a consecutive-watched-prefix hypothesis: watched ordinals 1..${progress} complete with no gap or duplicate, so the sole remaining unnumbered file is ${singleEp} conditionally; assumes no missing or renamed watched file and no visual verification`,
    );
    target.support.push(`usable next ${singleEp} claimed by nobody; the single unnumbered pending file takes it conditionally`);
    claimed.add(singleEp);
  }

  // Pass 1c: relative pending chronology for fully opaque pending sets:
  // earliest creation takes the usable next, then consecutive ordinals.
  // Watched rows never take part. Ties/unknowns/inversions abstain.
  if (next !== null && allPendingOpaque && opaquePending.length >= 2) {
    const stamps = opaquePending.map((d) => {
      const e = rows.find((r) => r.basename === d.basename)!;
      return { basename: d.basename, birthNs: e.birthNs, mtimeNs: e.mtimeNs };
    });
    const order = inferChronologyOrder(stamps, (b) => !unreliable.has(b));
    if (order !== null) {
      order.forEach((base, i) => {
        const d = byName.get(base)!;
        d.verdict = "conditional";
        d.episode = next + i;
        d.basis = "chronology";
        d.alternatives = [next + i];
        d.assumptions.push(
          `relative pending chronology under a local consecutive hypothesis: earliest pending creation takes ${next}, then consecutive ordinals in birth order; watched rows excluded from comparison`,
        );
        d.support.push(`pending-only birth order ${order.join(" < ")} agrees with modification order`);
      });
      globalNotes.push(`pending chronology: ${order.join(" < ")} take ${order.map((_, i) => next + i).join(", ")} conditionally`);
    } else {
      for (const d of opaquePending) {
        d.verdict = "unresolved";
        d.contradictions.push("opaque pending chronology tied, unknown, or inverted: no lexical winner manufactured");
      }
      globalNotes.push("pending chronology abstains: tied, missing, or conflicting opaque timestamps");
    }
  } else if (next !== null && opaquePending.length >= 2 && !allPendingOpaque) {
    globalNotes.push("pending chronology skipped: numbered pending files coexist with several opaque ones; opaque files stay unresolved");
  }

  // Pass 2: reconcile globally BEFORE publishing. Contested episodes
  // suspend every claimant; no hidden iteration-order winner.
  const assignments: Record<string, string> = {};
  const byEp = new Map<number, Draft[]>();
  for (const d of drafts) {
    if (d.episode !== undefined) {
      const list = byEp.get(d.episode) ?? [];
      list.push(d);
      byEp.set(d.episode, list);
    }
  }
  for (const [ep, list] of byEp) {
    if (list.length > 1) {
      const names = list.map((d) => d.basename).join(", ");
      for (const d of list) {
        d.verdict = "conflicting";
        d.contradictions.push(
          `shared ordinal ${ep} also proposed by ${names}; no hidden winner — every proposal suspended`,
        );
        d.alternatives = [...new Set([...(d.alternatives ?? []), ep])].sort((a, b) => a - b);
        d.episode = undefined;
        d.basis = undefined;
      }
      globalNotes.push(`reconcile: ordinal ${ep} contested by ${names}; suspended, unassigned`);
    } else {
      assignments[String(ep)] = list[0].basename;
    }
  }

  // Pass 3: actual next AFTER reconciliation. Only a published, stable,
  // known, reliable, unwatched assignment at the usable next ordinal
  // selects. Identity stays published; a watched target abstains.
  const reliableOf = (b: string): boolean => !unreliable.has(b);
  const watchedOf = (b: string): boolean => byName.get(b)?.watched === true;
  const nextSelection = selectNext(assignments, next, reliableOf, watchedOf);
  let nextReason: string;
  if (nextSelection !== null) {
    const winner = byName.get(nextSelection.basename)!;
    const basisLabel = winner.basis === "elimination"
      ? "elimination (conditional inference)"
      : winner.basis === "chronology"
      ? "relative pending chronology (conditional inference)"
      : winner.basis === "rank-context"
      ? "rank+context under a declared convention (conditional inference)"
      : winner.basis === "recreation"
      ? "retained-mtime recreation (conditional inference)"
      : "direct clear number";
    const watchedCount = drafts.filter((d) => d.watched === true).length;
    nextReason = `selected episode ${nextSelection.episode} file ${nextSelection.basename} by ${basisLabel}; ${watchedCount} already-watched, ${pending.length} pending`;
  } else if (next === null) {
    nextReason = fractionalProgress
      ? "no selection: fractional progress never truncates and no explicit integer expected-next was supplied"
      : "no selection: no usable next context (unknown progress and no explicit integer expected-next)";
  } else if (!Object.prototype.hasOwnProperty.call(assignments, String(next))) {
    nextReason = `no selection: usable next ${next} has no published assignment (unidentified, contested-suspended, or unstable)`;
  } else if (byName.get(assignments[String(next)])?.watched === true) {
    nextReason = `no selection: usable next ${next} names already-watched ${assignments[String(next)]} (progress ${progress}); manual review required, no fallback selection`;
  } else {
    nextReason = `no selection: assignment at ${next} is not a stable known file`;
  }
  // An unusable token never changes the selection or abstention; it only
  // appends the disclosure. Absent or usable tokens leave every reason byte-identical.
  if (badTokenNote !== null) {
    nextReason += `; ${badTokenNote}`;
    if (nextSelection !== null) {
      const winner = byName.get(nextSelection.basename);
      if (winner !== undefined) {
        winner.assumptions.push(`${badTokenNote}; exact integer progress+1 carries the ordinal instead`);
        winner.support.push(`${badTokenNote}; usable next ${nextSelection.episode} derived from exact integer progress+1`);
      }
    }
  }

  const pendingCompatibility: string[] = [];
  if (next !== null) {
    pendingCompatibility.push(
      assignments[String(next)]
        ? `expected-next ${next} compatible: assigned to ${assignments[String(next)]}`
        : `expected-next ${next} has no accepted assignment in this snapshot`,
    );
  } else {
    pendingCompatibility.push("expected-next unavailable: no explicit integer context (fractional progress never truncates)");
  }
  if (progress !== null && !fractionalProgress) {
    pendingCompatibility.push(`progress marker ${progress} is historical supplied context, not live truth`);
  }
  pendingCompatibility.push(
    nextSelection !== null
      ? `nextSelection: episode ${nextSelection.episode} file ${nextSelection.basename}`
      : `nextSelection: abstain (${nextReason})`,
  );

  const verdicts: EntryResult[] = drafts.map((d) => ({
    basename: d.basename,
    verdict: d.verdict,
    episode: d.episode,
    alternatives: d.alternatives,
    support: d.support,
    contradictions: d.contradictions,
    assumptions: d.assumptions,
    sources: d.sources,
    birthRank: d.birthRank,
    mtimeRank: d.mtimeRank,
    labelSummary: d.labelSummary,
  }));

  const after = JSON.stringify(snapshot.entries);
  if (after !== before) throw new Error("analyze() mutated its input");
  return { scenarioId, verdicts, globalNotes, globalAssumptions, assignments, pendingCompatibility, nextSelection, nextReason };
}
