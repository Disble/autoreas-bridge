/** PROTOTYPE — disposable, NOT PRODUCTION. Reproducible synthetic scenarios + expectations. */
import { entry, mushokuEntries, PREFIX, prefixWatchedPlusOpaque, slimeEntries, yaniEntries } from "./scenario-helpers.ts";
import type { Snapshot } from "./types.ts";

export interface Expectation {
  /** Basename or "*" wildcard checked per entry. */
  readonly file: string;
  readonly verdict: string;
  readonly episode?: number;
  /** Exact birthRank text match when rank display matters. */
  readonly birthRank?: string;
  /** Every listed ordinal must appear in alternatives. */
  readonly alternativesInclude?: readonly number[];
}

export interface Scenario {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly snapshot: Snapshot;
  /** Explicit known-case annotations; NOT computed by the parser under test. */
  readonly expect: readonly Expectation[];
  /** Optional global predicate note checked by run.ts. */
  readonly check?: "permutation-stable" | "fractional-progress-unavailable" | "no-accepted";
  /** Optional expected actual-next decision checked by run.ts. */
  readonly expectNext?: { readonly episode: number; readonly basename: string } | null;
  /**
   * Optional disclosure substrings checked by run.ts against BOTH the
   * nextReason and the selected file's assumptions/support. Neutral ids
   * only: the scenario id itself must not contain a needle.
   */
  readonly expectReasonIncludes?: readonly string[];
}



