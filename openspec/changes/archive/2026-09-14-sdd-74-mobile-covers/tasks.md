# Tasks: SDD-74 Mobile Covers

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1,600–2,000 additions + deletions across eight local commits |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Local commit chain required | Yes |
| Suggested split | WU1 → WU2 → WU3 → WU4 → WU5a → WU5b → WU6 → WU6b |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: No
Local commit chain required: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

## Measured sizing rationale

The forecast uses the design's `wc -l` comparables rather than an eyeballed estimate: the current
cover package is 378 production / 579 test lines; `sync_diagnostics_handler.go` plus its tests is
133 / 168; the cover-route OpenAPI analogue is 275 YAML lines; ADR-022/023 are 174 / 157 lines;
and the existing desktop cover tests are 156 lines. Cache mechanics remain their own WU2. WU3
combines the 90–120 production / 110–150 test transform comparable with the 90–110 production /
100–130 test service comparable (about 390–510 changed lines): that is below the confirmed 800-line
hard ceiling and is the smallest honest unit that lets the exported `thumbnail.Transform` have the
same-commit `cover.ThumbnailService` production consumer. WU5 remains split because combining the
275-line OpenAPI analogue, a 157–174-line ADR, and capture tests would exceed the review budget.

Each unit below is one local, independently reversible commit on `feat/sdd-74-mobile-covers`; do
not create a PR. The 800 changed-line ceiling is a hard stop, while the listed smaller budgets
preserve the 400-line review target wherever the production-consumer constraint permits. Stage only
the unit's production Go before its `ditto` run; it must judge those staged bytes. No changed
production export may lack a same-commit production consumer. Record focused-test and mutation
results in work-unit notes/commit metadata, not by changing unrelated source.

## Execution discipline from WU4 (trial, adopted 2026-09-14)

WU4 onward follows the provisional rules in `docs/sdd-work-unit-execution.md`:

- per-file budgets, written before RED, that the writer stops at instead of trimming afterward;
- lean test rules in the writer brief from the start;
- one verification pass per frozen candidate;
- `ditto` run `--dry` first, then at most twice, with `-json -p=4 -timeout 120s`;
- CPU-heavy commands strictly one at a time;
- `wails build` and `render:smoke` only in WU6 and final verification;
- pure deletions in their own unit (WU6b).

For each unit, `apply-progress.md` records budget against landed lines, size-refactor rounds, ditto runs, verification passes, and mutation score.

## 1. WU1 — Typed loading and truthful origin outcomes (about 270–340 lines)

**Start/dependency:** Current `cover.Resolver` and raw URL cache behavior; no prior WU required.
**Finish:** `Resolve` remains a compatibility adapter, but `Load` yields typed absent/gone/invalid/
transient outcomes with source identity and sanitized retry information. **Rollback:** revert only
this unit's `internal/anime/cover/` changes; pre-existing placeholder behavior resumes.

- [x] **1.1 RED — Add `internal/anime/cover/loader_test.go` and update `internal/anime/cover/http_fetcher_test.go`/`resolver_test.go` with failing tests named `TestResolverLoadClassifiesAbsentWithoutIO`, `TestResolverLoadBuildsLocalIdentityFromStat`, `TestResolverLoadClassifiesLocalMissingAndReadFailure`, `TestHTTPFetcherFetchRejectsLimitPlusOneWithoutReturningPrefix`, `TestHTTPFetcherFetchClassifiesOriginStatusAndRetryAfter`, and `TestParseRetryAfterClampsOnlyEligibleOrigins`; replace the truncation-pinning `TestHTTPFetcherFetchCapsBodyReadAtMaxBytes` and remove the impossible oversized-fetch fake expectation. <!-- sdd-owner: implementation -->
- [x] **1.2 GREEN — In `internal/anime/cover/types.go`, `resolver.go`, `http_fetcher.go`, and `production.go`, add the loader outcome model, `Stat`-based local identity, `limit+1` reading, structured origin status/retry handling, and lazy-compatible raw-cache use; retain `Resolve` as the same-commit consumer of `Load` and its sentinel classifications, and keep loader-only structs/functions package-private unless consumed now. <!-- sdd-owner: implementation -->
- [x] **1.3 TRIANGULATE — Extend the same tests for empty/`"null"`, missing versus non-missing local errors, URL cache hit/miss, declared and streamed oversize bodies, 403 versus 408/429/5xx, transport/cancellation errors, delta-seconds and HTTP-date retry values, malformed values, and the 1–3600 clamp; assert observable classifications and cache-write absence rather than error text or production constants. <!-- sdd-owner: implementation -->
- [x] **1.4 MUTATE — Stage only WU1 production Go, run `go test -count=1 ./internal/anime/cover/`, then run `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/anime/cover/"`; investigate every survivor on limit, status, retry, error, and cache-poisoning guards before proceeding. <!-- sdd-owner: implementation -->
- [x] **1.5 REFACTOR — Keep loader, fetch, and compatibility concerns in focused files below the 400 effective-line production ceiling; rerun `go test -count=1 ./internal/anime/cover/` and leave only this rollback boundary staged and commit-ready. Runtime harness: N/A, because this unit is covered by deterministic filesystem/HTTP-port tests and changes no desktop composition boundary. <!-- sdd-owner: implementation -->

