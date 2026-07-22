import {
  AdjustWatchedEpisodes,
  ApplyAnimeEditorSchedule,
  CopyAnimeFolder,
  CopyAnimePage,
  CreateAnime,
  DeactivateAnime,
  GetAnimeCover,
  GetAnimeDetail,
  GetAnimeEditorRecord,
  GetAnimeEditorScheduleBoard,
  GetAnimeHistory,
  GetAnimes,
  GetConnectedDevices,
  GetEffectiveAddress,
  GetEpisodeDayCounts,
  GetEpisodeSchedule,
  GetPairingToken,
  GetSQLiteStatus,
  GetSyncingAnimeItems,
  OpenAnimeFolder,
  OpenAnimePage,
  PickFile,
  PickFolder,
  RepeatAnime,
  RestoreAnime,
  SaveAnimeEditor,
  SetAnimeState,
  SoftDeleteAnime,
  TriggerReconcile,
  UnpairDevice,
} from '../../../wailsjs/go/main/App';
import { contracts as wailsContracts } from '../../../wailsjs/go/models';
import type { main as wailsMain } from '../../../wailsjs/go/models';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
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
import {
  BRIDGE_RUNTIME_SOURCE_STATE,
  PAIRING_TOKEN_CONSUMED_EVENT_NAME,
  RUNTIME_UNAVAILABLE_COMMAND_RESULT,
  RUNTIME_UNAVAILABLE_CREATE_RESULT,
  RUNTIME_UNAVAILABLE_EDITOR_RESULT,
} from './bridge-runtime-source.constants';
import type { AnimeEditorRuntimeSource, BridgeRuntimeSource } from './bridge-runtime-source.types';
import { createRuntimeSubscription, invokeGoBinding } from '../wails-bindings.helpers';

function createRuntimeUnavailableScheduleBoard(originAnimeID: string): AnimeEditorScheduleBoard {
  return { originAnimeId: originAnimeID, boardModifiedAt: 0, destinations: [], entries: [] };
}

function nullableValue<T>(value: { readonly kind: string; readonly value?: T }): T | undefined {
  return value.kind === 'value' ? value.value : undefined;
}

function toOutcome(outcome: string): AnimeEditorSaveResult['outcome'] {
  return outcome === 'applied' || outcome === 'no_op' || outcome === 'conflict' ? outcome : 'error';
}

function toSchedulePlacement(placement: wailsContracts.MobileAnimeDay): AnimeSchedulePlacement {
  return { day: placement.day, order: placement.order };
}

function toWailsSchedulePlacement(placement: AnimeSchedulePlacement): wailsContracts.MobileAnimeDay {
  return { day: placement.day, order: placement.order };
}

function toStudiosKind(record: wailsContracts.AnimeEditorRecord): 'missing' | 'null' | 'empty' | 'values' {
  if (record.details.studios.kind === 'null') {
    return 'null';
  }
  if (record.details.studios.kind === 'value') {
    return record.details.studios.values.length === 0 ? 'empty' : 'values';
  }
  return 'missing';
}

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

function toAnimeEditorDetailFields(record: wailsContracts.AnimeEditorRecord): AnimeEditorRecord['details'] {
  const premieredAt = record.details.premieredAt.kind === 'value' ? record.details.premieredAt.unixMilli : undefined;
  const duration = nullableValue(record.details.duration);
  const origin = nullableValue(record.details.origin);
  return {
    genres: record.details.genres.values,
    studios: { kind: toStudiosKind(record), values: record.details.studios.values },
    ...(premieredAt === undefined ? {} : { premieredAt }),
    ...(duration === undefined ? {} : { duration }),
    ...(origin === undefined ? {} : { origin }),
    ...(record.details.cover.kind === 'value' ? { cover: { type: record.details.cover.type, path: record.details.cover.path, raw: record.details.cover.raw } } : {}),
  };
}

function toAnimeEditorRecord(record: wailsContracts.AnimeEditorRecord): AnimeEditorRecord {
  return { animeId: record.animeId, modifiedAt: record.modifiedAt, frequent: toAnimeEditorFrequentFields(record), details: toAnimeEditorDetailFields(record) };
}

function toAnimeEditorRecordResult(result: wailsContracts.AnimeEditorRecordResult): AnimeEditorRecordResult {
  return {
    outcome: toOutcome(result.outcome),
    message: result.message,
    details: result.details,
    ...(result.record === undefined ? {} : { record: toAnimeEditorRecord(result.record) }),
  };
}

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

function toAnimeEditorScheduleBoardResult(result: wailsContracts.AnimeEditorScheduleBoardResult): AnimeEditorScheduleBoardResult {
  return { outcome: toOutcome(result.outcome), message: result.message, details: result.details, ...(result.board === undefined ? {} : { board: toAnimeEditorScheduleBoard(result.board) }) };
}

