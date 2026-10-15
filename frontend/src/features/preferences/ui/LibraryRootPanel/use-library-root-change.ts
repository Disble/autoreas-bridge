import { useCallback, useState } from 'react';
import { LIBRARY_ROOT_ERROR_MESSAGE } from './library-root-panel.constants';
import { libraryRootPreviewOutcome } from './library-root-panel.helpers';
import type { PendingLibraryRootChange, UseLibraryRootChangeOptions } from './library-root-panel.types';

/**
 * useLibraryRootChange previews a root save and holds it for confirmation when
 * active animes would follow the new root (ADR 027 D4). A save that moves
 * nothing persists straight away; a confirmed change persists, a cancelled one
 * leaves the root unsaved.
 */
export function useLibraryRootChange({ source, root, persist, fail, setIsSaving }: Readonly<UseLibraryRootChangeOptions>) {
  // 2. State
  const [pendingChange, setPendingChange] = useState<PendingLibraryRootChange | null>(null);

  // 5. Derived State
  const changeCount = pendingChange?.moves.length ?? 0;

  // 6. Callbacks
  const onSave = useCallback(() => {
    setIsSaving(true);
    return source
      .previewLibraryRootChange(root)
      .then((preview) => {
        setIsSaving(false);
        const outcome = libraryRootPreviewOutcome(preview, root);
        if (outcome.kind === 'save') {
          return persist();
        }
        if (outcome.kind === 'failed') {
          fail(outcome.message);
        } else {
          setPendingChange(outcome.pending);
        }
        return undefined;
      })
      .catch(() => {
        setIsSaving(false);
        fail(LIBRARY_ROOT_ERROR_MESSAGE);
      });
  }, [fail, persist, root, setIsSaving, source]);

  const onConfirmChange = useCallback(() => {
    setPendingChange(null);
    return persist();
  }, [persist]);

  const onCancelChange = useCallback(() => {
    setPendingChange(null);
  }, []);

  const onChangeOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setPendingChange(null);
    }
  }, []);

  return { pendingChange, changeCount, onSave, onConfirmChange, onCancelChange, onChangeOpenChange };
}