## 2. WU2 — Write-once raw and derived cache mechanics (about 180–230 lines)

**Start/dependency:** WU1 source identities are available; transform generation is deliberately not
needed yet. **Finish:** raw cache writes and derived entries use unique temporary files, immutable
publish semantics, sidecars, and bounded cleanup. **Rollback:** revert this unit; leftover
`thumbs/v*/` and `*.sha256` files are inert to the pre-change raw cache and may be deleted.

- [x] **2.1 RED — Add `internal/anime/cover/thumbnail_cache_test.go` and extend `internal/anime/cover/disk_cache_test.go` with failing `TestThumbnailCacheRequiresMetadataCommitMarker`, `TestThumbnailCacheSeparatesSpecVersions`, `TestThumbnailCacheCleansOldVersionAndExpiredTemp`, `TestThumbnailCacheConcurrentWritersServeIdenticalBytes`, `TestDiskCachePutConcurrentWritersUseUniqueTemps`, and `TestDiskCachePutTreatsExistingFinalAsPublished`; use `t.TempDir()` and real concurrent filesystem writes, not a mocked rename result. <!-- sdd-owner: implementation -->
- [x] **2.2 GREEN — Add focused package-private cache files under `internal/anime/cover/` for canonical local/URL identities, the fixed `thumbs/v1/` JPEG-plus-metadata layout, URL SHA-256 sidecars, unique-temp write-once publication, metadata-last commit markers, rename-existing success, stale-version cleanup, and one-hour temp sweeping; repair `disk_cache.go` to the same unique-temp rule without changing its public `Cache` consumer contract. <!-- sdd-owner: implementation -->
- [x] **2.3 TRIANGULATE — Cover local identity replacement, URL sidecar persistence/lazy migration prerequisites, image-without-metadata miss, metadata/JPEG disagreement, cleanup failure degradation, and a Windows real-filesystem two-writer interleaving; assert the two readers receive identical final bytes and that no partial entry is served. <!-- sdd-owner: implementation -->
- [x] **2.4 MUTATE — Stage only WU2 production Go, run `go test -count=1 ./internal/anime/cover/`, then run `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/anime/cover/"`; inspect survivors in rename-exists, commit-marker, cleanup, and concurrent-writer guards. <!-- sdd-owner: implementation -->
- [x] **2.5 REFACTOR — Keep raw-cache repair and derived-cache mechanics in separate focused files, preserve all real-filesystem cases, rerun `go test -count=1 ./internal/anime/cover/`, and leave only the cache boundary staged and commit-ready. Runtime receipt: the named concurrent test must run on Windows; mocked rename success is explicitly insufficient. <!-- sdd-owner: implementation -->

## 3. WU3 — Pure transform and two-slot ThumbnailService (about 390–510 lines)

**Start/dependency:** WU1 loader and WU2 derived cache are present. **Finish:** the pure transform
implements v1 and its exported entry point is consumed in this same commit by `ThumbnailService`,
which differentiates bounded HTTP acquire from waiting desktop acquire. **Rollback:** revert this
unit; WU2 cache entries remain inert and no thumbnail service is wired yet.

