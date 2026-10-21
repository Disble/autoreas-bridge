import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from '../PageHeader';

afterEach(cleanup);

describe('PageHeader', () => {
  it('renders the title as the page h1 under the given id, with no subtitle', () => {
    const { container } = render(<PageHeader title="Downloads" titleId="downloads-title" />);

    const heading = screen.getByRole('heading', { level: 1, name: 'Downloads' });
    expect(heading).toHaveAttribute('id', 'downloads-title');
    expect(container.querySelector('header')?.textContent).toBe('Downloads');
  });

  it('places the adornment beside the title and the actions on the right of the same row', () => {
    render(<PageHeader actions={<button type="button">Mark all as read</button>} adornment={<span>22 unread</span>} title="Notifications" />);

    const row = screen.getByRole('banner');
    expect(row).toContainElement(screen.getByText('22 unread'));
    expect(row).toContainElement(screen.getByRole('button', { name: 'Mark all as read' }));
    expect(row).toHaveClass('flex', 'items-center', 'justify-between');
  });
});