function toAnimeEditorScheduleApplyResult(result: wailsContracts.AnimeEditorScheduleApplyResult): AnimeEditorScheduleApplyResult {
  return {
    outcome: toOutcome(result.outcome), message: result.message, details: result.details,
    modifiedAt: result.modifiedAt, conflictId: result.conflictId,
    ...(result.board === undefined ? {} : { board: toAnimeEditorScheduleBoard(result.board) }),
  };
}

function toSaveAnimeEditorDTO(command: SaveAnimeEditorCommand): wailsMain.SaveAnimeEditorCommandDTO {
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
      premieredAt: {
        present: patch.premieredAt.present,
        clear: patch.premieredAt.clear,
        unixMilli: patch.premieredAt.present && !patch.premieredAt.clear ? Number(patch.premieredAt.value) : 0,
      },
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
  } as unknown as wailsMain.SaveAnimeEditorCommandDTO;
}

/**
 * Maps the frontend batch-create command into the generated wire DTO. The
 * Go-side `AnimeCreateItemDTO`/`contracts.AnimeCreate` still carry legacy
 * Spanish field names (`nombre`/`pagina`/`carpeta`/`tipo`/`fechaEstreno`) --
 * this is the retained storage/wire boundary the create-anime slice did not
 * own or rename in SDD-56/57, so the mapping stays isolated here.
 */
function toAnimeCreateDTO(command: AnimeCreateCommand): wailsMain.AnimeCreateCommandDTO {
  return {
    creates: command.creates.map((item) => ({
      nombre: item.name,
      pagina: item.page,
      dias: item.placements.map(toWailsSchedulePlacement),
      carpeta: item.folder,
      tipo: item.kind,
      fechaEstreno: item.premieredAt,
    })),
    changedNeighbors: command.changedNeighbors.map((entry) => ({
      animeId: entry.animeId,
      baseModifiedAt: entry.baseModifiedAt,
      placements: entry.placements.map(toWailsSchedulePlacement),
    })),
  } as unknown as wailsMain.AnimeCreateCommandDTO;
}

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

function toApplyAnimeScheduleDraftDTO(command: ApplyAnimeScheduleDraftCommand): wailsMain.ApplyAnimeScheduleDraftCommandDTO {
  return {
    boardModifiedAt: command.boardModifiedAt,
    entries: command.entries.map((entry) => ({
      animeId: entry.animeId,
      baseModifiedAt: entry.baseModifiedAt,
      placements: entry.placements.map(toWailsSchedulePlacement),
    })),
  } as wailsMain.ApplyAnimeScheduleDraftCommandDTO;
}

/**
 * Creates the singleton runtime-backed bridge source. It degrades every missing
 * Wails binding to safe defaults so browser/Vite contexts keep rendering.
 */
