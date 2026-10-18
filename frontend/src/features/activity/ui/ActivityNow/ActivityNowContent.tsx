import { Card, Chip, Typography } from '@heroui/react';
import { ActivityHourChart } from './ActivityHourChart';
import { ActivityNeedsALook } from './ActivityNeedsALook';
import { ActivityRecentChanges } from './ActivityRecentChanges';
import type { ActivityNowContentProps } from './activity-now.types';

/**
 * The resolved Now tab: the status sentence with its three figures, the
 * 24-hour bars, "Needs a look" beside "Recent changes", and the recorder line.
 */
export function ActivityNowContent({ model, onOpenIncident }: ActivityNowContentProps) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <Card.Content className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden className={`mt-2 size-2.5 shrink-0 rounded-full ${model.statusDotClass}`} data-status-dot />
              <div className="min-w-0">
                <Typography type="h2">{model.sentence}</Typography>
                <Typography color="muted" type="body-sm">
                  {model.contactLine}
                </Typography>
              </div>
            </div>
            <dl className="flex gap-6">
              {model.figures.map((figure) => (
                <div className="flex flex-col items-end" key={figure.label}>
                  <dt className="text-xs text-muted">{figure.label}</dt>
                  <dd className="text-xl tabular-nums text-foreground">{figure.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ActivityHourChart bars={model.bars} summary={model.chartSummary} />
        </Card.Content>
      </Card>
      <Card>
        <Card.Content className="grid gap-6 md:grid-cols-2">
          <ActivityNeedsALook incidents={model.needsALook} onOpenIncident={onOpenIncident} />
          <ActivityRecentChanges changes={model.changes} />
        </Card.Content>
      </Card>
      <div className="flex items-center gap-2">
        <Chip color="success" size="sm" variant="soft">
          Recording
        </Chip>
        <Typography color="muted" type="body-sm">
          Every request from the last 2 hours is kept
        </Typography>
      </div>
    </div>
  );
}
