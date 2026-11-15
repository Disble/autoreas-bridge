import type {
  Anime,
  AnimeCreateCommand,
  AnimeCreateResult,
  AnimeEditorRecordResult,
  AnimeEditorSaveResult,
  AnimeEditorScheduleApplyResult,
  AnimeEditorScheduleBoardResult,
  ApplyAnimeScheduleDraftCommand,
  SaveAnimeEditorCommand,
} from './anime.types';

/**
 * Port of the anime module's Editor and create bindings (ADR-032 §4): the
 * catalog the Editor rail lists, one anime's editable record, its save and
 * deactivate, the schedule board and its apply, and the batch create. The Wails
 * adapter is `createAnimeEditorSource`
 * (`infrastructure/bridge-runtime-source/anime-editor-source.helpers.ts`), built
 * once in `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every call
 * rejects with a `BridgeError` in place of an "error" outcome: `unavailable`
 * while the module starts, `failed_precondition` once it failed, `not_found`
 * for an unknown anime and `internal` for a failed read or write. A conflict and
 * a no-op stay result outcomes.
 */
export interface AnimeEditorSource {
  /** The flat catalog list the Editor rail and the create name check read. */
  readonly getAnimes: () => Promise<readonly Anime[]>;
  /** One anime's full editable record. */
  readonly getAnimeEditorRecord: (animeId: string) => Promise<AnimeEditorRecordResult>;
  /** Applies one editor patch under the record's `modifiedAt`. */
  readonly saveAnimeEditor: (command: SaveAnimeEditorCommand) => Promise<AnimeEditorSaveResult>;
  /** Takes one anime out of the active rotation under `baseModifiedAt`. */
  readonly deactivateAnime: (animeId: string, baseModifiedAt: number) => Promise<AnimeEditorSaveResult>;
  /** The schedule board, with `originAnimeId` highlighted when one is given. */
  readonly getAnimeEditorScheduleBoard: (originAnimeId: string) => Promise<AnimeEditorScheduleBoardResult>;
  /** Applies one dragged schedule draft under the board's `boardModifiedAt`. */
  readonly applyAnimeEditorSchedule: (command: ApplyAnimeScheduleDraftCommand) => Promise<AnimeEditorScheduleApplyResult>;
  /** Creates one or more animes and reflows their neighbors in one batch. */
  readonly createAnime: (command: AnimeCreateCommand) => Promise<AnimeCreateResult>;
}

/** What a completed desktop action answers; a failed one rejects instead. */
export interface AnimeDesktopActionResult {
  /** `ok` once the page or folder was opened or copied. */
  readonly status: string;
  /** The backend's message, when it sent one. */
  readonly message?: string;
}

/**
 * Port of the anime module's four desktop actions: open or copy an anime's
 * stored page or folder. The Wails adapter is `createAnimeDesktopActionsSource`
 * (`infrastructure/bridge-runtime-source/anime-editor-source.helpers.ts`). A
 * call rejects with a `BridgeError`: `unavailable` while the module starts,
 * `failed_precondition` once it failed, `not_found` for an unknown anime,
 * `invalid_argument` for an anime without the value and `internal` when the
 * launch or the copy failed.
 */
export interface AnimeDesktopActionsSource {
  /** Opens the anime's stored page in the default browser. */
  readonly openAnimePage: (animeId: string) => Promise<AnimeDesktopActionResult>;
  /** Copies the anime's stored page URL to the clipboard. */
  readonly copyAnimePage: (animeId: string) => Promise<AnimeDesktopActionResult>;
  /** Opens the anime's download folder in the file manager. */
  readonly openAnimeFolder: (animeId: string) => Promise<AnimeDesktopActionResult>;
  /** Copies the anime's download-folder path to the clipboard. */
  readonly copyAnimeFolder: (animeId: string) => Promise<AnimeDesktopActionResult>;
}
