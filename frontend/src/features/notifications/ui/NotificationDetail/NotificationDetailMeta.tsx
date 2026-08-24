import { Typography } from '@heroui/react';
import { NOTIFICATION_DETAIL_META_TESTID } from './notification-detail.constants';
import type { NotificationDetailMetaProps } from './notification-detail.types';

/**
 * The pane's metadata footer: the labelled values that identify WHICH record
 * this is — `Kind` and `Correlation ID` (design-canvas `Main.dc.html`). The
 * correlation id is the only field tying a notification back to the run that
 * produced it.
 *
 * Rendered as a description list because that is what it is: label/value
 * pairs, not a form and not a table. `entries` arrives already filtered by
 * `buildNotificationMetaEntries`, so an absent field renders as absent and a
 * record identified by neither grows no empty block at all.
 */
export function NotificationDetailMeta({ entries }: Readonly<NotificationDetailMetaProps>) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="flex flex-col gap-2" data-testid={NOTIFICATION_DETAIL_META_TESTID}>
      {entries.map((entry) => (
        <div className="flex items-center justify-between gap-3" key={entry.label}>
          <dt className="shrink-0 text-sm text-default-500">{entry.label}</dt>
          <dd className="min-w-0 truncate">
            <Typography.Code>{entry.value}</Typography.Code>
          </dd>
        </div>
      ))}
    </dl>
  );
}
