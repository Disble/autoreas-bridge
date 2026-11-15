import { GetLibraryRoot, GetKeymap, GetSeasonMode, PickFolder, SetKeymap } from '../../../wailsjs/go/desktop/App';
import { PREFERENCES_SOURCE_STATE } from './preferences-source.constants';
import type { PreferencesSource } from './preferences-source.types';
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
        // The settings module rejects while it starts or after it failed; anime create and
        // season intake still read that as an unset root, as the binding answered before.
        return isReady ? GetLibraryRoot().catch(() => '') : Promise.resolve('');
      });
    },
    pickFolder(title: string) {
      return waitForBindings(() => hasGoBinding('PickFolder')).then((isReady) => {
        // A failed dialog rejects as internal since the shell slice; its pickers still read it as a cancel.
        return isReady ? PickFolder(title).catch(() => '') : Promise.resolve('');
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
