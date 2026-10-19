import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FrontendErrorBoundary } from '../FrontendErrorBoundary';
import { FRONTEND_ERROR_FALLBACK_TITLE } from '../error-reporting.constants';

/**
 * A child that always fails to render.
 * @returns Never; it throws.
 */
function Exploding(): never {
  throw new Error('render failed');
}

describe('FrontendErrorBoundary', () => {
  it('renders its children while nothing fails', () => {
    const report = vi.fn();

    render(<FrontendErrorBoundary report={report} onReload={vi.fn()}><p>content</p></FrontendErrorBoundary>);

    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.queryByText(FRONTEND_ERROR_FALLBACK_TITLE)).not.toBeInTheDocument();
    expect(report).not.toHaveBeenCalled();
  });

  it('reports a render error once and shows the fallback alert instead of the content', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const report = vi.fn();
    const onReload = vi.fn();

    render(
      <FrontendErrorBoundary report={report} onReload={onReload}>
        <p>content</p>
        <Exploding />
      </FrontendErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(FRONTEND_ERROR_FALLBACK_TITLE);
    expect(screen.queryByText('content')).not.toBeInTheDocument();
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toMatchObject({ kind: 'render', message: 'render failed', source: '' });
    // React's component stack, after the error's own stack, names the component that failed.
    expect(report.mock.calls[0][0].stack.split('Component stack:')[1]).toContain('Exploding');

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });
});
