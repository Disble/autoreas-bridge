import { Chip } from '@heroui/react';
import { LabeledCheckbox } from '../../../../shared/ui/LabeledCheckbox';
import { SeasonCoverThumb } from '../SeasonCoverThumb/SeasonCoverThumb';
import { getDailyBoardRowNameId } from './daily-board.helpers';
import type { DailyBoardWatchListProps } from './daily-board.types';

/**
 * The rows of one conveyor section, all at once so a top-to-bottom scan finds
 * every anime: each row in board order led by its checkbox when the list is
 * selectable (named by the visible anime name through `aria-labelledby`), then
 * its cover, its name (truncated, the full name as its tooltip) and the
 * section's trailing chip when `getRowChip` returns one.
 */
export function DailyBoardWatchList({ label, listClassName, rows, getCoverThumb, getRowChip, selection }: Readonly<DailyBoardWatchListProps>) {
  return (
    <ul aria-label={label} className={listClassName}>
      {rows.map((row) => {
        const rowChip = getRowChip(row);
        const nameId = getDailyBoardRowNameId(row.id);
        return (
          <li key={row.id} className="flex min-w-0 items-center gap-2 text-sm text-foreground">
            {selection !== undefined && (
              <LabeledCheckbox
                aria-labelledby={nameId}
                isSelected={selection.selected.has(row.animeId)}
                onChange={() => selection.onToggle(row.animeId)}
              >
                {null}
              </LabeledCheckbox>
            )}
            <SeasonCoverThumb {...getCoverThumb(row.animeId)} />
            <span className="min-w-0 truncate" id={nameId} title={row.rawName}>
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
