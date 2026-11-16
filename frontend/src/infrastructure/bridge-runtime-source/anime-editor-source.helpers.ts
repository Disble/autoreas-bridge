import {
  ApplyAnimeEditorSchedule,
  CopyAnimeFolder,
  CopyAnimePage,
  CreateAnime,
  DeactivateAnime,
  GetAnimeEditorRecord,
  GetAnimeEditorScheduleBoard,
  OpenAnimeFolder,
  OpenAnimePage,
  SaveAnimeEditor,
} from '../../../wailsjs/go/desktop/App';
import { contracts as wailsContracts } from '../../../wailsjs/go/models';
import type { desktop as wailsDesktop } from '../../../wailsjs/go/models';
import type { AnimeDesktopActionsSource, AnimeEditorSource } from '../../shared/contracts/anime-editor-source.types';
import type { AnimeSource } from '../../shared/contracts/anime-source.types';
import type {
  AnimeCreateCommand,
  AnimeCreateResult,
  AnimeEditorRecord,
  AnimeEditorRecordResult,
  AnimeEditorSaveResult,
  AnimeEditorScheduleApplyResult,
  AnimeEditorScheduleBoard,
  AnimeEditorScheduleBoardResult,
  AnimeSchedulePlacement,
  ApplyAnimeScheduleDraftCommand,
  SaveAnimeEditorCommand,
} from '../../shared/contracts/anime.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Calls one Editor, create or desktop-action binding: its rejection becomes a
 * `BridgeError`, and a binding that never attaches rejects as `unavailable`
 * instead of answering an "error" outcome.
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns What the binding answered.
 */
function callAnimeEditorBinding<T>(bindingName: string, call: () => Promise<T>): Promise<T> {
  return withBridgeErrors(
    invokeGoBinding(bindingName, call, () => Promise.reject(createBridgeError('unavailable', `the ${bindingName} binding is not attached`))),
  );
}

/**
 * Unwraps one of the Go side's nullable patch wrappers, collapsing every kind
 * other than `value` to `undefined`.
 */
function nullableValue<T>(value: { readonly kind: string; readonly value?: T }): T | undefined {
  return value.kind === 'value' ? value.value : undefined;
}

/**
 * Narrows an outcome string from the wire to the union the UI switches on.
 * Anything unrecognised becomes `error` rather than passing through, so a new
 * backend outcome degrades loudly instead of falling through every branch.
 */
function toOutcome(outcome: string): AnimeEditorSaveResult['outcome'] {
  return outcome === 'applied' || outcome === 'no_op' || outcome === 'conflict' ? outcome : 'error';
}

/** Maps one wire day/order pair into the frontend's schedule placement. */
function toSchedulePlacement(placement: wailsContracts.MobileAnimeDay): AnimeSchedulePlacement {
  return { day: placement.day, order: placement.order };
}

/** Maps a frontend schedule placement back into its wire shape. */
function toWailsSchedulePlacement(placement: AnimeSchedulePlacement): wailsContracts.MobileAnimeDay {
  return { day: placement.day, order: placement.order };
}

/**
 * Classifies the studios field into the four states the editor distinguishes.
 * `empty` and `null` are deliberately different: a list explicitly emptied is
 * not the same edit as one explicitly cleared.
 */
function toStudiosKind(record: wailsContracts.AnimeEditorRecord): 'missing' | 'null' | 'empty' | 'values' {
  if (record.details.studios.kind === 'null') {
    return 'null';
  }
  if (record.details.studios.kind === 'value') {
    return record.details.studios.values.length === 0 ? 'empty' : 'values';
  }
  return 'missing';
}

/**
 * Maps the frequently edited fields of an editor record. Optional fields are
 * spread conditionally rather than set to `undefined`, so an absent field stays
 * absent from the object instead of becoming a present-but-undefined key.
 */
