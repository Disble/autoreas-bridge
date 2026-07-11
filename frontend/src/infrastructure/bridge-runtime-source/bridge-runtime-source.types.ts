import type { contracts } from '../../../wailsjs/go/models';
import type { Anime, AnimeDetail, AnimeHistoryEntry, AnimeLegacyPullResult } from '../../shared/contracts/anime.types';
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
  readonly getConnectedDevices?: () => Promise<readonly contracts.DeviceInfo[]>;
  readonly pullAnimesFromLegacy: () => Promise<AnimeLegacyPullResult>;
  readonly triggerReconcile: () => Promise<string>;
  readonly unpairDevice?: (deviceID: string) => Promise<string>;
  readonly onPairingTokenConsumed: (listener: () => void) => () => void;
}
