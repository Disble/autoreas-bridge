import { describe, expect, it } from 'vitest';
import { APP_LAYOUT_NAV_GROUPS } from '../app-layout.constants';
import { flattenNavItems } from '../app-layout.helpers';

describe('flattenNavItems', () => {
  it('preserves group order and returns 10 flat items', () => {
    const flat = flattenNavItems(APP_LAYOUT_NAV_GROUPS);

    expect(flat).toHaveLength(10);
    expect(flat.map((item) => item.to)).toEqual([
      '/today',
      '/downloads',
      '/editor',
      '/catalog',
      '/history',
      '/season',
      '/devices',
      '/activity',
      '/notifications',
      '/settings',
    ]);
  });
});
