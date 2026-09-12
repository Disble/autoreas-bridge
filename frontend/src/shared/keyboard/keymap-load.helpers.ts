import { preferencesSource } from '../../infrastructure/preferences-source/preferences-source.helpers';
import type { PreferencesSource } from '../../infrastructure/preferences-source/preferences-source.types';
import { failKeymapLoad, setKeymapOverrides } from './keyboard-scope.helpers';
import { parseKeymap } from './keymap.helpers';

/**
 * Loads the persisted keymap document and publishes the result into the
 * shared keyboard store (design D2). Extracted verbatim from
 * `useKeymapOverrides`'s effect body, so the hook's initial load and a
 * post-import reload (`useBackupImport`'s `onConfirm`) run the exact same
 * code path -- a restored keymap reaches the dispatcher, the `?` overlay,
 * and the Settings → Shortcuts panel with no restart, because all three
 * already read `keyboardStore` through this same publish step.
 *
 * The two failing outcomes stay distinct, exactly as in the hook this was
 * extracted from: a document that arrived but could not be read as a keymap
 * is `'loaded'` with no overrides -- `parseKeymap` degrades garbage, a wrong
 * version, and an absent value alike to `{}`. A rejected read -- an
 * unattached binding, a throw -- is `'failed'`, which is what earns the
 * panel its error state.
 * @param source The preferences port to load from. Defaults to the shared runtime singleton; injectable so a test can prove the outcome without a real Wails binding.
 * @returns A promise that resolves once the load outcome has been published, whichever outcome it was.
 */
export function loadKeymapOverrides(source: Pick<PreferencesSource, 'getKeymap'> = preferencesSource): Promise<void> {
  return source
    .getKeymap()
    .then((document) => {
      setKeymapOverrides(parseKeymap(document));
    })
    .catch(failKeymapLoad);
}
