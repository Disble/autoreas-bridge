import type { LookupModalCopy } from '../../../ui/LookupModal/lookup-modal.types';

/**
 * Accessible name of the "Fetch metadata" action (`anime-metadata-autofill`
 * spec, "Fetch-metadata action availability"). One constant so Create and
 * Editor cannot drift into two different wordings for the same action.
 */
export const METADATA_LOOKUP_TRIGGER_LABEL = 'Fetch metadata';

/**
 * Accessible name of the loading status region, announced while a search
 * request is in flight (design D8).
 */
export const METADATA_LOOKUP_LOADING_LABEL = 'Searching MyAnimeList...';

/**
 * Heading of the alert shown when a search or a confirm fetch fails. Reads
 * as what actually happened -- MyAnimeList's own markup changed -- never as
 * a generic error (design D4's outcome table names the failing anchor in
 * the message this heading sits above).
 */
export const METADATA_LOOKUP_ERROR_TITLE = 'MyAnimeList changed its page';

/**
 * Label of the primary action that confirms the highlighted candidate and
 * fetches its detail page.
 */
export const METADATA_LOOKUP_CONFIRM_LABEL = 'Use this match';

/**
 * Label of the action that closes the modal without applying anything
 * (`anime-metadata-autofill` spec, "Cancel leaves the form unchanged").
 */
export const METADATA_LOOKUP_CANCEL_LABEL = 'Cancel';

/**
 * Every string the MyAnimeList lookup hands the shared `LookupModal` shell,
 * composed from the named constants above so tests and sibling features keep
 * importing those.
 */
export const METADATA_LOOKUP_COPY: LookupModalCopy = {
  heading: METADATA_LOOKUP_TRIGGER_LABEL,
  searchLabel: 'Search MyAnimeList',
  searchPlaceholder: 'Search MyAnimeList...',
  loadingLabel: METADATA_LOOKUP_LOADING_LABEL,
  errorTitle: METADATA_LOOKUP_ERROR_TITLE,
  emptyTitle: (query) => `No MyAnimeList matches for "${query}"`,
  emptyDescription: 'Try a shorter title or a different romanization in the search field above.',
  listLabel: 'MyAnimeList candidates',
  confirmLabel: METADATA_LOOKUP_CONFIRM_LABEL,
  cancelLabel: METADATA_LOOKUP_CANCEL_LABEL,
};
