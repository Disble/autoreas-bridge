import type { DragEndEvent } from '@dnd-kit/dom';
import { move } from '@dnd-kit/helpers';
import { useCallback, useState } from 'react';
import type { DownloadsSource, HosterPriorityItem } from '../../../../shared/contracts/download.types';
import { toErrorMessage } from '../../../../shared/helpers/error-message.helpers';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_DOWNLOADS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { DOWNLOADS_CONFIG_KEY } from '../../../../shared/query/query-keys/query-keys.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import { HOSTER_PRIORITY_NO_ITEMS } from './hoster-priority-editor.constants';
import {
  applyHosterPriorityOrder,
  toHosterPriorityEditorViewModel,
  toHosterPriorityRequestItems,
} from './hoster-priority-editor.helpers';
import type { HosterPrioritySave } from './hoster-priority-editor.types';

/**
 * useHosterPriorityEditor loads the persisted hoster priority order together with
 * the site scope it belongs to, and exposes an optimistic `reorder` mutation that
 * saves back to that same site — the backend owns the site name. The new order
 * is applied immediately, persisted via `setHosterPriority`, and rolled back
 * (with an error surfaced) if persistence fails. `onDragEnd` is the
 * @dnd-kit/react boundary: dnd-kit's `move` helper owns the index math, and the
 * resulting key order is what gets persisted — once, on drop.
 *
 * @param source The downloads port the order is read and saved through.
 * @returns The editor state and its reorder actions.
 */
export function useHosterPriorityEditor(source: DownloadsSource = BRIDGE_DOWNLOADS_SOURCE) {
  // 2. State
  const [orderedItems, setOrderedItems] = useState<readonly HosterPriorityItem[] | undefined>(undefined);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | undefined>(undefined);

  // 4. Queries/Mutations
  const configQuery = useBridgeQuery({ queryKey: DOWNLOADS_CONFIG_KEY, queryFn: () => source.getDownloadConfig(), module: 'downloads' });
  const { mutateAsync: saveOrder, isPending: isSaving } = useBridgeMutation({
    mutationFn: ({ site, items }: HosterPrioritySave) =>
      source.setHosterPriority(site, toHosterPriorityRequestItems(toHosterPriorityEditorViewModel(items, { isSaving: false }).items)),
    // A stored order re-reads the config, so a later mount starts from what was saved.
    onSuccess: () => {
      void configQuery.refetch();
    },
  });

  // 5. Derived State (useMemo)
  const configView = toAsyncView(configQuery, () => false);
  const config = configView.kind === 'ready' ? configView.data : undefined;
  const items = orderedItems ?? config?.hosterPriority ?? HOSTER_PRIORITY_NO_ITEMS;
  const site = config?.hosterPrioritySite ?? '';
  const loadErrorMessage = configView.kind === 'failure' ? toErrorMessage(configQuery.error, 'Failed to load hoster priority') : undefined;
  const errorMessage = saveErrorMessage ?? loadErrorMessage;

  // 6. Callbacks (useCallback calling pure helpers)
  const reorder = useCallback(
    async (orderedKeys: readonly string[]) => {
      // Never guess a site: writing to the wrong scope persists an ordering the
      // download engine never reads, which looks exactly like a silent success.
      if (site === '') {
        setSaveErrorMessage('Hoster priority has no site to save to.');
        return;
      }

      const previousItems = items;
      const nextItems = applyHosterPriorityOrder(items, orderedKeys);
      setOrderedItems(nextItems);
      setSaveErrorMessage(undefined);

      try {
        await saveOrder({ site, items: nextItems });
      } catch (error) {
        setOrderedItems(previousItems);
        setSaveErrorMessage(toErrorMessage(error, 'Failed to save hoster priority'));
      }
    },
    [items, saveOrder, site],
  );

  // Persist once on drop. A canceled drag, or one that lands the item back where
  // it started, must not fire a write.
  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (event.canceled) {
        return;
      }

      const currentKeys = items.map((item) => item.hoster);
      const nextKeys = move(currentKeys, event);

      if (nextKeys.length === currentKeys.length && nextKeys.every((key, index) => key === currentKeys[index])) {
        return;
      }

      await reorder(nextKeys);
    },
    [items, reorder],
  );

  const viewModel = toHosterPriorityEditorViewModel(items, { isSaving, errorMessage });
  const status = configView.kind === 'loading' ? 'loading' : viewModel.status;

  return {
    status,
    items: viewModel.items,
    isSaving,
    errorMessage,
    reorder,
    onDragEnd,
  };
}