- [x] **3.1 RED — Create `internal/anime/cover/thumbnail/transform_test.go` with failing `TestTransformTallImageFits320WithoutDistortion`, `TestTransformNeverUpscales`, `TestTransformPassesThroughValidShortJPEGBytes`, `TestTransformRejectsCorruptShortJPEG`, `TestTransformRejectsOverPixelCapBeforeFullDecode`, `TestTransformFlattensPNGAlpha`, `TestTransformUsesFirstGIFFrame`, `TestTransformDecodesWebP`, `TestTransformRejectsSVGICOAndBMP`, and `TestTransformETagHashesExactServedBytes`; add `internal/anime/cover/thumbnail_service_test.go` with failing `TestThumbnailServiceInvalidatesLocalIdentity`, `TestThumbnailServiceReusesURLSidecarIdentity`, `TestThumbnailServiceMapsPermanentAndTransientOutcomes`, `TestThumbnailServiceLimitsTransformsToTwo`, `TestThumbnailServiceHTTPReturnsSaturatedAfterBoundedAcquire`, and `TestThumbnailServiceDesktopWaitsForReleasedSlot`. <!-- sdd-owner: implementation -->
- [x] **3.2 GREEN — Add `internal/anime/cover/thumbnail/transform.go` and the minimal `golang.org/x/image` entries in `go.mod`/`go.sum`; implement DecodeConfig-first 16,777,216-pixel rejection, accepted decoders, complete decode before short-JPEG pass-through, opaque `#1B2636` flattening, Box pre-shrink plus CatmullRom, JPEG q80 encoding, and precomputed quoted SHA-256 ETag. Export only the transform API that `internal/anime/cover/thumbnail_service.go` consumes in this same commit. <!-- sdd-owner: implementation -->
- [x] **3.3 GREEN — Add the package-local `ThumbnailService` composition in `internal/anime/cover/`; load/cache outside its two-token guard, gate only decode/resize/encode, map source/cache/transform outcomes correctly, and return the fixed 5-second saturation estimate through one narrow service result. <!-- sdd-owner: implementation -->
- [x] **3.4 TRIANGULATE — Generate valid image inputs in test code rather than the current 11-byte JPEG sniff fixture, then cover cache-hit bypassing slots, local replacement producing a new ETag, URL raw-cache sidecar reuse, cache failures remaining transient, cancelled desktop waiting, HTTP acquire expiry, and at-most-two active transforms; use deterministic token-blocking channels, not sleep-based races, and assert bytes/outcomes/retry values rather than counters alone. <!-- sdd-owner: implementation -->
- [x] **3.5 TRIANGULATE — Add `internal/anime/cover/thumbnail/transform_benchmark_test.go` and run the selected path against the concrete read-only ten-cover corpus documented in `openspec/changes/2026-09-14-sdd-74-mobile-covers/explore.md` under “Measured cover distribution”; record per-cover or aggregate Go CPU/allocation results for ADR-024 and do not present the Pillow timing as Go evidence. moved to WU5b with the ADR-024 receipt (orchestrator, 2026-09-14). <!-- sdd-owner: implementation -->
- [x] **3.6 MUTATE — Stage only WU3 production Go and module files, run `go test -count=1 ./internal/anime/cover/ ./internal/anime/cover/thumbnail/`, then run `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/anime/cover/ ./internal/anime/cover/thumbnail/"`; mutation-check decode-cap, pass-through, dimensions, alpha, format, ETag, saturation, context, cache-miss, and outcome-mapping guards, directly invoking package-private defensive paths when scheduling cannot reach them. <!-- sdd-owner: implementation -->
- [x] **3.7 REFACTOR — Preserve the pure thumbnail boundary (no filesystem, HTTP, cache, semaphore, or desktop dependency), keep loader/cache/transform ports narrow, rerun `go test -count=1 ./internal/anime/cover/ ./internal/anime/cover/thumbnail/`, run `wails build` as the dependency boundary receipt, and leave only this unit staged and commit-ready. Runtime concurrency receipt: deterministic channel tests do not claim race-detector coverage. <!-- sdd-owner: implementation -->

## 4. WU4 — API cover route and typed transport seam (budget ≤ 540 lines; original forecast 260–320)

