import { Link } from '@heroui/react';
import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import openIcon from '@iconify-icons/solar/link-round-bold-duotone';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { RUN_HISTORY_COPY_CONFIRMATIONS } from './run-history-panel.constants';
import type { RunHistoryManualLinksProps } from './run-history-panel.types';

/**
 * The manual-download links an offline JDownloader left for one anime: each
 * hoster URL on one truncated line, with Copy link and Open in browser. The
 * URL and the open icon both hand the link to `onOpenLink`, which opens the
 * default browser; neither is an anchor, which WebView2 would open in a popup.
 */
export function RunHistoryManualLinks({ links, onCopy, onOpenLink }: Readonly<RunHistoryManualLinksProps>) {
  if (links.length === 0) {
    return null;
  }

  return (
    <ul className="flex min-w-0 flex-col gap-0.5 pl-11">
      {links.map((url) => (
        <li className="flex min-w-0 items-center gap-1" key={url}>
          <Link className="block min-w-0 flex-1 cursor-pointer truncate font-mono text-[13px] no-underline hover:underline" onPress={() => onOpenLink(url)}>
            {url.replace(/^https?:\/\//, '')}
          </Link>
          <IconActionButton ariaLabel="Copy link" icon={copyIcon} tooltip="Copy link" variant="ghost" onPress={() => onCopy(url, RUN_HISTORY_COPY_CONFIRMATIONS.link)} />
          <IconActionButton ariaLabel="Open in browser" icon={openIcon} tooltip="Open in browser" variant="ghost" onPress={() => onOpenLink(url)} />
        </li>
      ))}
    </ul>
  );
}
