import { GetDownloadsRoot, GetSeasonMode, PickFolder, SetDownloadsRoot } from '../../../wailsjs/go/main/App';
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
        return isReady ? (GetSeasonMode() as Promise<boolean>) : Promise.resolve(false);
      });
    },
    getDownloadsRoot() {
      return waitForBindings(() => hasGoBinding('GetDownloadsRoot')).then((isReady) => {
        return isReady ? (GetDownloadsRoot() as Promise<string>) : Promise.resolve('');
      });
    },
    setDownloadsRoot(path: string) {
      return waitForBindings(() => hasGoBinding('SetDownloadsRoot')).then((isReady) => {
        return isReady ? (SetDownloadsRoot(path) as Promise<string>) : Promise.resolve('runtime unavailable');
      });
    },
    pickFolder(title: string) {
      return waitForBindings(() => hasGoBinding('PickFolder')).then((isReady) => {
        return isReady ? (PickFolder(title) as Promise<string>) : Promise.resolve('');
      });
    },
  };

  return PREFERENCES_SOURCE_STATE.sharedSource;
}

/** Shared preferences source singleton used across hooks and stores. */
export const preferencesSource = createPreferencesSource();
