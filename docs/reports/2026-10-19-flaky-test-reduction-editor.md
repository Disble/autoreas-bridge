# Flaky-test reduction — Editor profiling (EpisodeDurationsSection and covers)

T3 of `odd/tasks/flaky-test-reduction.md`, specs S1–S3. Direct profiling of the two files the earlier
exploration flagged (`EpisodeDurationsSection.test.tsx`, `AnimeEditorWorkspace.covers.test.tsx`), with
`AnimeEditorListPanel.test.tsx` as the T4 control. **T3 conclusion: report only — the one permitted
experiment failed and was reverted, so no T3 source or test change remains.** The later T4 unit in this
same document reproduces one invalid assertion coupling in a retained scenario and keeps a test-only
scoping fix; see its section below.

## Method

Three isolated repetitions per file with the spec's exact command plus `--reporter=json` (per-test
durations, exit code, wall clock), and one extra default-reporter run per file for Vitest's own phase
breakdown. The historical figures were not produced by this reporter, so they are listed but not compared
one-to-one. No other test or gate ran during measurement.

| File (tests) | Fresh wall, median of 3 | Vitest total | Historical | Tests over 5 s |
|---|---:|---:|---:|---:|
| `EpisodeDurationsSection.test.tsx` (16) | 7.40 s | 6.84 s | ~6.1 s | 0 |
| `AnimeEditorWorkspace.covers.test.tsx` (7) | 4.53 s | 3.89 s | ~2.7 s | 0 |
| `AnimeEditorListPanel.test.tsx` (9, T4 control) | 3.81 s | 3.24 s | — | 0 |

All runs exited 0 (EDS 16/16, covers 7/7, control 9/9): no failure and no flake was reproduced in any
repetition, so this unit eliminates nothing.

## Runner cost vs test work

Vitest's own phase numbers, **one default-reporter run per file** (not medians), and they are not
additive or provably non-overlapping — EDS's five phases sum to 6.89 s against a 6.84 s total, so treat
them as attributions of the same wall clock, not as five disjoint costs.

| Phase | EDS | Covers | Control |
|---|---:|---:|---:|
| transform | 0.16 s | 0.47 s | 0.46 s |
| setup | 0.16 s | 0.17 s | 0.16 s |
| import | 0.47 s | 1.37 s | 1.36 s |
| environment | 0.54 s | 0.53 s | 0.57 s |
| tests | 5.56 s | 1.72 s | 1.03 s |

So the workspace files (covers, control) carry a ~2.5 s per-invocation burden against 1.0–1.7 s of test
bodies, while EDS is mostly test bodies over a ~1.3 s burden.

## Where the EDS test time goes (estimate, not a measured schedule)

Median per-test durations over the three runs: sum 5 572 ms, slowest `saves the card edits…` 734.6 ms
(max 735.8), then `runs a re-analysis…` 502.0, `renders one batch of a long review…` 495.1,
`renders one batch of a long series…` 478.7. Fourteen tests sit at a 275–352 ms floor or above; two
(`renders nothing while no record is loaded`, the `renderHook` test) are ~1 ms because they never await a
read.

A transient probe (written, run three times, deleted — `git status` confirms it is gone) rendered the real
hook and card against an immediately-resolving fake source and spied `window.setTimeout`: observed numeric
delays `[250, 1000, 0]` and render→row elapsed 298.6 / 300.9 / 301.6 ms. The 250 ms is the product's
`EPISODE_DURATIONS_RELOAD_DELAY_MS` debounce in `use-episode-durations-load.ts`; the 1 000 and 0 ms timers
are Testing Library's. From that floor and at least one test awaiting a second read after Save, the delay
accounts for an **estimated** 3.5–4.0 s of the 5.56 s test phase; the remainder is render and assertion
work. The per-test load schedule itself was not measured, so this is an attribution, not a sum.

## The permitted experiment: narrowly scoped timer control — FAILED, reverted

