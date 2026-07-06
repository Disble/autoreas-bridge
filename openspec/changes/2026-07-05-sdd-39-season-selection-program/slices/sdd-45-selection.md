# SDD-45 — season-selection

> Slice of program SDD-39. The Excel replacement: live-derived verdicts,
> editable nota mínima de aprobación, consideraciones, quota — and applying
> the decisions.

## Objective

The 10-year Excel sheet, native: tune the minimum grade and consideraciones, watch
Aprobado/Reprobado derive live, confirm — rejected animes become "No me
gusto" + inactive through the normal write path. Fully reversible while the
season is open.

## Terminology (final, after two review rounds)

**`min_approval_grade` (UI: "Nota mínima de aprobación")** — the `>=4` in the
10-year Excel formula `IF(AND(C4>=4,...))`: the minimum Estreno grade that
approves an anime. NOT a wildcard/extra-slot mechanism. It acts at exactly
ONE point — deriving verdicts on THIS board (user-confirmed). The name is
deliberately explicit because "cutoff" failed to communicate twice. Editable
per season, default 4.

**`slots`** — editable per season, default 12 (the "límite es el límite"
principle applies to wildcard animes beyond the approved deck, not to the
number itself). Both parameters are edited HERE, in the decision header —
the only place they act; the workspace Overview shows them read-only.

## Scope adjustments (user feedback)

- **Pos Estreno: descoped** (see SDD-44 rationale) — no column in this UI.
  The schema keeps the dormant nullable field; nothing else.
- **Reversibility is a non-issue** (user: "es un estado simple de db"):
  `ConfirmSelection` is a **bidirectional diff reconciler** — re-confirming
  after changes re-approves previously rejected animes (`estado=0`,
  `activo=1`) and rejects newly failing ones (`estado=2 "No me gusto"`,
  `activo=0`). No asymmetry, no special cases; the OCC value-equal no-op
  skips untouched animes for free.

## UI/UX decision — why this IS a table (alternatives considered, as asked)

The task: comparative scanning of ~20–27 items across four consistent
attributes (name, grade, consideración, verdict) while tuning one global
parameter and watching a constraint (quota). Evaluated against that task:

| Option | Verdict |
|---|---|
| Approve/Reject kanban (two columns, drag) | ✗ hides grades from comparison; drag implies MANUAL placement but verdicts are DERIVED — the interaction would lie about the model |
| Card grid (deck like SDD-44) | ✗ covers help recognition while grading; here the job is numeric comparison — cards waste scan density exactly where density is the point |
| Stack ranking (ordered list) | ✗ grades are absolute (1–6), not relative ranks; ranking misrepresents ties |
| **Data table + decision header** | ✓ highest scan density, sortable, mirrors 10 years of muscle memory with the Excel — the familiar tool, elevated |

So: **HeroUI `Table`** (per mandate — never a raw `<table>`), elevated by a
decision header that makes the "dance" tangible:

- **Decision header `Card` (sticky)**: season name · **"Nota mínima de
  aprobación"** stepper (`Input type="number"` 1–6 with +/-) · **slots**
  stepper (default 12) · quota meter chip "9 / 12 approved" (`success`
  under, `warning` at, `danger` over). The grade-distribution strip was
  DROPPED (didn't earn its place across two review rounds — plain numeric
  control + live table recompute carries the decision).
- **Table** (`Table.ScrollContainer`, `table-fixed`, explicit column widths):
  Nombre (+cover micro-thumb) | Estreno grade | Consideración `Select`
  (None / Falta Cupo / Aprobado temporalmente / Sobra Cupo) | Verdict `Chip`.
  Verdict chips use soft/derived styling (visually distinct from editable
  facts — umbrella §3.3); rows group Aprobado-first with a subtle divider;
  a grade-threshold/consideración edit flips chips in place with a brief highlight
  animation so cause→effect is visible.
- Editing is optimistic (rollback on failure), pure-helper derivation — no
  server round-trip to preview, persistence on change.
- **Confirm selection** primary `Button` → `Dialog` summarizing the exact
  reconciliation: "12 approved · 9 rejected → 9 animes will be marked 'No me
  gusto' and deactivated · 1 previously rejected anime will be restored".

