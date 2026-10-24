import { Link, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import openIcon from '@iconify-icons/solar/link-round-bold-duotone';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { RUN_HISTORY_COPY_CONFIRMATIONS } from './run-history-panel.constants';
import type { RunHistoryManualLinksProps } from './run-history-panel.types';

/**
 * The manual-download links an offline JDownloader left for one anime: each
 * hoster URL on one truncated line, with Copy link and Open in browser. Both
 * the URL and the open icon are plain external links, as the links were
 * before this redesign.
 */
export function RunHistoryManualLinks({ links, onCopy }: Readonly<RunHistoryManualLinksProps>) {
  if (links.length === 0) {
    return null;
  }

  return (
    <ul className="flex min-w-0 flex-col gap-0.5 pl-11">
      {links.map((url) => (
        <li className="flex min-w-0 items-center gap-1" key={url}>
          <Link className="block min-w-0 flex-1 truncate font-mono text-[13px] no-underline hover:underline" href={url} rel="noreferrer" target="_blank">
            {url.replace(/^https?:\/\//, '')}
          </Link>
          <IconActionButton ariaLabel="Copy link" icon={copyIcon} tooltip="Copy link" variant="ghost" onPress={() => onCopy(url, RUN_HISTORY_COPY_CONFIRMATIONS.link)} />
          <Tooltip delay={300}>
            <Link
              aria-label="Open in browser"
              className="inline-grid size-8 shrink-0 place-items-center rounded-full text-muted no-underline hover:bg-default hover:text-foreground"
              href={url}
              rel="noreferrer"
              target="_blank"
            >
              <Icon aria-hidden="true" className="size-[18px]" icon={openIcon} />
            </Link>
            <Tooltip.Content showArrow>
              <Tooltip.Arrow />
              Open in browser
            </Tooltip.Content>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