Hypothesis: one representative load/save/reload flow (the 734.6 ms `saves the card edits…`) can settle its
scheduled read by activating fake timers only for the two timer functions the debounce uses
(`vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`), advancing the real delay inside `act`
with `vi.advanceTimersByTimeAsync(EPISODE_DURATIONS_RELOAD_DELAY_MS)`, and restoring real timers before
every Testing Library async interaction. No `setTimeout` shim, no product delay change, no test-only
production parameter, no pinned constant.

Result, preserved verbatim (single-run JSON output, no retry):

```
$ bun --cwd="frontend" run test -- src/features/anime-editor/ui/EpisodeDurationsSection/__tests__/EpisodeDurationsSection.test.tsx -t "saves the card edits through their own binding" --reporter=json
exit 1    Tests  1 failed | 15 skipped (16)
  failed  1446.1 ms  EpisodeDurationsSection own draft saves the card edits through their own binding, clears the draft and reads the rows again
  AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
```

One diagnostic run of the same experiment pinned the mechanism: `timerCountAfterAdvance=0` for the
mount-scheduled read (advanced and settled) but `timerCountAfterAdvance=1` for the Save-scheduled one. The
Save click only *starts* an async chain (`saveEpisodeDurations` promise → draft revision update → effect),
so with a fresh fake clock the advance runs before that chain schedules the reload; the reload timer is
created after the clock already moved and is then discarded by `vi.useRealTimers()`. The load-only leg
works, the save/reload leg does not, and per the task boundary no second design was attempted. The test
file was restored to its exact baseline (`git diff` clean for it).

## Fault detection (applied, observed, restored — before and after)

The measured suite is byte-identical to the baseline. The dropped-draft fault proves relevant assertions detect broken behavior; changing the delay only probes whether timing is asserted.

| Applied fault | Observed | Restored |
|---|---|---|
| `EPISODE_DURATIONS_RELOAD_DELAY_MS = 0` | EDS 16/16 pass, exit 0 — the delay value is not pinned by any assertion | `git diff` clean |
| `toEpisodeDurationRowViews(load.section, [])` (draft edits dropped) | EDS 3 failed / 13 passed, exit 1: `keeps a hand edit in the card draft…`, `keeps the draft and shows the save failure in the card`, `keeps the draft and its footer when the table is hidden…` | `git diff` clean; re-applied after the reverted experiment and failed the same three, exit 1 |

## Why no edit is justified

1. The dominant EDS cost is deliberate product behavior (one disk read per burst of record reloads, plus
   250 ms of initial-paint latency). No existing test pins the value, so changing it would alter
   user-facing timing silently; adding a test that pins it is exactly what the project forbids.
2. The evaluated timer-control design failed the representative save/reload flow and was reverted.
   This does not establish that all fake-timer designs are unsafe; advancing after the asynchronous
   save chain schedules its reload was not evaluated in this bounded pass. No speedup is claimed.
3. No measured waste exists in the allowed production surfaces: the cover hooks are already window-scoped,
   `planAnimeEditorCoverRequests` skips re-resolution, the placeholder pass bails out on an unchanged
   cache, and the two heavy covers tests are the two that legitimately save/reload twice and grow the
   window 20→40 rows with 16→24 asserted lookups.

## T4 signal (control timing only)

The control's slowest median test is 216.0 ms and its test-body phase is 1.03 s. These isolated runs
reproduced no failure, so they carry **no evidence about the failing loaded run**: a fast isolated baseline
neither supports nor refutes a load-induced cause. The section below reproduces the failure itself from
the test's own mount, and it is an assertion-scope defect rather than a rail loading-state defect.

## T4 — reproduced and fixed: the rail's status rule was a whole-workspace query

`AnimeEditorListPanel.test.tsx` → "renders no status region and no placeholder once the library request
resolved" asserted `expect(screen.queryByRole('status')).toBeNull()`. That query is not the rail's rule:
the editor renders independent `role="status"` regions, and the assertion instant can see one of them
while the rail is resolved.

| Region | Owner | Path:line |
|---|---|---|
| Library rail | the list's own read | `AnimeEditorListPanel.tsx:31` gate, `:32` region |
| Anime data header cover | the saved-cover read | `AnimeEditorHeaderCover.tsx:29` |
| Episodes table | the section read | `EpisodeDurationsTable.tsx:25` |
| Schedule week | the board read | `AnimeScheduleCard.tsx:33` |

