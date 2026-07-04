# Design — 2026-07-03-sdd-37-history-detail-polish

Written inline by the orchestrator; grounded in the sdd-36 implementation as committed at
`ce396ec`.

## D1 — DTO extension (additive)
`contracts.AnimeHistoryItem` gains `Tipo *int` (`json:"tipo,omitempty"`) and
`FechaCreacion *int64` (`json:"fechaCreacion,omitempty"` — epoch millis). Both projected in
`ListAnimeHistory` from the same `MobileAnime` normalization already in use (`item.Tipo`,
`item.FechaCreacion`). No interface change, no stub updates (method signature unchanged).
Wailsjs regen + `AnimeHistoryEntry` TS mirror (`readonly tipo?: number`,
`readonly fechaCreacion?: number`).

## D2 — History URL state via `useSearchParams`
`use-history-table.ts` swaps its local `useState` for search/estado/page (and adds tipo/sort) to
a thin `useSearchParams` adapter: params `q`, `estado`, `tipo`, `sort`, `page` (omit when at
default). Debounce still applies between the input's local value and the URL write (URL updates
on the debounced value with `replace: true` so typing doesn't spam history entries; page/filter
changes use push semantics — default behavior — so back steps feel natural). Helpers stay pure:
`parseHistoryParams(searchParams)` and `serializeHistoryParams(state)` in
`history-table.helpers.ts`, tested without React.

Sort options (constant `HISTORY_TABLE_SORT_OPTIONS`): `ult-cap-visto` (default; keeps the
server's fechaUltCapVisto DESC order — no client re-sort), `nombre` (A-Z, localeCompare, id
tie-break), `fecha-creacion` (DESC, absent-last). Sorting applies AFTER filtering, BEFORE
pagination.

Tipo filter options mirror the existing domain (0=Serie, 1=Película, 2=OVA per
`catalog-panel.constants.ts`) + All; entries with absent tipo only match All.

## D3 — Whole-row navigation
HeroUI table rows get row-level navigation via react-aria's row action (`Table.Row href`/
`onAction` — use whichever the HeroUI v3 Table exposes; verify against the component's d.ts, do
NOT hand-roll a div onClick) navigating to `/catalog/detail/:id`. The name keeps its `Link` for
a11y/semantics; row hover gets a visible affordance (cursor + hover background per theme).

## D4 — Detail back button + fallback fix + timeline
- Back: HeroUI Button (ghost/soft) at the top of the detail card: `navigate(-1)` when
  `window.history.state?.idx > 0` (react-router v7 exposes idx in history state), else
  `navigate('/history')`. Encapsulate the check in a helper for tests.
- Cover fallback BUG: sdd-36 renders `<img>` whenever `portadaUrl` is defined and only swaps on
  `onError`. Observed: alt text visible → error path not engaged (likely the browser renders alt
  text while the request dangles, or onError raced state reset). Fix: render the placeholder
  when `portadaUrl` is undefined OR `portadaFailed`; keep `onError`; ALSO treat a zero-size
  loaded image as failure via `onLoad` naturalWidth check. Placeholder = new
  `AnimeCoverPlaceholder.tsx` (orchestrator-provided cute-anime SVG, dumb component, themed via
  currentColor/tokens, no external asset).
- Repetition timeline: replace the one-line `<li>`s with timeline entries (left rail + dot per
  entry, HeroUI-consistent), each showing: header "Repetition N" + estado chip/label, and a
  definition grid: Capítulos vistos, Fecha de creación, Fecha de estreno, Fecha de último
  capítulo visto, Fecha de eliminación, Siguiente repetición (fechaRepeticion) — English chrome
  labels are ALREADY the exception here: these labels mirror Legacy DATA semantics; use English
  chrome ("Episodes watched", "Created", "Premiere", "Last watched", "Deleted", "Next
  repetition") with Spanish estado data literals. Absent dates → explicit "No data".
  Estado label domain: verify the DISTINCT estado values across the fixture's repetir entries
  (fixture test); map values confirmed by the anime domain (0=Viendo, 1=Finalizado,
  2=Abandonado, 3=Pendiente) and render unknown codes as `Estado N` raw fallback — Legacy shows
  "En pausa" for some code we cannot confirm; do NOT invent the mapping (flagged to user).

## D5 — Slices
1. Backend DTO extension (~80): contracts + projection + regen + TS mirror + tests.
2. History table UX (~280): URL-state adapter + helpers, Tipo/Orden controls, Search label,
   whole-row navigation, alignment fix.
3. Detail polish (~250): AnimeCoverPlaceholder SVG + fallback fix, back button, repetition
   timeline, fixture-verified estado labels.
