# Tasks — sdd-44-sinver-live-availability

## wu1 — RecheckAvailability: Sin-ver created rows (backend)

Spec: "Daily availability recheck" (widened eligibility, scope-of-write, notification
scope unchanged, no side effects, non-regression). Design: `internal/season/service.go:307-345`,
`ports.go:68-70` (`AnimeGateway.CurrentPlacements`, already exists — no new port).

- [x] 1.1 Write failing tests FIRST in `internal/season/availability_test.go` (extend
      `fakeGateway.placements`, already wired at `availability_test.go:32,69-77`):
  - created + matched + section "Sin ver" + probe returns 3 chapters →
    `AvailableChapters == 3`, `Availability` stays `AvailabilityCreated`,
    `res.Checked` incremented, row's name NOT in `res.Available`
  - created + section "Ver hoy" → not probed, row unchanged
  - created + section "Visto" → not probed, row unchanged
  - created + empty/absent placements entry → skipped, row unchanged (parity with
    today's unresolvable-row behavior)
  - `gateway.CurrentPlacements` returns an error → all created rows left
    untouched, but the existing matched-uncreated path (`TestRecheckAvailabilityMarksAvailableNeverCreates`)
    still runs and the call does not fail as a whole
  - idempotency: two consecutive `RecheckAvailability` calls with a stable probe
    leave the Sin-ver created row identical
  - confirm existing assertions in `TestRecheckAvailabilityMarksAvailableNeverCreates`
    and `TestRecheckAvailabilityReportsOnlyNewTransitions` (matched-uncreated path,
    `service.go:317-343` today) still pass unmodified — non-regression
- [x] 1.2 Implement the `RecheckAvailability` relaxation in `internal/season/service.go`
      to make 1.1 pass:
  - before the loop, collect `AnimeID`s of rows where `Availability == AvailabilityCreated
    && MatchStatus == MatchMatched && AnimeID != ""`
  - one batched call: `placements, err := s.gateway.CurrentPlacements(ctx, animeIDs)`;
    on error, treat every created row as ineligible this run (no fail — mirrors the
    per-row probe-error tolerance already in this method)
  - in the loop, keep the existing matched-uncreated path unchanged; add a second
    path for created rows whose `placements[row.AnimeID][0].Dia == sinVerSection`:
    probe → write `AvailableChapters` ONLY (never `Availability`, `MatchStatus`,
    or `AnimeID` — ADR-3); increment `res.Checked`; never append to `res.Available`
    (ADR-4)
  - update the method's doc comment (`service.go:301-306`) to reflect that
    `res.Checked` now counts both matched-uncreated and Sin-ver-created probes
  - do NOT add a second nil-guard: `s.probe`/`s.gateway` are wired together by
    `SetAvailabilityDeps` (`service.go:104-106`) and are never independently nil
    (design's nil-dep invariant)

## wu2 — DailyBoard Sin-ver enrichment (frontend)

Spec: "Stage animes across Estrenos sections" (chapter count text, open-page link,
Ver hoy/Visto rendering unchanged). Design: mirror `IntakePanel.tsx:110-182` wording/
pattern; new helpers only in `daily-board.helpers.ts` (ADR-2, no cross-feature import);
`use-daily-board.ts` unchanged (data already flows via `SeasonAnimeRow.availableChapters`/
`matchedSlug`).

- [x] 2.1 Write failing tests FIRST in
      `frontend/src/features/season/ui/DailyBoard/__tests__/daily-board.helpers.test.ts`:
  - `formatAvailableChapters`: `0` → "0 chapters available", `1` → "1 chapter
    available" (singular, no trailing "s"), `5` → "5 chapters available"
  - `getSinVerAvailabilityIndicator`: `availableChapters >= 1` → `{ color:
    'success', label: 'N chapters available' }`; `availableChapters === 0` →
    `{ color: 'danger', label: 'No chapters online yet' }`
- [x] 2.2 Implement `formatAvailableChapters(count: number): string` and
      `getSinVerAvailabilityIndicator(row: SeasonAnimeRow): { color: 'success' |
      'danger'; label: string }` in `daily-board.helpers.ts` (both exported, JSDoc'd
      per frontend constraint #6) to make 2.1 pass. Do NOT import from
      `intake-panel.helpers.ts` (ADR-2 — colocation + semantically different labels
      for already-created rows).
- [x] 2.3 Write a failing test FIRST in
      `frontend/src/features/season/ui/DailyBoard/__tests__/DailyBoard.test.tsx`:
      a Sin-ver row with `availableChapters: 5` and a non-empty `matchedSlug`
      renders "5 chapters available" text, an open-page link icon (only when
      `matchedSlug !== ''` — add a second case with an empty `matchedSlug` asserting
      no link renders), and the availability dot; the existing Ver hoy/Visto
      byte-for-byte rendering assertions (`DailyBoard.test.tsx:84-97`) stay green
      unmodified (non-regression, spec scenario "Ver hoy / Visto rows are
      unaffected")
- [x] 2.4 Implement the Sin-ver row enrichment in `DailyBoard.tsx` (currently a bare
      `LabeledCheckbox + rawName`, `DailyBoard.tsx:74-89`) to make 2.3 pass: chapters
      text via `formatAvailableChapters`, an open-page link icon mirroring
      `IntakePanel.tsx:116-132`'s `linkIcon`/`Tooltip` anchor pattern
      (`href={row.matchedSlug}`, gated on non-empty), and an availability dot
      mirroring `IntakePanel.tsx:171-182` driven by `getSinVerAvailabilityIndicator`.
      Keep `DailyBoard.tsx` dumb UI (frontend constraint #1) — all derivation stays
      in the 2.2 helpers. Ver hoy/Visto group rendering (`DailyBoard.tsx:102-121`)
      MUST NOT change.
- [x] 2.5 Verify `use-daily-board.ts` needs NO code change (design: render-only WU,
      `groupCreatedBySection` already passes `availableChapters`/`matchedSlug`
      through unmodified). Add one regression assertion to
      `use-daily-board.test.ts` confirming a Sin-ver row's `availableChapters`
      flows unchanged into `sections.sinVer` — this guards the render path the wu1
      backend fix feeds, without requiring any hook change.

## Gate

- [x] 3.1 Full pre-commit gate green on every commit: `go run ./tools/checkgofilesize`,
      `go vet ./...`, `gofmt -l .` (no output), `go test ./...`, frontend
      lint/typecheck/vitest, `bun --cwd="frontend" run filesize:warning` (advisory,
      non-blocking)

## Review Workload Forecast

- **wu1 (backend)** estimated changed lines: ~80-100 in `service.go` (doc comment +
  id-collection + batched call + two-path loop) + ~150-200 in `availability_test.go`
  (6 new test cases plus fake-gateway placement fixtures) ≈ **230-300 lines**.
- **wu2 (frontend)** estimated changed lines: ~30-40 in `daily-board.helpers.ts`
  (2 JSDoc'd helpers) + ~50-70 in `DailyBoard.tsx` (link icon/tooltip/dot markup) +
  ~30-40 in `daily-board.helpers.test.ts` + ~20-30 in `DailyBoard.test.tsx` + ~5-10
  in `use-daily-board.test.ts` ≈ **135-190 lines**.
- **Chained PRs recommended: No.** The two WUs are already orthogonal with no
  shared code seam (design's stated shape) and each stays comfortably under a
  400-line review budget on its own.
- **400-line budget risk: Low** for both WUs individually. Combined total (~370-490
  lines) only matters if forced into a single PR, which nothing here requires.
- **Decision needed before apply: No.** Ship as two independent PRs (backend then
  frontend, or in parallel) — no `size:exception` needed.