Only the rail and the Schedule card are reachable here: the record carries no saved cover, so the header
is the placeholder, and the Episodes card is collapsed, so its table (and region) never mounts. The
Schedule card is the live sibling: `use-anime-editor-schedule.ts:100` starts the board read as soon as a
selection exists and `:48` sets `status: 'loading'` synchronously, while the rail row appears one commit
after `getAnimes()` settles (`use-anime-editor-list.ts:44` and `:47` are the same batch; the row gate is
`AnimeEditorListPanel.tsx:53`).

**Reproduced, deterministically, in the case itself.** The case now holds the Schedule card's own read
pending, so the independent region is on screen beside the resolved rail (`getAnimeEditorScheduleBoard`
returning a never-resolving promise — a slow or hung start reads the same way — isolated with
`mockReturnValueOnce`). With the old unscoped assertion, that retained state fails:

```
AssertionError: expected <div …(3)>…(2)</div> to be null
1 failed | 8 passed (9), exit 1
```

The earlier transient probe observed the same violation the long way and named the matched region:
`queryAllByRole('status')` received `['anime-schedule-week-loading-label']` at the
`await screen.findByText('Frieren')` instant. The unscoped query fails whenever the board's `loading`
commit lands before the assertion and its `failed` commit after it; with the mock the file shipped
(`vi.fn()` → `undefined`) that window is one microtask. No original trace of the historical failure
exists here, so the retained scenario evidences an invalid assertion coupling — it does not identify the
historical failure's cause. Whether the row can appear before the rail's own loading is complete is
**not** a factor: the region (`:31`) and the row (`:53`) read the same `isLoadingList`, set together at
`use-anime-editor-list.ts:44`/`:47`.

**Guard-removal proof.** With the rail's region un-gated (`AnimeEditorListPanel.tsx:31` → `{true &&`),
everything else untouched, the scoped assertion fails: `AssertionError: expected <div …(4)>…(7)</div> to
be null`, `1 failed | 9 skipped`, exit 1. Restored, the file is green, so the scoped query still guards
the rail's own loading state.

**T4 checks.** Unscoped assertion in the retained scenario `1 failed | 8 passed` (exit 1); scoped final
`9 passed` (3.70 s, exit 0); guard-removal `1 failed | 9 skipped` (exit 1); folder suite `23 files / 255
tests passed` (12.04 s, exit 0); `bun --cwd="frontend" run typecheck` exit 0; `git diff --check` exit 0
(the same pre-existing CRLF warning for the untouched T2 file).

**Retained change (test only, 7 inserted / 1 deleted).** The case holds the sibling read pending, asserts
that sibling region through its accessible name, and states the rail's own rule:

```diff
   it('renders no status region and no placeholder once the library request resolved', async () => {
     mockSource.getAnimes.mockResolvedValue([SCHEDULED_ANIME]);
+    // The Schedule card reads on its own. Leaving that read pending holds its
+    // loading region on screen beside the resolved rail, so the rule below is
+    // the rail's own loading state -- not "no status region in the workspace",
+    // which no card can promise while a sibling read is still in flight.
+    mockSource.getAnimeEditorScheduleBoard.mockReturnValueOnce(new Promise(() => undefined));

     renderWorkspace();

     await screen.findByText('Frieren');
-    expect(screen.queryByRole('status')).toBeNull();
+    expect(await screen.findByRole('status', { name: 'Loading the week schedule' })).toBeInTheDocument();
+    expect(screen.queryByRole('status', { name: 'Loading anime list...' })).toBeNull();
     expect(screen.queryByTestId('anime-editor-skeleton-row')).toBeNull();
   });
```

`mockReturnValueOnce` isolates the pending read to this case, so the other cases keep the
immediately-settling board mock they were written against.

