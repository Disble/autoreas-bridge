# Archive Report: 2026-09-14-sdd-74-mobile-covers

**Archived**: 2026-09-15
**Change**: Mobile cover thumbnails — `GET /api/animes/{id}/cover` and a shared thumbnail pipeline reused by the desktop binding
**Status**: Complete and verified (PASS WITH WARNINGS)
**Mode**: OpenSpec authoritative, Engram mirror
**Branch**: `feat/sdd-74-mobile-covers` (not yet merged to `dev`; no pull request, by user instruction)

## Summary

Mobile needed an offline-friendly cover endpoint with truthful outcomes. The bridge now serves each anime's
cover as a JPEG thumbnail under a fixed v1 spec (320 px height fit, never upscaled, JPEG q80, strong ETag of
the served bytes). A thumbnail is generated once per source identity into a write-once, spec-versioned disk
cache, under a two-slot generation gate. The route answers an ordered decision table (405, 401, 404, 503,
204, 503 with an estimable `Retry-After`, 304, 200). The capture middleware records image responses without
their bodies. The desktop `GetAnimeCover` binding keeps its Wails contract but now serves the same thumbnail
instead of the original bytes, and the superseded `Resolver.Resolve` path is deleted. ADR-024 records the
cache decision with a measured corpus receipt.

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| anime-cover-thumbnails | Created | New capability at `openspec/specs/anime-cover-thumbnails/spec.md` (6 requirements): thumbnail spec v1, source identity, write-once versioned cache, two-slot concurrency, desktop binding reuse |
| mobile-cover-endpoint | Created | New capability at `openspec/specs/mobile-cover-endpoint/spec.md` (4 requirements): evaluation order, strong-ETag 304 revalidation, `Retry-After` rules, OpenAPI consumer note |
| observability | Updated | ADDED "Image Response Bodies Are Omitted From Capture, Not Their Metadata" to `openspec/specs/observability/spec.md`, placed after "Response Body Capture Is Scoped to Failed Requests" |

## Verdict at close

- 11/11 requirements, 27/27 scenarios, 43/43 tasks.
- Warnings carried from `verify-report.md`, none blocking:
  1. `ditto` produced no mutants for WU5a's media-type guard; four hand-mutations stood in and all died.
  2. 13 surviving mutants: WU3's eleven are equivalent or unobservable; WU6's two are `NewDefaultResolver(0)` → ±1.
  3. Execution-rule trial: rule 5 ("ditto at most twice") failed in three of eight units.
  4. Task 3.7's `wails build` was deferred to WU6 and ran there and in final verification.
  5. A gate-only flaky test (`TestThumbnailServiceReusesURLSidecarIdentity`) was rewritten without filesystem races.
  6. Units were verified as index-tree checkpoints first, then replayed into commits through the real gate.

## Delivery

| # | Commit | Unit |
|---|---|---|
| 1 | `a0d93a5` | WU1 typed cover loading and truthful origin outcomes |
| 2 | `7cac4d0` | WU2 write-once raw and derived thumbnail cache |
| 3 | `c4db9c1` | WU3 v1 thumbnail transform and two-slot service |
| 4 | `cbab557` | WU4 `GET /api/animes/{id}/cover` |
| 5 | `a18ceae` | WU5a image bodies omitted from capture, OpenAPI route |
| 6 | `daa9cdb` | WU5b ADR-024 with measured receipt |
| 7 | `e3e950d` | WU6 desktop binding through the shared service |
| 8 | `64ce982` | WU6b removal of the superseded `Resolve` path |
| 9 | `9158361` | SDD artifacts, execution rules and verification report |

## Final state vs. the snapshot artifacts

- **Verify envelope.** `verify-report.md` as committed in `9158361` had no `gentle-ai.verify-result/v1`
  envelope, so native status held archive `blocked`. On 2026-09-15 the orchestrator re-ran
  `go test -p=4 -count=1 ./...` (exit 0, 48 packages ok) and `go build ./...` (exit 0, empty output) on
  `9158361` and prepended the envelope, with `evidence_revision` = SHA-256 of `git ls-tree -r 9158361`.
  `gentle-ai sdd-verify-validate --requirements 11 --scenarios 27` returned valid and native status moved
  to archive `ready`.
- **Mobile coordination (2026-09-15).** The mobile-team peer session confirmed the final contract with no
  divergence: 320 px height accepted; GET only, never HEAD; ETag stored and returned verbatim; every 503
  transient, with `Retry-After` honored and clamped to one hour; 204 rechecked after 7 days and 404 after
  24 hours, which also covers bridges older than this change; foreground sweep after resync at concurrency 2;
  on 401 the sweep stops without touching per-cover `checkedAt`. The mobile cover client is not built yet
  (only the card UI, on mobile branch `feat/anime-card-cover-layout`), so these are design commitments, not
  checks against code.
- **Caveat sent to mobile.** 116x180 MyAnimeList covers pass through at 180 px (never upscaled, ADR-024
  corpus: 6 of 9 real covers), so on-device upscaling is expected for them. This is a source limit, not a
  contract divergence.

## Open follow-ups (not blocking)

- WU6's two `NewDefaultResolver(0)` → ±1 survivors (`-1` is equivalent; `1` is left to WU1's budget tests).
- WU3's eleven equivalent survivors, recorded in `apply-progress.md`.
- The execution-rule trial in `docs/sdd-work-unit-execution.md`: rule 5 failed in three of eight units and
  needs a promotion decision.
- Merge `feat/sdd-74-mobile-covers` into `dev`, then notify the mobile team.

## Traceability

**Archived to**: `openspec/changes/archive/2026-09-14-sdd-74-mobile-covers/`
**Engram topic key**: `sdd/2026-09-14-sdd-74-mobile-covers/archive-report`
**Decision record**: `docs/adr/024-cover-thumbnail-cache.md`
