import type {
  SeasonProviderPage,
  SeasonProviderSearchResult,
} from '../../../../../shared/contracts/season.types';
import { meetsMinimumQueryLength, normalizeLookupQuery, rankLookupCandidates } from '../../../../../shared/metadata-lookup/metadata-lookup.helpers';
import { toAsyncView } from '../../../../../shared/query/async-view/async-view.helpers';
import {
  PROVIDER_LABELS,
  PROVIDER_LOOKUP_IDLE,
  PROVIDER_LOOKUP_LOADING,
  PROVIDER_LOOKUP_MATCH_STATUSES,
} from './intake-provider-lookup.constants';
import type {
  ProviderLookupSnapshot,
  ProviderPageView,
  ProviderSearchPort,
  ProviderSearchRead,
  ProviderSearchRequest,
} from './intake-provider-lookup.types';

/**
 * Whether a row's match status leaves it blocked on a page only the user can name.
 * @param matchStatus The row's match status.
 * @returns True for not found, ambiguous and search failed rows.
 */
export function canFindOnProvider(matchStatus: string): boolean {
  return PROVIDER_LOOKUP_MATCH_STATUSES.has(matchStatus);
}

/**
 * Searches the providers through the port's query read. A port without that
 * read rejects, so the lookup reports a failure, never a search that found nothing.
 * @param port The season port, whose provider search read is optional.
 * @param query The normalized query.
 * @returns The provider search result.
 */
export function fetchProviderSearch(port: ProviderSearchPort, query: string): Promise<SeasonProviderSearchResult> {
  return port.fetchProviderSearch?.(query) ?? Promise.reject(new Error('the season source cannot search the providers'));
}

/**
 * The search a settled debounce starts: the normalized query under the next
 * sequence number, so it supersedes every earlier search, the same query included.
 * @param current The latest search.
 * @param raw The query as the user typed it.
 * @returns The new search.
 */
export function nextProviderSearch(current: ProviderSearchRequest, raw: string): ProviderSearchRequest {
  return { query: normalizeLookupQuery(raw), seq: current.seq + 1 };
}

/**
 * Maps the lookup's search onto its snapshot: a query below the length floor
 * is idle; a search in flight, waiting for the season module, or still showing
 * the previous search's pages is loading; a rejected one carries its message;
 * a settled one its pages, possibly none.
 * @param query The searched normalized query.
 * @param read The search query's result.
 * @returns The idle, loading, failed or resolved snapshot.
 */
export function toProviderLookupSnapshot(query: string, read: ProviderSearchRead): ProviderLookupSnapshot {
  if (!meetsMinimumQueryLength(query)) {
    return PROVIDER_LOOKUP_IDLE;
  }
  const view = read.isPlaceholderData ? null : toAsyncView(read);
  if (view?.kind === 'failure') {
    return { state: 'failed', pages: [], errorMessage: view.message };
  }
  if (view?.kind === 'ready') {
    return { state: 'resolved', pages: view.data.pages, errorMessage: '' };
  }
  return PROVIDER_LOOKUP_LOADING;
}

/**
 * Describes where a page lives: its provider's label and its URL without the scheme.
 * @param page The provider page.
 * @returns The candidate row's subtitle.
 */
function formatProviderPageSubtitle(page: SeasonProviderPage): string {
  const label = PROVIDER_LABELS[page.provider] ?? page.provider;
  return `${label} · ${page.pageUrl.replace(/^https?:\/\//, '')}`;
}

/**
 * Ranks the pages by title against the typed query and shapes each into a
 * candidate row, marking the one the user highlighted.
 * @param pages The pages in the providers' own order.
 * @param query The query the user typed.
 * @param selectedPageUrl The highlighted page's URL, or null.
 * @returns The rows, most similar title first.
 */
export function toProviderPageViews(
  pages: readonly SeasonProviderPage[],
  query: string,
  selectedPageUrl: string | null,
): readonly ProviderPageView[] {
  return rankLookupCandidates(pages, query, (page) => page.title).map((page) => ({
    pageUrl: page.pageUrl,
    title: page.title,
    subtitle: formatProviderPageSubtitle(page),
    image: page.imageUrl || undefined,
    isSelected: page.pageUrl === selectedPageUrl,
  }));
}
