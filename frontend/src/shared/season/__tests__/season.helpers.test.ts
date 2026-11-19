import { describe, expect, it, vi } from 'vitest';
import {
  displayedSeasonAnimesRead,
  displayedSeasonRead,
  resolvePastSeasonLoad,
  runSeasonCommand,
  settleSeasonCommand,
  toSeasonBannerMessage,
  toSeasonQueryEnabled,
} from '../season.helpers';
import type { PastSeasonReads, SeasonPendingRead } from '../season.types';
import { createSeasonDataSource, makeSeason, makeSeasonRow } from './season.test-support';

/**
 * Builds one past-season read state, overriding only what a case sets.
 * @param overrides The fields a case sets.
 * @returns The read state.
 */
function read<TData>(overrides: Partial<SeasonPendingRead<TData>>): SeasonPendingRead<TData> {
  return { status: 'pending', data: undefined, error: null, isPlaceholderData: false, ...overrides };
}

/** A loaded past season and its rows. */
const LOADED: PastSeasonReads = {
  season: read({ status: 'success', data: makeSeason({ id: 'old', status: 'closed' }) }),
  animes: read({ status: 'success', data: [makeSeasonRow()] }),
};

describe('season.helpers', () => {
  it('reads the open season while no past season is viewed, staying fresh for no time', async () => {
    const source = createSeasonDataSource({ readSeason: vi.fn().mockResolvedValue(makeSeason()) });
    const live = displayedSeasonRead(source, null);

    expect(live.queryKey).toEqual(['season', 'current']);
    expect(live.staleTime).toBe(0);
    await expect(live.queryFn()).resolves.toEqual(makeSeason());
  });

  it('reads the viewed past season by id, which never goes stale', async () => {
    const source = createSeasonDataSource({ readPastSeason: vi.fn().mockResolvedValue(makeSeason({ id: 'old' })) });
    const past = displayedSeasonRead(source, 'old');

    expect(past.queryKey).toEqual(['season', 'past', 'old']);
    expect(past.staleTime).toBe(Number.POSITIVE_INFINITY);
    await expect(past.queryFn()).resolves.toEqual(makeSeason({ id: 'old' }));
    expect(source.readPastSeason).toHaveBeenCalledExactlyOnceWith('old');
  });

  it('reads the open season rows live and a past season rows by id', async () => {
    const rows = [makeSeasonRow()];
    const source = createSeasonDataSource({ readSeasonAnimes: vi.fn().mockResolvedValue(rows), readPastSeasonAnimes: vi.fn().mockResolvedValue(rows) });
    const live = displayedSeasonAnimesRead(source, null);
    const past = displayedSeasonAnimesRead(source, 'old');

    expect([live.queryKey, live.staleTime]).toEqual([['season', 'animes'], 0]);
    expect([past.queryKey, past.staleTime]).toEqual([['season', 'past-animes', 'old'], Number.POSITIVE_INFINITY]);
    await expect(live.queryFn()).resolves.toBe(rows);
    await expect(past.queryFn()).resolves.toBe(rows);
    expect(source.readPastSeasonAnimes).toHaveBeenCalledExactlyOnceWith('old');
  });

  it('maps each refresh mode to its enabled value, a once read enabled only while its entry holds no data', () => {
    expect.soft(toSeasonQueryEnabled('mount'), 'mount').toBe(true);
    expect.soft(toSeasonQueryEnabled('never'), 'never').toBe(false);

    const enabled = toSeasonQueryEnabled('once');

    expect(typeof enabled).toBe('function');
    const predicate = enabled as (query: { readonly state: { readonly data: unknown } }) => boolean;
    expect.soft(predicate({ state: { data: undefined } }), 'once: no data').toBe(true);
    expect.soft(predicate({ state: { data: [] } }), 'once: data').toBe(false);
  });

  it('shows the error message, the fixed text or the fallback on the banner', () => {
    const cases: ReadonlyArray<readonly [string, unknown, boolean, string]> = [
      ['an error message', new Error('season is starting'), false, 'season is starting'],
      ['the fixed text', new Error('season is starting'), true, 'fallback'],
      ['the fallback for a non-Error', 'down', false, 'fallback'],
    ];
    for (const [name, error, fixedMessage, expected] of cases) {
      expect.soft(toSeasonBannerMessage(error, { fallback: 'fallback', fixedMessage }), name).toBe(expected);
    }
  });

  it('resolves a command answering ok and rejects any other answer with it or the fallback', async () => {
    expect.soft(await runSeasonCommand(() => Promise.resolve('ok'), 'fallback').then(() => 'resolved', String), 'ok').toBe('resolved');
    await expect.soft(runSeasonCommand(() => Promise.resolve('already open'), 'fallback'), 'already open').rejects.toThrow('already open');
    await expect.soft(runSeasonCommand(() => Promise.resolve(''), 'fallback'), 'empty answer').rejects.toThrow('fallback');
  });

  it('settles a command whether it succeeded or failed', async () => {
    await expect(settleSeasonCommand(Promise.resolve('done'))).resolves.toBeUndefined();
    await expect(settleSeasonCommand(Promise.reject(new Error('down')))).resolves.toBeUndefined();
  });

  it('waits on a pending or placeholder read, reports a failed one and switches read-only once both loaded', () => {
    const cases: ReadonlyArray<readonly [string, PastSeasonReads, unknown]> = [
      ['the season is pending', { ...LOADED, season: read({}) }, { kind: 'waiting' }],
      ['the rows are pending', { ...LOADED, animes: read({}) }, { kind: 'waiting' }],
      ['the season still shows the previous one', { ...LOADED, season: { ...LOADED.season, isPlaceholderData: true } }, { kind: 'waiting' }],
      ['the rows still show the previous ones', { ...LOADED, animes: { ...LOADED.animes, isPlaceholderData: true } }, { kind: 'waiting' }],
      ['failed season read', { ...LOADED, season: read({ status: 'error', error: new Error('season gone') }) }, { kind: 'failed', errorMessage: 'season gone' }],
      ['failed rows read', { ...LOADED, animes: read({ status: 'error', error: new Error('rows gone') }) }, { kind: 'failed', errorMessage: 'rows gone' }],
      ['failed season read without a message', { ...LOADED, season: read({ status: 'error', error: 'down' }) }, { kind: 'failed', errorMessage: 'Failed to load season' }],
      // Only the view switches: the season and its rows stay in the query cache
      // the screens read them from, so the store never holds a stale copy.
      ['both loads succeeded', LOADED, { kind: 'ready', state: { viewSeasonId: 'old', readOnly: true, errorMessage: undefined } }],
    ];
    for (const [name, reads, expected] of cases) {
      expect.soft(resolvePastSeasonLoad('old', reads), name).toEqual(expected);
    }
  });
});
