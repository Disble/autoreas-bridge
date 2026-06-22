import { useCallback, useEffect, useState } from 'react';
import { downloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import type { DownloadRuntimeSource } from '../../../../infrastructure/download-runtime-source';
import type { HosterPriorityItem } from '../../../../shared/contracts/download.types';
import { HOSTER_PRIORITY_DEFAULT_SITE } from './hoster-priority-editor.constants';
import {
  moveHosterPriorityItem,
  toHosterPriorityEditorViewModel,
  toHosterPriorityRequestItems,
} from './hoster-priority-editor.helpers';
import type { HosterPriorityDropPosition } from './hoster-priority-editor.types';

/**
 * useHosterPriorityEditor loads the persisted hoster priority order for
 * `DEFAULT_SITE` and exposes an optimistic `reorder` mutation: the new order
 * is applied to local state immediately, persisted via `setHosterPriority`,
 * and rolled back (with an error surfaced) if persistence fails.
 */
export function useHosterPriorityEditor(source: DownloadRuntimeSource = downloadRuntimeSource) {
  // 1. Refs

  // 2. State
  const [rawItems, setRawItems] = useState<readonly HosterPriorityItem[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)

  // 6. Callbacks (useCallback calling pure helpers)
  const reorder = useCallback(
    async (draggedKey: string, targetKey: string, dropPosition: HosterPriorityDropPosition) => {
      const previousItems = rawItems;
      const nextItems = moveHosterPriorityItem(rawItems, draggedKey, targetKey, dropPosition);

      setRawItems(nextItems);
      setIsSaving(true);
      setErrorMessage(undefined);

      try {
        const rows = toHosterPriorityEditorViewModel(nextItems, { isSaving: false }).items;
        await source.setHosterPriority(HOSTER_PRIORITY_DEFAULT_SITE, toHosterPriorityRequestItems(rows));
      } catch (error) {
        setRawItems(previousItems);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to save hoster priority');
      } finally {
        setIsSaving(false);
      }
    },
    [rawItems, source],
  );

  // 7. Effects
  useEffect(() => {
    let active = true;

    source
      .getDownloadConfig()
      .then((config) => {
        if (!active) {
          return;
        }

        setRawItems(config.hosterPriority);
        setHasLoaded(true);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : 'Failed to load hoster priority');
        setHasLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [source]);

  const viewModel = toHosterPriorityEditorViewModel(rawItems, { isSaving, errorMessage });
  const status = !hasLoaded && errorMessage === undefined ? 'loading' : viewModel.status;

  return {
    status,
    items: viewModel.items,
    isSaving,
    errorMessage,
    reorder,
  };
}
