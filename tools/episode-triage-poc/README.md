# Episode-recognition triage PoC — PROTOTYPE, NOT PRODUCTION

Deterministic pending-first episode recognition that answers one question:
can joint rules over current app progress, filename labels, Windows
creation/modification order, and explicit anime context pick the actual next
file without AI, name-first matching, global collection gates, or invented
weights? First-blind finite result was 15/15 correct publications with
13/13 negative abstentions and 0 safety violations, BUT two functional
probes failed behaviorally; both are fixed here with executable regressions.
A second bounded correction adds convention-independent single-pending
elimination (one opaque pending file plus a complete watched 1..progress
prefix claims the usable next conditionally), with lean regressions and
stronger first-tab mask/recreate next-selection assertions. A final
tightening pass discloses unusable supplied expectedNext tokens instead of
silently ignoring them (lean `s20` regression), and asserts full next-banner
equality on every tab with cropped banner screenshots. The independent
recheck runs after this; association accuracy remains UNMEASURED.
No product acceptance is claimed here.

## Quick path

```bash
bun tools/episode-triage-poc/artifacts/interview-eval-v2-check.ts
bun tools/episode-triage-poc/artifacts/interview-eval-v2.ts --development --out tools/episode-triage-poc/artifacts/interview-final-dev.json
bun tools/episode-triage-poc/artifacts/interview-eval-v2.ts --supplemental --out tools/episode-triage-poc/artifacts/interview-final-supplemental.json
bun tools/episode-triage-poc/run.ts --demo --validate --out tools/episode-triage-poc/artifacts/interview-final-demo.html --json tools/episode-triage-poc/artifacts/interview-final-demo.json
bun tools/episode-triage-poc/run.ts --replay tools/episode-triage-poc/artifacts/final-live.json --recompute --validate --out tools/episode-triage-poc/artifacts/interview-final-live.html --json tools/episode-triage-poc/artifacts/interview-final-live.json
bun tools/episode-triage-poc/browser-check.ts tools/episode-triage-poc/artifacts/interview-final-demo.html tools/episode-triage-poc/artifacts/interview-final-live.html --output-prefix interview-final
```

Then double-click `artifacts/interview-final-demo.html` (27 guided cases)
or `interview-final-live.html` (recomputed Slime/Mushoku/Yani plus the
missing-Date-III record): each case shows the actual-next banner, the
watched/pending partition, and full evidence per file, with in-memory controls
(mask pending names, tie dates, recreate one timestamp, restore) that re-run
the SAME bundled `analyze()`.

## Confirmed human process (what the core does)

| Step | Decision |
|------|----------|
| Watched-first | Integer app progress marks ordinals at or below it as already-watched context and excludes them from pending. Numbered format alone never means watched, so a rewatch at progress 0 selects episode 01. |
| Direct number | A clear single pending ordinal identifies the file with no global complete-prefix/from-1/no-gaps/no-extras permission gate. Date inversions, ties, and gaps stay visible diagnostics, never vetoes. |
| Elimination | Watched 12 plus one clear 14 plus one unnumbered pending file infers the other as 13, conditionally, under a visible consecutive-pending hypothesis (no visual verification). A sole opaque pending file with a complete watched 1..progress prefix likewise claims the usable next conditionally under a consecutive-watched-prefix hypothesis; gaps, duplicates, expectedNext contradictions, and lone files without watched context abstain. |
| Pending chronology | With no usable numbers, earlier pending creation plus agreeing modification order takes the usable next conditionally, then consecutive ordinals. Watched rows never take part, so a watched recreation cannot shift pending order. Ties, unknowns, and inversions abstain with no lexical winner. |
| Actual next | `nextSelection` is ALWAYS explicit (object or null), chosen AFTER global reconciliation, only at the usable next ordinal: explicit integer expected-next wins, else exact integer progress+1. Fractional progress never truncates. A supplied expectedNext that is not a usable positive integer (string, fractional, zero/negative, boolean) carries no ordinal: derivation stays on exact integer progress+1 while the next reason and the selected file's assumptions/support disclose that the token was not used. The selection must name a published, stable, known, unwatched file; a watched target abstains for manual review with no fallback. Identity and next stay separate: a recognized file 13 with unknown progress leaves next null. |
| Safety kept | Changed/error captures accept nothing and rank nobody; fractional/range/multi/special/total-hint never collapse; filename-plus-tag conflicts stay visible; duplicate/contested ordinals suspend every claimant; snapshots immutable; permutation-stable; BigInt chronology. |

## Measured results (finite corpora, not population claims)

