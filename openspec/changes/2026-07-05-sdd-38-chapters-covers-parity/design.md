# Design — 2026-07-05-sdd-38-chapters-covers-parity

Grounded in the code as it stands on `feat/catalog-history`: `internal/anime/chapter_service.go`,
`internal/api/contracts/contracts.go:169` (`ChapterScheduleItem`), `app_runtime.go:201-315`
(`GetChapterSchedule` + `toChapterScheduleContracts`), `app.go:63/73/222-236` (composition root),
`main.go:19-33` (`Bind: []interface{}{app}` auto-registration), and the Chapters feature at
`frontend/src/features/chapters/ui/ChapterSchedulePanel/`. Decisions locked by the proposal
(base64 data-URL binding, `os.UserCacheDir()` persistent cache keyed by anime ID + URL hash,
promote `AnimeCoverPlaceholder`) are NOT reopened here — this document is the HOW.

## Architecture at a glance

Three independent backend seams feed one restructured frontend card:

1. **Cover pipeline** — a new hexagonal package `internal/anime/cover` (ports for file read,
   HTTP fetch, disk cache) driven by a new bound method `App.GetAnimeCover(animeID) → contracts.AnimeCover`.
   Lazy, per-row, only fired for rows the schedule query flagged as having a cover.
2. **DTO extension** — `ChapterScheduleItem` gains literal `folderPath`/`pageUrl` strings (real-path
   tooltips) and a `hasCover` gate; `hasPage`/`hasFolder` become client-derived and leave the wire.
3. **Day counts** — a new `ChapterService.ListChapterDayCounts` (new file `chapter_day_counts.go`)
   + bound `App.GetChapterDayCounts()`, mirroring Legacy `buscarMedalla` (`estado > 0`, active, day match).

Frontend: the per-row card is extracted into a colocated dumb `ChapterScheduleCard`, the hook owns
cover fetching + day-count fetching + an in-memory cover cache, and the placeholder SVG is promoted
to `frontend/src/shared/ui/`.

---

## Go / backend

### G1 — New package `internal/anime/cover` (ports so strict TDD can mock every boundary)

Placement mirrors the existing hexagonal split under `internal/anime/` (domain projection lives in
`internal/anime/domain`; the cover concern is a distinct, self-contained pipeline, so it earns its
own leaf package rather than growing `chapter_service.go`).

```go
package cover

// Source classification, decided by string shape (mirrors Legacy's indifference to portada.type).
type Kind int
const ( KindAbsent Kind = iota; KindURL; KindLocalPath )

// Ports — each an interface so tests inject fakes (fake round-tripper, in-memory cache, temp-dir reader).
type FileReader interface { ReadFile(path string) ([]byte, error) }        // default: os.ReadFile
type Fetcher    interface { Fetch(ctx context.Context, url string) (data []byte, contentType string, err error) }
type Cache      interface { Get(key string) ([]byte, bool); Put(key string, data []byte) error }

type Resolver struct { files FileReader; fetch Fetcher; cache Cache; maxBytes int64 }

// Result is transport-neutral; the App layer turns it into contracts.AnimeCover.
type Result struct { DataURL string; IsCover bool }

func (r *Resolver) Resolve(ctx context.Context, animeID, portadaPath string) Result
```

**Resolution order** (returns `IsCover:false` = "use placeholder" in every failure/absent branch —
never an error to the UI; a missing cover is normal, not exceptional):

| Input shape (`classify(portadaPath)`) | Behaviour |
|---|---|
| empty / `"null"` sentinel | `KindAbsent` → `{IsCover:false}` (no read, no fetch) |
| matches URL regex (`^(https?|ftp)://`) | `KindURL` → cache-first (see G2); miss → fetch+cache; fetch fails & no cache → `{IsCover:false}` |
| anything else | `KindLocalPath` → `files.ReadFile`; error → `{IsCover:false}` |

Reuse the existing empty/`"null"` normalization semantics from `normalizeAnimeDetailPortadaUrl`
(frontend) — here re-implemented as a tiny pure `classify` in Go and unit-tested; the two live in
different runtimes so they cannot literally share code, but they MUST agree (fixture: `""`, `"null"`,
the one real `https://cdn.jkdesu.com/...jpg`).

