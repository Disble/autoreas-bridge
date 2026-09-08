import { Chip } from '@heroui/react';
import type { ScheduleRunStatusFooterProps } from './schedule-panel.types';

/** Renders the last-run/next-run summary strip, plus a "Running now" chip while a run is open. */
export function ScheduleRunStatusFooter({
  lastRunLabel,
  lastRunStatus,
  nextRunLabel,
  running,
}: Readonly<ScheduleRunStatusFooterProps>) {
  return (
    <div className="flex flex-col gap-1 text-sm text-muted">
      <div className="flex items-center gap-2">
        <span>Last run:</span>
        <span className="text-foreground">{lastRunLabel}</span>
        <Chip color={lastRunStatus === 'ok' ? 'success' : 'default'} size="sm" variant="soft">
          <Chip.Label>{lastRunStatus || '—'}</Chip.Label>
        </Chip>
      </div>
      <div className="flex items-center gap-2">
        <span>Next run:</span>
        <span className="text-foreground">{nextRunLabel}</span>
      </div>
      {running && (
        <Chip className="w-fit" color="default" size="sm" variant="soft">
          <Chip.Label>Running now</Chip.Label>
        </Chip>
      )}
    </div>
  );
}
