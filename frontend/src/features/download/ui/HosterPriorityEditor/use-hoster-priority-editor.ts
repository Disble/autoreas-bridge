import type { DragEndEvent } from '@dnd-kit/dom';
import { move } from '@dnd-kit/helpers';
import { useCallback, useEffect, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { HosterPriorityItem } from '../../../../shared/contracts/download.types';
import { HOSTER_PRIORITY_DEFAULT_SITE } from './hoster-priority-editor.constants';
import {
  applyHosterPriorityOrder,
  toHosterPriorityEditorViewModel,
  toHosterPriorityRequestItems,
} from './hoster-priority-editor.helpers';
import type { HosterPriorityEditorState } from './hoster-priority-editor.types';

/**
 * useHosterPriorityEditor loads the persisted hoster priority order for
 * `DEFAULT_SITE` and exposes an optimistic `reorder` mutation: the new order
 * is applied to local state immediately, persisted via `setHosterPriority`,
 * and rolled back (with an error surfaced) if persistence fails. `onDragEnd`
 * is the @dnd-kit/react boundary: dnd-kit's `move` helper owns the index math,
 * and the resulting key order is what gets persisted — once, on drop.
 */
export function useHosterPriorityEditor(source: DownloadRuntimeSource = downloadRuntimeSource) {
  // 1. Refs

  // 2. State
  const [state, setState] = useState<HosterPriorityEditorState>({
    items: [],
    hasLoaded: false,
    isSaving: false,
    errorMessage: undefined,
  });

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const reorder = useCallback(
    async (orderedKeys: readonly string[]) => {
      const previousItems = state.items;
      const nextItems = applyHosterPriorityOrder(state.items, orderedKeys);

      setState((prev) => ({ ...prev, items: nextItems, isSaving: true, errorMessage: undefined }));

      try {
        const rows = toHosterPriorityEditorViewModel(nextItems, { isSaving: false }).items;
        await source.setHosterPriority(HOSTER_PRIORITY_DEFAULT_SITE, toHosterPriorityRequestItems(rows));
        setState((prev) => ({ ...prev, isSaving: false }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          items: previousItems,
          isSaving: false,
          errorMessage: error instanceof Error ? error.message : 'Failed to save hoster priority',
        }));
      }
    },
    [state.items, source],
  );

  // Persist once on drop. A canceled drag, or one that lands the item back where
  // it started, must not fire a write.
  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (event.canceled) {
        return;
      }

      const currentKeys = state.items.map((item) => item.hoster);
      const nextKeys = move(currentKeys, event);

      if (nextKeys.length === currentKeys.length && nextKeys.every((key, index) => key === currentKeys[index])) {
        return;
      }

      await reorder(nextKeys);
    },
    [state.items, reorder],
  );

  // 7. Effects
  useEffect(() => {
    let active = true;

    source
      .getDownloadConfig()
      .then((config) => ({ items: config.hosterPriority, errorMessage: undefined }))
      .catch((error: unknown) => ({
        items: [] as readonly HosterPriorityItem[],
        errorMessage: error instanceof Error ? error.message : 'Failed to load hoster priority',
      }))
      .then((outcome) => {
        if (!active) {
          return;
        }

        setState((prev) => ({
          ...prev,
          items: outcome.items,
          hasLoaded: true,
          errorMessage: outcome.errorMessage,
        }));
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [source]);

  const viewModel = toHosterPriorityEditorViewModel(state.items, {
    isSaving: state.isSaving,
    errorMessage: state.errorMessage,
  });
  const status = !state.hasLoaded && state.errorMessage === undefined ? 'loading' : viewModel.status;

  return {
    status,
    items: viewModel.items,
    isSaving: state.isSaving,
    errorMessage: state.errorMessage,
    reorder,
    onDragEnd,
  };
}
