import { useEffect, useMemo, useState } from 'react';
import { normalizeStoredCoverPath, toAnimeCoverEntry } from '../anime-cover.helpers';
import type { CoverPreviewSource } from '../anime-cover.types';
import type { AnimeCoverEntry } from '../use-anime-cover';
import { COVER_PREVIEW_LOADING, COVER_PREVIEW_PLACEHOLDER, COVER_PREVIEW_SETTLE_MS } from './cover-preview.constants';

/**
 * Renders the cover value a form holds before it is saved, through the same
 * thumbnail binding a saved cover uses. A blank or `"null"` value never reaches
 * the binding. A typed value settles for `COVER_PREVIEW_SETTLE_MS` first, so a
 * path being typed is read once, and an answer for a value the form has since
 * left is dropped instead of overwriting the newer preview.
 * @param value The form's current cover value: a local image path or an image URL.
 * @param source The port `previewAnimeCover` is called through; its absence degrades to the placeholder.
 * @returns The preview's current resolution state.
 */
export function useCoverPreview(value: string, source: CoverPreviewSource): AnimeCoverEntry {
  // 1. Refs

  // 2. State
  const [preview, setPreview] = useState<AnimeCoverEntry>(COVER_PREVIEW_PLACEHOLDER);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const path = useMemo(() => normalizeStoredCoverPath(value), [value]);
  // The binding, not the port object: a caller that rebuilds the port each render must not re-read the cover.
  const previewAnimeCover = source.previewAnimeCover;

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    if (path === undefined || previewAnimeCover === undefined) {
      // eslint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- The preview is async fetch state keyed by the typed value, so a cleared value must drop the previous cover.
      setPreview(COVER_PREVIEW_PLACEHOLDER);
      return;
    }

    let active = true;
    setPreview(COVER_PREVIEW_LOADING);
    const timer = setTimeout(() => {
      previewAnimeCover(path)
        .then((result) => {
          if (active) setPreview(toAnimeCoverEntry(result));
        })
        .catch(() => {
          if (active) setPreview(COVER_PREVIEW_PLACEHOLDER);
        });
    }, COVER_PREVIEW_SETTLE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [path, previewAnimeCover]);

  return preview;
}
