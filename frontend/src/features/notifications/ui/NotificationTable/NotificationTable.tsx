import { Badge, Checkbox, Chip, Table, Tooltip } from '@heroui/react';
import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';
import { formatRelativeTimeAgo } from '../../../../shared/datetime/datetime.helpers';
import { formatDetailWhenLabel, formatLevelLabel, resolveLevelChipColor } from '../NotificationDetail/notification-detail.helpers';
import {
  NOTIFICATION_TABLE_ARIA_LABEL,
  NOTIFICATION_TABLE_DEFAULT_SORT,
  NOTIFICATION_TABLE_LEVEL_CHIP_TESTID,
  NOTIFICATION_TABLE_LOAD_MORE_LABEL,
  NOTIFICATION_TABLE_READ_TITLE_CLASS,
  NOTIFICATION_TABLE_ROW_COUNT_TESTID,
  NOTIFICATION_TABLE_SELECTION_COLUMN_WIDTH,
  NOTIFICATION_TABLE_SOURCE_COLUMN_WIDTH,
  NOTIFICATION_TABLE_SUBJECTS_TESTID,
  NOTIFICATION_TABLE_UNREAD_LABEL,
  NOTIFICATION_TABLE_UNREAD_TITLE_CLASS,
  NOTIFICATION_TABLE_WHEN_COLUMN_WIDTH,
} from './notification-table.constants';
import {
  formatNotificationRowCount,
  formatNotificationSubjects,
  formatNotificationWhen,
  isNotificationRowUnread,
} from './notification-table.helpers';
import type { NotificationTableProps } from './notification-table.types';
import { useTruncationTooltip } from './use-truncation-tooltip';

/**
 * Dumb dense data grid rendering the notification master list on HeroUI
 * Table. Rows arrive already newest-first from the backend keyset cursor;
 * pagination (`onLoadMore`/`hasNextPage`/`isLoading`), selection state
 * (`selectedKeys`/`onSelectionChange`), and empty-state selection are all
 * owned entirely by the caller. `.table-root` is `display:grid` with
 * `minmax(0,1fr)`, so this uses `w-full table-fixed` + explicit column
 * widths + `block truncate` on cells, and never `overflow-x-clip` (it clips
 * the last column). `Table.ScrollContainer` is horizontal-only, hence the
 * separate `max-h-* overflow-y-auto` wrapper below holding the actual
 * vertical scroll. The leading 40px selection column (design.md §9.2's row
 * grid) is React Aria's own convention: an explicit `Checkbox slot="selection"`
 * in both the header (toggles "select all") and every row cell (toggles that
 * row) -- never hand-rolled selection state. Pressing the row body instead
 * raises `onRowAction`, which is how the panel opens that record's detail
 * pane: React Aria keeps the two intents apart, so a press on the selection
 * checkbox never also opens the row.
 */
