import { QueryClient } from '@tanstack/react-query';

import { isBridgeError } from '../bridge-error/bridge-error.helpers';
import { RETRY_BASE_DELAY_MS, RETRY_MAX_DELAY_MS, UNAVAILABLE_RETRY_LIMIT } from './query-client.constants';

/**
 * Retries only a module that is not ready yet (`unavailable`, ADR-032 §2), and
 * at most `UNAVAILABLE_RETRY_LIMIT` times. Every other failure is not transient:
 * retrying it would only delay the failure Alert. `failureCount` counts the
 * failures before this one (TanStack passes 0 on the first).
 */
export function shouldRetryBridgeQuery(failureCount: number, error: unknown): boolean {
  return isBridgeError(error) && error.code === 'unavailable' && failureCount < UNAVAILABLE_RETRY_LIMIT;
}

/** Doubling delay from `RETRY_BASE_DELAY_MS`, capped at `RETRY_MAX_DELAY_MS`. */
export function bridgeRetryDelay(failureCount: number): number {
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** failureCount, RETRY_MAX_DELAY_MS);
}

/**
 * Builds the app's `QueryClient` with the IPC defaults
 * (`docs/architecture/cross-cutting/async-state.md`, "QueryClient defaults"):
 * bindings are IPC, so the default `'online'` network mode would pause queries
 * on a window `offline` event; backend events drive freshness, so neither
 * focus nor reconnect refetches; mutations are never retried.
 */
export function createBridgeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: shouldRetryBridgeQuery,
        retryDelay: bridgeRetryDelay,
      },
      mutations: { networkMode: 'always', retry: false },
    },
  });
}