**Start/dependency:** WU3 exposes usable HTTP service outcomes. **Finish:** the method-less,
more-specific route returns the ordered contract while production desktop wiring intentionally leaves
the seam nil until WU6. **Rollback:** revert this unit; `/api/animes/{id}/cover` falls back to the
former 404 behavior.

**Budget (stop and report before exceeding; target ≤ 540 changed lines):**

| File | Budget |
|---|---|
| `contracts/cover_thumbnail.go` | ≤ 30 |
| `handlers/anime_cover_handler.go` | ≤ 140 (comparable `sync_diagnostics_handler.go`: 133) |
| `router_cover.go` | ≤ 40 |
| `router.go` + `server.go` | ≤ 6 (one row, one field) |
| `handlers/anime_cover_handler_test.go` | ≤ 200 (comparable: 168) |
| `router_cover_test.go` | ≤ 60 |
| `router_test_helpers_test.go` | ≤ +6 |
| artifact prose | ≤ 60 |

- [x] **4.1 RED — Create `internal/api/handlers/anime_cover_handler_test.go` and `internal/api/router_cover_test.go`, then extend `internal/api/router_test_helpers_test.go` so `stubAnimeQueryService` can return lookup errors; add one ordered decision table whose failing rows, not separate test functions, carry the scenario names `TestAnimeCoverRejectsHEADBeforeAuthentication`, `TestAnimeCoverRejectsPATCHWithoutMutation`, `TestAnimeCoverSoftDeletedAnimeReturns200`, `TestAnimeCoverLookupFailureReturns503WithoutRetryAfter`, `TestAnimeCoverMapsPermanentAndTransientOutcomes`, `TestAnimeCoverAppliesRetryAfterRules`, `TestAnimeCoverReturns304ForExactStrongETag`, and `TestAnimeCoverReturnsJPEGHeadersAndBody`. <!-- sdd-owner: implementation -->
- [x] **4.2 GREEN — Add the DTO/port in `internal/api/contracts/cover_thumbnail.go`, the handler in `internal/api/handlers/anime_cover_handler.go`, and `internal/api/router_cover.go`; add the one method-less `/api/animes/{id}/cover` table row and `api.Config` seam without enlarging `router.go` beyond its one row. Make the contracts DTO a same-commit handler consumer, and the exported handler builder a same-commit router-builder consumer. <!-- sdd-owner: implementation -->
- [x] **4.3 TRIANGULATE — Exercise every ordered HTTP row through `httptest`: 405 before auth including HEAD, 401, unknown 404, nil query/nil thumbnail/lookup error 503 without retry, empty/missing/invalid/403 204 with no content headers/body, 408/429/5xx/saturation 503 rules, soft-deleted 200, exact strong ETag 304/no body, stale/weak/malformed ETag 200, and PATCH proving no stored-field mutation. <!-- sdd-owner: implementation -->
- [x] **4.4 MUTATE — Stage only WU4 production Go, run `go test -count=1 ./internal/api/ ./internal/api/handlers/`, then run `ditto staged --dry --exclude-prefix frontend/ --exclude-prefix internal/anime/` and at most two runs of `ditto staged --exclude-prefix frontend/ --exclude-prefix internal/anime/ --threshold 0.80 --test-command "go test -count=1 -json -p=4 -timeout 120s ./internal/api/ ./internal/api/handlers/"`, one command at a time; inspect survivors in precedence, nil-seam, status, ETag, and Retry-After branches. <!-- sdd-owner: implementation -->
- [x] **4.5 REFACTOR — Keep route construction, handler policy, and transport DTOs in their planned files, rerun `go test -count=1 ./internal/api/ ./internal/api/handlers/`, and leave this unwired-503 route boundary staged and commit-ready. Runtime harness: N/A; `httptest` is the transport integration harness, and WU6 owns desktop composition. <!-- sdd-owner: implementation -->

## 5. WU5a — Binary capture omission and OpenAPI consumer contract (budget ≤ 380 lines; original forecast 310–330)

**Start/dependency:** WU4 route behavior exists. **Finish:** every image response captures metadata
but no response body, and the additive endpoint contract is visible to mobile consumers. **Rollback:**
revert this unit; capture resumes current body retention and the route implementation remains
available but undocumented.

