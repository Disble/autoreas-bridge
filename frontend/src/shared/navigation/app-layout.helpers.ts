import type { NavGroup, NavItem } from './app-layout.types';

/**
 * Flattens grouped nav items into a single ordered list, preserving group
 * order and each group's internal item order. Used by the mobile tab bar,
 * which renders a single row instead of the desktop rail's grouped sections.
 */
export function flattenNavItems(groups: readonly NavGroup[]): readonly NavItem[] {
  return groups.flatMap((group) => group.items);
}
