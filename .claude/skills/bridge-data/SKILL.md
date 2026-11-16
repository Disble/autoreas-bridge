---
name: bridge-data
description: "Trigger: Wails binding, fetch or load backend data, useEffect fetch, source, loading skeleton, empty state, error, query, mutation, backend event. Data flows Go module handle -> useBridgeQuery -> toAsyncView (ADR-032)."
metadata:
  author: autoreas-bridge
  version: "1.0.0"
  scope: project
  updates: living
---

# Bridge data — bindings, queries, readiness

Backend data reaches a screen on one path, so a module that is still starting or has failed never looks
empty. Decision and alternatives: `docs/adr/032-async-state-standard.md`. The contract as the code has
it today, with what has not migrated yet: `docs/architecture/cross-cutting/async-state.md`. What each
state looks like: skill `autoreas-theme` and `docs/design/patterns/loading-empty-error.md`.

```
Go binding (App method) -> modules.<Context>.Use -> domain service
  -> infrastructure source (only binding caller) -> shared/query useBridgeQuery
  -> toAsyncView in the hook -> .tsx renders view.kind
```

## Hard rules

1. A binding reaches its services only through its module handle's `Use`. It returns `(T, error)` and
   never answers `[]`, `""`, `"ok"` or a zero value because its module is not ready.
2. Failures are codes; outcomes (`applied`, `no_op`, `conflict`) are successful results, never errors.
3. Outside `shared/query/**` and `infrastructure/**`: no `infrastructure/**` or `wailsjs/**` import, no
   `window.go`, no `@tanstack/react-query`, no `EventsOn` or `subscribe<Name>(...)`.
4. No `useEffect` + `useState` fetch for backend data: use `useBridgeQuery` / `useBridgeMutation`.
5. Hooks call `toAsyncView`; `.tsx` files only render `view.kind`.
6. Never add a baseline entry to silence a new violation. A moved or renamed file is new code.

| I am about to… | Do this |
|---|---|
| Add or change a Go binding | Recipe 1 |
| Add a binding whose module has no handle yet | Recipe 4, then recipe 1 |
| Show backend data, a skeleton, an empty state or a load error | Recipe 2 |
| Refresh a screen when the backend emits an event | Recipe 3 |
| Read why a commit was blocked | Recipe 5 |

## Recipe 1 — add a binding (Go)

Bindings are exported `App` methods in `internal/desktop`. The real, always-ready example is the shell
handle (`internal/desktop/app_readiness.go`):

```go
func (a *App) GetReadiness() (ReadinessSnapshot, error) {
	return a.moduleSet().shell.Use(func(services modules.ShellServices) (ReadinessSnapshot, error) {
		statuses := services.Readiness.Snapshot()
		// map statuses to the DTO …
		return snapshot, nil
	})
}
```

A domain binding has the same shape on its module's handle (`*modules.Handle[S]`,
`internal/modules/handle.go`). Names below are illustrative:

```go
func (a *App) GetWidget(id string) (contracts.Widget, error) {
	return a.moduleSet().widgets.Use(func(s widgetServices) (contracts.Widget, error) {
		if id == "" {
			return contracts.Widget{}, apperr.InvalidArgument("widget id is required")
		}
		widget, err := s.query.Widget(id)
		if errors.Is(err, contracts.ErrWidgetNotFound) {
			return contracts.Widget{}, apperr.NotFound("widget " + id + " not found")
		}
		return widget, err // a plain error becomes internal
	})
}
```

| Situation | Return (`internal/apperr`) |
|---|---|
| Module starting / failed | Nothing to write: `Use` answers `unavailable` / `failed_precondition` with the reason. They have no exported constructor, and `apperr.CodeOf` reads them as `internal` from any other package |
| Bad input | `apperr.InvalidArgument(message)` |
| Record does not exist | `apperr.NotFound(message)`; domains keep their sentinel (`contracts.ErrAnimeNotFound`), the binding maps it |
| Anything else | return the error (`Use` wraps it with `apperr.OrInternal`) or `apperr.Internal(err)` |
| OCC conflict, no-op | a successful result struct carrying the outcome |

