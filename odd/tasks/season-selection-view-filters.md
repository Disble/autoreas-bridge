# Season Selection view filters

Approved mockup becomes the spec: a combinable filter toolbar over the Selection candidate list, and a row-layout copy change. View state only: no stored row is filtered away from confirmation, quota or reconciliation.

## Specs

- **S1** — A filter bar above the candidate list offers three non-exclusive dimensions: grade, verdict (Approved/Rejected) and consideration. "en esta tabla me hace falta una barra superior de filtros, por ejemplo, ordenar, ocultar o mostrar por nota (1,3,4,5,6, no excluyente), por aprovados o rejected, ninguno de estos filtros son excluyentes entre sí."
- **S2** — The consideration filter uses the domain vocabulary and order exactly: None, Insufficient quota, Temporarily approved, Spare quota. "tambien un filtro para las consideraciones al mockup"
- **S3** — Inside one dimension selected values combine as OR; dimensions combine as AND. Selecting a value never clears another dimension.
- **S4** — Each dimension defaults to unrestricted, shown as All: an empty selection means no restriction. None is a real consideration, never a synonym for All. "All means “no restriction”"
- **S5** — Sorting is a separate control with five modes: Current order, Grade high to low, Grade low to high, Title A–Z, Title Z–A. Approved stays before Rejected; sorting happens inside each group; ungraded rows trail in both grade directions; ties keep the current order.
- **S6** — The toolbar shows a persistent summary of the criteria in force, the visible/total candidate count, and one reset that clears all criteria and restores Current order.
- **S7** — Filters are a view only. The approved/slots quota chip, the confirmed milestone and Confirm selection keep acting on every candidate, not on the visible subset.
- **S8** — When criteria hide every row, the list shows the filtered empty state (neutral icon, left-aligned, secondary clear action) instead of the waiting-on-step mascot, which stays for a genuinely empty selection. "Empty intersection shows the filtered empty state with a real reset action."
- **S9** — The grade sits left of the consideration control, right after the name; the page and folder actions keep the row's outer edge. "quiero que muevas la columna de nota a la izquierda de las acciones" / "más a la izquierda!"
- **S10** — An ungraded candidate reads None in the row as well as in the filter. "hay que cambiar este texto por None para ser congruente con el filtro"
- **S11** — The surface follows the Bridge design system: HeroUI primitives, soft semantic chips, token colors only, secondary actions on the gray surface level, filtered empty state through `AirisEmptyState`.

## Tasks

| ID | Specs | Route | Commit |
|---|---|---|---|
| T1 | S1, S3, S4, S5, S6, S10 | inline · pure helpers + tests | `feat(season): derive the selection view criteria` |
| T2 | S2, S6, S11 | inline · toolbar component + tests | `feat(season): add the selection filter toolbar` |
| T3 | S1, S3, S4, S6, S7, S8, S11 | inline · hook and board wiring + tests | `feat(season): wire selection view filters into the board` |
| T4 | S9, S10, S11 | inline · row order and grade copy + tests | `feat(season): place the selection grade beside the consideration` |

## Log

