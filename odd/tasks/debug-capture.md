# Debug capture: retention architecture, readers and Activity UI

Objective: replace row-cap capture retention with the ADR-028 design, and rebuild the MCP tools and the
Activity UI on it. Branch `feat/debug-capture` (worktree `autoreas-bridge-worktrees/debug-capture`);
nothing reaches `dev` until the whole feature is done and reviewed. Runners: `go test`, Bun/Vitest.

## Specs

- S1: "mantener la mejor calidad de nuestros datos" with the minimum storage on a home PC. Accepted design:
  `docs/adr/028-debug-capture-retention.md`; the 92-issue battery resolves 92/92 in all six scenarios.
- S2: "yo no te voy a dar autorización de unir cambios a dev hasta que el desarrollo esté completamente
  desarrollado. Y eso incluye también, por supuesto, la parte de MCP y UI."
- S3: "vas a trabajar en un worktree y si de ese worktree salen más worktrees, eso ya es tu problema. Pero
  ese worktree va a ser lo que yo voy a recibir al final."
- S4: development runs against a copy of the database (`docs/observability/development-database.md`);
  no APK changes for the phone.
- S5: "una UI pensada desde cero para funcionar con la nueva arquitectura, pero que cumple unos grandes
  estándares de UI/UX de 2026", "simple, pero bonita. Estilizada". Requirements:
  `docs/observability/activity-ui.md`.
- S6: no mobile contract change ships without an announcement in `docs/openapi.yaml`; the header proposal
  is shown to the owner before it is sent.
- S7: "Todo lo que es features antiguas de Activity y toda su UI, nada de legacy. Eso anótalo incluso en
  la documentación. No legacy. Todo se borra. No se deja rastro de eso." Scope: `docs/observability/rollout.md`,
  "No legacy".

## Tasks

| ID | Specs | Task | Route | Status |
|---|---|---|---|---|
| T0 | S1, S4, S5 | ADR-028 and `docs/observability/` | inline | done |
| T1 | S5 | new Activity UI canvas from the UX brief | inline | done: approved, `docs/observability/activity-ui-design.md` |
| T2 | S4 | data-directory override and copy refresh | inline | pending |
| T3 | S1 | stage 1: record quality and the H1 read by id (lanes A and B) | to plan | pending |
| T4 | S6 | stage 2: mobile correlation header | to plan | pending |
| T5 | S1 | stage 3: ledger | to plan | pending |
| T6 | S1 | stage 4: recorder and incidents replace the row caps | to plan | pending |
| T7 | S2, S5 | stage 5: MCP tools and Activity UI | to plan | pending |
| T8 | S1 | stage 6: battery on the real stores, measured budgets | to plan | pending |

## Log

- L1 (2026-10-17, original request): "Ok, entonces hagamos sobre la base de datos lo que tú dices. Espero
  que no me arrepienta. Sí, haz el worktree, escribe todas las docs y cuando termines todo eso, me haces un
  canvas nuevo con la nueva propuesta de UI."
- L2: worktree created from `dev` at `b6cd5eea`. Docs written. The POC stays on `poc/retention-sim`
  and is not part of the delivery.
- L3: T1 draft published in the canvas "Activity 2026" (https://claude.ai/artifact/7jLTYCTy8WUFqCUrKkD1X8).
  It has four artboards: Now, Incident, History and States. It is waiting for the owner's review.
- L4 (2026-10-17): "Si eso es lo que los datos te han recomendado, entonces que así se haga." Only errors
  open an incident.
- L5 (2026-10-17): "Ok, puedo dar por aprobado esa UI. También bájala directo hacia los documentos." The UI is
  approved. Its spec is in `docs/observability/activity-ui-design.md`.