function toAnimeEditorFrequentFields(record: wailsContracts.AnimeEditorRecord): AnimeEditorRecord['frequent'] {
  const totalEpisodes = nullableValue(record.frequent.totalEpisodes);
  const kind = nullableValue(record.frequent.kind);
  const page = nullableValue(record.frequent.sourceUrl);
  const folder = nullableValue(record.frequent.folder);
  return {
    name: record.frequent.name, status: record.frequent.status, progress: record.frequent.progress,
    active: record.frequent.active, placements: record.frequent.placements.map(toSchedulePlacement),
    ...(totalEpisodes === undefined ? {} : { totalEpisodes }),
    ...(kind === undefined ? {} : { kind }),
    ...(page === undefined ? {} : { page }),
    ...(folder === undefined ? {} : { folder }),
  };
}

/**
 * Maps the detail fields of an editor record, under the same conditional-spread
 * rule as {@link toAnimeEditorFrequentFields}.
 */
function toAnimeEditorDetailFields(record: wailsContracts.AnimeEditorRecord): AnimeEditorRecord['details'] {
  const duration = nullableValue(record.details.duration);
  const origin = nullableValue(record.details.origin);
  return {
    genres: record.details.genres.values,
    studios: { kind: toStudiosKind(record), values: record.details.studios.values },
    ...(duration === undefined ? {} : { duration }),
    ...(origin === undefined ? {} : { origin }),
    ...(record.details.cover.kind === 'value' ? { cover: { type: record.details.cover.type, path: record.details.cover.path, raw: record.details.cover.raw } } : {}),
  };
}

/** Maps a whole editor record from its wire shape. */
function toAnimeEditorRecord(record: wailsContracts.AnimeEditorRecord): AnimeEditorRecord {
  return { animeId: record.animeId, modifiedAt: record.modifiedAt, frequent: toAnimeEditorFrequentFields(record), details: toAnimeEditorDetailFields(record) };
}

/** Maps a record-load result, carrying the record only when one came back. */
function toAnimeEditorRecordResult(result: wailsContracts.AnimeEditorRecordResult): AnimeEditorRecordResult {
  return {
    outcome: toOutcome(result.outcome),
    message: result.message,
    details: result.details,
    ...(result.record === undefined ? {} : { record: toAnimeEditorRecord(result.record) }),
  };
}

/**
 * Maps a save result. `conflictId` survives the mapping because a conflict
 * outcome is only actionable if the UI can name the conflict it lost to.
 */
function toAnimeEditorSaveResult(result: wailsContracts.AnimeEditorSaveResult): AnimeEditorSaveResult {
  return {
    outcome: toOutcome(result.outcome),
    message: result.message,
    details: result.details,
    animeId: result.animeId,
    modifiedAt: result.modifiedAt,
    conflictId: result.conflictId,
    ...(result.record === undefined ? {} : { record: toAnimeEditorRecord(result.record) }),
  };
}

/**
 * Maps a whole schedule board. Destination kinds are narrowed to
 * `special`/`weekday` here so the board never renders an unknown column type.
 */
function toAnimeEditorScheduleBoard(board: wailsContracts.AnimeEditorScheduleBoard): AnimeEditorScheduleBoard {
  return {
    originAnimeId: board.originAnimeId,
    boardModifiedAt: board.boardModifiedAt,
    destinations: board.destinations.map((destination) => ({ id: destination.id, label: destination.label, kind: destination.kind === 'special' ? 'special' : 'weekday' })),
    entries: board.entries.map((entry) => ({
      animeId: entry.animeId,
      name: entry.name,
      active: entry.active,
      modifiedAt: entry.modifiedAt,
      placements: entry.placements.map(toSchedulePlacement),
      status: entry.status,
      progress: entry.progress,
      cover: entry.cover,
      originHighlighted: entry.originHighlighted,
    })),
  };
}

