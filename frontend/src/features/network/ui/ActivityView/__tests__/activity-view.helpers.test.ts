import { describe, expect, it } from 'vitest';
import { selectionKeysFor } from '../activity-view.helpers';

describe('selectionKeysFor', () => {
  it.each([
    {
      description: 'maps a cleared selection to an empty key set',
      expected: [] as string[],
      selectedId: null,
    },
    {
      description: 'maps a selected row id to a one-element key set',
      expected: ['event-1'],
      selectedId: 'event-1',
    },
  ])('$description', ({ expected, selectedId }) => {
    expect(selectionKeysFor(selectedId)).toEqual(expected);
  });
});
