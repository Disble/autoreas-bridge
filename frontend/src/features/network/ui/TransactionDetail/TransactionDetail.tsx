import { Card, Chip, CloseButton, Tabs } from '@heroui/react';
import { ACTIVITY_RAIL_HEIGHT_CLASS } from '../ActivityView/activity-view.constants';
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
    // `min-w-0` on the card, not only on the grid track: a grid item whose
    // `min-width` is `auto` refuses to shrink below its content and overflows
    // even a `minmax(0, …)` track.
    //
    // The measured page overflow came from the Runtime Events trace pane, not
    // from here -- this card held on its own under a 7973px unbroken body. It
    // carries the same containment anyway: it is the same card in the same
    // grid track, and the difference between the two was one pane's classes.
    //
    // The height budget matches the rail this card is stretched against, and
    // the `min-h-0` chain below it is what hands that height to the body pane.
    // Both halves are needed: a flex item's automatic minimum size would let a
    // filling pane grow the card instead of scrolling inside it, and an
    // uncapped card would then take the whole grid row with it.
    <Card className={`${ACTIVITY_RAIL_HEIGHT_CLASS} min-w-0`}>
      <Card.Content className="flex min-h-0 min-w-0 flex-col gap-3 p-4">
        <header className="flex min-w-0 shrink-0 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            {/* `min-w-0` beside `truncate`, so the ellipsis never depends on
                `overflow: hidden` alone having zeroed this flex item's
                automatic minimum size. */}
            <span className="min-w-0 truncate text-sm font-medium text-foreground" title={route}>
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
          className="min-h-0 min-w-0 flex-1"
          onSelectionChange={(key) => onDetailTabChange(String(key) as TransactionDetailProps['detailTab'])}
          selectedKey={detailTab}
          variant="secondary"
        >
          <Tabs.ListContainer className="shrink-0">
            <Tabs.List aria-label="Detail inspector tabs">
              <Tabs.Tab id="general">{TRANSACTION_DETAIL_TAB_LABELS.general}</Tabs.Tab>
              <Tabs.Tab id="request">{TRANSACTION_DETAIL_TAB_LABELS.request}</Tabs.Tab>
              <Tabs.Tab id="response">{TRANSACTION_DETAIL_TAB_LABELS.response}</Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>

          <Tabs.Panel className="flex min-h-0 min-w-0 flex-1 flex-col" id="general">
            <TransactionDetailGeneral correlations={correlations} fields={generalFields} />
          </Tabs.Panel>
          <Tabs.Panel className="flex min-h-0 min-w-0 flex-1 flex-col" id="request">
            <TransactionDetailRequest headers={requestHeaders} payload={requestPayload} />
          </Tabs.Panel>
          <Tabs.Panel className="flex min-h-0 min-w-0 flex-1 flex-col" id="response">
            <TransactionDetailResponse body={responseBody} headers={responseHeaders} />
          </Tabs.Panel>
        </Tabs>
      </Card.Content>
    </Card>
  );
}
