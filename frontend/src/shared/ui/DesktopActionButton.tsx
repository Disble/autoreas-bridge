import { IconActionButton } from './IconActionButton/IconActionButton';
import type { DesktopActionButtonProps } from './DesktopActionButton.types';

/**
 * Renders one icon-only desktop-action button: press opens, secondary click
 * (context menu) copies, and the tooltip names the action with the real path
 * on its second line. Used by `AnimeDesktopActions` to render its page and
 * folder buttons without repeating the wiring at each call site.
 */
export function DesktopActionButton({ ariaLabel, tooltip, tone, icon, path, onOpen, onCopy }: Readonly<DesktopActionButtonProps>) {
  return (
    <IconActionButton
      ariaLabel={ariaLabel}
      detail={path}
      icon={icon}
      tone={tone}
      tooltip={tooltip}
      onContextMenu={() => void onCopy()}
      onPress={() => void onOpen()}
    />
  );
}
