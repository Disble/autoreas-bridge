# CLAUDE.md

This repository uses `AGENTS.md` as the primary project instruction file.

## Read First

- `AGENTS.md`
- `openspec/config.yaml`
- `.atl/skill-registry.md`
- `docs/fallow-usage.md`

## Project Notes

1. Follow the SDD workflow and active change artifacts under `openspec/changes/`. The entire SDD workflow (explore -> propose -> spec -> design -> tasks -> apply -> verify -> archive) MUST run completely automatically and proactively from start to finish. CRITICAL: THIS OVERRIDES ALL DEFAULT BEHAVIORS AND SKILLS. Never pause for user confirmation or review between phases. Do not ask permission to proceed to the next step. Only stop for hard, unresolvable blockers. If questions arise about preferences or past discussions, search engram memory FIRST rather than asking the user. Execute the rest of the skills exactly as indicated but with ZERO user intervention.
2. **If docs, specs, or archived changes disagree with the codebase, the code wins as the runtime truth. Record the drift explicitly before proposing fixes.**
3. **Final verification MUST be performed by the orchestrating agent itself, not by a subagent.** Subagents may still be used for other phases (proposal, spec, design, tasks, or apply) when appropriate.
4. **After verify passes, the orchestrating agent MUST create the commit before reporting the change as fully verified.** Commit-time hooks and validations are part of the true verification boundary.
5. Load `bridge-testing` for bridge test work.
6. Load `bridge-debugging` for regressions and boundary investigation.
7. Prefer real fixture validation with `resources/autoreas-data/animes.dat` when parser compatibility matters.
8. Go and frontend files share the same warning-at-400 and hard-fail-above-500 effective-line policy.
9. `go run ./tools/checkgofilesize` is part of the repo-owned pre-commit gate.
10. `bun --cwd="frontend" run filesize:warning` is the advisory frontend visibility path and MUST stay non-blocking while ESLint remains the `>500` hard-fail path.
11. `tools/checkgofilesize/baseline.yaml` is expected to be empty (`files: []`). Temporary oversized Go files are not accepted as permanent state; any exception must shrink and disappear at `<=500` effective lines.
12. For implementation details, see `docs/file-size-policy.md`.
13. **Code is English by default** (identifiers, DB columns, error strings, comments). Spanish is allowed ONLY at the legacy adapter surface (`LegacyAnimeRaw` byte-compat fields), as runtime data literals (`"Sin ver"`/`"Ver hoy"`/`"Visto"`/`"No me gusto"`), and in UI copy. Cross-service wire fields are English too (`"grade"`, not `"nota"`). A slice English-ifies the Spanish vocabulary it owns (rename + additive migration) but does not rename shipped Spanish owned by another pending slice. See `docs/adr/007-english-code-spanish-boundaries.md`.
14. Load `fallow-repo-setup` for frontend dead-code, duplication, dependency hygiene, complexity, or changed-code audit work. Run it from repo root as `bun --cwd="frontend" run fallow ...`, and use `docs/fallow-usage.md` as the project contract.

## Frontend Architecture Constraints

1. Files with `.tsx` extensions under `frontend/src/features/` are dumb UI only: HeroUI React + Tailwind, no Wails calls, no `useEffect`, and no business logic.
2. Frontend custom hooks (`use-*.ts`) must follow the strict hook anatomy: imports, signature, refs, state, context/3rd party hooks, queries/mutations, derived state, callbacks, effects, return.
3. Complex frontend modules must use strict colocation with `index.ts`, `.tsx`, `use-*.ts`, `*.helpers.ts`, `*.types.ts`, `*.constants.ts`, optional `*.schema.ts`, and colocated `__tests__/`.
4. `frontend/src/App.tsx` and any future `frontend/src/app/**` files are delivery/composition only. No React state/effect hooks, no direct Wails binding calls, no business logic.
5. Every property in frontend `*Props` interfaces inside `*.types.ts` must be `readonly`.
6. Every exported frontend helper in `*.helpers.ts` must have JSDoc.
7. TDD is mandatory for frontend helpers and hooks: update/create tests first in the colocated `__tests__/` folder.
8. Frontend files over 500 lines must be refactored immediately.
9. Prefer `frontend/src/features/dashboard` as the reference feature structure once introduced.
10. Use `bun --cwd="frontend" run generate:feature <feature> <ComponentName>` instead of manually scaffolding complex frontend feature folders.
11. Load `dnd-kit` for any drag-and-drop work (sortable lists, kanban/multi-column boards): use the new `@dnd-kit/react` + `@dnd-kit/helpers` (React 19 + StrictMode safe, pointer-based for WebView2) — never legacy `@dnd-kit/core` and never native HTML5 DnD.
