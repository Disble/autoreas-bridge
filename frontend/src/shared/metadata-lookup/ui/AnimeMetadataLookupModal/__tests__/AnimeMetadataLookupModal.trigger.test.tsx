import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnimeMetadataLookupModal } from '../AnimeMetadataLookupModal';
import { METADATA_LOOKUP_TRIGGER_LABEL } from '../anime-metadata-lookup.constants';
import type { AnimeMetadataLookupSource } from '../use-anime-metadata-lookup';

/**
 * Builds a lookup source that resolves every call with nothing, because these
 * cases only exercise the trigger and never reach a search result.
 * @returns A fake source for the modal's injected `source` prop.
 */
function createIdleSource(): AnimeMetadataLookupSource {
  return {
    SearchMyAnimeList: vi.fn().mockResolvedValue({ outcome: 'no_op', message: '', candidates: [] }),
    GetMyAnimeListDetail: vi.fn().mockResolvedValue({ outcome: 'no_op', message: '' }),
  };
}

/**
 * Finds the one trigger button the modal renders, by its accessible name.
 * @returns The trigger button.
 */
function getTrigger(): HTMLElement {
  return screen.getByRole('button', { name: METADATA_LOOKUP_TRIGGER_LABEL });
}

describe('AnimeMetadataLookupModal trigger variants', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps the visible text trigger when no variant is given', () => {
    render(<AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={createIdleSource()} />);

    expect(getTrigger()).toHaveTextContent(METADATA_LOOKUP_TRIGGER_LABEL);
    expect(getTrigger()).not.toHaveAttribute('aria-label');
  });

  it('renders the icon variant as an icon-only button named by its label', () => {
    render(
      <AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={createIdleSource()} triggerVariant="icon" />,
    );

    expect(getTrigger()).toHaveAttribute('aria-label', METADATA_LOOKUP_TRIGGER_LABEL);
    expect(getTrigger().textContent).toBe('');
    expect(getTrigger()).toHaveClass('hover:text-accent');
  });

  it.each([
    { name: '', disabled: true },
    { name: 'Bleach', disabled: false },
  ])('gates the icon trigger on the name ($name)', ({ name, disabled }) => {
    render(<AnimeMetadataLookupModal name={name} onConfirm={vi.fn()} source={createIdleSource()} triggerVariant="icon" />);

    expect(getTrigger().hasAttribute('disabled')).toBe(disabled);
  });

  it('opens the lookup dialog from the icon trigger', () => {
    render(
      <AnimeMetadataLookupModal name="Bleach" onConfirm={vi.fn()} source={createIdleSource()} triggerVariant="icon" />,
    );

    fireEvent.click(getTrigger());

    expect(screen.getByRole('searchbox')).toHaveValue('Bleach');
  });
});
