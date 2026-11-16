import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSeasonStoreState, resetSeasonStore, setSeasonStoreState } from '../../store/season-store/season-store.helpers';
import { useDisplayedSeason } from '../use-displayed-season';
import { useDisplayedSeasonAnimes } from '../use-displayed-season-animes';
import { usePastSeasonView } from '../use-past-season-view';
import { useSeasonLifecycleCommands } from '../use-season-lifecycle-commands';
import { createSeasonDataSource, makeSeason, makeSeasonRow, seasonQueryWrapper } from './season.test-support';
import type { SeasonDataSource } from '../season.types';

/**
 * Renders the commands and the past-season view next to a reader of the displayed season.
 * @param source The port everything goes through.
 * @returns The render result.
 */
function renderSeason(source: SeasonDataSource) {
  return renderHook(
    () => ({
      season: useDisplayedSeason({ refresh: 'mount', source }),
      animes: useDisplayedSeasonAnimes({ refresh: 'mount', source }),
      commands: useSeasonLifecycleCommands(source),
      pastView: usePastSeasonView(source),
    }),
    { wrapper: seasonQueryWrapper().wrapper },
  );
}

describe('useSeasonLifecycleCommands', () => {
  afterEach(() => resetSeasonStore());

  it.each([
    ['createSeason', (source: SeasonDataSource) => source.createSeason, ['Julio 2026']],
    ['closeSeason', (source: SeasonDataSource) => source.closeSeason, []],
  ] as const)('%s clears the banner and resolves after the season was read again', async (name, command, args) => {
    const readSeason = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(makeSeason());
    const source = createSeasonDataSource({ readSeason });
    setSeasonStoreState({ errorMessage: 'earlier failure' });
    const { result } = renderSeason(source);
    await waitFor(() => expect(result.current.season.data).toBeNull());

    await act(() => (name === 'createSeason' ? result.current.commands.createSeason('Julio 2026') : result.current.commands.closeSeason()));

    expect(command(source)).toHaveBeenCalledExactlyOnceWith(...args);
    expect(readSeason).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.season.data).toEqual(makeSeason()));
    expect(getSeasonStoreState().errorMessage).toBeUndefined();
  });

  it.each([
    ['a refused create shows its status', { createSeason: vi.fn().mockResolvedValue('already open') }, 'create', 'already open'],
    ['an empty create status shows the fallback', { createSeason: vi.fn().mockResolvedValue('') }, 'create', 'Failed to create season'],
    ['a failed close shows its message', { closeSeason: vi.fn().mockRejectedValue(new Error('store closed')) }, 'close', 'store closed'],
    ['an empty close status shows the fallback', { closeSeason: vi.fn().mockResolvedValue('') }, 'close', 'Failed to close season'],
    ['a create rejected with a non-error shows the fallback', { createSeason: vi.fn().mockRejectedValue('offline') }, 'create', 'Failed to create season'],
    ['a close rejected with a non-error shows the fallback', { closeSeason: vi.fn().mockRejectedValue('offline') }, 'close', 'Failed to close season'],
  ] as const)('%s on the banner without reading the season again', async (_name, overrides, run, banner) => {
    const source = createSeasonDataSource(overrides);
    const { result } = renderSeason(source);
    await waitFor(() => expect(result.current.season.data).toBeNull());

    await act(() => (run === 'create' ? result.current.commands.createSeason('Julio 2026') : result.current.commands.closeSeason()));

    expect(getSeasonStoreState().errorMessage).toBe(banner);
    expect(source.readSeason).toHaveBeenCalledTimes(1);
  });
});

describe('commands and past view without a season reader', () => {
  afterEach(() => resetSeasonStore());

  it('read nothing until a command or a past view runs', async () => {
    const source = createSeasonDataSource();
    renderHook(() => ({ commands: useSeasonLifecycleCommands(source), pastView: usePastSeasonView(source) }), { wrapper: seasonQueryWrapper().wrapper });

    await act(async () => undefined);
    expect(source.readSeason).not.toHaveBeenCalled();
    expect(source.readPastSeason).not.toHaveBeenCalled();
  });
});

