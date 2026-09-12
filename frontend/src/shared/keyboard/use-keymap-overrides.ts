import { useEffect } from 'react';
import { preferencesSource } from '../../infrastructure/preferences-source/preferences-source.helpers';
import type { PreferencesSource } from '../../infrastructure/preferences-source/preferences-source.types';
import { loadKeymapOverrides } from './keymap-load.helpers';

/**
 * Loads the persisted keymap document once and publishes the result into the
 * shared keyboard store (design D11). Delegates to `loadKeymapOverrides`
 * (design D2), so this hook's initial load and a post-import reload
 * (`useBackupImport`'s `onConfirm`) run the exact same code path.
 * @param source The preferences port to load from. Defaults to the shared runtime singleton; injectable so a test can prove both outcomes without a real Wails binding.
 */
export function useKeymapOverrides(source: Pick<PreferencesSource, 'getKeymap'> = preferencesSource): void {
  // 7. Effects
  useEffect(() => {
    void loadKeymapOverrides(source);
  }, [source]);
}
