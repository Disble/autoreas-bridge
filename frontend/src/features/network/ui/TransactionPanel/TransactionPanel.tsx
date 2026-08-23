import { Alert } from '@heroui/react';
import { captureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.helpers';
import { createCaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.helpers';
import { TransactionDetail } from '../TransactionDetail/TransactionDetail';
import { TransactionFilterBar } from '../TransactionFilterBar/TransactionFilterBar';
import { TransactionTable } from '../TransactionTable/TransactionTable';
import { TRANSACTION_CAPTURE_DEGRADED_MESSAGE } from './transaction-panel.constants';
import type { TransactionPanelProps } from './transaction-panel.types';
import { useTransactionPanel } from './use-transaction-panel';

/**
 * TransactionPanel is the DevTools-Network-style master/detail container
 * over captured HTTP transactions: a filter toolbar + dense table on the
 * left, the selected transaction's tabbed inspector on the right. All data
 * flows from `useTransactionPanel`, including the live `capture.transaction`
 * push subscription; this component only renders.
 */
export function TransactionPanel({
  source = createCaptureTransactionSource(),
  limit,
  runtimeSource = captureRuntimeSource,
}: Readonly<TransactionPanelProps>) {
  const {
    rows,
    selectedId,
    selectedDetail,
    route,
    outcome,
    kind,
    statusClass,
    query,
    detailTab,
    isLoading,
    degraded,
    onSelect,
    onClose,
    onRouteChange,
    onOutcomeChange,
    onKindChange,
    onStatusClassChange,
    onQueryChange,
    onDetailTabChange,
  } = useTransactionPanel(source, limit, runtimeSource);

  return (
    <div className="flex flex-col gap-4">
      <TransactionFilterBar
        kind={kind}
        onKindChange={onKindChange}
        onOutcomeChange={onOutcomeChange}
        onQueryChange={onQueryChange}
        onRouteChange={onRouteChange}
        onStatusClassChange={onStatusClassChange}
        outcome={outcome}
        query={query}
        route={route}
        statusClass={statusClass}
      />

      {degraded ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{TRANSACTION_CAPTURE_DEGRADED_MESSAGE}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <TransactionTable isLoading={isLoading} onSelect={onSelect} rows={rows} selectedId={selectedId} />
        <TransactionDetail detail={selectedDetail} detailTab={detailTab} onClose={onClose} onDetailTabChange={onDetailTabChange} />
      </div>
    </div>
  );
}
