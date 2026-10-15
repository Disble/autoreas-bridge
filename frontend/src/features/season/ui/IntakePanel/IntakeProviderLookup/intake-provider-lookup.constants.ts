import type { LookupModalCopy } from '../../../../../shared/ui/LookupModal/lookup-modal.types';
import type { ProviderLookupSnapshot } from './intake-provider-lookup.types';

/** Accessible name, tooltip and heading of the "Find on provider" action. */
export const PROVIDER_LOOKUP_TRIGGER_LABEL = 'Find on provider';

/** Every string the provider lookup hands the shared `LookupModal` shell. */
export const PROVIDER_LOOKUP_COPY: LookupModalCopy = {
  heading: PROVIDER_LOOKUP_TRIGGER_LABEL,
  searchLabel: 'Search providers',
  searchPlaceholder: 'Search providers...',
  loadingLabel: 'Searching providers...',
  errorTitle: 'Provider search failed',
  emptyTitle: (query) => `No provider pages for "${query}"`,
  emptyDescription: 'Try a shorter title or a different romanization in the search field above.',
  listLabel: 'Provider pages',
  confirmLabel: 'Use this page',
  cancelLabel: 'Cancel',
};

/**
 * The match statuses whose row has no page yet: not matched so far (a row
 * re-imported from Raw starts pending), or the matcher found nothing, could
 * not choose, or could not search.
 */
export const PROVIDER_LOOKUP_MATCH_STATUSES: ReadonlySet<string> = new Set(['pending', 'not_found', 'ambiguous', 'search_failed']);

/** Display labels of the providers the backend names; an unknown provider shows its raw name. */
export const PROVIDER_LABELS: Readonly<Record<string, string>> = { jkanime: 'JKAnime' };

/** The snapshot of a query that has not searched yet, or fell below the length floor. */
export const PROVIDER_LOOKUP_IDLE: ProviderLookupSnapshot = { state: 'idle', pages: [], errorMessage: '' };

/** The snapshot of a search in flight. */
export const PROVIDER_LOOKUP_LOADING: ProviderLookupSnapshot = { state: 'loading', pages: [], errorMessage: '' };
