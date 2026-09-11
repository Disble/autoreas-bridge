import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetKeyboardStore, setKeymapOverrides } from '../../../keyboard-scope.helpers';
import { groupBindingsBySection, listAllBindings } from '../keymap-panel.helpers';
import { KeymapPanel } from '../KeymapPanel';

beforeEach(() => {
  resetKeyboardStore();
  // Seeds `keymapLoadState` to `'loaded'` directly (task 7.2.1): the
  // accessible unresolved-state gate this would otherwise require does not
  // exist until Slice 62h (design §8/Note D).
  setKeymapOverrides({});
});

afterEach(() => {
  cleanup();
  resetKeyboardStore();
});

describe('KeymapPanel', () => {
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
});
