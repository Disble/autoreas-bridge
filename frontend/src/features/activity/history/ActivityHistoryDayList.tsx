import { Chip, Typography } from '@heroui/react';
import { ACTIVITY_HISTORY_ROW_CLASS } from './activity-history.constants';
import type { ActivityHistoryDayListProps } from './activity-history.types';

/**
 * Day groups, newest first, one line per fact, with dashed gap blocks where
 * no data was recorded. It scrolls on its own so older days load near its
 * bottom.
 */
export function ActivityHistoryDayList({ items, isLoadingMore, onScroll }: ActivityHistoryDayListProps) {
  return (
    <div aria-busy={isLoadingMore} className="flex max-h-144 min-h-0 flex-col gap-4 overflow-y-auto" data-testid="activity-history-scroll" onScroll={onScroll}>
      {items.map((item) =>
        item.kind === 'gap' ? (
          <div className="flex flex-col gap-1 rounded-lg border border-dashed border-muted px-3 py-2" data-history-gap key={item.key}>
            <Typography type="body-sm">{item.label}</Typography>
            <Typography color="muted" type="body-xs">
              {item.note}
            </Typography>
          </div>
        ) : (
          <section aria-label={item.label} className="flex flex-col" key={item.key}>
            <Typography color="muted" type="body-sm">
              {item.label}
            </Typography>
            <ul className="flex flex-col divide-y divide-separator">
              {item.lines.map((line) => (
                <li className={ACTIVITY_HISTORY_ROW_CLASS} data-history-line key={line.key}>
                  <span className="flex w-24 shrink-0 flex-col text-sm tabular-nums text-muted">
                    <span>{line.time}</span>
                    {line.phoneTime === undefined ? null : <span className="text-xs">{line.phoneTime}</span>}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-foreground">{line.title}</span>
                    {line.detail === '' ? null : <span className="truncate text-xs text-muted">{line.detail}</span>}
                    {line.chips.length === 0 ? null : (
                      <span className="flex flex-wrap gap-1 pt-1">
                        {line.chips.map((chip) => (
                          <Chip color={chip.color} key={chip.label} size="sm" variant="soft">
                            {chip.label}
                          </Chip>
                        ))}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
