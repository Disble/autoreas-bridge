import { Card } from '@heroui/react';
import bellIcon from '@iconify-icons/solar/bell-bold-duotone';
import { AwaitingSelectionPane } from '../../../../shared/ui/AwaitingSelectionPane/AwaitingSelectionPane';
import { NOTIFICATION_DETAIL_AWAITING } from './notification-detail.constants';
import { resolveNotificationActions } from './notification-detail.helpers';
import { NotificationDetailFooter } from './NotificationDetailFooter';
import { NotificationDetailHeader } from './NotificationDetailHeader';
import { NotificationDetailRows } from './NotificationDetailRows';
import type { NotificationDetailProps } from './notification-detail.types';

/**
 * Dumb composition of the detail pane, top to bottom: header (level chip,
 * source/time, title, body), the single bounded row-list block, and the footer
 * action area.
 *
 * The artboard also drew a metadata footer carrying `Kind` and `Correlation
 * ID`. It is gone. `Kind` restated the title in wire vocabulary and keyed no
 * filter, and a correlation id the user cannot paste anywhere in the app is an
 * argument for a link rather than a printed token
 * (docs/notification-cta-policy.md, "Metadata is not content"). Neither field
 * left the RECORD -- the store still holds both, and the forensic log still
 * carries the correlation id in its fields.
 *
 * Renders a "nothing selected" prompt when `detail` is `null`, mirroring
 * `TransactionDetail.tsx`'s own null-detail prompt.
 */
export function NotificationDetail({ detail, onReadStateChanged, source }: Readonly<NotificationDetailProps>) {
  if (detail === null) {
    return (
      <Card>
        <Card.Content className="p-4">
          <AwaitingSelectionPane
            description={NOTIFICATION_DETAIL_AWAITING.description}
            fields={NOTIFICATION_DETAIL_AWAITING.fields}
            footer={NOTIFICATION_DETAIL_AWAITING.footer}
            icon={bellIcon}
            sectionLabel={NOTIFICATION_DETAIL_AWAITING.sectionLabel}
            title={NOTIFICATION_DETAIL_AWAITING.title}
          />
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Content className="flex flex-col gap-4 p-5">
        <NotificationDetailHeader detail={detail} />
        <NotificationDetailRows actions={detail.actions} notificationId={detail.id} rows={detail.rows} source={source} />
      </Card.Content>
      <NotificationDetailFooter
        actions={resolveNotificationActions(detail.actions)}
        notificationId={detail.id}
        onReadStateChanged={onReadStateChanged}
        source={source}
      />
    </Card>
  );
}
