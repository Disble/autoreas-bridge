import { CoverPlaceholderScene } from '../../../../shared/ui/CoverPlaceholderScene';
import type { AppNotificationRow } from '../../../../shared/contracts/app-notification.types';
import { NOTIFICATION_TOAST_ROWS_LIMIT, NOTIFICATION_TOAST_ROWS_TESTID } from './notification-resolver.constants';
import type { NotificationToastCoverSource } from './use-notification-toast-covers';
import { useNotificationToastCovers } from './use-notification-toast-covers';

/**
 * The toast's row block: which anime this notification is about, as the
 * `Toast.dc.html` artboard draws it -- cover, name, and the line that says
 * which episodes.
 *
 * It renders no per-row action. A surface measured in seconds should not ask
 * the user to choose between row verbs; the row is identity here, and the
 * Center record is one press away for anything finer
 * (docs/notification-cta-policy.md, Table C).
 *
 * A component rather than a branch inside `renderAppToastContent`, because
 * resolving cover art needs a hook and that function is invoked as a plain
 * function -- by `ToastProvider` internally and directly in tests -- never as
 * JSX, so it cannot hold hooks of its own.
 */
export function NotificationToastRows({
  rows,
  coverSource,
}: Readonly<{ readonly rows: readonly AppNotificationRow[]; readonly coverSource?: NotificationToastCoverSource }>) {
  const shown = rows.slice(0, NOTIFICATION_TOAST_ROWS_LIMIT);
  const covers = useNotificationToastCovers(shown, coverSource);
  const hidden = rows.length - shown.length;

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="flex max-w-full flex-col gap-1.5 [min-inline-size:0]" data-testid={NOTIFICATION_TOAST_ROWS_TESTID}>
      {shown.map((row) => (
        <NotificationToastRow key={`${row.refType}:${row.refId}:${row.name}`} dataUrl={covers.get(row.refId)} row={row} />
      ))}
      {hidden > 0 ? <p className="text-xs text-default-400">{`+${hidden} more`}</p> : null}
    </div>
  );
}

/**
 * One row. A collapsed row stands in for anime it does not name, so it renders
 * as its own summary line rather than borrowing the cover-and-name anatomy of
 * a row that names one thing.
 */
function NotificationToastRow({ dataUrl, row }: Readonly<{ readonly dataUrl?: string; readonly row: AppNotificationRow }>) {
  if ((row.collapsedCount ?? 0) > 0) {
    return <p className="text-xs text-default-400 [overflow-wrap:anywhere]">{row.detail}</p>;
  }

  return (
    <div className="flex items-center gap-2 [min-inline-size:0]">
      <div className="relative size-8 shrink-0 overflow-hidden rounded-md">
        {dataUrl === undefined ? (
          <CoverPlaceholderScene className="absolute inset-0 size-full" />
        ) : (
          <img alt={row.name} className="absolute inset-0 size-full object-cover" src={dataUrl} />
        )}
      </div>
      <div className="flex-1 [min-inline-size:0]">
        <p className="text-xs font-semibold text-foreground line-clamp-2 [overflow-wrap:anywhere]">{row.name}</p>
        <p className="text-[11px] text-default-500 line-clamp-2 [overflow-wrap:anywhere]">{row.detail}</p>
      </div>
    </div>
  );
}