**T4 residual uncertainty.** The historical failure's own observation type is unknown, and no trace of it
survives in this repository; this unit evidences an invalid assertion coupling in a retained,
deterministic scenario, not the cause of that run. A load-bound `findByText` timeout stays an
alternative and is not excluded. Production files are byte-identical (`AnimeEditorListPanel.tsx` 64,
`use-anime-editor-list.ts` 56); T4's only changed surface is the test file at 190 lines (was 184).

## T5 blocker correction — schedule-feedback second-apply payload

The final gate's single failure was `AnimeEditorWorkspace.schedule-feedback.test.tsx` line 261: the second
apply payload confirmed `bang-dream` still on `Sin ver#2`, `futsutsuka` absent, and the later `Visto`
orders shifted. It was not a timeout.

**Reproduced.** The focused file passes without coverage (4.55 s, 1/1) and fails on the first try under
the gate's native coverage config (9.89 s, 1/1 failed, exit 1) with the exact payload recorded in
`.pi/artifacts/flaky-test-reduction-final-gate.log` lines 765–848. The received draft was
`Sin ver [youjo-senki-ii#1, bang-dream#2]`, `Visto [futsutsuka#1, yani-neko#2, sayonara-lara#3,
iwamoto#4, tai-ari#5, tenmaku#6]`.

**Mechanism (matches the payload exactly).** A rejected apply sets the conflict board and the feedback in
one commit; the draft resets to that board in a passive effect (`use-anime-schedule-draft-sync.ts`
`[props.board]`). The pre-fix failure was reproduced under coverage, where feedback readiness alone
was insufficient before the test drove the next moves. A first move on the old draft followed by the
board reset explains the shifted payload: `bang-dream` returns to `Sin ver`, while the second and third
moves apply afterwards. Waiting for the intended reset fixes the reproduced failure without changing
production. The probe does not isolate instrumentation itself as the causal scheduler.

**Fix (test-only, +5 lines).** Wait for the reset's own observable state — `0 schedule changes`, which
the footer renders only once the draft equals the conflict board — before the second batch of moves. The
gate sits after the first-apply payload assertion and before any drive, so it cannot mask a payload and
does not retry one. The pre-existing 4 000 ms `findByDisplayValue` timeout and every expected row are
untouched.

**Evidence** (full output in `.pi/artifacts/flaky-schedule-correction.log`):

| Check | Result |
|---|---|
| Focused, post-fix | 1/1 passed, exit 0 (3.26 s) |
| Native coverage config, pre-fix | 1/1 failed (the gate payload), exit 1 |
| Native coverage config, post-fix | 1/1 passed; exit 1 only because the whole-set per-file thresholds see unrelated adopted files at 0% in a single-file run — not tier-gate proof |
| Ordinary `--coverage` (project config), post-fix | 1/1 passed, exit 1 for the same threshold reason |
| Folder `AnimeEditorWorkspace/__tests__` | 23 files / 255 tests passed, exit 0 (15.56 s) |
| `bun --cwd="frontend" run typecheck` | exit 0 |
| `git diff --check` | exit 0 |

**Limits.** One test file changed, no production code, so a production mutation score is N/A. Full-suite
green is not claimed; the parent verifier owns the skipped render/layout smokes and the limited blocker
recheck.

## Residual uncertainty and skipped checks

- Suite runs parallelize files (35 files / 396 tests / 16.20 s wall with summed per-worker phases), so
  isolated file totals overstate what any fix could have bought. Historical 6.1 s / 2.7 s could not be
  re-derived with this method; the difference is unattributed.
- Parent-owned and skipped here: staged mutation (no production change), coverage/gates during
  measurement, commits. `git diff --check` exit 0 also prints a pre-existing CRLF warning for the
  uncommitted T2 file, which this unit did not touch.
- T3's final changed surfaces: this report only. Unchanged and byte-identical: `EpisodeDurationsSection.test.tsx`
  357, `AnimeEditorWorkspace.covers.test.tsx` 272, `use-anime-editor-cover.ts` 36,
  `use-anime-editor-covers.ts` 189. T4 (above) additionally retains the scoped assertion and the pending
  Schedule read in `AnimeEditorListPanel.test.tsx`.
