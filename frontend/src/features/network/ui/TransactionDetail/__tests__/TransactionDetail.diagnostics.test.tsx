import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { CaptureDetail } from '../../../../../shared/contracts/capture.types';
import { toTransactionDetail } from '../../TransactionPanel/transaction-panel.helpers';
import type { TransactionDetailTab } from '../../TransactionPanel/transaction-panel.types';
import { TransactionDetail } from '../TransactionDetail';

/** A full, valid POST /api/sync/diagnostics body as mobile emits it. */
const FULL_REPORT_BODY = JSON.stringify({
  cycle_id: 'cyc-123',
  trigger_source: 'background_sync',
  previous_cycle: {
    outcome: 'failed',
    elapsed_ms: 15230,
    error_name: 'network_timeout',
    error_fingerprint: '1a2b3c4d',
  },
  counters: { consecutive_unclosed_cycles: 2, pending_ops_count: 7, cursor: 41 },
});

/** Builds one diagnostics-route capture detail, overridable per test. */
function diagnosticsDetail(overrides: Partial<CaptureDetail> = {}): CaptureDetail {
  return {
    requestId: 'req-diag',
    capturedAtMs: 1000,
    kind: 'post',
    route: '/api/sync/diagnostics',
    transport: 'http',
    outcome: 'accepted',
    httpStatus: 204,
    durationMs: 5,
    payload: {},
    correlations: { operationRefs: [] },
    deviceId: '',
    deviceName: '',
    requestBody: FULL_REPORT_BODY,
    ...overrides,
  };
}

/**
 * Stateful host mirroring the real panel: the detail tab is a controlled prop,
 * so the host must own the tab state for tab switching to work in a test.
 */
function StatefulTransactionDetail({ capture }: Readonly<{ capture: CaptureDetail }>) {
  const [detailTab, setDetailTab] = useState<TransactionDetailTab>('general');

  return <TransactionDetail detail={toTransactionDetail(capture)} detailTab={detailTab} onClose={vi.fn()} onDetailTabChange={setDetailTab} />;
}

/** Renders the inspector for the given capture detail. */
function renderDetail(capture: CaptureDetail): void {
  render(<StatefulTransactionDetail capture={capture} />);
}

/** Opens the Request tab of the rendered inspector and waits for its Payload pane. */
async function openRequestTab(): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: 'Request' }));
  await screen.findByText('Payload');
}

/** Finds the Payload `<pre>` element holding the raw captured body. */
function getPayloadPre(): HTMLElement {
  const pre = screen.getAllByRole('generic').find((element) => element.tagName === 'PRE');

  if (pre === undefined) {
    throw new Error('Payload <pre> not rendered');
  }

  return pre as HTMLElement;
}

describe('TransactionDetail diagnostics projection', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the projected labelled values on the Request tab and no device anywhere', async () => {
    renderDetail(diagnosticsDetail());

    // No device is displayed at all: diagnostics captures carry no device_id,
    // so not even an empty device field may appear.
    expect(screen.queryByText('deviceName')).not.toBeInTheDocument();

    await openRequestTab();

    expect(screen.getByText('cycle_id')).toBeInTheDocument();
    expect(screen.getByText('cyc-123')).toBeInTheDocument();
    expect(screen.getByText('trigger_source')).toBeInTheDocument();
    expect(screen.getByText('background_sync')).toBeInTheDocument();
    expect(screen.getByText('cursor')).toBeInTheDocument();
    expect(screen.getByText('41')).toBeInTheDocument();
    expect(screen.getByText('consecutive_unclosed_cycles')).toBeInTheDocument();
    expect(screen.getByText('pending_ops_count')).toBeInTheDocument();
    expect(screen.getByText('previous_cycle.outcome')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('previous_cycle.elapsed_ms')).toBeInTheDocument();
    expect(screen.getByText('15230ms')).toBeInTheDocument();
    expect(screen.getByText('previous_cycle.error_fingerprint')).toBeInTheDocument();
    expect(screen.getByText('1a2b3c4d')).toBeInTheDocument();
    expect(screen.getByText('previous_cycle.error_name')).toBeInTheDocument();
    expect(screen.getByText('network_timeout')).toBeInTheDocument();
  });

  it('keeps the raw captured body available beside the projection', async () => {
    renderDetail(diagnosticsDetail());

    await openRequestTab();

    expect(screen.getByText('Sync diagnostics report')).toBeInTheDocument();
    expect(getPayloadPre().textContent).toContain('"cycle_id"');
    expect(getPayloadPre().textContent).toContain('cyc-123');
  });

  it('renders no projection at all for a non-diagnostics capture', async () => {
    renderDetail(diagnosticsDetail({ route: '/api/animes/anime-1', requestBody: FULL_REPORT_BODY }));

    await openRequestTab();

    expect(screen.queryByText('Sync diagnostics report')).not.toBeInTheDocument();
    expect(screen.queryByText('previous_cycle.outcome')).not.toBeInTheDocument();
  });

  it('shows the existing skip wording instead of a projection when the body state records a skip', async () => {
    // The body-state guard must win over a present body string: if the guard
    // is ever removed, this fixture would project the body's values and the
    // `cycle_id` assertion below would fail.
    renderDetail(diagnosticsDetail({ requestBodyState: 'omitted_too_large' }));

    await openRequestTab();

    expect(screen.queryByText('cycle_id')).not.toBeInTheDocument();
    expect(screen.getAllByText('Body capture was skipped before authentication because the declared request body exceeded the 65536-byte safety budget.').length).toBeGreaterThan(0);
  });
});
