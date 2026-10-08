import { Chip } from '@heroui/react';
import { SeasonCoverThumb } from '../SeasonCoverThumb/SeasonCoverThumb';
import type { DailyBoardWatchListProps } from './daily-board.types';

/**
 * The rows of one read-only conveyor section, all at once so a top-to-bottom
 * scan finds every anime: each row in board order with its cover, its name
 * (truncated, the full name as its tooltip) and the section's trailing chip
 * when `getRowChip` returns one.
 */
export function DailyBoardWatchList({ label, listClassName, rows, getCoverThumb, getRowChip }: Readonly<DailyBoardWatchListProps>) {
  return (
    <ul aria-label={label} className={listClassName}>
      {rows.map((row) => {
        const rowChip = getRowChip(row);
        return (
          <li key={row.id} className="flex min-w-0 items-center gap-2 text-sm text-foreground">
            <SeasonCoverThumb {...getCoverThumb(row.animeId)} />
            <span className="min-w-0 truncate" title={row.rawName}>
              {row.rawName}
            </span>
            {rowChip !== null && (
              <Chip className="shrink-0" color={rowChip.color} size="sm" variant="soft">
                {rowChip.label}
              </Chip>
            )}
          </li>
        );
      })}
    </ul>
  );
}
