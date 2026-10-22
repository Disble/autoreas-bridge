import type { IconifyIcon } from '@iconify/types';
import type { IconActionTone } from './IconActionButton/icon-action-button.types';

/**
 * Props for the private single-button desktop action: an icon-only button
 * whose primary press opens a resource and whose secondary click (context
 * menu) copies its path/URL. The tooltip names the action, with the real value
 * on its second line.
 */
export interface DesktopActionButtonProps {
  /** Accessible label, including the secondary-click hint. */
  readonly ariaLabel: string;
  /** The action's short name, shown first in the tooltip (`Open folder`). */
  readonly tooltip: string;
  /** The meaning the icon tints toward on hover. */
  readonly tone: IconActionTone;
  /** The rendered icon. */
  readonly icon: IconifyIcon;
  /** The real path/URL shown on the tooltip's second line. */
  readonly path: string;
  /** Called on primary press. */
  readonly onOpen: () => void | Promise<void>;
  /** Called on secondary click (context menu). */
  readonly onCopy: () => void | Promise<void>;
}
