# Tasks — 2026-07-05-sdd-38-chapters-covers-parity

Strict TDD. **8 chained work-unit commits** on `feat/catalog-history` (delivery strategy:
`auto-chain` — the change exceeds the 400-line review budget as a single PR, so it is sliced
into autonomous, independently-green work units instead). Orchestrator verifies + commits per
slice; full pre-commit gate (`go test ./...`, `go vet ./...`,
`go run ./tools/checkgofilesize`, `bun --cwd=frontend run test`, `bun --cwd=frontend run
validate`) runs per commit, scoped to the languages actually touched in that slice.

**Dependency chain:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8, with two relaxations:
- Slice 4's Go query logic (`ListChapterDayCounts`) has no dependency on Slices 1-3 and MAY be
  developed in parallel; its **wails-regen phase** (4.4) is a hard sync point that requires
  Slice 3's `GetAnimeCover` binding to already exist (both new bindings must be present before
  one `wails generate module` run).
- Slice 6 (placeholder promotion) has no dependency on Slices 3-5 and MAY be pulled forward or
  run in parallel with them; it is a hard prerequisite for Slice 7 (`CoverSlot` imports the
  promoted placeholder).

---

## Slice 1 — Cover package core: ports, classification, resolution logic (~340 lines)

New file, zero wiring into existing code — pure addition, lowest-risk unit to land first.
Satisfies spec `chapters-cover-pipeline`, requirement "Cover resolution follows a
deterministic, placeholder-first order" (logic only; default adapters are Slice 2).

### Phase 1.1 — `internal/anime/cover` package skeleton + `classify`
- [x] RED: `internal/anime/cover/resolver_test.go` — table-driven cases against a still-unwritten
      `classify(path string) Kind`: `""` → `KindAbsent`; `"null"` → `KindAbsent`; `https://...` /
      `http://...` / `ftp://...` → `KindURL`; anything else (e.g. `C:\anime\cover.jpg`,
      `/mnt/covers/x.png`) → `KindLocalPath`.
- [x] GREEN: `internal/anime/cover/types.go` — `Kind` enum (`KindAbsent`, `KindURL`,
      `KindLocalPath`), exported `Classify(path string) Kind`, port interfaces `FileReader`,
      `Fetcher`, `Cache`, and the transport-neutral `Result{ DataURL string; IsCover bool }`.
      `Classify` MUST be exported (capitalized) — Slice 3 imports it from `internal/anime`
      (`chapter_service.go`) to compute `HasCover` without duplicating the string-shape rule.

### Phase 1.2 — `Resolver.Resolve` order + guardrails (fakes only, no real I/O)
- [x] RED: extend `resolver_test.go` with a fake `FileReader` (map-backed), fake `Fetcher`
      (records call count, returns canned `(data, contentType, err)`), fake `Cache` (in-memory
      map). Cases per spec scenarios: empty/`"null"` → placeholder, `Fetcher`/`FileReader` never
      called; local path present → data URL with sniffed MIME (`http.DetectContentType`); local
      path missing (`FileReader` returns error) → placeholder, no panic; URL cache-hit → cached
      bytes returned, `Fetcher.Fetch` NOT called; URL cache-miss + fetch success → `Cache.Put`
      called with the downloaded bytes, data URL returned; URL cache-miss + fetch error → placeholder,
      `Cache.Put` NOT called; fetch returns non-`image/*` content-type → placeholder; oversize
      body (> `maxBytes`) → placeholder; `Content-Type` header value preferred over sniffed MIME
      when both present; local-disk source is READ live and never passed to `Cache.Put` (spec
      "A locally-sourced cover is never copied into the cache").
- [x] GREEN: `internal/anime/cover/resolver.go` — `Resolver{ files FileReader; fetch Fetcher;
      cache Cache; maxBytes int64 }`, `NewResolver(files, fetch, cache, maxBytes) *Resolver`,
      `func (r *Resolver) Resolve(ctx context.Context, animeID, portadaPath string) Result`
      implementing the six-branch order from the spec, `image/*` MIME guard, size guard via
      byte-length check, base64 data-URL assembly
      (`fmt.Sprintf("data:%s;base64,%s", mime, base64.StdEncoding.EncodeToString(data))`).
