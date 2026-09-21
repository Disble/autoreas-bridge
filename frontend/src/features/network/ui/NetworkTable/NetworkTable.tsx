import { Chip, Table } from '@heroui/react';
import { ACTIVITY_RAIL_SCROLLER_CLASS } from '../ActivityView/activity-view.constants';
import {
  NETWORK_EVENTS_TABLE_COLUMN_COUNT,
  NETWORK_EVENTS_TABLE_SPACER_BOTTOM_ID,
  NETWORK_EVENTS_TABLE_SPACER_TOP_ID,
  NETWORK_LOADING_STATE_MESSAGE,
} from '../NetworkPanel/network-panel.constants';
import { getNetworkDomainColor, getNetworkLevelAccentBorderClass, getNetworkLevelColor } from '../NetworkPanel/network-panel.helpers';
import type { NetworkTableProps } from '../NetworkPanel/network-panel.types';
import { buildNetworkTableSkeletonRows } from './NetworkTableSkeletonRows';

/**
 * Dumb dense data grid rendering the virtualized per-event Network rows on
 * HeroUI Table (React Aria), DevTools-Network density. `rows` are exactly the
 * rows the virtual window reports in view; one spacer row above and one below
 * carry the unrendered height so the scrollbar stays honest while the mounted
 * row count stays bounded (ADR-012, live branch, virtualized). Selection is
 * driven entirely by props and lives in the store: a row may unmount once it
 * leaves the window, and the selection survives.
 *
 * The ref the virtual window hook hands down attaches to the outer container
 * because that is the element that actually scrolls: HeroUI's
 * `Table.ScrollContainer` constrains only the horizontal axis, so the vertical
 * `max-h` boundary is this div's. The virtualizer observes its rect and offset
 * directly — there is no `onScroll` handler and no load-more logic here.
 *
 * While `isLoading`, the header and column widths stay put and the body swaps
 * in skeleton rows instead of the real ones, so the table never resizes once
 * the page resolves. A `role="status"` region cannot nest inside table
 * markup, so the loading announcement sits as a sibling of the table and the
 * table itself is marked `aria-busy`.
 */
export function NetworkTable({
  rows,
  selectedId,
  onSelect,
  isLoading,
  topSpacerHeightPx,
  bottomSpacerHeightPx,
  scrollRef,
  emptyMessage,
}: Readonly<NetworkTableProps>) {
  return (
    <div className={ACTIVITY_RAIL_SCROLLER_CLASS} data-network-scroll ref={scrollRef}>
      {isLoading ? (
        <div aria-labelledby="network-table-loading-label" aria-live="polite" className="sr-only" role="status">
          <span id="network-table-loading-label">{NETWORK_LOADING_STATE_MESSAGE}</span>
        </div>
      ) : null}
      <Table aria-busy={isLoading} aria-label="Runtime events" variant="secondary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Runtime events"
            className="w-full table-fixed"
            onSelectionChange={(keys) => {
              if (keys === 'all') {
                return;
              }

              const [first] = keys;
              onSelect(String(first));
            }}
            selectedKeys={selectedId === null ? [] : [selectedId]}
            selectionMode="single"
          >
            <Table.Header>
              <Table.Column className="w-[92px]" isRowHeader>
                Time
              </Table.Column>
              <Table.Column className="w-[120px]">Domain</Table.Column>
              <Table.Column className="w-[104px]">Level</Table.Column>
              <Table.Column>Event</Table.Column>
              <Table.Column className="w-[104px]">Duration</Table.Column>
            </Table.Header>
            <Table.Body renderEmptyState={() => <span className="text-sm text-default-400">{emptyMessage}</span>}>
              {isLoading ? (
                buildNetworkTableSkeletonRows()
              ) : (
                <>
                  {rows.length > 0 ? (
                    <Table.Row
                      data-network-spacer="top"
                      id={NETWORK_EVENTS_TABLE_SPACER_TOP_ID}
                      style={{ height: topSpacerHeightPx }}
                    >
                      <Table.Cell colSpan={NETWORK_EVENTS_TABLE_COLUMN_COUNT} />
                    </Table.Row>
                  ) : null}
                  {rows.map((row) => (
                    <Table.Row className={`border-l-2 ${getNetworkLevelAccentBorderClass(row.level)}`} id={row.id} key={row.id}>
                      <Table.Cell>
                        <span className="font-mono text-[11px] text-default-500">{row.timeLabel}</span>
                      </Table.Cell>
                      <Table.Cell>
                        <Chip color={getNetworkDomainColor(row.domain)} size="sm" variant="soft">
                          {row.domain}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>
                        <Chip color={getNetworkLevelColor(row.level)} size="sm" variant="soft">
                          {row.level}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="block truncate text-foreground" title={row.message}>
                          {row.message}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className="font-mono text-[11px] text-default-500">{row.durationLabel}</span>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {rows.length > 0 ? (
                    <Table.Row
                      data-network-spacer="bottom"
                      id={NETWORK_EVENTS_TABLE_SPACER_BOTTOM_ID}
                      style={{ height: bottomSpacerHeightPx }}
                    >
                      <Table.Cell colSpan={NETWORK_EVENTS_TABLE_COLUMN_COUNT} />
                    </Table.Row>
                  ) : null}
                </>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}
