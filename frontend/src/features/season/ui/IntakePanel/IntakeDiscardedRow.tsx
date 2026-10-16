import restoreIcon from '@iconify-icons/solar/restart-bold';
import { Icon } from '@iconify/react';
import { Button, Chip, Tooltip } from '@heroui/react';
import { getMatchStatusColor, getMatchStatusLabel } from './intake-panel.helpers';
import { getRestoredMatchStatus } from './intake-view.helpers';
import { IntakeRowHints } from './IntakeRowHints';
import { SeasonCoverThumb } from '../SeasonCoverThumb/SeasonCoverThumb';
import type { IntakeDiscardedRowProps } from './intake-panel.types';

/**
 * IntakeDiscardedRow is one row of the Discarded view, shaped like an active
 * intake row: the stored cover, the name with its summary line, the chip of the
 * status a restore brings back (none when it returns matched, like an active
 * row), and one icon-only Restore button. Presentation only.
 */
export function IntakeDiscardedRow({ row, heldMetadata, onRestore }: Readonly<IntakeDiscardedRowProps>) {
  const restoredStatus = getRestoredMatchStatus(row);
  return (
    <li>
      <div className="flex items-center gap-3 border-b border-divider py-2">
        <SeasonCoverThumb coverSrc={heldMetadata?.coverURL} isLoading={false} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium text-foreground" title={row.rawName}>{row.rawName}</span>
          <IntakeRowHints creatable={false} heldMetadata={heldMetadata} row={row} />
        </div>
        {restoredStatus === 'matched' ? null : (
          <Chip color={getMatchStatusColor(restoredStatus)} size="sm" variant="soft">
            {getMatchStatusLabel(restoredStatus)}
          </Chip>
        )}
        <Tooltip>
          <Button isIconOnly aria-label={`Restore ${row.rawName}`} size="sm" variant="tertiary" onPress={onRestore}>
            <Icon className="size-4" icon={restoreIcon} />
          </Button>
          <Tooltip.Content showArrow>
            <Tooltip.Arrow />
            Restore
          </Tooltip.Content>
        </Tooltip>
      </div>
    </li>
  );
}
