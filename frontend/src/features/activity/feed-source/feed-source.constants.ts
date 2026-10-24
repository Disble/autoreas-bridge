import type { ActivityFeedSource } from './feed-source.types';

/** Module-local singleton container for the shared feed source. */
export const FEED_SOURCE_STATE: { sharedSource: ActivityFeedSource | null } = {
  sharedSource: null,
};
