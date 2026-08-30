import { Chip, Table } from '@heroui/react';
import { getNetworkDomainColor, getNetworkLevelAccentBorderClass, getNetworkLevelColor } from '../NetworkPanel/network-panel.helpers';
import type { NetworkTableProps } from '../NetworkPanel/network-panel.types';

/** Dumb dense data grid rendering the windowed per-event Network rows on HeroUI Table (React Aria), DevTools-Network density. Selection and the scroll-near-bottom trigger are driven entirely by props; rows accumulate and are never unmounted (ADR-012, live branch). */
export function NetworkTable({ rows, selectedId, onSelect, onScroll, emptyMessage }: Readonly<NetworkTableProps>) {
  return (
    <div
      className="max-h-[32rem] overflow-y-auto [scrollbar-gutter:stable] 2xl:max-h-[40rem]"
      data-network-scroll
      onScroll={onScroll}
    >
      <Table aria-label="Runtime events" variant="secondary">
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
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}
