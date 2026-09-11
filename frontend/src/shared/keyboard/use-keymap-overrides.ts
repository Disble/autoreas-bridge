import { useEffect } from 'react';
import { preferencesSource } from '../../infrastructure/preferences-source/preferences-source.helpers';
import type { PreferencesSource } from '../../infrastructure/preferences-source/preferences-source.types';
import { failKeymapLoad, setKeymapOverrides } from './keyboard-scope.helpers';
import { parseKeymap } from './keymap.helpers';

/**
 * Loads the persisted keymap document once and publishes the result into the
 * shared keyboard store (design D11). No outcome strands anything: before
 * this resolves `overrides` stays `{}`, so every command already answers to
 * its declared chord -- the correct degraded behaviour, not a defect, because
 * shortcuts must keep working during the load.
 *
 * The two failing outcomes are deliberately NOT the same. A document that
 * arrived and could not be read as a keymap is `'loaded'` with no overrides:
 * `parseKeymap` degrades garbage, a wrong version and an absent value alike
 * to `{}`. A rejected read -- an unattached binding, a throw -- is
 * `'failed'`, which is what earns the panel its error state. Collapsing the
 * two would make a broken runtime indistinguishable from a user who has
 * rebound nothing, and the spec requires the panel to tell them apart.
 * @param source The preferences port to load from. Defaults to the shared runtime singleton; injectable so a test can prove both outcomes without a real Wails binding.
 */
export function useKeymapOverrides(source: Pick<PreferencesSource, 'getKeymap'> = preferencesSource): void {
  // 7. Effects
  useEffect(() => {
    source
      .getKeymap()
      .then((document) => {
        setKeymapOverrides(parseKeymap(document));
      })
      .catch(failKeymapLoad);
  }, [source]);
}