**MIME + guardrails:**
- Prefer the HTTP `Content-Type` header when present and non-empty; otherwise `http.DetectContentType(data)`.
  Local-path reads always use `http.DetectContentType`.
- Reject anything not `image/*` → `{IsCover:false}` (defends against an HTML error page cached as an "image").
- Max size: `maxBytes` (default **10 MiB**) enforced via `io.LimitReader` in the default `Fetcher`
  and a length check on local reads; over-size → `{IsCover:false}`.
- Download timeout: default `Fetcher` uses `http.Client{Timeout: 10s}` AND honours `ctx`.
- Data URL: `fmt.Sprintf("data:%s;base64,%s", mime, base64.StdEncoding.EncodeToString(data))`.

**Concurrency:** the frontend fires N `GetAnimeCover` calls, but only for `hasCover` rows —
against the real fixture that is N≈1, and in any realistic library still small. We deliberately
**do NOT add singleflight** (documented decision: it is unjustified complexity at this cardinality).
The only shared-state hazard is two calls caching the *same* anime concurrently; the default `Cache.Put`
writes to a temp file and `os.Rename`s into place (atomic on the same volume), so a concurrent reader
sees either the old or the complete new file, never a torn one.

### G2 — Disk cache (default `Cache` adapter)

- Root: `os.UserCacheDir()` + `/autoreas-bridge/covers/` (created with `os.MkdirAll` on first `Put`;
  a `UserCacheDir` error degrades the whole resolver to "URLs never cache, local paths still work" —
  it must never panic). This is the bridge's FIRST cache-dir convention (none exists in Go today).
- Key: `sha256(sourceURL)` hex, filename `{animeID}-{hash}.img`. Anime ID scopes the file to the
  record; the URL hash means a **changed source URL yields a new key** → no stale image served, and
  no collisions. Only URLs are cached; local disk paths are read live each call (never copied in).
- Eviction: **none** this change (durable cache; 1-in-795 cover rate makes size a non-issue). Old
  entries from a changed URL are simply left behind — acceptable, recorded as a follow-up if ever needed.

### G3 — Binding `App.GetAnimeCover` + contract

