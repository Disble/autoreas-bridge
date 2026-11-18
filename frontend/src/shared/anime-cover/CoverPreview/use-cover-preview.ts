import { useEffect, useMemo, useState } from 'react';
import type { AnimeCoverPreviewSource } from '../../contracts/anime-source.types';
import { animeKeys } from '../../query/query-keys/query-keys.constants';
import { useBridgeQuery } from '../../query/use-bridge-query/use-bridge-query';
import { normalizeStoredCoverPath } from '../anime-cover.helpers';
import { COVER_PREVIEW_SETTLE_MS } from './cover-preview.constants';
import { toCoverPreviewState } from './cover-preview.helpers';
import type { CoverPreviewState } from './cover-preview.types';

/**
 * Renders the cover value a form holds before it is saved, through the anime
 * module's `previewAnimeCover`, read with `useBridgeQuery` on the `anime`
 * module. A blank or `"null"` value never reaches the binding. A typed value
 * settles for `COVER_PREVIEW_SETTLE_MS` first, so a path being typed is read
 * once; each settled value is its own query, so an answer for a value the form
 * has since left never overwrites the newer preview. While the module starts
 * the preview stays `loading`; a failed read (the module failed included) is
 * `failure` with its reason, never the no-cover placeholder.
 * @param value The form's current cover value: a local image path or an image URL.
 * @param source The anime module's preview port.
 * @returns The preview's current state.
 */
export function useCoverPreview(value: string, source: AnimeCoverPreviewSource): CoverPreviewState {
  // 1. Refs

  // 2. State
  const [settledPath, setSettledPath] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: animeKeys.key('cover-preview', settledPath ?? ''),
    queryFn: () => source.previewAnimeCover(settledPath ?? ''),
    module: 'anime',
    enabled: settledPath !== undefined,
  });

  // 5. Derived State (useMemo)
  const path = useMemo(() => normalizeStoredCoverPath(value), [value]);
  const { status, data, error, isFetching, isPlaceholderData } = query;
  const preview = useMemo(
    () => toCoverPreviewState(path, settledPath, { status, data, error, isFetching, isPlaceholderData }),
    [path, settledPath, status, data, error, isFetching, isPlaceholderData],
  );

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    const timer = setTimeout(() => setSettledPath(path), COVER_PREVIEW_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [path]);

  return preview;
}
