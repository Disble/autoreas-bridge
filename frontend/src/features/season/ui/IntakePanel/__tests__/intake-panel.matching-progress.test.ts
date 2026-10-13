import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { SeasonMatchingRun } from '../../../../../shared/store/season-store/season-store.types';
import { formatMatchingProgress } from '../intake-panel.helpers';
import { useIntakeMatchingProgress } from '../use-intake-matching-progress';
import type { useIntakeStoreSlice } from '../use-intake-store-slice';

/**
 * Renders the progress hook over a store slice holding the given run.
 * @param matchingRun The ephemeral run the slice reports, if any.
 * @returns The hook result for the case to assert on.
 */
function renderProgress(matchingRun: SeasonMatchingRun | null) {
  const store = { matchingRun } as ReturnType<typeof useIntakeStoreSlice>;
  return renderHook(() => useIntakeMatchingProgress({ store }));
}

describe('formatMatchingProgress', () => {
  it('reports nothing while no run is in flight', () => {
    expect(formatMatchingProgress(null)).toBeUndefined();
  });

  it('names the name-matching phase with its counts', () => {
    expect(formatMatchingProgress({ total: 4, resolvedInPhase: 1, phase: 'name_matching' })).toBe(
      'Matching names… 1 of 4',
    );
  });

  it('names the availability check instead of the matching while episodes are checked', () => {
    expect(formatMatchingProgress({ total: 4, resolvedInPhase: 2, phase: 'availability_check' })).toBe(
      'Checking episode availability… 2 checked',
    );
  });
});

describe('useIntakeMatchingProgress', () => {
  it('exposes no message while no run is in flight', () => {
    const { result } = renderProgress(null);

    expect(result.current.matchingProgressMessage).toBeUndefined();
  });

  it('exposes the phase-named message of the tracked run', () => {
    const { result } = renderProgress({ total: 4, resolvedInPhase: 3, phase: 'name_matching' });

    expect(result.current.matchingProgressMessage).toBe('Matching names… 3 of 4');
  });
});
