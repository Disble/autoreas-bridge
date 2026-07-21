import type { IconifyIcon } from '@iconify/react';

/** A single navigable entry rendered by the rail and mobile tab bar. */
export type NavItem = {
  readonly to: string;
  readonly label: string;
  readonly icon: IconifyIcon;
};

/** A named cluster of nav items rendered as a rail section. */
export type NavGroup = {
  readonly id: string;
  readonly label: string;
  readonly pinned?: boolean;
  readonly items: readonly NavItem[];
};
