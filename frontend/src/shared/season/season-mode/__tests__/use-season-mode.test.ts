import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ModuleReadiness } from '../../../contracts/readiness.types';
import { createBridgeError } from '../../../query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../query/test-support/bridge-modules.test-support';
import { status } from '../../../query/test-support/readiness-source.test-support';
import { makeSeason } from '../../__tests__/season.test-support';
import { SEASON_CURRENT_KEY } from '../../season.constants';
import { toSeasonModeStatus } from '../season-mode.helpers';
import type { SeasonModeSource } from '../season-mode.types';
import { useSeasonMode } from '../use-season-mode';

/**
 * Renders the hook under a readiness gate reporting `season`.
 * @param source The season port.
 * @param season The season module's readiness.
 * @param enabled Whether the read runs.
 * @returns The hook result, the client and `emit`.
 */
function renderSeasonMode(source: SeasonModeSource, season: ModuleReadiness = status('season', 'ready'), enabled = true) {
  const { client, wrapper, emit } = createModulesTestWrapper(season);
  return { ...renderHook(() => useSeasonMode(source, enabled), { wrapper }), client, emit };
}

/** Lets pending promises and timers run. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

describe('useSeasonMode', () => {
  it('is pending without reading while the season module starts, then open once it is ready and a season is open', async () => {
    const source = { readSeason: vi.fn().mockResolvedValue(makeSeason()) };
    const { result, emit } = renderSeasonMode(source, status('season', 'starting'));

    await settle();
    expect(result.current).toBe('pending');
    expect(source.readSeason).not.toHaveBeenCalled();

    act(() => emit(status('season', 'ready')));

    await waitFor(() => expect(result.current).toBe('open'));
  });

  it('is closed when no season is open', async () => {
    const { result } = renderSeasonMode({ readSeason: vi.fn().mockResolvedValue(null) });

    await waitFor(() => expect(result.current).toBe('closed'));
  });

  it('is failed without reading when the season module failed', async () => {
    const source = { readSeason: vi.fn().mockResolvedValue(makeSeason()) };
    const { result } = renderSeasonMode(source, status('season', 'failed', 'season store unavailable'));

    await waitFor(() => expect(result.current).toBe('failed'));
    expect(source.readSeason).not.toHaveBeenCalled();
  });

  it('is failed when the season read rejects', async () => {
    const { result } = renderSeasonMode({ readSeason: vi.fn().mockRejectedValue(createBridgeError('internal', 'read failed')) });

    await waitFor(() => expect(result.current).toBe('failed'));
  });

  it('stays pending without reading while disabled', async () => {
    const source = { readSeason: vi.fn().mockResolvedValue(makeSeason()) };
    const { result } = renderSeasonMode(source, status('season', 'ready'), false);

    await settle();
    expect(result.current).toBe('pending');
    expect(source.readSeason).not.toHaveBeenCalled();
  });

  it('shares the open-season cache entry the Season screens read', async () => {
    const { client } = renderSeasonMode({ readSeason: vi.fn().mockResolvedValue(makeSeason()) });

    await waitFor(() => expect(client.getQueryData(SEASON_CURRENT_KEY)).toEqual(makeSeason()));
  });
});

describe('toSeasonModeStatus', () => {
  it('keeps the loaded season when a later read fails', () => {
    expect(toSeasonModeStatus({ data: makeSeason(), status: 'error' })).toBe('open');
    expect(toSeasonModeStatus({ data: null, status: 'error' })).toBe('closed');
  });

  it('reads a closed snapshot as closed', () => {
    expect(toSeasonModeStatus({ data: makeSeason({ status: 'closed' }), status: 'success' })).toBe('closed');
  });

  it('is pending while nothing loaded and nothing failed', () => {
    expect(toSeasonModeStatus({ data: undefined, status: 'pending' })).toBe('pending');
  });
});
