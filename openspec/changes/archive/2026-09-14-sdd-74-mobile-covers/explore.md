# Exploration: SDD-74 Mobile Covers (thumbnail endpoint + bridge UI thumbnails)

Worktree: `feat/sdd-74-mobile-covers` @ `fb1f164`. Every citation below was read in this
worktree. Line counts are measured, not estimated; "revive lines" means non-comment lines
with blank lines included (the counter `revive file-length-limit` uses, see Drift 5).

## Current State

- A stored cover (`contracts.MobileAnime.Cover`, `*string`) is an empty string, the literal
  `"null"`, a local disk path, or an `http(s)://`/`ftp://` URL. `cover.Classify`
  (`internal/anime/cover/types.go:34-44`) decides the kind by string shape only.
- `cover.Resolver.Resolve` (`resolver.go:36-45`) returns `Result{DataURL, IsCover}`
  (`types.go:67-70`) and never an error. Every failure collapses to `IsCover:false`, so
  "no cover", "file missing", "network down" and "not an image" are indistinguishable.
- Local paths are read in full on every call (`resolver.go:48-60`). URL sources go through
  `diskCache` (`disk_cache.go`, key `sha256(URL)` + `.img`, root
  `os.UserCacheDir()/autoreas-bridge/covers`, write via fixed `<final>.tmp` + rename).
  `NewDefaultResolver` degrades to `noopCache` (`production.go:27-38`).
- `App.GetAnimeCover` (`internal/desktop/app_runtime.go:263-280`) looks up the anime with
  `GetMobileAnime`, resolves the cover, and returns the FULL original image as a base64 data
  URL (`resolver.go:104`) to the WebView, up to 10 MiB before base64.
- The HTTP API has no cover route. `GET /api/animes/{id}/cover` today reaches
  `handleAnimeByID` (`internal/api/router.go:236-274`), which looks up anime id
  `"{id}/cover"` and answers `404 {"error":"anime not found"}`. `PATCH` on the same path
  reaches `patchAnime` with id `"{id}/cover"` (`handlers/anime_handler.go:81-88`).
- `CaptureMiddleware` wraps every `/api/*` request except `/ws`
  (`internal/api/capture_middleware.go:46-58`) and retains up to 64 KiB of every response
  body (`captureDeliveredBytes`, `capture_middleware.go:222-241`;
  `requestcapture/types.go:13`).

## Drift between the brief and the code (code wins)

1. **Only one production caller of `cover.Resolver.Resolve` exists.** It is
   `App.GetAnimeCover`, through the `coverResolver` interface (`internal/desktop/app.go:212-214`).
   `internal/notification/center/ports.go:31-33` (`IntentResolver.Resolve(intent string)`)
   and `internal/desktop/app_season_availability.go:27-29`
   (`siteResolver.Resolve(pageURL string)`) are unrelated interfaces that share only the
   method name, which CodeGraph reported as "implements" edges. A grep of `internal/` and
   `cmd/` for the `internal/anime/cover` import finds only `internal/desktop/app.go`,
   `app_runtime_services.go`, their tests, and `internal/anime/episode_service_schedule_state.go`.
2. **`cover.Classify` is imported by `internal/anime/episode_service_schedule_state.go:7,42`,
   not by `episode_service.go`.** SDD-74 does not need to touch `episode_service.go`, which
   is one of SDD-73's staged files.
3. **Wiring locations.** `startHTTPServer` is `internal/desktop/app.go:284-297`.
   `buildHTTPServer` (the `api.Config` literal) is `internal/desktop/app_startup_runtime.go:175-194`.
   `desktop.Options`/`buildAppOptions` is `internal/desktop/options.go:18-44`, not `main.go`.
   The cover resolver is constructed in `configureAnimeApplicationServices`
   (`app_runtime_services.go:220`), which runs before `startHTTPServer`
   (`app_runtime_services.go:33-38`). The Wails version is v2.15.0 (`go.mod`).
4. **The OpenAPI gate is vacuous.** `tools/checkopenapi/main.go:12` extracts routes with
   `mux\.Handle(?:Func)?\("([^"]+)"`, but routes are registered in a loop,
   `mux.HandleFunc(route.path, route.handler)` (`router.go:103-121`). Only `mux.Handle("/ws"`
   matches, and `/ws` is in the skip list (`checkopenapi/main.go:83-86`). The gate prints
   "OpenAPI gate passed." (run 2026-09-14) whatever `docs/openapi.yaml` contains. No gate
   will catch a missing `/api/animes/{id}/cover` entry.
5. **Production Go files have a hard 400-line lint ceiling that `docs/file-size-policy.md`
   does not mention.** `.golangci.dlinter.yml:78-86` enables revive `file-length-limit` with
   `max: 400`, `skipComments: true` and `skipBlankLines: false`, so blank lines count.
   `_test.go` files are excluded (`.golangci.dlinter.yml:38-43`). The gate runs it whole-tree
   (`lefthook.yml:101-103`, `scripts/lint.ps1 -Profile all`). Several files the feature
   would naturally edit are within 5-27 lines of that ceiling (see Sizing).
