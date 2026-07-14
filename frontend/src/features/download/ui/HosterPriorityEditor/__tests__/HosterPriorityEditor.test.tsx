import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as ReactAriaComponents from 'react-aria-components';
import { HosterPriorityEditor } from '../HosterPriorityEditor';
import { useHosterPriorityEditor } from '../use-hoster-priority-editor';

const dragAndDropOptions = { current: undefined as undefined | { onReorder: (event: unknown) => void } };

vi.mock('../use-hoster-priority-editor', () => ({
  useHosterPriorityEditor: vi.fn(),
}));

const mockedUseHosterPriorityEditor = vi.mocked(useHosterPriorityEditor);

describe('HosterPriorityEditor', () => {
  beforeEach(() => {
    // Spy instead of vi.mock: with deps.optimizer enabled, importOriginal-based
    // partial mocks cannot re-import the original module.
    vi.spyOn(ReactAriaComponents, 'useDragAndDrop').mockImplementation((options) => {
      dragAndDropOptions.current = options as unknown as { onReorder: (event: unknown) => void };
      return { dragAndDropHooks: {} } as unknown as ReturnType<typeof ReactAriaComponents.useDragAndDrop>;
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

  it('owns a rejected reorder promise at the drag-and-drop boundary', () => {
    const catchHandler = vi.fn();
    const reorder = vi.fn().mockReturnValue({ catch: catchHandler });
    mockedUseHosterPriorityEditor.mockReturnValue({
      status: 'ready',
      items: [{ id: 'mega', hoster: 'mega', priority: 0, enabled: true }],
      isSaving: false,
      errorMessage: undefined,
      reorder,
    });

    render(<HosterPriorityEditor />);
    dragAndDropOptions.current?.onReorder({
      keys: new Set(['mega']),
      target: { key: 'mediafire', dropPosition: 'before' },
    });

    expect(reorder).toHaveBeenCalledWith('mega', 'mediafire', 'before');
    expect(catchHandler).toHaveBeenCalledTimes(1);
  });
});
