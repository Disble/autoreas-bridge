import { Typography } from '@heroui/react';
import { ACTIVITY_HOUR_CHART_CLASS } from './activity-now.constants';
import type { ActivityHourChartProps } from './activity-now.types';

/**
 * The last 24 hours as one bar per hour: height is the hour's requests
 * against the busiest hour, the red top is the failed share, and an hour
 * without data is a dashed outline, never a zero bar. The whole chart is one
 * image whose text alternative carries the totals.
 */
export function ActivityHourChart({ bars, summary }: ActivityHourChartProps) {
  return (
    <div className="flex flex-col gap-2">
      <Typography color="muted" type="body-sm">
        Last 24 hours
      </Typography>
      <div aria-label={summary} className={ACTIVITY_HOUR_CHART_CLASS} role="img">
        {bars.map((bar) => (
          <div className="flex h-full min-w-0 flex-1 flex-col justify-end" data-hour-bar={bar.isGap ? 'gap' : 'data'} key={bar.key} title={bar.title}>
            {bar.isGap ? (
              <div className="h-full rounded-sm border border-dashed border-muted" />
            ) : (
              <div className="flex flex-col overflow-hidden rounded-sm bg-accent/60" style={{ height: `${bar.heightPercent}%` }}>
                <div className="bg-danger" style={{ height: `${bar.failedPercent}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