6. **A test pins the truncation bug instead of catching it.**
   `TestHTTPFetcherFetchCapsBodyReadAtMaxBytes` (`http_fetcher_test.go:131-152`) asserts only
   `len(data) <= maxBytes` with a nil error. The truncating `io.LimitReader`
   (`http_fetcher.go:63`) passes it. `TestResolverResolveURLOversizeBodyDegradesToPlaceholder`
   (`resolver_test.go:217-235`) uses a fake fetcher that returns more than the limit, a
   shape the real fetcher can never produce. Nothing tests the seam between the two, so a
   truncated image is cached as a valid cover.
7. `openspec/config.yaml:7` ("Wails starter scaffold; ... not implemented yet") is stale, as
   the brief already notes.

## 1. Resolver outcome model

### What the HTTP contract needs from resolution

| Contract class | Sources |
|---|---|
| Absent (204) | empty or `"null"` (`Classify` → `KindAbsent`) |
| Gone (204) | local `errors.Is(err, fs.ErrNotExist)`; origin 404/410 |
| Invalid (204) | not an image, over 10 MiB, undecodable, over the pixel cap (§2) |
| Transient (503) | network error or timeout, origin 5xx or 429, a local read error other than not-exist, thumbnail work saturated |
| OK (200/304) | bytes plus a source identity |

On Windows, Go reports `ERROR_FILE_NOT_FOUND`, `ERROR_PATH_NOT_FOUND` and `_ERROR_BAD_NETPATH`
as `fs.ErrNotExist` (`$GOROOT/src/syscall/syscall_windows.go:201-205`). Two other errors
look transient under this mapping but will never succeed on retry: a path that is a
directory, and `ERROR_INVALID_NAME`. An unplugged drive (`ERROR_NOT_READY`) is correctly
transient.

### Options

| Option | Shape | Pros | Cons | Effort |
|---|---|---|---|---|
| A. Add a typed method, keep `Resolve` as an adapter | `Load(ctx, source) (Source, error)`, where `Source{Bytes, Identity}` and a sentinel error set (`ErrAbsent`, `ErrGone`, `ErrInvalid`, `ErrTransient` wrapping the cause, optional `RetryAfter`) is classified with `errors.Is`. `Resolve` becomes `Load` → data URL. | Existing `GetAnimeCover` and its 5 tests stay green while the pipeline lands; idiomatic Go errors; classification is tested once. | Two entry points exist until the UI slice removes `Resolve`. | Low-Med |
| B. Replace `Result` with an enum outcome struct | `Result{Outcome, Bytes, Identity, RetryAfter}` | One entry point. | Rewrites all 11 resolver tests and the desktop stub (`app_test_helpers_test.go:226-236`) in the first slice. | Med |
| C. Classify in the HTTP handler | the handler inspects raw errors | none | The transport learns filesystem and HTTP-client error shapes, and the Wails UI path would duplicate the logic. | — |

**Where classification lives:**

- `http_fetcher.go` returns typed errors. Use `io.LimitReader(body, limit+1)` and fail with
  `ErrInvalid` (too large) when `len > limit`. Reject early when a declared
  `resp.ContentLength > limit`. 404/410 map to `ErrGone`. 5xx and 429 map to
  `ErrTransient`, carrying the origin's `Retry-After` when present. `net.Error` timeouts,
  context errors and dial errors map to `ErrTransient`. The existing opaque non-200 error
  (`http_fetcher.go:55-57`) goes away.
- `resolver.go` `resolveLocal` classifies `fs.ErrNotExist` (plus directory and invalid-name)
  as gone and anything else as transient. It needs `Stat` before `ReadFile` so the identity
  (path + size + mtime) exists. The `FileReader` port grows a `Stat`, or a second port is
  added; the `fakeFileReader` in `resolver_test.go:41-51` grows accordingly.
- Image-type classification moves out of the `http.DetectContentType` + `image/` prefix check
  (`resolver.go:97-103`) into the decoder (§2). "Is an image" becomes "is decodable".

**Recommendation: Option A.** It keeps slice 1 small and leaves the UI switch to its own slice.

## 2. Thumbnail pipeline

### Transform (pure, no I/O): recommended subpackage `internal/anime/cover/thumbnail`

1. `image.DecodeConfig` first. Reject when `width*height` exceeds a pixel cap, which makes the
   result invalid (204). The Go docs require this for untrusted input
   (`$GOROOT/src/image/gif/reader.go:570-573`). A 10 MiB PNG can declare dimensions whose
   NRGBA buffer is several hundred MiB. Go's JPEG decoder has no reduced-size (DCT-scaled)
   decode, so every source is decoded at full size. The cap value depends on the measured
   distribution; 36 MP is a placeholder.
2. Decode formats: stdlib `image/jpeg`, `image/png`, `image/gif` (GIF `Decode` returns the
   first frame, `gif/reader.go:566-567`), plus `golang.org/x/image/webp` and optionally
   `x/image/bmp`. `http.DetectContentType` already sniffs `image/webp`, `image/bmp` and
   `image/x-icon` as images (`$GOROOT/src/net/http/internal/sniff.go:115-126`), so BMP and ICO
   covers render in the UI today. After the change, anything that does not decode becomes a
   placeholder. This includes ICO and any SVG served with an `image/svg+xml` header, which
   the current prefix check accepts. That is a small behavior regression to confirm against
   the distribution.
3. Fit to height: when `h <= 320`, do not resize (never upscale). Otherwise
   `newH = 320, newW = max(1, round(w*320/h))`.
