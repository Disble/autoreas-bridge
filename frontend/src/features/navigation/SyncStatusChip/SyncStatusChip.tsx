import { Chip } from '@heroui/react';
import { Link } from 'react-router';
import { useSyncStatusChip } from './use-sync-status-chip';

/**
 * Rail footer chip reflecting the live desktop ↔ mobile sync status.
 * Activating it navigates to the Devices page.
 */
export function SyncStatusChip() {
  const { isLoading, linkTo, status, statusTone } = useSyncStatusChip();

  return (
    <Link className="flex items-center gap-2 text-[11px] text-muted hover:text-foreground" to={linkTo}>
      <span className="truncate">Desktop ↔ Mobile sync</span>
      {!isLoading && (
        <Chip color={statusTone} size="sm" variant="soft">
          <Chip.Label>{status}</Chip.Label>
        </Chip>
      )}
    </Link>
  );
}
