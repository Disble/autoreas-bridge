import { useCallback, useState } from 'react';

/**
 * Tracks whether this empty state's artwork failed to load.
 *
 * The artwork is decoration: the title, the description and the recovery action
 * are what the empty state is for. So a failed image must degrade to nothing
 * rather than to the browser's broken-image glyph, which reads as a defect in
 * the app rather than a missing decoration.
 *
 * This is not hypothetical. Under `wails dev`, `wails.json` sets
 * `frontend:dev:serverUrl: "auto"`, so the desktop shell proxies asset requests
 * to the Vite dev server. While Vite restarts, that proxy cannot dial it —
 * `ExternalAssetHandler` logs `connectex: No connection could be made` — and
 * only requests made during that window fail. The already-loaded bundle keeps
 * rendering, so the symptom is exactly one broken picture in an otherwise
 * healthy screen. A built binary embeds the assets (`//go:embed all:frontend/dist`),
 * so it cannot happen there; the guard exists for the dev loop and for any other
 * way a single asset request can fail.
 *
 * @returns Whether to render the artwork, and the failure handler to wire to it.
 */
export function useAirisEmptyState() {
  // 1. Refs

  // 2. State
  const [hasArtwork, setHasArtwork] = useState(true);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const onArtworkError = useCallback(() => {
    setHasArtwork(false);
  }, []);

  // 7. Effects

  return { hasArtwork, onArtworkError };
}
