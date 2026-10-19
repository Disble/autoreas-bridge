import { useCallback, useMemo, useState } from 'react';
import { toAnimeEditorLifecycleConfirmation } from './anime-editor-workspace.helpers';
import type { AnimeEditorLifecycleAction, AnimeEditorLifecycleCommands } from './anime-editor-workspace.types';

/**
 * Owns the one confirmation dialog shared by deactivate, restore and repeat:
 * which action awaits confirmation, its copy, and running only that command
 * once confirmed. Split out of `useAnimeEditorWorkspace` so that hook stays
 * under the complexity ceiling `fallow audit` enforces.
 */
export function useAnimeEditorLifecycleConfirmation({ onDeactivate, onRestore, onRepeat }: Readonly<AnimeEditorLifecycleCommands>) {
  // 2. State
  const [lifecycleAction, setLifecycleAction] = useState<AnimeEditorLifecycleAction | undefined>(undefined);

  // 5. Derived State (useMemo)
  const lifecycleConfirmation = useMemo(() => (lifecycleAction === undefined ? undefined : toAnimeEditorLifecycleConfirmation(lifecycleAction)), [lifecycleAction]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onCancelLifecycleAction = useCallback(() => setLifecycleAction(undefined), []);
  const onConfirmLifecycleAction = useCallback(async () => {
    setLifecycleAction(undefined);
    if (lifecycleAction === 'deactivate') {
      await onDeactivate();
    } else if (lifecycleAction === 'restore') {
      await onRestore();
    } else if (lifecycleAction === 'repeat') {
      await onRepeat();
    }
  }, [lifecycleAction, onDeactivate, onRepeat, onRestore]);

  return {
    lifecycleConfirmation,
    /** Asks to confirm a lifecycle action; the state setter is stable, so it needs no callback of its own. */
    onRequestLifecycleAction: setLifecycleAction as (action: AnimeEditorLifecycleAction) => void,
    onCancelLifecycleAction,
    onConfirmLifecycleAction,
  };
}
