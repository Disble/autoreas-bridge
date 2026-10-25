import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COVER_PREVIEW_LABEL, COVER_PREVIEW_LOADING_LABEL, COVER_PREVIEW_NO_COVER_LABEL, COVER_PREVIEW_SETTLE_MS } from '../cover-preview.constants';
import { CoverPreview } from '../CoverPreview';

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
    render(<CoverPreview source={{ previewAnimeCover }} value="D:/Anime/cover.jpg" />);

    expect(screen.getByRole('status', { name: COVER_PREVIEW_LOADING_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));

    expect(screen.getByRole('img', { name: COVER_PREVIEW_LABEL })).toHaveAttribute('src', 'data:image/jpeg;base64,draft');
    expect(screen.queryByRole('status', { name: COVER_PREVIEW_LOADING_LABEL })).toBeNull();
  });

  it('shows the no-cover poster for a value nothing renders, and after the image fails to decode', async () => {
    const previewAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/jpeg;base64,broken' });
    const { rerender } = render(<CoverPreview source={{ previewAnimeCover }} value="" />);

    expect(screen.getByRole('img', { name: COVER_PREVIEW_NO_COVER_LABEL })).toBeInTheDocument();
    rerender(<CoverPreview source={{ previewAnimeCover }} value="D:/broken.jpg" />);
    await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));
    act(() => {
      screen.getByRole('img', { name: COVER_PREVIEW_LABEL }).dispatchEvent(new Event('error'));
    });

    expect(screen.getByRole('img', { name: COVER_PREVIEW_NO_COVER_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: COVER_PREVIEW_LABEL })).toBeNull();
    // A thumbnail is too small for the poster's pill.
    expect(screen.queryByText(COVER_PREVIEW_NO_COVER_LABEL)).toBeNull();
  });

  it('renders a new cover after an earlier one failed to decode', async () => {
    const previewAnimeCover = vi.fn()
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:image/jpeg;base64,broken' })
      .mockResolvedValueOnce({ source: 'cover', dataUrl: 'data:image/jpeg;base64,fixed' });
    const source = { previewAnimeCover };
    const { rerender } = render(<CoverPreview source={source} value="D:/broken.jpg" />);
    await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));
    act(() => {
      screen.getByRole('img', { name: COVER_PREVIEW_LABEL }).dispatchEvent(new Event('error'));
    });

    rerender(<CoverPreview source={source} value="D:/fixed.jpg" />);
    await act(async () => vi.advanceTimersByTimeAsync(COVER_PREVIEW_SETTLE_MS));

    expect(screen.getByRole('img', { name: COVER_PREVIEW_LABEL })).toHaveAttribute('src', 'data:image/jpeg;base64,fixed');
  });
});
