# Proposal: SDD-74 Mobile Covers — Thumbnail Endpoint and Bridge UI Thumbnails

## Intent

- **Mobile cannot show covers.** No cover route exists: `GET /api/animes/{id}/cover` reaches
  `handleAnimeByID`, looks up id `"{id}/cover"` and answers 404 (`internal/api/router.go:236-274`).
- **The bridge UI ships full originals.** `App.GetAnimeCover` returns the original image as a
  base64 data URL, up to 10 MiB before base64 (`internal/desktop/app_runtime.go:263-280`), to
  boxes no larger than 96 CSS px (`explore.md` §5).
- **Failures are indistinguishable.** `cover.Resolver.Resolve` folds every failure into
  `IsCover:false`, so an HTTP caller cannot tell "never retry" from "retry later".
- **A truncated image is cached as valid** (Drift 6).

Success: mobile receives a ≤ 320 px JPEG with a strong ETag, 304 revalidation, and a 204/503
split it can trust. The bridge UI renders the same thumbnail with zero frontend change.

## Drift Recorded (Code Wins)

| # | Drift |
|---|---|
| 1 | `App.GetAnimeCover` (via `coverResolver`, `internal/desktop/app.go:212-214`) is the only production caller of `Resolve`. The `IntentResolver` and `siteResolver` edges CodeGraph reports are name collisions. |
| 2 | `cover.Classify` is imported by `internal/anime/episode_service_schedule_state.go:7,42`, not `episode_service.go`. SDD-74 never touches `episode_service.go`. |
| 3 | Wiring lives in `internal/desktop`: `startHTTPServer` (`app.go:284-297`), `buildHTTPServer` (`app_startup_runtime.go:175-194`), `buildAppOptions` (`options.go:18-44`), resolver construction (`app_runtime_services.go:220`). Wails is v2.15.0. |
| 4 | `tools/checkopenapi` is vacuous: its regex matches only `mux.Handle("/ws"` (skip-listed), because routes register in a loop (`router.go:103-121`). It passes whatever `docs/openapi.yaml` contains. |
| 5 | Revive `file-length-limit` `max: 400` (`skipComments: true`, `skipBlankLines: false`) applies to production Go (`.golangci.dlinter.yml:78-86`). `docs/file-size-policy.md` does not mention it. |
| 6 | `http_fetcher.go:63` truncates at the limit instead of rejecting, and `TestHTTPFetcherFetchCapsBodyReadAtMaxBytes` pins that behaviour. `TestResolverResolveURLOversizeBodyDegradesToPlaceholder` uses a fake that returns a shape the real fetcher cannot produce. |
| 7 | `openspec/config.yaml:7` ("Wails starter scaffold ... not implemented yet") is stale. |
| 8 | Found at proposal: `openspec/specs/openapi/spec.md` REQ-1 says the document covers "exactly" pair, PATCH and reconcile. `docs/openapi.yaml` already documents 13 paths. This change adds a path and does not repair the requirement. |

## Scope

### In Scope

- A typed source-loading outcome (absent, gone, invalid, transient, ok), plus the fetcher
  truncation fix and the `diskCache.Put` temp-name race fix.
- A pure thumbnail transform (thumbnail spec v1 below) and the new `golang.org/x/image` dependency.
- A spec-versioned, write-once thumbnail disk cache keyed by source identity, and a 2-slot
  `ThumbnailService`.
- `GET /api/animes/{id}/cover`, following the fixed contract below.
- The capture state `omitted_binary` for image response bodies.
- A `docs/openapi.yaml` path with a dated consumer note.
- ADR-024.
- The bridge UI via option (a): only `App.GetAnimeCover` changes, and it returns the thumbnail data URL.

### Out of Scope

- Frontend, `wailsjs`, `models.ts`, and the `anime-cover-rendering` spec. All stay unchanged.
- Mobile behaviour, including treating a 404 on this route like a 204 (mobile-side request).
- Follow-ups:
  - Store the larger MyAnimeList image variant (current covers are 116×180).
  - Make `checkopenapi` read the route table.
  - Document the 400-line revive ceiling in `docs/file-size-policy.md`.
  - Deliver covers through the Wails AssetServer (option b), only if WebView memory is measured as a problem.
  - Garbage-collect orphaned cache entries.
