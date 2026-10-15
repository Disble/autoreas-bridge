import { SEASON_PROVIDER_SEARCH_UNAVAILABLE } from '../../../../../infrastructure/season-source/season-source.constants';
import type {
  SeasonProviderPage,
  SeasonProviderSearchResult,
} from '../../../../../infrastructure/season-source/season-source.types';
import { rankLookupCandidates } from '../../../../../shared/metadata-lookup/metadata-lookup.helpers';
import { PROVIDER_LABELS, PROVIDER_LOOKUP_MATCH_STATUSES } from './intake-provider-lookup.constants';
import type { ProviderLookupSnapshot, ProviderPageView, ProviderSearchPort } from './intake-provider-lookup.types';

/**
 * Whether a row's match status leaves it blocked on a page only the user can name.
 * @param matchStatus The row's match status.
 * @returns True for not found, ambiguous and search failed rows.
 */
export function canFindOnProvider(matchStatus: string): boolean {
  return PROVIDER_LOOKUP_MATCH_STATUSES.has(matchStatus);
}

/**
 * Searches the providers through the port, reading a port without the search
 * as unavailable rather than as a search that found nothing.
 * @param port The season port, whose provider search is optional.
 * @param query The normalized query.
 * @returns The provider search result.
 */
export function requestProviderSearch(port: ProviderSearchPort, query: string): Promise<SeasonProviderSearchResult> {
  return port.searchProviders?.(query) ?? Promise.resolve(SEASON_PROVIDER_SEARCH_UNAVAILABLE);
}

/**
 * Maps a settled provider search onto the lookup's snapshot: `ok` resolves
 * with its pages (possibly none), any other status is the failure's message.
 * @param result The provider search result.
 * @returns The resolved or failed snapshot.
 */
export function toProviderLookupSnapshot(result: SeasonProviderSearchResult): ProviderLookupSnapshot {
  if (result.status !== 'ok') {
    return { state: 'failed', pages: [], errorMessage: result.status };
  }
  return { state: 'resolved', pages: result.pages, errorMessage: '' };
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
