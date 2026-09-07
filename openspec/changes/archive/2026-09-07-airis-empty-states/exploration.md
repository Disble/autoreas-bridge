## Exploration: airis-empty-states

### Current State

The supplied references reconcile to three scoped frontend empty states: Today (`Untitled.png`), the Editor Library rail (`Untitled 2.png`), and Catalog (`Untitled 3.png` and duplicate `Untitled 4.png`). All three currently render plain text after their data hook resolves an empty collection.

- **Today**: `EpisodesRoute` mounts `EpisodeSchedulePanel`; its hook loads the selected day/lens and the panel renders `EPISODES_EMPTY_MESSAGE` when `rows.length === 0`. It has no next-action control.
- **Editor Library**: `AnimeEditorListPanel` renders "No anime match your search." when its visible list is empty. The separate `AnimeEditorRoute` owns an uncontrolled HeroUI Library/Create tab shell and always selects Library on entry.
- **Catalog**: `CatalogPanel` renders its title/message pair when `isEmpty` is true. That state currently conflates an actually empty result with filter-empty results and the runtime-unavailable wording in its constants.

The app uses `HashRouter`; `/today` and `/editor` are registered in `App.tsx`. A CTA cannot currently deep-link directly to the Create tab: `/editor/:id` consumes arbitrary dynamic segments and the route uses `defaultSelectedKey="library"`.

The supplied master art is `airis.png`, a transparent 1254×1254 ARGB PNG. No imported raster illustration assets currently exist under `frontend/src`; the screenshots are reference material only.

### Affected Areas

- `frontend/src/features/episodes/ui/EpisodeSchedulePanel/EpisodeSchedulePanel.tsx` — replaces the Today text-only empty branch with an actionable Airis state while retaining day/lens controls and error handling.
- `frontend/src/features/episodes/ui/EpisodeSchedulePanel/episode-schedule-panel.constants.ts` — separates Today empty-state copy from the generic current message.
- `frontend/src/features/anime-editor/ui/AnimeEditorWorkspace/AnimeEditorListPanel.tsx` — replaces the Library rail's text-only empty rendering with its dedicated Airis variant and Create action.
- `frontend/src/features/catalog/ui/CatalogPanel/CatalogPanel.tsx` and `catalog-panel.constants.ts` — replace the Catalog text-only empty rendering with its dedicated Airis variant and clarify copy by state.
- `frontend/src/app/routes/AnimeEditorRoute.tsx`, `frontend/src/App.tsx` — add a static Create entry route (for example `/editor/create`) that selects the existing Create tab without putting route state or hooks in the app composition layer; static route ranking must precede the existing `/editor/:id` behavior.
- `frontend/src/shared/ui/` — the three layouts share illustration, title, explanatory copy, and an optional primary action. A small presentation-only `AirisEmptyState` component with typed readonly props is justified; feature modules retain condition selection and destination-specific copy.
- `frontend/src/assets/airis-empty-states/` — add three product-ready, distinct Airis variant files derived from the supplied master art.
- `frontend/src/features/episodes/ui/EpisodeSchedulePanel/__tests__/EpisodeSchedulePanel.test.tsx` — cover the Today empty state before changing its render path.
- `frontend/src/features/anime-editor/ui/AnimeEditorWorkspace/__tests__/AnimeEditorWorkspace.test.tsx` — cover the Library-empty render through its workspace fixture, or add a colocated `AnimeEditorListPanel` component test if direct presentation coverage is clearer.
- `frontend/src/features/catalog/ui/CatalogPanel/__tests__/CatalogPanel.test.tsx` — extend the existing empty-state test with the illustration, copy, and action assertions.
- `frontend/src/app/routes/__tests__/AnimeEditorRoute.test.tsx` — prove that `/editor/create` opens Create while `/editor/:id` continues to select Library.

### Asset, Loading, and Accessibility Contract

- Produce one composition per scoped surface: a schedule-oriented Today pose, a library/creation-oriented Editor pose, and a catalog/discovery-oriented Catalog pose. Each variant must remain recognizably Airis and must use the transparent master as its visual source.
- Export each variant as a 512×512 transparent WebP and import it from source so Vite fingerprints it. WebView2 is Chromium-based, making WebP a supported desktop product format; 512px supplies adequate density for a roughly 160–256px rendered illustration while reducing the 1254px source payload.
- Set intrinsic `width` and `height` to 512, constrain display size responsively, use `decoding="async"`, and use eager loading because the illustration is the primary content of an already-visible empty state. Do not fetch an off-repository URL or use base64 data URLs.
- Treat each illustration as decorative (`alt=""` and `aria-hidden="true"`): the adjacent heading, explanation, and action communicate the state and next step. The CTA must have a specific accessible name such as "Create an anime" and use HeroUI's primary action semantics.

### Approaches

1. **Feature-local empty-state markup and assets** — Each target feature renders its own art, copy, and CTA.
   - Pros: Minimal indirection and exact local layouts.
   - Cons: Repeats image sizing, accessibility, and action presentation across all three screens.
   - Effort: Medium.

2. **Shared presentation-only Airis empty-state component with feature-owned conditions** — A shared UI component receives the asset, title, description, and optional action; Today, Editor, and Catalog keep their own empty predicates and destination choices.
   - Pros: Enforces one image/accessibility/loading treatment, limits repeated JSX, and respects dumb feature TSX.
   - Cons: Requires a compact props/types/test module and must avoid absorbing feature data logic.
   - Effort: Medium.

### Recommendation

Adopt approach 2, scoped strictly to the three referenced surfaces. Render distinct optimized Airis variants through one presentation-only shared component, with feature-local constants defining copy and the call-to-action destination.

Use a dedicated static `/editor/create` route that composes the existing route with its Create tab selected. Today, Editor Library, and Catalog should route their primary CTA there. This makes the Today action complete in one activation, keeps the route layer composition-only, preserves the Library default at `/editor`, and avoids interpreting `create` as an anime id. The Create workflow remains the existing batch-create feature; no Wails, storage, API, or backend work is needed.

Under strict TDD, write the component and route regression tests first. The acceptance set must prove each illustration/copy/action appears only for its resolved empty state, Today’s CTA reaches the existing Create workspace, `/editor/create` selects Create, `/editor/:id` remains Library-oriented, loading/error states do not display Airis, and all three images are decorative while the visible CTA remains discoverable by role and name.

### Risks

- Catalog’s current `isEmpty` does not distinguish a pristine empty catalog from a filter that produces zero matches; its action/copy must avoid falsely telling a filtered user that the whole catalog is empty. The proposal/spec phase must decide whether this change only changes visual treatment or introduces a small derived-state distinction.
- HeroUI Button/link composition must use the installed v3 API and `onPress` conventions. Verify the installed Button documentation during implementation before choosing its router-link composition.
- The Create shortcut adds route-selection behavior adjacent to `/editor/:id`; route tests must protect static Create routing and existing deep links.
- Asset generation is a visual acceptance boundary. Unit tests can prove source, dimensions attributes, semantics, and navigation; a browser/layout smoke check remains needed for rendered scale and non-clipping.

### Ready for Proposal

Yes — the target surfaces, existing data branches, destination route gap, asset constraints, and TDD scope are identified. The proposal should bound the change to Today, Editor Library, and Catalog, specify distinct Airis variants and actionable copy, and record the Catalog filter-empty decision explicitly.
