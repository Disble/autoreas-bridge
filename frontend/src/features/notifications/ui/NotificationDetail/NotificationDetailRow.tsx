import { Chip } from '@heroui/react';
import { CoverPlaceholderScene } from '../../../../shared/ui/CoverPlaceholderScene';
import { NOTIFICATION_DETAIL_COLLAPSED_ROW_ARIA_LABEL } from './notification-detail.constants';
import { isCollapsedRow } from './notification-detail.helpers';
import { NotificationDetailActionButton } from './NotificationDetailActionButton';
import type { NotificationDetailRowProps } from './notification-detail.types';
import { NotificationDetailShowAllLink } from './NotificationDetailShowAllLink';

/**
 * One row of the detail pane's single bounded row-list block. A row carrying
 * `collapsedCount > 0` renders as ONE dashed summary line instead of the
 * four-part anatomy below (notification-center spec, "Uneventful rows
 * collapse into a single summary line") -- collapsing already happened
 * server-side, so this component never fans a collapsed row back out into
 * several rows.
 *
 * Every other row always carries the same four parts (design-canvas
 * `Anatomy.dc.html`): which one it is (cover + name), what happened to it
 * (a status word, never colour alone), the specific detail line, and 0..N
 * per-row actions -- some rows (e.g. a plain "run completed" row) carry
 * none.
 */
export function NotificationDetailRow({ actions, coverEntry, notificationId, row, source }: Readonly<NotificationDetailRowProps>) {
  if (isCollapsedRow(row)) {
    return (
      <div aria-label={NOTIFICATION_DETAIL_COLLAPSED_ROW_ARIA_LABEL} className="rounded-xl border border-dashed border-default-200 px-3 py-2 text-center text-xs text-default-400" role="status">
        <span>{row.detail}</span> &mdash; <NotificationDetailShowAllLink />
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded-2xl border border-default-200 bg-default-50 p-2.5">
      <NotificationDetailRowCover dataUrl={coverEntry?.status === 'cover' ? coverEntry.dataUrl : undefined} name={row.name} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">{row.name}</span>
          <Chip color="default" size="sm" variant="soft">
            <Chip.Label>{row.status}</Chip.Label>
          </Chip>
        </div>
        <p className="mb-1.5 text-xs text-default-500">{row.detail}</p>
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" data-testid="notification-detail-row-actions">
            {actions.map((action) => (
              <NotificationDetailActionButton action={action} key={action.id} notificationId={notificationId} source={source} variant="secondary" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A row's cover slot: the resolved cover art, or the shared placeholder
 * scene when absent -- the row itself never carries image bytes
 * (notification-center spec, "A row never carries embedded image bytes").
 */
function NotificationDetailRowCover({ dataUrl, name }: Readonly<{ readonly dataUrl?: string; readonly name: string }>) {
  return (
    <div className="relative size-11 shrink-0 overflow-hidden rounded-lg">
      {dataUrl === undefined ? <CoverPlaceholderScene className="absolute inset-0 size-full" /> : <img alt={name} className="absolute inset-0 size-full object-cover" src={dataUrl} />}
    </div>
  );
}
