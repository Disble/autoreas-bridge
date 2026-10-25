import checkIcon from '@iconify-icons/solar/check-circle-linear';
import downloadIcon from '@iconify-icons/solar/download-minimalistic-linear';
import offIcon from '@iconify-icons/solar/forbidden-circle-linear';
import { Icon } from '@iconify/react';
import { Chip, Spinner, Tooltip } from '@heroui/react';
import type { AutoDownloadChipProps } from './auto-download-chip.types';
import { useAutoDownloadChip } from './use-auto-download-chip';

/**
 * AutoDownloadChip is the read-only state of today's scheduled download from
 * Downloads: the time, or a word or two, behind an icon, with the full sentence
 * in the tooltip and as the accessible name. Accent while something is ahead or
 * under way, muted otherwise. It renders nothing until the schedule is known,
 * nor when it could not be read.
 * The schedule is changed in Downloads, never here.
 */
export function AutoDownloadChip({ source }: Readonly<AutoDownloadChipProps>) {
  const view = useAutoDownloadChip(source);

  if (view === null) {
    return null;
  }

  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger aria-label={view.tooltip} className="inline-flex shrink-0 rounded-full">
        <Chip className="gap-1" color={view.isActive ? 'accent' : 'default'} size="md" variant="soft">
          {view.kind === 'downloading' && <Spinner color="current" size="sm" />}
          {view.kind === 'downloaded' && <Icon aria-hidden="true" className="size-4" icon={checkIcon} />}
          {(view.kind === 'scheduled' || view.kind === 'notCompleted') && <Icon aria-hidden="true" className="size-4" icon={downloadIcon} />}
          {(view.kind === 'noneToday' || view.kind === 'off') && <Icon aria-hidden="true" className="size-4" icon={offIcon} />}
          {view.label}
        </Chip>
      </Tooltip.Trigger>
      <Tooltip.Content placement="bottom" showArrow>
        <Tooltip.Arrow />
        {view.tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
