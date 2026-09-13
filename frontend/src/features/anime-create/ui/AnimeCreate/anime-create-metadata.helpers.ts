import type { AnimeMetadataSelection } from '../../../../shared/metadata-lookup/metadata-lookup.types';
import type { AnimeCreateRowPatch } from './anime-create.types';

/**
 * Performs hop two of the MAL-to-bridge translation for the Create row
 * (design D6): turns a confirmed lookup's neutral {@link AnimeMetadataSelection}
 * into the row's own patch shape, applied through the existing `onRowChange`
 * channel. Every field is read from an explicit allow-list, so `page`,
 * `folder`, and `episodesWatched` -- the row's protected fields -- have no
 * code path into the returned patch at all (non-negotiable #7, Create half).
 * An unmapped MyAnimeList type already left `kind` absent from `selection`
 * (hop one's `readKind`); this hop passes that absence through rather than
 * defaulting it a second time (non-negotiable #6, mapping half).
 * @param selection The confirmed lookup's normalized, source-agnostic result.
 * @returns The row patch to apply through `onRowChange`, holding only the
 * fields `selection` actually mapped.
 */
export function toCreateRowPatch(selection: Readonly<AnimeMetadataSelection>): AnimeCreateRowPatch {
  return {
    name: selection.name,
    ...(selection.kind === undefined ? {} : { kind: selection.kind }),
    ...(selection.totalEpisodes === undefined ? {} : { totalEpisodes: selection.totalEpisodes }),
    ...(selection.duration === undefined ? {} : { duration: selection.duration }),
    ...(selection.origin === undefined ? {} : { origin: selection.origin }),
    ...(selection.genres === undefined ? {} : { genres: selection.genres }),
    ...(selection.studios === undefined ? {} : { studios: selection.studios }),
    ...(selection.coverURL === undefined ? {} : { coverType: 'url', coverPath: selection.coverURL }),
  };
}
