import type { SeasonAnimeRow, SeasonQuerySource, SeasonSnapshot } from '../contracts/season.types';
import { SEASON_ANIMES_KEY, seasonKeys } from '../query/query-keys/query-keys.constants';
import { SEASON_COMMAND_SUCCEEDED, SEASON_CURRENT_KEY, SEASON_LOAD_FAILED } from './season.constants';
import type {
  PastSeasonLoadOutcome,
  PastSeasonReads,
  SeasonBannerPolicy,
  SeasonQueryEnabled,
  SeasonQueryRefresh,
  SeasonRead,
  SeasonQueryState,
} from './season.types';

/**
 * The read of the season a screen shows: the open season while `viewSeasonId`
 * is null, otherwise that past season, which never changes and so never goes stale.
 * @param source The port the read goes through.
 * @param viewSeasonId The past season being viewed, or null for the live one.
 * @returns The read's key, fetcher and staleness.
 */
export function displayedSeasonRead(source: SeasonQuerySource, viewSeasonId: string | null): SeasonRead<SeasonSnapshot | null> {
  if (viewSeasonId === null) {
    return { queryKey: SEASON_CURRENT_KEY, queryFn: () => source.readSeason(), staleTime: 0 };
  }
  return {
    queryKey: seasonKeys.key('past', viewSeasonId),
    queryFn: () => source.readPastSeason(viewSeasonId),
    staleTime: Number.POSITIVE_INFINITY,
  };
}

/**
 * The read of the intake rows a screen shows: the open season's rows while
 * `viewSeasonId` is null, otherwise that past season's rows, which never go stale.
 * @param source The port the read goes through.
 * @param viewSeasonId The past season being viewed, or null for the live one.
 * @returns The read's key, fetcher and staleness.
 */
export function displayedSeasonAnimesRead(source: SeasonQuerySource, viewSeasonId: string | null): SeasonRead<readonly SeasonAnimeRow[]> {
  if (viewSeasonId === null) {
    return { queryKey: SEASON_ANIMES_KEY, queryFn: () => source.readSeasonAnimes(), staleTime: 0 };
  }
  return {
    queryKey: seasonKeys.key('past-animes', viewSeasonId),
    queryFn: () => source.readPastSeasonAnimes(viewSeasonId),
    staleTime: Number.POSITIVE_INFINITY,
  };
}

/**
 * Whether a cache entry holds nothing yet, the `once` refresh's predicate.
 * @param query The query being decided.
 * @returns True while the entry has no data.
 */
function hasNoSeasonData(query: SeasonQueryState): boolean {
  return query.state.data === undefined;
}

/**
 * Maps a refresh policy onto the `enabled` option of its read.
 * @param refresh When the read fetches.
 * @returns `true` for `mount`, the nothing-cached predicate for `once`, `false` for `never`.
 */
export function toSeasonQueryEnabled(refresh: SeasonQueryRefresh): SeasonQueryEnabled {
  if (refresh === 'mount') {
    return true;
  }
  return refresh === 'once' ? hasNoSeasonData : false;
}

/**
 * The banner text of a failed read or command.
 * @param error What the read or the command failed with.
 * @param policy How the failure reaches the banner.
 * @returns The failure's message, or the policy's fallback when it is fixed or the failure is no `Error`.
 */
export function toSeasonBannerMessage(error: unknown, policy: Pick<SeasonBannerPolicy, 'fallback' | 'fixedMessage'>): string {
  if (policy.fixedMessage || !(error instanceof Error)) {
    return policy.fallback;
  }
  return error.message;
}

/**
 * Runs a season command that answers a status string, failing on any status
 * but `ok` so the mutation reports it: an empty status fails with `fallback`.
 * @param command The source call.
 * @param fallback The failure text for an empty status.
 * @returns Nothing once the command succeeded.
 */
export async function runSeasonCommand(command: () => Promise<string>, fallback: string): Promise<void> {
  const status = await command();
  if (status !== SEASON_COMMAND_SUCCEEDED) {
    throw new Error(status || fallback);
  }
}

/**
 * Settles a season command without its failure, which its mutation already
 * showed on the banner, so a caller may await it.
 * @param command The running command.
 * @returns A promise that resolves once the command settled.
 */
export function settleSeasonCommand(command: Promise<unknown>): Promise<void> {
  return command.then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Decides what the past-season view does with its two reads: wait while
 * either is unresolved or still showing the previous season's data, report
 * the first failure, or switch the view. Only the view switches: the past
 * season and its rows stay in the query cache the screens read them from, so
 * the swap happens once and no copy of them is left behind.
 * @param seasonId The past season being loaded.
 * @param reads The past season's two reads.
 * @returns The next step.
 */
export function resolvePastSeasonLoad(seasonId: string, reads: PastSeasonReads): PastSeasonLoadOutcome {
  const failed = [reads.season, reads.animes].find((read) => read.status === 'error');
  if (failed !== undefined) {
    return { kind: 'failed', errorMessage: toSeasonBannerMessage(failed.error, { fallback: SEASON_LOAD_FAILED, fixedMessage: false }) };
  }
  const { season, animes } = reads;
  if (season.status !== 'success' || animes.status !== 'success' || season.isPlaceholderData || animes.isPlaceholderData) {
    return { kind: 'waiting' };
  }
  return {
    kind: 'ready',
    state: { viewSeasonId: seasonId, readOnly: true, errorMessage: undefined },
  };
}
