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

  it.each([
    ['mount', true],
    ['never', false],
  ] as const)('maps the %s refresh to enabled %s', (refresh, enabled) => {
    expect(toSeasonQueryEnabled(refresh)).toBe(enabled);
  });

  it('enables a once read only while its entry holds no data', () => {
    const enabled = toSeasonQueryEnabled('once');

    expect(typeof enabled).toBe('function');
    const predicate = enabled as (query: { readonly state: { readonly data: unknown } }) => boolean;
    expect(predicate({ state: { data: undefined } })).toBe(true);
    expect(predicate({ state: { data: [] } })).toBe(false);
  });

  it.each([
    ['an error message', new Error('season is starting'), false, 'season is starting'],
    ['the fixed text', new Error('season is starting'), true, 'fallback'],
    ['the fallback for a non-Error', 'down', false, 'fallback'],
  ] as const)('shows %s on the banner', (_name, error, fixedMessage, expected) => {
    expect(toSeasonBannerMessage(error, { fallback: 'fallback', fixedMessage })).toBe(expected);
  });

  it.each([
    ['ok', undefined],
    ['already open', 'already open'],
    ['', 'fallback'],
  ])('runs a command answering %j', async (answer, failure) => {
    const run = runSeasonCommand(() => Promise.resolve(answer), 'fallback');

    await (failure === undefined ? expect(run).resolves.toBeUndefined() : expect(run).rejects.toThrow(failure));
  });

  it('settles a command whether it succeeded or failed', async () => {
    await expect(settleSeasonCommand(Promise.resolve('done'))).resolves.toBeUndefined();
    await expect(settleSeasonCommand(Promise.reject(new Error('down')))).resolves.toBeUndefined();
  });

  it.each<[string, PastSeasonReads]>([
    ['the season is pending', { ...LOADED, season: read({}) }],
    ['the rows are pending', { ...LOADED, animes: read({}) }],
    ['the season still shows the previous one', { ...LOADED, season: { ...LOADED.season, isPlaceholderData: true } }],
    ['the rows still show the previous ones', { ...LOADED, animes: { ...LOADED.animes, isPlaceholderData: true } }],
  ])('waits while %s', (_name, reads) => {
    expect(resolvePastSeasonLoad('old', reads)).toEqual({ kind: 'waiting' });
  });

  it.each<[string, PastSeasonReads, string]>([
    ['season', { ...LOADED, season: read({ status: 'error', error: new Error('season gone') }) }, 'season gone'],
    ['rows', { ...LOADED, animes: read({ status: 'error', error: new Error('rows gone') }) }, 'rows gone'],
    ['season without a message', { ...LOADED, season: read({ status: 'error', error: 'down' }) }, 'Failed to load season'],
  ])('reports a failed %s read', (_name, reads, errorMessage) => {
    expect(resolvePastSeasonLoad('old', reads)).toEqual({ kind: 'failed', errorMessage });
  });

  it('switches the view read-only once both loads succeeded, carrying no server data', () => {
    const outcome = resolvePastSeasonLoad('old', LOADED);

    // Only the view switches: the season and its rows stay in the query cache
    // the screens read them from, so the store never holds a stale copy.
    expect(outcome).toEqual({ kind: 'ready', state: { viewSeasonId: 'old', readOnly: true, errorMessage: undefined } });
  });
});
