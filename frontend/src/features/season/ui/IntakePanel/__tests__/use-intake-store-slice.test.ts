import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useIntakeStoreSlice } from '../use-intake-store-slice';
import { createSourceWithRows, seasonRow } from './intake-panel.test-support';

describe('useIntakeStoreSlice', () => {
  afterEach(() => resetSeasonStore());

  it('exposes query rows and store flags and messages', async () => {
    const rows = [seasonRow({ id: 'sa-1' })];
    setSeasonStoreState({ errorMessage: 'no active season', busyMessage: 'Checking episode availability…', matchingRun: { total: 2, resolvedInPhase: 1, phase: 'name_matching' } });
    const source = createSourceWithRows(rows);
    const { result } = renderHook(() => useIntakeStoreSlice(source), { wrapper: seasonQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.seasonAnimes).toEqual(rows));
    expect(result.current.readOnly).toBe(false);
    expect(result.current.busyMessage).toBe('Checking episode availability…');
    expect(result.current.matchingRun).toEqual({ total: 2, resolvedInPhase: 1, phase: 'name_matching' });
  });

  it('exposes every intake command', () => {
    const source = createSourceWithRows([]);
    const { result } = renderHook(() => useIntakeStoreSlice(source), { wrapper: seasonQueryWrapper().wrapper });
    for (const command of ['reconcileIntake', 'runMatching', 'resolveMatch', 'discardName', 'restoreName', 'setSeasonAnimeMetadata', 'createSeasonAnimes', 'recheckAvailability'] as const) {
      expect(result.current[command]).toBeTypeOf('function');
    }
  });
});
