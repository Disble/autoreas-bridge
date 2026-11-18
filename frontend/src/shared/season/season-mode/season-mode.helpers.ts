import { isSeasonOpen } from '../../store/season-store/season-store.helpers';
import type { SeasonModeQueryState, SeasonModeStatus } from './season-mode.types';

/**
 * Derives season mode from the open-season query: an answer decides it, even
 * when a later refetch failed; a failure before any answer is `failed`; and
 * anything else is still `pending`.
 * @param query The open-season query result.
 * @returns The season mode status.
 */
export function toSeasonModeStatus(query: SeasonModeQueryState): SeasonModeStatus {
  if (query.data !== undefined) {
    return isSeasonOpen(query.data) ? 'open' : 'closed';
  }
  return query.status === 'error' ? 'failed' : 'pending';
}
