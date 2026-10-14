import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HelpTooltip } from '../HelpTooltip';

afterEach(cleanup);

describe('HelpTooltip', () => {
  it('names the "(?)" button for what it explains and reveals the message on focus', async () => {
    render(<HelpTooltip label="About the folder" message="Changing the folder does not re-measure." />);

    const trigger = screen.getByRole('button', { name: 'About the folder' });
    expect(screen.queryByText('Changing the folder does not re-measure.')).toBeNull();
    trigger.focus();

    expect(await screen.findByText('Changing the folder does not re-measure.')).toBeInTheDocument();
  });
});