- Rejected: option (c), where the WebView calls the local API. It has no desktop bearer token, the
  request is cross-origin, it fails when the HTTP bind fails, and every render would land in capture.

## Capabilities

### New Capabilities

- `anime-cover-thumbnails`: source outcome classes, thumbnail spec v1, source identity,
  spec-versioned write-once cache, 2-slot concurrency (bounded HTTP acquire, waiting desktop
  acquire), and `GetAnimeCover` serving the thumbnail.
- `mobile-cover-endpoint`: the `GET /api/animes/{id}/cover` status precedence, headers, ETag/304,
  `Retry-After`, and OpenAPI documentation with a consumer note.

### Modified Capabilities

- `observability`: one ADDED requirement. The capture middleware keeps the row and headers of an
  `image/*` response but stores no body, and records `omitted_binary`.

Checked and unchanged:

- `anime-cover-rendering`: "render its resolved `dataUrl`" still holds.
- `rest-api-middlewares-auth`: 405-before-401 holds on the new route.
- `mobile-sync-contract`: `cover` stays `string|null`.
- `openapi`: the path is additive (Drift 8).

## Confirmed Contracts

### HTTP contract (agreed with the mobile peer)

| Order | Condition | Response |
|---|---|---|
| 1 | Method is not GET (HEAD included) | 405 |
| 2 | Bearer auth fails | 401 |
| 3 | Unknown anime id. Soft-deleted animes still resolve. | 404 |
| 4 | Anime-lookup infrastructure error, or seam not wired | 503 without `Retry-After` (not 500) |
| 5 | Cover empty or `"null"`. Local file not found. Not an image, > 10 MB, undecodable, > 16 MP, or ICO/SVG/BMP. Origin 4xx other than 408. | 204, permanent |
| 6 | Network error or timeout. Origin 5xx/429/408. Local read error other than not-exist. Slots saturated. | 503, with `Retry-After` when estimable |
| 7 | `If-None-Match` matches | 304 |
| 8 | Otherwise | 200, `image/jpeg`, `Content-Length`, strong `ETag` |

Recommended `Retry-After` values, confirmed by design:

- Saturation: 5 s (`syncdiag.RetryAfterSecs`).
- Origin 429 or 503: the origin value, clamped to 1-3600 s.
- Any other 503: omitted.

Mobile client behaviour, confirmed by the mobile peer on 2026-09-14. It is not a bridge obligation, but the `docs/openapi.yaml` consumer note must state it:

- 204 → placeholder, revalidate after 7 days.
- 404 → placeholder, revalidate after 24 h. A bridge that predates this change answers 404 on this route, because the request falls through to the `/api/animes/` prefix handler with the id `{id}/cover`.
- 503 → transient, handled with the client's own backoff when `Retry-After` is absent.

### Thumbnail spec v1

| Aspect | Decision | Evidence |
|---|---|---|
| Size | Fit to 320 px height, width by aspect, never upscale | Every UI surface ≤ 96 CSS px |
| Encoding | JPEG q80. Box pre-shrink + CatmullRom; the resampler is confirmed by a Go measurement in WU2 | Pillow timings bound magnitude only |
| Pass-through | A JPEG source ≤ 320 px tall is served byte-for-byte | 6 of 10 real covers |
| Pixel cap | `image.DecodeConfig` before decode; > 16 MP → 204 | Largest cover ~4 MP; ≤ ~64 MiB RGBA per slot |
| Formats | jpeg, png, gif (first frame), webp | All 10 real covers are JPEG |
| Alpha | Flatten over `#1B2636` (`internal/desktop/options.go:31`). The mobile peer may still supply another hex. | 0 transparent covers |
| EXIF orientation | Not honoured. Documented as a known limitation. | 0 of 17 images carry the tag |
| Version | Part of the cache key. A change to size, quality, background or resampler bumps it. | — |
| ETag | `"<sha256 of served bytes>"`, computed once and stored with the thumbnail | — |

### Cache and service

- **Source identity.**
  - Local: path + size + mtime (`Stat`, no hash).
  - URL: sha256 of the origin bytes, computed once at fetch and persisted as a sidecar beside the
    cached `.img`. Existing entries migrate lazily.
