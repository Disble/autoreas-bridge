import type { AnimeCoverResult } from '../../contracts/anime-source.types';
import { toAsyncView } from '../../query/async-view/async-view.helpers';
import type { AsyncViewSource } from '../../query/async-view/async-view.types';
import { toAnimeCoverEntry } from '../anime-cover.helpers';
import { COVER_PREVIEW_LOADING, COVER_PREVIEW_PLACEHOLDER } from './cover-preview.constants';
import type { CoverPreviewState } from './cover-preview.types';

/**
 * Maps the preview read to what the thumbnail shows: the placeholder for a
 * value that names no cover, `loading` while the typed value settles, while
 * the read is pending (the anime module starting included) or still shows the
 * previous value's answer, the read's failure with its reason, and the
 * binding's answer otherwise (its placeholder signal means "renders no cover").
 * @param path The normalized value the form holds now; `undefined` names no cover.
 * @param settledPath The value the read was last issued for.
 * @param query The preview read of `settledPath`.
 * @returns The preview state to render.
 */
export function toCoverPreviewState(
  path: string | undefined,
  settledPath: string | undefined,
  query: AsyncViewSource<AnimeCoverResult> & { readonly isPlaceholderData: boolean },
): CoverPreviewState {
  if (path === undefined) {
    return COVER_PREVIEW_PLACEHOLDER;
  }
  if (path !== settledPath || query.isPlaceholderData) {
    return COVER_PREVIEW_LOADING;
  }

  const view = toAsyncView(query, () => false);
  if (view.kind === 'failure') {
    return { status: 'failure', message: view.message };
  }
  return view.kind === 'ready' ? toAnimeCoverEntry(view.data) : COVER_PREVIEW_LOADING;
}