4. Resampling needs `golang.org/x/image/draw` (not in `go.mod`, which lists only x/net,
   x/sys, x/crypto, x/oauth2, x/text). `draw.CatmullRom` gives the best quality, but its
   kernel support grows with the downscale ratio, so a 6000×9000 source costs hundreds of ms.
   `draw.ApproxBiLinear` is cheap but aliases on large ratios. Recommendation: an integer box
   pre-shrink to about 2× the target, then `CatmullRom`. Measure CPU on the real distribution
   before deciding. A stdlib-only box filter would avoid the dependency for resizing, but
   WebP decode still needs `x/image`.
5. Alpha: Go's JPEG encoder goes through `RGBA()` (premultiplied), so transparent pixels turn
   black unless flattened first. `draw.Draw` onto an opaque background, then `draw.Over`.
   The background color is an open question (see Q3).
6. Encode with `jpeg.Encode(..., &jpeg.Options{Quality: 80})`. Set
   `ETag = "\"" + hex(sha256(served bytes)) + "\""`, computed once at generation.
7. EXIF orientation: Go ignores it, while Chromium, and so today's data-URL rendering,
   honours it. Re-encoding drops EXIF, so a rotated-EXIF JPEG would become visibly rotated
   (Q2).

**Passing small JPEGs through unchanged.** The condition would be a sniffed JPEG with
`DecodeConfig` height ≤ 320, no orientation tag other than 1, and a size under a cap such as
150 KiB. It saves one decode+encode per source identity, but that work is cached anyway. The
real wins are avoiding generational quality loss and avoiding a small low-quality JPEG
growing when re-encoded at q80. It costs about 15 production lines and two table rows.
**Recommendation:** include it only if the measured distribution shows a meaningful share of
already-small JPEGs.

### Derived cache and orchestration: recommended `cover.ThumbnailService` in `internal/anime/cover`

- **Location:** `DefaultCacheRoot()/thumbs/v<spec>/`, a subdirectory beside the existing
  `*.img` origin files, with no naming collision. The spec version (320 px, q80, background,
  resampler) is in the directory name, so a spec change regenerates everything. Stale
  `v<old>` directories can be removed at startup (optional).
- **Key:** `hex(sha256(identity))`.
  - Local file: `"local\x00" + path + "\x00" + size + "\x00" + mtimeUnixNano`. A no-change
    revalidation is a `Stat` plus reading the cached thumbnail or ETag.
  - URL: `"url\x00" + sha256(origin bytes)`. Hashing the cached origin (up to 10 MiB) on every
    request would break the "stat plus small read" budget. Compute the hash once when the
    origin is fetched and persist it next to the origin as `<sha256(url)>.sha256`. For
    existing `.img` files, compute and write that sidecar lazily on first use.
- **Layout (two options):**
  - (i) `<key>.jpg` plus a `<key>.etag` sidecar, with jpg written first and etag as the commit
    marker. Simplest.
  - (ii) Content-addressed: `refs/<key>` (64 bytes) → `blobs/<etag>.jpg`. A 304 check never
    opens the JPEG, and identical thumbnails dedupe, but it needs blob GC later.
  - Recommendation: (i). A thumbnail is roughly 10-40 KiB (to be measured), so hashing it is
    microseconds and layout (ii) buys almost nothing.
- **Atomic writes on Windows:**
  - Use `os.CreateTemp(dir, key+"-*.tmp")`, write, close, then `os.Rename`.
  - Go opens files with only `FILE_SHARE_READ|FILE_SHARE_WRITE`
    (`$GOROOT/src/syscall/syscall_windows.go:395`, no `FILE_SHARE_DELETE`). Renaming over a
    destination another goroutine is reading therefore fails on Windows.
  - Keys are write-once for identical content, so a failed rename where the destination
    already exists is treated as success: delete the temp file and serve the bytes already
    generated.
  - The same flaw exists in `diskCache.Put` today. Its fixed `<final>.tmp` name
    (`disk_cache.go:34-43`) lets two concurrent puts of one URL interleave. Fix it in the
    same unit.
  - This is the Windows filesystem boundary (AGENTS.md "Boundary Truths"): GREEN is
    provisional until a real-filesystem test proves it.
- **Concurrency:**
  - A global semaphore (buffered channel, size 2) gates decode/resize/encode only. Cache
    hits and origin network fetches never take it.
  - HTTP callers wait a bounded time (for example 3 s via context) and then get a
    saturated outcome: 503 with `Retry-After: 5`. That value reuses the repo precedent
    `syncdiag.RetryAfterSecs = 5` (`internal/observability/syncdiag/types.go:17-20`).
  - The UI binding waits without failing fast. `useEpisodeCovers` fetches each cover at most
    once per session (`use-episode-covers.ts:5-6,41-48`), so a fast-fail placeholder would
    stick until remount.
  - `golang.org/x/sync` is not a dependency. Per-key singleflight is optional; write-once
    rename semantics already make a duplicate generation harmless.
- **Retry-After:**
  - saturation: 5
  - origin 429/503 carrying `Retry-After`: propagate, clamped to [1, 3600]
  - other transient failures: omit the header

## 3. HTTP route

### Routing options