- **Location.** `<cover cache root>/thumbs/v<spec>/`. Entries are write-once and written through
  unique temp names.
- **Rename.** Go opens files without `FILE_SHARE_DELETE`, so on Windows a rename can fail because
  the destination already exists. That failure counts as success.
- **Startup cleanup.**
  - Delete non-current version directories.
  - Sweep `*.tmp` files older than 1 h, if the sweep fits the budget.
- **Concurrency.** Two slots gate decode, resize and encode only.
  - HTTP uses a bounded acquire: saturation → 503.
  - The desktop binding uses a waiting acquire, because the UI keeps a failed cover as a
    session-long placeholder.

## Approach

- **Resolver (Option A).** Add `Load(ctx, source) (Source, error)` with sentinel errors classified
  by `errors.Is`. `Resolve` stays as an adapter until WU6 removes its only caller.
- **Transform.** The pure transform lives in `internal/anime/cover/thumbnail`. The service and
  cache live in `internal/anime/cover`.
- **Route.** A method-less `/api/animes/{id}/cover` row in the route table. Go's mux prefers it over
  `/api/animes/` for every method, and it must stay method-less or PATCH falls through to
  `patchAnime`.
  - The handler goes in `internal/api/handlers/anime_cover_handler.go`, and its builder in
    `internal/api/router_cover.go`.
  - The seam is an `internal/api/contracts` DTO plus one `api.Config` field.
- **File size.** Non-trivial additions go into new files. `app_runtime.go`, `app.go`, `router.go`
  and `app_startup_runtime.go` sit at 373-395 of 400 revive lines.
- **ADR: yes.** `docs/adr/024-cover-thumbnail-cache.md`, ~120-150 lines, in WU5. None of the
  following can be deduced from code:
  - the on-disk contract (layout, version invalidation, Windows write-once rename, identity);
  - the new module dependency;
  - the v1 limitations (EXIF, ICO/SVG/BMP);
  - the deferred and rejected delivery options.

  Landing it in WU5 lets it cite the WU2 resampler measurement and the WU3a rename proof as facts.

## Work Units

