import { Chip, Table } from '@heroui/react';
import { TRANSACTION_EMPTY_STATE_MESSAGE, TRANSACTION_LOADING_STATE_MESSAGE } from '../TransactionPanel/transaction-panel.constants';
import type { TransactionTableProps } from '../TransactionPanel/transaction-panel.types';

/**
 * Dumb dense data grid rendering the filtered transaction rows on HeroUI
 * Table (React Aria), DevTools-Network density. Selection is driven
 * entirely by props.
 */
export function TransactionTable({ rows, selectedId, onSelect, isLoading }: Readonly<TransactionTableProps>) {
  return (
    <div className="max-h-[32rem] overflow-y-auto [scrollbar-gutter:stable] 2xl:max-h-[40rem]">
      <Table aria-label="Captured transactions" variant="secondary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label="Captured transactions"
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
              <Table.Column className="w-[96px]">Method</Table.Column>
              <Table.Column>Route</Table.Column>
              <Table.Column className="w-[104px]">Outcome</Table.Column>
              <Table.Column className="w-[88px]">Status</Table.Column>
              <Table.Column className="w-[104px]">Duration</Table.Column>
            </Table.Header>
            <Table.Body
              renderEmptyState={() => (
                <span className="text-sm text-default-400">
                  {isLoading ? TRANSACTION_LOADING_STATE_MESSAGE : TRANSACTION_EMPTY_STATE_MESSAGE}
                </span>
              )}
            >
              {rows.map((row) => (
                <Table.Row id={row.id} key={row.id}>
                  <Table.Cell>
                    <span className="font-mono text-[11px] text-default-500">{row.timeLabel}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="font-mono text-[11px] uppercase text-default-500">{row.methodKind}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="block truncate text-foreground" title={row.route}>
                      {row.route}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="text-[11px] text-default-500">{row.outcome}</span>
                  </Table.Cell>
                  <Table.Cell>
                    <Chip color={row.statusColor} size="sm" variant="soft">
                      {row.statusLabel}
                    </Chip>
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
