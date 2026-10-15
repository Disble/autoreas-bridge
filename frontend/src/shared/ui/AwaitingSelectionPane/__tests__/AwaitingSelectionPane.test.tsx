import bellIcon from '@iconify-icons/solar/bell-bold-duotone';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AwaitingSelectionPane } from '../AwaitingSelectionPane';
import { AWAITING_SELECTION_EMPTY_VALUE } from '../awaiting-selection-pane.constants';

/** Removes rendered pane DOM after each scenario. */
afterEach(() => {
  cleanup();
});

describe('AwaitingSelectionPane', () => {
  it('announces the prompt as a heading with its one line, and hides the dimmed preview from assistive tech', () => {
    const { container } = render(
      <AwaitingSelectionPane
        description="Pick one on the left to read it."
        fields={['Level', 'Source', 'When']}
        footer="Related anime and actions open here."
        icon={bellIcon}
        sectionLabel="Message"
        title="No notification selected"
      />,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'No notification selected' })).toBeInTheDocument();
    expect(screen.getByText('Pick one on the left to read it.')).toBeInTheDocument();
    expect(screen.queryByRole('term')).toBeNull();

    const preview = container.querySelector('[data-awaiting-preview]');
    expect(preview).toHaveAttribute('aria-hidden', 'true');
    const terms = Array.from(preview?.querySelectorAll('dt') ?? []).map((node) => node.textContent);
    const values = Array.from(preview?.querySelectorAll('dd') ?? []).map((node) => node.textContent);
    expect(terms).toEqual(['Level', 'Source', 'When']);
    expect(values).toEqual([AWAITING_SELECTION_EMPTY_VALUE, AWAITING_SELECTION_EMPTY_VALUE, AWAITING_SELECTION_EMPTY_VALUE]);
    expect(preview).toHaveTextContent('Message');
    expect(screen.getByText('Related anime and actions open here.')).toBeInTheDocument();
  });

  it('previews the fields alone when the pane has no next section', () => {
    const { container } = render(<AwaitingSelectionPane description="d" fields={['Checked']} icon={bellIcon} title="No run selected" />);

    const preview = container.querySelector('[data-awaiting-preview]');
    expect(preview?.querySelectorAll('dt')).toHaveLength(1);
    expect(preview?.querySelector('p')).toBeNull();
  });

  it('previews the section label alone when the pane has no fields', () => {
    const { container } = render(<AwaitingSelectionPane description="d" icon={bellIcon} sectionLabel="Episodes" title="No run selected" />);

    const preview = container.querySelector('[data-awaiting-preview]');
    expect(preview).toHaveTextContent('Episodes');
    expect(preview?.querySelector('dl')).toBeNull();
  });

  it('renders only the header when there are no fields, section or footer', () => {
    const { container } = render(<AwaitingSelectionPane description="Its tabs open here." icon={bellIcon} title="No transaction selected" />);

    expect(screen.getByRole('heading', { level: 3, name: 'No transaction selected' })).toBeInTheDocument();
    expect(container.querySelector('[data-awaiting-preview]')).toBeNull();
    expect(container.querySelector('dl')).toBeNull();
    expect(container.querySelector('[data-awaiting-footer]')).toBeNull();
  });
});