**Budget (stop and report before exceeding; target ≤ 380 changed lines):**

| File | Budget |
|---|---|
| `requestcapture/types.go` | ≤ +4 |
| `capture_middleware.go` | ≤ +25 (file: 262) |
| `capture_middleware_bodies_test.go` | ≤ +60, as rows in the existing table shape (file: 308) |
| `docs/openapi.yaml` | ≤ 250 (design analogue: 275) |
| artifact prose | ≤ 40 |

- [x] **5.1 RED — Extend `internal/api/capture_middleware_bodies_test.go` with failing `TestCaptureMiddlewareOmitsImageResponseBodyButPreservesMetadata`, plus a JSON/bodyless regression row; assert `image/jpeg` 200 captures nil body, `omitted_binary`, status, ETag, headers, and duration while non-image, HEAD, 204, and 304 behavior remains unchanged. <!-- sdd-owner: implementation -->
- [x] **5.2 GREEN — Add `CaptureStateOmittedBinary` in `internal/observability/requestcapture/types.go` and alter only `internal/api/capture_middleware.go` so case-insensitive `image/` responses suppress delivered bytes and terminal capture records retain headers/status/duration; consume the exported constant in the middleware in this same commit. <!-- sdd-owner: implementation -->
- [x] **5.3 TRIANGULATE — Add `GET /api/animes/{id}/cover` beside the existing anime-ID path in `docs/openapi.yaml`, including bearer security, path parameter, binary JPEG schema, 200/204/304/401/404/405/503 responses, ETag/Content-Length/Retry-After headers, and the dated 2026-09-14 consumer note with 7-day 204, 24-hour 404, and old-bridge fall-through facts; directly review this YAML because `tools/checkopenapi` is known vacuous for table routes. <!-- sdd-owner: implementation -->
- [x] **5.4 MUTATE — Stage only WU5a production Go, run `go test -count=1 ./internal/api/ ./internal/observability/requestcapture/`, then run `ditto staged --dry` with `--exclude-prefix frontend/` plus an `--exclude-prefix` for every WU1–WU4 production path (confirm only `capture_middleware.go` and `requestcapture/types.go` remain in scope), and at most two scoped runs with `--threshold 0.80 --test-command "go test -count=1 -json -p=4 -timeout 120s ./internal/api/ ./internal/observability/requestcapture/"`, one command at a time; mutation-check the image detection and bodyless-response guards. <!-- sdd-owner: implementation -->
- [x] **5.5 REFACTOR — Rerun `go test -count=1 ./internal/api/ ./internal/observability/requestcapture/`, manually inspect the exact OpenAPI path/responses/note, and leave only capture/OpenAPI changes staged and commit-ready. Runtime harness: N/A; the capture middleware test is the HTTP boundary harness and OpenAPI validation is deliberately manual. <!-- sdd-owner: implementation -->

## 6. WU5b — ADR-024 durable cache decision and corpus benchmark (about 200–255 lines)

**Start/dependency:** WU2's Windows filesystem receipt exists. This unit produces the Go resampler
measurement, which moved here from task 3.5 on 2026-09-14. **Finish:** ADR-024 records the durable
decision and its measured receipt without production source changes. **Rollback:** revert
`docs/adr/024-cover-thumbnail-cache.md` and `internal/anime/cover/thumbnail/transform_benchmark_test.go`;
no runtime state changes.

**Budget (stop and report before exceeding):**

| File | Budget |
|---|---|
| ADR-024 | ≤ 175 (ADR-022: 174, ADR-023: 157) |
| `thumbnail/transform_benchmark_test.go` | ≤ 40 |
| artifact prose | ≤ 40 |

- [x] **6.0 MEASURE (moved from 3.5)**
  - Add `BenchmarkTransformCorpus` in `internal/anime/cover/thumbnail/transform_benchmark_test.go`. It skips when `THUMBNAIL_BENCH_CORPUS` is unset, and no cover is ever committed.
  - Build a read-only copy of the ten-cover corpus in a temp directory: the 7 URL-cache `.img` files, plus the 3 local covers whose paths come from a copied `bridge.db`.
  - Run it alone, with no other heavy command running, using `-run '^$' -bench BenchmarkTransformCorpus -benchmem -count=3`.
  - Record per-cover results, including which path each cover took (pass-through or generated), as the ADR-024 resampler receipt. <!-- sdd-owner: implementation -->
