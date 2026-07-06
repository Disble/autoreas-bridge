# Proposal — Season Selection Workflow (program umbrella, SDD-39)

## Intent

Complete bridge's season mode into the **full native workflow** for selecting
new-season animes — replacing the plain-text list + Excel workbook + OrderGrid
app + manual Legacy editing with one integrated, auditable, resumable flow.

## Why now

Season mode foundations shipped (SDD-31/32/33): the toggle, download alignment
with "Ver hoy", and schedule awareness already exist. The remaining 80% of the
real process still lives in four disconnected external tools. Each season the
user re-does manual glue work that bridge can orchestrate end-to-end, with the
added win of a permanent per-season audit registry (today: Excel sheets).

## What this program delivers

A `Season` first-class aggregate with an open→closed lifecycle + milestone
timestamps (the Season Workspace model — sections live side-by-side, warnings
not gates), plus one UI/domain slice per workflow area:

intake (living list) → name validation → daily availability watch → creation
into "Sin ver" → evaluation (mobile-first grades, rate-in-context fallback in
bridge) → selection with nota mínima de aprobación + consideraciones (Excel
model replicated verbatim) → ordering board → automatic day/order application
→ season close.

## Roadmap (each row = one child SDD change, merged to main independently)

| # | Change | Delivers | Depends on |
|---|--------|----------|------------|
| SDD-40 | `estado-labels-fix` | Correct estado labels (2="No me gusto", 3="En pausa") in code + transversal docs | — |
| SDD-41 | `season-core` | `internal/season` bounded context: Season aggregate (lifecycle + milestones), nota mínima + slots params, evaluation records, SQLite schema (registered in schema registry), Wails bindings, Season Workspace route (Overview + section tabs) | SDD-40 |
| SDD-42 | `season-intake-validation` | Plain-text import, NEW jkanime search adapter + similarity matching, match-resolution UI (confirm / correct / discard) | SDD-41 |
| SDD-43 | `season-availability` | NEW `CreateAnime` capability (first in bridge), daily chapter-1 recheck job, auto-creation into "Sin ver", availability board (evolved from user's sketch), notifications | SDD-42 |
| SDD-44 | `season-evaluation` | Grade ingestion from mobile sync + deferred rating in bridge (Evaluation Deck UI), incl. `sdd-44x-mobile-handoff.md` for the mobile team; Pos Estreno descoped (dormant column only) | SDD-41 |
| SDD-45 | `season-selection` | Excel replacement: selection board, editable nota mínima de aprobación + slots, derived Aprobado/Reprobado (bidirectional reconciler), consideraciones enum, quota meter; rejects → "No me gusto" + inactive | SDD-44 |
| SDD-46 | `season-ordering-close` | Drag-and-drop ordering board (ALL active animes, 3/day), automatic `dia`+`orden` application, season close + season-mode-off suggestion | SDD-45 |

Parallelism: SDD-43 and SDD-44 are independent of each other (both feed SDD-45).

**Detailed per-slice plans** (design, decision points, TDD plan, exit
criteria): `slices/sdd-40-estado-labels.md` … `slices/sdd-46-ordering-close.md`.

## Out of scope

- Generic anime editor (Legacy parity) — separate future feature.
- MyAnimeList integration (metadata enrichment) — future.
- Mobile-side rating UI — sister repo; this program only defines/consumes the
  sync contract.
- Deprecating Legacy — explicitly premature.

## Delivery constraints

- Artifact store: **hybrid** (openspec + engram) — program-exclusive decision.
- **User reviews every SDD's planning artifacts before apply starts** (overrides
  the repo's auto-pilot mandate, per user instruction 2026-07-05).
- Strict TDD (repo-wide), 400/500 effective-line file policy, work-unit commits.
- No PR workflow in this repo: each slice merges to main after verify + commit.

## Risks

| Risk | Mitigation |
|------|------------|
| Similarity matching false positives create the wrong anime | Human-in-the-loop resolution UI (SDD-42); golden tests from real past intake lists |
| jkanime markup changes break search/availability | Anti-corruption already isolates scraping in `sites/jkanime`; fixtures + graceful "recheck later" states |
| Rating sync contract needs mobile-repo coordination | Contract defined in SDD-44 design first; bridge's deferred rating works standalone meanwhile |
| React Aria drag-and-drop untested in jsdom | Spike inside SDD-46 design phase; fallback UX = move-via-menu (still keyboard-accessible) |
| Season phases span weeks with app restarts | Phase state machine persisted; hub always reconstructs "what to do today" from state |
| Schema growth | All new tables via SDD-34 persistence schema registry |

## Success criteria

- A full season can run start-to-finish in bridge with zero Excel/OrderGrid/
  manual-editor involvement.
- Past-season registries remain queryable (audit trail incl. consideraciones).
- Rejected animes end as "No me gusto" + inactive; nothing hard-deleted.
- Turning season mode off returns bridge to normal weekday flow untouched.
