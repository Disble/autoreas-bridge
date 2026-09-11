import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { failKeymapLoad, resetKeyboardStore, setKeymapOverrides } from '../../../keyboard-scope.helpers';
import { KEYMAP_PANEL_ERROR_MESSAGE, KEYMAP_PANEL_LOADING_LABEL, KEYMAP_SKELETON_ROW_COUNT } from '../keymap-panel.constants';
import { groupBindingsBySection, listAllBindings } from '../keymap-panel.helpers';
import { KeymapPanel } from '../KeymapPanel';

beforeEach(resetKeyboardStore);

afterEach(() => {
  cleanup();
  resetKeyboardStore();
});

describe('KeymapPanel', () => {
  describe('loaded', () => {
    beforeEach(() => {
      // Seeds `keymapLoadState` to `'loaded'` directly (task 7.2.1): the
      // accessible unresolved-state gate this exercises is Slice 62h's own.
      setKeymapOverrides({});
    });

    it("renders the complete binding map, including the scoped Notification Center command with its scope note, as the panel's first visible block, above any reset/legend affordance", () => {
      render(<KeymapPanel />);

      const map = screen.getByTestId('keymap-panel-map');
      const recovery = screen.getByTestId('keymap-panel-recovery');

      expect(map.compareDocumentPosition(recovery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByText('Mark all as read')).toBeInTheDocument();
      expect(screen.getByTestId('keymap-binding-row-scope-note')).toHaveTextContent('while the Notification Center is open');
    });

    it('renders every binding label in the order listAllBindings/groupBindingsBySection produces', () => {
      render(<KeymapPanel />);

      const expectedLabelOrder = groupBindingsBySection(listAllBindings()).flatMap((section) =>
        section.bindings.map((binding) => binding.label),
      );

      // Scoped to `<p>` (row labels render as `Typography type="body"`) so a
      // binding whose label collides with its own section heading text (e.g.
      // the "Notifications" nav command under the "Notifications" section,
      // which renders as an `<h6>`) still resolves to exactly one element.
      for (let index = 0; index < expectedLabelOrder.length - 1; index += 1) {
        const current = screen.getByText(expectedLabelOrder[index], { selector: 'p' });
        const next = screen.getByText(expectedLabelOrder[index + 1], { selector: 'p' });

        expect(current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }
    });

    it('renders no loading region and no error Alert once loaded', () => {
      render(<KeymapPanel />);

      expect(screen.queryByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL })).toBeNull();
      expect(screen.queryByText(KEYMAP_PANEL_ERROR_MESSAGE)).toBeNull();
    });
  });

  describe('loading (keymapLoadState === "pending")', () => {
    it('exposes an announced, live loading region and renders no real binding row (spec "The loading state announces itself and shows no real row")', () => {
      render(<KeymapPanel />);

      const status = screen.getByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL });
      expect(status).toHaveAttribute('aria-live', 'polite');
      // The negative half is the one that actually catches a regression: a
      // skeleton alone proves nothing if the real map renders alongside it.
      expect(screen.queryByTestId('keymap-panel-map')).toBeNull();
      expect(screen.queryByText('Mark all as read')).toBeNull();
    });

    it('renders exactly KEYMAP_SKELETON_ROW_COUNT placeholder rows sharing the row class with the real row', () => {
      render(<KeymapPanel />);

      const skeletonRows = screen.getAllByTestId('keymap-panel-skeleton-row');
      expect(skeletonRows).toHaveLength(KEYMAP_SKELETON_ROW_COUNT);
    });

    it('clears the loading region and reveals the map once the load settles successfully', () => {
      render(<KeymapPanel />);
      expect(screen.getByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL })).toBeInTheDocument();

      act(() => {
        setKeymapOverrides({});
      });

      expect(screen.queryByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL })).toBeNull();
      expect(screen.getByTestId('keymap-panel-map')).toBeInTheDocument();
    });
  });

  describe('failed (keymapLoadState === "failed")', () => {
    beforeEach(() => {
      failKeymapLoad();
    });

    it('renders the error Alert, never a loading placeholder or an empty state (spec "A failed load or save shows the error state")', () => {
      render(<KeymapPanel />);

      expect(screen.getByText(KEYMAP_PANEL_ERROR_MESSAGE)).toBeInTheDocument();
      expect(screen.queryByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL })).toBeNull();
      expect(screen.queryByTestId('keymap-panel-map')).toBeNull();
      expect(screen.queryByTestId('keymap-panel-skeleton-row')).toBeNull();
    });

    it('clears the loading region into the error Alert, never the map, when a load that started pending then fails', () => {
      resetKeyboardStore();
      render(<KeymapPanel />);
      expect(screen.getByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL })).toBeInTheDocument();

      act(() => {
        failKeymapLoad();
      });

      expect(screen.queryByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL })).toBeNull();
      expect(screen.queryByTestId('keymap-panel-map')).toBeNull();
      expect(screen.getByText(KEYMAP_PANEL_ERROR_MESSAGE)).toBeInTheDocument();
    });
  });
});
