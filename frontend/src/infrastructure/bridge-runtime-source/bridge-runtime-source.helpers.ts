import {
  AdjustWatchedEpisodes,
  CopyAnimeFolder,
  CopyAnimePage,
  GetAnimeCover,
  PreviewAnimeCover,
  GetAnimeDetail,
  GetAnimes,
  OpenAnimeFolder,
  OpenAnimePage,
  PickFile,
  PickFolder,
  RepeatAnime,
  RestoreAnime,
  SetAnimeState,
  SoftDeleteAnime,
} from '../../../wailsjs/go/desktop/App';
import type { contracts as wailsContracts } from '../../../wailsjs/go/models';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { BRIDGE_RUNTIME_SOURCE_STATE, RUNTIME_UNAVAILABLE_COMMAND_RESULT } from './bridge-runtime-source.constants';
import type { AnimeEditorRuntimeSource, BridgeRuntimeSource } from './bridge-runtime-source.types';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Runs one desktop action for the consumers of later migration slices. Its
 * binding rejects with the anime module's failure; these consumers read a
 * failure as an `error` status carrying the message, as they always did.
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns The binding's result, or an `error` status with the failure's message.
 */
function runLegacyDesktopAction(bindingName: string, call: () => Promise<wailsContracts.EpisodeCommandResult>): Promise<wailsContracts.EpisodeCommandResult> {
  return withBridgeErrors(invokeGoBinding(bindingName, call, () => RUNTIME_UNAVAILABLE_COMMAND_RESULT))
    .catch((error: Error) => ({ ...RUNTIME_UNAVAILABLE_COMMAND_RESULT, message: error.message }));
}

/**
 * Creates the singleton runtime-backed bridge source. It degrades every missing
 * Wails binding to safe defaults so browser/Vite contexts keep rendering. The
 * anime reads it still carries (`getAnimes`, `getAnimeDetail`, `getAnimeCover`,
 * `previewAnimeCover`) serve consumers of later migration slices: their bindings
 * now reject while the anime module is not ready, and these keep answering the
 * pre-migration fallback (`[]`, `null`, the placeholder) for them. Migrated
 * consumers read through `AnimeSource` (`anime-source.helpers.ts`) and the
 * Editor, create and desktop-action ports (`anime-editor-source.helpers.ts`).
 */
export function createBridgeRuntimeSource(): BridgeRuntimeSource & AnimeEditorRuntimeSource {
  if (BRIDGE_RUNTIME_SOURCE_STATE.sharedSource !== null) {
    return BRIDGE_RUNTIME_SOURCE_STATE.sharedSource as BridgeRuntimeSource & AnimeEditorRuntimeSource;
  }

  BRIDGE_RUNTIME_SOURCE_STATE.sharedSource = {
    getAnimes() {
      return invokeGoBinding('GetAnimes', GetAnimes, () => []).catch(() => []);
    },
    getAnimeDetail(id) {
      return invokeGoBinding('GetAnimeDetail', () => GetAnimeDetail(id), () => null).catch(() => null);
    },
    getAnimeCover(animeID) {
      return invokeGoBinding('GetAnimeCover', () => GetAnimeCover(animeID), () => ({ source: 'placeholder' })).catch(() => ({ source: 'placeholder' }));
    },
    previewAnimeCover(value) {
      return invokeGoBinding('PreviewAnimeCover', () => PreviewAnimeCover(value), () => ({ source: 'placeholder' })).catch(() => ({ source: 'placeholder' }));
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
      return runLegacyDesktopAction('OpenAnimePage', () => OpenAnimePage(animeID));
    },
    copyAnimePage(animeID) {
      return runLegacyDesktopAction('CopyAnimePage', () => CopyAnimePage(animeID));
    },
    openAnimeFolder(animeID) {
      return runLegacyDesktopAction('OpenAnimeFolder', () => OpenAnimeFolder(animeID));
    },
    copyAnimeFolder(animeID) {
      return runLegacyDesktopAction('CopyAnimeFolder', () => CopyAnimeFolder(animeID));
    },
    pickFolder(title) {
      // A failed dialog rejects as internal since the shell slice; its pickers still read it as a cancel.
      return invokeGoBinding('PickFolder', () => PickFolder(title), () => '').catch(() => '');
    },
    pickFile(title) {
      // A failed dialog rejects as internal since the shell slice; its pickers still read it as a cancel.
      return invokeGoBinding('PickFile', () => PickFile(title), () => '').catch(() => '');
    },
  };

  return BRIDGE_RUNTIME_SOURCE_STATE.sharedSource as BridgeRuntimeSource & AnimeEditorRuntimeSource;
}

/** Shared bridge source singleton used across feature hooks and stores. */
export const bridgeRuntimeSource = createBridgeRuntimeSource(); // eslint-disable-line dharness/role-file-shape
