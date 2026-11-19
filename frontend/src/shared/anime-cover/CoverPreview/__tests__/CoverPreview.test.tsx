import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridgeError } from '../../../query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../query/test-support/bridge-modules.test-support';
import { status } from '../../../query/test-support/readiness-source.test-support';
import { COVER_PREVIEW_FAILURE_LABEL, COVER_PREVIEW_LABEL, COVER_PREVIEW_LOADING_LABEL, COVER_PREVIEW_NO_COVER_LABEL, COVER_PREVIEW_SETTLE_MS } from '../cover-preview.constants';
import { CoverPreview } from '../CoverPreview';

/**
 * The `render` options of a tree whose `anime` module is ready, so the preview reads at once.
 * @returns The options carrying the wrapper.
 */
function animeReady() {
  return { wrapper: createModulesTestWrapper(status('anime', 'ready')).wrapper };
}

/** Lets the typed value settle and the read it issues land. */
async function settle() {
  await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));
  await act(async () => vi.advanceTimersByTimeAsync(0));
}

describe('CoverPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows a labelled loading thumbnail, then the rendered cover alone', async () => {
    const previewAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/jpeg;base64,draft' });
    render(<CoverPreview source={{ previewAnimeCover }} value="D:/Anime/cover.jpg" />, animeReady());

    expect(screen.getByRole('status', { name: COVER_PREVIEW_LOADING_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    await settle();

    expect(screen.getByRole('img', { name: COVER_PREVIEW_LABEL })).toHaveAttribute('src', 'data:image/jpeg;base64,draft');
    expect(screen.queryByRole('status', { name: COVER_PREVIEW_LOADING_LABEL })).toBeNull();
  });

  it('shows the no-cover poster for an empty value and after a decode failure, then renders a new cover', async () => {
    const previewAnimeCover = vi.fn()
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:image/jpeg;base64,broken' })
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:image/jpeg;base64,fixed' });
    const source = { previewAnimeCover };
    const { rerender } = render(<CoverPreview source={source} value="" />, animeReady());

    expect(screen.getByRole('img', { name: COVER_PREVIEW_NO_COVER_LABEL })).toBeInTheDocument();
    rerender(<CoverPreview source={source} value="D:/broken.jpg" />);
    await settle();
    act(() => {
      screen.getByRole('img', { name: COVER_PREVIEW_LABEL }).dispatchEvent(new Event('error'));
    });

    expect(screen.getByRole('img', { name: COVER_PREVIEW_NO_COVER_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: COVER_PREVIEW_LABEL })).toBeNull();
    // A thumbnail is too small for the poster's pill.
    expect(screen.queryByText(COVER_PREVIEW_NO_COVER_LABEL)).toBeNull();

    rerender(<CoverPreview source={source} value="D:/fixed.jpg" />);
    await settle();

    expect(screen.getByRole('img', { name: COVER_PREVIEW_LABEL })).toHaveAttribute('src', 'data:image/jpeg;base64,fixed');
  });

  it('shows the read failure with its reason, never the no-cover poster or a cover', async () => {
    const previewAnimeCover = vi.fn().mockRejectedValue(createBridgeError('internal', 'anime: cover thumbnail service crashed'));
    render(<CoverPreview source={{ previewAnimeCover }} value="D:/Anime/cover.jpg" />, animeReady());
    await settle();

    expect(screen.getByRole('img', { name: `${COVER_PREVIEW_FAILURE_LABEL}: anime: cover thumbnail service crashed` })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: COVER_PREVIEW_NO_COVER_LABEL })).toBeNull();
    expect(screen.queryByRole('img', { name: COVER_PREVIEW_LABEL })).toBeNull();
    expect(screen.queryByRole('status', { name: COVER_PREVIEW_LOADING_LABEL })).toBeNull();
  });
});
