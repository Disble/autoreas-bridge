import type { contracts } from '../../../wailsjs/go/models';
import type { Anime, AnimeDetail } from '../../shared/contracts/anime.types';

/**
 * Request/reply port for the bridge runtime bindings not yet migrated to a
 * module source (ADR-032; the Devices bindings moved to `DevicesSource`, the
 * watch-history pages to `AnimeSource`, the Editor, create and desktop-action
 * bindings to `AnimeEditorSource` and `AnimeDesktopActionsSource`, the Today
 * writes and the Editor's restore and repeat to `EpisodeCommandsSource`). Its
 * anime reads, desktop actions and lifecycle commands remain only for consumers
 * of later slices and keep their pre-migration fallbacks.
 */
export interface BridgeRuntimeSource {
  readonly getAnimes: () => Promise<readonly Anime[]>;
  readonly getAnimeDetail: (id: string) => Promise<AnimeDetail | null>;
  readonly getAnimeCover?: (animeID: string) => Promise<contracts.AnimeCover>;
  /** Renders an unsaved cover value (a local path or URL a form is editing) the way a saved cover renders. */
  readonly previewAnimeCover?: (value: string) => Promise<contracts.AnimeCover>;
  readonly softDeleteAnime?: (animeID: string, base: number) => Promise<contracts.EpisodeCommandResult>;
  readonly restoreAnime?: (animeID: string, base: number) => Promise<contracts.EpisodeCommandResult>;
  readonly repeatAnime?: (animeID: string, base: number) => Promise<contracts.EpisodeCommandResult>;
  readonly openAnimePage?: (animeID: string) => Promise<contracts.EpisodeCommandResult>;
  readonly copyAnimePage?: (animeID: string) => Promise<contracts.EpisodeCommandResult>;
  readonly openAnimeFolder?: (animeID: string) => Promise<contracts.EpisodeCommandResult>;
  readonly copyAnimeFolder?: (animeID: string) => Promise<contracts.EpisodeCommandResult>;
  readonly pickFolder?: (title: string) => Promise<string>;
  readonly pickFile?: (title: string) => Promise<string>;
}

/** The Editor's bindings not yet behind a module port: the two pickers. */
export interface AnimeEditorRuntimeSource {
  readonly pickFolder: NonNullable<BridgeRuntimeSource['pickFolder']>;
  readonly pickFile: NonNullable<BridgeRuntimeSource['pickFile']>;
}
