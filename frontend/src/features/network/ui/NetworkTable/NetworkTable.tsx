import { Chip, Table } from '@heroui/react';
import { ACTIVITY_RAIL_SCROLLER_CLASS } from '../ActivityView/activity-view.constants';
import { NETWORK_LOADING_STATE_MESSAGE } from '../NetworkPanel/network-panel.constants';
import { getNetworkDomainColor, getNetworkLevelAccentBorderClass, getNetworkLevelColor } from '../NetworkPanel/network-panel.helpers';
import type { NetworkTableProps } from '../NetworkPanel/network-panel.types';
import { buildNetworkTableSkeletonRows } from './NetworkTableSkeletonRows';

/**
 * Dumb dense data grid rendering the windowed per-event Network rows on HeroUI Table (React Aria), DevTools-Network density. Selection and the scroll-near-bottom trigger are driven entirely by props; rows accumulate and are never unmounted (ADR-012, live branch).
 *
 * While `isLoading`, the header and column widths stay put and the body swaps
 * in skeleton rows instead of the real ones, so the table never resizes once
 * the page resolves. A `role="status"` region cannot nest inside table
 * markup, so the loading announcement sits as a sibling of the table and the
 * table itself is marked `aria-busy`.
 */
export function NetworkTable({ rows, selectedId, onSelect, onScroll, emptyMessage, isLoading }: Readonly<NetworkTableProps>) {
  return (
    <div
      className={ACTIVITY_RAIL_SCROLLER_CLASS}
      data-network-scroll
      onScroll={onScroll}
    >
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
              {isLoading ? buildNetworkTableSkeletonRows() : rows.map((row) => (
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
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}
