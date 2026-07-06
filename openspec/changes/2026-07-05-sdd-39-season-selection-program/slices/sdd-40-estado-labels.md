# SDD-40 — estado-labels-fix

> Slice of program SDD-39. Fix the estado label drift before anything builds on
> "No me gusto". Smallest slice; no schema, no new features.

## Objective

One canonical estado vocabulary across the app, matching Legacy truth:
`0=Viendo, 1=Finalizado, 2=No me gusto, 3=En pausa`.

## Verified current state (exploration 2026-07-05)

Three DIFFERENT label sets encode the same 0–3 domain today:

| Location | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| `history/ui/HistoryTable/history-table.helpers.ts:81-115` + `history-table.constants.ts:19-25` | Viendo | Finalizado | **Abandonado** ✗ | **Pendiente** ✗ |
| `anime-detail/ui/AnimeDetail/anime-detail.helpers.ts:56-91` (verbatim duplicate — repo convention: no cross-feature imports) | Viendo | Finalizado | **Abandonado** ✗ | **Pendiente** ✗ |
| `catalog/ui/CatalogPanel/catalog-panel.constants.ts:44-50` → Status `Select` in `CatalogFilterBar.tsx:38-59` | Viendo | Finalizado | **Abandonado** ✗ | **Pendiente** ✗ |
| `chapters/ui/ChapterSchedulePanel/chapter-schedule-panel.constants.ts:16-32` | **Watching** | **Completed** | **Dropped** ✗ | **Paused** |
| `docs/anime-chapter-management-plan.md:14` | Viendo | Finalizado | No me gusto ✓ | En pausa ✓ |

Legacy truth (Historial screenshot + user confirmation): Viendo / Finalizado /
No me gusto / En pausa. Real data: only estados 0–3 exist (561/262/22/7 in
`animes.dat`). Backend carries the raw int only — no Go changes needed
(`anime_raw.go:13`, `state_machine.go:11-12` untouched).

## Decision — RESOLVED (user, 2026-07-05)

**Spanish canonical labels everywhere** (`Viendo / Finalizado / No me gusto /
En pausa`), including Chapters — estado labels are Legacy domain vocabulary,
like "Ver hoy"/"Sin ver". **With one user-mandated addition: the vocabulary
lives in GLOBAL shared constants** so a future rewording is a one-place
change. This intentionally overrides the per-feature colocation convention
for this specific vocabulary: a new
`frontend/src/shared/constants/anime-estado.ts` exports
`ANIME_ESTADO_LABELS` (0–3 map) + `ANIME_ESTADO_OPTIONS`; every feature
imports from there and drops its local copy. Color mappings stay per-feature
(they are presentation, not vocabulary).

## Changes

1. NEW `frontend/src/shared/constants/anime-estado.ts` — single global source:
   `ANIME_ESTADO_LABELS` (0=Viendo, 1=Finalizado, 2=No me gusto, 3=En pausa)
   + `ANIME_ESTADO_OPTIONS` (filter-shaped), JSDoc'd, with its own test.
2. `history-table.helpers.ts` + `history-table.constants.ts` — consume the
   global constants; delete local labels. Chip colors stay local/unchanged.
3. `anime-detail.helpers.ts` — `getAnimeDetailEstadoLabel` reads the global
   map.
4. `catalog-panel.constants.ts` — `ANIME_ESTADO_OPTIONS` re-exported from the
   global source.
5. `chapter-schedule-panel.constants.ts` — English set replaced by the global
   Spanish vocabulary.
6. Docs sweep: `docs/architecture.md`, `docs/sdd-tree.md`, any doc naming
   estado 2/3 — align glosses; `docs/anime-chapter-management-plan.md` is
   already correct.
7. `autoreas-theme` skill: canonical vocabulary + "labels from
   `shared/constants/anime-estado.ts`, colors per feature" rule
   (living-document mandate).

## Integration architecture

Pure presentation-layer change — no Go, no schema, no bindings, no routes.
The estado int is the contract; only its rendering changes. The vocabulary
centralizes into `shared/constants/` (user-mandated global constants — an
explicit, recorded exception to the per-feature colocation convention,
scoped to this vocabulary only). One drift-guard test on the global map
asserts the full 0–3 vocabulary; feature tests assert consumption, not
wording. The `autoreas-theme` skill entry becomes the human-readable source
of truth reviews check new features against (SDD-41's workspace included).

## TDD plan (tests first — strict mode)

- `history-table.helpers.test.ts:89-90` — flip expected labels first (RED).
- `anime-detail.helpers.test.ts:48-49,248,250` — flip `'Abandonado'`,
  `'Pendiente'`, `'Abandonado • Unknown'` subtitle (RED).
- `chapter-schedule-panel.helpers.test.ts:27,48` — flip `'Watching'`/fixture
  wording per decision (RED).
- Add one NEW test per feature asserting the full canonical map 0–3 (guards
  against future drift; cheap regression net).
- GREEN: relabel constants/helpers. No logic changes anywhere.

## Size & delivery

Small (~120–180 changed lines incl. tests/docs). Single work-unit commit
chain: tests+code per feature, then docs+skill. No schema, no bindings.

## Exit criteria

- `bun --cwd="frontend" run test` green; lefthook gate passes.
- Grep for "Abandonado"/"Pendiente"/"Dropped" as estado labels returns zero
  hits in `frontend/src` and `docs/`.
- History/Catalog filters and Detail/Chapters chips render canonical labels.
