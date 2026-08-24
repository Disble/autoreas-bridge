import { Checkbox, Table, Tooltip } from '@heroui/react';
import type { NotificationRow } from '../../../../shared/contracts/notification-center.types';
import {
  NOTIFICATION_TABLE_ARIA_LABEL,
  NOTIFICATION_TABLE_DEFAULT_SORT,
  NOTIFICATION_TABLE_LOAD_MORE_LABEL,
  NOTIFICATION_TABLE_SELECTION_COLUMN_WIDTH,
  NOTIFICATION_TABLE_SOURCE_COLUMN_WIDTH,
  NOTIFICATION_TABLE_WHEN_COLUMN_WIDTH,
} from './notification-table.constants';
import { formatNotificationWhen } from './notification-table.helpers';
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
 * row) -- never hand-rolled selection state.
 */
export function NotificationTable({
  hasNextPage,
  isLoading,
  onLoadMore,
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

/** One notification row: a selection checkbox, a truncation-tooltipped title, source, and formatted timestamp. */
function NotificationTableRow({ row }: Readonly<{ row: NotificationRow }>) {
  const { isDisabled, ref } = useTruncationTooltip();

  return (
    <Table.Row id={row.id}>
      <Table.Cell>
        <NotificationTableSelectionCheckbox ariaLabel={`Select ${row.title}`} />
      </Table.Cell>
      <Table.Cell>
        <Tooltip isDisabled={isDisabled}>
          <Tooltip.Trigger>
            <span className="block truncate" ref={ref}>
              {row.title}
            </span>
          </Tooltip.Trigger>
          <Tooltip.Content>{row.title}</Tooltip.Content>
        </Tooltip>
      </Table.Cell>
      <Table.Cell>
        <span className="block truncate text-default-500">{row.source}</span>
      </Table.Cell>
      <Table.Cell>
        <span className="block truncate font-mono text-[11px] text-default-500">
          {formatNotificationWhen(row.createdAtMs)}
        </span>
      </Table.Cell>
    </Table.Row>
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
