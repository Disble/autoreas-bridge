# Design — sdd-40-estado-labels

## Canonical source

NEW `frontend/src/shared/constants/anime-estado.ts`:

- `ANIME_ESTADO_LABELS: Readonly<Record<number, string>>` — the 0–3 map
  (0=Viendo, 1=Finalizado, 2=No me gusto, 3=En pausa).
- `getAnimeEstadoLabel(estado: number): string` — map lookup, falls back to
  `String(estado)` for unknown values (existing behavior, preserved).
- `ANIME_ESTADO_FILTER_ENTRIES: readonly { value, label }[]` — the four
  numeric options in a `{ value: string, label: string }` shape structurally
  compatible with both `HistoryFilterOption` and `AnimeFilterOption`;
  features prepend their own "All" sentinel entry.

This is a user-mandated exception to the per-feature colocation convention,
scoped to this vocabulary only. Colors remain feature-local.

## Consumers

| File | Change |
|---|---|
| `history/ui/HistoryTable/history-table.helpers.ts` | `getHistoryEstadoLabel` delegates to `getAnimeEstadoLabel`; JSDoc updated; color switch untouched (No me gusto=danger, En pausa=warning still fit) |
| `history/ui/HistoryTable/history-table.constants.ts` | `HISTORY_TABLE_ESTADO_OPTIONS` = All + spread of `ANIME_ESTADO_FILTER_ENTRIES` |
| `anime-detail/ui/AnimeDetail/anime-detail.helpers.ts` | `getAnimeDetailEstadoLabel` delegates; JSDoc updated; color untouched |
| `catalog/ui/CatalogPanel/catalog-panel.constants.ts` | `ANIME_ESTADO_OPTIONS` = All + spread |
| `chapters/ui/ChapterSchedulePanel/chapter-schedule-panel.constants.ts` | `CHAPTER_STATE_LABELS` re-exports the global map; `CHAPTER_STATE_OPTIONS` labels read from it (icons unchanged) |

Public helper signatures unchanged — zero component edits required; only
labels flow differently.

## Tests (strict TDD)

Existing assertions flipped FIRST (RED): history-table.helpers.test.ts,
anime-detail.helpers.test.ts, AnimeDetail.test.tsx, chapters
helpers/Card/Panel tests (accessible names embed the label). NEW drift-guard
test on the global map asserting the full canonical vocabulary.

## Docs & skill

Sweep `docs/` for "Abandonado"/"Pendiente"-as-estado glosses; update
`autoreas-theme` SKILL.md (vocabulary + "labels from shared constants,
colors per feature" rule) and bump its version.
