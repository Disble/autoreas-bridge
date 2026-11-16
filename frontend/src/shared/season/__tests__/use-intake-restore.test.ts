import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetSeasonStore, setSeasonStoreState } from '../../store/season-store/season-store.helpers';
import { useDisplayedSeasonAnimes } from '../use-displayed-season-animes';
import { useIntakeRestore } from '../use-intake-restore';
import { createSeasonDataSource, makeSeasonRow, seasonQueryWrapper } from './season.test-support';

describe('useIntakeRestore', () => {
  afterEach(() => resetSeasonStore());

  it('restores a row and waits for the refreshed query rows', async () => {
    const readSeasonAnimes = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([makeSeasonRow()]);
    const source = { ...createSeasonDataSource({ readSeasonAnimes }), restoreName: vi.fn().mockResolvedValue('ok') };
    const { result } = renderHook(() => ({ rows: useDisplayedSeasonAnimes({ refresh: 'mount', source }), restore: useIntakeRestore(source) }), { wrapper: seasonQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.rows.data).toEqual([]));
    await act(() => result.current.restore('row-1'));
    expect(source.restoreName).toHaveBeenCalledExactlyOnceWith('row-1');
    expect(readSeasonAnimes).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.rows.data).toEqual([makeSeasonRow()]));
  });

  it('does not restore while the past season is read-only', async () => {
    setSeasonStoreState({ readOnly: true });
    const source = { ...createSeasonDataSource(), restoreName: vi.fn().mockResolvedValue('ok') };
    const { result } = renderHook(() => useIntakeRestore(source), { wrapper: seasonQueryWrapper().wrapper });
    await act(() => result.current('row-1'));
    expect(source.restoreName).not.toHaveBeenCalled();
    expect(source.readSeasonAnimes).not.toHaveBeenCalled();
  });
});
