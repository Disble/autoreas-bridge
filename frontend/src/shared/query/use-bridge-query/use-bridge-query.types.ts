import type { QueryKey, UseQueryOptions } from '@tanstack/react-query';

import type { ModuleId } from '../../contracts/readiness.types';
import type { BridgeError } from '../bridge-error/bridge-error.types';

/** What a `useBridgeQuery` fetcher receives: the signal that aborts on unmount. */
export interface BridgeQueryContext {
  readonly signal: AbortSignal;
}

/**
 * `useBridgeQuery` options. `queryFn` calls a source port method (which rejects
 * with a `BridgeError`); `module` keeps the query pending, without calling
 * `queryFn`, until that backend module is ready, and fails it with
 * `failed_precondition` when the module failed. Retry and placeholder data are
 * owned by `shared/query`, so they are not options here.
 */
export type BridgeQueryOptions<TData, TKey extends QueryKey> = Omit<
  UseQueryOptions<TData, BridgeError, TData, TKey>,
  'queryKey' | 'queryFn' | 'placeholderData' | 'retry' | 'retryDelay' | 'select'
> & {
  readonly queryKey: TKey;
  readonly queryFn: (context: BridgeQueryContext) => Promise<TData>;
  readonly module?: ModuleId;
};