- [x] **6.1 RED — Draft `docs/adr/024-cover-thumbnail-cache.md` against the measured ADR-022/023 157–174-line shape, using review questions as failing documentation criteria: whether a reader can identify the on-disk layout, source identities, version invalidation, Windows write-once rationale, dependency, v1 limitations, and rejected/deferred delivery options. <!-- sdd-owner: implementation -->
- [x] **6.2 GREEN — Complete ADR-024 with the accepted v1 layout and metadata commit marker, local path/size/mtime and URL-origin-SHA identities, `x/image` rationale, unique-temp/rename-existing behavior, two-slot scope, measured WU3 resampler receipt, WU2 filesystem receipt, EXIF/ICO/SVG/BMP limitations, rejected local-API/AssetServer options, and deferred garbage collection/larger MAL source. <!-- sdd-owner: implementation -->
- [x] **6.3 TRIANGULATE — Cross-check every factual claim against `design.md` D3–D5, the recorded WU2/WU3 receipts, and the supported specifications; remove any claim that lacks a receipt and keep implementation mechanics out of the ADR when they add no durable rationale. <!-- sdd-owner: implementation -->
- [x] **6.4 MUTATE — No production Go is staged in this documentation-only unit, so `ditto staged` is not applicable; verify the cited WU2/WU3 scoped mutation receipts accurately identify their staged candidate and do not restage their source. <!-- sdd-owner: implementation -->
- [x] **6.5 REFACTOR — Review the ADR for decision focus and measured-comparable length, then leave only `docs/adr/024-cover-thumbnail-cache.md` and the corpus benchmark test staged and commit-ready. Runtime harness: N/A; this unit records already-executed boundary evidence and changes no executable behavior. <!-- sdd-owner: implementation -->

## 7. WU6 — Desktop wiring and unchanged Wails cover contract (budget ≤ 550 lines; original forecast 220–330, which omitted deletions)

**Start/dependency:** WU1–WU5b are complete and SDD-73 has landed on `dev`; rebase this worktree
before editing `internal/desktop/app.go`. **Finish:** the UI binding calls the waiting thumbnail
service, the API gets the bounded service seam, and `Resolve` has no production caller. **Rollback:**
revert this unit; the route's nil seam returns 503 and the desktop returns its former placeholder.

**Budget (stop and report before exceeding; target ≤ 550 changed lines, deletions included):**

| File | Budget |
|---|---|
| `app_cover.go` | ≤ 60 |
| `app_cover_thumbnail.go` | ≤ 60 |
| `app.go` + `app_runtime_services.go` + `app_startup_runtime.go` | ≤ 15 |
| `GetAnimeCover` move-out from `app_runtime.go` | deletions measured at RED start |
| cover tests | ≤ 180, and the replaced `app_runtime_cover_test.go` (156) counts its deletions |
| artifact prose | ≤ 50 |

`Resolve` deletion is NOT in this unit's budget; it moved to WU6b.