New method on `App` (auto-registered via `main.go`'s `Bind: []interface{}{app}` — no `main.go` edit):

```go
func (a *App) GetAnimeCover(animeID string) contracts.AnimeCover {
    if a.animeQuery == nil || a.coverResolver == nil { return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder} }
    current, err := a.animeQuery.GetMobileAnime(a.appContext(), animeID)
    if err != nil || current == nil { return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder} }
    portada := ""
    if current.Portada != nil { portada = *current.Portada }   // MobileAnime.Portada is the PortadaPath() string (contracts.go:45, mobile.go:37)
    res := a.coverResolver.Resolve(a.appContext(), animeID, portada)
    if !res.IsCover { return contracts.AnimeCover{Source: contracts.CoverSourcePlaceholder} }
    return contracts.AnimeCover{DataURL: res.DataURL, Source: contracts.CoverSourceCover}
}
```

Contract (in `contracts.go`, next to `ChapterScheduleItem`):

```go
const ( CoverSourceCover = "cover"; CoverSourcePlaceholder = "placeholder" )

type AnimeCover struct {
    DataURL string `json:"dataUrl,omitempty"` // present only when Source == "cover"
    Source  string `json:"source"`            // "cover" | "placeholder"
}
```

`App` gains a `coverResolver` field behind a tiny local interface (mirrors `chapterCommandService`
at `app.go:63` so `app_runtime_test.go` can inject a fake without a real HTTP client):

```go
type coverResolver interface { Resolve(ctx context.Context, animeID, portadaPath string) cover.Result }
```

Wired in `startup` (`app.go`, next to `a.animeQuery = ...`) with real adapters: `os.ReadFile`,
an `http.Client{Timeout: 10s}` fetcher, and the `UserCacheDir` disk cache. Nil-safe: if the cache
dir can't be resolved, the resolver still serves local paths and live-fetches URLs without persisting.

### G4 — DTO extension on `ChapterScheduleItem`

The literal folder/page strings are what make real-path tooltips possible (today only `HasPage`/`HasFolder`
booleans cross the wire — `contracts.go:178-179`, `chapter_service.go:177-178`). `hasCover` is the cheap
gate that keeps the frontend from firing 793 pointless `GetAnimeCover` calls.

- `internal/anime/chapter_service.go` `ChapterScheduleItem` (the internal type) and
  `contracts.ChapterScheduleItem`: **remove** `HasPage bool` / `HasFolder bool`; **add**
  `FolderPath string` (`json:"folderPath,omitempty"`), `PageURL string` (`json:"pageUrl,omitempty"`),
  `HasCover bool` (`json:"hasCover"`).
- Population in `ListChapterSchedule` (`chapter_service.go:168`): `FolderPath` = trimmed `item.Carpeta`
  (empty when absent — reuse `hasNonEmptyLegacyString` to decide, then emit the string), same for
  `PageURL` from `item.Pagina`. `HasCover` = `classify(portadaPath(item)) != KindAbsent` — needs the
  portada string; `MobileAnime` carries `Portada *string` (contracts.go:45), so read it directly here.
- `toChapterScheduleContracts` (`app_runtime.go:296`): map the three new fields, drop the two removed.
- **Why drop `hasPage`/`hasFolder` instead of adding alongside:** the path string is a strict superset
  (`hasFolder == folderPath != ""`). `ChapterScheduleItem` is consumed by exactly one feature, so the
  single-source-of-truth win has zero blast radius elsewhere. The frontend row helper re-derives the
  booleans (below), and the dumb component keeps reading `row.hasPage`/`row.hasFolder` unchanged.

**Security note (recorded, not a blocker):** unlike `AnimeListItem` (which deliberately hides raw
paths — `contracts.go:98-104`), Chapters now exposes the literal folder path / page URL to the webview.
This matches what `AnimeDetail` already does (`paginaUrl`, `carpetaLabel`) and what Legacy shows in its
tooltips; it is a local single-user desktop app, so no new exposure boundary is crossed.

### G5 — Day counts (`buscarMedalla` parity)

New file `internal/anime/chapter_day_counts.go` (method on `ChapterService`, kept out of the already-490-line
`chapter_service.go` per file-size policy — Go methods may split across files in one package):

```go
type ChapterDayCount struct { Day string; Count int }
func (s *ChapterService) ListChapterDayCounts(ctx context.Context) ([]ChapterDayCount, error)
```

Semantics, mirroring `consultas.js buscarMedalla`: iterate `ListMobileAnimes`; for each anime with
`Activo != 0` (see drift note) and `Estado > 0`, increment the count for **each** day in `item.Dias`.
Return one entry per weekday that has a non-zero count (or all weekdays with zeros — the frontend maps
by key and shows no badge for 0, so either is fine; emit only non-zero to keep the payload minimal).

Contract twin `contracts.ChapterDayCount` + bound `App.GetChapterDayCounts() []contracts.ChapterDayCount`
(same nil-guard shape as `GetChapterSchedule`, `app_runtime.go:201`), plus a `toChapterDayCountContracts`
mapper. `ListChapterDayCounts` must be added to the `chapterCommandService` interface (`app.go:63`).

**Drift note (code wins):** Legacy `buscarMedalla` counts `activo === true OR activo absent`. The bridge
collapses `activo` to an `int` and `ListChapterSchedule` already treats `Activo == 0` as inactive
(`chapter_service.go:161`). Day counts reuse that SAME predicate for internal consistency with the
schedule the badges annotate — a deliberate, documented deviation from Legacy's tri-state nuance.

**Season mode:** the season lenses (`Sin ver`/`Visto`/`Ver hoy`) are computed filters, not stored days,
so they carry no `buscarMedalla`-style badge. Badges apply to weekday tabs only; season tabs render none.
This is out of scope for the count query (it keys by weekday string).

---

## Frontend

### F1 — Cover slot that flows into the card edge (design continuity, surpassing Legacy)

Restructure the per-row `Card` from a padded content box into a horizontal composition where the cover
occupies the full-height left edge (Legacy's `.card.horizontal .card-image` intent, done with HeroUI v3
+ Tailwind):

```tsx
<Card className="overflow-hidden">        {/* overflow-hidden so the image is clipped to the card radius */}
  <div className="flex">
    <CoverSlot row={row} />                {/* w-24 shrink-0 self-stretch: fixed width, full card height */}
    <Card.Content className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      … existing title/chip/progress/actions …
    </Card.Content>
  </div>
</Card>
```

`CoverSlot` (dumb, no layout shift because placeholder and image share the exact slot box):
- has cover + resolved data URL → `<img className="size-full object-cover" src={row.coverDataUrl} alt="">`
  inside the `w-24 self-stretch` box.
- otherwise (no cover, still loading, or fetch failed) → the shared placeholder centered on a subtle
  surface: `<div className="flex size-full items-center justify-center rounded-l-[inherit] bg-white/[0.04] text-muted"><AnimeCoverPlaceholder className="size-12" /></div>`.

`w-20`/`w-24` fixed width + `self-stretch` (full height) guarantees zero reflow between placeholder and
image. HeroUI has no rectangular image primitive in this version (explore §b), so a styled `<img>` is
correct — same choice `AnimeDetail` made.

### F2 — Hover-swap watched ↔ remaining, CSS-only (no truncation bug, dumb-safe)

The helper already computes both `watchedLabel` and `remainingLabel` from the SAME non-truncated value
(`chapter-schedule-panel.helpers.ts:13-15`). Render BOTH as sibling spans inside a `group` and swap with
Tailwind `group-hover` — **no JS state, no `useEffect`, no business logic in the `.tsx`**, and structurally
impossible to reproduce Legacy's `parseInt` truncation (there is no per-direction recompute; the two
labels are precomputed once):

