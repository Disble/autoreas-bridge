/**
 * Defines a context's query keys, e.g. `export const episodesKeys =
 * defineQueryKeys('episodes')`. Every key starts with the context, so
 * `<context>Keys.all` is the prefix an invalidation rule names to refresh the
 * whole context, and `<context>Keys.key('schedule', day)` names one query.
 */
export function defineQueryKeys<TContext extends string>(context: TContext) {
  return {
    all: [context] as const,
    key: <TParts extends readonly unknown[]>(...parts: TParts) => [context, ...parts] as const,
  };
}
