import type { AnimeCoverEntry } from '../use-anime-cover';

/** How long a typed cover value settles before it is rendered, so each keystroke does not read a file. */
export const COVER_PREVIEW_SETTLE_MS = 400;

/** Accessible name of the rendered preview. */
export const COVER_PREVIEW_LABEL = 'Cover preview';

/** Accessible name of the preview's loading status. */
export const COVER_PREVIEW_LOADING_LABEL = 'Loading the cover preview';

/** Accessible name of the poster shown when the value renders no cover. */
export const COVER_PREVIEW_NO_COVER_LABEL = 'No cover preview';

/** The preview frame: a small 5:7 cover thumbnail, the shape every cover in the app keeps. */
export const COVER_PREVIEW_FRAME_CLASS = 'aspect-[5/7] w-14 shrink-0 overflow-hidden rounded-lg';

/** The one placeholder entry, so re-setting it never schedules another render. */
export const COVER_PREVIEW_PLACEHOLDER: AnimeCoverEntry = { status: 'placeholder' };

/** The one loading entry, for the same reason. */
export const COVER_PREVIEW_LOADING: AnimeCoverEntry = { status: 'loading' };
