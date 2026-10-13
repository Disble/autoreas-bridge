import { useMemo } from 'react';
import { formatMatchingProgress } from './intake-panel.helpers';
import type { useIntakeStoreSlice } from './use-intake-store-slice';

/** Everything the intake matching progress reads from its caller. */
interface IntakeMatchingProgressInput {
  /** The Season store slice holding the ephemeral run. */
  readonly store: ReturnType<typeof useIntakeStoreSlice>;
}

/**
 * useIntakeMatchingProgress derives the panel's live-run view model: the
 * phase-named progress line of the run the store tracks, undefined while no
 * run is in flight so the panel renders no progress region at all. Split out
 * of `useIntakePanel` so the composer carries no progress derivation itself.
 * @param input The store slice holding the ephemeral run.
 * @returns The progress line, if any.
 */
export function useIntakeMatchingProgress(input: Readonly<IntakeMatchingProgressInput>) {
  const { store } = input;
  const { matchingRun } = store;

  // 5. Derived State (useMemo)
  const matchingProgressMessage = useMemo(() => formatMatchingProgress(matchingRun), [matchingRun]);

  return { matchingProgressMessage };
}
