# Explore — Season Selection Workflow (program umbrella)

> Program umbrella for the multi-SDD mega-feature completing bridge's season mode.
> Sources: user interview (2026-07-05 session), Legacy screenshots, Excel workbook
> (one sheet per season, Octubre 2024 → Abril 2026), OrderGrid app, bridge codebase.

## 1. The real-world workflow (as practiced for ~10 years)

Every ~3 months a new anime season starts. The selection process:

1. **Intake** — a plain-text list is written by hand: one anime name per line,
   ~24–27 candidates per season.
2. **Name validation** — announced animes sometimes never air. Each name must be
   validated against a verified source (jkanime, where episodes are actually
   watched/downloaded). Names are free-form text → requires similarity matching.
3. **Availability watch** — premieres are staggered across ~2 weeks (sometimes
   more). Chapter 1 availability must be re-checked **daily** over the intake
   list. An anime without chapter 1 cannot be watched, evaluated, or advance.
4. **Creation + evaluation** — when chapter 1 exists, the anime is created in
   the app (goes to season section "Sin ver"). As its viewing day arrives it
   moves to "Ver hoy" (downloads align automatically — already shipped in
   SDD-32). The user watches chapter 1 (2–3 animes/day for 2 weeks) and grades
   it **1–6**. The anime then moves to "Visto".
5. **Selection** — previously an Excel sheet per season. Columns: Nombre,
   Estreno (grade 1–6), Pos Estreno (grade at season END, ~3 months later),
   Estado (derived), Consideraciones (exception enum). Max **12 slots** per
   season; sometimes fewer pass (e.g. 9).
6. **Ordering** — previously the external OrderGrid app: visually distribute
   approved animes into viewing days, 3 animes/day (12 → Thu–Sun, 9 → Fri–Sun).
   Dynamic and subjective.
7. **Apply** — previously manual: edit each anime in Legacy's editor to set
   `dia` + `orden` matching the ordering result.
8. **Close** — turn season mode OFF; normal weekday management resumes.

## 2. The Excel decision model (10 years stable — replicate, don't redesign)

Formula (Estado column):

```
=IF(AND(C4>=4, NOT(EXACT(F4,"Falta Cupo"))), "Aprobado",
    IF(OR(EXACT(F4,"Aprobado temporalmente"), EXACT(F4,"Sobra Cupo")),
       "Aprobado", "Reprobado"))
```

- **The cutoff (`>=4`) is the ONLY number that changes per season.** Everything
  else is handled by the fixed Consideraciones enum.
- `Falta Cupo` → reject despite passing grade (more approved than slots).
- `Sobra Cupo` / `Aprobado temporalmente` → approve despite failing grade
  (fewer approved than slots).
- The final decision ALWAYS collapses to Aprobado/Reprobado; consideraciones
  remain as the audit trail of WHY.
- `Pos Estreno` is written months later → season records stay writable after
  the selection workflow closes.

## 3. Codebase inventory (what already exists)

| Capability | Where | State |
|---|---|---|
| Season mode persisted toggle | `internal/preferences` (KV `app_settings`), `app_preferences.go`, `usePreferencesStore`, `/preferences` route | shipped (SDD-31) |
| Downloads select `dias == "Ver hoy"` when season ON | `internal/download/service.go` (`SeasonMode` func seam via `ServiceDeps`, wired in `app_startup_runtime.go`) | shipped (SDD-32) |
| Season banner on Schedule | Chapters/Schedule UI | shipped (SDD-33) |
| jkanime scraper | `internal/download/sites/jkanime` + sites registry | shipped |
| Mobile sync (HTTP/WS) incl. season mode | `internal/sync`, `internal/realtime`, sister mobile repo | shipped (feat/season-mode-mobile-sync) |
| Persistence schema registry | SDD-34 — new tables must register there | shipped |
| Estado labels in UI | `history-table.helpers.ts`, `anime-detail.helpers.ts`, `catalog-panel.constants.ts` | **drifted (see below)** |

## 4. Drift found (code vs Legacy truth) — MUST fix first

Bridge maps `estado` → 0=Viendo, 1=Finalizado, **2=Abandonado, 3=Pendiente**.
Legacy's Historial (screenshot-confirmed) says: **2="No me gusto", 3="En pausa"**.
Real data (`resources/autoreas-data/animes.dat`): estado 1×561, 2×262, 3×22, 0×7 —
only 0–3 exist. The 262 estado=2 records are the accumulated season rejects.
Per project rule, the drift is recorded here before fixing; fix = SDD-40
(code + transversal documentation).

Second finding: `LegacyAnimeRaw` has **no grade/nota field** — the 1–6 grade
only ever lived in Excel. Its natural home is the new per-season evaluation
record, NOT the anime entity.

## 5. Constraints (user-confirmed, binding)

- **Season is a first-class persisted entity** (registry like the Excel sheets),
  while create/watch/move remain NORMAL anime operations recorded normally.
- **Anime is created ONLY when chapter 1 exists** (goes to "Sin ver") — creating
  at intake left limbo animes in Legacy's era.
- **Rating is mobile-first**: watching + grading happens on the mobile sister
  app (~98% of the time), syncing to bridge next day. Bridge offers **deferred**
  rating as fallback only. Everything else in the workflow is bridge-exclusive.
- **Rejected animes** → estado "No me gusto" + `activo=0`. Nothing is ever
  hard-deleted (standing soft-delete rule).
- **Ordering includes ALL active animes** (continuing two-cour titles too), not
  just the new approvals — user prefers "order everything".
- Day+order application is **automatic** on confirming the ordering.
- Legacy's generic anime editor is **out of scope** for this program.
- jkanime is the canonical validation source (validate against the source you
  download from); MyAnimeList only as future metadata enrichment (out of scope).
- Frontend UI copy in **English**; data literals ("Ver hoy", "Sin ver", "Visto",
  "No me gusto") stay Spanish (Legacy data contract).
- OrderGrid suffixes like `[J]12F` belong to an external notepad system —
  irrelevant to bridge.
- User provided a UX sketch for the daily availability view (notepad with
  red/green markers) and explicitly wants it evolved with modern UI/UX practice.

## 6. Open items deferred to per-slice SDDs

- Similarity algorithm choice + threshold (normalize + trigram/Levenshtein) and
  its golden fixtures from real past season lists.
- Exact sync contract for rating ingestion (coordination with mobile repo).
- Drag-and-drop harness for the ordering board (React Aria dnd in jsdom — spike).
- Whether the daily availability job reuses the download scheduler seam or gets
  its own ticker.
