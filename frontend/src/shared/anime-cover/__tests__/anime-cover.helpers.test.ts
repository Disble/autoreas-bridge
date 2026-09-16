import { describe, expect, it } from 'vitest';
import { normalizeStoredCoverPath } from '../anime-cover.helpers';

describe('normalizeStoredCoverPath', () => {
  it('trims surrounding whitespace from a valid stored path', () => {
    expect(normalizeStoredCoverPath('  C:/legacy/portadas/frieren.jpg  ')).toBe(
      'C:/legacy/portadas/frieren.jpg',
    );
  });

  it.each([[undefined], [''], ['   '], ['null']])(
    'rejects %j as an undefined (no-cover) stored path',
    (stored) => {
      expect(normalizeStoredCoverPath(stored)).toBeUndefined();
    },
  );
});