Delivery is `auto-chain`, as local commits on `feat/sdd-74-mobile-covers`
(`feature-branch-chain`, one merge into `dev`). Each unit stays within ~400 changed lines,
tests included. Estimates are in lines; `sdd-tasks` re-measures comparables with `wc -l`
(CLAUDE.md #22).

| WU | Scope | Prod | Test | Other | ditto package |
|---|---|---|---|---|---|
| 1 | `Load` + sentinel errors; local `Stat` identity; fetcher `limit+1`, status classes, origin `Retry-After`; fix the Drift 6 test | 120-150 | 150-190 | — | `./internal/anime/cover/` |
| 2 | Pure transform: cap, decode, fit, pass-through, flatten, q80, ETag; resampler measurement | 100-130 | 120-160 | go.mod/sum ~4 | `./internal/anime/cover/thumbnail/` |
| 3a | Thumbnail cache (write-once, rename-exists success, version cleanup, tmp sweep); origin sha256 sidecar; `diskCache.Put` race fix; real-filesystem Windows test | 80-100 | 100-130 | — | `./internal/anime/cover/` |
| 3b | `ThumbnailService`: identity keys, lazy sidecar migration, outcome mapping, bounded vs waiting acquire | 90-110 | 100-130 | — | `./internal/anime/cover/` |
| 4 | API only: contracts DTO, handler, `router_cover.go`, route row, `api.Config` field. The seam stays nil in production until WU6. | 110-130 | 150-190 | — | `./internal/api/handlers/`, `./internal/api/` |
| 5 | Capture `omitted_binary`; `docs/openapi.yaml` path and consumer note; ADR-024 | 10-15 | 25-40 | yaml 70-90, ADR 120-150 | `./internal/api/` |
| 6 | All desktop wiring: `app.go` port/field lines, service construction, `app_cover_thumbnail.go`, `buildHTTPServer` +1 line, `GetAnimeCover` moved to `app_cover.go` and switched, `Resolve` removed | 70-100 | 90-130 | deletions ~60-100 | `./internal/desktop/` |

WU6 comes last because SDD-73 also stages `internal/desktop/app.go`. It rebases onto `dev` once
SDD-73 lands. WUs 1-5 touch no file SDD-73 stages.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `internal/anime/cover/` | Modified | `Load`, typed errors, fetcher fix, cache race fix, sidecar, `ThumbnailService` |
| `internal/anime/cover/thumbnail/` | New | Pure transform |
| `internal/api/`, `internal/api/handlers/`, `internal/api/contracts/` | New/Modified | Route, handler, DTO, `Config` field, capture state |
| `internal/observability/requestcapture/types.go` | Modified | `omitted_binary`, beside the existing `omitted_*` states |
| `internal/desktop/` | Modified/New | Wiring, `app_cover.go`, `app_cover_thumbnail.go` |
| `go.mod`, `go.sum` | Modified | `golang.org/x/image`, added with `go get` |
| `docs/openapi.yaml`, `docs/adr/024-*.md` | Modified/New | Path + consumer note; ADR |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Windows rename fails over a file open for reading | High without work | Write-once keys, unique temps, rename-exists = success. GREEN stays provisional until the real-filesystem test in WU3a. |
| Decompression bomb or peak memory | Med | 16 MP `DecodeConfig` cap before decode; 2 slots |
| Budget overrun, WU3 in particular | Med | WU3 is pre-split into 3a/3b. An overshoot is refactored, never trimmed of mutant-killing cases (CLAUDE.md #22). |
| Bridge UI regressions: EXIF-rotated JPEGs and ICO/SVG/BMP covers become placeholders | Low (0 measured) | Documented in the ADR as a v1 limitation |
| Pass-through serves a JPEG whose header parses but whose body is corrupt | Low | Design decides whether pass-through fully decodes. The decode is cheap at ≤ 320 px and bounded by the pixel cap. |
| Go resize CPU is unmeasured | Med | WU2 measures on real covers before fixing the resampler |
| No gate protects the OpenAPI entry (Drift 4) | Certain | Manual `openapi.yaml` check at verify |
| The gate never builds the app | Certain | `wails build` after WU2 and at verify |
| `internal/desktop` ditto cost is unmeasured | Med | `ditto staged --dry` and a suite timing before WU6 MUTATE |
| The mobile peer changes the background hex | Low | Bump the spec version; entries regenerate |
| Older bridges answer 404 for every cover | Certain | Mobile treats that 404 like a 204 |

## Rollback Plan

- **Before merge.** Revert the offending work-unit commit. Each unit is self-contained. WU4 without
  WU6 answers 503, because the seam is nil.
- **After merge.** Revert the merge commit on `dev`. There is no schema, migration or SQLite table,
  and no frontend change.
- **Leftover cache files.** Persisted state is only `thumbs/v*/` and `*.sha256` sidecars under the
  cover cache root. The pre-change `diskCache` reads `<sha256>.img` by exact name and never lists
  the directory, so leftovers are inert and safe to delete.
- **Dependency.** `go mod tidy` drops `golang.org/x/image`.
- **Mobile.** The route returns to 404, which mobile is being asked to treat like a 204.

## Dependencies

- `golang.org/x/image` (webp, draw). New, and stated explicitly.
- SDD-73 landing on `dev` before WU6 rebases.
- The mobile peer's handling of 404 and its optional background hex (mobile-side).

## Success Criteria

- [ ] Every row of the HTTP contract table has a handler test, including HEAD → 405, a soft-deleted anime → 200, and a lookup error → 503 without `Retry-After`.
- [ ] A `limit+1`-byte origin yields invalid (204), not a cached truncated image.
- [ ] Two concurrent writers of one key on a real Windows filesystem both succeed and serve identical bytes.
- [ ] A 320 px JPEG round-trips byte-identical; an over-cap image yields 204 without a full decode.
- [ ] `GetAnimeCover` returns a JPEG data URL ≤ 320 px tall. Frontend, `wailsjs` and specs are unchanged.
- [ ] Capture stores `omitted_binary` and no body for a 200 cover response.
- [ ] Go MUTATE via `ditto staged` scoped per unit; `go test ./...`, both golangci profiles, `checkgofilesize` (empty baseline), `wails build` and `render:smoke` pass. `openapi.yaml` is verified manually.