export function createBridgeRuntimeSource(): BridgeRuntimeSource & AnimeEditorRuntimeSource {
  if (BRIDGE_RUNTIME_SOURCE_STATE.sharedSource !== null) {
    return BRIDGE_RUNTIME_SOURCE_STATE.sharedSource as BridgeRuntimeSource & AnimeEditorRuntimeSource;
  }

  const pairingTokenSubscription = createRuntimeSubscription<void>((emit) => {
    return EventsOn(PAIRING_TOKEN_CONSUMED_EVENT_NAME, () => emit(undefined));
  });

  BRIDGE_RUNTIME_SOURCE_STATE.sharedSource = {
    getSQLiteStatus() {
      return invokeGoBinding('GetSQLiteStatus', GetSQLiteStatus, () => 'runtime unavailable');
    },
    getEffectiveAddress() {
      return invokeGoBinding('GetEffectiveAddress', GetEffectiveAddress, () => '');
    },
    getPairingToken() {
      return invokeGoBinding('GetPairingToken', GetPairingToken, () => '');
    },
    getSyncingAnimeItems() {
      return invokeGoBinding('GetSyncingAnimeItems', GetSyncingAnimeItems, () => []);
    },
    getAnimes() {
      return invokeGoBinding('GetAnimes', GetAnimes, () => []);
    },
    getAnimeDetail(id) {
      return invokeGoBinding('GetAnimeDetail', () => GetAnimeDetail(id), () => null);
    },
    getAnimeEditorRecord(id) {
      return invokeGoBinding('GetAnimeEditorRecord', () => GetAnimeEditorRecord(id), () => ({ outcome: 'error', message: 'runtime unavailable' } as wailsContracts.AnimeEditorRecordResult)).then(toAnimeEditorRecordResult);
    },
    saveAnimeEditor(command) {
      return invokeGoBinding('SaveAnimeEditor', () => SaveAnimeEditor(toSaveAnimeEditorDTO(command)), () => RUNTIME_UNAVAILABLE_EDITOR_RESULT as wailsContracts.AnimeEditorSaveResult).then(toAnimeEditorSaveResult);
    },
    deactivateAnime(animeID, baseModifiedAt) {
      return invokeGoBinding('DeactivateAnime', () => DeactivateAnime(animeID, baseModifiedAt), () => RUNTIME_UNAVAILABLE_EDITOR_RESULT as wailsContracts.AnimeEditorSaveResult).then(toAnimeEditorSaveResult);
    },
    getAnimeEditorScheduleBoard(originAnimeID) {
      return invokeGoBinding('GetAnimeEditorScheduleBoard', () => GetAnimeEditorScheduleBoard(originAnimeID), () => ({
        outcome: 'error',
        message: 'runtime unavailable',
        board: createRuntimeUnavailableScheduleBoard(originAnimeID),
      } as unknown as wailsContracts.AnimeEditorScheduleBoardResult)).then(toAnimeEditorScheduleBoardResult);
    },
    applyAnimeEditorSchedule(command) {
      return invokeGoBinding('ApplyAnimeEditorSchedule', () => ApplyAnimeEditorSchedule(toApplyAnimeScheduleDraftDTO(command)), () => RUNTIME_UNAVAILABLE_EDITOR_RESULT as wailsContracts.AnimeEditorScheduleApplyResult).then(toAnimeEditorScheduleApplyResult);
    },
    createAnime(command) {
      return invokeGoBinding('CreateAnime', () => CreateAnime(toAnimeCreateDTO(command)), () => RUNTIME_UNAVAILABLE_CREATE_RESULT as unknown as wailsContracts.AnimeCreateResult).then(toAnimeCreateResult);
    },
    getAnimeHistory() {
      return invokeGoBinding('GetAnimeHistory', GetAnimeHistory, () => []);
    },
    getEpisodeSchedule(day) {
      return invokeGoBinding('GetEpisodeSchedule', () => GetEpisodeSchedule(day), () => []);
    },
    getAnimeCover(animeID) {
      return invokeGoBinding('GetAnimeCover', () => GetAnimeCover(animeID), () => ({ source: 'placeholder' }));
    },
    getEpisodeDayCounts() {
      return invokeGoBinding('GetEpisodeDayCounts', GetEpisodeDayCounts, () => []);
    },
    adjustWatchedEpisodes(animeID, delta, base) {
      return invokeGoBinding('AdjustWatchedEpisodes', () => AdjustWatchedEpisodes(animeID, delta, base), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    setAnimeState(animeID, estado, base) {
      return invokeGoBinding('SetAnimeState', () => SetAnimeState(animeID, estado, base), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    softDeleteAnime(animeID, base) {
      return invokeGoBinding('SoftDeleteAnime', () => SoftDeleteAnime(animeID, base), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    restoreAnime(animeID, base) {
      return invokeGoBinding('RestoreAnime', () => RestoreAnime(animeID, base), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    repeatAnime(animeID, base) {
      return invokeGoBinding('RepeatAnime', () => RepeatAnime(animeID, base), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    openAnimePage(animeID) {
      return invokeGoBinding('OpenAnimePage', () => OpenAnimePage(animeID), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    copyAnimePage(animeID) {
      return invokeGoBinding('CopyAnimePage', () => CopyAnimePage(animeID), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    openAnimeFolder(animeID) {
      return invokeGoBinding('OpenAnimeFolder', () => OpenAnimeFolder(animeID), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    copyAnimeFolder(animeID) {
      return invokeGoBinding('CopyAnimeFolder', () => CopyAnimeFolder(animeID), () => RUNTIME_UNAVAILABLE_COMMAND_RESULT);
    },
    pickFolder(title) {
      return invokeGoBinding('PickFolder', () => PickFolder(title), () => '');
    },
    pickFile(title) {
      return invokeGoBinding('PickFile', () => PickFile(title), () => '');
    },
    getConnectedDevices() {
      return invokeGoBinding('GetConnectedDevices', GetConnectedDevices, () => []);
    },
    triggerReconcile() {
      return invokeGoBinding('TriggerReconcile', TriggerReconcile, () => 'runtime unavailable');
    },
    unpairDevice(deviceID) {
      return invokeGoBinding('UnpairDevice', () => UnpairDevice(deviceID), () => 'runtime unavailable');
    },
    onPairingTokenConsumed(listener) {
      return pairingTokenSubscription.subscribe(listener);
    },
  };

  return BRIDGE_RUNTIME_SOURCE_STATE.sharedSource as BridgeRuntimeSource & AnimeEditorRuntimeSource;
}

/** Shared bridge source singleton used across feature hooks and stores. */
export const bridgeRuntimeSource = createBridgeRuntimeSource();