| Option | Pros | Cons |
|---|---|---|
| R1. Add `{path: "/api/animes/{id}/cover", ...}` to the route table (`router.go:106-119`). Go ≥1.22 `ServeMux` picks this more specific pattern over the `/api/animes/` prefix for every method, and the handler checks the method and returns 405 itself. `r.PathValue("id")` is unescaped. | One table row (router.go is at 387/400 revive lines). The existing GET/PATCH `/api/animes/{id}` paths are untouched. Non-GET requests stop reaching `patchAnime` automatically. | First wildcard pattern in the repo (`PathValue` has zero existing uses). The pattern must stay method-less: `GET /api/animes/{id}/cover` would let PATCH fall through to the prefix handler, because the mux's automatic 405 applies only when no pattern matches the method. |
| R2. `strings.HasSuffix(animeID, "/cover")` inside `handleAnimeByID` (precedent: `TrimSuffix(conflictID, "/resolve")`, `router.go:401`) | Follows the existing idiom. | Adds branches to a function already doing GET/PATCH/changes, and costs about 8 lines in a file with 13 lines of headroom. |

**Recommendation: R1.** The builder goes in a new `internal/api/router_cover.go`, and the
handler in a new `internal/api/handlers/anime_cover_handler.go`. This follows the
`NewSyncDiagnosticsHandler` shape: a config of function seams, 405 → auth → nil seam → 503
(`handlers/sync_diagnostics_handler.go:28-61`).

### Handler evaluation order

1. Method is not GET → 405. Repo precedent checks the method before auth
   (`router_transport.go:13-19`, `router.go:388-392`). HEAD also gets 405 (Q8).
2. `h.authenticate` fails → 401 (`router_transport.go:34-48`).
3. `AnimeQuery` or the thumbnail seam is nil → 503 without `Retry-After`, matching the
   existing convention (`router.go:252-255`).
4. `GetMobileAnime`:
   - `errors.Is(err, ErrAnimeNotFound)` → 404.
   - Any other error → 503 without `Retry-After` is recommended over the router's usual 500,
     which is not in the agreed contract (Q6).
   - A soft-deleted anime is still returned by `GetMobileAnime` (`internal/anime/service.go:163-171`
     does not filter on `Active`), so it gets 200 as the contract requires.
5. Seam outcome: absent, gone or invalid → 204 with no body. Transient or saturated → 503,
   plus `Retry-After` when known. OK → 200 or 304.
6. On 200, send `Content-Type: image/jpeg`, `Content-Length` and `ETag`.
   - `If-None-Match` matching → 304 with `ETag` and no body.
   - `http.ServeContent(w, r, "", time.Time{}, bytes.NewReader(jpeg))` handles
     `If-None-Match` (weak comparison, lists, `*`) and `Content-Length`, but it also answers
     `Range` with 206/416 and sets `Accept-Ranges`. Either delete `Range` from the request
     first, or hand-roll the ~20-line `If-None-Match` check. The design phase picks one.

### Wiring

- **Seam type:** a transport-neutral DTO in `internal/api/contracts`, for example
  `CoverThumbnail{Outcome string; JPEG []byte; ETag string; RetryAfterSeconds int}`, with
  `func(ctx, coverSource string) CoverThumbnail` aliased in `internal/api/server.go` like the
  other seams (`server.go:55-68`).
  - dlinter's `handler` role may depend only on `domain` and `contracts`
    (`.golangci.dlinter.yml:111-116`), though role-less packages are tolerated (handlers
    already import `internal/device` and `observability/syncdiag`). A contracts DTO keeps
    the handler inside its declared role.
  - `contracts` may not import `net/http` (`.golangci.yml:49-60`); a plain struct does not.
- **`api.Config`:** add one field (`server.go:71-88`; the file is at 264/400).
- **Desktop:** `a.animeCoverThumbnail()` goes in a new `internal/desktop/app_cover_thumbnail.go`
  (precedent: `app_sync_diagnostics.go`, 17 lines). It returns nil when the service is absent,
  and is passed in `buildHTTPServer` (`app_startup_runtime.go:176-193`, +1 line, file at
  373/400).
- **Layering:** only `internal/desktop` imports Wails, and nothing here needs it
  (`.golangci.yml:67-73`). `tools/checkarchitecture` enforces only table ownership
  (`activity_log`, `watch_history`, `main.go:31-34`) and is unaffected as long as no SQLite
  table is added. None is needed; the cache lives on disk.
- **OpenAPI:** document the new path in `docs/openapi.yaml` next to `/api/animes/{id}`
  (`openapi.yaml:822`). Use `content: image/jpeg: schema: {type: string, format: binary}`,
  headers `ETag` and `Content-Length`, responses 200/204/304/401/404/405/503, and the
  `Retry-After` pattern from `openapi.yaml:1391-1407`. Add a dated "SDD-74 additive, no
  change to existing fields" consumer note to `info.description`, following the convention
  at `openapi.yaml:10-28`.

## 4. Capture middleware

The smallest correct change sits in `captureDeliveredBytes` (`capture_middleware.go:222-241`):
when `w.Header().Get("Content-Type")` starts with `image/`, keep no bytes and set
`bodyState = requestcapture.CaptureStateOmittedBinary`. The new constant
`"omitted_binary"` goes next to the other states in `requestcapture/types.go:14-22`. A
handler sets headers before its first `Write`, so the check is reliable. The status,
duration and headers (including `ETag`) are still captured, which keeps 503/304 behaviour
debuggable.

