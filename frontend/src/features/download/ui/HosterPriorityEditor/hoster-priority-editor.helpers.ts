import type { HosterPriorityItem } from '../../../../shared/contracts/download.types';
import type {
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
 * Reorders `items` to match `orderedKeys` (hoster names) and renumbers every
 * item's `priority` sequentially (0-based). The key list comes from dnd-kit's
 * `move` helper, which owns all index math; this helper only projects that
 * order back onto the wire-shape items. Unknown or repeated keys are ignored,
 * and any item absent from `orderedKeys` is appended in its original relative
 * order so a partial key list can never drop a configured hoster.
 */
export function applyHosterPriorityOrder(
  items: readonly HosterPriorityItem[],
  orderedKeys: readonly string[],
): readonly HosterPriorityItem[] {
  const byKey = new Map(items.map((item) => [item.hoster, item]));
  const reordered: HosterPriorityItem[] = [];

  for (const key of orderedKeys) {
    const item = byKey.get(key);
    if (item !== undefined) {
      reordered.push(item);
      byKey.delete(key);
    }
  }

  for (const item of items) {
    if (byKey.has(item.hoster)) {
      reordered.push(item);
    }
  }

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
