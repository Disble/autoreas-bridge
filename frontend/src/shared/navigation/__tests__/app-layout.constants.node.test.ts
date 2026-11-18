import { describe, expect, it } from 'vitest';
import { APP_LAYOUT_NAV_GROUPS } from '../app-layout.constants';
import { flattenNavItems } from '../app-layout.helpers';

describe('APP_LAYOUT_NAV_GROUPS', () => {
  it('keeps the pinned SYSTEM group as Activity, Notifications, then Settings', () => {
    const system = APP_LAYOUT_NAV_GROUPS.find((group) => group.id === 'system');

    expect(system?.pinned).toBe(true);
    expect(system?.items.map((item) => item.label)).toEqual(['Activity', 'Notifications', 'Settings']);
  });

  it('totals 10 nav items across 3 groups', () => {
    expect(APP_LAYOUT_NAV_GROUPS).toHaveLength(3);
    expect(flattenNavItems(APP_LAYOUT_NAV_GROUPS)).toHaveLength(10);
  });
});