- [x] **7.1 RED — Update `internal/desktop/app_runtime_cover_test.go` and the cover stub in `internal/desktop/app_test_helpers_test.go`, or replace them with `app_cover_test.go`, with failing `TestGetAnimeCoverReturnsThumbnailJPEGDataURL`, `TestGetAnimeCoverPreservesPlaceholderForNilQueryAndService`, `TestGetAnimeCoverPreservesPlaceholderForLookupAndServiceOutcomes`, and `TestGetAnimeCoverWaitsForThumbnailSlot`; decode the returned URL and assert height `<= 320`, not a production constant or implementation field. <!-- sdd-owner: implementation -->
- [x] **7.2 GREEN — Move `GetAnimeCover` from `internal/desktop/app_runtime.go` to `internal/desktop/app_cover.go`, add `app_cover_thumbnail.go`, replace the `coverResolver` seam/field in `app.go` with the narrow thumbnail-service seam, construct the service in `app_runtime_services.go`, and provide bounded HTTP versus waiting desktop adapters through the single `buildHTTPServer` config line in `app_startup_runtime.go`; make every new exported/port declaration consumed by this same wiring commit. Leave `Resolve` and its tests in place; WU6b deletes them once this unit removes their last production caller. <!-- sdd-owner: implementation -->
- [x] **7.3 TRIANGULATE — Cover a tall local image, valid short JPEG pass-through, nil/query error, absent/gone/invalid/transient service outcomes, base64 `data:image/jpeg;base64,` prefix, no original-byte fallback, and desktop wait-after-two-held-slots; confirm no frontend, `wailsjs`, TypeScript model, or `anime-cover-rendering` spec change is introduced. <!-- sdd-owner: implementation -->
- [x] **7.4 MUTATE — First run `ditto staged --dry --exclude-prefix frontend/` to confirm the desktop scope and test cost, then stage only WU6 production Go, run `go test -count=1 ./internal/desktop/`, and run at most two `ditto staged --exclude-prefix frontend/ --exclude-prefix internal/anime/ --exclude-prefix internal/api/ --exclude-prefix internal/observability/ --threshold 0.80 --test-command "go test -count=1 -json -p=4 -timeout 120s ./internal/desktop/"` runs, one command at a time; investigate survivors in nil, placeholder, outcome, and slot-waiting guards. <!-- sdd-owner: implementation -->
- [x] **7.5 REFACTOR — Keep `app.go`, `app_runtime_services.go`, and `app_startup_runtime.go` to their unavoidable field/call edits and retain new behavior in focused files below the 400 effective-line production ceiling; rerun `go test -count=1 ./internal/desktop/`, `wails build`, and `bun --cwd="frontend" run render:smoke` one at a time, in that order, then leave only this desktop boundary staged and commit-ready. <!-- sdd-owner: implementation -->

## 7b. WU6b — Remove the superseded Resolve path (deletion-only, about 200–240 lines)

**Start/dependency:** WU6 removed the last production caller of `Resolve`. **Finish:** `Resolve`,
the types/helpers only it uses, and its `TestResolverResolve*` tests are gone. The measured span on
2026-09-14 is `resolver_test.go:131–324` plus `resolver.go:34–40`. **Rollback:** revert this unit;
the unused path returns without behavior change.

- [x] **7b.1 DELETE**
  - Confirm zero production callers with `codegraph_explore` (or `codegraph callers`), then a `Resolve(` grep scoped to `internal/`.
  - Delete `Resolve`, every declaration left without a caller by that deletion, and the `TestResolverResolve*` tests.
  - Keep any test that also pins behavior `Load` still owns, moving its rows into the loader table instead of deleting them. <!-- sdd-owner: implementation -->
- [x] **7b.2 VERIFY — Run one at a time: `go build ./...`, `go test -count=1 ./internal/anime/cover/ ./internal/desktop/`, `scripts/lint.ps1 -Profile all`, `go run ./tools/checkgofilesize`. MUTATE is N/A because the unit adds no production lines, and RED is N/A because it adds no behavior. <!-- sdd-owner: implementation -->

## Final integration verification after WU6b

- [x] **8.1 RED/GREEN/TRIANGULATE — Execute the complete acceptance matrix from all three change specs against the integrated tree: every cover endpoint precedence row, v1 transform rule, cache identity/write-once/two-slot behavior, desktop thumbnail URL, and binary capture metadata rule; add focused regression tests only where a specified scenario is missing. <!-- sdd-owner: implementation -->
- [x] **8.2 MUTATE — Validate that each committed WU1–WU5a/WU6 work-unit record contains its scoped `ditto staged` command and passing receipt for the exact staged candidate; run `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json -p=4 -timeout 120s ./<owning-package>/"` (at most two runs) only for newly staged final-integration production Go edits, scoped to that edit’s owning package, and never restage committed work or substitute `./...` per mutant. <!-- sdd-owner: implementation -->
- [x] **8.3 REFACTOR — Run the gate-equivalent final checks one at a time, in this order: `go test ./...`, `scripts/lint.ps1 -Profile all`, `go run ./tools/checkgofilesize`, `wails build`, and `bun --cwd="frontend" run render:smoke`; manually re-check `docs/openapi.yaml` because `tools/checkopenapi` does not validate table-registered routes, and preserve the eight local commit boundaries without creating a PR. <!-- sdd-owner: implementation -->
