import { Typography } from '@heroui/react';
import { ACTIVITY_CALENDAR_CELL_CLASS, ACTIVITY_CALENDAR_GRID_CLASS } from './activity-history.constants';
import type { ActivityHistoryCalendarProps } from './activity-history.types';

/**
 * The 90-day calendar, one column per week: filled squares by daily volume,
 * outlined squares before recording began, dashed squares for missing days,
 * and a red ring on incident days. The grid is one image whose text
 * alternative carries the totals.
 */
export function ActivityHistoryCalendar({ model }: ActivityHistoryCalendarProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Typography color="muted" type="body-sm">
        Last 90 days
      </Typography>
      <div aria-label={model.summary} className={ACTIVITY_CALENDAR_GRID_CLASS} role="img">
        {Array.from({ length: model.leadingBlanks }, (_unused, index) => (
          <span className={ACTIVITY_CALENDAR_CELL_CLASS} key={`blank-${index}`} />
        ))}
        {model.cells.map((cell) => (
          <span className={`${ACTIVITY_CALENDAR_CELL_CLASS} ${cell.className}`} data-calendar-day={cell.state} key={cell.key} title={cell.title} />
        ))}
      </div>
    </div>
  );
}
