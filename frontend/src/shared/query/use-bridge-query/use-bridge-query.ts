import { keepPreviousData, useQuery, type QueryKey, type UseQueryResult } from '@tanstack/react-query';
import { useContext } from 'react';

import type { BridgeError } from '../bridge-error/bridge-error.types';
import { ReadinessGateContext } from '../readiness-gate/readiness-gate-context';
import { runGatedQuery } from '../readiness-gate/readiness-gate.helpers';
import { withGatedModule } from './use-bridge-query.helpers';
import type { BridgeQueryOptions } from './use-bridge-query.types';

/**
 * Reads backend data through TanStack Query with the Bridge defaults
 * (ADR-032 §4). With `module`, the query stays pending (no binding call) while
 * that module starts and fails with `failed_precondition` once it failed; when
 * it ended in error before its module settled, the provider re-runs it then. On a
 * key change the previous data stays shown (`isPlaceholderData`) until the next
 * key loads. Hooks pass the result to `toAsyncView`; `.tsx` files render that.
 */
export function useBridgeQuery<TData, TKey extends QueryKey = QueryKey>(
  options: BridgeQueryOptions<TData, TKey>,
): UseQueryResult<TData, BridgeError> {
  // 3. Context/3rd Party Hooks
  const readinessGate = useContext(ReadinessGateContext);

  // 4. Queries/Mutations
  const { module, queryFn, ...queryOptions } = options;
  return useQuery<TData, BridgeError, TData, TKey>({
    ...queryOptions,
    meta: withGatedModule(queryOptions.meta, module),
    queryFn: ({ signal }) => runGatedQuery(readinessGate, module, () => queryFn({ signal }), signal),
    placeholderData: keepPreviousData,
  });
}
