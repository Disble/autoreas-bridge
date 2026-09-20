import { Alert, Button } from '@heroui/react';
import { captureRuntimeSource } from '../../../../infrastructure/capture-runtime-source/capture-runtime-source.helpers';
import { createCaptureTransactionSource } from '../../../../infrastructure/capture-transaction-source/capture-transaction-source.helpers';
import { ACTIVITY_MASTER_DETAIL_CLASS } from '../ActivityView/activity-view.constants';
import { TransactionDetail } from '../TransactionDetail/TransactionDetail';
import { TransactionFilterBar } from '../TransactionFilterBar/TransactionFilterBar';
import { TransactionTable } from '../TransactionTable/TransactionTable';
import { TRANSACTION_CAPTURE_DEGRADED_MESSAGE, TRANSACTION_SYNC_DIAGNOSTICS_FILTER_LABEL } from './transaction-panel.constants';
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
    status,
    detailTab,
    isLoading,
    degraded,
    onSelect,
    onClose,
    onScroll,
    onRouteChange,
    onOutcomeChange,
    onKindChange,
    onStatusChange,
    onSyncDiagnosticsRoute,
    onDetailTabChange,
  } = useTransactionPanel(source, limit, runtimeSource);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* One-action preset for the sync diagnostics route. It flows through
              the same backend-evaluated filter path as the text fields below,
              so the resulting rows are a real server-side query. */}
          <Button onPress={onSyncDiagnosticsRoute} size="sm" variant="secondary">
            {TRANSACTION_SYNC_DIAGNOSTICS_FILTER_LABEL}
          </Button>
        </div>

        <TransactionFilterBar
          kind={kind}
          onKindChange={onKindChange}
          onOutcomeChange={onOutcomeChange}
          onRouteChange={onRouteChange}
          onStatusChange={onStatusChange}
          outcome={outcome}
          route={route}
          status={status}
        />
      </div>

      {degraded ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{TRANSACTION_CAPTURE_DEGRADED_MESSAGE}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <div className={ACTIVITY_MASTER_DETAIL_CLASS}>
        <TransactionTable
          isLoading={isLoading}
          onScroll={onScroll}
          onSelect={onSelect}
          rows={rows}
          selectedId={selectedId}
        />
        <TransactionDetail detail={selectedDetail} detailTab={detailTab} onClose={onClose} onDetailTabChange={onDetailTabChange} />
      </div>
    </div>
  );
}
