import linkIcon from '@iconify-icons/solar/link-round-bold-duotone';
import { IconActionButton } from './IconActionButton/IconActionButton';
import type { OpenPageButtonProps } from './OpenPageButton.types';

/**
 * Renders the round "Open page" icon button shared by row action groups (the
 * intake rows and the Daily board's Sin ver rows), so every row opens its page
 * the same way and with the same look. It never navigates the WebView itself:
 * the press hands the URL to `onOpen`, which opens it in the external browser.
 */
export function OpenPageButton({ name, pageUrl, onOpen }: Readonly<OpenPageButtonProps>) {
  return <IconActionButton ariaLabel={`Open the page for ${name}`} icon={linkIcon} tone="accent" tooltip="Open page" onPress={() => onOpen(pageUrl)} />;
}
