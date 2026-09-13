/**
 * Normalizes a legacy stored cover path into the value that gates whether the
 * cover-resolution binding is called. The real fixture carries
 * `portada.path === ''` on 793/795 records (plus one literal `'null'`
 * string), and neither is a renderable cover, so blank or sentinel paths
 * MUST resolve to `undefined` (no stored cover) rather than a path a caller
 * could reach into an `<img src>` (anime-cover-rendering spec, "An empty or
 * sentinel stored path skips the binding"). Exported so `useAnimeCover`'s
 * gate and every consumer's own view-model mapping stay provably in sync
 * with a single source of truth.
 */
export function normalizeStoredCoverPath(stored?: string): string | undefined {
  const trimmed = stored?.trim();

  return trimmed === undefined || trimmed === '' || trimmed === 'null' ? undefined : trimmed;
}
