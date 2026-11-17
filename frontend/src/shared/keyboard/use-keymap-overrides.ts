import { useEffect } from 'react';
import type { SettingsSource } from '../contracts/settings.types';
import { BRIDGE_SETTINGS_SOURCE } from '../query/bridge-runtime/bridge-runtime.constants';
import { loadKeymapOverrides } from './keymap-load.helpers';

/**
 * Loads the persisted keymap document once and publishes the result into the
 * shared keyboard store (design D11). Delegates to `loadKeymapOverrides`
 * (design D2), so this hook's initial load and a post-import reload
 * (`useBackupImport`'s `onConfirm`) run the exact same code path, including
 * the wait for the `settings` module.
 * @param source The settings port to load from. Defaults to the app's settings source; injectable so a test can prove the wiring without a real Wails binding.
 * @param waitForSettings Settles once the `settings` module is ready or failed. Defaults to the app's readiness gate inside `loadKeymapOverrides`.
 */
export function useKeymapOverrides(
  source: Pick<SettingsSource, 'getKeymap'> = BRIDGE_SETTINGS_SOURCE,
  waitForSettings?: () => Promise<void>,
): void {
  // 7. Effects
  useEffect(() => {
    void loadKeymapOverrides(source, waitForSettings);
  }, [source, waitForSettings]);
}