Then:

- Test each state of the binding's module: starting → `unavailable`, failed → `failed_precondition`
  with the reason, ready → the value; assert with `apperr.CodeOf(err)`. Model:
  `TestUseFollowsTheModuleState` in `internal/modules/handle_test.go`.
- `go run ./tools/checkarchitecture` (rules `binding-uses-handle`, `binding-signature`).
- `bun --cwd="frontend" run generate:bindings` (never edit `frontend/wailsjs/`).

## Recipe 2 — show backend data on a screen

1. Scaffold: `bun --cwd="frontend" run generate:feature <feature> <Component>`. It writes a hook that
   reads through `useBridgeQuery` + `toAsyncView`, a `.tsx` rendering the four states, and a
   placeholder `load<Component>` that rejects until you wire the binding.
2. Source port and adapter, as the readiness source does: port interface in `frontend/src/shared/contracts/`
   (model `ReadinessSource`, `readiness.types.ts`), Wails adapter in `frontend/src/infrastructure/`
   (model `createReadinessSource`, `infrastructure/readiness/readiness-source.helpers.ts`). The adapter
   wraps every call in `withBridgeErrors` (`infrastructure/bridge-error/bridge-error.helpers.ts`) and,
   when the binding never attaches, rejects with `createBridgeError('unavailable', …)` — never a
   `() => []` fallback.
3. Construct the adapter once in `frontend/src/shared/query/bridge-runtime/bridge-runtime.constants.ts`,
   the only `shared/query` file that imports `infrastructure/**`; the hook imports it from there.
4. Keys: `defineQueryKeys('<context>')` (`shared/query/query-keys/query-keys.helpers.ts`) gives
   `<context>Keys.all` (the prefix an invalidation names) and `<context>Keys.key(...parts)`. Keys an
   invalidation rule needs live in `shared/query`, because shared code cannot import features.
5. Hook (`use-<component>.ts`), from the scaffold plus `module`:

```ts
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';

// 4. Queries/Mutations
const query = useBridgeQuery({
  queryKey: WidgetPanelQueryKey,
  queryFn: loadWidgetPanel, // the source method; receives { signal }
  // The ModuleId (MODULE_IDS) whose handle serves the binding: no call while it starts,
  // a failed_precondition failure once it failed.
  module: 'episodes',
});

// 5. Derived State
const view = toAsyncView(query); // only an empty array is empty; pass a predicate for other shapes
const isBusy = view.kind === 'ready' && view.isRefreshing;
```

6. `.tsx` renders exactly one state (scaffold output):

```tsx
<section aria-busy={isBusy}>
  {view.kind === 'loading' && <LoadingBars count={3} label={WidgetPanelLoadingLabel} />}
  {view.kind === 'failure' && (
    <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>{view.message}</Alert.Title></Alert.Content></Alert>
  )}
  {view.kind === 'empty' && <AirisEmptyState kind="caught-up" size="section" title={…} description={…} />}
  {view.kind === 'ready' && <ul>{view.data.map((item) => <li key={item}>{item}</li>)}</ul>}
</section>
```

Replace `LoadingBars` with a shape-mirroring skeleton when the content has a shape (skill `autoreas-theme`).
`useBridgeQuery` owns retry (`unavailable` only, bounded) and keeps the previous data on a key change;
you cannot override `retry`, `placeholderData` or `select`.

Writes: `useBridgeMutation({ mutationFn, onSuccess, onError })`
(`shared/query/use-bridge-mutation/use-bridge-mutation.ts`). It never retries; report the outcome with a
toast; a `conflict` outcome is data, not an error.

Tests: wrap with `createBridgeQueryTestWrapper({ readinessGate })`
(`shared/query/test-support/bridge-query.test-support.tsx`) and pass its `wrapper` to `renderHook` or
`render`. Assert loading, empty, failure and ready, including the negative (no rows while loading).

## Recipe 3 — react to a backend event

Add a rule to `BRIDGE_INVALIDATIONS` in `frontend/src/shared/query/bridge-runtime/bridge-runtime.constants.ts`;
`BridgeQueryProvider` subscribes once and invalidates every query under the prefix:

