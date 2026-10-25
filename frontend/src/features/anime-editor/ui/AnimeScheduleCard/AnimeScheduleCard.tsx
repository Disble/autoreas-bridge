import calendarIcon from '@iconify-icons/solar/calendar-linear';
import { Icon } from '@iconify/react';
import { Alert, Button, Card, Skeleton } from '@heroui/react';
import {
  ANIME_SCHEDULE_CARD_DESCRIPTION,
  ANIME_SCHEDULE_CARD_OPEN_LABEL,
  ANIME_SCHEDULE_CARD_TITLE,
  ANIME_SCHEDULE_ROW_GRID_CLASS,
  ANIME_SCHEDULE_SEASON_CAPTION,
  ANIME_SCHEDULE_SEASON_LABEL,
  ANIME_SCHEDULE_SEASON_SKELETON_COUNT,
  ANIME_SCHEDULE_WEEK_CAPTION,
  ANIME_SCHEDULE_WEEK_CELL_CLASS,
  ANIME_SCHEDULE_WEEK_FAILED_TITLE,
  ANIME_SCHEDULE_WEEK_LABEL,
  ANIME_SCHEDULE_WEEK_LOADING_LABEL,
  ANIME_SCHEDULE_WEEK_SKELETON_COUNT,
} from './anime-schedule-card.constants';
import type { AnimeScheduleCardProps } from './anime-schedule-card.types';
import { AnimeScheduleDayRow } from './AnimeScheduleDayRow';

/**
 * Renders the Editor's Schedule card (S16): its primary "Open schedule editor" button,
 * a seven-day week strip and, below it on the same grid, the season row (Sin
 * ver, Ver hoy, Visto) whatever the season mode, so a history anime still
 * shows the section it was left in. Loading, failure and the rows never coexist.
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
        <Button variant="primary" onPress={onOpenSchedule}>
          <Icon aria-hidden="true" className="size-[18px]" icon={calendarIcon} />
          {ANIME_SCHEDULE_CARD_OPEN_LABEL}
        </Button>
      </Card.Header>
      <Card.Content className="min-w-0">
        {week.status === 'loading' ? (
          <div aria-labelledby="anime-schedule-week-loading-label" aria-live="polite" role="status">
            <span className="sr-only" id="anime-schedule-week-loading-label">{ANIME_SCHEDULE_WEEK_LOADING_LABEL}</span>
            <div className="flex min-w-0 flex-col gap-3">
              {[ANIME_SCHEDULE_WEEK_SKELETON_COUNT, ANIME_SCHEDULE_SEASON_SKELETON_COUNT].map((count) => (
                <div className="flex min-w-0 flex-col gap-1.5" key={count}>
                  <Skeleton className="h-4 w-16 rounded-md" />
                  <div className={ANIME_SCHEDULE_ROW_GRID_CLASS}>
                    {Array.from({ length: count }, (_unused, index) => (
                      <Skeleton className={ANIME_SCHEDULE_WEEK_CELL_CLASS} data-testid="anime-schedule-week-skeleton" key={index} />
                    ))}
                  </div>
                </div>
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
          <div className="flex min-w-0 flex-col gap-3">
            <AnimeScheduleDayRow caption={ANIME_SCHEDULE_WEEK_CAPTION} days={week.days} listLabel={ANIME_SCHEDULE_WEEK_LABEL} />
            {week.seasonDays.length === 0 ? null : (
              <AnimeScheduleDayRow caption={ANIME_SCHEDULE_SEASON_CAPTION} days={week.seasonDays} listLabel={ANIME_SCHEDULE_SEASON_LABEL} />
            )}
          </div>
        ) : null}
      </Card.Content>
    </Card>
  );
}
