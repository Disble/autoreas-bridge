import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HosterPriorityEditor } from '../HosterPriorityEditor';
import { useHosterPriorityEditor } from '../use-hoster-priority-editor';

vi.mock('../use-hoster-priority-editor', () => ({
  useHosterPriorityEditor: vi.fn(),
}));

const mockedUseHosterPriorityEditor = vi.mocked(useHosterPriorityEditor);

function viewModel(overrides: Partial<ReturnType<typeof useHosterPriorityEditor>> = {}) {
  return {
    status: 'ready' as const,
    items: [],
    isSaving: false,
    errorMessage: undefined,
    reorder: vi.fn(),
    onDragEnd: vi.fn(),
    ...overrides,
  };
}

describe('HosterPriorityEditor', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a loading skeleton while the status is "loading"', () => {
    mockedUseHosterPriorityEditor.mockReturnValue(viewModel({ status: 'loading' }));

    render(<HosterPriorityEditor />);

    expect(screen.getByLabelText('Loading hoster priority')).toBeInTheDocument();
  });

  it('renders an empty state when there are no configured hosters', () => {
    mockedUseHosterPriorityEditor.mockReturnValue(viewModel({ status: 'empty' }));

    render(<HosterPriorityEditor />);

    expect(screen.getByText(/no hosters configured/i)).toBeInTheDocument();
  });

  it('renders an error message when the status is "error"', () => {
    mockedUseHosterPriorityEditor.mockReturnValue(viewModel({ status: 'error', errorMessage: 'network down' }));

    render(<HosterPriorityEditor />);

    expect(screen.getByRole('alert')).toHaveTextContent('network down');
  });

  it('renders every hoster as a list item inside the priority list', () => {
    mockedUseHosterPriorityEditor.mockReturnValue(
      viewModel({
        items: [
          { id: 'mega', hoster: 'mega', priority: 0, enabled: true },
          { id: 'mediafire', hoster: 'mediafire', priority: 1, enabled: true },
        ],
      }),
    );

    render(<HosterPriorityEditor />);

    expect(screen.getByRole('list', { name: /hoster priority/i })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('mega')).toBeInTheDocument();
    expect(screen.getByText('mediafire')).toBeInTheDocument();
  });

  it('renders an aria-live region for reorder announcements', () => {
    mockedUseHosterPriorityEditor.mockReturnValue(
      viewModel({ items: [{ id: 'mega', hoster: 'mega', priority: 0, enabled: true }] }),
    );

    render(<HosterPriorityEditor />);

    expect(document.querySelector('[aria-live]')).not.toBeNull();
  });
});
