import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('renders the full map in section order above the recovery block, with no loading region or error', () => {
      render(<KeymapPanel />);

      const map = screen.getByTestId('keymap-panel-map');
      const recovery = screen.getByTestId('keymap-panel-recovery');

      expect(map.compareDocumentPosition(recovery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByText('Mark all as read')).toBeInTheDocument();
      expect(screen.getAllByTestId('keymap-binding-row-scope-note').map((note) => note.textContent)).toContain('while the Notification Center is open');
      expect(screen.queryByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL })).toBeNull();
      expect(screen.queryByText(KEYMAP_PANEL_ERROR_MESSAGE)).toBeNull();

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

    it("wires each row's captured chord to the panel's real onRebind (design D6/D8, Slice 62j) rather than a no-op stub", async () => {
      const setKeymap = vi.fn().mockResolvedValue(undefined);
      render(<KeymapPanel source={{ setKeymap }} />);

      const [firstRebindButton] = screen.getAllByRole('button', { name: 'Rebind' });
      fireEvent.click(firstRebindButton);
      fireEvent.keyDown(firstRebindButton, { key: '9', code: 'Digit9', ctrlKey: true });

      await waitFor(() => expect(setKeymap).toHaveBeenCalledTimes(1));
    });

    it('wires Revert, then Reset to defaults, to the real handlers using only pointer clicks (task 11.2.3/11.2.4)', async () => {
      setKeymapOverrides({ 'nav.today': 'ctrl+1', 'nav.downloads': 'ctrl+2' });
      const setKeymap = vi.fn().mockResolvedValue(undefined);
      render(<KeymapPanel source={{ setKeymap }} />);
      /** Reads every row's displayed chord, in render order. */
      const chordTexts = () => screen.getAllByTestId('keymap-binding-row-chord').map((chord) => chord.textContent);

      const revertButtons = screen.getAllByRole('button', { name: 'Revert' });
      const [enabledRevert] = revertButtons.filter((button) => !button.hasAttribute('disabled'));
      fireEvent.click(enabledRevert);

      await waitFor(() => expect(setKeymap).toHaveBeenCalledTimes(1));
      const document = JSON.parse(setKeymap.mock.calls[0][0] as string) as { bindings: Record<string, string> };
      expect(document.bindings).toEqual({ 'nav.downloads': 'ctrl+2' });
      expect(chordTexts()).toContain('Ctrl + 2');

      fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));

      await waitFor(() => expect(setKeymap).toHaveBeenLastCalledWith(''));
      await waitFor(() => expect(chordTexts()).not.toContain('Ctrl + 2'));
      expect(screen.getAllByTestId('keymap-binding-row-chord')[0]).toHaveTextContent('Alt + 1');
    });
  });

  describe('loading (keymapLoadState === "pending")', () => {
    it('announces a live loading region with exactly the skeleton rows and no real row, then reveals the map once loaded', () => {
      render(<KeymapPanel />);

      const status = screen.getByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL });
      expect(status).toHaveAttribute('aria-live', 'polite');
      // The negative half is the one that actually catches a regression: a
      // skeleton alone proves nothing if the real map renders alongside it.
      expect(screen.queryByTestId('keymap-panel-map')).toBeNull();
      expect(screen.queryByText('Mark all as read')).toBeNull();
      expect(screen.getAllByTestId('keymap-panel-skeleton-row')).toHaveLength(KEYMAP_SKELETON_ROW_COUNT);

      act(() => {
        setKeymapOverrides({});
      });

      expect(screen.queryByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL })).toBeNull();
      expect(screen.getByTestId('keymap-panel-map')).toBeInTheDocument();
    });
  });

  describe('failed (keymapLoadState === "failed")', () => {
    it('clears the loading region into the error Alert, never the map or a skeleton, when the load fails', () => {
      render(<KeymapPanel />);
      expect(screen.getByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL })).toBeInTheDocument();

      act(() => {
        failKeymapLoad();
      });

      expect(screen.queryByRole('status', { name: KEYMAP_PANEL_LOADING_LABEL })).toBeNull();
      expect(screen.queryByTestId('keymap-panel-map')).toBeNull();
      expect(screen.queryByTestId('keymap-panel-skeleton-row')).toBeNull();
      expect(screen.getByText(KEYMAP_PANEL_ERROR_MESSAGE)).toBeInTheDocument();
    });
  });
});
