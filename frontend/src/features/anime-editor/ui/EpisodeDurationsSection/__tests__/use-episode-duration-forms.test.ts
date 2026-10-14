import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EpisodeDurationSection } from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import type { EpisodeDurationEdit } from '../../../../../shared/contracts/anime.types';
import { toEpisodeDurationRowViews } from '../episode-durations-section.helpers';
import { useEpisodeDurationForms } from '../use-episode-duration-forms';

/** Episodes 4 (23 min, measured) and 5 (24 min, measured) of a found TV folder. */
const SECTION: EpisodeDurationSection = {
  outcome: 'ok', folderStatus: 'found', beyondTotal: [], tv: true,
  rows: [
    { episode: 4, durationMs: 23 * 60_000, minutes: 23, long: false, source: 'measured' },
    { episode: 5, durationMs: 24 * 60_000, minutes: 24, long: false, source: 'measured' },
  ],
};

/** The rendered rows of {@link SECTION} with no unsaved edit. */
const ROWS = toEpisodeDurationRowViews(SECTION, []);

/**
 * Renders the forms hook over the section's rows.
 * @param edits The draft's unsaved edits.
 * @returns The hook result and its edits spy.
 */
function renderForms(edits: readonly EpisodeDurationEdit[] = []) {
  const onEditsChange = vi.fn();
  const hook = renderHook(() => useEpisodeDurationForms({ rows: ROWS, edits, onEditsChange, isTV: true }));
  return { ...hook, onEditsChange };
}

describe('useEpisodeDurationForms edit modal', () => {
  it('opens prefilled with the current minutes and applies a manual value', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenEdit(4));
    expect(result.current.editForm).toEqual({ episode: 4, minutes: '23' });
    expect(result.current.editView).toEqual({ title: 'Episode 04 duration', minutes: '23', sourceLine: 'Measured from the file', canApply: true, canClear: true });
    act(() => result.current.onEditMinutesChange('46'));
    act(() => result.current.onApplyEdit());

    expect(onEditsChange).toHaveBeenCalledWith([{ episode: 4, durationMs: 46 * 60_000, source: 'manual', clear: false }]);
    expect(result.current.editForm).toBeUndefined();
  });

  it('clears a stored duration with a clear edit', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenEdit(5));
    act(() => result.current.onClearEdit());

    expect(onEditsChange).toHaveBeenCalledWith([{ episode: 5, durationMs: 0, source: 'manual', clear: true }]);
    expect(result.current.editForm).toBeUndefined();
  });

  it('refuses minutes that are not a whole number above zero, and cancels without a change', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenEdit(4));
    act(() => result.current.onEditMinutesChange('0'));
    act(() => result.current.onApplyEdit());
    expect(onEditsChange).not.toHaveBeenCalled();
    expect(result.current.editView?.canApply).toBe(false);
    act(() => result.current.onCloseEdit());

    expect(result.current.editForm).toBeUndefined();
    expect(onEditsChange).not.toHaveBeenCalled();
  });
});

describe('useEpisodeDurationForms add modal', () => {
  it('prefills the next episode and adds a manual value', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenAdd());
    expect(result.current.addForm).toEqual({ episode: '6', minutes: '' });
    act(() => result.current.onAddMinutesChange('62'));
    expect(result.current.addView).toEqual(expect.objectContaining({ isLongHintVisible: true, canAdd: true }));
    act(() => result.current.onApplyAdd());

    expect(onEditsChange).toHaveBeenCalledWith([{ episode: 6, durationMs: 62 * 60_000, source: 'manual', clear: false }]);
    expect(result.current.addForm).toBeUndefined();
  });

  it('blocks a number that already has a duration and switches to editing it', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenAdd());
    act(() => result.current.onAddEpisodeChange('5'));
    act(() => result.current.onAddMinutesChange('45'));
    act(() => result.current.onApplyAdd());
    expect(onEditsChange).not.toHaveBeenCalled();
    expect(result.current.addView?.duplicateMessage).toBe('Episode 5 already has 24 min.');
    act(() => result.current.onEditInstead());

    expect(result.current.addForm).toBeUndefined();
    expect(result.current.editForm).toEqual({ episode: 5, minutes: '24' });
  });

  it('closes the add modal without a change', () => {
    const { result, onEditsChange } = renderForms();

    act(() => result.current.onOpenAdd());
    act(() => result.current.onCloseAdd());

    expect(result.current.addForm).toBeUndefined();
    expect(onEditsChange).not.toHaveBeenCalled();
  });
});

describe('useEpisodeDurationForms with nothing open', () => {
  it('ignores typing, Apply, Clear, Add and Edit instead while no modal is open', () => {
    const { result, onEditsChange } = renderForms();

    act(() => {
      result.current.onEditMinutesChange('30');
      result.current.onAddEpisodeChange('9');
      result.current.onAddMinutesChange('30');
    });
    act(() => {
      result.current.onApplyEdit();
      result.current.onClearEdit();
      result.current.onApplyAdd();
      result.current.onEditInstead();
    });

    expect(result.current.editForm).toBeUndefined();
    expect(result.current.editView).toBeUndefined();
    expect(result.current.addForm).toBeUndefined();
    expect(result.current.addView).toBeUndefined();
    expect(onEditsChange).not.toHaveBeenCalled();
  });

  it('opens Edit and Add from the rows the table lists now', () => {
    const onEditsChange = vi.fn();
    const later = toEpisodeDurationRowViews({ ...SECTION, rows: [...SECTION.rows, { episode: 9, durationMs: 30 * 60_000, minutes: 30, long: false, source: 'manual' }] }, []);
    const { result, rerender } = renderHook((rows: typeof ROWS) => useEpisodeDurationForms({ rows, edits: [], onEditsChange, isTV: true }), { initialProps: ROWS });

    rerender(later);
    act(() => result.current.onOpenEdit(9));
    act(() => result.current.onOpenAdd());

    expect(result.current.editForm).toEqual({ episode: 9, minutes: '30' });
    expect(result.current.addForm).toEqual({ episode: '10', minutes: '' });
  });
});
