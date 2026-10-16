import linkIcon from '@iconify-icons/solar/link-round-bold-duotone';
import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import type { OpenPageButtonProps } from './OpenPageButton.types';

/**
 * Renders the round "Open page" icon button shared by row action groups (the
 * intake rows and the Daily board's Sin ver rows), so every row opens its page
 * the same way and with the same look. It never navigates the WebView itself:
 * the press hands the URL to `onOpen`, which opens it in the external browser.
 */
export function OpenPageButton({ name, pageUrl, onOpen }: Readonly<OpenPageButtonProps>) {
  return (
    <Tooltip>
      <Button
        isIconOnly
        aria-label={`Open the page for ${name}`}
        className="hover:text-accent"
        size="sm"
        variant="tertiary"
        onPress={() => onOpen(pageUrl)}
      >
        <Icon className="size-4" icon={linkIcon} />
      </Button>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        Open page
      </Tooltip.Content>
    </Tooltip>
  );
}
