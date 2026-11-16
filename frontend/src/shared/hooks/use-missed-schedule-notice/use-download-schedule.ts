import type { DownloadsSource } from '../../contracts/download.types';
import { BRIDGE_DOWNLOADS_SOURCE } from '../../query/bridge-runtime/bridge-runtime.constants';
import { DOWNLOADS_SCHEDULE_KEY } from '../../query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../query/use-bridge-query/use-bridge-query';

/**
 * Reads the downloads module's schedule config, the one copy the Downloads
 * schedule panel, the missed-day notice and the Daily board's auto-download
 * chip share. Run events and a settled missed day re-read it through
 * `BRIDGE_INVALIDATIONS`; a re-read cancels the one in flight, so the latest
 * read's answer is the one shown.
 *
 * @param source The downloads port the schedule is read through.
 * @returns The schedule query.
 */
export function useDownloadSchedule(source: DownloadsSource = BRIDGE_DOWNLOADS_SOURCE) {
  // 4. Queries/Mutations
  return useBridgeQuery({
    queryKey: DOWNLOADS_SCHEDULE_KEY,
    queryFn: () => source.getScheduleConfig(),
    module: 'downloads',
  });
}
