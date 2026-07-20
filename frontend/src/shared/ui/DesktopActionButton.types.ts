import type { IconifyIcon } from '@iconify/types';

/**
 * Props for the private single-button desktop action: an icon-only button
 * whose primary press opens a resource and whose secondary click (context
 * menu) copies its path/URL, with a HeroUI Tooltip showing the real value.
 */
export interface DesktopActionButtonProps {
  /** Accessible label, including the secondary-click hint. */
  readonly ariaLabel: string;
  /** Hover intent color class (e.g. `hover:text-accent`). */
  readonly className: string;
  /** The rendered icon. */
  readonly icon: IconifyIcon;
  /** The real path/URL shown in the tooltip. */
  readonly path: string;
  /** Called on primary press. */
  readonly onOpen: () => void | Promise<void>;
  /** Called on secondary click (context menu). */
  readonly onCopy: () => void | Promise<void>;
}