| Split | Actionable positives | Precision | Negatives | Safety |
|-------|----------------------|-----------|-----------|--------|
| Development (16 cases: 7 positive, 8 negative, 1 association) | 7/7 | 7/7 | 8/8 abstain | 0 |
| Full-snapshot supplement (4 regression variants, 2 real folders) | 4/4 | 4/4 | 0/0 | 0 |
| Guided `--demo` scenarios | 28/28 (20 original + 3 pending + 2 P3 + 2 single-pending + 1 unusable-token-disclosure regression) | — | included | — |
| First-blind held-out (finite only) | 15/15 correct publications, 13/13 abstentions, 0 violations, PLUS 2 functional probe FAILs fixed here | — | — | — |
| Blind held-out recheck | NOT run here; independent P4 owns it | — | — | — |
| Association accuracy | UNMEASURED everywhere | — | — | — |

Recomputed historical capture (`final-live.json`, no rescan): Slime 24/24
corroborated with next episode 24 (distorted `-24` stem); Mushoku 13
corroborated plus 1 recreation-conditional (episode 10) with next episode 13
(clear `muushooku…-13` name, not vetoed by dates); Yani 11 plus 1
recreation-conditional with next abstaining (progress genuinely unknown);
Date a Live III still missing, never substituted. Old verdicts legitimately
drifted from the recorded v1 results; `--recompute` records that drift and
validates the NEW results for determinism, permutation stability, one-to-one
known-file assignments, and well-formed selections instead of claiming old
verdict matches. Strict `--replay --validate` without `--recompute` keeps the
legacy exact-match comparison.

## Changed old case expectations (four, policy-uniform)

- `s10-fractional-progress`: `frac-13.mp4` was `unresolved`, now
  `corroborated` episode 13 with `expectNext: null`. Reason: the confirmed
  contract removes the global convention gate on *identity* — a clear number
  identifies without it — while fractional progress still gates *selection*,
  so next abstains. The `fractional-progress-unavailable` check still passes.
- `s06-tied-dates` (3 files): were `conditional`, now `corroborated` with the
  same episodes. Reason: P3 uniform clear-number priority — tied rank
  intervals are diagnostics only, never vetoes; dates stay visible in ranks.
- `r01-missing-creation-widens-rank` (2 files): were `conditional`, now
  `corroborated` with the same episodes and the same `birthRank
  "rank interval 1..2"` on EP02. Reason: same uniform priority; the widened
  interval is still asserted, only the veto is gone.
- `r04-opaque-timeline-disagreement`: `Show EP01.mp4` was `conflicting`, now
  `corroborated` episode 1; `opaque.mp4` stays `conflicting`. Reason: the
  creation-vs-modification veto now applies to opaque files only; a clear
  number carries while its date disagreement stays visible as a
  contradiction. No coverage removed: all files and checks remain.

New P3 regressions lock the two fixed probes: `s16` (declared prefix never
restores a date veto — clear 13 selects despite 13 newer than 14) and `s17`
(explicit watched target 12 abstains with identity 12 retained). Older `s13`
(null-convention inversion) still passes unchanged.

Second bounded correction (this iteration) adds `s18` (sole opaque pending
with watched 1..3 complete claims 4 conditionally under unknown convention)
and `s19` (lone anonymous file with unknown progress abstains, never
auto-becomes episode 1). No existing scenario verdict changed: the new rule
only fires when exactly one pending file remains with zero numbered pending
siblings, which no prior scenario satisfies. Synthetic builders
(`entry`/`PREFIX`/`slimeEntries`/`mushokuEntries`) moved unchanged into
`scenario-helpers.ts` to hold `cases.ts` under the 500-line cap.

## Artifact versions (read this before comparing)

| Generation | Files | Meaning |
|------------|-------|---------|
| Pre-correction evidence | `demo.*`, `live.*`, `replay.*`, `verify-*.*` | First writer pass; kept untouched as historical evidence. |
| Corrected core | `corrected-demo.*`, `corrected-live.*`, `corrected-replay.*` | Fixed validity/reconcile core; kept untouched. |
| Final delivery | `final-demo.*`, `final-live.*` (captured 2026-10-11T00:30:26.521Z), `final-replay.*` | Independent verifier reruns; kept untouched and read-only here. |
| Interview baselines | `interview-baseline-*.json`, `interview-eval-dev.json`, `interview-eval-holdout.json`, `interview-eval-v2.ts`, `interview-eval-v2-check.ts`, `interview-eval-manifest-v2.json`, `interview-eval-supplemental.json` | Frozen references; bytes unchanged. |
| This iteration (P3 correction) | `interview-corrected-dev.json`, `interview-corrected-supplemental.json`, `interview-corrected-demo.*`, `interview-corrected-live.*`, `interview-corrected-summary.json`, `browser-check-interview-corrected-*.png` | Two probe fixes + per-tab semantics; old-vs-new drift recorded, not hidden. |
| This iteration (single-pending correction) | `interview-final-dev.json`, `interview-final-supplemental.json`, `interview-final-demo.*`, `interview-final-live.*`, `interview-final-summary.json`, `browser-check-interview-final-*.png` | Single-opaque-pending elimination + s18/s19 regressions + mask/recreate next-selection assertions; prior generations untouched. |
| This tightening pass | `interview-tightened-dev.json`, `interview-tightened-supplemental.json`, `interview-tightened-demo.*`, `interview-tightened-live.*`, `interview-tightened-summary.json`, `browser-check-interview-tightened-*.png` + `*-nextbanner.png` | Unusable-token disclosure (`s20`, reason + selected-file wording, clean/contradiction cases byte-identical) + per-tab FULL next-banner equality + cropped banner shot per report; prior generations untouched. |
| Prior iteration | `interview-iteration-dev.json`, `interview-iteration-supplemental.json`, `interview-iteration-demo.*`, `interview-iteration-live.*`, `interview-iteration-summary.json`, `browser-check-interview-iteration-*.png` | Pending-first core outputs; kept untouched. |

