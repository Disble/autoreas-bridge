import type { SettingsSource } from '../contracts/settings.types';
import { BRIDGE_READINESS_GATE, BRIDGE_SETTINGS_SOURCE } from '../query/bridge-runtime/bridge-runtime.constants';
import { failKeymapLoad, setKeymapOverrides } from './keyboard-scope.helpers';
import { parseKeymap } from './keymap.helpers';

/**
 * Waits for the `settings` module that serves the keymap, through the app's
 * readiness gate: resolves once it is ready, rejects once it failed.
 * @returns A promise settled by the module's readiness.
 */
function whenSettingsReady(): Promise<void> {
  return BRIDGE_READINESS_GATE.whenReady('settings');
}

/**
 * Loads the persisted keymap document and publishes the result into the
 * shared keyboard store (design D2), so the hook's initial load and a
 * post-import reload (`useBackupImport`'s `onConfirm`) run the exact same
 * code path -- a restored keymap reaches the dispatcher, the `?` overlay,
 * and the Settings → Shortcuts panel with no restart, because all three
 * already read `keyboardStore` through this same publish step.
 *
 * The read waits for the `settings` module, so the state stays `'pending'`
 * (every command on its declared chord) while it starts, instead of reading a
 * module that would refuse. The outcomes stay distinct: a document that
 * arrived, including `''` (nothing rebound) and one `parseKeymap` degrades to
 * `{}`, is `'loaded'`; a failed module or a rejected read is `'failed'`, which
 * is what earns the panel its error state.
 * @param source The settings port to read from. Defaults to the app's settings source; injectable so a test can prove each outcome without a real Wails binding.
 * @param waitForSettings Settles once the `settings` module is ready or failed. Defaults to the app's readiness gate.
 * @returns A promise that resolves once the load outcome has been published, whichever outcome it was.
 */
export function loadKeymapOverrides(
  source: Pick<SettingsSource, 'getKeymap'> = BRIDGE_SETTINGS_SOURCE,
  waitForSettings: () => Promise<void> = whenSettingsReady,
): Promise<void> {
  return waitForSettings()
    .then(() => source.getKeymap())
    .then((document) => {
      setKeymapOverrides(parseKeymap(document));
    })
    .catch(failKeymapLoad);
}
