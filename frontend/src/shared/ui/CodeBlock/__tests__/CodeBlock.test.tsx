import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CodeBlock } from '../CodeBlock';

describe('CodeBlock', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a Pretty/Raw switch with Pretty selected by default for a JSON object', () => {
    render(<CodeBlock label="Body" raw='{"status":"accepted","code":"ok"}' state="captured" />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Pretty' })).toHaveAttribute('aria-checked', 'true');
  });

  it('renders no switch for non-JSON text', () => {
    render(<CodeBlock label="Body" raw="Internal Server Error" state="captured" />);

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText('Internal Server Error')).toBeInTheDocument();
  });

  it('renders no switch for a scalar JSON value', () => {
    render(<CodeBlock label="Body" raw="123" state="captured" />);

    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('renders the verbatim raw text when Raw is clicked', () => {
    render(<CodeBlock label="Body" raw='{"a":1}' state="captured" />);

    fireEvent.click(screen.getByRole('radio', { name: 'Raw' }));

    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
  });

  it('renders the caller notice and no code area/copy/switch when not captured', () => {
    render(<CodeBlock label="Body" notice="Never captured for this transaction." raw="" state="not-captured" />);

    expect(screen.getByText('Never captured for this transaction.')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });

  it('renders the caller redaction notice without presenting the marker as the response', () => {
    render(<CodeBlock label="Body" notice="Redacted by the capture pipeline." raw='{"error":"response body redacted"}' state="redacted" />);

    expect(screen.getByText('Redacted by the capture pipeline.')).toBeInTheDocument();
    expect(screen.queryByText('{"error":"response body redacted"}')).not.toBeInTheDocument();
  });

  it('conveys empty captured content rather than showing the not-captured notice', () => {
    render(<CodeBlock label="Body" raw="" state="captured" />);

    expect(screen.queryByText(/never captured/i)).not.toBeInTheDocument();
  });
});
