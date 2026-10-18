import { Chip, Typography } from '@heroui/react';
import { ACTIVITY_RECORDER_ROW_CLASS } from './activity-recorder.constants';
import type { ActivityRecorderListProps } from './activity-recorder.types';

/**
 * The rendered window of recorder rows, newest first, in its own scroll
 * container: local time, what happened, and a status chip that stays calm
 * unless the row failed. At the cap, a note points older rows to History.
 */
export function ActivityRecorderList({ lines, isLoadingMore, isAtCap, onScroll }: ActivityRecorderListProps) {
  return (
    <div aria-busy={isLoadingMore} className="max-h-144 min-h-0 overflow-y-auto" data-testid="activity-recorder-scroll" onScroll={onScroll}>
      <ul aria-label="Recorded requests and events" className="flex flex-col divide-y divide-separator">
        {lines.map((line) => (
          <li className={ACTIVITY_RECORDER_ROW_CLASS} data-recorder-row key={line.key}>
            <span className="w-16 shrink-0 text-sm tabular-nums text-muted">{line.time}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm text-foreground">{line.title}</span>
              {line.detail === '' ? null : <span className="truncate text-xs text-muted">{line.detail}</span>}
            </span>
            {line.statusLabel === '' ? null : (
              <Chip color={line.statusColor} size="sm" variant="soft">
                {line.statusLabel}
              </Chip>
            )}
          </li>
        ))}
      </ul>
      {isAtCap ? (
        <Typography className="py-3 text-center" color="muted" type="body-sm">
          The recorder keeps the newest 500 rows. Older activity is in History.
        </Typography>
      ) : null}
    </div>
  );
}
