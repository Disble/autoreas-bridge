# Exploration: SDD-38 Chapters/Covers Parity with Legacy

> Engram topic: `sdd/sdd-38-chapters-covers-parity/explore` (observation #4636). This file is the hybrid-mode copy.

## (a) Legacy facts confirmed/corrected (file:line refs, D:\dev\disble\automatizar-tareas)

The real day-schedule page is `views/animes/ver.html` + `js/ver-init.js` + `models/RenderVerAnime.js` (NOT `viendo.html`/`anime-viendo-init.js`, which is an unrelated Chart.js "capítulos vistos" stats page — trap in the naming).

1. **Cover image** — CONFIRMED. `RenderVerAnime.js:236` calls `_validateDefaultImage(anime.portada.path)` (defined lines 404-446) and sets it as `background-image` on `.ver-img-card` (a Materialize `.card.horizontal .card-image` div, full-height left edge, line 192-197). Resolution order: (1) `isNoData(path) || path === ''` → placeholder `images/before_dawn.svg`; (2) `isUrl(path)` (regex test for ftp/http/https) → sync `XMLHttpRequest HEAD` via `urlExists()` (`RenderBase.js:562-571`) — if reachable use it, else placeholder; (3) otherwise treat as local disk path → `fs.existsSync()` — if true use it, else placeholder. **The `portada.type` field ("url"/"image") is entirely unused/vestigial** — Legacy re-detects URL-vs-path from the string shape every time, never trusts `type`. Other placeholders exist (`not_found.svg` for the empty-day state, `Tree_swing.svg` unused/dead code in this function) — only `before_dawn.svg` is the cover placeholder.

2. **Hover swap on watched-count** — CONFIRMED with a QUIRK. `RenderVerAnime.js:325-340`. `mouseover`: `capInv = capTotal - parseInt(cap)` (truncates fractional/half-chapter values before subtracting) → `"${capInv} capítulos restantes"`. `mouseout`: restores using the ORIGINAL (non-truncated) `cap` value → `"${cap} capítulos vistos"`. So Legacy has an inconsistent truncation bug between the two directions for half-chapter progress. Total (`totalcap`) and watched (`nrocapvisto`) are read straight off the anime record, same fields the bridge already has (`ChapterScheduleItem.totalcap`/`.nrocapvisto`).

3. **+/− dominant colors** — CONFIRMED. `RenderVerAnime.js:222-226`: minus = `red-text`, plus = `blue-text`, both `btn transparent z-depth-0` (icon-only, no fill) — dominance comes purely from icon color, not background/elevation. Bridge currently uses `variant="tertiary"` (gray) for minus and `variant="primary"` for plus — minus is the parity gap (should carry `danger` semantic color).

4. **Right-click on +/−** — CONFIRMED, and bridge ALREADY MATCHES. `RenderVerAnime.js:290-323`: left-click ±1 whole chapter; `mouseup` with `e.button === 2` (right-click) → ±0.5 half-chapter. Bridge's `ChapterSchedulePanel.tsx:108-127` (`onContextMenu` calling `adjustWatchedChapters(id, ±0.5, ...)`) already implements this exact behavior. No gap here.

5. **Folder + link icons** — CONFIRMED, and bridge ALREADY MATCHES functionally. `RenderVerAnime.js:209-214` (markup), `239-240` (visibility guards), `260-270` (folder handlers), `241-259` (link handlers). Folder: tooltip = `anime.carpeta` (the literal path string); `mouseup button 0` → `shell.openItem(carpeta)`; `button 2` → `clipboard.writeText(carpeta)` + toast `"Dirección de la carpeta copiada al portapapeles"`; hidden if `isNoData(carpeta) || carpeta === ''`. Link: tooltip = `anime.pagina`; `button 0` → `shell.openExternal(pagina)` (error `swal` on failure); `button 2` → `clipboard.writeText(pagina)` + toast `"URL copiada al portapapeles"`; hidden if `!isUrl(pagina)`. Bridge's `openAnimeFolder`/`copyAnimeFolder`/`openAnimePage`/`copyAnimePage` (`app_desktop_actions.go`) already implement open+copy for both. **Gap**: bridge's tooltip is a static aria-label — it does NOT show the actual folder path text like Legacy's `data-tooltip="${anime.carpeta}"`, because `ChapterScheduleItem` only exposes `HasFolder`/`HasPage` booleans, not the path strings themselves.

6. **Status dialog** — CONFIRMED, trigger clarified. There's a THIRD icon in Legacy's left icon cluster (`ver-sun-icon`, `icon-sun-inv`, `RenderVerAnime.js:215-217`) whose tooltip shows the current state name and whose click (`data-target="modal${id}"`, Materialize modal trigger) opens the dialog — it is a manual, always-visible trigger, NOT triggered automatically on reaching the last chapter. Dialog markup lines 175-190: header "¿En este momento el estado es...?", illustration `images/Golden_gate_bridge.svg`, four buttons wired at lines 271-282 via `RenderBase.js:97-124` `getState()`: Viendo (`icon-play`, `green-text`, estado 0), Finalizado (`icon-ok-squared`, `teal-text`, estado 1), No me gusto (`icon-emo-unhappy`, `red-text`, estado 2), En pausa (`icon-pause`, `orange-text`, estado 3). Bridge's `ChapterSchedulePanel.tsx:130-157` already has an equivalent 4-option status Modal (Watching/Completed/Dropped/Paused) but places its trigger as a right-side `menu-dots` icon-only button instead of inline with folder/link on the left — a layout/discoverability difference, not a functional gap.

7. **Sidebar day badges** — CORRECTED. Screenshot claim "count of FINALIZADOS" is imprecise. `consultas.js:129-141` `buscarMedalla(dia)`: counts animes where `dias` contains `dia` AND (`activo === true` OR `activo` field absent) AND **`estado > 0`** — i.e. any non-"Viendo" state (Finalizado=1, No me gusto=2, En pausa=3 all count), not just Finalizado. This maps 1:1 to the boolean bridge already computes client-side: `item.estado > 0` → `isProgressBlocked` (`chapter-schedule-panel.helpers.ts:21`). Badge count set per-item in `_buscarMedallas()` (`RenderVerAnime.js:351-372`), empty string when count is 0.

8. **"Estrenos"** — CORRECTED, not a separate feature. `defaults-config.js:35-51`: `Days` config has two top-level groups: `{ title: 'Día', data: [Lunes..Domingo] }` and `{ title: 'Estrenos', data: ['Sin ver','Visto','Ver hoy'] }`. "Estrenos" is literally the sidebar SECTION HEADER for what the bridge already calls "season mode" (`CHAPTER_SEASON_OPTIONS = ['Sin ver','Visto','Ver hoy']` in `chapter-schedule-panel.constants.ts:10`). No separate premiere-tracking feature exists behind that label. SDD-38 does not need to build a new "Estrenos" concept, only (optionally) label the season-mode day-tab group "Estrenos" for visual parity if desired.

## (b) Bridge current state (D:\dev\disble\autoreas-sp\autoreas-bridge)

- Feature anatomy at `frontend/src/features/chapters/ui/ChapterSchedulePanel/`: `ChapterSchedulePanel.tsx` (165 lines, dumb UI, HeroUI `Card`/`Modal`/`ToggleButtonGroup`/`Tooltip`), `use-chapter-schedule-panel.ts` (145 lines, strict hook anatomy, wired to `bridgeRuntimeSource` + `preferencesSource`), `chapter-schedule-panel.helpers.ts` (pure, already computes `remainingLabel`/`watchedLabel`/`progressTitle` — the "remaining" math already exists client-side, just needs a hover-swap presentation instead of a tooltip), `chapter-schedule-panel.types.ts`, `.constants.ts`, `.schema.ts`, colocated `__tests__/`. All files well under the 400-line warning threshold — watch during apply.
- `ChapterScheduleItem` (Go `internal/anime/chapter_service.go` + TS types) currently exposes: `animeId, animeName, estado, nrocapvisto, totalcap?, day, dayOrder, modified_at, hasPage, hasFolder, lastWatched?, firstWatched?`. **NO cover field and NO literal path/URL strings for folder or page** — only booleans. Central gap: cover field (and literal `carpeta`/`pagina` strings for real tooltips) needed end-to-end (Go `ChapterScheduleItem` struct in `contracts.go` → `toChapterScheduleContracts` in `app_runtime.go` → TS type → row helper → UI).
- Cover ALREADY flows for Anime Detail: `internal/anime/domain/anime_raw.go:31` (`Portada json.RawMessage`), `anime_raw_projection.go:33-46` (`PortadaPath()` returns just the path, drops `type` — mirrors Legacy's indifference to `type`), `internal/anime/mobile.go:37`, `contracts.go:45` (`MobileAnime.Portada *string`), `contracts.go:268` (`AnimeDetailContent.Cover`). Frontend: `AnimeDetail.tsx` renders `<img src={detail.portadaUrl}>` directly (assumes portada is a browser-loadable URL — a raw Windows disk path would NOT load without a custom protocol/asset-server handler) with `AnimeCoverPlaceholder.tsx` (inline SVG, feature-scoped to anime-detail) as fallback, gated by `normalizeAnimeDetailPortadaUrl()` which treats `''` and literal `'null'` as absent (this normalization is required again for Chapters).
- Commit `ee202f2` ("fix(frontend): blank portada shows placeholder...") is that exact normalization fix — Anime Detail only; Chapters needs the same treatment (or reuse the helper).
- Desktop actions (`app_desktop_actions.go`, already used by Chapters): `OpenAnimePage`/`CopyAnimePage`/`OpenAnimeFolder`/`CopyAnimeFolder` follow the `runAnimeDesktopAction` pattern — backed by Wails runtime `BrowserOpenURL`/`clipboard.SetText`/OS folder-open, battle-tested.
- Wails asset serving (`main.go`): `assetserver.Options{Assets: assets}` only embeds `frontend/dist` — **no custom `Handler` for arbitrary local-disk files exists**. No `os.TempDir`/`UserCacheDir` usage anywhere in Go — no temp/cache dir convention exists; must be established.
- HeroUI v3 ships `Avatar` (`Avatar.Root/.Image/.Fallback`) — image-with-fallback natively but circular by convention; Legacy's cover is a rectangular full-height card-edge image, so a plain styled `<img>` (as Anime Detail does) or `Avatar` with overrides would work. No standalone rectangular `Image` primitive in this HeroUI version.
- Day-count aggregation: NOT implemented anywhere in Go. Needs a new query (e.g. `GetChapterDayCounts()` → `[]{day, count}`) mirroring `buscarMedalla` semantics (`estado > 0` AND day match AND active-or-absent).
- Frontend has no cover/placeholder asset beyond `logo-universal.png` + fonts; `AnimeCoverPlaceholder.tsx` is the only placeholder pattern (feature-scoped) — share/promote per colocation convention.

## (c) animes.dat real fixture findings (resources/autoreas-data/animes.dat, 795 records)

- 793/795: `"portada":{"type":"url","path":""}` — empty, no cover.
- 1/795: `"portada":{"type":"image","path":"null"}` — literal `"null"` sentinel (handled by `normalizeAnimeDetailPortadaUrl`).
- 1/795: `"portada":{"type":"url","path":"https://cdn.jkdesu.com/assets/images/animes/image/rezero-kara-hajimeru-isekai-seikatsu-3rd-season.jpg"}` — the ONLY real cover, an https URL. **No local-disk-path example exists in the fixture** — that branch needs synthetic fixtures/unit tests.
- `type` is always `"url"` or `"image"` and never actually read for decisions — only the `path` string's shape matters.

## (d) Gaps between bridge and Legacy (checklist)

1. [GAP] `ChapterScheduleItem` has no cover field end-to-end.
2. [GAP] No image download+cache pipeline (no cache dir convention, no fetch-and-persist, no serving binding).
3. [GAP] No mechanism to serve local-disk images to the Wails webview — needed for BOTH raw local paths and cached copies of downloaded URLs.
4. [PARTIAL] Hover-swap watched/remaining: math exists as tooltip; needs actual hover-swap, WITHOUT Legacy's truncation bug.
5. [GAP] Minus button lacks danger visual treatment (currently `tertiary` gray).
6. [MATCH] Right-click ±0.5 already implemented identically.
7. [MATCH] Open/copy folder/page desktop actions already implemented identically.
8. [GAP] Folder/page tooltips show generic aria-labels, not the real path/URL string.
9. [PARTIAL] Status dialog exists with right 4 options; trigger placement differs (UX polish, not data gap).
10. [GAP] No per-day `estado > 0` count badge on the day ToggleButtons (needs new Go query + `filterOptions` wiring).
11. [NON-ISSUE] "Estrenos" — already covered by season mode; optional labeling only.

## (e) Risks / open questions

- **Image-serving mechanism** (biggest design decision): base64 data-URL Go binding (fits "bound Go method returning DTO" convention, works uniformly for local + cached-remote, low blast radius; cons: ~33% payload overhead, no browser HTTP caching) vs custom `assetserver.Options.Handler` (real HTTP caching, native `<img src>`; cons: new infra, path-traversal security, invasive `main.go` change). Recommend base64 data-URL unless profiling says otherwise — only 1/795 real records have a cover.
- **Cache directory**: no existing convention — design must pick (likely `os.UserCacheDir()/autoreas-bridge/covers/` keyed by anime ID + content hash) and define eviction/refresh rules.
- **No local-disk-path example in real data** — synthetic fixture/unit test required for that branch.
- **Only 1/795 real animes have a cover** — placeholder is the overwhelmingly common case; optimize for "placeholder is default".
- **File-size policy**: no touched file near 400 lines today; put cover fetch/cache logic in new Go files rather than growing `chapter_service.go`.
- Legacy's hover-swap truncation bug (mouseover `parseInt`, mouseout not) must NOT be carried over.

## (f) Doc/code drift explicitly noted

- Brief's fact #8 corrected: "Estrenos" is the sidebar section title wrapping season-mode filters, not a separate feature.
- Brief's fact #7 corrected: badge counts `estado > 0` (Finalizado OR No me gusto OR En pausa), not just Finalizado (`consultas.js:132`).
- `viendo.html`/`anime-viendo-init.js` is a decoy (Chart.js stats page); the real day-cards page is `ver.html`/`ver-init.js`/`RenderVerAnime.js`.

## Ready for Proposal

Yes. Scope: (1) extend `ChapterScheduleItem` end-to-end with cover + literal folder/page strings; (2) base64 data-URL cover-serving Go binding with local disk cache under `os.UserCacheDir()`; (3) hover-swap watched/remaining in the dumb component; (4) danger-colored minus button; (5) per-day `estado > 0` count badges; (6) shared cover placeholder illustration. OUT of scope: any new "Estrenos" concept (season mode covers it) and the deferred AnimePanel Estrenos sidebar (sdd-31b).
