# Icon-only button standard and action hierarchy

Objective: apply the icon-only button standard and the action hierarchy approved in the "Icon-only buttons" canvas (backup: OpenDesign "Bridge Redesign" › `icon-only-buttons/`).
Branch: `fix/icon-only-secondary-actions` (off `dev`). Delivery: ask-on-risk. Runner: `bun --cwd="frontend" run test -- <path>`.

## Specs

- **S1 — One component.** "botón con solo-icono debe tener tooltip". Every icon-only button goes through `IconActionButton`: tooltip always, with arrow, 300 ms on hover, shown on keyboard focus and while disabled; 32 px round `tertiary` (or `ghost`), 18 px glyph; hover tints by meaning (accent, success, warning, danger); usable as a modal or menu trigger (no `onPress`).
- **S2 — The words.** Tooltip = the short action name, verb first. Disabled appends the reason after " · " (`Re-analyze folder · Set a folder first`). `aria-label` adds the target. Extra data (a path) goes on a second, muted line, never instead of the name.
- **S3 — Primary keeps its text.** "open schedules es una acción principal, no? Pues debería tratarse como cual!" Open schedule editor is a `primary` button with the calendar icon and its text.
- **S4 — Hierarchy is monotonic.** "cuál es más llamativo? El botón para Show episodes o los botones secundarios (jerarquicamente superiores)?" Levels: Primary = `primary`; Secondary = `tertiary`; Tertiary = `ghost` (Show episodes ⌄, Browse…); Destructive = `tertiary` + danger hover, solid `danger` only in its confirmation dialog. HeroUI `secondary` is not a level ("no era un error este caso?" — yes, an error).
- **S5 — Inventory fixes (canvas "Every icon-only button").** Fetch metadata, Intake folder / grade / more actions, Open page: 300 ms. Re-analyze: tertiary. Deactivate anime: icon-only `archive-down`, danger hover; the confirm dialog keeps the text. Edit duration: tooltip `Edit duration`. Intake folder: tooltip `Set download folder`, path on the second line, no native `title`. Discarded Restore: `archive-up` glyph. Duplicate: `Duplicate to another day` on both boards. Remove: disabled reason after " · ". Open folder / Open page (desktop actions): action name, path on the second line. Copy for AI: copy glyph, tertiary. Today stepper −/+: tooltips; − becomes `tertiary`, + stays primary (named exception). Today's status button: tooltip `Change status`.
- **S6 — A machine owns it.** ESLint: `isIconOnly` outside `IconActionButton` fails, except named exceptions (HelpTooltip, Catalog's view toggle, Today's episode stepper).
- **S7 — Docs.** The design docs and the `autoreas-theme` skill state S1–S6.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1, S2 | inline | done (RED 6 failing vs HEAD) | 573bcc5c |
| T2 | S3, S4, S5 (Editor) | inline | done (RED 5 failing) | 573bcc5c |
| T3 | S5 (shared, Season, Activity, Today) | inline | done (RED 11 failing) | e720b50c |
| T4 | S6 | inline | done (rule fires when an exception is removed; 3-case ESLint API test) | this commit |
| T5 | S7 | inline | done (structural readback; skill copies byte-identical, 2.7.0) | this commit |

Out of scope (recorded): moving the remaining HeroUI `secondary` buttons (74 before this feature) to their levels, screen by screen, in each screen's next unit.

## Log

- L1 (2026-10-22, user): "Sí, borralo, pero backups aparte. Ya puedes iniciar con los cambios quue aprobamos en estos mockups."
- L2: Route inline for every task: one understood change per task, no parallel-writer reason.

- L3 — 2026-10-22: T1–T5 done. Full affected suites 2225/2225 green after T3; src lints with zero icon-only violations.
