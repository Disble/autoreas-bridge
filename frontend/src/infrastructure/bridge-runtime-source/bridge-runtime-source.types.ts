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
  AnimeHistoryEntry,
  ApplyAnimeScheduleDraftCommand,
  SaveAnimeEditorCommand,
} from '../../shared/contracts/anime.types';
import type { SyncingAnime } from '../../shared/contracts/syncing-anime.types';

/**
 * Request/reply port for bridge runtime bindings plus the pairing-consumed event stream.
 */
export interface BridgeRuntimeSource {
  readonly getSQLiteStatus: () => Promise<string>;
  readonly getEffectiveAddress: () => Promise<string>;
  readonly getPairingToken: () => Promise<string>;
  readonly getSyncingAnimeItems: () => Promise<readonly SyncingAnime[]>;
  readonly getAnimes: () => Promise<readonly Anime[]>;
  readonly getAnimeDetail: (id: string) => Promise<AnimeDetail | null>;
  readonly getAnimeEditorRecord?: (id: string) => Promise<AnimeEditorRecordResult>;
  readonly saveAnimeEditor?: (command: SaveAnimeEditorCommand) => Promise<AnimeEditorSaveResult>;
  readonly deactivateAnime?: (animeID: string, baseModifiedAt: number) => Promise<AnimeEditorSaveResult>;
  readonly getAnimeEditorScheduleBoard?: (originAnimeID: string) => Promise<AnimeEditorScheduleBoardResult>;
  readonly applyAnimeEditorSchedule?: (command: ApplyAnimeScheduleDraftCommand) => Promise<AnimeEditorScheduleApplyResult>;
  readonly createAnime?: (command: AnimeCreateCommand) => Promise<AnimeCreateResult>;
  readonly getAnimeHistory: () => Promise<readonly AnimeHistoryEntry[]>;
  readonly getEpisodeSchedule?: (day: string) => Promise<readonly contracts.EpisodeScheduleItem[]>;
  readonly getAnimeCover?: (animeID: string) => Promise<contracts.AnimeCover>;
  readonly getEpisodeDayCounts?: () => Promise<readonly contracts.EpisodeDayCount[]>;
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
  readonly getConnectedDevices?: () => Promise<readonly contracts.DeviceInfo[]>;
  readonly triggerReconcile: () => Promise<string>;
  readonly unpairDevice?: (deviceID: string) => Promise<string>;
  readonly onPairingTokenConsumed: (listener: () => void) => () => void;
}

/** Required editor subset implemented by the production Wails adapter. */
export interface AnimeEditorRuntimeSource {
  readonly getAnimes: BridgeRuntimeSource['getAnimes'];
  readonly getAnimeEditorRecord: NonNullable<BridgeRuntimeSource['getAnimeEditorRecord']>;
  readonly saveAnimeEditor: NonNullable<BridgeRuntimeSource['saveAnimeEditor']>;
  readonly deactivateAnime: NonNullable<BridgeRuntimeSource['deactivateAnime']>;
  readonly restoreAnime: NonNullable<BridgeRuntimeSource['restoreAnime']>;
  readonly getAnimeEditorScheduleBoard: NonNullable<BridgeRuntimeSource['getAnimeEditorScheduleBoard']>;
  readonly applyAnimeEditorSchedule: NonNullable<BridgeRuntimeSource['applyAnimeEditorSchedule']>;
  readonly pickFolder: NonNullable<BridgeRuntimeSource['pickFolder']>;
  readonly pickFile: NonNullable<BridgeRuntimeSource['pickFile']>;
}