## Design

### Backend

- `Decision(nota, minApprovalGrade, consideracion)` shipped in SDD-41 (golden
  Excel-parity suite). This slice adds:
  - `SetConsideracion(rowID, c)` — fact write; verdicts never stored.
  - `ConfirmSelection(seasonID)`: a repeatable MILESTONE action (workspace
    model — sets `selection_confirmed_at`, no phase transition). Computes
    the FULL reconciliation: for every row with linked `anime_id`, expected
    state = f(verdict) → `AnimePatch{Estado, Activo, Base}` only where actual
    differs. Rejected → `estado=2, activo=false`; (re-)approved with a
    non-active anime → `estado=0, activo=true`. Soft delete only, ever.
    Re-running while the season is open re-reconciles (user-confirmed:
    simple DB states).
  - **Warnings, not gates** (SDD-41 model): ungraded created animes are
    listed in the confirmation dialog ("3 ungraded animes derive as
    Reprobado unless graded or skipped") — the user is the authority.
  - Quota HARD stop (the one real rule): `approved > slots` blocks
    confirmation listing over-quota rows (resolved via Falta Cupo — the
    Excel dance, unchanged). No wildcard animes beyond the deck.

### Integration architecture

| Action | File | Pattern |
|---|---|---|
| MODIFY | `internal/season/service.go` — `SetConsideracion`, `ConfirmSelection` | domain reconciler; anime writes ONLY via `AnimeGateway` (closure to `WriteService.PatchAnime`, OCC gate `service.go:297-384`) |
| MODIFY | `internal/season/domain/decision.go` — `Reconcile(rows, minApprovalGrade, slots) []PatchIntent` | pure planning function, unit-testable without I/O; service executes intents |
| MODIFY | `app_season.go` | `SetSeasonConsideracion`, `ConfirmSeasonSelection` nil-safe bindings |
| MODIFY | `season-source.ts`, `season-store.ts` | optimistic consideración/min-grade/slots + rollback |
| NEW | `features/season/ui/SelectionBoard/` via `generate:feature` | decision header + table; helpers own ALL derivation |
| SHARED | frontend `Decision` mirror in `selection-board.helpers.ts` | SAME golden cases as Go (drift-proof twin suites — one table of cases, two languages) |

Event flow: confirm → N standard anime writes → `AnimeChangedEvent`s →
changelog/mobile broadcasts (rejected animes vanish from mobile's active
views through the NORMAL sync, nothing bespoke) + `season_changed`.

## Decision points (review)

1. ~~Rejected-but-keep-watching~~ RESOLVED (was unclear, restating what it
   meant): the edge case was "an anime whose verdict is Reprobado but the
   user wants to keep watching it anyway". Per your answer: it's a plain
   estado/activo flip afterwards via normal tools, plus `Sobra Cupo`/
   `Aprobado temporalmente` already cover "approve it anyway" INSIDE the
   flow. No special support built. 
2. ~~Back-transition asymmetry~~ RESOLVED: bidirectional reconciler, fully
   reversible while the season is open.
3. ~~Pos Estreno column~~ RESOLVED: descoped.
4. ~~Distribution strip~~ RESOLVED: dropped (plain numeric steppers).

## TDD plan

- `Reconcile` golden tests: full real-sheet replay (screenshot data: MAO 3 →
  Reprobado; Jishou Akuyaku 4 + Falta Cupo → Reprobado; etc.), both
  directions (reject→re-approve), no-op stability, quota block.
- Service tests: intent execution fan-out, OCC base plumbing, partial
  failure surfacing.
- Frontend: twin golden suite for the TS `Decision`/grouping helpers;
  distribution/quota derivation; hook optimistic+rollback; chip-flip render.

## Size & delivery

Medium. Two work units: (1) `Reconcile` + `ConfirmSelection` + bindings (Go),
(2) SelectionBoard UI.

## Exit criteria

- Replaying a real past season's sheet yields byte-identical verdicts in Go
  and in the UI.
- Confirm applies exactly the expected patches (changelog-observed); flipping
  a consideración and re-confirming restores the anime.
- Quota over-limit blocks with actionable listing; minimum-grade edits
  re-derive instantly with no stored verdict anywhere.