- **L1** (user, verbatim) — "en esta tabla me hace falta una barra superior de filtros, por ejemplo, ordenar, ocultar o mostrar por nota (1,3,4,5,6, no excluyente), por aprovados o rejected, ninguno de estos filtros son excluyentes entre sí. Haz una propuesta en un artifact"
- **L2** (user, verbatim) — "tambien un filtro para las consideraciones al mockup … y mejora la UI de esos filtros … Ademas, tenemos una skill de theme de bridge, usala. design"
- **L3** (user, verbatim) — "se ve bien, pero quiero que te asegures que esté cumpliendo los lineamientos del system design de bridge"
- **L4** (user, verbatim) — "eso mismo esta bien. Ahora, te cuelo una peticion de cambio de UI de la tabla. … quiero que muevas la columna de nota a la izquierda de las acciones. Actulizalo en el mockup"
- **L5** (user, verbatim) — "mas a … más a la izquierda!"
- **L6** (user, verbatim) — "hay que cambiar este texto por None para ser congruente con el filtro"
- **L7** (user, verbatim) — "aprobado con ODD, iniciar el desarrollo"
- **D1** — Decision: the approved mockup (All sentinel per dimension, grade before the consideration, None wording) is the spec; no open product decision remains.
- **D2** — Tier per `docs/coverage-tiers.md`: the filter/sort derivation is IMPORTANT (user-facing behavior, 80% behavior coverage); wording constants are INFRASTRUCTURE (no tests); the grade copy helper is IMPORTANT.
- **D3** — Evidence: mockup and its DOM-stub checks live in the ignored `.pi/artifacts/selection-filters-proposal.{source.html,check.mjs}` (45 checks, no browser layout proof).
- **P1** — Implementation: T1-T4 done on `feat/season-selection-view-filters`. RED observed for the view helpers (module missing) and for the toolbar's All-sentinel transition (a specific tag was added to All instead of replacing it); GREEN after the fix. Focused SelectionBoard suites: 132 tests passing. `bun run typecheck` exit 0. No application behavior outside Selection changed.
- **P2** — Routing: every task ran inline (units depend on each other, so a parallel writer batch could not be disjoint; the runtime declined the writer at planning time). The final verification pass is delegated to `gentle-ai-verify`, as the repository instructions require.
- **P3** — The staged quality gate rejected the first shape on complexity (cognitive limit 15): `SelectionBoard`, `SelectionDecisionHeader`, `SelectionCandidateList` and `useSelectionBoard` all breached it. The fix was a real decomposition, not a suppression: `useSelectionRules`, `useSelectionRefresh`, `useSelectionActions`, `useSelectionView`, `SelectionDecisionHeader`, `SelectionStepper`, `SelectionStatusChips`, `SelectionConfirmAction`, `SelectionCandidateList`, `SelectionListBody` and `SelectionGroupSection`. No threshold or baseline was changed.
- **P4** — Commit plan: three work units, because the decomposition components are reachable only together (an intermediate commit that lands them unused would fail the gate's dead-file check): logic + docs, the toolbar, then the wiring and row layout. Commits: `d2a6b97d` (T1), `2c8d7299` (T2), `6f6ae677` (T3, T4). Each passed the full pre-commit gate (staged quality, typecheck, coverage suite, render and layout smoke).
- **P4b** — Slice boundary: `6f6ae677` holds 831 authored lines, above the ~400-line review slice. It cannot split without leaving the decomposition components unreachable (the gate's dead-file check fails on an unused component), so the boundary is recorded here instead of hidden. The next unit of this feature starts a new branch or a new slice.
- **P5** — Coverage tiers applied: view derivation and the row/copy behavior are IMPORTANT (behavioral tests, 144 focused); the copy constants are INFRASTRUCTURE (no tests).
- **P6** — Mutation evidence (`bun --cwd=frontend run test:mutation:staged`, run four times while hardening): final 381 in-scope mutants, 329 killed, 25 survived, 0 no-coverage. Survivors and their disposition: (a) 23 static copy/constant mutants in `selection-board.constants.ts` — INFRASTRUCTURE, which `docs/coverage-tiers.md` keeps out of mutation scope; (b) comparator-equivalence mutants in `selection-view.helpers.ts` (equal-grade early return, ungraded branch, `Map` pair array, `×-1` vs `÷-1`, tie-break `+`/`??`): each leaves the comparator's sign identical under V8's stable sort, so the rendered order cannot differ; (c) dependency-array mutants in `use-selection-actions.ts`/`use-selection-rules.ts`/`use-selection-view.ts` that name module constants (`bridgeRuntimeSource`, `en`) or are re-created every render: the reference never changes, so behavior is unchanged. Every behavioral mutant that a test can observe (count chip, sort handler, filter comparison, group totals, season defaults, source swap, successive edits) is killed; the count-chip and sort cases were proven with a hand differential (mutation applied, test failed, reverted).
- **P7** — Verification boundary: focused SelectionBoard 144 tests, full frontend suite 4,247 tests, `bun run typecheck` 0, staged quality gate 0, mutation reported above. Final pass delegated to `gentle-ai-verify`.
- **P8** — Independent verification (`gentle-ai-verify`, read-only) returned PASS for S1-S10 and FAIL for S11 on two low findings: the steppers used HeroUI `secondary` instead of the gray `tertiary` secondary-action level, and two declaration groups lacked JSDoc. Both are fixed in `11c23973`; after the fix the focused suite is 144 tests and `bun run typecheck` is 0. The verifier also ran the full suite: 416 files / 4,259 tests, exit 0.
- **P9** — Closed: commits `d2a6b97d` (T1), `2c8d7299` (T2), `6f6ae677` (T3+T4), `11c23973` (review fixes). UNPROVEN and left for the owner: browser layout and responsive appearance of the new toolbar, and a real Wails/SQLite filtered-confirmation run. Nothing was pushed; merge is the owner's decision.
