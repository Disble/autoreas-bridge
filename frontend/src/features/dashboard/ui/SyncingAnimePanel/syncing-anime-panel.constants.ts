/** Panel title shown above the syncing-anime list. */
export const SYNCING_ANIME_PANEL_TITLE = 'Syncing Now';
/** Panel subtitle explaining the source of the list. */
export const SYNCING_ANIME_PANEL_DESCRIPTION = 'Anime entries still pending reconciliation in the bridge queue.';
/** Empty-state headline when the pending queue is empty. */
export const SYNCING_ANIME_PANEL_EMPTY_TITLE = 'Nothing is syncing right now.';
/** Empty-state explanation of what will appear in the panel. */
export const SYNCING_ANIME_PANEL_EMPTY_DESCRIPTION = 'When pending anime changes exist, they will appear here with their latest progress snapshot.';
/** Accessible name for the status region announced while the queue is loading. */
export const SYNCING_ANIME_PANEL_LOADING_LABEL = 'Loading pending anime queue...';
/**
 * Shared class for a single syncing-anime card, used by both the resolved
 * card grid and `SyncingAnimeSkeleton`'s placeholder cards so the two
 * shapes cannot drift apart. The resolved-only hover state is applied by
 * its caller.
 */
export const SYNCING_ANIME_PANEL_CARD_CLASS = 'rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4';
/** Number of placeholder cards rendered while the queue is loading. */
export const SYNCING_ANIME_PANEL_SKELETON_CARD_COUNT = 4;