- **Frontend without changes:** `toTransactionBody` (`frontend/src/features/network/ui/TransactionPanel/transaction-panel.helpers.ts:121-146`)
  shows the "response not captured" notice whenever the raw body is undefined, so the UI
  stays honest.
- **Optional:** a dedicated "binary body omitted" notice costs one branch and one test row
  there.
- **Rejected alternative:** skipping capture for the cover route, like `/ws`
  (`capture_middleware.go:52`). Transient 503s during a mobile sweep would become invisible.
- **Row volume:** one row per cover request against `defaultRetentionLimit = 5000`
  (`requestcapture/types.go:6`). A sweep of N active animes plus 7-day revalidations adds N
  rows per sweep (Q10).
- **Test:** add a content-type column and an `image/jpeg` row to the existing table test
  `TestCaptureMiddlewareOmitsBodiesDisallowedByTheWire`
  (`capture_middleware_bodies_test.go:250-280`), asserting both `ResponseBody == nil` and
  `ResponseBodyState == "omitted_binary"`.

## 5. Bridge UI

### Every surface that renders a stored cover

| Surface | Render site | CSS box | Device px at DPR 2 |
|---|---|---|---|
| Anime detail hero | `features/anime-detail/ui/AnimeDetail/AnimeDetail.tsx:77-83`, `anime-detail.constants.ts:20` (`size-21`) | 84×84, round | 168 |
| Today / Episodes card | `features/episodes/ui/EpisodeSchedulePanel/EpisodeScheduleCard.tsx:24-27`, `episode-schedule-panel.constants.ts:72` (`w-24 self-stretch`, row `min-h-24`) | 96 wide × card height (≥96, stretches) | 192 × 2×card height |
| History inspector | `features/history/ui/HistoryInspector/HistoryInspector.tsx:87-88` (`size-14`) | 56, round | 112 |
| Notification detail row | `features/notifications/ui/NotificationDetail/NotificationDetailRow.tsx:60-65` (`size-11`) | 44 | 88 |
| Notification toast row | `features/notifications/ui/NotificationToasts/NotificationToastRows.tsx:56-61` (`size-8`) | 32 | 64 |

- The brief names only `useAnimeCover` callers. There are four consumer hooks, all calling
  `bridgeRuntimeSource.getAnimeCover` (`infrastructure/bridge-runtime-source/bridge-runtime-source.helpers.ts:393-395`):
  - `useAnimeCover`, used by anime-detail and history
  - `useEpisodeCovers`
  - `useNotificationDetailCovers`
  - `useNotificationToastCovers`
- Not a stored cover: the MyAnimeList candidate (`shared/metadata-lookup/.../AnimeMetadataLookupCandidate.tsx:72-78`)
  renders a remote MAL image URL directly. Windows toasts embed no cover bytes
  (`internal/notification/center/types.go:13`).
- **Is 320 px enough?** Only the Today card slot can need more than 320 device pixels of
  height, and only when the card is taller than 160 CSS px at DPR 2 (128 at DPR 2.5).
  `object-cover` scales a portrait 2:3 thumbnail (213×320) by width in a 96-wide slot, so
  that rarely happens. **320 px is sufficient for every surface.** The worst case is slight
  softness on an unusually tall card on a DPR ≥ 2 display.

### Delivery options

| Option | Pros | Cons | Effort |
|---|---|---|---|
| (a) `GetAnimeCover` returns the thumbnail as a data URL | **Go-only.** Same binding, same `contracts.AnimeCover` DTO, so no `wailsjs`/`models.ts` change and none of the three namespace shapes from CLAUDE.md 20b. The `anime-cover-rendering` spec ("render its resolved `dataUrl`", `openspec/specs/anime-cover-rendering/spec.md:15-26`) stays true. Loading, placeholder and `onError` states are untouched, so no skeleton or render-smoke change. Payload drops from up to 10 MiB (+33% base64) to one thumbnail. | Keeps base64 inflation on small bytes and keeps one JS string per cover in hook state (the Today cache lives for the session). | Low |
| (b) Wails `AssetServer.Middleware` serves thumbnail bytes at a path such as `/cover-thumbs/{id}?v={etag}` | No base64, the browser HTTP cache applies, and decoded bitmaps live off the JS heap. Middleware wraps both the embedded handler and the dev-mode Vite proxy (`wails v2.15.0 pkg/assetserver/assethandler.go:74-76`, `assethandler_external.go:79-81`). The Windows origin is `http://wails.localhost/` (`internal/frontend/desktop/windows/frontend.go:40`). | Changes the frontend cover contract across 4 hooks and their tests. The 9 test files referencing `getAnimeCover` total 2,340 lines. **MODIFIES** the `anime-cover-rendering` spec. Absence must be signalled through `onError`/status. `Options.Handler` alone would be shadowed in `wails dev`, because Vite answers first and only 404/405 fall through (`assethandler_external.go:43-56`). | Med-High |
| (c) WebView calls `http://<host>:9876/api/animes/{id}/cover` | Reuses the route | The desktop has no paired-device bearer token, the request is cross-origin from `wails.localhost`, the call fails whenever the HTTP bind failed (startup continues, `app.go:257-265`), and every desktop render lands in the Activity capture panel. | Reject |

