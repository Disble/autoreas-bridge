# Autoreas Bridge — Agent Instructions

## Project truth and delivery

- Stack: Go, Wails v2, React/Vite, HeroUI, and SQLite. The intended architecture is hexagonal Ports & Adapters with bounded contexts and an in-memory event bus.
- Bridge exclusively owns anime state. The embedded SQLite database, especially `anime_snapshots`, is the source of truth; no Legacy Desktop synchronization, file watch, parsing, or writing remains.
- The codebase and current product documentation are the execution contract. `openspec/` is historical evidence, not an active contract. When they disagree, code wins as runtime truth; record the drift before planning a correction.
- Make incremental changes and verify each meaningful step. Use the real command and artifact at a boundary, not a convenient equivalent or permissive mock.
- The orchestrating agent performs final verification. After it passes, create the work-unit commit with its checks and documentation; commit hooks are part of the verification boundary. Do not commit development work directly to `main`.

## Frontend architecture

- `frontend/src/features/**/*.tsx` is dumb UI: render JSX with HeroUI React and Tailwind only. No Wails calls, effects, business logic, or data transformations.
- Custom frontend hooks use this order: imports, signature, refs, state, third-party/context hooks, queries/mutations, derived state, callbacks, effects, return. Callbacks delegate to pure helpers.
- Complex frontend modules are colocated folders with a component, hook, helpers, types, constants, optional schema, and `__tests__/`; import concrete paths and never create `index.ts` barrels.
- Feature components and hooks export their main symbol as a named function. Types, root constants, root helpers, and Zod schemas belong in their dedicated colocated files, never feature `.tsx` or `use-*.ts` files.
- `App.tsx` and `frontend/src/app/**` compose the application only: no state/effect hooks, direct Wails bindings, or business logic.
- Every `*Props` property is `readonly`. Every frontend declaration, including private and test declarations, has JSDoc. These obligations apply when a file is touched.
- Update or create colocated tests before changing frontend helpers or hooks. Follow RED → GREEN → MUTATE → REFACTOR.
- Keep Go and frontend files at or below 500 effective lines; 400 lines is the warning threshold. Refactor instead of creating permanent size debt or weakening a limit.
- Use the supported `@dnd-kit/react` and `@dnd-kit/helpers` APIs for drag and drop. Never use legacy `@dnd-kit/core`, native HTML5 drag and drop, or remove `React.StrictMode`.
- Lists that may reach 100 rows render an initial progressive window and grow near the bottom. Static lists use `useProgressiveListWindow`; live event-driven lists preserve their own window and use `isNearListBottom`. Add a DOM-count test proving one batch rather than rendering the full collection.
- Reusable presentation-only controls belong in `frontend/src/shared/ui/`. Extract a generic shared component when a Label/Input/Select pattern occurs three or more times.
- A stateful widget shared by multiple features belongs in `frontend/src/shared/<domain>/`, not in `features/`.
- Loading, empty, and failure states are exclusive: loading is an accessible shape-matching skeleton, resolved empty uses `AirisEmptyState`, and failure uses the surface `Alert`. Loading status uses `role="status"`, `aria-live="polite"`, and an `aria-labelledby` sr-only label; tables retain their structure with skeleton rows, `aria-busy`, and no real rows while loading. Test the negative case and matching row height.

## Testing and mutation

- Tests follow RED → GREEN → MUTATE → REFACTOR. A test must fail when its relevant guard is removed; coverage alone is not evidence.
- For Go changes, stage the production change and run mutation testing against its owning package:
  `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./<owning-package>/"`
  Use `--dry` to inspect scope. Do not use `./...` as the mutation test command. For a direct hand mutation, prove the edit applied before trusting the result.
- Frontend staged mutation testing is automated through the `frontend-mutation` lefthook job. Do not weaken it, suppress a survivor, or replace behavior scenarios with tests that pin production constants.
- Use real stored-shape fixtures in `internal/anime/store/testdata` for storage codec validation. Copy fixtures to temporary locations; never mutate them in place.
- At SQLite, Windows filesystem, and Wails CLI boundaries, a passing unit/gate suite is provisional. Run the appropriate real integration or build verification before claiming that boundary works.

