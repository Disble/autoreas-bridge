import { ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.constants';
import { WEEKDAYS } from './ordering-board.constants';
import { OrderingLane } from './OrderingLane';
import type { OrderingWeekdayGridProps } from './ordering-weekday-grid.types';

/**
 * OrderingWeekdayGrid lays the seven weekday lanes out as one grid, Lunes→Domingo. It
 * is the only place the weekday row's layout is decided, so the board and the layout
 * gate measure the same markup. The tracks follow the room the grid's CONTAINER leaves
 * (not the window): each lane is at least 16rem, or the whole width when less is left,
 * so the lanes wrap into as many comfortable columns as fit and never scroll sideways.
 * Presentational: every lane renders through `OrderingLane`, and the card actions pass
 * through untouched.
 */
export function OrderingWeekdayGrid({ columns, ...containerActions }: Readonly<OrderingWeekdayGridProps>) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-2">
      {WEEKDAYS.map((day) => (
        <OrderingLane
          key={day}
          containerId={day}
          label={day}
          listClassName="flex flex-col gap-1.5"
          emptyMessage={ANIME_SCHEDULE_ORDERING_EMPTY_MESSAGE}
          showNewcomerTag
          cards={columns[day] ?? []}
          {...containerActions}
        />
      ))}
    </div>
  );
}