**Recommendation: (a) now.** Record (b) as a follow-up, justified only if WebView memory is
measured as still significant after (a).

- Implementing (a): move `GetAnimeCover` out of `app_runtime.go` (395/400 revive lines) into
  a new `internal/desktop/app_cover.go`. Swap `Resolve` for the thumbnail service, keeping
  `data:image/jpeg;base64,`. Change the `coverResolver` port in `app.go:212-214` (this
  conflicts with SDD-73).
- **Loading-state rule (CLAUDE.md frontend 14):** unaffected by (a). Option (b) would need
  the skeleton to stay mounted until `onLoad`.
- **Render smoke:** unaffected, since no route or bundle change. A fresh worktree still
  needs `frontend/wailsjs` regenerated before `render:smoke` (learning log 2026-09-12). It is
  absent in this worktree.

## 6. Existing tests to extend

| Area | File | What it covers today |
|---|---|---|
| Classify + resolver | `internal/anime/cover/resolver_test.go` (287) | `TestClassify` table; 11 resolver tests with `fakeFileReader`/`fakeFetcher`/`fakeCache` (`:36-89`). `jpegBytes` (`:90-92`) is 11 bytes and NOT decodable, so thumbnail tests must build images in-test with `image/jpeg`/`image/png` encoders. |
| Fetcher | `internal/anime/cover/http_fetcher_test.go` (152) | 200 + content type, missing content type, non-200, timeout, cancellation, body cap (pins the bug, Drift 6). Uses `roundTripperFunc`/`newFetcherWithTransport`. |
| Origin cache | `internal/anime/cover/disk_cache_test.go` (140) | round trip, miss, distinct keys, atomic final content, `DefaultCacheRoot` |
| Desktop binding | `internal/desktop/app_runtime_cover_test.go` (156); stub `stubAppCoverResolver` in `app_test_helpers_test.go:226-236` | 5 `GetAnimeCover` tests: nil query, nil resolver, query error, happy path, non-cover |
| Router | `internal/api/router_test.go` (358); stubs in `router_test_helpers_test.go` (97) | Unauthorized/405/GET by id. `stubAnimeQueryService.GetMobileAnime` cannot return an error (`:49-51`), so the 404 case needs an `err` field. |
| Handler precedent | `internal/api/handlers/sync_diagnostics_handler_test.go` (168) | 405/401/503 + `Retry-After` assertions (`:122`) |
| Capture | `internal/api/capture_middleware_bodies_test.go` (308), `capture_middleware_test.go` (300) | body truncation, bodyless-status table (`:250-280`) |
| Frontend | `shared/anime-cover/__tests__/use-anime-cover.test.ts` (161), `use-episode-schedule-panel.test.ts` (442), `use-notification-detail-covers.test.ts` (89), `NotificationToastRows.test.tsx` (151), `use-anime-detail.test.tsx` (455), `use-history-inspector.test.ts` (344), `infrastructure/__tests__/bridge-runtime-source-cover-events.test.ts` (94) | Untouched under (a); all rewritten under (b). |

Suite cost for ditto (`go test -count=1`, measured 2026-09-14): `internal/anime/cover` 1.58 s,
`internal/api` 0.31 s, `internal/api/handlers` 1.16 s. Per-mutant cost is dominated by
compilation, so scope `--test-command` to the owning package.

## 7. Sizing

### Measured comparables (`wc -l`)

| Shape | Production | Test |
|---|---|---|
| Handler with seam config, 405/401/503/Retry-After (`sync_diagnostics_handler.go`) | 133 | 168 |
| Small handler (`season_snapshot_handler.go`) | 46 | 136 |
| Desktop seam adapter (`app_sync_diagnostics.go`) | 17 | — |
| Whole cover package today (types 70, resolver 106, fetcher 68, disk cache 66, production 38) | 378 | 579 |
| Desktop cover binding tests (`app_runtime_cover_test.go`) | — | 156 |
| OpenAPI path block with 503/Retry-After (`/api/sync/diagnostics`, `openapi.yaml:1139-1414`, schemas included) | 275 yaml | — |

### Files at or near a limit

**Production files (revive 400 non-comment lines, blanks counted):**

| File | Revive lines (approx.) | Physical | Implication |
|---|---|---|---|
| `internal/desktop/app_runtime.go` | 395 | 481 | Do not grow it. Move `GetAnimeCover` out. |
| `internal/desktop/app.go` | 391 | 436 | Edit only the port or field lines. Also staged by SDD-73. |
| `internal/api/router.go` | 387 | 411 | One route-table row only. |
| `internal/desktop/app_startup_runtime.go` | 373 | 427 | One `api.Config` line. |
| `internal/api/server.go` | 264 | 315 | Fine. |
| `internal/api/capture_middleware.go` | 205 | 262 | Fine. |

**Test files (checkgofilesize effective lines):** `internal/desktop/app_runtime_test.go` is
at 422 and `app_download_test.go` at 497 (`go run ./tools/checkgofilesize`, 2026-09-14). Put
new desktop tests in `app_runtime_cover_test.go` or a new file.

### Proposed work units

Budget per unit is about 400 changed lines, tests included, plus 40-80 lines of artifact
prose. Strict TDD makes tests about half of each unit.