export function NotificationTable({
  hasNextPage,
  isLoading,
  onLoadMore,
  onRowAction,
  onSelectionChange,
  renderEmptyState,
  rows,
  selectedKeys,
}: Readonly<NotificationTableProps>) {
  return (
    <div className="max-h-[32rem] overflow-y-auto [scrollbar-gutter:stable] 2xl:max-h-[40rem]">
      <Table aria-label={NOTIFICATION_TABLE_ARIA_LABEL} variant="secondary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label={NOTIFICATION_TABLE_ARIA_LABEL}
            className="w-full table-fixed"
            onRowAction={onRowAction}
            onSelectionChange={onSelectionChange}
            selectedKeys={selectedKeys}
            selectionMode="multiple"
            sortDescriptor={NOTIFICATION_TABLE_DEFAULT_SORT}
          >
            <Table.Header>
              <Table.Column className={NOTIFICATION_TABLE_SELECTION_COLUMN_WIDTH}>
                <NotificationTableSelectionCheckbox ariaLabel="Select all notifications" />
              </Table.Column>
              <Table.Column isRowHeader>Title</Table.Column>
              <Table.Column className={NOTIFICATION_TABLE_SOURCE_COLUMN_WIDTH}>Source</Table.Column>
              <Table.Column allowsSorting className={NOTIFICATION_TABLE_WHEN_COLUMN_WIDTH} id="when">
                When
              </Table.Column>
            </Table.Header>
            <Table.Body renderEmptyState={renderEmptyState}>
              {rows.map((row) => (
                <NotificationTableRow key={row.id} row={row} />
              ))}
              {hasNextPage ? (
                <Table.LoadMore isLoading={isLoading} onLoadMore={onLoadMore}>
                  <Table.LoadMoreContent>{NOTIFICATION_TABLE_LOAD_MORE_LABEL}</Table.LoadMoreContent>
                </Table.LoadMore>
              ) : null}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}

/** One notification row: a selection checkbox, the notification block, source, and formatted timestamp. */
function NotificationTableRow({ row }: Readonly<{ row: NotificationRow }>) {
  return (
    <Table.Row id={row.id}>
      <Table.Cell>
        <NotificationTableSelectionCheckbox ariaLabel={`Select ${row.title}`} />
      </Table.Cell>
      <Table.Cell>
        <NotificationTableNotificationCell row={row} />
      </Table.Cell>
      <Table.Cell>
        <span className="block truncate text-default-500">{row.source}</span>
      </Table.Cell>
      <Table.Cell>
        <NotificationTableWhenCell createdAtMs={row.createdAtMs} />
      </Table.Cell>
    </Table.Row>
  );
}

/**
 * The "When" cell: how long ago the record arrived, with the exact local
 * timestamp behind it.
 *
 * The column used to render the absolute stamp inline and it did not fit --
 * an 84px column truncated `2026-08-24 14:32:05` down to `2026-08...`, which
 * answers nothing at all. Relative time is what the Main artboard draws
 * ("5m ago", "yesterday") and it is the half that says whether the record
 * still matters; the absolute one is kept because "when exactly" is a real
 * question, just not the one a list column should spend its width on.
 *
 * The stamp is reachable two ways, because one of them is not enough here. On
 * hover it is the `Tooltip` this table already uses for the truncated title
 * (unconditional rather than truncation-gated: nothing here is truncated, and
 * what it reveals is a different rendering of the same instant, not the same
 * string again). But a tooltip trigger sitting inside a React Aria grid row
 * can never be FOCUSED -- the grid's own selection manager moves focus from
 * the trigger up to the row the moment it lands -- so the keyboard and
 * screen-reader path is the accessible name instead, which carries both
 * halves through the same `formatDetailWhenLabel` the detail pane's header
 * renders.
 */
function NotificationTableWhenCell({ createdAtMs }: Readonly<{ createdAtMs: number }>) {
  return (
    <Tooltip>
      <Tooltip.Trigger aria-label={formatDetailWhenLabel(createdAtMs)}>
        <span className="block truncate text-xs text-default-500">{formatRelativeTimeAgo(createdAtMs)}</span>
      </Tooltip.Trigger>
      <Tooltip.Content>{formatNotificationWhen(createdAtMs)}</Tooltip.Content>
    </Tooltip>
  );
}

/**
 * The "Notification" cell -- the one the Main artboard turned from a bare
 * title into a block. Line one carries the unread dot, the
 * truncation-tooltipped title, the severity chip and the count badge; line
 * two names the things the record is about.
 *
 * The unread mark is HeroUI's own `Badge`, which renders as a dot exactly
 * when its children are omitted. `Badge` is always absolutely positioned --
 * every `placement` variant resolves to `position: absolute`, and an omitted
 * `placement` still defaults to `top-right` -- so it MUST be composed inside
 * a `Badge.Anchor`, which is the anchored-indicator usage its docs describe.
 * Anchoring the title line (rather than the whole cell) puts the dot at that
 * line's leading edge; the anchor carries `min-w-0` so the title inside it
 * still truncates, and its own `flex-shrink: 0` only governs height here
 * because the anchor is a flex item in a COLUMN.
 *
 * The `pl-1` / `pl-3.5` pair is what keeps that overlay off the text.
 * `placement="top-left"` pins the badge to the anchor's corner and then
 * translates it by -25% of its own 16px box, so it spans from 4px OUTSIDE the
 * anchor to 12px inside it. The outer `pl-1` gives it those 4px inside the
 * cell, and the inner `pl-3.5` starts the title past the other 12 -- with the
 * subject line carrying the same 3.5 so both text lines share one left edge,
 * as the artboard draws them.
 *
 * Every affordance is conditional, and absence renders NOTHING rather than an
 * empty one: a read row carries no dot at all (the overlay occupies no space,
 * so nothing shifts when it goes), a record with no subjects grows no second
 * line, a record standing for one thing grows no "1x", and a producer that
 * reported no level grows no blank chip. A list where every row carries every
 * slot whether it has content or not is the log viewer `Anatomy.dc.html`
 * argued against.
 */
function NotificationTableNotificationCell({ row }: Readonly<{ row: NotificationRow }>) {
  const { isDisabled, ref } = useTruncationTooltip();
  const isUnread = isNotificationRowUnread(row);
  const subjects = formatNotificationSubjects(row);
  const rowCount = formatNotificationRowCount(row);

  return (
    <div className="flex min-w-0 flex-col gap-0.5 pl-1">
      <Badge.Anchor className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 pl-3.5">
          <Tooltip isDisabled={isDisabled}>
            <Tooltip.Trigger>
              <span
                className={`min-w-0 truncate ${isUnread ? NOTIFICATION_TABLE_UNREAD_TITLE_CLASS : NOTIFICATION_TABLE_READ_TITLE_CLASS}`}
                ref={ref}
              >
                {row.title}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content>{row.title}</Tooltip.Content>
          </Tooltip>
          {row.level === '' ? null : (
            <Chip color={resolveLevelChipColor(row.level)} data-testid={NOTIFICATION_TABLE_LEVEL_CHIP_TESTID} size="sm" variant="soft">
              <Chip.Label>{formatLevelLabel(row.level)}</Chip.Label>
            </Chip>
          )}
          {rowCount === undefined ? null : (
            <Chip color="default" data-testid={NOTIFICATION_TABLE_ROW_COUNT_TESTID} size="sm" variant="secondary">
              <Chip.Label>{rowCount}</Chip.Label>
            </Chip>
          )}
        </div>
        {isUnread ? <Badge aria-label={NOTIFICATION_TABLE_UNREAD_LABEL} color="accent" placement="top-left" role="img" size="sm" /> : null}
      </Badge.Anchor>
      {subjects === undefined ? null : (
        <p className="truncate pl-3.5 text-xs text-default-500" data-testid={NOTIFICATION_TABLE_SUBJECTS_TESTID}>
          {subjects}
        </p>
      )}
    </div>
  );
}

/**
 * The `slot="selection"` checkbox React Aria wires automatically to either
 * "select all" (rendered inside `Table.Header`) or one row's own toggle
 * (rendered inside a `Table.Row`'s cell) -- selection state itself is never
 * hand-rolled here (design.md §9.2).
 */
function NotificationTableSelectionCheckbox({ ariaLabel }: Readonly<{ ariaLabel: string }>) {
  return (
    <Checkbox aria-label={ariaLabel} slot="selection">
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  );
}
