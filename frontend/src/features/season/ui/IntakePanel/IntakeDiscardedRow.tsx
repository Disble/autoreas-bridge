import restoreIcon from '@iconify-icons/solar/undo-left-round-bold';
import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import type { IntakeDiscardedRowProps } from './intake-panel.types';

/**
 * IntakeDiscardedRow is one row of the Discarded view: the discarded name and
 * its icon-only Restore button, which brings the row back to the active intake
 * with whatever match it had. Presentation only.
 */
export function IntakeDiscardedRow({ row, onRestore }: Readonly<IntakeDiscardedRowProps>) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-muted/40 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-muted" title={row.rawName}>
        {row.rawName}
      </span>
      <Tooltip>
        <Button isIconOnly aria-label={`Restore ${row.rawName}`} size="sm" variant="tertiary" onPress={onRestore}>
          <Icon className="size-4" icon={restoreIcon} />
        </Button>
        <Tooltip.Content showArrow>
          <Tooltip.Arrow />
          Restore
        </Tooltip.Content>
      </Tooltip>
    </li>
  );
}
