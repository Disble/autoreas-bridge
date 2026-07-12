import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const onCopyToken = vi.fn();

vi.mock('../use-pairing-panel', () => ({
  usePairingPanel: () => ({
    copied: false,
    ip: '192.168.1.10',
    onCopyToken,
    port: '8080',
    qrImageUrl: '',
    token: 'token-123',
  }),
}));

import { PairingPanel } from '../PairingPanel';

describe('PairingPanel', () => {
  it('owns a rejected clipboard promise at the press boundary', () => {
    const catchHandler = vi.fn();
    onCopyToken.mockReturnValueOnce({ catch: catchHandler });

    render(<PairingPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(onCopyToken).toHaveBeenCalledTimes(1);
    expect(catchHandler).toHaveBeenCalledTimes(1);
  });
});