describe('usePastSeasonView', () => {
  afterEach(() => resetSeasonStore());

  it('switches to the past season only once both reads loaded, with no loading in between', async () => {
    let answerRows: (rows: ReturnType<typeof makeSeasonRow>[]) => void = () => undefined;
    const past = makeSeason({ id: 'old', status: 'closed' });
    const source = createSeasonDataSource({
      readPastSeason: vi.fn().mockResolvedValue(past),
      readPastSeasonAnimes: vi.fn().mockReturnValue(new Promise((resolve) => (answerRows = resolve))),
    });
    setSeasonStoreState({ errorMessage: 'earlier failure' });
    const { result } = renderSeason(source);
    await waitFor(() => expect(result.current.season.data).toBeNull());

    act(() => result.current.pastView.viewPastSeason('old'));
    await waitFor(() => expect(source.readPastSeason).toHaveBeenCalledExactlyOnceWith('old'));
    expect(getSeasonStoreState().viewSeasonId).toBeNull();
    expect(result.current.season.status).toBe('success');

    await act(async () => answerRows([makeSeasonRow({ id: 'past-row' })]));

    await waitFor(() => expect(getSeasonStoreState().viewSeasonId).toBe('old'));
    // The past season and its rows come from the reads the view is keyed on,
    // and the store switches once: it holds no copy of either.
    expect(result.current.season.data).toEqual(past);
    expect(result.current.animes.data?.map((row: { id: string }) => row.id)).toEqual(['past-row']);
    expect(getSeasonStoreState()).toMatchObject({ readOnly: true, errorMessage: undefined });
    expect(source.readPastSeason).toHaveBeenCalledTimes(1);
  });

  it('stays on the live view and shows the failure when a past read fails', async () => {
    const source = createSeasonDataSource({ readPastSeasonAnimes: vi.fn().mockRejectedValue(new Error('rows gone')) });
    const { result } = renderSeason(source);
    await waitFor(() => expect(result.current.season.data).toBeNull());

    act(() => result.current.pastView.viewPastSeason('old'));

    await waitFor(() => expect(getSeasonStoreState().errorMessage).toBe('rows gone'));
    expect(getSeasonStoreState()).toMatchObject({ viewSeasonId: null, readOnly: false });
  });

  it('returns to the live season and reads it again', async () => {
    const readSeason = vi.fn().mockResolvedValue(null);
    const source = createSeasonDataSource({ readSeason });
    setSeasonStoreState({ viewSeasonId: 'old', readOnly: true });
    const { result } = renderSeason(source);

    await act(() => result.current.pastView.exitPastSeason());

    expect(getSeasonStoreState()).toMatchObject({ viewSeasonId: null, readOnly: false });
    expect(readSeason).toHaveBeenCalled();
    await waitFor(() => expect(result.current.season.data).toBeNull());
  });

  /**
   * Guards the stale-read drop: the view is keyed by the season being loaded, so
   * a read that settles after the user moved on answers a season nobody views.
   * It must not switch the view nor replace the rows on screen.
   */
  it('drops a past read that settles after the viewed season changed', async () => {
    let answerOlderRows: (rows: ReturnType<typeof makeSeasonRow>[]) => void = () => undefined;
    const source = createSeasonDataSource({
      readPastSeason: vi.fn((seasonId: string) => Promise.resolve(makeSeason({ id: seasonId, status: 'closed' }))),
      readPastSeasonAnimes: vi.fn((seasonId: string): Promise<ReturnType<typeof makeSeasonRow>[]> =>
        seasonId === 'older'
          ? new Promise<ReturnType<typeof makeSeasonRow>[]>((resolve) => (answerOlderRows = resolve))
          : Promise.resolve([makeSeasonRow({ id: 'newer-row' })]),
      ),
    });
    const { result } = renderSeason(source);
    await waitFor(() => expect(result.current.season.data).toBeNull());

    act(() => result.current.pastView.viewPastSeason('older'));
    act(() => result.current.pastView.viewPastSeason('newer'));
    await waitFor(() => expect(getSeasonStoreState().viewSeasonId).toBe('newer'));

    await act(async () => answerOlderRows([makeSeasonRow({ id: 'older-row' })]));

    expect(getSeasonStoreState().viewSeasonId).toBe('newer');
    expect(result.current.animes.data?.map((row: { id: string }) => row.id)).toEqual(['newer-row']);
    expect(result.current.season.data).toEqual(makeSeason({ id: 'newer', status: 'closed' }));
  });

  /**
   * Guards that a viewed past season is never refreshed live: its reads are
   * cache-only, so no background read can replace what history shows.
   */
  it('never reads the live season or its rows again while a past season is viewed', async () => {
    const readSeason = vi.fn().mockResolvedValue(null);
    const source = createSeasonDataSource({
      readSeason,
      readPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 'old', status: 'closed' })),
      readPastSeasonAnimes: vi.fn().mockResolvedValue([makeSeasonRow({ id: 'past-row' })]),
    });
    const first = renderSeason(source);
    await waitFor(() => expect(first.result.current.season.data).toBeNull());
    act(() => first.result.current.pastView.viewPastSeason('old'));
    await waitFor(() => expect(getSeasonStoreState().viewSeasonId).toBe('old'));
    const liveSeasonReads = readSeason.mock.calls.length;
    first.unmount();

    const second = renderSeason(source);
    await waitFor(() => expect(second.result.current.season.data).toEqual(makeSeason({ id: 'old', status: 'closed' })));

    // Both readers are keyed on the viewed season, so no mount while viewing can
    // refresh the live season the user is not looking at.
    expect(readSeason).toHaveBeenCalledTimes(liveSeasonReads);
    expect(second.result.current.animes.data?.[0]?.id).toBe('past-row');
  });
});
