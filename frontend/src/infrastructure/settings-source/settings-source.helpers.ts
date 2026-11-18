import {
  GetAutoStartEnabled,
  GetKeymap,
  GetLibraryRoot,
  GetSeasonCheckTime,
  PreviewLibraryRootChange,
  SetAutoStartEnabled,
  SetKeymap,
  SetLibraryRoot,
  SetSeasonCheckTime,
} from '../../../wailsjs/go/desktop/App';
import type { LibraryRootChangePreview, SettingsSource } from '../../shared/contracts/settings.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Calls one Settings binding: its rejection becomes a `BridgeError`, and a
 * binding that never attaches rejects as `unavailable` instead of answering a
 * fallback value.
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns What the binding answered.
 */
function callSettingsBinding<T>(bindingName: string, call: () => Promise<T>): Promise<T> {
  return withBridgeErrors(
    invokeGoBinding(bindingName, call, () => Promise.reject(createBridgeError('unavailable', `the ${bindingName} binding is not attached`))),
  );
}

/**
 * The Wails adapter of the `SettingsSource` port (ADR-032 §4), built once in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`. Every `settings`
 * module call rejects with the module's `unavailable` / `failed_precondition`
 * failure rather than answer `''`, a default or a status string.
 * @returns The source.
 */
export function createSettingsSource(): SettingsSource {
  return {
    getLibraryRoot: () => callSettingsBinding('GetLibraryRoot', () => GetLibraryRoot()),
    setLibraryRoot: (path) => callSettingsBinding('SetLibraryRoot', () => SetLibraryRoot(path)),
    previewLibraryRootChange: (path) =>
      callSettingsBinding<LibraryRootChangePreview>('PreviewLibraryRootChange', () => PreviewLibraryRootChange(path)),
    getAutoStartEnabled: () => callSettingsBinding('GetAutoStartEnabled', () => GetAutoStartEnabled()),
    setAutoStartEnabled: (enabled) => callSettingsBinding('SetAutoStartEnabled', () => SetAutoStartEnabled(enabled)),
    getKeymap: () => callSettingsBinding('GetKeymap', () => GetKeymap()),
    setKeymap: (document) => callSettingsBinding('SetKeymap', () => SetKeymap(document)),
    getSeasonCheckTime: () => callSettingsBinding('GetSeasonCheckTime', GetSeasonCheckTime),
    setSeasonCheckTime: (value) => callSettingsBinding('SetSeasonCheckTime', () => SetSeasonCheckTime(value)),
  };
}
