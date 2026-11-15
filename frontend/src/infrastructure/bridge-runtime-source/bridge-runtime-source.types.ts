import type { contracts } from '../../../wailsjs/go/models';
import type {
  Anime,
  AnimeCreateCommand,
  AnimeCreateResult,
  AnimeDetail,
  AnimeEditorRecordResult,
  AnimeEditorSaveResult,
  AnimeEditorScheduleApplyResult,
  AnimeEditorScheduleBoardResult,
  AnimeWatchHistoryPageRequest,
  ApplyAnimeScheduleDraftCommand,
  SaveAnimeEditorCommand,
  WatchHistoryPage,
  WatchHistoryPageRequest,
} from '../../shared/contracts/anime.types';

/**
 * Request/reply port for the bridge runtime bindings not yet migrated to a
 * module source (ADR-032; the Devices bindings moved to `DevicesSource`).
 */
export interface BridgeRuntimeSource {
  readonly getAnimes: () => Promise<readonly Anime[]>;
  readonly getAnimeDetail: (id: string) => Promise<AnimeDetail | null>;
  readonly getAnimeEditorRecord?: (id: string) => Promise<AnimeEditorRecordResult>;
  readonly saveAnimeEditor?: (command: SaveAnimeEditorCommand) => Promise<AnimeEditorSaveResult>;
  readonly deactivateAnime?: (animeID: string, baseModifiedAt: number) => Promise<AnimeEditorSaveResult>;
  readonly getAnimeEditorScheduleBoard?: (originAnimeID: string) => Promise<AnimeEditorScheduleBoardResult>;
  readonly applyAnimeEditorSchedule?: (command: ApplyAnimeScheduleDraftCommand) => Promise<AnimeEditorScheduleApplyResult>;
  readonly createAnime?: (command: AnimeCreateCommand) => Promise<AnimeCreateResult>;
  readonly getWatchHistoryPage?: (request: WatchHistoryPageRequest) => Promise<WatchHistoryPage>;
  readonly getAnimeWatchHistoryPage?: (request: AnimeWatchHistoryPageRequest) => Promise<WatchHistoryPage>;
  readonly getAnimeCover?: (animeID: string) => Promise<contracts.AnimeCover>;
  /** Renders an unsaved cover value (a local path or URL a form is editing) the way a saved cover renders. */
  readonly previewAnimeCover?: (value: string) => Promise<contracts.AnimeCover>;
  readonly adjustWatchedEpisodes?: (animeID: string, delta: number, base: number) => Promise<contracts.EpisodeCommandResult>;
  readonly setAnimeState?: (animeID: string, estado: number, base: number) => Promise<contracts.EpisodeCommandResult>;
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

/** Required editor subset implemented by the production Wails adapter. */
export interface AnimeEditorRuntimeSource {
  readonly getAnimes: BridgeRuntimeSource['getAnimes'];
  readonly getAnimeEditorRecord: NonNullable<BridgeRuntimeSource['getAnimeEditorRecord']>;
  readonly saveAnimeEditor: NonNullable<BridgeRuntimeSource['saveAnimeEditor']>;
  readonly deactivateAnime: NonNullable<BridgeRuntimeSource['deactivateAnime']>;
  readonly restoreAnime: NonNullable<BridgeRuntimeSource['restoreAnime']>;
  readonly repeatAnime: NonNullable<BridgeRuntimeSource['repeatAnime']>;
  readonly getAnimeEditorScheduleBoard: NonNullable<BridgeRuntimeSource['getAnimeEditorScheduleBoard']>;
  readonly applyAnimeEditorSchedule: NonNullable<BridgeRuntimeSource['applyAnimeEditorSchedule']>;
  readonly pickFolder: NonNullable<BridgeRuntimeSource['pickFolder']>;
  readonly pickFile: NonNullable<BridgeRuntimeSource['pickFile']>;
}
