import { Card, Chip, CloseButton, Tabs } from '@heroui/react';
import { TRANSACTION_DETAIL_TAB_LABELS, TRANSACTION_EMPTY_LABEL } from '../TransactionPanel/transaction-panel.constants';
import type { TransactionDetailProps } from '../TransactionPanel/transaction-panel.types';
import { TransactionDetailGeneral } from './TransactionDetailGeneral';
import { TransactionDetailRequest } from './TransactionDetailRequest';
import { TransactionDetailResponse } from './TransactionDetailResponse';

/**
 * Dumb tabbed detail inspector for the selected transaction (General/
 * Request/Response tabs), on HeroUI Tabs. Renders an empty prompt when
 * nothing is selected.
 */
export function TransactionDetail({ detail, detailTab, onDetailTabChange, onClose }: Readonly<TransactionDetailProps>) {
  if (detail === null) {
    return (
      <Card>
        <Card.Content className="p-4 text-center text-default-400">
          <span className="text-sm">Select a transaction to inspect its details.</span>
        </Card.Content>
      </Card>
    );
  }

  const {
    methodKind,
    route,
    outcome,
    outcomeColor,
    statusLabel,
    statusColor,
    hasHttpStatus,
    timeLabel,
    generalFields,
    requestHeaders,
    requestPayload,
    responseHeaders,
    responseBody,
    correlations,
  } = detail;

  return (
    <Card>
      <Card.Content className="flex flex-col gap-3 p-4">
        <header className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground" title={route}>
              {methodKind.toUpperCase()} {route}
            </span>
            <CloseButton aria-label="Close detail inspector" className="shrink-0" onPress={onClose} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip color={outcomeColor} size="sm" variant="soft">
              {outcome}
            </Chip>
            {hasHttpStatus ? (
              <Chip color={statusColor} size="sm" variant="soft">
                {statusLabel}
              </Chip>
            ) : (
              <span className="text-xs text-default-400">{TRANSACTION_EMPTY_LABEL}</span>
            )}
            <span className="font-mono text-xs text-default-500">{timeLabel}</span>
          </div>
        </header>

        <Tabs
          onSelectionChange={(key) => onDetailTabChange(String(key) as TransactionDetailProps['detailTab'])}
          selectedKey={detailTab}
          variant="secondary"
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label="Detail inspector tabs">
              <Tabs.Tab id="general">{TRANSACTION_DETAIL_TAB_LABELS.general}</Tabs.Tab>
              <Tabs.Tab id="request">{TRANSACTION_DETAIL_TAB_LABELS.request}</Tabs.Tab>
              <Tabs.Tab id="response">{TRANSACTION_DETAIL_TAB_LABELS.response}</Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel id="general">
            <TransactionDetailGeneral correlations={correlations} fields={generalFields} />
          </Tabs.Panel>
          <Tabs.Panel id="request">
            <TransactionDetailRequest headers={requestHeaders} payload={requestPayload} />
          </Tabs.Panel>
          <Tabs.Panel id="response">
            <TransactionDetailResponse body={responseBody} headers={responseHeaders} />
          </Tabs.Panel>
        </Tabs>
      </Card.Content>
    </Card>
  );
}
