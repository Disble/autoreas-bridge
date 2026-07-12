import { useCallback, useEffect, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.helpers';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { HosterPriorityItem } from '../../../../shared/contracts/download.types';
import { HOSTER_PRIORITY_DEFAULT_SITE } from './hoster-priority-editor.constants';
import {
  moveHosterPriorityItem,
  toHosterPriorityEditorViewModel,
  toHosterPriorityRequestItems,
} from './hoster-priority-editor.helpers';
import type {
  HosterPriorityDropPosition,
  HosterPriorityEditorState,
} from './hoster-priority-editor.types';

/**
 * useHosterPriorityEditor loads the persisted hoster priority order for
 * `DEFAULT_SITE` and exposes an optimistic `reorder` mutation: the new order
 * is applied to local state immediately, persisted via `setHosterPriority`,
 * and rolled back (with an error surfaced) if persistence fails.
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
    async (draggedKey: string, targetKey: string, dropPosition: HosterPriorityDropPosition) => {
      const previousItems = state.items;
      const nextItems = moveHosterPriorityItem(state.items, draggedKey, targetKey, dropPosition);

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
  };
}
