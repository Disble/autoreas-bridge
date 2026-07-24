import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRANSACTION_NOT_CAPTURED_LABEL } from '../../TransactionPanel/transaction-panel.constants';
import type { TransactionDetailViewModel } from '../../TransactionPanel/transaction-panel.types';
import { TransactionDetail } from '../TransactionDetail';

function detail(overrides: Partial<TransactionDetailViewModel> = {}): TransactionDetailViewModel {
  return {
    requestId: 'req-1',
    methodKind: 'patch',
    route: '/api/animes/anime-1',
    outcome: 'accepted',
    statusLabel: '200',
    statusColor: 'success',
    durationLabel: '42ms',
    timeLabel: '10:30:45',
    deviceName: 'Phone',
    errorCode: '',
    generalFields: [{ label: 'requestId', value: 'req-1' }],
    requestHeaders: [{ label: 'content-type', value: 'application/json' }],
    responseHeaders: [],
    requestPayload: '{}',
    responseBody: TRANSACTION_NOT_CAPTURED_LABEL,
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

  it('renders the "Not captured" fallback in the Response tab when the body is absent', () => {
    render(<TransactionDetail detail={detail()} detailTab="response" onClose={vi.fn()} onDetailTabChange={vi.fn()} />);

    expect(screen.getByText(TRANSACTION_NOT_CAPTURED_LABEL)).toBeInTheDocument();
  });

  it('calls onClose when the close control is pressed', () => {
    const onClose = vi.fn();
    render(<TransactionDetail detail={detail()} detailTab="general" onClose={onClose} onDetailTabChange={vi.fn()} />);

    screen.getByRole('button', { name: 'Close detail inspector' }).click();

    expect(onClose).toHaveBeenCalled();
  });
});
