import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HosterPriorityEditor } from '../HosterPriorityEditor';
import { useHosterPriorityEditor } from '../use-hoster-priority-editor';

vi.mock('../use-hoster-priority-editor', () => ({
  useHosterPriorityEditor: vi.fn(),
}));

const mockedUseHosterPriorityEditor = vi.mocked(useHosterPriorityEditor);

describe('HosterPriorityEditor', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a loading skeleton while the status is "loading"', () => {
    mockedUseHosterPriorityEditor.mockReturnValue({
      status: 'loading',
      items: [],
      isSaving: false,
      errorMessage: undefined,
      reorder: vi.fn(),
    });

    render(<HosterPriorityEditor />);

    expect(screen.getByLabelText('Loading hoster priority')).toBeInTheDocument();
  });

  it('renders an empty state when there are no configured hosters', () => {
    mockedUseHosterPriorityEditor.mockReturnValue({
      status: 'empty',
      items: [],
      isSaving: false,
      errorMessage: undefined,
      reorder: vi.fn(),
    });

    render(<HosterPriorityEditor />);

    expect(screen.getByText(/no hosters configured/i)).toBeInTheDocument();
  });

  it('renders an error message when the status is "error"', () => {
    mockedUseHosterPriorityEditor.mockReturnValue({
      status: 'error',
      items: [],
      isSaving: false,
      errorMessage: 'network down',
      reorder: vi.fn(),
    });

    render(<HosterPriorityEditor />);

    expect(screen.getByRole('alert')).toHaveTextContent('network down');
  });

  it('renders every hoster as an accessible, keyboard-reorderable list item', () => {
    mockedUseHosterPriorityEditor.mockReturnValue({
      status: 'ready',
      items: [
        { id: 'mega', hoster: 'mega', priority: 0, enabled: true },
        { id: 'mediafire', hoster: 'mediafire', priority: 1, enabled: true },
      ],
      isSaving: false,
      errorMessage: undefined,
      reorder: vi.fn(),
    });

    render(<HosterPriorityEditor />);

    const list = screen.getByRole('grid', { name: /hoster priority/i });
    expect(list).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /mega/i })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /mediafire/i })).toBeInTheDocument();
  });

  it('renders an aria-live region for reorder announcements', () => {
    mockedUseHosterPriorityEditor.mockReturnValue({
      status: 'ready',
      items: [{ id: 'mega', hoster: 'mega', priority: 0, enabled: true }],
      isSaving: false,
      errorMessage: undefined,
      reorder: vi.fn(),
    });

    render(<HosterPriorityEditor />);

    expect(document.querySelector('[aria-live]')).not.toBeNull();
  });
});