export const SCENARIOS: readonly Scenario[] = [
  {
    id: "s01-slime-tail",
    title: "Slime-like 24 with different last stem",
    description: "23 canonical files plus a distorted-stem file carrying ordinal 24; joint rank+label agree.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX },
      context: { animeTitle: "slime-like", expectedNext: 24, progress: 23 },
      entries: slimeEntries("teeennnseiishitaaaraaslimeedattaakenn4thseasonsss-24.mp4"),
    },
    expect: [{ file: "teeennnseiishitaaaraaslimeedattaakenn4thseasonsss-24.mp4", verdict: "corroborated", episode: 24 }],
  },
  {
    id: "s02-masked-tail",
    title: "Masked pending filename",
    description: "Same 24-set with the last filename masked and no episode tags; rank+convention+context must carry it.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX },
      context: { animeTitle: "slime-like", expectedNext: 24, progress: 23 },
      entries: slimeEntries("masked-pending-file.mp4"),
    },
    expect: [{ file: "masked-pending-file.mp4", verdict: "conditional", episode: 24 }],
  },
  {
    id: "s03-mushoku-tails",
    title: "Mushoku-like 12+2 distinct tails",
    description: "Two alternate-stem tails 13/14 must keep delimited-suffix candidates, not be dropped.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX, label: "explicit-prefix-14" },
      context: { animeTitle: "mushoku-like", expectedNext: 13, progress: 12 },
      entries: mushokuEntries(),
    },
    expect: [
      { file: "Mushoku Tensei III alt-release - 13.mp4", verdict: "corroborated", episode: 13 },
      { file: "totally-different-fansub-title-14.mp4", verdict: "corroborated", episode: 14 },
    ],
  },
  {
    id: "s04-yani-recreation",
    title: "Yani recreation conflict 10/11",
    description: "Episode-10 file recreated after 11 (birth rank 11) but keeps older mtime agreeing with label 10.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX, label: "explicit-prefix-11" },
      context: { animeTitle: "yani-like" },
      entries: yaniEntries(),
    },
    expect: [{ file: "yani-10.mp4", verdict: "conditional", episode: 10 }],
  },
  {
    id: "s05-datealive-singleton",
    title: "DateALive-like 01(24) singleton, progress 13",
    description: "One ambiguous file with dual 1/total-24 reading; must stay ambiguous, never definitive 1 or 24.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      context: { animeTitle: "datealive-like", progress: 13 },
      entries: [entry("datealive-01(24).mp4", 5, 5)],
    },
    expect: [{ file: "datealive-01(24).mp4", verdict: "ambiguous" }],
  },
  {
    id: "s06-tied-dates",
    title: "Equal/missing timestamps",
    description: "Identical birth times plus one missing birth; no lexical certainty from names alone.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX, label: "explicit-prefix-3" },
      entries: [
        entry("show-01.mp4", 1, 1),
        entry("show-02.mp4", 1, 2),
        entry("show-03.mp4", null, 3),
      ],
    },
    expect: [
      { file: "show-01.mp4", verdict: "corroborated", episode: 1 },
      { file: "show-02.mp4", verdict: "corroborated", episode: 2 },
      { file: "show-03.mp4", verdict: "corroborated", episode: 3 },
    ],
  },
  {
    id: "s07-missing-names",
    title: "Missing names do not veto the rest",
    description: "One opaque file among labeled ones; labeled files must still resolve, no global abstention.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX, label: "explicit-prefix-3" },
      entries: [entry("show-01.mp4", 1, 1), entry("show-02.mp4", 2, 2), entry("no-label-file.mp4", 3, 3)],
    },
    expect: [
      { file: "show-01.mp4", verdict: "corroborated", episode: 1 },
      { file: "show-02.mp4", verdict: "corroborated", episode: 2 },
    ],
  },
  {
    id: "s08-duplicate-labels",
    title: "Duplicate labels conflict",
    description: "Two files claim ordinal 5; neither may silently share the assignment.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX, label: "explicit-prefix-3" },
      entries: [entry("show-05.mp4", 1, 1), entry("show_05.mp4", 2, 2), entry("show-06.mp4", 3, 3)],
    },
    expect: [
      { file: "show-05.mp4", verdict: "conflicting" },
      { file: "show_05.mp4", verdict: "conflicting" },
    ],
  },
  {
    id: "s09-noise-tokens",
    title: "Year/resolution/version/fractional/multi/range/special never collapse",
    description: "Misleading numbers must not reduce to a trailing last integer.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      entries: [
        entry("show-2013-1080p-v2.mp4", 1, 1),
        entry("show-10.5.mp4", 2, 2),
        entry("show-07-08.mp4", 3, 3),
        entry("show-10+11.mp4", 4, 4),
        entry("show-SP2.mp4", 5, 5),
      ],
    },
    expect: [
      { file: "show-2013-1080p-v2.mp4", verdict: "unresolved" },
      { file: "show-10.5.mp4", verdict: "ambiguous" },
      { file: "show-07-08.mp4", verdict: "ambiguous" },
      { file: "show-10+11.mp4", verdict: "ambiguous" },
      { file: "show-SP2.mp4", verdict: "ambiguous" },
    ],
  },
  {
    id: "s10-fractional-progress",
    title: "Fractional progress yields no expected-next",
    description: "Progress 12.5 must not truncate into expected-next 12 or 13. The clear 13 file keeps its identity (no convention gate on identity) while next selection abstains.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      context: { animeTitle: "frac-like", progress: 12.5 },
      entries: [entry("frac-13.mp4", 1, 1)],
    },
    expect: [{ file: "frac-13.mp4", verdict: "corroborated", episode: 13 }],
    check: "fractional-progress-unavailable",
    expectNext: null,
  },
  {
    id: "s11-singleton-prefix",
    title: "Initial compatible singleton",
    description: "One stable unlabeled file under explicit initial prefix with progress 0 is CONDITIONAL 1.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX, label: "explicit-initial-prefix" },
      context: { animeTitle: "new-like", progress: 0 },
      entries: [entry("first-capture.mp4", 1, 1)],
    },
    expect: [{ file: "first-capture.mp4", verdict: "conditional", episode: 1 }],
  },
  {
    id: "s11b-singleton-incompatible",
    title: "Singleton with incompatible context",
    description: "Same singleton but progress 13: must NOT yield episode 1.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      context: { animeTitle: "datealive-like", progress: 13 },
      entries: [entry("lone-file.mp4", 1, 1)],
    },
    expect: [{ file: "lone-file.mp4", verdict: "unresolved" }],
  },
  {
    id: "s12-permutation",
    title: "Input order permutation stability",
    description: "Reversed input order must give canonically identical results and leave inputs unchanged.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX, label: "explicit-prefix-3" },
      entries: [entry("ord-03.mp4", 3, 3), entry("ord-01.mp4", 1, 1), entry("ord-02.mp4", 2, 2)],
    },
    expect: [
      { file: "ord-01.mp4", verdict: "corroborated", episode: 1 },
      { file: "ord-02.mp4", verdict: "corroborated", episode: 2 },
      { file: "ord-03.mp4", verdict: "corroborated", episode: 3 },
    ],
    check: "permutation-stable",
  },
  {
    id: "r01-missing-creation-widens-rank",
    title: "Missing creation widens absolute rank",
    description: "EP01 creation missing: EP02 cannot be absolute rank 1; its interval stays 1..2 while mtime+label carry conditionally.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX },
      entries: [
        { path: "synthetic/Show EP01.mp4", basename: "Show EP01.mp4", sizeBytes: "1000", birthNs: null, mtimeNs: "1" },
        { path: "synthetic/Show EP02.mp4", basename: "Show EP02.mp4", sizeBytes: "1000", birthNs: "2", mtimeNs: "2" },
      ],
    },
    expect: [
      { file: "Show EP02.mp4", verdict: "corroborated", episode: 2, birthRank: "rank interval 1..2" },
      { file: "Show EP01.mp4", verdict: "corroborated", episode: 1 },
    ],
  },
  {
    id: "r02-changed-file-not-accepted",
    title: "Changed file accepted nowhere",
    description: "A file that changed during capture keeps its visible candidate but receives no episode and no assignment.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX },
      context: { expectedNext: 1 },
      entries: [
        { path: "synthetic/Show EP01.mp4", basename: "Show EP01.mp4", sizeBytes: "1000", birthNs: "1", mtimeNs: "1", changedBetweenStats: true },
      ],
    },
    expect: [{ file: "Show EP01.mp4", verdict: "unresolved" }],
    check: "no-accepted",
  },
  {
    id: "r03-read-error-not-accepted",
    title: "Error-carrying file accepted nowhere",
    description: "A file with collector errors keeps tentative evidence but receives no episode; other files are not vetoed.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX },
      context: { expectedNext: 1 },
      entries: [
        { path: "synthetic/Show EP01.mp4", basename: "Show EP01.mp4", sizeBytes: "1000", birthNs: "1", mtimeNs: "1", errors: ["synthetic before-after stat failure"] },
      ],
    },
    expect: [{ file: "Show EP01.mp4", verdict: "unresolved" }],
    check: "no-accepted",
  },
  {
    id: "r04-opaque-timeline-disagreement",
    title: "Opaque creation/modification disagreement stays visible",
    description: "Opaque file with creation rank 2 but modification rank 1 is conflicting, never silently carried by expected-next.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX },
      context: { expectedNext: 2 },
      entries: [
        { path: "synthetic/Show EP01.mp4", basename: "Show EP01.mp4", sizeBytes: "1000", birthNs: "1", mtimeNs: "2" },
        { path: "synthetic/opaque.mp4", basename: "opaque.mp4", sizeBytes: "1000", birthNs: "2", mtimeNs: "1" },
      ],
    },
    expect: [
      { file: "opaque.mp4", verdict: "conflicting" },
      { file: "Show EP01.mp4", verdict: "corroborated", episode: 1 },
    ],
  },
  {
    id: "r05-conflicting-tag-preserved",
    title: "Conflicting explicit tag never hidden",
    description: "Filename claims 1 while an explicit tag claims 2: conflict with both alternatives, no accepted assignment.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX },
      context: { expectedNext: 1 },
      entries: [
        { path: "synthetic/Show EP01.mp4", basename: "Show EP01.mp4", sizeBytes: "1000", birthNs: "1", mtimeNs: "1", episodeTags: ["2"] },
      ],
    },
    expect: [{ file: "Show EP01.mp4", verdict: "conflicting", alternativesInclude: [1, 2] }],
    check: "no-accepted",
  },
  {
    id: "r06-conditional-uniqueness",
    title: "One-to-one holds across conditional proposals",
    description: "Recreation-conditional 1 plus timeline-conflicted opaque: only one accepted episode 1 exists.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX },
      context: { expectedNext: 1 },
      entries: [
        { path: "synthetic/Show EP01.mp4", basename: "Show EP01.mp4", sizeBytes: "1000", birthNs: "2", mtimeNs: "1" },
        { path: "synthetic/opaque.mp4", basename: "opaque.mp4", sizeBytes: "1000", birthNs: "1", mtimeNs: "2" },
      ],
    },
    expect: [
      { file: "Show EP01.mp4", verdict: "conditional", episode: 1 },
      { file: "opaque.mp4", verdict: "conflicting" },
    ],
  },
  {
    id: "r06b-contested-conditional-suspended",
    title: "Contested conditional proposals suspend both",
    description: "Recreation-conditional 1 and opaque-conditional 1 collide: reconcile suspends both with no hidden winner; uncontested 2 still publishes.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX },
      context: { expectedNext: 1 },
      entries: [
        { path: "synthetic/Show EP01.mp4", basename: "Show EP01.mp4", sizeBytes: "1000", birthNs: "3", mtimeNs: "1" },
        { path: "synthetic/opaque-b.mp4", basename: "opaque-b.mp4", sizeBytes: "1000", birthNs: "1", mtimeNs: "2" },
        { path: "synthetic/filler EP02.mp4", basename: "filler EP02.mp4", sizeBytes: "1000", birthNs: "2", mtimeNs: "2" },
      ],
    },
    expect: [
      { file: "Show EP01.mp4", verdict: "conflicting" },
      { file: "opaque-b.mp4", verdict: "conflicting" },
      { file: "filler EP02.mp4", verdict: "corroborated", episode: 2 },
    ],
  },
  {
    id: "s13-pending-clear-number-wins",
    title: "Clear pending 13 wins despite newer creation",
    description: "Two differently named pending files after watched 12; the 13 file was created AFTER the 14 file. The inversion stays diagnostic; 13 still selects.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      context: { animeTitle: "mushoku-like", expectedNext: 13, progress: 12 },
      entries: [
        entry("Different Release Group Title - 14.mp4", 13, 13),
        entry("Mushoku Tensei III 13.mp4", 14, 14),
      ],
    },
    expect: [
      { file: "Mushoku Tensei III 13.mp4", verdict: "corroborated", episode: 13 },
      { file: "Different Release Group Title - 14.mp4", verdict: "corroborated", episode: 14 },
    ],
    expectNext: { episode: 13, basename: "Mushoku Tensei III 13.mp4" },
  },
  {
    id: "s14-elimination-visible",
    title: "Unnumbered pending inferred by elimination",
    description: "Watched 12 plus one clear 14 plus one dateless unnumbered file: the other file is conditionally 13 under a visible consecutive-pending hypothesis.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      context: { animeTitle: "evening-like", expectedNext: 13, progress: 12 },
      entries: [
        entry("Evening Becomes Night - 14.mp4", 5, 5),
        entry("Evening Becomes Night finale.mp4", null, null),
      ],
    },
    expect: [
      { file: "Evening Becomes Night - 14.mp4", verdict: "corroborated", episode: 14 },
      { file: "Evening Becomes Night finale.mp4", verdict: "conditional", episode: 13 },
    ],
    expectNext: { episode: 13, basename: "Evening Becomes Night finale.mp4" },
  },
  {
    id: "s15-opaque-chronology",
    title: "Two anonymous pending files ordered by creation",
    description: "No usable numbers: earlier creation plus agreeing modification order takes 13 conditionally, then consecutive 14. Watched rows stay out of the comparison.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      context: { animeTitle: "north-like", expectedNext: 13, progress: 12 },
      entries: [entry("north-cut.mp4", 6, 6), entry("south-cut.mp4", 7, 7)],
    },
    expect: [
      { file: "north-cut.mp4", verdict: "conditional", episode: 13 },
      { file: "south-cut.mp4", verdict: "conditional", episode: 14 },
    ],
    expectNext: { episode: 13, basename: "north-cut.mp4" },
  },
  {
    id: "s16-optional-convention-no-date-veto",
    title: "Declared convention never vetoes clear numbers",
    description: "Same inverted dates as s13 but under a declared complete prefix: clear 13 still identifies and selects, dates stay diagnostic.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: { ...PREFIX, label: "explicit-prefix-2" },
      context: { animeTitle: "mushoku-like", expectedNext: 13, progress: 12 },
      entries: [
        entry("Different Release Group Title - 14.mp4", 13, 13),
        entry("Mushoku Tensei III 13.mp4", 14, 14),
      ],
    },
    expect: [
      { file: "Mushoku Tensei III 13.mp4", verdict: "corroborated", episode: 13 },
      { file: "Different Release Group Title - 14.mp4", verdict: "corroborated", episode: 14 },
    ],
    expectNext: { episode: 13, basename: "Mushoku Tensei III 13.mp4" },
  },
  {
    id: "s17-watched-target-abstains",
    title: "Explicit watched target abstains",
    description: "Progress 12 with explicit expected-next 12 must not resurrect watched 12: identity stays published, final selection abstains for manual review.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      context: { animeTitle: "watch-like", expectedNext: 12, progress: 12 },
      entries: [entry("show-12.mp4", 1, 1), entry("show-13.mp4", 2, 2)],
    },
    expect: [
      { file: "show-12.mp4", verdict: "corroborated", episode: 12 },
      { file: "show-13.mp4", verdict: "corroborated", episode: 13 },
    ],
    expectNext: null,
  },
  {
    id: "s18-single-pending-elimination",
    title: "Single opaque pending claims next by watched-prefix elimination",
    description: "Watched 1..3 complete under unknown convention plus one opaque pending file: the lone file is conditionally 4 under a visible consecutive-watched-prefix hypothesis.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      context: { animeTitle: "prefix-like", expectedNext: 4, progress: 3 },
      entries: prefixWatchedPlusOpaque("opaque-leaf.mp4"),
    },
    expect: [{ file: "opaque-leaf.mp4", verdict: "conditional", episode: 4 }],
    expectNext: { episode: 4, basename: "opaque-leaf.mp4" },
  },
  {
    id: "s20-unusable-token-disclosed",
    title: "Unusable supplied context is disclosed, not silent",
    description: "Same watched 1..3 prefix as s18 but the supplied expected-next is the string token \"4\", not a usable positive integer: the lone opaque file still conditionally claims 4 from exact integer progress+1, and both the next reason and the selected file disclose that the token was not used.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      context: { animeTitle: "prefix-like", expectedNext: "4", progress: 3 },
      entries: prefixWatchedPlusOpaque("opaque-leaf.mp4"),
    },
    expect: [{ file: "opaque-leaf.mp4", verdict: "conditional", episode: 4 }],
    expectNext: { episode: 4, basename: "opaque-leaf.mp4" },
    expectReasonIncludes: ["expectedNext", "not a usable positive integer"],
  },
  {
    id: "s19-lone-anonymous-abstains",
    title: "Lone anonymous file without context abstains",
    description: "A single number-free file with unknown progress must never auto-become episode 1; next selection stays null.",
    snapshot: {
      source: "synthetic",
      capturedAt: "synthetic",
      convention: null,
      context: {},
      entries: [entry("anonymous.mp4", 1, 1)],
    },
    expect: [{ file: "anonymous.mp4", verdict: "unresolved" }],
    expectNext: null,
  },
];