| WU | Scope | Prod est. | Test est. | Other | Budget risk |
|---|---|---|---|---|---|
| 1 | Typed source outcome (Option A): `Load` + sentinel errors; local `Stat` identity and not-exist classification; fetcher `limit+1` fix, status classes, origin `Retry-After`; `Resolve` stays an adapter | 120-150 | 150-190 | — | Medium |
| 2 | Pure thumbnail transform: `DecodeConfig` pixel cap, decode (jpeg/png/gif/webp), fit-320 no-upscale, alpha flatten, q80 encode, ETag; `golang.org/x/image` added | 90-120 | 110-150 | go.mod/go.sum ~4 | Medium |
| 3 | `ThumbnailService`: identity keys, spec-versioned disk cache (unique temp + write-once rename), URL origin-hash sidecar, semaphore (bounded wait vs wait), `diskCache.Put` temp-name fix | 160-200 | 180-230 | — | **High.** Split 3a cache / 3b service if the RED tests measure over. |
| 4 | HTTP route: contracts DTO, handler (405/401/404/204/304/503+Retry-After/200), router row + `router_cover.go`, `api.Config` field, desktop adapter + wiring | 130-160 | 170-210 | — | Medium-High |
| 5 | Capture `omitted_binary` + `docs/openapi.yaml` path and consumer note | 10-15 | 25-40 | yaml 70-90 | Low |
| 6 | Bridge UI via option (a): `GetAnimeCover` moved to `app_cover.go` and switched to the thumbnail service; `coverResolver` port update; desktop tests | 40-60 | 60-90 | — | Low (conflicts with SDD-73 on `app.go`) |

An ADR, measured at 123-217 lines per ADR, would be warranted for the new on-disk cache
contract and the `x/image` dependency if the proposal decides one is needed. It would be its
own unit or ride with WU3.

`wails build` must run after WU2's dependency addition. The gate never builds the desktop app
(AGENTS.md "Boundary Truths").

## 8. Risks and open questions (with recommended answers)

1. **Decompression bomb / peak memory.** A full-size decode of a large PNG under 2 concurrent
   slots can reach hundreds of MiB. *Recommend:* `DecodeConfig` pixel cap, over-cap → 204,
   cap value set from the measured distribution.
