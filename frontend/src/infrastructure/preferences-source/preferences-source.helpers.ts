import {
  GetAutoStartEnabled,
  GetDownloadsRoot,
  GetSeasonMode,
  PickFolder,
  SetAutoStartEnabled,
  SetDownloadsRoot,
} from '../../../wailsjs/go/desktop/App';
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
    getDownloadsRoot() {
      return waitForBindings(() => hasGoBinding('GetDownloadsRoot')).then((isReady) => {
        return isReady ? GetDownloadsRoot() : Promise.resolve('');
      });
    },
    setDownloadsRoot(path: string) {
      return waitForBindings(() => hasGoBinding('SetDownloadsRoot')).then((isReady) => {
        return isReady ? SetDownloadsRoot(path) : Promise.resolve('runtime unavailable');
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
  };

  return PREFERENCES_SOURCE_STATE.sharedSource;
}

/** Shared preferences source singleton used across hooks and stores. */
export const preferencesSource = createPreferencesSource(); // eslint-disable-line dharness/role-file-shape
