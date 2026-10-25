import { toast } from '@heroui/react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_COPY_FAILURE_MESSAGE, ACTIVITY_COPY_SUCCESS_MESSAGE } from '../activity-run-story.constants';
import { useActivityCopy } from '../use-activity-copy';

describe('useActivityCopy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** One row per clipboard outcome: the text written and the toast that tells the user. */
  it.each([
    { name: 'landed', write: () => Promise.resolve(), toastKind: 'success', message: ACTIVITY_COPY_SUCCESS_MESSAGE },
    { name: 'refused', write: () => Promise.reject(new Error('denied')), toastKind: 'danger', message: ACTIVITY_COPY_FAILURE_MESSAGE },
  ] as const)('writes the text and says so when the clipboard $name', async ({ write, toastKind, message }) => {
    const writeText = vi.fn(write);
    Object.assign(navigator, { clipboard: { writeText } });
    const success = vi.spyOn(toast, 'success').mockReturnValue('t');
    const danger = vi.spyOn(toast, 'danger').mockReturnValue('t');
    const { result } = renderHook(() => useActivityCopy());

    result.current.copy('get_incident 42');

    expect(writeText).toHaveBeenCalledWith('get_incident 42');
    await waitFor(() => expect(toastKind === 'success' ? success : danger).toHaveBeenCalledWith(message));
    expect(toastKind === 'success' ? danger : success).not.toHaveBeenCalled();
  });
});
