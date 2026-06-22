import type { HosterPriorityItem } from '../../../../shared/contracts/download.types';
import type {
  HosterPriorityDropPosition,
  HosterPriorityEditorViewModel,
  HosterPriorityEditorViewModelOptions,
  HosterPriorityRowViewModel,
} from './hoster-priority-editor.types';

/**
 * Maps the raw `HosterPriorityItem[]` (Wails wire shape) into the editor's
 * view model: a stable `id` per row (the hoster name, which is unique),
 * plus the loading/empty/error/ready status required by the 2026
 * design-pattern quality bar.
 */
export function toHosterPriorityEditorViewModel(
  items: readonly HosterPriorityItem[],
  options: HosterPriorityEditorViewModelOptions,
): HosterPriorityEditorViewModel {
  const rows: readonly HosterPriorityRowViewModel[] = items.map((item) => ({
    id: item.hoster,
    hoster: item.hoster,
    priority: item.priority,
    enabled: item.enabled,
  }));

  if (options.errorMessage !== undefined) {
    return {
      status: 'error',
      items: rows,
      isSaving: options.isSaving,
      errorMessage: options.errorMessage,
    };
  }

  return {
    status: rows.length === 0 ? 'empty' : 'ready',
    items: rows,
    isSaving: options.isSaving,
  };
}

/**
 * Moves the item identified by `draggedKey` immediately before or after the
 * item identified by `targetKey` (per `dropPosition`), then renumbers every
 * item's `priority` sequentially (0-based) to match the new order. A no-op
 * (besides renumbering) when both keys are equal.
 */
export function moveHosterPriorityItem(
  items: readonly HosterPriorityItem[],
  draggedKey: string,
  targetKey: string,
  dropPosition: HosterPriorityDropPosition,
): readonly HosterPriorityItem[] {
  if (draggedKey === targetKey) {
    return items.map((item, index) => ({ ...item, priority: index }));
  }

  const withoutDragged = items.filter((item) => item.hoster !== draggedKey);
  const draggedItem = items.find((item) => item.hoster === draggedKey);

  if (draggedItem === undefined) {
    return items.map((item, index) => ({ ...item, priority: index }));
  }

  const targetIndex = withoutDragged.findIndex((item) => item.hoster === targetKey);
  const baseInsertAt = targetIndex === -1 ? withoutDragged.length : targetIndex;
  const insertAt = dropPosition === 'after' ? baseInsertAt + 1 : baseInsertAt;

  const reordered = [
    ...withoutDragged.slice(0, insertAt),
    draggedItem,
    ...withoutDragged.slice(insertAt),
  ];

  return reordered.map((item, index) => ({ ...item, priority: index }));
}

/**
 * Strips the synthetic `id` field from view-model rows, producing the exact
 * `HosterPriorityItem[]` wire shape `SetHosterPriority` expects.
 */
export function toHosterPriorityRequestItems(
  rows: readonly HosterPriorityRowViewModel[],
): readonly HosterPriorityItem[] {
  return rows.map(({ hoster, priority, enabled }) => ({ hoster, priority, enabled }));
}
