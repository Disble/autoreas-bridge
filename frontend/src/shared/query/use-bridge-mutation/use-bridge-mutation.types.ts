import type { UseMutationOptions } from '@tanstack/react-query';

import type { BridgeError } from '../bridge-error/bridge-error.types';

/**
 * `useBridgeMutation` options: TanStack's, minus retry, which `shared/query`
 * owns (a mutation is never retried).
 */
export type BridgeMutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, BridgeError, TVariables>,
  'retry' | 'retryDelay'
>;
