import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Spy the mocked hook hands back, so a click can be asserted against the copy handler the panel actually received. */
const onCopyToken = vi.fn();

/** The read failure the mocked hook reports; a case sets it. */
const readings = { failureMessage: '' };

vi.mock('../use-pairing-panel', () => ({
  usePairingPanel: () => ({
    copied: false,
    ...readings,
    ip: '192.168.1.10',
    onCopyToken,
    port: '9876',
    qrImageUrl: '',
    token: 'token-123',
  }),
}));

import { PairingPanel } from '../PairingPanel';

describe('PairingPanel', () => {
  afterEach(() => {
    cleanup();
    readings.failureMessage = '';
  });

  it('owns a rejected clipboard promise at the press boundary', () => {
    const catchHandler = vi.fn();
    onCopyToken.mockReturnValueOnce({ catch: catchHandler });

    render(<PairingPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(onCopyToken).toHaveBeenCalledTimes(1);
    expect(catchHandler).toHaveBeenCalledTimes(1);
  });

  it('shows a danger Alert with the failure only when a pairing read failed', () => {
    render(<PairingPanel />);
    expect(document.querySelector('.alert--danger')).toBeNull();
    cleanup();

    readings.failureMessage = 'devices: database locked';
    render(<PairingPanel />);

    expect(screen.getByText('devices: database locked').closest('[data-slot="alert-root"]')).toHaveClass('alert--danger');
  });
});
