import { useEffect, useState } from 'react';
import { loadObservabilityFacts } from '../../../infrastructure/observability-facts-source/observability-facts-source.helpers';
import type { ObservabilityFacts } from '../../../infrastructure/observability-facts-source/observability-facts-source.types';

import type { ObservabilityFactsLoader } from './use-observability-facts.types';

/**
 * Reads the desktop adapter's static observability facts once per mount.
 * Null is held both while the read is in flight and whenever it degrades, so
 * a surface renders its fallback substance until facts are actually known
 * and never mistakes "not yet loaded" for a measured zero.
 *
 * There is deliberately no unmount guard around `setFacts`: since React 18 a
 * state update after unmount is a silent no-op (no warning, no throw), so a
 * liveness flag would be unobservable redundant code. The loader itself
 * catches all read failures, so the effect cannot reject.
 * @param loader The facts read seam; defaults to the shared binding loader.
 * @returns The facts, or null while unavailable.
 */
export function useObservabilityFacts(
  loader: ObservabilityFactsLoader = loadObservabilityFacts,
): ObservabilityFacts | null {
  // 1. Refs

  // 2. State
  const [facts, setFacts] = useState<ObservabilityFacts | null>(null);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    void loader().then(setFacts);
  }, [loader]);

  return facts;
}
