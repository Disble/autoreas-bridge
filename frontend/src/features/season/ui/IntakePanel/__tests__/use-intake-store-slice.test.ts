import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useIntakeStoreSlice } from '../use-intake-store-slice';
import { seasonRow } from './intake-panel.test-support';

describe('useIntakeStoreSlice', () => {
  afterEach(() => {
    resetSeasonStore();
  });

  it('exposes the rows, flags, and messages the panel renders', () => {
    const rows = [seasonRow({ id: 'sa-1' })];
    setSeasonStoreState({
      seasonAnimes: rows,
      readOnly: true,
      errorMessage: 'no active season',
      busyMessage: 'Checking episode availability…',
      matchingRun: { total: 2, resolvedInPhase: 1, phase: 'name_matching' },
    });
    const { result } = renderHook(() => useIntakeStoreSlice());

    expect(result.current.seasonAnimes).toBe(rows);
    expect(result.current.readOnly).toBe(true);
    expect(result.current.errorMessage).toBe('no active season');
    expect(result.current.busyMessage).toBe('Checking episode availability…');
    expect(result.current.matchingRun).toEqual({ total: 2, resolvedInPhase: 1, phase: 'name_matching' });
  });

  it('exposes every store action the panel drives', () => {
    const state = getSeasonStoreState();
    const { result } = renderHook(() => useIntakeStoreSlice());

    expect(result.current.refreshAnimes).toBe(state.refreshAnimes);
    expect(result.current.reconcileIntake).toBe(state.reconcileIntake);
    expect(result.current.runMatching).toBe(state.runMatching);
    expect(result.current.resolveMatch).toBe(state.resolveMatch);
    expect(result.current.discardName).toBe(state.discardName);
    expect(result.current.setSeasonAnimeMetadata).toBe(state.setSeasonAnimeMetadata);
    expect(result.current.createSeasonAnimes).toBe(state.createSeasonAnimes);
    expect(result.current.recheckAvailability).toBe(state.recheckAvailability);
  });
});
