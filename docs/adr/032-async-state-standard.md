# ADR-032: One async-state standard — module readiness, failure codes, server state in TanStack Query

- **Status**: Accepted (2026-11-14). Supersedes ADR-006 for **server state** (data read from the Go side);
  ADR-006 still governs UI/client state kept in Zustand.
- **Date**: 2026-11-14.
- **Related**: `odd/tasks/async-state-standard.md` (specification and task log),
  `docs/architecture/cross-cutting/async-state.md` (the contract as it stands in the code),
  `docs/design/patterns/loading-empty-error.md` (what each state looks like),
  ADR-006, ADR-015, ADR-018.

## Context

Bridge prod sometimes opened Today with "Nothing scheduled for <day>" although the database held the
schedule. The cause is a startup race that every module shares:

1. Wails v2.15 on Windows runs `OnStartup` in a goroutine while the WebView already loads `index.html`
   (wails `internal/frontend/desktop/windows/frontend.go:228-232`), and `OnDomReady` is a separate,
   unordered goroutine. Bindings are callable before `App.startup` (`internal/desktop/app.go:233`) has
   wired the services they use.
2. `App.GetEpisodeSchedule` (`internal/desktop/app_runtime.go:236-245`) answers `[]` when
   `episodeService` is nil and when the query fails. The frontend cannot tell "not ready" or "failed"
   from "nothing scheduled", caches the empty answer, and shows creation guidance.
3. `GetBridgeStatus` (`internal/desktop/app_runtime.go:21`) says `"ok"` while startup is still running and
   nothing in `frontend/src` calls it. Events emitted before a JS `EventsOn` listener exists are dropped
   (wails runtime `desktop/events.js:95`).

The race is one symptom of a wider fragmentation, measured on `main` at `b4392629`:

| Where | Shape today |
|---|---|
| Go bindings (121 exported `App` methods) | ~45 return a string status (`"ok"` = success), ~49 structs (some with `Status`/`Outcome`/`Degraded`), ~13 `(T, error)`, ~9 slices degrading to `[]` |
| "unavailable" wording in `internal/desktop` | 76 lines in 29 non-test files, 39 of them string literals |
| Frontend | 4 Zustand read-models (ADR-006) next to roughly 21–59 hand-fetching hooks (strict vs loose heuristic over 133 hooks added since 2026-07-12); `useAsyncList` has 2 consumers |
| REST errors | `{"error": string}` (`docs/openapi.yaml` `ErrorResponse`), one closed `code` enum on `/api/sync/diagnostics` |

ADR-006 had no machine owner and no instruction pointing to it, and it drifted. The keyboard command
registry (ADR-019) has a skill and a `CLAUDE.md` line and shows almost no drift (2 local
`onKeyDownCapture` handlers in features). Agents reinvent what they do not know exists.

## Alternatives considered (frontend)

| Option | Outcome |
|---|---|
| Zustand-only typed union extending ADR-006 | No new dependency, but retry, deduplication, stale-response and race handling would be hand-written a fourth time (download store read counter, `useAsyncList`, ad hoc `'loading' \| 'error' \| 'ready'` unions) |
| **TanStack Query v5** | Chosen. `status` + `fetchStatus`, retry predicate by error, invalidation from events, deduplication. Two packages. Defaults must be overridden for IPC: `networkMode: 'always'` (the default pauses on window `offline`), no refetch on focus or reconnect |
| SWR | No single status; weaker model for what the owner asked |
| RTK Query | Adds Redux next to Zustand |
| React 19 `use()` + Suspense | No cache; refetch and invalidation hand-written; promise-identity pitfalls |

Backend prior art: Kubernetes readiness (ready to take traffic, not restarted when unready) for the
lifecycle; gRPC status semantics for codes (`UNAVAILABLE` retryable, `FAILED_PRECONDITION` not retryable
until the state is fixed).

## Decision

### 1. Module lifecycle (Go)

- A readiness registry lives in its own package without Wails (`internal/lifecycle`). Each module is
  `starting | ready | failed(reason)`. Only the composition root (`internal/desktop`) writes it;
  domains never import it.
- Every transition is published on `events.Bus`; the desktop adapter forwards it to Wails as
  `bridge.readiness`, like the existing `register*RuntimeEventBridge` functions. `GetReadiness()`
  returns the snapshot and replaces `GetBridgeStatus`.
- Every startup early return (tray, database) marks the modules it skips `failed` with a reason, so no
  module stays `starting` forever.

### 2. Failures are codes; outcomes are results

- Failure codes: `unavailable` (module not ready; retryable), `failed_precondition` (module failed; do
  not retry), `invalid_argument`, `not_found`, `internal`.
- OCC conflicts are non-blocking domain **outcomes** (`docs/architecture.md` §1, `internal/sync`): they
  stay successful results carrying `applied | no_op | conflict`, never an error code.
- Domains keep their own sentinel errors (`contracts.ErrAnimeNotFound`, `ErrWriteBaseChanged`).
  Mapping an error to a code happens only in driving adapters: `internal/desktop` for Wails now,
  `internal/api` for REST later as an additive `code` field (no breaking change for mobile).
- Wails `options.App.ErrorFormatter` is global and turns any returned object into `"[object Object]"` in
  JS, so it serialises the code as a **JSON string**. One frontend adapter parses it and maps any
  non-JSON message (argument-parse errors and call timeouts skip the formatter) to `internal`.
- `unavailable` and `failed_precondition` are produced only by the module handles (§3); their
  constructors are unexported. Bindings use the exported constructors for `invalid_argument`,
  `not_found` and `internal`.

