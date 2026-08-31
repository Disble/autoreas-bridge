import { Chip, Table } from '@heroui/react';
import { memo } from 'react';
import { TRANSACTION_EMPTY_LABEL } from '../TransactionPanel/transaction-panel.constants';
import type { TransactionRowProps } from '../TransactionPanel/transaction-panel.types';
import { TransactionRowLiveDuration } from './TransactionRowLiveDuration';
import { TransactionRowLiveOutcome } from './TransactionRowLiveOutcome';

/**
 * One dense DevTools-Network table row.
 *
 * Memoized because a row that has not changed has no work to do: the rail
 * accumulates rows and never unmounts them (ADR-012), so anything that
 * re-renders the table — a pushed capture, a selection, the next page — would
 * otherwise re-run every loaded row. The view model is settled and stable, so
 * the identity check is a real skip rather than a permanently-missed one.
 *
 * The two clock-dependent columns of a transport-only arrival row (`OUTCOME`,
 * `DURATION`) delegate to their own live cells, which is why this component
 * holds no state and no clock of its own.
 */
export const TransactionRow = memo(function TransactionRow({ row }: Readonly<TransactionRowProps>) {
  return (
    <Table.Row id={row.id}>
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
        {row.arrivalCapturedAtMs === null ? (
          <Chip color={row.outcomeColor} size="sm" variant="soft">
            {row.outcome}
          </Chip>
        ) : (
          <TransactionRowLiveOutcome capturedAtMs={row.arrivalCapturedAtMs} settledOutcome={row.outcome} settledOutcomeColor={row.outcomeColor} />
        )}
      </Table.Cell>
      <Table.Cell>
        {row.hasHttpStatus ? (
          <Chip color={row.statusColor} size="sm" variant="soft">
            {row.statusLabel}
          </Chip>
        ) : (
          <span className="text-[11px] text-default-400">{TRANSACTION_EMPTY_LABEL}</span>
        )}
      </Table.Cell>
      <Table.Cell>
        {row.arrivalCapturedAtMs === null ? (
          <span className="font-mono text-[11px] text-default-500">{row.durationLabel}</span>
        ) : (
          <TransactionRowLiveDuration capturedAtMs={row.arrivalCapturedAtMs} settledDurationLabel={row.durationLabel} />
        )}
      </Table.Cell>
    </Table.Row>
  );
});
