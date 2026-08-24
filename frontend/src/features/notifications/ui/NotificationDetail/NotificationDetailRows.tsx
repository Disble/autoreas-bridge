import { resolveRowActions } from './notification-detail.helpers';
import type { NotificationDetailRowsProps } from './notification-detail.types';
import { NotificationDetailRow } from './NotificationDetailRow';
import { useNotificationDetailCovers } from './use-notification-detail-covers';

/**
 * The single bounded row-list block a notification's detail renders as
 * (notification-center spec, "Each notification record's detail MUST be
 * rendered as a single row-list block type -- not multiple competing block
 * shapes"). Resolves each row's own actions from the shared `actions` list
 * and each row's cover art via `useNotificationDetailCovers`, then hands
 * both to the dumb `NotificationDetailRow`.
 */
export function NotificationDetailRows({ actions, notificationId, rows }: Readonly<NotificationDetailRowsProps>) {
  const covers = useNotificationDetailCovers(rows);

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        // Rows carry no stable id of their own on the wire (design.md §10's
        // `NotificationDetailRow` has no `id` field), so the key is the
        // `{refType, refId}` reference the row itself is defined by --
        // never an array index, which would misattribute local hook/DOM
        // state across rows if the backend ever reorders or inserts a row.
        <NotificationDetailRow
          actions={resolveRowActions(row, actions)}
          coverEntry={covers.get(row.refId)}
          key={`${row.refType}-${row.refId}`}
          notificationId={notificationId}
          row={row}
        />
      ))}
    </div>
  );
}
