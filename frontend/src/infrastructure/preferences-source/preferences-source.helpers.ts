import {
  GetAutoStartEnabled,
  GetLibraryRoot,
  GetKeymap,
  GetSeasonMode,
  PickFolder,
  PreviewLibraryRootChange,
  SetAutoStartEnabled,
  SetLibraryRoot,
  SetKeymap,
} from '../../../wailsjs/go/desktop/App';
import { PREFERENCES_SOURCE_STATE } from './preferences-source.constants';
import type { LibraryRootChangePreview, PreferencesSource } from './preferences-source.types';
import { hasGoBinding, waitForBindings } from '../wails-bindings.helpers';

/**
 * Creates the singleton runtime-backed preferences source with safe degraded defaults.
 */
export function createPreferencesSource(): PreferencesSource {
  if (PREFERENCES_SOURCE_STATE.sharedSource !== null) {
    return PREFERENCES_SOURCE_STATE.sharedSource;
  }

  PREFERENCES_SOURCE_STATE.sharedSource = {
    getSeasonMode() {
      return waitForBindings(() => hasGoBinding('GetSeasonMode')).then((isReady) => {
        return isReady ? GetSeasonMode() : Promise.resolve(false);
      });
    },
    getLibraryRoot() {
      return waitForBindings(() => hasGoBinding('GetLibraryRoot')).then((isReady) => {
        return isReady ? GetLibraryRoot() : Promise.resolve('');
      });
    },
    setLibraryRoot(path: string) {
      return waitForBindings(() => hasGoBinding('SetLibraryRoot')).then((isReady) => {
        return isReady ? SetLibraryRoot(path) : Promise.resolve('runtime unavailable');
      });
    },
    previewLibraryRootChange(path: string) {
      return waitForBindings(() => hasGoBinding('PreviewLibraryRootChange')).then((isReady): Promise<LibraryRootChangePreview> => {
        return isReady
          ? PreviewLibraryRootChange(path)
          : Promise.resolve({ oldRoot: '', moves: [], kept: [], message: 'runtime unavailable' });
      });
    },
    pickFolder(title: string) {
      return waitForBindings(() => hasGoBinding('PickFolder')).then((isReady) => {
        return isReady ? PickFolder(title) : Promise.resolve('');
      });
    },
    getAutoStartEnabled() {
      return waitForBindings(() => hasGoBinding('GetAutoStartEnabled')).then((isReady) => {
        return isReady ? GetAutoStartEnabled() : Promise.resolve(true);
      });
    },
    setAutoStartEnabled(enabled: boolean) {
      return waitForBindings(() => hasGoBinding('SetAutoStartEnabled')).then((isReady) => {
        return isReady ? SetAutoStartEnabled(enabled) : Promise.resolve('runtime unavailable');
      });
    },
    getKeymap() {
      return waitForBindings(() => hasGoBinding('GetKeymap')).then((isReady) => {
        return isReady ? GetKeymap() : Promise.resolve('');
      });
    },
    setKeymap(document: string) {
      return waitForBindings(() => hasGoBinding('SetKeymap')).then((isReady) => {
        return isReady ? SetKeymap(document) : Promise.resolve('runtime unavailable');
      });
    },
  };

  return PREFERENCES_SOURCE_STATE.sharedSource;
}

/** Shared preferences source singleton used across hooks and stores. */
export const preferencesSource = createPreferencesSource(); // eslint-disable-line dharness/role-file-shape
