import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import type { MouseEvent } from 'react';
import type { DesktopActionButtonProps } from './DesktopActionButton.types';

/**
 * Renders one icon-only desktop-action button: press opens, secondary click
 * (context menu) copies, and a HeroUI Tooltip shows the real path. Used by
 * `AnimeDesktopActions` to render its page and folder buttons without
 * duplicating the Tooltip+Button JSX at each call site.
 */
export function DesktopActionButton({ ariaLabel, className, icon, path, onOpen, onCopy }: Readonly<DesktopActionButtonProps>) {
  return (
    <Tooltip delay={0}>
      <Button
        isIconOnly
        aria-label={ariaLabel}
        className={className}
        size="sm"
        variant="tertiary"
        onContextMenu={(event: MouseEvent) => {
          event.preventDefault();
          void onCopy();
        }}
        onPress={() => void onOpen()}
      >
        <Icon icon={icon} className="size-4" />
      </Button>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {path}
      </Tooltip.Content>
    </Tooltip>
  );
}
