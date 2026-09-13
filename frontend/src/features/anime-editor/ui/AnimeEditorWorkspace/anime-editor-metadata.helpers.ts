import type { AnimeMetadataSelection } from '../../../../shared/metadata-lookup/metadata-lookup.types';
import type { AnimeEditorDraft } from './anime-editor-workspace.types';

/**
 * Performs hop two of the MAL-to-bridge translation for the Editor form
 * (design D6): turns a confirmed lookup's neutral {@link AnimeMetadataSelection}
 * into a patch against the editor's own draft, applied through the same
 * channel the user's own typing uses. Every field is read from an explicit
 * allow-list, so Download page (`page`), Folder (`folder`), Watched episodes
 * (`progress`), the watching estado (`status`), and premiere date
 * (`premieredAt`) -- the form's five protected fields -- have no code path
 * into the returned patch at all (non-negotiable #7, Editor half). MyAnimeList's
 * airing `Status:` never reaches `selection` in the first place -- it is
 * discarded one package upstream, in `internal/myanimelist/detail.go` -- so
 * the estado mapping trap is structurally unavailable here, not merely
 * avoided by this allow-list (proposal.md's "Approach"). An unmapped
 * MyAnimeList type already left `kind` absent from `selection` (hop one's
 * `readKind`); this hop passes that absence through rather than defaulting
 * it a second time (non-negotiable #6, mapping half).
 * @param selection The confirmed lookup's normalized, source-agnostic result.
 * @returns The draft patch to apply through the form's own patch channel,
 * holding only the fields `selection` actually mapped.
 */
export function toEditorDraftPatch(selection: Readonly<AnimeMetadataSelection>): Partial<AnimeEditorDraft> {
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
