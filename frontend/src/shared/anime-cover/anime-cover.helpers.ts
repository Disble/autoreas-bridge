import type { AnimeCoverResult } from '../contracts/anime-source.types';
import { toAsyncView } from '../query/async-view/async-view.helpers';
import type { AsyncViewSource } from '../query/async-view/async-view.types';
import type { AnimeCoverEntry } from './use-anime-cover';

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

/**
 * Picks the anime ids whose covers still need a lookup: each non-empty id
 * once, skipping every id already requested. A row without an anime id has
 * nothing to resolve and keeps the placeholder.
 *
 * @param animeIds The ids a list renders, in render order.
 * @param requested The ids a lookup was already started for.
 * @returns The ids to request now, in render order and without duplicates.
 */
export function planAnimeCoverRequests(animeIds: readonly string[], requested: ReadonlySet<string>): string[] {
  return [...new Set(animeIds)].filter((animeId) => animeId !== '' && !requested.has(animeId));
}

/**
 * Maps one `getAnimeCover` answer to its cache entry: a cover only when the
 * binding returned one with data, the placeholder otherwise.
 *
 * @param result The binding's answer.
 * @returns The cover entry to cache for that anime.
 */
export function toAnimeCoverEntry(result: AnimeCoverResult): AnimeCoverEntry {
  return result.source === 'cover' && result.dataUrl !== undefined ? { status: 'cover', dataUrl: result.dataUrl } : { status: 'placeholder' };
}

/**
 * Maps one anime's cover query to the entry its avatar renders: the
 * placeholder when the read is gated off (no stored cover, no binding),
 * `loading` while the read is pending or still shows the previous anime's
 * cover, the placeholder when the read failed (a missing cover is never a page
 * failure), and the binding's answer otherwise.
 *
 * @param isEnabled Whether the cover read runs at all.
 * @param query The cover query's result.
 * @returns The cover entry to render.
 */
export function toAnimeCoverQueryEntry(
  isEnabled: boolean,
  query: AsyncViewSource<AnimeCoverResult> & { readonly isPlaceholderData: boolean },
): AnimeCoverEntry {
  if (!isEnabled) {
    return { status: 'placeholder' };
  }
  if (query.isPlaceholderData) {
    return { status: 'loading' };
  }

  const view = toAsyncView(query, () => false);
  if (view.kind === 'loading') {
    return { status: 'loading' };
  }

  return view.kind === 'ready' ? toAnimeCoverEntry(view.data) : { status: 'placeholder' };
}
