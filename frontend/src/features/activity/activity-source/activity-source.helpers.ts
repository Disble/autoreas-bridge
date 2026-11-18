import type { ActivitySource } from '../../../shared/contracts/activity.types';
import { BRIDGE_ACTIVITY_SOURCE } from '../../../shared/query/bridge-runtime/bridge-runtime.constants';

/**
 * The shared Activity source, as `src/app/routes/DownloadsRoute.tsx` hands the
 * run history its run story. Activity's own hooks read `BRIDGE_ACTIVITY_SOURCE`
 * directly; this stays for the downloads consumer until its slice migrates.
 *
 * @returns The shared source.
 */
export function createActivitySource(): ActivitySource {
  return BRIDGE_ACTIVITY_SOURCE;
}
