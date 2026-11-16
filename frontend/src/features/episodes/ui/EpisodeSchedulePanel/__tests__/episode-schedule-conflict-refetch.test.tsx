import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/** HeroUI toast stub, hoisted so the HeroUI module mock can close over it. */
const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  danger: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@heroui/react', () => ({
  toast: toastMock,
}));

import { createEpisodesWrapper, createSource, scheduleItem } from './episode-schedule.test-support';
import { useEpisodeSchedulePanel } from '../use-episode-schedule-panel';

/**
 * The rows the Today schedule view renders, or none outside the ready state.
 * @param current The hook's current result.
 * @returns The rendered rows.
 */
function rowsOf(current: ReturnType<typeof useEpisodeSchedulePanel>) {
  return current.scheduleView.kind === 'ready' ? current.scheduleView.data : [];
}

describe('Today schedule write conflicts', () => {
  it('re-reads the schedule after a write answers a conflict, and shows the refreshed rows', async () => {
    // The write resolves with the episodes module's conflict outcome: the anime
    // changed since the board was read, so the day the user is looking at may
    // have moved. The panel treats it as committed and reads the schedule again.
    const adjustWatchedEpisodes = vi.fn().mockResolvedValue({ status: 'ok', outcome: 'conflict', message: 'anime-1 changed since the board was read', modifiedAt: 2000 });
    const getEpisodeSchedule = vi
      .fn()
      .mockResolvedValueOnce([scheduleItem('anime-1', { animeName: 'Frieren' })])
      .mockResolvedValueOnce([scheduleItem('anime-2', { animeName: 'Frieren II' })]);
    const { wrapper } = createEpisodesWrapper();

    const { result } = renderHook(
      () => useEpisodeSchedulePanel({ initialDay: 'Viernes', source: createSource({ adjustWatchedEpisodes, getEpisodeSchedule }) }),
      { wrapper },
    );
    await waitFor(() => expect(rowsOf(result.current)).toHaveLength(1));
    expect(rowsOf(result.current)[0]?.name).toBe('Frieren');

    await act(async () => {
      await result.current.adjustWatchedEpisodes('anime-1', 1, 1000);
    });

    expect(adjustWatchedEpisodes).toHaveBeenCalledWith('anime-1', 1, 1000);
    await waitFor(() => expect(getEpisodeSchedule).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(rowsOf(result.current)[0]?.name).toBe('Frieren II'));
  });
});
