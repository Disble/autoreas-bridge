import { useMutation, type UseMutationResult } from '@tanstack/react-query';

import type { BridgeError } from '../bridge-error/bridge-error.types';
import type { BridgeMutationOptions } from './use-bridge-mutation.types';

/**
 * Runs a backend command through TanStack Query (ADR-032 §4). A mutation is
 * never retried: a command may not be idempotent, and the user decides whether
 * to try again. Refreshing affected queries is the invalidation bridge's job.
 */
export function useBridgeMutation<TData, TVariables = void>(
  options: BridgeMutationOptions<TData, TVariables>,
): UseMutationResult<TData, BridgeError, TVariables> {
  // 4. Queries/Mutations
  return useMutation<TData, BridgeError, TVariables>({ ...options, retry: false });
}
