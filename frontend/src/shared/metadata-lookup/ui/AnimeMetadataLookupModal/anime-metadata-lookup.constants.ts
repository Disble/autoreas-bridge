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
 * Shape shared by the real `AnimeMetadataLookupCandidate` row and its
 * `AnimeMetadataLookupCandidateSkeleton` placeholder, so the two cannot
 * drift apart silently (design D8, mirroring `CATALOG_LIST_ROW_CLASS`).
 */
export const METADATA_LOOKUP_CANDIDATE_ROW_CLASS =
  'min-h-14 h-auto flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-3 py-1.5 text-left transition-colors hover:bg-white/[0.04]';
