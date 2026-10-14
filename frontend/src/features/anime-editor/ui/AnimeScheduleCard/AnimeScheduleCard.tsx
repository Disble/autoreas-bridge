import { Alert, Button, Card, Skeleton } from '@heroui/react';
import {
  ANIME_SCHEDULE_CARD_DESCRIPTION,
  ANIME_SCHEDULE_CARD_OPEN_LABEL,
  ANIME_SCHEDULE_CARD_TITLE,
  ANIME_SCHEDULE_WEEK_CELL_CLASS,
  ANIME_SCHEDULE_WEEK_FAILED_TITLE,
  ANIME_SCHEDULE_WEEK_LABEL,
  ANIME_SCHEDULE_WEEK_LOADING_LABEL,
  ANIME_SCHEDULE_WEEK_SKELETON_COUNT,
} from './anime-schedule-card.constants';
import type { AnimeScheduleCardProps } from './anime-schedule-card.types';

/**
 * Renders the Editor's Schedule card (S16): the "Open schedule editor" button
 * and a seven-day week strip. A day the anime airs is tinted and shows its
 * place, the number strong and "of M" muted on one line; other days are dimmed
 * with the day name only. Loading, failure and the strip never coexist.
 */
export function AnimeScheduleCard({ week, onOpenSchedule }: Readonly<AnimeScheduleCardProps>) {
  if (week.status === 'idle') return null;
  return (
    <Card className="min-w-0">
      <Card.Header className="flex flex-row flex-wrap items-center gap-3">
        <div className="min-w-48 flex-1">
          <Card.Title>{ANIME_SCHEDULE_CARD_TITLE}</Card.Title>
          <Card.Description>{ANIME_SCHEDULE_CARD_DESCRIPTION}</Card.Description>
        </div>
        <Button variant="secondary" onPress={onOpenSchedule}>{ANIME_SCHEDULE_CARD_OPEN_LABEL}</Button>
      </Card.Header>
      <Card.Content className="min-w-0">
        {week.status === 'loading' ? (
          <div aria-labelledby="anime-schedule-week-loading-label" aria-live="polite" role="status">
            <span className="sr-only" id="anime-schedule-week-loading-label">{ANIME_SCHEDULE_WEEK_LOADING_LABEL}</span>
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: ANIME_SCHEDULE_WEEK_SKELETON_COUNT }, (_unused, index) => (
                <Skeleton className={ANIME_SCHEDULE_WEEK_CELL_CLASS} data-testid="anime-schedule-week-skeleton" key={index} />
              ))}
            </div>
          </div>
        ) : null}
        {week.status === 'failed' ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{ANIME_SCHEDULE_WEEK_FAILED_TITLE}</Alert.Title>
              <Alert.Description>{week.failureMessage}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
        {week.status === 'ready' ? (
          <ol aria-label={ANIME_SCHEDULE_WEEK_LABEL} className="grid grid-cols-7 gap-2">
            {week.days.map((day) => (
              <li aria-label={day.ariaLabel} className={`${ANIME_SCHEDULE_WEEK_CELL_CLASS} ${day.position === undefined ? 'bg-default/40' : 'bg-accent/10'}`} key={day.id}>
                <span className={`truncate text-sm font-semibold ${day.position === undefined ? 'text-muted' : 'text-foreground'}`}>{day.label}</span>
                {day.position === undefined ? null : (
                  <span className="whitespace-nowrap text-sm text-muted"><strong className="text-lg text-foreground">{day.position.order}</strong> of {day.position.total}</span>
                )}
              </li>
            ))}
          </ol>
        ) : null}
      </Card.Content>
    </Card>
  );
}