### 3. Typed module handles (Go)

- Services move out of `App` fields into the handle of their module, in their own package; `App` only
  constructs and injects registry and handles (ADR-018 already counts ~110 fields).
- The only way to reach a service is `modules.<Context>.Use(func(svc) (T, error))`: it checks readiness
  (`unavailable` while starting, `failed_precondition` after failure), runs the closure and maps errors.
  An ad hoc error inside the closure becomes `internal`, which renders as an error, never as empty.
- The `shell` handle exposes only shell capabilities (effective address, logger, frontend error
  reporting). A binding declared on `shell` cannot compile against a domain service; the compiler error
  names the right module.
- Legacy bindings keep their contract until their module migrates; a binding added to an unmigrated
  module first creates that module's handle.

### 4. Server state in TanStack Query; layering (frontend)

- `features/**` → `shared/query/**` (application layer, depends on source **ports**) →
  `infrastructure/**` (adapters, the only binding callers). TanStack Query is confined to
  `shared/query/**` as Wails is confined to `internal/desktop`.
- Concrete sources are wired in `src/app/**` and injected as ports; a provider component there with no
  state or effect hooks is composition.
- `shared/query` owns: the `QueryClient` defaults (`networkMode: 'always'`, no focus/reconnect refetch,
  retry only on `unavailable`, bounded), per-context query-key factories, the single event→invalidation
  bridge, and the readiness gate (subscribe to `bridge.readiness` first, then call `GetReadiness()`,
  reusing `createRuntimeSubscription` so StrictMode double mounts share one listener).
- Public helpers: `useBridgeQuery`, `useBridgeMutation`, `toAsyncView(query)`. Hooks call
  `toAsyncView`; `.tsx` files only render the state it returns: pending → skeleton, success and empty
  → empty state, error → Alert, refetch with data → `aria-busy`, previous data kept on key change.
- Zustand keeps UI/client state (selection, keyboard scopes, catalog session). One datum is never cached
  by both.

### 5. Guide first; gates are tripwires

Agents reinvent from not knowing, not from malice. Every rule ships, in order: a helper easier than
reinventing, discoverable instructions, a scaffold where one exists, and a gate whose message names the
helper and the skill. Deliberate bypass is out of scope.

| Rule | Helper | Instructions | Scaffold | Gate |
|---|---|---|---|---|
| Bindings go through a module handle | `modules.<Context>.Use`, `shell` | skill `bridge-data` ("add a binding", "binding in an unmigrated module") | — | compiler; `tools/checkarchitecture`: an exported `App` method must call a handle `Use` |
| Failures vs outcomes | exported constructors; outcome result structs | skill `bridge-data` (failure vs outcome table) | — | binding-signature rule: no string-status or slice-without-error returns |
| Backend reached only through `shared/query` | `useBridgeQuery`, `useBridgeMutation`, key factories | skill `bridge-data` ("show backend data on a screen") | `generate:feature` emits a `useBridgeQuery` hook | ESLint: `features/**` and `shared/**` (except `shared/query/**`) import no `infrastructure/**`; no `window.go` outside `infrastructure/**`; `@tanstack/react-query` only in `shared/query/**` |
| Loading / empty / error | `toAsyncView` | skill `autoreas-theme`, `loading-empty-error.md` | the scaffold hook returns the view state | existing state tests |
| Event → invalidation | invalidation bridge + key factories | skill `bridge-data` ("react to a backend event") | — | ESLint: no `EventsOn`/`subscribe*` outside `shared/query/**` and `infrastructure/**` |
| Architecture docs per module | page template | `CLAUDE.md`/`AGENTS.md` line; `docs/architecture/README.md` | `docs/architecture/templates/overview.md` | review |

- The skill `bridge-data` is tracked identically in `.claude/skills/` and `.agents/skills/`, with one line
  in both `CLAUDE.md` and `AGENTS.md`; a parity test fails when the two copies differ. Discovery never
  relies on `.atl/` (git-ignored).
- Gate messages name the helper, the skill and this ADR.
- New ESLint restrictions are merged into the existing `no-restricted-imports` block of
  `frontend/eslint.config.js`; a new block would replace its options (flat config). A RED fixture proves
  the barrel and `react-aria-components` bans still fire.
- Legacy violations sit in a baseline of identified violations (rule id + file + symbol or import
  specifier). New violations fail in pre-commit on staged files; a stale entry fails on staged files in
  pre-commit and whole-tree in `pre-merge-commit`, and its message names the entry to delete. The entry
  count is reported, not gated.
- Every gate has a RED fixture. One `error-codes.json` is compared by a Go test and a Vitest test.

## Consequences

- **Positive:** a module that is not ready or has failed can no longer look empty; one vocabulary from
  Go to the screen; the right path is the short path and is findable by every agent runtime.
- **Positive:** realtime pushes invalidate queries in one place instead of per-hook subscriptions.
- **Negative:** every binding is rewritten through a handle as its module migrates; two caches coexist
  (Zustand stores and queries) until the download and season stores migrate last.
- **Negative:** a new dependency (`@tanstack/react-query`) whose defaults must stay overridden.
- **Blind spots:** choosing the wrong failure code, or a module marking itself `ready` too early; covered
  by per-module behaviour tests and a real-startup integration test on a database copy, not by gates.
- **Migration:** slice 0 documentation; slice 1 Go foundation and gates; slice 2 frontend foundation,
  kit and gates; slice 3 Today pilot; then one context per slice, download and season stores last. Each
  slice brings its modules' architecture pages (backend and frontend) fully current.
