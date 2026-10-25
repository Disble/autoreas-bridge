import { ANIME_SCHEDULE_ROW_CAPTION_CLASS, ANIME_SCHEDULE_ROW_GRID_CLASS, ANIME_SCHEDULE_WEEK_CELL_CLASS } from './anime-schedule-card.constants';
import type { AnimeScheduleDayRowProps } from './anime-schedule-card.types';

/**
 * Renders one captioned row of day cells. A cell the anime is placed in is
 * tinted with its name at full strength, plus its place when it has one, the
 * number strong and "of M" muted on one line; other cells are dimmed with the
 * name only.
 */
export function AnimeScheduleDayRow({ caption, listLabel, days }: Readonly<AnimeScheduleDayRowProps>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span aria-hidden="true" className={ANIME_SCHEDULE_ROW_CAPTION_CLASS}>{caption}</span>
      <ol aria-label={listLabel} className={ANIME_SCHEDULE_ROW_GRID_CLASS}>
        {days.map((day) => (
          <li aria-label={day.ariaLabel} className={`${ANIME_SCHEDULE_WEEK_CELL_CLASS} ${day.isScheduled ? 'bg-accent/10' : 'bg-default/40'}`} key={day.id}>
            <span className={`truncate text-sm font-semibold ${day.isScheduled ? 'text-foreground' : 'text-muted'}`}>{day.label}</span>
            {day.position === undefined ? null : (
              <span className="whitespace-nowrap text-sm text-muted"><strong className="text-lg text-foreground">{day.position.order}</strong> of {day.position.total}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