## Quality gates and generated artifacts

- `lefthook.yml` is the single pre-commit entry point. Run the gate normally; never bypass it with `--no-verify`. Allow at least five minutes for `git commit`.
- Use the exact gate command when diagnosing a failure. `golangci-lint run ./...` is not a substitute for the repository lint profiles.
- The Go size gate is `go run ./tools/checkgofilesize`; frontend `>500` failures are enforced by ESLint and dharness. `tools/checkgofilesize/baseline.yaml` is temporary no-growth debt only and must return to `files: []`.
- App icons are generated from `build/appicon.png` with `go run ./tools/genicons`; never hand-edit generated `.ico` files.
- The frontend generated Wails bindings are untracked. Regenerate them with `bun --cwd="frontend" run generate:bindings` after changing bound Go methods; never edit `frontend/wailsjs/`.
- Run `bun --cwd="frontend" run fallow ...` for frontend static-analysis work. Treat `frontend/.fallowrc.json` as repository truth and do not add remote configuration inheritance.
- A merge commit runs `pre-merge-commit`, not `pre-commit`; its checks are whole-tree. Do not assume a fast-forward merge runs a hook.
- A healthy backend startup does not prove a visible frontend. Run `bun --cwd="frontend" run render:smoke` before claiming a production bundle works, when adding a route, or when investigating a blank WebView. HashRouter routes use `/#/...`.

## Architecture and platform boundaries

- Code, identifiers, columns, errors, comments, and cross-service wire fields are English. Spanish is limited to retained byte-compatible storage-codec fields, Spanish runtime data values, and UI copy. English-ify the pre-existing vocabulary a slice owns with additive migrations; do not rename another pending slice's shipped surface.
- Anime state is keyed by `_id` in `anime_snapshots.snapshot_json`; do not infer state from row order. `activo=false` is not a tombstone.
- Only `internal/desktop` may import the Wails runtime. The repository root contains `main.go` for embedding and `wails.Run`; do not spread desktop shell code into the root.
- A Wails binding namespace rename affects its import path, model alias, and `window.go.<package>.App` runtime global. Search and test all three shapes.
- Keyboard shortcuts are registry entries, never local `onKeyDown` handlers. The global dispatcher is mounted once; scoped shortcuts use the keyboard scope mechanism. Defaults are user-rebindable through the persisted opaque `keyboard.keymap` value; Go does not parse it.
- Treat a claimed framework requirement as a hypothesis until verified from that framework's source. A code search is only as broad as the identifier shapes it includes.

## Branches and releases

- `dev` carries development; `main` carries deployments. A release is a merge of `dev` into `main`, then a tag on that `main` commit.
- The release version is only `wails.json` → `info.productVersion`. A release updates `CHANGELOG.md`, regenerates `build/windows/installer/wails_tools.nsh` through `wails build -nsis`, and ships all three in one commit.
- CI publishes releases from `vX.Y.Z` tags. A local `wails build` is smoke-test rehearsal, not delivery. Published tags are immutable; corrections are patch releases.

## Maintenance principles

- A rule needs a machine owner where practical: a linter, test, gate, or contract. Do not weaken a threshold, exclusion, baseline, or suppression to make a failure disappear; document and review an exceptional decision.
- Keep the append-only why-log with `node scripts/log-lesson.mjs "one concise lesson"` after non-obvious bugs or deliberate decisions. It complements deterministic enforcement and never replaces it.
- Measure comparable work with `wc -l`; include tests and task records in the estimate. If a work unit exceeds its budget, refactor genuine duplication without deleting behavior or mutation-killing coverage.

## References

- `docs/architecture.md`
- `docs/file-size-policy.md`
- `docs/mutation-testing.md`
- `docs/fallow-usage.md`
- `docs/learning-log.md`
- `docs/adr/008-legacy-breakup-sqlite-sole-owner.md`
- `docs/adr/011-no-barrel-files.md`
- `docs/adr/012-progressive-list-rendering.md`
- `docs/adr/018-desktop-shell-package.md`
- `docs/adr/019-keyboard-command-registry.md`
- `docs/adr/020-keymap-override-seam.md`
