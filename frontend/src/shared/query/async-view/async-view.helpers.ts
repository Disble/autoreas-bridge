import { isBridgeError } from '../bridge-error/bridge-error.helpers';
import type { AsyncView, AsyncViewSource, IsEmptyData } from './async-view.types';

/**
 * Default emptiness: an array with no items is empty. Any other value is data
 * to show, `null` included; a query whose "nothing" has another shape (a count,
 * an object with an empty list) passes its own predicate to `toAsyncView`.
 */
export function isEmptyByDefault(data: unknown): boolean {
  return Array.isArray(data) && data.length === 0;
}

/**
 * Turns a query result into the one state a `.tsx` renders (ADR-032 §4):
 * pending → `loading`; error → `failure` with its code and message (an uncoded
 * error is `internal`), even when stale data is still cached; success → `empty`
 * when `isEmpty` says so, otherwise `ready` with `isRefreshing` while a refetch
 * runs. Hooks call it; `.tsx` files only render what it returns.
 */
export function toAsyncView<TData>(
  query: AsyncViewSource<TData>,
  isEmpty: IsEmptyData<TData> = isEmptyByDefault,
): AsyncView<TData> {
  if (query.status === 'pending') {
    return { kind: 'loading' };
  }
  if (query.status === 'error') {
    return toFailureView(query.error);
  }

  const data = query.data as TData;
  return isEmpty(data) ? { kind: 'empty' } : { kind: 'ready', data, isRefreshing: query.isFetching };
}

/** The failure state for any error a query rejected with. */
function toFailureView(error: unknown): AsyncView<never> {
  if (isBridgeError(error)) {
    return { kind: 'failure', code: error.code, message: error.message };
  }

  return { kind: 'failure', code: 'internal', message: error instanceof Error ? error.message : String(error) };
}