```tsx
<span className="group relative cursor-default">
  <span className="group-hover:hidden">{row.watchedLabel}</span>
  <span className="hidden group-hover:inline">{row.remainingLabel}</span>
</span>
```

This replaces today's tooltip-only presentation (`ChapterSchedulePanel.tsx:61-67`). `remainingLabel`
already preserves fractional progress (`3.5` → `8.5 remaining`, never `9`).

### F3 — Danger minus / primary-dominant action hierarchy

Minus button moves off neutral `variant="tertiary"` (`ChapterSchedulePanel.tsx:107`) to HeroUI's
**danger** semantic; plus stays the constructive/primary action. Exact prop shape MUST be verified
against the installed `@heroui/react` Button typings during apply (the codebase uses `variant` tokens
`primary|secondary|tertiary|ghost`, while `Alert` uses `status="danger"` and `Chip` uses `color="danger"`);
prefer `color="danger"` if Button exposes it, else the danger `variant`. Never hand-roll a red hex — use
the semantic token only. The ± pair remains the visually dominant control (icon size `size-5`, unchanged).

### F4 — Real-path tooltips

Wrap the folder and page buttons in HeroUI `Tooltip` whose content is the literal string
(`row.folderPath` / `row.pageUrl`), keeping the descriptive `aria-label` for a11y. Today the buttons
carry only a generic aria-label and no tooltip content (`ChapterSchedulePanel.tsx:83-97`).

### F5 — Day count badges on the ToggleButtons

`ToggleButton` already renders arbitrary children (`{day}` today — `ChapterSchedulePanel.tsx:38`), so a
count badge is a child span/`Chip` beside the label, rendered only when count > 0:

```tsx
<ToggleButton id={day} key={day}>
  {day}
  {dayBadge(day, dayCounts) !== undefined ? <Chip size="sm" variant="soft">{dayBadge(day, dayCounts)}</Chip> : null}
</ToggleButton>
```

`dayBadge` is a pure helper mapping the `ChapterDayCount[]` to a count for a given day key (undefined /
0 → no badge). Prefer HeroUI `Chip` for token consistency; verify `Chip` nests cleanly inside
`ToggleButton` during apply, else fall back to a styled span with white-alpha surface.

### F6 — Hook changes (`use-chapter-schedule-panel.ts`, strict anatomy preserved)

- **Source port** (`chapter-schedule-panel.types.ts` `ChapterScheduleSource`): add
  `getAnimeCover: (animeID) => Promise<AnimeCover>` and `getChapterDayCounts: () => Promise<readonly ChapterDayCount[]>`.
