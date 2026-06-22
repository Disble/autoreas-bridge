import { describe, expect, it } from 'vitest';
import {
  moveHosterPriorityItem,
  toHosterPriorityEditorViewModel,
  toHosterPriorityRequestItems,
} from '../hoster-priority-editor.helpers';
import type { HosterPriorityItem } from '../../../../../shared/contracts/download.types';

const fixture: readonly HosterPriorityItem[] = [
  { hoster: 'mega', priority: 0, enabled: true },
  { hoster: 'mediafire', priority: 1, enabled: true },
  { hoster: 'drive', priority: 2, enabled: false },
];

describe('toHosterPriorityEditorViewModel', () => {
  it('maps each item to a stable id and preserves order', () => {
    const viewModel = toHosterPriorityEditorViewModel(fixture, { isSaving: false });

    expect(viewModel.status).toBe('ready');
    expect(viewModel.items).toEqual([
      { id: 'mega', hoster: 'mega', priority: 0, enabled: true },
      { id: 'mediafire', hoster: 'mediafire', priority: 1, enabled: true },
      { id: 'drive', hoster: 'drive', priority: 2, enabled: false },
    ]);
  });

  it('reports "empty" status when there are no hosters configured', () => {
    const viewModel = toHosterPriorityEditorViewModel([], { isSaving: false });

    expect(viewModel.status).toBe('empty');
    expect(viewModel.items).toEqual([]);
  });

  it('carries isSaving through to the view model', () => {
    const viewModel = toHosterPriorityEditorViewModel(fixture, { isSaving: true });

    expect(viewModel.isSaving).toBe(true);
  });

  it('carries an error message through to the view model when provided', () => {
    const viewModel = toHosterPriorityEditorViewModel(fixture, {
      isSaving: false,
      errorMessage: 'Failed to save',
    });

    expect(viewModel.status).toBe('error');
    expect(viewModel.errorMessage).toBe('Failed to save');
  });
});

describe('moveHosterPriorityItem', () => {
  it('moves an item before the target and renumbers priority sequentially', () => {
    const reordered = moveHosterPriorityItem(fixture, 'drive', 'mega', 'before');

    expect(reordered.map((item) => item.hoster)).toEqual(['drive', 'mega', 'mediafire']);
    expect(reordered.map((item) => item.priority)).toEqual([0, 1, 2]);
  });

  it('moves an item after the target when the drop position is "after"', () => {
    const reordered = moveHosterPriorityItem(fixture, 'mega', 'drive', 'after');

    expect(reordered.map((item) => item.hoster)).toEqual(['mediafire', 'drive', 'mega']);
  });

  it('returns the same order unchanged when the dragged key equals the target key', () => {
    const reordered = moveHosterPriorityItem(fixture, 'mega', 'mega', 'before');

    expect(reordered.map((item) => item.hoster)).toEqual(['mega', 'mediafire', 'drive']);
  });

  it('preserves the enabled flag of every moved item', () => {
    const reordered = moveHosterPriorityItem(fixture, 'drive', 'mega', 'before');

    const drive = reordered.find((item) => item.hoster === 'drive');
    expect(drive?.enabled).toBe(false);
  });
});

describe('toHosterPriorityRequestItems', () => {
  it('strips the synthetic id field, keeping only the wire-shape fields', () => {
    const rows = [
      { id: 'mega', hoster: 'mega', priority: 0, enabled: true },
      { id: 'drive', hoster: 'drive', priority: 1, enabled: false },
    ];

    expect(toHosterPriorityRequestItems(rows)).toEqual([
      { hoster: 'mega', priority: 0, enabled: true },
      { hoster: 'drive', priority: 1, enabled: false },
    ]);
  });
});