/** Maps a board-load result, carrying the board only when one came back. */
function toAnimeEditorScheduleBoardResult(result: wailsContracts.AnimeEditorScheduleBoardResult): AnimeEditorScheduleBoardResult {
  return { outcome: toOutcome(result.outcome), message: result.message, details: result.details, ...(result.board === undefined ? {} : { board: toAnimeEditorScheduleBoard(result.board) }) };
}

/**
 * Maps the result of applying a dragged board, including the refreshed board
 * when the backend returned one.
 */
function toAnimeEditorScheduleApplyResult(result: wailsContracts.AnimeEditorScheduleApplyResult): AnimeEditorScheduleApplyResult {
  return {
    outcome: toOutcome(result.outcome), message: result.message, details: result.details,
    modifiedAt: result.modifiedAt, conflictId: result.conflictId,
    ...(result.board === undefined ? {} : { board: toAnimeEditorScheduleBoard(result.board) }),
  };
}

/**
 * Converts a save command into its wire DTO. Numeric patches are re-encoded
 * from their string form, and an absent or cleared patch sends 0 alongside the
 * flags that say so -- the flags, not the value, carry the intent. Episode
 * durations never travel here: the Episodes card saves them on its own.
 */
function toSaveAnimeEditorDTO(command: SaveAnimeEditorCommand): wailsDesktop.SaveAnimeEditorCommandDTO {
  const patch = command.patch;
  const numericPatch = (value: { readonly present: boolean; readonly clear: boolean; readonly value: string } | undefined) => ({
    present: value?.present ?? false,
    clear: value?.clear ?? false,
    value: value?.present === true && value.clear === false ? Number(value.value) : 0,
  });
  return {
    animeId: command.animeId,
    baseModifiedAt: command.baseModifiedAt,
    patch: {
      name: patch.name,
      status: patch.status,
      progress: patch.progress,
      totalEpisodes: numericPatch(patch.totalEpisodes),
      page: patch.page,
      folder: patch.folder,
      origin: patch.origin,
      duration: numericPatch(patch.duration),
      kind: numericPatch(patch.kind),
      placements: patch.placements?.map(toWailsSchedulePlacement),
      genres: patch.genres,
      studios: { present: patch.studios !== undefined, clear: patch.studios?.length === 0, values: patch.studios },
      cover: {
        present: patch.cover.present,
        clear: patch.cover.clear,
        type: patch.cover.type,
        path: patch.cover.path,
        raw: patch.cover.raw,
      },
      active: patch.active,
    },
  } as unknown as wailsDesktop.SaveAnimeEditorCommandDTO;
}

/**
 * Maps the frontend batch-create command into the generated wire DTO. The
 * Go-side `AnimeCreateItemDTO`/`contracts.AnimeCreate` still carry legacy
 * Spanish field names (`nombre`/`pagina`/`carpeta`/`tipo`) for the core row --
 * this is the retained storage/wire boundary the create-anime slice did not
 * own or rename in SDD-56/57, so the mapping stays isolated here. Optional
 * metadata already uses English keys.
 */
function toAnimeCreateDTO(command: AnimeCreateCommand): wailsDesktop.AnimeCreateCommandDTO {
  return {
    creates: command.creates.map((item) => ({
      nombre: item.name,
      pagina: item.page,
      dias: item.placements.map(toWailsSchedulePlacement),
      carpeta: item.folder,
      tipo: item.kind,
      episodesWatched: item.episodesWatched,
      totalEpisodes: item.totalEpisodes,
      durationMinutes: item.durationMinutes,
      origin: item.origin,
      genres: item.genres,
      studios: item.studios,
      cover: item.cover,
    })),
    changedNeighbors: command.changedNeighbors.map((entry) => ({
      animeId: entry.animeId,
      baseModifiedAt: entry.baseModifiedAt,
      placements: entry.placements.map(toWailsSchedulePlacement),
    })),
  } as unknown as wailsDesktop.AnimeCreateCommandDTO;
}

