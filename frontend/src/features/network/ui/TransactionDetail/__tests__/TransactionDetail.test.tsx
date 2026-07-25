import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TransactionDetailViewModel } from '../../TransactionPanel/transaction-panel.types';
import { TransactionDetail } from '../TransactionDetail';

function detail(overrides: Partial<TransactionDetailViewModel> = {}): TransactionDetailViewModel {
  return {
    requestId: 'req-1',
    methodKind: 'patch',
    route: '/api/animes/anime-1',
    outcome: 'accepted',
    outcomeColor: 'success',
    statusLabel: '200',
    statusColor: 'success',
    hasHttpStatus: true,
    durationLabel: '42ms',
    timeLabel: '10:30:45',
    deviceName: 'Phone',
    errorCode: '',
    generalFields: [{ label: 'requestId', value: 'req-1' }],
    requestHeaders: [{ label: 'content-type', value: 'application/json' }],
    responseHeaders: [],
    requestPayload: { state: 'captured', raw: '{}' },
    responseBody: { state: 'not-captured', notice: 'Not captured for this transaction.', raw: '' },
    correlations: [],
    ...overrides,
  };
}

describe('TransactionDetail', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the empty prompt when nothing is selected', () => {
    render(<TransactionDetail detail={null} detailTab="general" onClose={vi.fn()} onDetailTabChange={vi.fn()} />);

    expect(screen.getByText('Select a transaction to inspect its details.')).toBeInTheDocument();
  });

  it('renders General/Request/Response tabs when a transaction is selected', () => {
    render(<TransactionDetail detail={detail()} detailTab="general" onClose={vi.fn()} onDetailTabChange={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Request' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Response' })).toBeInTheDocument();
  });

  it('renders the header status and outcome pills with the same labels/colors as the row', () => {
    render(<TransactionDetail detail={detail({ outcome: 'rejected', outcomeColor: 'danger' })} detailTab="general" onClose={vi.fn()} onDetailTabChange={vi.fn()} />);

    const statusChip = screen.getByText('200').closest('[data-slot="chip"]');
    const outcomeChip = screen.getByText('rejected').closest('[data-slot="chip"]');

    expect(statusChip).toHaveClass('chip--success');
    expect(outcomeChip).toHaveClass('chip--danger');
  });

  it('renders no status pill in the header for a statusless selection', () => {
    render(<TransactionDetail detail={detail({ hasHttpStatus: false, statusLabel: '–' })} detailTab="general" onClose={vi.fn()} onDetailTabChange={vi.fn()} />);

    expect(screen.queryByText('200')).not.toBeInTheDocument();
  });

  it('renders the not-captured notice in the Response tab via CodeBlock when the body is absent', () => {
    render(<TransactionDetail detail={detail()} detailTab="response" onClose={vi.fn()} onDetailTabChange={vi.fn()} />);

    expect(screen.getByText('Not captured for this transaction.')).toBeInTheDocument();
  });

  it('renders the redaction notice in the Response tab for a redacted body', () => {
    render(
      <TransactionDetail
        detail={detail({ responseBody: { state: 'redacted', notice: 'Redacted by the capture pipeline.', raw: '{"error":"response body redacted"}' } })}
        detailTab="response"
        onClose={vi.fn()}
        onDetailTabChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Redacted by the capture pipeline.')).toBeInTheDocument();
  });

  it('renders the Pretty/Raw toggle in the Request tab for a JSON payload', () => {
    render(
      <TransactionDetail
        detail={detail({ requestPayload: { state: 'captured', raw: '{"a":1}' } })}
        detailTab="request"
        onClose={vi.fn()}
        onDetailTabChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('calls onClose when the close control is pressed', () => {
    const onClose = vi.fn();
    render(<TransactionDetail detail={detail()} detailTab="general" onClose={onClose} onDetailTabChange={vi.fn()} />);

    screen.getByRole('button', { name: 'Close detail inspector' }).click();

    expect(onClose).toHaveBeenCalled();
  });
});
