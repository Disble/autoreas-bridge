import { Button, Card, Chip } from '@heroui/react';
import type { NotificationSelectionBarProps } from './notification-selection-bar.types';

/**
 * Bulk-action toolbar for the notification master list. Renders only while
 * one or more rows are selected (notification-center spec, "A selection bar
 * appears only while rows are selected") -- returns `null` otherwise, so the
 * caller (`NotificationCenterPanel`) never needs to conditionally mount it.
 *
 * The lifecycle action swaps with the view: Archive in the active view,
 * Restore in the archived one. They are never both on offer, because each is
 * a no-op in the other's view.
 */
export function NotificationSelectionBar({
  onArchive,
  onClearSelection,
  onMarkRead,
  onRestore,
  selectedCount,
  view,
}: Readonly<NotificationSelectionBarProps>) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <Card>
      <Card.Content className="flex flex-row items-center justify-between gap-3">
        <Chip color="default" size="sm" variant="soft">
          <Chip.Label>{selectedCount} selected</Chip.Label>
        </Chip>
        <div className="flex flex-row gap-2">
          <Button onPress={onMarkRead} size="sm" variant="secondary">
            Mark read
          </Button>
          {view === 'archived' ? (
            <Button onPress={onRestore} size="sm" variant="secondary">
              Restore
            </Button>
          ) : (
            <Button onPress={onArchive} size="sm" variant="secondary">
              Archive
            </Button>
          )}
          <Button onPress={onClearSelection} size="sm" variant="ghost">
            Clear selection
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}
