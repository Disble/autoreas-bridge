import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import downloadIcon from '@iconify-icons/solar/download-minimalistic-bold';
import closeIcon from '@iconify-icons/tabler/x';
import type { RunHistoryRunRowProps } from './run-history-panel.types';
import { RunHistoryRunCount } from './RunHistoryRunCount';
import { RunHistoryStatusIcon } from './RunHistoryStatusIcon';

/**
 * One run in the master list: the trigger tile (its raw value on hover), the
 * trigger label, the start time and duration, then the downloaded and failed
 * counts and the status icon. A run with neither shows how many episodes it
 * found.
 */
export function RunHistoryRunRow({ row, onSelectRun }: Readonly<RunHistoryRunRowProps>) {
  const hasCounts = row.episodesDownloaded > 0 || row.episodesFailed > 0;

  return (
    <Button
      aria-pressed={row.isSelected}
      className={`h-auto w-full justify-start gap-3 rounded-xl px-2.5 py-2 text-left font-normal ${row.isSelected ? 'bg-default' : 'bg-transparent hover:bg-default/60'}`}
      variant="ghost"
      onPress={() => onSelectRun(row.runId)}
    >
      <Tooltip>
        <span className="grid size-8 shrink-0 place-items-center rounded-[.6rem] bg-surface-secondary text-muted">
          <Icon aria-hidden="true" className="size-4" icon={row.triggerPresentation.icon} />
        </span>
        <Tooltip.Content showArrow>
          <Tooltip.Arrow />
          {row.trigger}
        </Tooltip.Content>
      </Tooltip>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{row.triggerPresentation.label}</span>
        <span className="whitespace-nowrap text-xs text-muted tabular-nums">
          {row.timeLabel}
          {row.durationLabel === undefined ? null : ` · ${row.durationLabel}`}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-[13px] text-muted tabular-nums">
        {row.episodesDownloaded > 0 ? <RunHistoryRunCount count={row.episodesDownloaded} icon={downloadIcon} iconClassName="text-success" label="downloaded" /> : null}
        {row.episodesFailed > 0 ? <RunHistoryRunCount count={row.episodesFailed} icon={closeIcon} iconClassName="text-danger" label="failed" /> : null}
        {row.status === undefined ? null : <RunHistoryStatusIcon status={row.status} />}
        {!hasCounts && row.status === undefined ? <span>{row.episodesFound} found</span> : null}
      </span>
    </Button>
  );
}
