# Design: Airis Empty States

One dumb shared shell renders three feature-owned, resolved-empty experiences; data ownership, classification, and recovery remain local.

## Technical Approach

`shared/ui/AirisEmptyState/` supplies a named HeroUI `Card`, `Typography`, optional primary `Button`, and decorative native image. Its readonly props carry image, copy, and optional action; it owns no state, routing, effects, or predicates. Three source-imported 512×512 WebP variants derive from `.ignore/blank/airis.png`: Today schedule, Editor Library, and Catalog discovery.

## Architecture Decisions

| Decision | Choice and rationale |
|---|---|
| Presentation/state boundary | Share the accessibility and visual shell. Feature helpers classify their own source and criteria, preventing unrelated filters from coupling. |
| Request errors | Retain `useAsyncList` and add `error: Error | undefined`. Catalog needs this shared result; History and dashboard consumers retain their current `{ items, isLoading, reload }` behavior by ignoring the additive field. |
| Editor tab reselection | `AnimeEditorRoute` accepts `initialTab`; key the tab composition by `initialTab` and use it for `defaultSelectedKey`. This remounts uncontrolled HeroUI Tabs when an already-mounted `/editor` changes to `/editor/create`. |
| Recovery | Actual-empty exposes **Create an anime**; criteria-empty exposes only **Clear search and filters**. Editor resets query plus `all`; Catalog resets its complete default filter object. |

## Data Flow

```text
runtime request → feature hook → feature classifier → feature TSX → AirisEmptyState
                    └→ Create route / criteria reset
```

Today retains its existing error alert and adds request loading. Only a successful request with zero rows renders Airis; day and lens controls remain mounted. Editor adds list rejection handling, so its `finally` path cannot present a failed request as empty. Catalog renders its rejection `Alert` before classification.

`useAsyncList` clears `error` at every request start and success. A rejection sets `items` to `[]`, records the error, settles loading, and preserves the existing empty-list semantics for History and dashboard/Devices consumers that do not read `error`. `reload`, refresh-key, and source-key changes begin a fresh request and clear the old error; cancelled requests change no state.

## File Changes

| File | Action | Description |
|---|---|---|
| `frontend/src/assets/airis-empty-states/{today,editor-library,catalog}.webp` | Create | Distinct transparent artwork. |
| `frontend/src/shared/ui/AirisEmptyState/{AirisEmptyState.tsx,airis-empty-state.types.ts,__tests__/AirisEmptyState.test.tsx}` | Create | Dumb readonly shell and accessibility tests. |
| `frontend/src/features/episodes/ui/EpisodeSchedulePanel/{EpisodeSchedulePanel.tsx,use-episode-schedule-panel.ts,*.constants.ts,*.types.ts,__tests__/EpisodeSchedulePanel.test.tsx}` | Modify | Loading plus resolved-empty Today composition and navigation. |
| `frontend/src/features/anime-editor/ui/AnimeEditorWorkspace/{AnimeEditorListPanel.tsx,use-anime-editor-list.ts,use-anime-editor-workspace.ts,*.helpers.ts,*.types.ts,__tests__/use-anime-editor-list.test.tsx,__tests__/AnimeEditorListPanel.test.tsx}` | Modify/Create | Error, actual/criteria classification, exclusive actions, reset. |
| `frontend/src/shared/hooks/use-async-list/{use-async-list.ts,use-async-list.types.ts,__tests__/use-async-list.test.ts}` | Modify | Additive error lifecycle and regression coverage. |
| `frontend/src/features/catalog/ui/CatalogPanel/{CatalogPanel.tsx,use-catalog-panel.ts,*.helpers.ts,*.constants.ts,*.types.ts,__tests__/use-catalog-panel.test.ts,__tests__/CatalogPanel.test.tsx}` | Modify | Rejection-before-classification, criteria reset, exclusive actions. |
| `frontend/src/{App.tsx,app/routes/AnimeEditorRoute.tsx,app/routes/AnimeEditorRoute.types.ts,app/__tests__/App.test.tsx}` | Modify | Static route, keyed tab composition, root/legacy redirect and Editor route regressions. |
| `frontend/{package.json,scripts/check-airis-assets.mjs,scripts/layout-fixtures/airis-empty-states-fixture.tsx,scripts/layout-fixtures/main.tsx}` | Modify/Create | Asset and real-browser composition evidence. |
| `frontend/scripts/render-smoke.mjs` | Modify | Check `/#/editor/create` paints the existing Create workspace. |

## Interfaces / Contracts

```ts
interface UseAsyncListResult<T> {
  readonly items: readonly T[]; readonly isLoading: boolean;
  readonly error: Error | undefined; readonly reload: () => void;
}
```

## Testing Strategy

Write RED tests first. Cover feature classifiers, loading/error/nonempty precedence, contextual Today controls, exact action names, and exclusive actions. `use-async-list` tests cover request-start/success error clearing, rejection, reload, source/refresh changes, cancellation, and History/dashboard consumer regressions.

Extend `App.test.tsx`: retain root and every legacy redirect assertion; test static Create, `/editor/:id` Library selection, and a navigation probe that starts on mounted Library then navigates to `/editor/create` and observes Create. Asset script runs `ffprobe` for `webp` and exact `512×512`, decodes alpha with `ffmpeg -vf alphaextract -f rawvideo -`, and fails unless at least one byte is below `255`; expose it as `bun --cwd=frontend run check:airis-assets`.

Add a layout fixture importing the production shell, feature constants, and all three actual assets. At both existing Edge viewports it reports one verdict per composition: image decoded (`naturalWidth/naturalHeight` 512), visible nonzero box within its card, and no document horizontal overflow. `bun --cwd=frontend run layout:smoke` must emit all three passing evidence lines; `render:smoke` separately proves the Create hash route. Run targeted tests, typecheck, lint, doctor, audit, asset check, both smokes, staged mutation, and lefthook.

## Threat Matrix

| Boundary | Applicability | Design response / RED tests |
|---|---|---|
| Documentation-like paths | N/A: no executable classification | None. |
| Git repository selection | N/A: no VCS operation | None. |
| Commit state | N/A: no commit automation | None. |
| Push state | N/A: no push automation | None. |
| PR commands | N/A: no PR automation | None. |
| Client routing | Applicable | Static Create, identifier Library, and mounted Library→Create tests. |

## Migration / Rollout

No migration or backend change. Revert assets, shared shell, feature branches, route, and additive hook field together.

## Open Questions

None.