/** Maps an anime-creation result, defaulting a missing message to empty. */
function toAnimeCreateResult(result: wailsContracts.AnimeCreateResult): AnimeCreateResult {
  return {
    outcome: toOutcome(result.outcome),
    message: result.message ?? '',
    modifiedAt: result.modifiedAt,
    ...(result.animeIds === undefined ? {} : { animeIds: result.animeIds }),
    ...(result.conflictId === undefined ? {} : { conflictId: result.conflictId }),
    ...(result.details === undefined ? {} : { details: result.details }),
  };
}

/** Converts a dragged schedule draft into its wire DTO. */
function toApplyAnimeScheduleDraftDTO(command: ApplyAnimeScheduleDraftCommand): wailsDesktop.ApplyAnimeScheduleDraftCommandDTO {
  return {
    boardModifiedAt: command.boardModifiedAt,
    entries: command.entries.map((entry) => ({
      animeId: entry.animeId,
      baseModifiedAt: entry.baseModifiedAt,
      placements: entry.placements.map(toWailsSchedulePlacement),
    })),
  } as wailsDesktop.ApplyAnimeScheduleDraftCommandDTO;
}

/**
 * The Wails adapter of the `AnimeEditorSource` port (ADR-032 §4), built once in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`. The catalog list
 * is the anime module's strict `getAnimes`; every other call maps its wire
 * result and rejects with the module's failure in place of an "error" outcome.
 * @param animeSource The anime module's reads, whose catalog the Editor rail lists.
 * @returns The source.
 */
export function createAnimeEditorSource(animeSource: Pick<AnimeSource, 'getAnimes'>): AnimeEditorSource {
  return {
    getAnimes: () => animeSource.getAnimes(),
    getAnimeEditorRecord: (animeId) =>
      callAnimeEditorBinding('GetAnimeEditorRecord', () => GetAnimeEditorRecord(animeId)).then(toAnimeEditorRecordResult),
    saveAnimeEditor: (command) =>
      callAnimeEditorBinding('SaveAnimeEditor', () => SaveAnimeEditor(toSaveAnimeEditorDTO(command))).then(toAnimeEditorSaveResult),
    deactivateAnime: (animeId, baseModifiedAt) =>
      callAnimeEditorBinding('DeactivateAnime', () => DeactivateAnime(animeId, baseModifiedAt)).then(toAnimeEditorSaveResult),
    getAnimeEditorScheduleBoard: (originAnimeId) =>
      callAnimeEditorBinding('GetAnimeEditorScheduleBoard', () => GetAnimeEditorScheduleBoard(originAnimeId)).then(toAnimeEditorScheduleBoardResult),
    applyAnimeEditorSchedule: (command) =>
      callAnimeEditorBinding('ApplyAnimeEditorSchedule', () => ApplyAnimeEditorSchedule(toApplyAnimeScheduleDraftDTO(command))).then(toAnimeEditorScheduleApplyResult),
    createAnime: (command) =>
      callAnimeEditorBinding('CreateAnime', () => CreateAnime(toAnimeCreateDTO(command))).then(toAnimeCreateResult),
  };
}

/**
 * The Wails adapter of the `AnimeDesktopActionsSource` port, built once in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`: each action
 * answers its result once done and rejects with a `BridgeError` otherwise.
 * @returns The source.
 */
export function createAnimeDesktopActionsSource(): AnimeDesktopActionsSource {
  return {
    openAnimePage: (animeId) => callAnimeEditorBinding('OpenAnimePage', () => OpenAnimePage(animeId)),
    copyAnimePage: (animeId) => callAnimeEditorBinding('CopyAnimePage', () => CopyAnimePage(animeId)),
    openAnimeFolder: (animeId) => callAnimeEditorBinding('OpenAnimeFolder', () => OpenAnimeFolder(animeId)),
    copyAnimeFolder: (animeId) => callAnimeEditorBinding('CopyAnimeFolder', () => CopyAnimeFolder(animeId)),
  };
}
