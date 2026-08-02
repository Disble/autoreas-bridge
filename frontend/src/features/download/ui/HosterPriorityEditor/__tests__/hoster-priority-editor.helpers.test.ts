import { describe, expect, it } from 'vitest';
import {
  applyHosterPriorityOrder,
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

describe('applyHosterPriorityOrder', () => {
  it('reorders items to match the given keys and renumbers priority sequentially', () => {
    const reordered = applyHosterPriorityOrder(fixture, ['drive', 'mega', 'mediafire']);

    expect(reordered.map((item) => item.hoster)).toEqual(['drive', 'mega', 'mediafire']);
    expect(reordered.map((item) => item.priority)).toEqual([0, 1, 2]);
  });

  it('returns the same order when the keys already match the current order', () => {
    const reordered = applyHosterPriorityOrder(fixture, ['mega', 'mediafire', 'drive']);

    expect(reordered.map((item) => item.hoster)).toEqual(['mega', 'mediafire', 'drive']);
  });

  it('ignores keys that do not match any known hoster', () => {
    const reordered = applyHosterPriorityOrder(fixture, ['drive', 'ghost', 'mega', 'mediafire']);

    expect(reordered.map((item) => item.hoster)).toEqual(['drive', 'mega', 'mediafire']);
    expect(reordered.map((item) => item.priority)).toEqual([0, 1, 2]);
  });

  it('appends items missing from the key list, preserving their relative order', () => {
    const reordered = applyHosterPriorityOrder(fixture, ['drive']);

    expect(reordered.map((item) => item.hoster)).toEqual(['drive', 'mega', 'mediafire']);
    expect(reordered.map((item) => item.priority)).toEqual([0, 1, 2]);
  });

  it('never emits an item twice when a key is repeated', () => {
    const reordered = applyHosterPriorityOrder(fixture, ['drive', 'drive', 'mega', 'mediafire']);

    expect(reordered.map((item) => item.hoster)).toEqual(['drive', 'mega', 'mediafire']);
  });

  it('preserves the enabled flag of every reordered item', () => {
    const reordered = applyHosterPriorityOrder(fixture, ['drive', 'mega', 'mediafire']);

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
