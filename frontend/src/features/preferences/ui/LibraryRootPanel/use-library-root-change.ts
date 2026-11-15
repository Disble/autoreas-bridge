import { useCallback, useState } from 'react';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { libraryRootPreviewOutcome } from './library-root-panel.helpers';
import type { PendingLibraryRootChange, UseLibraryRootChangeOptions } from './library-root-panel.types';

/**
 * useLibraryRootChange previews a root save through `useBridgeMutation` and
 * holds it for confirmation when active animes would follow the new root (ADR
 * 027 D4). A save that moves nothing persists straight away; a confirmed change
 * persists, a cancelled one leaves the root unsaved; a preview that cannot be
 * computed fails with its message.
 */
export function useLibraryRootChange({ source, root, persist, fail }: Readonly<UseLibraryRootChangeOptions>) {
  // 2. State
  const [pendingChange, setPendingChange] = useState<PendingLibraryRootChange | null>(null);

  // 4. Queries/Mutations
  const preview = useBridgeMutation({
    mutationFn: (path: string) => source.previewLibraryRootChange(path),
    onSuccess: (served, path) => {
      const outcome = libraryRootPreviewOutcome(served, path);
      if (outcome.kind === 'save') {
        persist();
        return;
      }
      setPendingChange(outcome.pending);
    },
    onError: (error) => {
      fail(error.message);
    },
  });

  // 5. Derived State
  const changeCount = pendingChange?.moves.length ?? 0;

  // 6. Callbacks
  const { mutate } = preview;
  const onSave = useCallback(() => mutate(root), [mutate, root]);

  const onConfirmChange = useCallback(() => {
    setPendingChange(null);
    persist();
  }, [persist]);

  const onCancelChange = useCallback(() => {
    setPendingChange(null);
  }, []);

  const onChangeOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setPendingChange(null);
    }
  }, []);

  return { pendingChange, changeCount, isPreviewing: preview.isPending, onSave, onConfirmChange, onCancelChange, onChangeOpenChange };
}
