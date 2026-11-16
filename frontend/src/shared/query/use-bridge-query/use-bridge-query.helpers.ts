import type { QueryClient, QueryMeta } from '@tanstack/react-query';

import type { ModuleId } from '../../contracts/readiness.types';
import { GATED_MODULE_META_KEY } from './use-bridge-query.constants';

/** The caller's query `meta` plus the module a gated query waits on. */
export function withGatedModule(meta: QueryMeta | undefined, module: ModuleId | undefined): QueryMeta {
  return { ...meta, [GATED_MODULE_META_KEY]: module };
}

/**
 * Re-runs the queries gated on `module` that ended in error, once the module
 * settled: a query a failed snapshot (or an exhausted `unavailable` retry) left
 * failed then runs (`ready`) or shows the module's failure (`failed`). Queries
 * of other modules, and queries not in error, are left alone.
 */
export function rerunFailedGatedQueries(client: QueryClient, module: string): Promise<void> {
  return client.invalidateQueries({
    predicate: (query) => query.state.status === 'error' && query.meta?.[GATED_MODULE_META_KEY] === module,
  });
}
