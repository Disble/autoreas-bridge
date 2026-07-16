import type { contracts } from '../../../wailsjs/go/models';
import type {
  Anime,
  AnimeDetail,
  AnimeEditorRecordResult,
  AnimeEditorSaveResult,
  AnimeEditorScheduleApplyResult,
  AnimeEditorScheduleBoardResult,
  AnimeHistoryEntry,
  AnimeLegacyPullResult,
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
  readonly getAnimeHistory: () => Promise<readonly AnimeHistoryEntry[]>;
  readonly getChapterSchedule?: (day: string) => Promise<readonly contracts.ChapterScheduleItem[]>;
  readonly getAnimeCover?: (animeID: string) => Promise<contracts.AnimeCover>;
  readonly getChapterDayCounts?: () => Promise<readonly contracts.ChapterDayCount[]>;
  readonly adjustWatchedChapters?: (animeID: string, delta: number, base: number) => Promise<contracts.ChapterCommandResult>;
  readonly setAnimeState?: (animeID: string, estado: number, base: number) => Promise<contracts.ChapterCommandResult>;
  readonly softDeleteAnime?: (animeID: string, base: number) => Promise<contracts.ChapterCommandResult>;
  readonly restoreAnime?: (animeID: string, base: number) => Promise<contracts.ChapterCommandResult>;
  readonly repeatAnime?: (animeID: string, base: number) => Promise<contracts.ChapterCommandResult>;
  readonly openAnimePage?: (animeID: string) => Promise<contracts.ChapterCommandResult>;
  readonly copyAnimePage?: (animeID: string) => Promise<contracts.ChapterCommandResult>;
  readonly openAnimeFolder?: (animeID: string) => Promise<contracts.ChapterCommandResult>;
  readonly copyAnimeFolder?: (animeID: string) => Promise<contracts.ChapterCommandResult>;
  readonly pickFolder?: (title: string) => Promise<string>;
  readonly pickFile?: (title: string) => Promise<string>;
  readonly getConnectedDevices?: () => Promise<readonly contracts.DeviceInfo[]>;
  readonly pullAnimesFromLegacy: () => Promise<AnimeLegacyPullResult>;
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
  readonly getAnimeEditorScheduleBoard: NonNullable<BridgeRuntimeSource['getAnimeEditorScheduleBoard']>;
  readonly applyAnimeEditorSchedule: NonNullable<BridgeRuntimeSource['applyAnimeEditorSchedule']>;
  readonly pickFolder: NonNullable<BridgeRuntimeSource['pickFolder']>;
  readonly pickFile: NonNullable<BridgeRuntimeSource['pickFile']>;
}