## Details

| Topic | Decision |
|-------|----------|
| Public seam | `analyze(snapshot, scenarioId)` in `analyze.ts`: pure, deterministic, immutable input (throws if mutated). Same code runs in CLI and browser via a Bun-bundled `browser-core.ts`; no duplicate browser implementation. Pending-first helpers live in `pending.ts` (`selectNext` now takes a watched guard); pure order ranks live in `order.ts`. |
| Collector | `collect.ts` reads immediate root regular videos only (unchanged this round; old captures replayed, no media rescan). Creation = Windows `birthtimeNs`, ns strings, `BigInt` ordering, before/after stability flags. ffprobe not wired: duration stays unavailable rather than faked. |
| Label grammar | `parse.ts` unchanged: conservative token/marker/delimited-suffix candidates; title stems never required to match; competing claims never reduce to absent. |
| Browser check | `browser-check.ts` drives real headless Edge over CDP against offline `file://` reports. Every tab is now semantic: heading selects its case, snapshot/result equal the SAME `analyze()` recompute (verdicts, assignments, next file+episode, reason), rendered rows match field-by-field, and the rendered next banner EQUALS the full expected banner line built from the stored selection (selected: episode+basename+full reason; abstention: full stored reason, never a truncation) — covering Mushoku13 live, guided 13 inversion, and unknown-context tabs. A dedicated cropped screenshot of the first tab's next banner is saved per report (`*-nextbanner.png`) beside the full-page evidence shots. First-tab controls stay full strength (pending-only mask with path-leaf-is-alias + watched anchors/dirs/dates/sizes/tags checks + next selection still naming the masked row at the same episode, tie intervals, recreate ns with next selection unchanged, exact restore x3, opened evidence). The summary records `controlsScope` so the first-tab-only control coverage is machine-visible. Shared helpers live in `browser-check-helpers.ts` (expected-banner builder, strengthened `bannerOk`, moved `pageState`, cropped-clip capture, `PageState` next-selection fields); the former local `watchedSet` duplicate now reuses that import, no duplicate inference. `--output-prefix interview-tightened` writes `interview-tightened-summary.json` and `browser-check-interview-tightened-*.png` without touching prior summaries. Default positional two-file usage is unchanged. |
| Limitations | Reference labels are proxies, not video-content truth. Content/memory checks of discrepancies stay out of scope. No duration/probe evidence. No production integration. Finite-corpus counts are not calibrated future probabilities; no 99% population claim is made here. |

## Checklist

- [ ] `interview-tightened-demo.html` / `interview-tightened-live.html` open offline with 28 / 4 verified tabs, actual-next banners, watched/pending partitions, and pending-only in-memory controls
- [ ] `--demo --validate` passes 28 scenarios (20 original + 3 pending + 2 P3 + 2 single-pending + 1 disclosure), frozen dev 7/7 and supplement 4/4 GREEN
- [ ] `interview-final-live` is a `--recompute` replay of immutable `final-live.json` (no new media scan); drift recorded, new results validated
- [ ] `browser-check.ts --output-prefix interview-tightened` proves per-tab snapshot/result/rows/FULL-next-banner semantics + pending-only mask (leaf-is-alias, next still names the masked row at the same episode) + recreate next-invariance + exact restore + opened evidence + cropped next-banner shot per report, with zero exceptions and zero external requests
- [ ] Old `demo/live/replay/verify-*/corrected-*/final-*/ready-*` and every `interview-eval*` / `interview-baseline*` artifact untouched
- [ ] No file outside `tools/episode-triage-poc/` touched; no commits made

## Next step

Independent verifier (P4) runs the frozen development/supplemental checks,
the blind held-out evaluation, and the real offline browser pass, then owns
assessment. This prototype stays on its branch; nothing here is production.