2. **EXIF orientation is lost on re-encode** (today's data URL honours it). *Recommend:* count
   orientation≠1 JPEGs in the distribution. If zero, document and skip. Otherwise parse the
   APP1 orientation tag (~50 lines) inside the transform.
3. **Background for transparent sources.** *Recommend:* flatten over a fixed opaque color
   declared as part of the thumbnail spec version. Default to the bridge window background
   `#1B2636` (`internal/desktop/options.go:31`) unless mobile's card surface disagrees; ask
   the mobile peer during proposal.
4. **ICO/SVG/undecodable image types that render today would become placeholders/204.**
   *Recommend:* accept as invalid (permanent) if the distribution count is ~0. Add
   `x/image/bmp` only if BMPs exist.
5. **Origin statuses the contract does not list** (400/401/403/451, redirect loops, 408).
   *Recommend:* 408 → transient; other 4xx → gone/invalid (204), since retrying cannot help.
6. **Anime lookup infrastructure error** (not `ErrAnimeNotFound`). *Recommend:* 503 without
   `Retry-After`. The router would normally answer 500, but 500 is outside the agreed
   contract, and mobile treats 503 as transient.
7. **An older bridge answers 404 for every cover request** (the prefix route looks up
   `"{id}/cover"`). Mobile cannot tell that apart from an unknown id, and `StatusInfo` has no
   version field (`contracts.go:405-415`). *Recommend:* mobile treats 404 like 204 (7-day
   backoff). Tell the mobile peer.
8. **HEAD.** The contract says every non-GET is 405. `http.ServeContent` would serve HEAD if
   reached. *Recommend:* keep 405 by checking the method before `ServeContent`.
9. **405 vs 401 precedence** is not in the contract. *Recommend:* method first, per repo
   precedent.
10. **Capture panel volume** from sweeps against the 5000-row retention. *Recommend:* keep the
    rows, omit the bodies. Revisit only if real sweeps crowd out sync diagnostics.
11. **Windows rename over a file open for reading** (no `FILE_SHARE_DELETE`). *Recommend:*
    write-once keys, unique temp names, rename-failure-with-existing-destination = success.
    Prove it with a real-filesystem test on Windows, not a fake.
12. **URL identity cost** (hashing up to 10 MiB per request). *Recommend:* hash once at fetch,
    persist a sidecar, migrate existing `.img` lazily.
13. **Resize CPU on very large sources.** *Recommend:* box pre-shrink + CatmullRom; measure on
    the real distribution before fixing the resampler.
14. **Cache growth** (orphans after a local file changes; old spec versions). *Recommend:*
    version directories and delete non-current versions at startup. Orphan GC stays out of
    scope; thumbnails are small.
15. **Vacuous OpenAPI gate** (Drift 4). *Recommend:* record the drift. Either fix
    `checkopenapi` to read the route table as a separate small change, or verify the
    `openapi.yaml` entry manually in verify. Do not claim the gate protects it.
16. **Revive 400-line ceiling on four target files** (Drift 5). *Recommend:* new files for
    every non-trivial addition. Record the undocumented ceiling in `docs/file-size-policy.md`
    as a follow-up.
17. **SDD-73 merge conflicts.** SDD-73 stages `internal/desktop/app.go` and
    `internal/anime/episode_service.go`. *Recommend:* never touch `episode_service.go`
    (Drift 2). Limit `app.go` edits to the `coverResolver` port/field lines in WU6, and order
    WU6 after SDD-73 lands on `dev` or rebase onto it. WUs 1-5 do not touch `app.go`, as long
    as the thumbnail service is reachable from the existing `coverResolver` field or a new
    field is added in WU6 only.
18. **Pass-through for small JPEGs** (§2). *Recommend:* decide from the distribution. If
    enabled, exclude orientation-tagged files.
19. **The UI must not fast-fail on saturation** (session-long placeholder cache in
    `useEpisodeCovers`). *Recommend:* the service exposes a waiting acquire for the binding
    and a bounded acquire for HTTP.
20. **Stale temp files after a crash.** *Recommend:* sweep `*.tmp` older than an hour in the
    thumbs directory at startup (optional, small).

## Recommendation

- Extend `internal/anime/cover` with a typed source-loading method (Option A) and fix the
  fetcher truncation bug.
- Add a pure `thumbnail` subpackage (DecodeConfig cap, fit-to-320 height, no upscale, alpha
  flatten, JPEG q80, sha256 ETag).
- Add a `ThumbnailService` with a spec-versioned, write-once disk cache keyed by source
  identity and a 2-slot semaphore.
- Serve it through a method-less `/api/animes/{id}/cover` route-table pattern whose handler
  implements 405 → 401 → 404 → 204/503/200/304, wired as a contracts-typed seam in
  `api.Config`.
- Omit image bodies from capture with a new `omitted_binary` state, and document the route
  in `docs/openapi.yaml`.
- Switch the bridge UI by changing only `App.GetAnimeCover` to return the thumbnail data URL
  (option a), leaving the frontend, wailsjs and the `anime-cover-rendering` spec unchanged.
- Deliver as the six work units above.

## Measured cover distribution

Measured by the orchestrator on 2026-09-14. The data came from a read-only copy of the live `bridge.db` (table `anime_snapshots`, column `snapshot_json`) and of the URL cover cache (`%LOCALAPPDATA%\autoreas-bridge\covers`). The live files were never opened directly. Classification follows `cover.Classify`, applied to `cover.path`.

**Counts by kind**

| Scope | Total | Absent | URL | Local |
|---|---|---|---|---|
| All animes | 839 | 829 (98.81%) | 7 (0.83%) | 3 (0.36%) |
| Active animes | 15 | 7 (46.67%) | 6 (40.00%) | 2 (13.33%) |

- `cover.type` is `"url"` on 832 of 839 rows, but 825 of those rows have an empty `path`. The type is a stale default and says nothing about whether a cover exists, so classification must read the path.
- URL hosts: `cdn.myanimelist.net` 6 and `cdn.jkdesu.com` 1. All 6 active URL covers are MyAnimeList.

**Local-path covers (3 in total, 2 active)**

- All 3 files exist and all 3 sniff as JPEG.
- Size: min 112,932 B, p50 171,714 B, max 497,340 B.
- Height: p50 1000 px, p90 2120 px, max 2400 px. None is ≤ 320 px.

**URL cache (7 `.img` files)**

- All 7 sniff as JPEG.
- Size: min 6,420 B, p50 7,329 B, max 165,315 B.
- Height: p50 180 px, max 600 px. 6 of 7 are already ≤ 320 px, because they are MyAnimeList `r/116x180` variants.

**Thumbnail output (all 10 real covers)**

The sample was fit to a 320 px height cap with no upscaling and encoded as JPEG at quality 80.

| Measure | Min | p50 | Max |
|---|---|---|---|
| Output size | 6,387 B | 9,362 B | 29,696 B |
| Resize + encode time | 0.50 ms | 0.91 ms | 37.71 ms |

Caveat on the timings: they came from Python Pillow with a LANCZOS filter, not Go `x/image/draw`, so they bound the order of magnitude only. The 37.71 ms maximum is a ~2100 px local original.

**Implications for the proposal**

- Most of the resize work is on local covers, which are large JPEG originals. Most URL covers are already under the cap. Passing through JPEGs that are already ≤ 320 px avoids re-encoding for 6 of the 10 current covers.
- Nothing measured is PNG, GIF, WebP, ICO or SVG, and nothing has transparency. Alpha flattening and the exotic-format placeholders are defensive paths with no current data behind them.
- MyAnimeList thumbnails are 180 px tall. Without upscaling they stay below the ~240 px a 3x mobile screen needs for an 80 dp card slot. That limit comes from the metadata lookup storing the small MyAnimeList variant, not from this change, and is a follow-up candidate.
- Resource cost is small at the current volume of 8 active covers. The concurrency cap and the pixel cap protect against growth and hostile inputs, not against today's load.

## Ready for Proposal

Yes. The proposal should:

- State the new `golang.org/x/image` dependency.
- Adopt the six-unit split, with WU3 flagged as High budget risk.
- Carry open questions 1-4, 13 and 18 as dependent on the measured cover distribution.
- Carry questions 3 and 7 as items to confirm with the mobile peer.
- Record Drifts 1-6 explicitly.
