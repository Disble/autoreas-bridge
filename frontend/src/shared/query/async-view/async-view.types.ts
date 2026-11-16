import type { BridgeErrorCode } from '../bridge-error/bridge-error.types';

/**
 * The one state a feature `.tsx` renders for server data (ADR-032 §4):
 * `loading` → skeleton, `failure` → surface Alert, `empty` → empty state,
 * `ready` → the data, with `aria-busy` while `isRefreshing`.
 */
export type AsyncView<TData> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failure'; readonly code: BridgeErrorCode; readonly message: string }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly data: TData; readonly isRefreshing: boolean };

/** The part of a query result `toAsyncView` reads; a `useBridgeQuery` result fits it. */
export interface AsyncViewSource<TData> {
  readonly status: 'pending' | 'error' | 'success';
  readonly data: TData | undefined;
  readonly error: unknown;
  readonly isFetching: boolean;
}

/** Decides whether successfully loaded data counts as "nothing to show". */
export type IsEmptyData<TData> = (data: TData) => boolean;
