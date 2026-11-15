import { useCallback } from 'react';
import type { DownloadsSource } from '../../../../shared/contracts/download.types';
import { toErrorMessage } from '../../../../shared/helpers/error-message.helpers';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_DOWNLOADS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { downloadsKeys } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';

/**
 * useJDLimitsPanel reads JDownloader's "Max. simultaneous Downloads" setting for display.
 *
 * The reading is read-only by necessity, not by preference: changing the setting requires
 * the MyJDownloader `/config/set` endpoint, which the client does not implement yet.
 *
 * The backend reports 0 when it could not read the setting at all. That is an absent
 * reading, not a configured limit, so it is exposed as `isAvailable: false` rather than as
 * the number 0 — which would tell the user JDownloader downloads nothing. The setting is
 * read through the always-ready shell handle, so the query waits on no module.
 *
 * @param source The downloads port the setting is read through.
 * @returns The panel state and its refresh action.
 */
export function useJDLimitsPanel(source: DownloadsSource = BRIDGE_DOWNLOADS_SOURCE) {
  // 4. Queries/Mutations
  const limitQuery = useBridgeQuery({
    queryKey: downloadsKeys.key('jd-max-simultaneous-downloads'),
    queryFn: () => source.getJDMaxSimultaneousDownloads(),
  });

  // 5. Derived State (useMemo)
  const limitView = toAsyncView(limitQuery, () => false);
  const maxSimultaneousDownloads = limitQuery.data ?? 0;
  const isAvailable = maxSimultaneousDownloads > 0;
  const errorMessage = limitView.kind === 'failure' ? toErrorMessage(limitQuery.error, 'Failed to read the JDownloader download limit') : undefined;
  let status: 'loading' | 'error' | 'ready' = 'ready';
  if (limitView.kind === 'loading') {
    status = 'loading';
  } else if (limitView.kind === 'failure') {
    status = 'error';
  }
  const { refetch } = limitQuery;

  // 6. Callbacks (useCallback calling pure helpers)
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    status,
    maxSimultaneousDownloads,
    isAvailable,
    isRefreshing: limitQuery.isFetching,
    errorMessage,
    refresh,
  };
}
