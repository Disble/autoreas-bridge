import { Button, Chip, Typography } from '@heroui/react';
import { ACTIVITY_TONE_DOT_CLASS } from '../ActivityRunStory/activity-run-story.constants';
import { ACTIVITY_INCIDENT_LIST_ROW_CLASS, ACTIVITY_INCIDENT_LIST_SCROLL_CLASS } from './activity-incidents.constants';
import type { ActivityIncidentListProps } from './activity-incidents.types';

/**
 * The left list: incidents newest first, then the runs of an internal filter,
 * each with its colored dot. Only one progressive batch is rendered; the
 * window grows as the list scrolls near its bottom.
 */
export function ActivityIncidentList({ entries, visibleCount, selectedKey, scrollRef, onScroll, onSelect }: ActivityIncidentListProps) {
  return (
    <div className={ACTIVITY_INCIDENT_LIST_SCROLL_CLASS} data-testid="activity-incident-list-scroll" onScroll={onScroll} ref={scrollRef}>
      <ul aria-label="Incidents and runs" className="flex flex-col">
        {entries.slice(0, visibleCount).map((entry) => (
          <li className="flex flex-col" data-incident-entry={entry.selection.kind} key={entry.key}>
            {entry.heading === '' ? null : (
              <Typography className="px-2 pb-1 pt-3" color="muted" type="body-xs">
                {entry.heading}
              </Typography>
            )}
            <Button
              aria-current={entry.key === selectedKey ? 'true' : undefined}
              className={`${ACTIVITY_INCIDENT_LIST_ROW_CLASS} h-auto w-full justify-start py-2 text-left`}
              onPress={() => onSelect(entry.selection)}
              variant={entry.key === selectedKey ? 'secondary' : 'ghost'}
            >
              <span aria-hidden className={`size-2 shrink-0 rounded-full ${ACTIVITY_TONE_DOT_CLASS[entry.tone]}`} data-entry-tone={entry.tone} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="min-w-0 truncate text-sm text-foreground">{entry.title}</span>
                <span className="min-w-0 truncate text-xs text-muted">{entry.meta}</span>
              </span>
              {entry.isNew ? (
                <Chip color="accent" size="sm" variant="soft">
                  New
                </Chip>
              ) : null}
              {entry.chip === undefined ? null : (
                <Chip color={entry.chip.color} size="sm" variant="soft">
                  {entry.chip.label}
                </Chip>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
