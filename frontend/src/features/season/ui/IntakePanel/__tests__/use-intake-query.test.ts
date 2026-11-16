import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeasonDataSource, makeSeasonRow, seasonQueryWrapper } from '../../../../../shared/season/__tests__/season.test-support';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { useIntakeQuery } from '../use-intake-query';
import { useIntakePanel } from '../use-intake-panel';
import { createSource, seasonRow } from './intake-panel.test-support';

describe('useIntakeQuery', () => {
  afterEach(() => resetSeasonStore());

  it('supplies the panel with query rows rather than stale store rows', async () => {
    const row = seasonRow({ id: 'query-row' });
    const source = { ...createSource(), ...createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue([row]) }) };
    setSeasonStoreState({ seasonAnimes: [seasonRow({ id: 'stale-row' })] });
    const { result } = renderHook(() => useIntakePanel(source), { wrapper: seasonQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.editableRows.map((item) => item.id)).toEqual(['query-row']));
  });

  it('keeps cached rows visible when a refetch fails', async () => {
    const row = makeSeasonRow();
    const readSeasonAnimes = vi.fn().mockResolvedValueOnce([row]).mockRejectedValue(new Error('read failed'));
    const { result } = renderHook(() => useIntakeQuery(createSeasonDataSource({ readSeasonAnimes })), { wrapper: seasonQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.rows).toEqual([row]));
    await act(() => result.current.refetch());
    await waitFor(() => expect(getSeasonStoreState().errorMessage).toBe('read failed'));
    expect(result.current.view.kind).toBe('ready');
    expect(result.current.rows).toEqual([row]);
  });

  it('shows query rows with event progress rather than the store rows', async () => {
    const row = makeSeasonRow();
    const source = createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue([row]) });
    const { result } = renderHook(() => useIntakeQuery(source), { wrapper: seasonQueryWrapper().wrapper });
    await waitFor(() => expect(result.current.rows).toEqual([row]));
    act(() => setSeasonStoreState({ matchingProgress: { [row.id]: { seasonId: 's', rowId: row.id, phase: 'name_matching', rawName: 'updated', matchStatus: 'matched', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0 } } }));
    expect(result.current.rows[0].rawName).toBe('updated');
  });
});