- **State:** add `covers: ReadonlyMap<string, CoverEntry>` (in-memory, per-session cache — the "in-memory
  map per session is fine" from the brief) and `dayCounts: readonly ChapterDayCount[]`. `CoverEntry` is a
  small union: `{ status: 'loading' | 'placeholder' } | { status: 'cover'; dataUrl: string }`.
- **Cover fetching (hook owns the effect; `.tsx` stays dumb):** an effect keyed on `items` iterates rows
  with `hasCover`, skips any animeID already present/in-flight in the `covers` map (**dedupe**), fires
  `getAnimeCover`, and on resolve stores `cover`+dataUrl, on reject/`placeholder` stores `placeholder`.
  Rows without `hasCover` never trigger a call — the map stays empty for them and the row helper resolves
  them straight to the placeholder.
- **Day counts:** a `refreshDayCounts` callback calls `getChapterDayCounts`; invoked from a mount effect
  AND after every successful `adjustWatchedChapters` / `setAnimeState` (the estado boundary crossings that
  change a badge — `setAnimeState` moves estado across 0, and a `+`/`-` never changes estado but a state
  reset via Repeat/Restore does; refreshing on the two write paths the panel exposes keeps badges honest).
  Decoupled from `selectedDay` (counts are day-independent), so plain tab switches don't refetch.
- **Row assembly:** `toChapterScheduleRows` now takes `(items, covers)` and stamps each row with
  `coverDataUrl?`, `showCoverPlaceholder` (`hasCover === false` OR entry status !== 'cover'), and derives
  `hasPage`/`hasFolder` + `folderPath`/`pageUrl` from the new DTO fields.
- The default `props.source` wiring (`use-chapter-schedule-panel.ts:26-39`) adds the two new bindings
  guarded by `bridgeRuntimeSource.getAnimeCover ?? …` / `getChapterDayCounts ?? …`, matching the existing
  optional-binding pattern.

### F7 — `bridgeRuntimeSource` + generated bindings

Regenerate `wailsjs` (adds `GetAnimeCover`, `GetChapterDayCounts`, and the new `contracts.AnimeCover`
/`contracts.ChapterDayCount` models). Add both methods to the `BridgeRuntimeSource` interface and
implementation with the same `waitForBindings(() => hasGoBinding('…'))` degradation used by every peer
(`bridge-runtime-source.ts:204-208` is the template): cover miss → `{ source: 'placeholder' }`, counts
miss → `[]`.

### F8 — Promote the placeholder to `shared/ui`

`frontend/src/shared/` today holds `contracts/`, `datetime/`, `hooks/`, `store/` as flat files (no barrel
index). Establish `frontend/src/shared/ui/` and move `AnimeCoverPlaceholder.tsx` there verbatim (it is a
single pure SVG component — a flat file matches the existing shared conventions; no colocation folder
needed for one dumb component).
- Update the anime-detail import (`AnimeDetail.tsx:2`) from `./AnimeCoverPlaceholder` to the shared path.
- Delete the old feature-scoped copy.
- Chapters' `CoverSlot` imports the same shared component and sizes it (`className="size-12"`) for the
  rectangular slot.

### F9 — Preemptive component split (file-size forecast)

`ChapterSchedulePanel.tsx` is 165 lines today. Adding cover slot, hover-swap spans, two tooltips, danger
minus, and day badges realistically lands the file around ~210 lines — under the 400 warning, but the
per-row card is by far the densest part. **Decision: preemptively extract `ChapterScheduleCard.tsx`**
(colocated in the same folder) rendering one `row` + receiving the action callbacks as readonly props.
Rationale is testability and readability more than the raw count: component tests target the card in
isolation (hover markup, danger minus, tooltip strings), and the panel shrinks to the day-tab header +
`rows.map(row => <ChapterScheduleCard … />)`. `CoverSlot` is a small sub-component inside
`ChapterScheduleCard.tsx` (not its own file). Both files stay comfortably under 400.

---

## Testing design (STRICT TDD — tests first, then implementation)

### Go (table-driven, fakes at every port)

- **`internal/anime/cover`** — inject a fake `Fetcher` (records calls, returns canned bytes/content-type/err),
  a fake `FileReader`, and a real disk `Cache` rooted at `t.TempDir()`. Cases: empty → placeholder;
  `"null"` → placeholder; local path present (fake reader) → data URL with sniffed MIME; local path missing
  → placeholder; URL cache-hit → returns cached, `Fetcher` NOT called; URL cache-miss → fetch, cache written
  (assert file exists under temp dir), data URL returned; URL fetch error + no cache → placeholder; fetch
  returns non-image content-type → placeholder; oversize body → guardrail → placeholder; content-type from
  header preferred over sniff; changed URL → new cache key (old file untouched). A synthetic local-path
  fixture is REQUIRED — `animes.dat` has no local-path example (explore §c).
- **`ListChapterDayCounts`** — reuse the `chapter_service_test.go` fake `ChapterQuery` pattern: estado>0
  counted; estado 0 excluded; `Activo==0` excluded; multi-day anime increments each of its days; empty list
  → empty result.
- **`app_runtime` mappers** — extend `app_runtime_test.go`: `toChapterScheduleContracts` maps
  `folderPath`/`pageUrl`/`hasCover` and no longer emits `hasPage`/`hasFolder`; `GetAnimeCover` /
  `GetChapterDayCounts` nil-guards (nil `animeQuery`/`coverResolver` → placeholder / empty slice) via
  injected fakes.

### Frontend (vitest + testing-library, colocated `__tests__/`)

- **Helpers:** `toChapterScheduleRows` — remaining math preserves fractional (`nrocapvisto 3.5, totalcap 12`
  → `remainingLabel "8.5 remaining"`, never truncated), clamps negatives to 0, `Unknown remaining` when
  `totalcap` absent; `hasPage`/`hasFolder` derived from `pageUrl`/`folderPath`; `showCoverPlaceholder` true
  when `hasCover` false or cover entry not resolved. `dayBadge` — count for a day, undefined for 0/absent.
- **Hook:** cover fetch dedupe (same animeID requested once across re-renders); fetch rejection →
  placeholder entry; `hasCover:false` row → `getAnimeCover` never called; `getChapterDayCounts` fetched on
  mount and re-fetched after a successful `setAnimeState`. Use a fake `source` prop (the panel already
  supports `props.source`).
- **Component (`ChapterScheduleCard`):** both `watchedLabel` and `remainingLabel` spans render with the
  `group-hover` utility classes (jsdom cannot assert the visual CSS swap — the no-truncation GUARANTEE is
  covered by the helper test, documented here as the honest test boundary); minus button carries the danger
  treatment; folder/page tooltips expose the literal path strings; badge renders the count and is absent at
  0; `<img>` vs placeholder rendered per row cover fields. React Aria notes for apply: `fireEvent.click`
  works on HeroUI buttons; single-select `ToggleButtonGroup` exposes `role="radio"` on options.

---

## Risks / assumptions to validate during apply

1. **HeroUI Button danger prop** (F3) and **Chip-inside-ToggleButton** (F5) — exact API not pinned here;
   verify against the installed `@heroui/react` d.ts. Fallbacks specified (danger `variant`; styled span).
2. **`os.UserCacheDir()` on Windows** returns `%LocalAppData%` — must `MkdirAll` the `autoreas-bridge/covers`
   subtree; a resolution error must degrade gracefully (URLs live-fetched without persist), never panic.
3. **CSS-only hover swap is untestable in jsdom** — the behavioral guarantee lives in the helper test.
   Accepted trade-off for keeping the `.tsx` dumb (the alternative, mouseenter state in the hook, adds JS
   for a purely presentational effect).
4. **Day-count active predicate diverges from Legacy's tri-state `activo`** (G5 drift note) — intentional,
   consistent with the schedule the badges annotate; flag if a future data audit shows absent-`activo` rows.
5. **`hasCover` gate depends on the portada string reaching `ListChapterSchedule`** — `MobileAnime.Portada`
   is already the projected `PortadaPath()` (mobile.go:37), so the field is available without touching the
   query service.
6. **Wails binding regeneration** must run before frontend type work (`contracts.AnimeCover` /
   `ChapterDayCount` models are generated, not hand-authored on the TS side).
```