- [x] Verify: `go test ./internal/anime/cover/... -v`, `go vet ./...`,
      `go run ./tools/checkgofilesize`.

---

## Slice 2 — Cover package default adapters: disk cache + HTTP fetcher (~375 lines)

Still zero wiring into `App`/`ChapterService` — these are real implementations of the Slice-1
ports, unit-tested in isolation. Satisfies spec requirement "Cached covers persist across
restarts and survive loss of connectivity".

### Phase 2.1 — Default `Cache`: `os.UserCacheDir()` disk cache
- [x] RED: `internal/anime/cover/disk_cache_test.go` — construct against `t.TempDir()` (override
      the cache root, not the real `UserCacheDir`, so tests are hermetic): `Put` then `Get` round-
      trips bytes; `Get` on a missing key returns `(nil, false)`; two different source URLs for the
      same anime ID produce two distinct files (no collision); a changed URL for the same anime ID
      writes under a NEW key and the OLD file is left untouched (spec "changed URL → new cache
      key"); `Put` writes atomically (temp file + `os.Rename`) — assert no partial file is
      observable mid-write is impractical in a unit test, so instead assert the final file exists
      and its content matches exactly after `Put` returns.
- [x] GREEN: `internal/anime/cover/disk_cache.go` — `diskCache{ root string }`,
      `NewDiskCache(root string) *diskCache`, key = `sha256(sourceURL)` hex,
      filename = `{animeID}-{hash}.img`, `Get`/`Put` per the design (`os.MkdirAll` the root on
      first `Put`; write to a `*.tmp` sibling then `os.Rename` into place). A separate
      `DefaultCacheRoot() (string, error)` helper wraps `os.UserCacheDir()` +
      `filepath.Join(dir, "autoreas-bridge", "covers")` for Slice 3's real wiring — returning the
      error (never panicking) so the caller can degrade gracefully.

### Phase 2.2 — Default `Fetcher`: HTTP client with timeout + context
- [x] RED: `internal/anime/cover/http_fetcher_test.go` — inject a fake `http.RoundTripper` (no
      real network): 200 response with `Content-Type: image/jpeg` header → `(body, "image/jpeg",
      nil)`; response with no `Content-Type` header → `contentType == ""` (Resolver does the sniff
      fallback, per Slice 1); non-200 status → error, no body leaked; a `RoundTripper` that blocks
      past the client timeout → context-deadline error (use a short injected timeout, not the
      production 10s, to keep the test fast); `ctx` cancellation propagates (cancel before the
      round-trip completes → error, not a hang); response body is read through an `io.LimitReader`
      capped at `maxBytes` so a hostile/huge response cannot be fully buffered (assert the fetcher
      returns at most `maxBytes` bytes, letting the Resolver's own size-guard reject it).
- [x] GREEN: `internal/anime/cover/http_fetcher.go` — `httpFetcher{ client *http.Client; maxBytes
      int64 }`, `NewHTTPFetcher(timeout time.Duration, maxBytes int64) *httpFetcher` (production
      default `10 * time.Second`), `Fetch(ctx, url) (data []byte, contentType string, err error)`
      using `http.NewRequestWithContext`.

### Phase 2.3 — Production wiring constructor
- [x] RED: `resolver_test.go` addition — `NewDefaultResolver()`-style smoke test asserting the
      returned `*Resolver` is non-nil and degrades to "URLs never cache, local paths still work"
      when `DefaultCacheRoot()` errors (inject a root-resolution failure) — this is the "must never
      panic" guarantee from the design, exercised end-to-end through the real adapters.
- [x] GREEN: convenience constructor (e.g. `NewDefaultResolver(maxBytes int64) *Resolver`) that
      wires `os.ReadFile`-backed `FileReader`, `NewHTTPFetcher`, and `NewDiskCache` off
      `DefaultCacheRoot()` — on a cache-root error, falls back to a no-op `Cache` (always miss,
      `Put` no-ops) rather than failing construction.
- [x] Verify: `go test ./internal/anime/cover/... -v`, `go vet ./...`,
      `go run ./tools/checkgofilesize`.

---

## Slice 3 — DTO extension + `GetAnimeCover` binding + `App` wiring (~245 lines)

Satisfies spec `chapters-cover-pipeline`, requirement "`ChapterScheduleItem` contract carries
cover and literal path fields" (the `HasCover`/`FolderPath`/`PageURL` swap) and wires the cover
pipeline into the composition root.

### Phase 3.1 — `ChapterScheduleItem` field swap + `AnimeCover` contract
- [x] RED: `internal/anime/chapter_service_test.go` — extend `ListChapterSchedule` fixture
      assertions: an item with non-empty `Carpeta`/`Pagina` yields `FolderPath`/`PageURL` equal to
      the trimmed source strings (reuse `hasNonEmptyLegacyString` to decide presence, then emit
      the literal string either way — empty stays empty); an item with empty/absent
      `Carpeta`/`Pagina` yields empty-string `FolderPath`/`PageURL`; `HasCover` is `true` for a
      `Portada` classified as `KindURL` or `KindLocalPath`, `false` for `KindAbsent` (use the real
      fixture's one `https://cdn.jkdesu.com/...` record plus a synthetic empty/`"null"` case —
      `animes.dat` has no local-path example, per explore §c). Assert `HasPage`/`HasFolder` no
      longer exist on the struct (compile-time proof via the struct literal in the test).
- [x] GREEN: `internal/api/contracts/contracts.go` — on `ChapterScheduleItem` (~line 169): remove
      `HasPage bool` / `HasFolder bool`; add `FolderPath string` (`json:"folderPath,omitempty"`),
      `PageURL string` (`json:"pageUrl,omitempty"`), `HasCover bool` (`json:"hasCover"`). Add new
      `AnimeCover` struct + `CoverSourceCover`/`CoverSourcePlaceholder` constants, placed next to
      `ChapterScheduleItem`.
- [x] GREEN: `internal/anime/chapter_service.go` — mirror the same three-field swap on the
      internal `ChapterScheduleItem` struct (~line 60); in `ListChapterSchedule` (~line 168),
      replace `HasPage`/`HasFolder` population with `FolderPath: item.Pagina`-style literal
      passthrough (empty when the source pointer is nil, via the existing
      `hasNonEmptyLegacyString` helper pattern) and `HasCover: item.Portada != nil &&
      cover.Classify(*item.Portada) != cover.KindAbsent` (import `internal/anime/cover`; no
      import cycle — `cover` does not import `anime`).

### Phase 3.2 — `toChapterScheduleContracts` mapping + `GetAnimeCover` binding
- [x] RED: `app_runtime_test.go` — extend the `toChapterScheduleContracts` mapping test: asserts
      `folderPath`/`pageUrl`/`hasCover` are copied through and `hasPage`/`hasFolder` are absent
      from the produced contract. New test group for `GetAnimeCover`: nil `a.animeQuery` → returns
      `{Source: "placeholder"}`; nil `a.coverResolver` → returns `{Source: "placeholder"}`;
      `GetMobileAnime` error/nil → placeholder; happy path with an injected fake `coverResolver`
      returning `cover.Result{IsCover: true, DataURL: "data:..."}` → `{DataURL: "data:...",
      Source: "cover"}`; `IsCover: false` → placeholder (no `DataURL` leak).
- [x] GREEN: `app_runtime.go` — update `toChapterScheduleContracts` (~line 296) to map the three
      new fields; add `func (a *App) GetAnimeCover(animeID string) contracts.AnimeCover` per the
      design's nil-guard shape (mirrors `GetChapterSchedule`/`GetAnimeDetailView`).
- [x] GREEN: `app.go` — add `type coverResolver interface { Resolve(ctx context.Context, animeID,
      portadaPath string) cover.Result }` (near `chapterCommandService`, ~line 111); add
      `coverResolver coverResolver` field to the `App` struct (~line 63, next to
      `chapterService`); wire a real `cover.NewDefaultResolver(...)` instance in `startup` (~line
      178, next to `a.animeQuery = ...`) — nil-safe (constructor never fails per Slice 2.3).
- [x] Verify: `go test ./...`, `go vet ./...`, `go run ./tools/checkgofilesize`,
      `go build ./...`.

---

## Slice 4 — Day-count aggregate + `GetChapterDayCounts` binding + wails regen (~220 hand-written lines + generated diff)

Satisfies spec `chapters-cover-pipeline`, requirement "Per-day active-progress count mirrors
Legacy's `buscarMedalla` semantics". The Go query logic (4.1–4.2) has no dependency on Slices
1-3 and may be developed in parallel; **Phase 4.4 (wails regen) is a hard sync point** — it
requires Slice 3's `GetAnimeCover` binding to already exist, since one `wails generate module`
run must pick up both new bindings together.

### Phase 4.1 — `ListChapterDayCounts` query
- [x] RED: new `internal/anime/chapter_day_counts_test.go`, reusing the existing fake
      `ChapterQuery` pattern from `chapter_service_test.go`: an anime with `Estado > 0` and
      `Activo != 0` on day "Lunes" increments Lunes's count by 1; `Estado == 0` excluded;
      `Activo == 0` excluded; a multi-day anime (`Dias` containing "Lunes" and "Martes") increments
      BOTH days; an empty anime list yields an empty result; only days with a non-zero count are
      present in the result slice (per design G5, "emit only non-zero to keep the payload
      minimal").
- [x] GREEN: new `internal/anime/chapter_day_counts.go` — `type ChapterDayCount struct { Day
      string; Count int }`, `func (s *ChapterService) ListChapterDayCounts(ctx context.Context)
      ([]ChapterDayCount, error)` iterating `s.query.ListMobileAnimes`, matching the same
      `Activo == 0` exclusion `ListChapterSchedule` already uses (documented drift from Legacy's
      tri-state `activo`, per design G5).

### Phase 4.2 — Contract twin + `GetChapterDayCounts` binding
- [x] RED: `app_runtime_test.go` — `toChapterDayCountContracts` mapping test; `GetChapterDayCounts`
      nil-guard test (nil `a.chapterService` → empty slice, matching `GetChapterSchedule`'s shape).
- [x] GREEN: `contracts.go` — add `ChapterDayCount{ Day string \`json:"day"\`; Count int
      \`json:"count"\` }`. `app_runtime.go` — add `toChapterDayCountContracts` mapper + `func (a
      *App) GetChapterDayCounts() []contracts.ChapterDayCount`.

### Phase 4.3 — Register on `chapterCommandService`
- [x] GREEN: `app.go` (~line 111) — add `ListChapterDayCounts(ctx context.Context)
      ([]anime.ChapterDayCount, error)` to the `chapterCommandService` interface so
      `*anime.ChapterService` continues to satisfy it structurally (no test needed beyond the
      compile check already covered by 4.2's binding test).
- [x] Verify: `go test ./...`, `go vet ./...`, `go run ./tools/checkgofilesize`,
      `go build ./...`.

### Phase 4.4 — Regenerate wails bindings (hard sync point, requires Slice 3 done)
- [x] Run `wails generate module` (or the project's equivalent generation command) — confirms
      `frontend/wailsjs/go/main/App.d.ts`/`.js` gain `GetAnimeCover`, `GetChapterDayCounts`, and
      the generated `contracts.AnimeCover`/`contracts.ChapterDayCount` TS models, and that
      `hasPage`/`hasFolder` are gone from the generated `ChapterScheduleItem` model while
      `folderPath`/`pageUrl`/`hasCover` are present.
- [x] Verify: `go build ./...` (generation does not touch Go); no frontend test run needed yet —
      the generated types are not imported by hand-written TS until Slice 5.

---

## Slice 5 — Frontend contract + source layer (~310 lines)

Satisfies the `ChapterScheduleSource` port extension implied by design F6/F7. No visual change
yet — this slice makes the new data available to the hook; the dumb component still ignores it
until Slice 7.

### Phase 5.1 — Types + schema
- [x] RED: extend `chapter-schedule-panel.helpers.test.ts` (or a new colocated test) asserting the
      updated `ChapterScheduleItem`/`ChapterScheduleRow` shapes compile with the new fields
      (`folderPath`, `pageUrl`, `hasCover` in; `hasPage`/`hasFolder` derived, not on the wire type).
- [x] GREEN: `chapter-schedule-panel.types.ts` — replace `hasPage`/`hasFolder` on
      `ChapterScheduleItem` with `folderPath: string`, `pageUrl: string`, `hasCover: boolean`; add
      `AnimeCover { dataUrl?: string; source: 'cover' | 'placeholder' }` and `ChapterDayCount {
      day: string; count: number }` types; extend `ChapterScheduleSource` with `getAnimeCover:
      (animeID: string) => Promise<AnimeCover>` and `getChapterDayCounts: () =>
      Promise<readonly ChapterDayCount[]>`; extend `ChapterScheduleRow` with `coverDataUrl?:
      string`, `showCoverPlaceholder: boolean`, `folderPath: string`, `pageUrl: string` (keep
      `hasPage`/`hasFolder` on the ROW type only — client-derived, per spec).
- [x] GREEN: `chapter-schedule-panel.schema.ts` — mirror the field swap if this file validates the
      wire shape (zod schema for `ChapterScheduleItem`); add schemas for `AnimeCover`/
      `ChapterDayCount` if the codebase validates bound-method responses here.

### Phase 5.2 — Row helper: presence derivation + cover gating + `dayBadge`
- [x] RED: `chapter-schedule-panel.helpers.test.ts` — `toChapterScheduleRows(items, covers)`:
      `hasPage`/`hasFolder` derived as `pageUrl !== ''`/`folderPath !== ''`; `showCoverPlaceholder`
      is `true` when `hasCover === false` OR the row's `covers` entry is absent/not `'cover'`
      status, `false` when a `'cover'` entry with a `dataUrl` exists; `coverDataUrl` present only
      in the latter case. New `dayBadge(day: string, counts: readonly ChapterDayCount[]):
      number | undefined` — returns the count for a matching day, `undefined` when absent or the
      count is `0` (spec: "count of 0 SHALL show no badge at all").
- [x] GREEN: `chapter-schedule-panel.helpers.ts` — `toChapterScheduleRows` signature becomes
      `(items, covers: ReadonlyMap<string, CoverEntry>)`; add `dayBadge`. `CoverEntry` type lives
      in `chapter-schedule-panel.types.ts` (small union: `{ status: 'loading' | 'placeholder' } |
      { status: 'cover'; dataUrl: string }`).

### Phase 5.3 — `bridgeRuntimeSource` bindings
- [x] RED: a bridge-runtime-source test (colocated per that module's existing test convention) —
      `getAnimeCover`/`getChapterDayCounts` degrade to `{ source: 'placeholder' }` / `[]`
      respectively when the Go binding is absent (mirrors the `waitForBindings(() =>
      hasGoBinding('...'))` pattern already covering every peer method).
- [x] GREEN: `frontend/src/infrastructure/bridge-runtime-source.ts` — add
      `getAnimeCover?: (animeID: string) => Promise<contracts.AnimeCover>` and
      `getChapterDayCounts?: () => Promise<readonly contracts.ChapterDayCount[]>` to the interface
      (~line 58 block); implement both following the exact `waitForBindings(() =>
      hasGoBinding('GetAnimeCover'))` / `hasGoBinding('GetChapterDayCounts')` template used by
      `getChapterSchedule` (~line 204).

### Phase 5.4 — Hook: cover fetch (dedupe) + day-count refresh + row assembly
- [x] RED: `use-chapter-schedule-panel.test.ts` — cover fetch fires `getAnimeCover` once per
      distinct `animeID` across re-renders (dedupe: a second render with the same `items` does NOT
      re-fire for an animeID already `'loading'`/resolved); a row with `hasCover: false` never
      triggers `getAnimeCover`; a rejected/placeholder-source cover resolves to a `'placeholder'`
      cache entry (not left `'loading'` forever); `getChapterDayCounts` is called once on mount and
      again after a successful `setAnimeState` call, but NOT after a plain `selectDay` change.
- [x] GREEN: `use-chapter-schedule-panel.ts` — add `covers` state (`ReadonlyMap<string,
      CoverEntry>`) and `dayCounts` state; add the source-port bindings (guarded by `??` fallback
      per the existing optional-binding pattern, ~line 26); an effect keyed on `items` iterates
      `hasCover` rows, skips already-tracked animeIDs, fires `getAnimeCover`, updates `covers` on
      resolve; a `refreshDayCounts` callback invoked from a mount effect AND after
      `adjustWatchedChapters`/`setAnimeState` success; `rows = useMemo(() =>
      toChapterScheduleRows(items, covers), [items, covers])`.
- [x] Verify: `bun --cwd=frontend run test`, `bun --cwd=frontend run validate`.

---

## Slice 6 — Promote the cover placeholder to `shared/ui` (~40 lines)

Independent of Slices 3-5; satisfies spec requirement "A single shared cover placeholder is
used by both Anime Detail and Chapters". Hard prerequisite for Slice 7.

### Phase 6.1 — Move + re-point the import
- [x] RED: if `AnimeDetail`'s existing placeholder test asserts an import path or snapshot tied to
      the old location, update it to the new path first (RED only if the current test would fail
      post-move; otherwise this phase is GREEN-only with a regression check).
- [x] GREEN: create `frontend/src/shared/ui/AnimeCoverPlaceholder.tsx` with the exact contents of
      `frontend/src/features/anime-detail/ui/AnimeDetail/AnimeCoverPlaceholder.tsx` (flat file,
      matching the existing `shared/` convention of flat files with no colocation folder for one
      dumb SVG component); update `AnimeDetail.tsx`'s import to
      `../../../../shared/ui/AnimeCoverPlaceholder`; delete the old feature-scoped file.
- [x] Verify: `bun --cwd=frontend run test` (existing `AnimeDetail` placeholder tests stay green,
      proving "Anime Detail placeholder behavior is unchanged after promotion"),
      `bun --cwd=frontend run validate`.

---

## Slice 7 — `ChapterScheduleCard` extraction: cover slot, hover-swap, danger minus, tooltips (~350 lines)

Satisfies spec `chapters-schedule-ui` requirements: cover slot with stable-size placeholder,
hover-swap watched/remaining, danger-colored minus, real-path tooltips. Depends on Slice 5
(row fields) and Slice 6 (shared placeholder).

### Phase 7.1 — Extract the card, cover slot, no layout shift
- [x] RED: new `__tests__/ChapterScheduleCard.test.tsx` — renders the shared placeholder when
      `showCoverPlaceholder` is `true`; renders `<img src={row.coverDataUrl}>` when `false` and a
      `coverDataUrl` is present; both branches render inside the same fixed-size wrapper class (a
      snapshot/className assertion, since jsdom cannot measure real layout).
- [x] GREEN: new `ChapterScheduleCard.tsx` (colocated in `ChapterSchedulePanel/`) — receives one
      `row` plus the action callbacks (`adjustWatchedChapters`, `setAnimeState`,
      `openAnimePage`/`copyAnimePage`/`openAnimeFolder`/`copyAnimeFolder`) as readonly props; a
      `CoverSlot` sub-component inside the same file renders `<img className="size-full
      object-cover">` or the shared placeholder inside a `w-24 self-stretch` box per design F1;
      `ChapterSchedulePanel.tsx` shrinks to the day-tab header + `rows.map(row =>
      <ChapterScheduleCard key={row.id} row={row} ... />)`.

### Phase 7.2 — Hover-swap watched/remaining (CSS-only)
- [x] RED: `ChapterScheduleCard.test.tsx` — both `row.watchedLabel` and `row.remainingLabel` render
      as sibling spans with the `group-hover` utility class pair present (documents the CSS-only
      swap is wired; the no-truncation guarantee itself is already covered by the Slice-5 helper
      test on `remainingLabel`).
- [x] GREEN: replace the `Tooltip`-wrapped watched-count span (current
      `ChapterSchedulePanel.tsx:61-67`) with the two-span `group`/`group-hover:hidden`/
      `group-hover:inline` markup from design F2, moved into `ChapterScheduleCard.tsx`.

### Phase 7.3 — Danger minus / primary-dominant hierarchy
- [x] RED: `ChapterScheduleCard.test.tsx` — minus button carries the danger treatment (assert
      whichever prop the installed `@heroui/react` `Button` exposes — check the d.ts during GREEN;
      test asserts the resulting class/attribute, not a hardcoded prop name blind guess); plus
      button still carries `variant="primary"`.
- [x] GREEN: verify the installed `@heroui/react` Button typings (`node_modules/@heroui/react` or
      equivalent d.ts) for a `color`/`variant` danger token; apply `color="danger"` if exposed,
      else the danger `variant`; never a hand-rolled hex color.

### Phase 7.4 — Real-path tooltips
- [x] RED: `ChapterScheduleCard.test.tsx` — folder button's tooltip content shows the literal
      `row.folderPath` string; page button's tooltip content shows the literal `row.pageUrl`
      string; both actions stay hidden when the respective row field is `''` (unchanged gating).
- [x] GREEN: wrap the folder/page `Button`s in HeroUI `Tooltip` with `Tooltip.Content` set to
      `row.folderPath`/`row.pageUrl`, keeping the existing descriptive `aria-label`.
- [x] Verify: `bun --cwd=frontend run test`, `bun --cwd=frontend run validate`,
      `bun --cwd=frontend run filesize:warning` (watch `ChapterScheduleCard.tsx` and
      `ChapterSchedulePanel.tsx` against the 400-line warning).

---

## Slice 8 — Day-count badges on the day `ToggleButton`s (~80 lines)

Satisfies spec `chapters-schedule-ui` requirement "Day ToggleButtons show a count badge of
active, unresolved-progress animes". Depends on Slice 5 (`dayCounts` state + `dayBadge` helper)
and Slice 4 (the binding the hook calls).

### Phase 8.1 — Badge rendering
- [x] RED: `ChapterSchedulePanel.test.tsx` — a day with `dayBadge(...)` returning a positive count
      renders a badge showing that count; a day with `undefined` (0 or absent) renders no badge
      element at all (not a "0" badge, per spec).
- [x] GREEN: `ChapterSchedulePanel.tsx` — each `ToggleButton` renders `{day}` plus a conditional
      `<Chip size="sm" variant="soft">{count}</Chip>` per design F5, sourced from
      `dayBadge(day, dayCounts)`; verify `Chip` nests cleanly inside `ToggleButton` in this HeroUI
      version during GREEN — fall back to a styled span with a white-alpha surface if it does not.
- [x] Verify: `bun --cwd=frontend run test`, `bun --cwd=frontend run validate`,
      `bun --cwd=frontend run filesize:warning`.

---

## Phase 9 — Close (orchestrator)

- [ ] Full gate green on the final commit of the chain (all 8 work units, each independently
      green).
- [ ] Confirm end-to-end manual smoke (or an integration test if the project has one) against the
      real `resources/autoreas-data/animes.dat` fixture: the one real cover
      (`rezero-kara-hajimeru-isekai-seikatsu-3rd-season.jpg`) resolves and renders; the 793
      no-cover rows and the 1 `"null"`-sentinel row all show the placeholder; day badges match
      `estado > 0` counts observed in the fixture.
- [ ] `sdd-verify` (orchestrator-run, per project convention) against both spec files before
      commit.

---

## Review Workload Forecast

| Slice | Content | Estimated changed lines |
|---|---|---|
| 1 | Cover package core (ports, classify, Resolver logic + fakes-only tests) | ~340 |
| 2 | Cover package default adapters (disk cache, HTTP fetcher, wiring constructor) | ~375 |
| 3 | DTO field swap + `GetAnimeCover` binding + `App` wiring | ~245 |
| 4 | Day-count query + `GetChapterDayCounts` binding + wails regen (hand-written) | ~220 (+ generated diff, not hand-reviewed) |
| 5 | Frontend contract/source layer (types, schema, runtime source, hook) | ~310 |
| 6 | Shared placeholder promotion | ~40 |
| 7 | `ChapterScheduleCard` extraction (cover slot, hover-swap, danger minus, tooltips) | ~350 |
| 8 | Day-count badges on `ToggleButton`s | ~80 |
| **Total** | | **~1,960** |

- **Chained PRs recommended:** Yes.
- **400-line budget risk:** Low per individual slice (all 8 estimated at or under ~375 lines);
  Slices 2 and 7 are the closest to the ceiling and are the two to re-estimate first if
  `sdd-apply` finds the real diff running hot — Slice 2 can split further into "disk cache" /
  "HTTP fetcher" as two units if needed; Slice 7 can split "cover slot" from "hover-swap + danger
  minus + tooltips" if needed. The 1,960-line total across 8 units is expected and acceptable
  under `auto-chain` — no single unit is planned to exceed the budget.
- **Decision needed before apply:** No — strategy pre-resolved to `auto-chain` by the
  orchestrator; this forecast documents the slicing already applied, not an open question.