```ts
// animeKeys = defineQueryKeys('anime'), kept in shared/query (recipe 2, step 4)
export const BRIDGE_INVALIDATIONS = createInvalidationRegistry([
  { event: 'anime.changed', queryKeys: [animeKeys.all] },
]);
```

`event` is the Wails event name Go emits from a `register*RuntimeEventBridge` function
(`internal/desktop/app_startup_runtime.go`, e.g. `anime.changed`). Never call `EventsOn` or a source's
`subscribe<Name>` from a feature or a shared store. When you migrate one, delete its baseline entry.

## Recipe 4 — binding in an unmigrated module

A module without a handle still has its services in `App` fields. Do not add another binding that reads
an `App` field: create the module's handle first (steps also in the `internal/modules` package comment).

1. In `internal/desktop`, declare a struct with the concrete services the module's bindings need,
   never the `App`.
2. Add a field to `appModules` (`internal/desktop/app_readiness.go`) and build it inside `moduleSet()`
   with `modules.NewHandle[ThatStruct](module<Context>, a.modules.registry)`; the module id is already
   in `registeredModules`.
3. Where startup wires the services, call `Bind(services)` before the `settleModules(module<Context>)`
   that marks it ready, and make its `moduleWiringChecks` entry fail when a bound service is nil.
4. Write the new binding with recipe 1. Existing bindings of the module may stay until migrated; each
   one you migrate deletes its `tools/checkarchitecture/baseline.yaml` entries in the same unit.
5. Update the module's `docs/architecture/` page and the Known drift of
   `docs/architecture/cross-cutting/async-state.md`.

## Recipe 5 — a commit blocked by an async-state or binding gate

Go: `go run ./tools/checkarchitecture` (pre-commit and pre-merge job `architecture`).

| Message | Fix |
|---|---|
| `<file>: App.<Name> reaches its services without a module handle; … [binding-uses-handle]` | Route the body through the module's `Use` (recipe 1; recipe 4 when there is no handle) |
| `<file>: App.<Name> returns a string status or a slice without an error; … [binding-signature]` | Return `(T, error)` with `apperr` failures and outcome results |
| `stale baseline entry in tools/checkarchitecture/baseline.yaml: {rule: …} no longer occurs; delete that entry` | You fixed a legacy binding: delete exactly that entry in the same commit |
| `duplicate baseline entry …; delete one` | Delete the duplicate |

Frontend: ESLint `async-state/*` (editor, `check:staged`) and `bun --cwd="frontend" run check:async-state`
(pre-commit job `frontend-async-state`; `check:async-state:all` whole tree in pre-merge).

| Rule in the message | Fix |
|---|---|
| `no-infrastructure-import` | Read and write through `useBridgeQuery` / `useBridgeMutation`; only `shared/query` and `infrastructure` import adapters or `wailsjs/**` |
| `no-window-go` | Call the binding from an `infrastructure/**` source (recipe 2) |
| `react-query-in-shared-query` | Use the `shared/query` helpers; tests use `createBridgeQueryTestWrapper` |
| `zustand-vanilla-allow-list` | Server state is a query; the allow-list (`ZUSTAND_VANILLA_ALLOW_LIST`, `frontend/scripts/async-state-gates.helpers.mjs`) is closed |
| `no-runtime-subscription` | Recipe 3 |
| `stale entry, no longer found; delete it from frontend/async-state-baseline.json: {…}` | Delete exactly that entry in the same commit |
| `cannot check, parse error: …` | Fix the syntax error; that file's entries are not judged until it parses |

A baseline entry is deleted only when its violation is gone; the gate names it. Never add one, never widen
a rule, scope, allow-list or test exemption, and never bypass the hook with `--no-verify`.

## Keeping it alive

Keep this file byte-identical with `.agents/skills/bridge-data/SKILL.md`; `go test ./tools/checkskillparity/`
fails when the copies differ (pre-commit job `skill-parity`). When a helper changes, update the recipe
in the same unit and bump `version`.
